from pydantic_settings import BaseSettings
from functools import lru_cache
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

class Settings(BaseSettings):
    database_url: str
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str = "ap-south-1"
    aws_s3_bucket: str
    aws_rekognition_collection: str
    jwt_secret: str
    jwt_expire_hours: int = 12
    rate_limit_per_minute: int = 10
    rate_limit_per_session: int = 60
    rekognition_monthly_hard_limit: int = 5000
    rekognition_monthly_soft_limit: int = 4000
    scan_cooldown_seconds: int = 3
    max_image_size_bytes: int = 5_242_880
    min_image_width: int = 200
    min_image_height: int = 200
    environment: str = "development"
    allowed_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"

@lru_cache
def get_settings() -> Settings:
    return Settings()

# ── Database ──────────────────────────────────────────────
def get_engine():
    s = get_settings()
    db_url = s.database_url.replace("postgresql://", "postgresql+asyncpg://")
    return create_async_engine(
        db_url,
        pool_size=10,
        max_overflow=20,
        echo=(s.environment == "development"),
    )

def get_session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

class Base(DeclarativeBase):
    pass
