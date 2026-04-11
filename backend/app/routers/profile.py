"""
Profile Router — Digital Twin profile, usage stats, courses
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import io
import json
import asyncio
from datetime import datetime, timedelta
from app.models.database import get_db, User, Course, Material
from app.utils.locks import GLOBAL_API_LOCK
from app.utils.dependencies import get_current_user
from app.intelligence.sm_client import get_sm_client
from app.services.google_auth import build_credentials, refresh_credentials
from app.routers.integrations import GLOBAL_API_LOCK

router = APIRouter()

@router.get("/whoami")
async def whoami(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name
    }

@router.get("/digital-twin")
async def get_digital_twin(
    current_user: User = Depends(get_current_user),
):
    """Retrieve the user's Digital Twin profile from Supermemory."""
    sm = get_sm_client()
    uid = current_user.email
    
    profile_res = await sm.search(
        query="user learning style learning profile strengths gaps personal context student profile",
        filters={"AND": [{"key": "user_id", "value": uid}, {"key": "type", "value": "user_profile"}]},
        limit=5
    )
    
    memory_res = await sm.search(
        query="recent learning insights student progress conversation summary",
        filters={"AND": [{"key": "user_id", "value": uid}, {"key": "type", "value": "enhanced_memory"}]},
        limit=10
    )
    
    profiles = sm.flatten_v3(profile_res)
    memories = sm.flatten_v3(memory_res)
    
    return {
        "user": {
            "email": current_user.email,
            "name": current_user.name,
            "picture": current_user.picture,
        },
        "profile": [r.get("content", "") for r in profiles],
        "recent_memories": [r.get("content", "") for r in memories],
        "stats": {
            "total_slm_tokens": current_user.total_slm_tokens,
            "total_llm_tokens": current_user.total_llm_tokens,
            "total_cost_usd": round(current_user.total_cost_usd, 6),
        },
    }


@router.get("/courses")
async def get_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Course).where(Course.user_id == current_user.id))
    courses = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "section": c.section,
            "teacher": c.teacher,
            "source": c.source,
            "created_at": c.created_at.isoformat(),
        }
        for c in courses
    ]


@router.get("/courses/{course_id}")
async def get_course_details(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # CID is now an int handled by FastAPI
    result = await db.execute(
        select(Course).where(Course.user_id == current_user.id, Course.id == course_id)
    )
    course = result.scalar_one_or_none()
    if not course:
        print(f"❌ [get_course_details] NOT FOUND in DB for user {current_user.id}")
        raise HTTPException(status_code=404, detail="Course not found")
    return {
        "id": course.id,
        "name": course.name,
        "source": course.source,
        "teacher": course.teacher,
    }


@router.get("/courses/{course_id}/materials")
async def get_course_materials(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Material)
        .where(Material.user_id == current_user.id, Material.course_id == course_id)
        .order_by(Material.created_at.desc())
    )
    mats = result.scalars().all()
    return [
        {
            "id": m.id,
            "title": m.title,
            "type": m.material_type,
            "source": m.source,
            "preview": m.content_preview,
            "full_text": m.full_text,
            "external_id": m.external_id, # Link for attachments
            "parent_id": m.parent_external_id, # Return link to parent
            "source_link": m.source_link, # For direct viewing
            "attachments": json.loads(m.attachments) if m.attachments else [],
            "created_at": m.created_at.isoformat(),
            "due_date": m.due_date.isoformat() if m.due_date else None,
        }
        for m in mats
    ]


@router.get("/materials")
async def get_materials(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Material).where(Material.user_id == current_user.id).order_by(Material.created_at.desc()).limit(50)
    )
    mats = result.scalars().all()
    return [
        {
            "id": m.id,
            "title": m.title,
            "type": m.material_type,
            "source": m.source,
            "preview": m.content_preview,
            "full_text": m.full_text,
            "external_id": m.external_id, # Link for attachments
            "parent_id": m.parent_external_id, # Return link to parent
            "source_link": m.source_link,
            "attachments": json.loads(m.attachments) if m.attachments else [],
            "due_date": m.due_date.isoformat() if m.due_date else None,
        }
        for m in mats
    ]
from fastapi.responses import RedirectResponse

@router.get("/proxy/drive/{material_id}")
async def proxy_drive_file(
    material_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Redirects the citation link to the actual Google Drive file URL.
    This resolves the document in its native Google UI so the user 
    can view the actual PDF or formatted document.
    """
    # 1. Lookup material in local DB
    result = await db.execute(
        select(Material).where(Material.id == material_id)
    )
    material = result.scalar_one_or_none()
    
    if not material:
        raise HTTPException(status_code=404, detail="Material not found in local database")
        
    file_id = material.external_id
    if not file_id:
        raise HTTPException(status_code=400, detail="Material has no associated Google Drive ID")

    # 2. Redirect to direct Google Drive URL depending on type
    if material.material_type == "folder":
        url = f"https://drive.google.com/drive/folders/{file_id}"
    else:
        url = f"https://drive.google.com/file/d/{file_id}/view"
        
    return RedirectResponse(url=url)
