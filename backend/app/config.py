from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    postgres_url: str = "postgresql+psycopg://vidara:vidara@localhost:5432/vidara"
    qdrant_url: str = "http://localhost:6333"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()