"""
main.py — FastAPI application entry point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from config import get_settings, get_engine
from routers.api import router
from services.rekognition import ensure_collection_exists
from services.auth import get_current_coach

settings = get_settings()
engine   = get_engine()
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    ensure_collection_exists()
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="Academy Attendance API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.environment == "development" else None,
)

# ── CORS ──────────────────────────────────────────────────
origins = [o.strip() for o in settings.allowed_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── DB session dependency ──────────────────────────────────
async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session


# ── Inject DB into all routes ──────────────────────────────
# Override the placeholder Depends() in routers/api.py
app.dependency_overrides[lambda: None] = get_db  # type: ignore


# ── Global error handler ───────────────────────────────────
@app.exception_handler(Exception)
async def global_error(request: Request, exc: Exception):
    if settings.environment == "development":
        raise exc
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )


# ── Mount routes ───────────────────────────────────────────
app.include_router(router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
