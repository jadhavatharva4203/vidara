from fastapi import FastAPI, UploadFile, File
from qdrant_client import QdrantClient
from app.config import settings
from app.db import ping_postgres, engine, create_tables
from sqlalchemy.orm import Session
from app.models import Video
from pathlib import Path
from app.models import Segment
from qdrant_client.http import models as qm
from contextlib import asynccontextmanager
import random
from pydantic import BaseModel

class SearchRequest(BaseModel):
    query: str

COLLECTION_NAME = "vidara_segments"

qdrant_client = QdrantClient(url=settings.qdrant_url)

@asynccontextmanager
async def lifespan(app: FastAPI):
    ping_postgres()
    create_tables()

    collections = qdrant_client.get_collections().collections
    names = [c.name for c in collections]

    if COLLECTION_NAME not in names:
        qdrant_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=qm.VectorParams(
                size=4,
                distance=qm.Distance.COSINE
            )
        )

    yield

app = FastAPI(title="Vidara API", lifespan=lifespan)
@app.get("/health")
def health():
    return {"status": "ok"}

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@app.post("/videos")
async def upload_video(file: UploadFile = File(...)):
    file_path = UPLOAD_DIR / file.filename

    with file_path.open("wb") as buffer:
        buffer.write(await file.read())

    with Session(engine) as session:
        video = Video(
            filename=file.filename,
            filepath=str(file_path),
        )
        session.add(video)
        session.commit()
        session.refresh(video)

        video_id = video.id  # <-- STORE ID HERE

        segment_duration = 10
        total_duration = 60
        start = 0

        while start < total_duration:
            segment = Segment(
                video_id=video.id,
                start_time=start,
                end_time=start + segment_duration,
                transcript_text=f"Dummy transcript from {start} to {start + segment_duration}"
            )
            session.add(segment)
            start += segment_duration

        session.commit()

                # Fetch segments for this video
        segments = session.query(Segment).filter_by(video_id=video_id).all()

        for seg in segments:
            vector = [random.random() for _ in range(4)]

            qdrant_client.upsert(
                collection_name=COLLECTION_NAME,
                points=[
                    qm.PointStruct(
                        id=str(seg.id),
                        vector=vector,
                        payload={
                            "video_id": str(video_id),
                            "start_time": seg.start_time,
                            "end_time": seg.end_time,
                        },
                    )
                ],
            )

    return {"video_id": str(video_id)}

@app.post("/search")
def search(request: SearchRequest):
    # generate fake query vector
    vector = [random.random() for _ in range(4)]

    results = qdrant_client.search(
        collection_name=COLLECTION_NAME,
        query_vector=vector,
        limit=5
    )

    response = []

    for r in results:
        response.append({
            "segment_id": r.id,
            "score": r.score,
            "payload": r.payload
        })

    return {"results": response}