from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import get_settings, get_db
from models import Coach

settings = get_settings()
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_pin(pin: str) -> str:
    return pwd_ctx.hash(pin)

def verify_pin(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)

def create_token(coach_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    from jose import jwt
    return jwt.encode(
        {"sub": coach_id, "role": role, "exp": expire},
        settings.jwt_secret,
        algorithm="HS256",
    )

async def get_current_coach(
    db: AsyncSession = Depends(get_db),
) -> Coach:
    result = await db.execute(
        select(Coach).where(Coach.is_active == True).limit(1)
    )
    coach = result.scalar_one_or_none()
    if not coach:
        raise HTTPException(status_code=503, detail="No coach account configured.")
    return coach

def require_admin(coach: Coach = Depends(get_current_coach)) -> Coach:
    return coach
