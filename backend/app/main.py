from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

import whisper
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.http import models as qm
from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import create_tables, engine, ping_postgres
from app.models import Segment, Video

COLLECTION_NAME = "vidara_segments"
EMBED_DIM = 384

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

print("Loading embedding model (MiniLM)...")
embed_model = SentenceTransformer("all-MiniLM-L6-v2")

print("Loading Whisper model...")
whisper_model = whisper.load_model("base")

qdrant_client = QdrantClient(url=settings.qdrant_url)


class SearchRequest(BaseModel):
    query: str
    limit: int = 5


class SearchResult(BaseModel):
    segment_id: str
    video_id: str
    start_time: float
    end_time: float
    transcript_text: str | None
    score: float


def ensure_qdrant_collection():
    collections = qdrant_client.get_collections().collections
    names = [c.name for c in collections]

    if COLLECTION_NAME in names:
        existing = qdrant_client.get_collection(COLLECTION_NAME)
        current_size = existing.config.params.vectors.size
        if current_size != EMBED_DIM:
            qdrant_client.delete_collection(COLLECTION_NAME)

    collections = qdrant_client.get_collections().collections
    names = [c.name for c in collections]

    if COLLECTION_NAME not in names:
        qdrant_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=qm.VectorParams(
                size=EMBED_DIM,
                distance=qm.Distance.COSINE,
            ),
        )


def build_segment_payload(seg: Segment) -> dict:
    return {
        "video_id": str(seg.video_id),
        "start_time": seg.start_time,
        "end_time": seg.end_time,
        "transcript_text": seg.transcript_text,
    }


def index_segment_in_qdrant(seg: Segment):
    if not seg.transcript_text or not seg.transcript_text.strip():
        return

    vector = embed_model.encode(
        seg.transcript_text,
        normalize_embeddings=True,
    ).tolist()

    qdrant_client.upsert(
        collection_name=COLLECTION_NAME,
        points=[
            qm.PointStruct(
                id=str(seg.id),
                vector=vector,
                payload=build_segment_payload(seg),
            )
        ],
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    ping_postgres()
    create_tables()
    ensure_qdrant_collection()
    yield


app = FastAPI(title="Vidara API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=str(UPLOAD_DIR)), name="media")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/videos")
async def upload_video(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

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

        video_id = str(video.id)
        video_filename = video.filename

        print("Transcribing...")
        result = whisper_model.transcribe(str(file_path))

        created_segments: list[Segment] = []

        for seg in result["segments"]:
            text = seg["text"].strip()

            if not text:
                continue

            segment = Segment(
                video_id=video.id,
                start_time=seg["start"],
                end_time=seg["end"],
                transcript_text=text,
            )
            session.add(segment)
            created_segments.append(segment)

        session.commit()

        for seg in created_segments:
            session.refresh(seg)
            index_segment_in_qdrant(seg)

        segments_indexed = len(created_segments)

    return {
        "message": "Video uploaded and indexed successfully",
        "video_id": video_id,
        "segments_indexed": segments_indexed,
        "filename": video_filename,
        "media_url": f"http://localhost:8000/media/{video_filename}",
    }


@app.post("/search")
def search(request: SearchRequest):
    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    limit = max(1, min(request.limit, 20))

    vector = embed_model.encode(
        query,
        normalize_embeddings=True,
    ).tolist()

    results = qdrant_client.search(
        collection_name=COLLECTION_NAME,
        query_vector=vector,
        limit=limit,
    )

    response = []
    for r in results:
        payload = r.payload or {}
        response.append(
            SearchResult(
                segment_id=str(r.id),
                video_id=str(payload.get("video_id", "")),
                start_time=float(payload.get("start_time", 0.0)),
                end_time=float(payload.get("end_time", 0.0)),
                transcript_text=payload.get("transcript_text"),
                score=float(r.score),
            ).model_dump()
        )

    return {"results": response}


@app.post("/admin/reindex")
def reindex_all_segments():
    ensure_qdrant_collection()

    with Session(engine) as session:
        segments = session.query(Segment).all()

        points = []
        for seg in segments:
            if not seg.transcript_text or not seg.transcript_text.strip():
                continue

            vector = embed_model.encode(
                seg.transcript_text,
                normalize_embeddings=True,
            ).tolist()

            points.append(
                qm.PointStruct(
                    id=str(seg.id),
                    vector=vector,
                    payload=build_segment_payload(seg),
                )
            )

        if points:
            BATCH_SIZE = 128
            for i in range(0, len(points), BATCH_SIZE):
                qdrant_client.upsert(
                    collection_name=COLLECTION_NAME,
                    points=points[i:i + BATCH_SIZE],
                )

    return {"message": "Reindex complete", "segments_reindexed": len(points)}


@app.get("/videos")
def list_videos():
    with Session(engine) as session:
        videos = session.query(Video).order_by(Video.created_at.desc()).all()
        return {
            "videos": [
                {
                    "id": str(v.id),
                    "filename": v.filename,
                    "filepath": v.filepath,
                    "created_at": v.created_at.isoformat(),
                    "media_url": f"http://localhost:8000/media/{v.filename}",
                }
                for v in videos
            ]
        }


@app.get("/videos/{video_id}/segments")
def get_video_segments(video_id: UUID):
    with Session(engine) as session:
        segments = (
            session.query(Segment)
            .filter(Segment.video_id == video_id)
            .order_by(Segment.start_time.asc())
            .all()
        )

        return {
            "video_id": str(video_id),
            "segments": [
                {
                    "id": str(seg.id),
                    "start_time": seg.start_time,
                    "end_time": seg.end_time,
                    "transcript_text": seg.transcript_text,
                }
                for seg in segments
            ],
        }