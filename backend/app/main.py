from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

import whisper
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from qdrant_client import QdrantClient
from qdrant_client.http import models as qm
from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import create_tables, engine, ping_postgres
from app.models import Segment, User, Video

COLLECTION_NAME = "vidara_segments"
EMBED_DIM = 384

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

print("Loading embedding model (MiniLM)...")
embed_model = SentenceTransformer("all-MiniLM-L6-v2")

print("Loading Whisper model...")
whisper_model = whisper.load_model("base")

qdrant_client = QdrantClient(url=settings.qdrant_url)
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
security = HTTPBearer()


class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {
        "sub": user_id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def get_db():
    with Session(engine) as session:
        yield session


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


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


@app.post("/auth/signup")
def signup(request: SignupRequest, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(str(user.id))

    return {
        "message": "Signup successful",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
        },
    }


@app.post("/auth/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(str(user.id))

    return {
        "message": "Login successful",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
        },
    }


@app.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
    }


@app.post("/videos")
async def upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    safe_filename = f"{current_user.id}_{int(datetime.now().timestamp())}_{file.filename}"
    file_path = UPLOAD_DIR / safe_filename

    with file_path.open("wb") as buffer:
        buffer.write(await file.read())

    with Session(engine) as session:
        video = Video(
            user_id=current_user.id,
            filename=file.filename,
            filepath=str(file_path),
        )
        session.add(video)
        session.commit()
        session.refresh(video)

        video_id = str(video.id)
        video_filename = video.filename
        saved_filename = Path(video.filepath).name

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
        "media_url": f"http://localhost:8000/media/{saved_filename}",
    }


@app.post("/search")
def search(
    request: SearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    user_video_ids = [
        str(video.id)
        for video in db.query(Video).filter(Video.user_id == current_user.id).all()
    ]

    if not user_video_ids:
        return {"results": []}

    limit = max(1, min(request.limit, 20))

    vector = embed_model.encode(
        query,
        normalize_embeddings=True,
    ).tolist()

    results = qdrant_client.search(
        collection_name=COLLECTION_NAME,
        query_vector=vector,
        query_filter=qm.Filter(
            must=[
                qm.FieldCondition(
                    key="video_id",
                    match=qm.MatchAny(any=user_video_ids),
                )
            ]
        ),
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


@app.get("/videos")
def list_videos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    videos = (
        db.query(Video)
        .filter(Video.user_id == current_user.id)
        .order_by(Video.created_at.desc())
        .all()
    )

    return {
        "videos": [
            {
                "id": str(v.id),
                "filename": v.filename,
                "filepath": v.filepath,
                "created_at": v.created_at.isoformat(),
                "media_url": f"http://localhost:8000/media/{Path(v.filepath).name}",
            }
            for v in videos
        ]
    }


@app.get("/videos/{video_id}/segments")
def get_video_segments(
    video_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    video = (
        db.query(Video)
        .filter(Video.id == video_id, Video.user_id == current_user.id)
        .first()
    )

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    segments = (
        db.query(Segment)
        .filter(Segment.video_id == video_id)
        .order_by(Segment.start_time.asc())
        .all()
    )

    return {
        "video_id": str(video_id),
        "filename": video.filename,
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