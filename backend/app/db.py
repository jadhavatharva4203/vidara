from sqlalchemy import create_engine, text
from app.config import settings
from app.models import Base

engine = create_engine(settings.postgres_url, pool_pre_ping=True)

def ping_postgres():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))


def create_tables():
    Base.metadata.create_all(bind=engine)