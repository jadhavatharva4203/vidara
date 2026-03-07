from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    postgres_url: str = "postgresql+psycopg://vidara:vidara@localhost:5432/vidara"
    qdrant_url: str = "http://localhost:6333"

settings = Settings()