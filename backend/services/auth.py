from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import get_settings, get_db
from models import Coach

settings = get_settings()
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer()


def hash_pin(pin: str) -> str:
    return pwd_ctx.hash(pin)

def verify_pin(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)

def create_token(coach_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    return jwt.encode(
        {"sub": coach_id, "role": role, "exp": expire},
        settings.jwt_secret,
        algorithm="HS256",
    )

async def get_current_coach(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> Coach:
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
        coach_id = payload.get("sub")
        if not coach_id:
            raise ValueError
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please log in again.",
        )
    result = await db.execute(
        select(Coach).where(Coach.id == coach_id, Coach.is_active == True)
    )
    coach = result.scalar_one_or_none()
    if not coach:
        raise HTTPException(status_code=401, detail="Coach account not found or deactivated.")
    return coach

def require_admin(coach: Coach = Depends(get_current_coach)) -> Coach:
    if coach.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return coach
