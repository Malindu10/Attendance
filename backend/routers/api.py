"""
routers/api.py — all route groups in one file for clarity
Split into separate files once the team grows.
"""
import uuid, io
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from sqlalchemy.orm import selectinload

from config import get_db
from models import (
    Coach, AgeGroup, Location, Student,
    Session as DBSession, Attendance, ScanLog, RekognitionUsage
)
from services.auth import (
    hash_pin, create_token,
    get_current_coach, require_admin
)
from services.rekognition import (
    index_face, search_face, upload_photo_to_s3,
    delete_face, ensure_collection_exists
)
from middleware.limits import (
    enforce_scan_limits, validate_image,
    increment_rekognition_usage, update_session_scan_count
)

router = APIRouter()


# ══════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════

@router.post("/auth/login")
async def login(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Coach).where(Coach.is_active == True).limit(1)
    )
    coach = result.scalar_one_or_none()
    if not coach:
        raise HTTPException(status_code=503, detail="No coach account configured.")
    return {
        "token": create_token(str(coach.id), coach.role),
        "coach": {"id": str(coach.id), "name": coach.name, "role": coach.role},
    }


# ══════════════════════════════════════════════════════════
# SETUP DATA (age groups + locations)
# ══════════════════════════════════════════════════════════

@router.get("/setup")
async def get_setup(
    db: AsyncSession = Depends(get_db),
    coach: Coach = Depends(get_current_coach),
):
    """Returns all age groups and locations for the session setup screen."""
    groups = (await db.execute(select(AgeGroup))).scalars().all()
    locs   = (await db.execute(select(Location))).scalars().all()
    return {
        "age_groups": [{"id": str(g.id), "name": g.name} for g in groups],
        "locations":  [{"id": str(l.id), "name": l.name,
                        "default_group": str(l.default_group) if l.default_group else None}
                       for l in locs],
    }


# ══════════════════════════════════════════════════════════
# STUDENTS
# ══════════════════════════════════════════════════════════

class StudentCreate(BaseModel):
    name: str
    age_group_id: str
    position: Optional[str] = None
    jersey_number: Optional[int] = None
    is_regular: bool = True
    date_of_birth: Optional[str] = None

@router.get("/students")
async def list_students(
    age_group_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    coach: Coach = Depends(get_current_coach),
):
    q = select(Student).where(Student.is_active == True)
    if age_group_id:
        q = q.where(Student.age_group_id == age_group_id)
    q = q.options(selectinload(Student.age_group))
    students = (await db.execute(q)).scalars().all()
    return [_student_dict(s) for s in students]

@router.post("/students")
async def create_student(
    body: StudentCreate,
    db: AsyncSession = Depends(get_db),
    admin: Coach = Depends(require_admin),
):
    s = Student(
        name=body.name,
        age_group_id=body.age_group_id,
        position=body.position,
        jersey_number=body.jersey_number,
        is_regular=body.is_regular,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _student_dict(s)

@router.post("/students/{student_id}/photo")
async def register_student_photo(
    student_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: Coach = Depends(require_admin),
):
    """
    Upload a face photo for a student.
    Validates image, uploads to S3, indexes into Rekognition.
    Can be called multiple times — each photo improves accuracy.
    """
    image_bytes = await validate_image(file)

    # Upload to S3
    s3_key = f"students/{student_id}/{uuid.uuid4()}.jpg"
    upload_photo_to_s3(image_bytes, s3_key)

    # Index into Rekognition
    face_id = index_face(image_bytes, student_id)
    if not face_id:
        raise HTTPException(
            status_code=422,
            detail="No face detected in this photo. "
                   "Please ensure the student is looking at the camera with good lighting.",
        )

    # Save FaceId to student (last indexed wins — acceptable for 1–5 photos)
    await db.execute(
        update(Student)
        .where(Student.id == student_id)
        .values(rekognition_face_id=face_id, photo_s3_key=s3_key)
    )
    await db.commit()
    return {"face_id": face_id, "s3_key": s3_key, "message": "Photo registered successfully."}


def _student_dict(s: Student) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "position": s.position,
        "jersey_number": s.jersey_number,
        "is_regular": s.is_regular,
        "age_group": s.age_group.name if s.age_group else None,
        "age_group_id": str(s.age_group_id),
        "has_photo": bool(s.rekognition_face_id),
    }


# ══════════════════════════════════════════════════════════
# SESSIONS
# ══════════════════════════════════════════════════════════

class SessionCreate(BaseModel):
    age_group_id: str
    location_id: str
    session_type: str = "Training"

@router.post("/sessions")
async def start_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_db),
    coach: Coach = Depends(get_current_coach),
):
    # Check coach doesn't already have an open session
    existing = await db.execute(
        select(DBSession).where(
            DBSession.coach_id == coach.id,
            DBSession.is_closed == False,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="You already have an open session. Please close it before starting a new one.",
        )

    session = DBSession(
        coach_id=coach.id,
        age_group_id=body.age_group_id,
        location_id=body.location_id,
        session_type=body.session_type,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # Load expected squad for this age group
    squad = await db.execute(
        select(Student)
        .where(Student.age_group_id == body.age_group_id, Student.is_active == True)
        .options(selectinload(Student.age_group))
    )
    students = squad.scalars().all()

    return {
        "session_id": str(session.id),
        "started_at": session.started_at.isoformat(),
        "expected_squad": [_student_dict(s) for s in students],
        "scan_limit": 60,
    }

@router.post("/sessions/{session_id}/close")
async def close_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    coach: Coach = Depends(get_current_coach),
):
    await db.execute(
        update(DBSession)
        .where(DBSession.id == session_id, DBSession.coach_id == coach.id)
        .values(is_closed=True, ended_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"message": "Session closed."}

@router.get("/sessions/{session_id}/register")
async def get_register(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    coach: Coach = Depends(get_current_coach),
):
    """Full register for a session: expected squad + who is marked present."""
    session_result = await db.execute(
        select(DBSession)
        .where(DBSession.id == session_id)
        .options(selectinload(DBSession.age_group), selectinload(DBSession.attendance))
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    squad = (await db.execute(
        select(Student)
        .where(Student.age_group_id == session.age_group_id, Student.is_active == True)
    )).scalars().all()

    present_ids = {str(a.student_id) for a in session.attendance if a.student_id}
    guest_count = sum(1 for a in session.attendance if a.is_guest)

    return {
        "session_id": session_id,
        "scan_count": session.scan_count,
        "scan_limit": 60,
        "scans_remaining": max(0, 60 - session.scan_count),
        "students": [
            {**_student_dict(s), "present": str(s.id) in present_ids}
            for s in squad
        ],
        "guest_count": guest_count,
    }


# ══════════════════════════════════════════════════════════
# SCAN — the core face recognition endpoint
# ══════════════════════════════════════════════════════════

@router.post("/sessions/{session_id}/scan")
async def scan_face(
    session_id: str,
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    coach: Coach = Depends(get_current_coach),
):
    """
    Main scan endpoint.
    1. Enforce all rate limits
    2. Validate image
    3. Call AWS Rekognition SearchFacesByImage
    4. Look up matched student in DB
    5. Log the attempt
    6. Return result to coach for confirmation
    """
    coach_id = str(coach.id)
    ip = request.client.host if request.client else "unknown"

    # ── LIMITS ────────────────────────────────────────────
    await enforce_scan_limits(coach_id, session_id, db, request)

    # ── IMAGE VALIDATION ──────────────────────────────────
    image_bytes = await validate_image(file)

    # ── REKOGNITION CALL ──────────────────────────────────
    # Use a lower threshold (75) for occasional players, 80 for regulars.
    # We search at 75 and let the DB query determine if it's a regular.
    match = search_face(image_bytes, threshold=75.0)

    await increment_rekognition_usage(db)
    await update_session_scan_count(session_id, db)

    if not match:
        # Log the failed scan
        db.add(ScanLog(
            session_id=session_id, coach_id=coach_id,
            ip_address=ip, result="no_match",
        ))
        await db.commit()
        return {"matched": False, "message": "Face not recognised."}

    # ── LOOK UP STUDENT ───────────────────────────────────
    student_result = await db.execute(
        select(Student)
        .where(Student.rekognition_face_id == match["face_id"], Student.is_active == True)
        .options(selectinload(Student.age_group))
    )
    student = student_result.scalar_one_or_none()

    if not student:
        db.add(ScanLog(
            session_id=session_id, coach_id=coach_id,
            ip_address=ip, result="no_match",
        ))
        await db.commit()
        return {"matched": False, "message": "Face matched but student not found in database."}

    # ── ALREADY MARKED? ───────────────────────────────────
    already = await db.execute(
        select(Attendance).where(
            Attendance.session_id == session_id,
            Attendance.student_id == student.id,
        )
    )
    is_duplicate = already.scalar_one_or_none() is not None

    # ── LOG SUCCESS ───────────────────────────────────────
    db.add(ScanLog(
        session_id=session_id, coach_id=coach_id,
        ip_address=ip, result="matched",
        matched_student_id=student.id,
        confidence=match["similarity"],
    ))
    await db.commit()

    return {
        "matched": True,
        "already_marked": is_duplicate,
        "student": {
            "id": str(student.id),
            "name": student.name,
            "position": student.position,
            "jersey_number": student.jersey_number,
            "age_group": student.age_group.name if student.age_group else None,
            "is_regular": student.is_regular,
            "initials": "".join(p[0].upper() for p in student.name.split()[:2]),
        },
        "confidence": match["similarity"],
        "threshold_note": "Regular member" if student.is_regular else "Occasional — verify carefully",
    }


# ══════════════════════════════════════════════════════════
# CONFIRM ATTENDANCE (after coach taps Confirm)
# ══════════════════════════════════════════════════════════

class ConfirmBody(BaseModel):
    student_id: str
    confidence: float
    method: str = "face_scan"

@router.post("/sessions/{session_id}/confirm")
async def confirm_attendance(
    session_id: str,
    body: ConfirmBody,
    db: AsyncSession = Depends(get_db),
    coach: Coach = Depends(get_current_coach),
):
    # Prevent duplicate
    existing = await db.execute(
        select(Attendance).where(
            Attendance.session_id == session_id,
            Attendance.student_id == body.student_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"message": "Already marked present.", "duplicate": True}

    db.add(Attendance(
        session_id=session_id,
        student_id=body.student_id,
        marked_by=coach.id,
        method=body.method,
        confidence=body.confidence,
    ))

    # Update scan log with confirmed=True
    await db.execute(
        update(ScanLog)
        .where(
            ScanLog.session_id == session_id,
            ScanLog.matched_student_id == body.student_id,
            ScanLog.confirmed == None,
        )
        .values(confirmed=True)
    )

    await db.commit()
    return {"message": "Attendance confirmed.", "duplicate": False}


@router.post("/sessions/{session_id}/manual")
async def manual_attendance(
    session_id: str,
    body: ConfirmBody,
    db: AsyncSession = Depends(get_db),
    coach: Coach = Depends(get_current_coach),
):
    """Mark a student present manually (Register tab toggle)."""
    existing = await db.execute(
        select(Attendance).where(
            Attendance.session_id == session_id,
            Attendance.student_id == body.student_id,
        )
    )
    rec = existing.scalar_one_or_none()
    if rec:
        await db.delete(rec)
        await db.commit()
        return {"present": False}

    db.add(Attendance(
        session_id=session_id,
        student_id=body.student_id,
        marked_by=coach.id,
        method="manual",
        confidence=None,
    ))
    await db.commit()
    return {"present": True}


@router.post("/sessions/{session_id}/guest")
async def mark_guest(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    coach: Coach = Depends(get_current_coach),
):
    label = f"Guest #{uuid.uuid4().hex[:4].upper()}"
    db.add(Attendance(
        session_id=session_id,
        student_id=None,
        marked_by=coach.id,
        method="manual",
        is_guest=True,
        guest_label=label,
    ))
    await db.commit()
    return {"message": "Guest logged.", "label": label}


# ══════════════════════════════════════════════════════════
# STATS + USAGE
# ══════════════════════════════════════════════════════════

@router.get("/usage")
async def get_usage(
    db: AsyncSession = Depends(get_db),
    admin: Coach = Depends(require_admin),
):
    """Admin only — current month's Rekognition usage vs limits."""
    month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    result = await db.execute(
        select(RekognitionUsage).where(RekognitionUsage.month_key == month_key)
    )
    usage = result.scalar_one_or_none()
    if not usage:
        return {"api_calls": 0, "soft_limit": 4000, "hard_limit": 5000, "pct": 0}
    pct = round(usage.api_calls / usage.hard_limit * 100, 1)
    return {
        "api_calls": usage.api_calls,
        "soft_limit": usage.soft_limit,
        "hard_limit": usage.hard_limit,
        "pct": pct,
        "status": "ok" if pct < 80 else "warning" if pct < 100 else "blocked",
    }