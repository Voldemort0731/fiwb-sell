"""
SQLAlchemy models and async DB initialization
"""
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, Text, Float, Integer, DateTime, ForeignKey, Boolean, LargeBinary
from datetime import datetime, timezone
from typing import Optional, List

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./app.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    picture: Mapped[Optional[str]] = mapped_column(Text)
    google_access_token: Mapped[Optional[str]] = mapped_column(Text)
    google_refresh_token: Mapped[Optional[str]] = mapped_column(Text)
    google_token_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Usage stats
    total_slm_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_llm_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    classroom_synced: Mapped[bool] = mapped_column(Boolean, default=False)
    drive_synced: Mapped[bool] = mapped_column(Boolean, default=False)
    watched_drive_folders: Mapped[Optional[str]] = mapped_column(Text) # JSON list of folder IDs
    gmail_synced: Mapped[bool] = mapped_column(Boolean, default=False)
    moodle_url: Mapped[Optional[str]] = mapped_column(String(500))
    moodle_token: Mapped[Optional[str]] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="student") # "student" or "professor"
    role_finalized: Mapped[bool] = mapped_column(Boolean, default=False)

    threads: Mapped[List["ChatThread"]] = relationship("ChatThread", back_populates="user", cascade="all, delete-orphan")
    courses: Mapped[List["Course"]] = relationship("Course", back_populates="user", cascade="all, delete-orphan")
    materials: Mapped[List["Material"]] = relationship("Material", back_populates="user", cascade="all, delete-orphan")
    enrollments: Mapped[List["Enrollment"]] = relationship("Enrollment", back_populates="student", cascade="all, delete-orphan")


class ChatThread(Base):
    __tablename__ = "chat_threads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(500), default="New Chat")
    folder_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    thread_type: Mapped[str] = mapped_column(String(50), default="general") # "general" or "viva"
    viva_assessment_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("viva_assessments.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship("User", back_populates="threads")
    messages: Mapped[List["ChatMessage"]] = relationship("ChatMessage", back_populates="thread", cascade="all, delete-orphan", order_by="ChatMessage.created_at")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    thread_id: Mapped[int] = mapped_column(Integer, ForeignKey("chat_threads.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text)
    attachment_name: Mapped[Optional[str]] = mapped_column(String(500))
    attachment_type: Mapped[Optional[str]] = mapped_column(String(100))
    image_base64: Mapped[Optional[str]] = mapped_column(Text)
    citations: Mapped[Optional[str]] = mapped_column(Text) # JSON-encoded list of CitationData
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    thread: Mapped["ChatThread"] = relationship("ChatThread", back_populates="messages")


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    external_id: Mapped[Optional[str]] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(500))
    section: Mapped[Optional[str]] = mapped_column(String(255))
    teacher: Mapped[Optional[str]] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(50))  # "classroom" or "moodle"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship("User", back_populates="courses")
    materials: Mapped[List["Material"]] = relationship("Material", back_populates="course", cascade="all, delete-orphan")
    enrollments: Mapped[List["Enrollment"]] = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    course_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("courses.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(500))
    content_preview: Mapped[Optional[str]] = mapped_column(Text)
    full_text: Mapped[Optional[str]] = mapped_column(Text)
    file_content: Mapped[Optional[bytes]] = mapped_column(LargeBinary)  # THE "ACTUAL" FILE STORAGE
    mime_type: Mapped[Optional[str]] = mapped_column(String(100))
    parent_external_id: Mapped[Optional[str]] = mapped_column(String(255))
    material_type: Mapped[str] = mapped_column(String(50))  # assignment, announcement, material, file
    source: Mapped[str] = mapped_column(String(50))  # classroom, drive, gmail, moodle, chat_upload
    external_id: Mapped[Optional[str]] = mapped_column(String(255))
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    indexed_in_memsapien: Mapped[bool] = mapped_column(Boolean, default=False)
    source_link: Mapped[Optional[str]] = mapped_column(String(1024))
    attachments: Mapped[Optional[str]] = mapped_column(Text) # JSON list of attachments
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship("User", back_populates="materials")
    course: Mapped[Optional["Course"]] = relationship("Course", back_populates="materials")


class MindMap(Base):
    __tablename__ = "mind_maps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    material_id: Mapped[int] = mapped_column(Integer, ForeignKey("materials.id"), index=True)
    json_data: Mapped[str] = mapped_column(Text)            # current MindMapJSON as string
    history_stack: Mapped[Optional[str]] = mapped_column(Text, default="[]")  # JSON array of past states
    content_hash: Mapped[Optional[str]] = mapped_column(String(64))  # sha256 of doc text for staleness check
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship("User")
    material: Mapped["Material"] = relationship("Material")


class PerformanceMetric(Base):
    __tablename__ = "performance_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    course_id: Mapped[int] = mapped_column(Integer, ForeignKey("courses.id"), index=True)
    metric_type: Mapped[str] = mapped_column(String(50)) # e.g., "viva_score", "elo_change", "concept_mastery"
    concept: Mapped[Optional[str]] = mapped_column(String(255))
    value: Mapped[float] = mapped_column(Float)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship("User")
    course: Mapped["Course"] = relationship("Course")


class VivaAssessment(Base):
    __tablename__ = "viva_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    professor_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    course_id: Mapped[int] = mapped_column(Integer, ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    objective: Mapped[str] = mapped_column(Text)
    config_json: Mapped[str] = mapped_column(Text) # Parameters like difficulty, duration, focus
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    professor: Mapped["User"] = relationship("User")
    course: Mapped["Course"] = relationship("Course")

class VivaResult(Base):
    __tablename__ = "viva_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    assessment_id: Mapped[int] = mapped_column(Integer, ForeignKey("viva_assessments.id"), index=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    report_json: Mapped[str] = mapped_column(Text) # AI breakdown of strengths/weaknesses
    grade: Mapped[float] = mapped_column(Float) # 0-100
    status: Mapped[str] = mapped_column(String(50), default="submitted") # submitted, reviewed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    assessment: Mapped["VivaAssessment"] = relationship("VivaAssessment")
    student: Mapped["User"] = relationship("User")

class EngagementHit(Base):
    __tablename__ = "document_engagement"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    material_id: Mapped[int] = mapped_column(Integer, ForeignKey("materials.id"), index=True)
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    chunk_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hit_count: Mapped[int] = mapped_column(Integer, default=1)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    material: Mapped["Material"] = relationship("Material")


class Enrollment(Base):
    __tablename__ = "enrollments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    course_id: Mapped[int] = mapped_column(Integer, ForeignKey("courses.id"), index=True)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    student: Mapped["User"] = relationship("User", back_populates="enrollments")
    course: Mapped["Course"] = relationship("Course", back_populates="enrollments")


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
