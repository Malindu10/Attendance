import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, Integer, Numeric,
    ForeignKey, Text, Date, CheckConstraint, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMPTZ
from sqlalchemy.orm import relationship
from config import Base

def gen_uuid():
    return str(uuid.uuid4())

class Coach(Base):
    __tablename__ = "coaches"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name       = Column(Text, nullable=False)
    email      = Column(Text, unique=True, nullable=False)
    pin_hash   = Column(Text, nullable=False)
    role       = Column(Text, nullable=False, default="coach")
    is_active  = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMPTZ, default=datetime.utcnow)
    last_login = Column(TIMESTAMPTZ)
    sessions   = relationship("Session", back_populates="coach")

class AgeGroup(Base):
    __tablename__ = "age_groups"
    id       = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name     = Column(Text, unique=True, nullable=False)
    students = relationship("Student", back_populates="age_group")
    sessions = relationship("Session", back_populates="age_group")

class Location(Base):
    __tablename__ = "locations"
    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name          = Column(Text, unique=True, nullable=False)
    default_group = Column(UUID(as_uuid=True), ForeignKey("age_groups.id"))
    sessions      = relationship("Session", back_populates="location")

class Student(Base):
    __tablename__ = "students"
    id                   = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name                 = Column(Text, nullable=False)
    date_of_birth        = Column(Date)
    age_group_id         = Column(UUID(as_uuid=True), ForeignKey("age_groups.id"), nullable=False)
    position             = Column(Text)
    jersey_number        = Column(Integer)
    is_regular           = Column(Boolean, nullable=False, default=True)
    rekognition_face_id  = Column(Text, index=True)
    photo_s3_key         = Column(Text)
    is_active            = Column(Boolean, nullable=False, default=True)
    created_at           = Column(TIMESTAMPTZ, default=datetime.utcnow)
    updated_at           = Column(TIMESTAMPTZ, default=datetime.utcnow, onupdate=datetime.utcnow)
    age_group            = relationship("AgeGroup", back_populates="students")
    attendance_records   = relationship("Attendance", back_populates="student")

class Session(Base):
    __tablename__ = "sessions"
    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    coach_id      = Column(UUID(as_uuid=True), ForeignKey("coaches.id"), nullable=False)
    age_group_id  = Column(UUID(as_uuid=True), ForeignKey("age_groups.id"), nullable=False)
    location_id   = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    session_type  = Column(Text, nullable=False, default="Training")
    started_at    = Column(TIMESTAMPTZ, default=datetime.utcnow)
    ended_at      = Column(TIMESTAMPTZ)
    notes         = Column(Text)
    scan_count    = Column(Integer, nullable=False, default=0)
    is_closed     = Column(Boolean, nullable=False, default=False)
    coach         = relationship("Coach", back_populates="sessions")
    age_group     = relationship("AgeGroup", back_populates="sessions")
    location      = relationship("Location", back_populates="sessions")
    attendance    = relationship("Attendance", back_populates="session")
    scan_logs     = relationship("ScanLog", back_populates="session")

class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("session_id", "student_id"),)
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id  = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    student_id  = Column(UUID(as_uuid=True), ForeignKey("students.id"))
    marked_by   = Column(UUID(as_uuid=True), ForeignKey("coaches.id"), nullable=False)
    method      = Column(Text, nullable=False, default="face_scan")
    confidence  = Column(Numeric(5, 2))
    is_guest    = Column(Boolean, nullable=False, default=False)
    guest_label = Column(Text)
    marked_at   = Column(TIMESTAMPTZ, default=datetime.utcnow)
    session     = relationship("Session", back_populates="attendance")
    student     = relationship("Student", back_populates="attendance_records")

class ScanLog(Base):
    __tablename__ = "scan_log"
    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id         = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    coach_id           = Column(UUID(as_uuid=True), ForeignKey("coaches.id"), nullable=False)
    ip_address         = Column(Text)
    result             = Column(Text, nullable=False)
    matched_student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"))
    confidence         = Column(Numeric(5, 2))
    confirmed          = Column(Boolean)
    scan_at            = Column(TIMESTAMPTZ, default=datetime.utcnow)
    session            = relationship("Session", back_populates="scan_logs")

class RekognitionUsage(Base):
    __tablename__ = "rekognition_usage"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    month_key  = Column(Text, unique=True, nullable=False)
    api_calls  = Column(Integer, nullable=False, default=0)
    hard_limit = Column(Integer, nullable=False, default=5000)
    soft_limit = Column(Integer, nullable=False, default=4000)
    updated_at = Column(TIMESTAMPTZ, default=datetime.utcnow, onupdate=datetime.utcnow)
