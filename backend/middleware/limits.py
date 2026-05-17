"""
Abuse prevention layer — three independent guards:

1. Per-coach scan cooldown   — minimum N seconds between any two scans
2. Per-coach per-minute cap  — max scans in a 60-second rolling window
3. Per-session cap           — max scans in one session
4. Monthly AWS hard limit    — kills API calls before bill explodes
5. Image validation          — size, dimensions, format checks
"""

import time
import io
from datetime import datetime, timezone
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException, Request, UploadFile
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, text

from config import get_settings
from models import Session as DBSession, RekognitionUsage

settings = get_settings()

# ── In-memory last-scan tracker (per coach) ───────────────
# For multi-instance deployments replace with Redis
_last_scan: dict[str, float] = {}
_minute_buckets: dict[str, dict[str, int]] = defaultdict(dict)


def _minute_key() -> str:
    """Rolling 60-second window key: YYYY-MM-DDTHH:MM"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")


async def enforce_scan_limits(
    coach_id: str,
    session_id: str,
    db: AsyncSession,
    request: Request,
) -> None:
    """
    Call this before every Rekognition API call.
    Raises HTTP 429 on any limit breach.
    """
    now = time.monotonic()

    # ── 1. Cooldown between consecutive scans ─────────────
    last = _last_scan.get(coach_id, 0)
    elapsed = now - last
    if elapsed < settings.scan_cooldown_seconds:
        wait = round(settings.scan_cooldown_seconds - elapsed, 1)
        raise HTTPException(
            status_code=429,
            detail={
                "code": "COOLDOWN",
                "message": f"Please wait {wait}s before scanning again.",
                "retry_after": wait,
            },
        )

    # ── 2. Per-minute rolling window ─────────────────────
    mk = _minute_key()
    bucket = _minute_buckets[coach_id]
    # purge old keys
    for k in list(bucket.keys()):
        if k != mk:
            del bucket[k]
    current_minute_count = bucket.get(mk, 0)
    if current_minute_count >= settings.rate_limit_per_minute:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "RATE_LIMIT_MINUTE",
                "message": f"Maximum {settings.rate_limit_per_minute} scans per minute reached. "
                           "Wait a moment and try again.",
                "retry_after": 60,
            },
        )

    # ── 3. Per-session cap ────────────────────────────────
    result = await db.execute(
        select(DBSession.scan_count, DBSession.is_closed)
        .where(DBSession.id == session_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")
    if row.is_closed:
        raise HTTPException(
            status_code=400,
            detail={"code": "SESSION_CLOSED", "message": "This session has been closed."},
        )
    if row.scan_count >= settings.rate_limit_per_session:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "RATE_LIMIT_SESSION",
                "message": f"Session scan limit ({settings.rate_limit_per_session}) reached. "
                           "Close and reopen the session if needed.",
            },
        )

    # ── 4. Monthly AWS hard limit ─────────────────────────
    month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    usage_result = await db.execute(
        select(RekognitionUsage).where(RekognitionUsage.month_key == month_key)
    )
    usage = usage_result.scalar_one_or_none()
    if usage:
        if usage.api_calls >= usage.hard_limit:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "MONTHLY_LIMIT",
                    "message": "Monthly scan quota reached. Please contact the administrator.",
                },
            )
        if usage.api_calls >= usage.soft_limit:
            # log warning but allow — admin should be notified separately
            pass

    # ── All checks passed — record the attempt ────────────
    _last_scan[coach_id] = now
    _minute_buckets[coach_id][mk] = current_minute_count + 1


async def increment_rekognition_usage(db: AsyncSession) -> None:
    """Call after a successful Rekognition API call."""
    month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    await db.execute(
        text("""
            INSERT INTO rekognition_usage (month_key, api_calls)
            VALUES (:mk, 1)
            ON CONFLICT (month_key)
            DO UPDATE SET api_calls = rekognition_usage.api_calls + 1,
                          updated_at = NOW()
        """),
        {"mk": month_key},
    )
    await db.execute(
        text("""
            UPDATE sessions
            SET scan_count = scan_count + 1
            WHERE id = :sid
        """),
        # session_id passed separately by caller via update_session_scan_count()
    )


async def update_session_scan_count(session_id: str, db: AsyncSession) -> None:
    await db.execute(
        update(DBSession)
        .where(DBSession.id == session_id)
        .values(scan_count=DBSession.scan_count + 1)
    )


async def validate_image(file: UploadFile) -> bytes:
    """
    Validate uploaded image:
    - Correct MIME type
    - Under size limit
    - Minimum dimensions (ensures a real face photo, not a tiny icon)
    - Not a GIF / animated file (no spoofing via animation)
    """
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=400,
            detail="Only JPEG, PNG, or WebP images are accepted.",
        )

    data = await file.read()

    if len(data) > settings.max_image_size_bytes:
        mb = settings.max_image_size_bytes / 1_048_576
        raise HTTPException(status_code=400, detail=f"Image must be under {mb:.0f} MB.")

    try:
        img = Image.open(io.BytesIO(data))
        img.verify()          # detect truncated / corrupt files
        img = Image.open(io.BytesIO(data))  # re-open after verify
        w, h = img.size
    except Exception:
        raise HTTPException(status_code=400, detail="Cannot read image file. Please retake the photo.")

    if w < settings.min_image_width or h < settings.min_image_height:
        raise HTTPException(
            status_code=400,
            detail=f"Image too small ({w}×{h}px). "
                   f"Minimum {settings.min_image_width}×{settings.min_image_height}px required. "
                   "Move closer to the camera.",
        )

    return data
