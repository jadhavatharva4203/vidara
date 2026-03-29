from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    postgres_url: str = "postgresql+psycopg://vidara:vidara@localhost:5432/vidara"
    qdrant_url: str = "http://localhost:6333"
    secret_key: str = "vidara_super_secret_key_change_later"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()