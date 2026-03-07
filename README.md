# Vidara — Multi-Modal Video Semantic Search Engine

Vidara is a backend system for semantic video search.  
It allows users to upload videos, transcribe audio using Whisper, segment the content by timestamps, and perform vector-based semantic search over video segments.

## 🚀 Current Capabilities

- Upload video/audio files
- Automatic speech-to-text transcription using OpenAI Whisper
- Timestamp-based segment storage in PostgreSQL
- Vector indexing of segments in Qdrant
- Semantic search over segments
- REST API built with FastAPI

## 🧠 Architecture

Client → FastAPI →  
• PostgreSQL (video + segment metadata)  
• Qdrant (vector similarity search)

## 🛠 Tech Stack

- FastAPI
- PostgreSQL
- Qdrant
- OpenAI Whisper
- SQLAlchemy
- Docker

## 📌 Status

Backend ingestion and semantic retrieval pipeline working.  
Next steps: real embedding integration, architecture refactor, background processing.
