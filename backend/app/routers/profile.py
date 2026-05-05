"""
Profile Router — Digital Twin profile, usage stats, courses
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import io
import json
import asyncio
import time
import hmac
import hashlib
import base64
import httpx
import os
from datetime import datetime, timedelta
from app.models.database import get_db, User, Course, Material
from app.utils.locks import GLOBAL_API_LOCK
from app.utils.dependencies import get_current_user
from app.intelligence.sm_client import get_sm_client
from app.services.google_auth import build_credentials, refresh_credentials
from app.routers.integrations import GLOBAL_API_LOCK

# ── Signed PDF Token Helpers ──────────────────────────────────────────────
_PDF_SECRET = os.getenv("SECRET_KEY", "changeme-very-secret-key-in-production")
_PDF_TOKEN_TTL = 300  # 5 minutes

def _sign_pdf_token(material_id: int, user_id: int) -> str:
    exp = int(time.time()) + _PDF_TOKEN_TTL
    payload = f"{material_id}:{user_id}:{exp}"
    sig = hmac.new(_PDF_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    raw = base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()
    return raw

def _verify_pdf_token(token: str) -> dict:
    """Returns {material_id, user_id} or raises HTTPException."""
    try:
        decoded = base64.urlsafe_b64decode(token + "==").decode()
        parts = decoded.split(":")
        if len(parts) != 4:
            raise ValueError("bad format")
        material_id, user_id, exp, sig = parts
        payload = f"{material_id}:{user_id}:{exp}"
        expected = hmac.new(_PDF_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad sig")
        if int(exp) < int(time.time()):
            raise ValueError("expired")
        return {"material_id": int(material_id), "user_id": int(user_id)}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired PDF token: {e}")

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
            "source_link": m.source_link,
            "attachments": json.loads(m.attachments) if m.attachments else [],
            "file_content_exists": m.file_content is not None,
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
# ── Secure PDF Proxy (Signed Token) ──────────────────────────────────────

@router.get("/proxy/drive/{material_id}/token")
async def get_pdf_token(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Issues a short-lived signed token to stream a PDF from Google Drive.
    Only the authenticated owner of the material can request a token.
    """
    result = await db.execute(
        select(Material).where(
            Material.id == material_id,
            Material.user_id == current_user.id,
        )
    )
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    if not material.external_id and not material.file_content:
        raise HTTPException(status_code=400, detail="Material has no associated Drive file or local content")

    token = _sign_pdf_token(material_id, current_user.id)
    return {"token": token, "expires_in": _PDF_TOKEN_TTL}


@router.get("/proxy/drive/stream")
async def stream_pdf(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Validates the signed token and streams the raw PDF bytes from Google Drive.
    Sets Content-Type: application/pdf and Content-Disposition: inline so that
    PDF.js can fetch and render without triggering a browser download.
    """
    claims = _verify_pdf_token(token)
    material_id = claims["material_id"]
    user_id = claims["user_id"]

    # Load material + user in one go
    mat_res = await db.execute(
        select(Material).where(Material.id == material_id, Material.user_id == user_id)
    )
    material = mat_res.scalar_one_or_none()
    if not material or not material.external_id:
        raise HTTPException(status_code=404, detail="Material not found")

    user_res = await db.execute(select(User).where(User.id == user_id))
    user = user_res.scalar_one_or_none()
    if not user or not user.google_refresh_token:
        raise HTTPException(status_code=401, detail="User credentials unavailable")

    # Refresh Google credentials to get a fresh access token
    try:
        creds = refresh_credentials(user.google_refresh_token)
        access_token = creds.token
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not refresh Google credentials: {e}")

    file_id = material.external_id
    # We use a dual strategy: 
    # 1. Try alt=media (works for everything EXCEPT Google Docs/Slides/Sheets)
    # 2. If it fails with 403 or 400, it's a Workspace file -> use export API
    
    async def _stream_bytes():
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            try:
                # Attempt 1: Standard media download
                download_url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
                async with client.stream(
                    "GET",
                    download_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                ) as resp:
                    if resp.status_code == 200:
                        async for chunk in resp.aiter_bytes(chunk_size=65536):
                            yield chunk
                        return
                    
                    # If not 200, it might be a Workspace file (403/400)
                    if resp.status_code not in (403, 400):
                        raise HTTPException(status_code=resp.status_code, detail=f"Drive fetch failed: {resp.text}")

                # Attempt 2: PDF Export (for Google Docs/Slides/Sheets)
                export_url = f"https://www.googleapis.com/drive/v3/files/{file_id}/export?mimeType=application/pdf"
                async with client.stream(
                    "GET",
                    export_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                ) as resp_export:
                    if resp_export.status_code == 200:
                        async for chunk in resp_export.aiter_bytes(chunk_size=65536):
                            yield chunk
                        return
                    
                    # If both fail, raise the export error
                    raise HTTPException(status_code=resp_export.status_code, detail=f"Google Drive export failed: {resp_export.text}")
            except Exception as e:
                if isinstance(e, HTTPException): raise e
                raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")

    return StreamingResponse(
        _stream_bytes(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{material.title or file_id}.pdf"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )

@router.get("/proxy/drive/{material_id}/preview")
async def redirect_to_drive_preview(
    material_id: int,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the native Google Drive PREVIEW URL as JSON.
    Detects non-Drive (e.g. Classroom numeric) IDs and returns source_link as fallback.
    """
    try:
        token_data = _verify_pdf_token(token)
        user_id_from_token = token_data["user_id"]
        if token_data["material_id"] != int(material_id):
            raise ValueError("Token material_id mismatch")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")

    result = await db.execute(
        select(Material).where(
            Material.id == material_id,
            Material.user_id == user_id_from_token,
        )
    )
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found.")

    ext_id = material.external_id or ""

    # A valid Google Drive file ID is alphanumeric + URL-safe chars (~28-44 chars), NEVER purely numeric.
    # Pure numeric IDs are Google Classroom assignment IDs — not embeddable via Drive viewer.
    is_drive_file = ext_id and not ext_id.isdigit() and len(ext_id) > 15

    # Use local custom viewer for locally stored content (manual uploads or cached syncs)
    if material.file_content:
        return {"url": f"{os.getenv('BACKEND_URL', 'http://localhost:8002')}/profile/proxy/drive/{material_id}/view?token={token}", "material_id": material_id, "type": "local"}

    # ON-DEMAND SYNC: If file is Drive-based but not local yet, attempt to download it now.
    if is_drive_file and not material.file_content:
        from app.services.drive_sync import DriveSyncService
        try:
            print(f"[Self-Heal] On-demand ingestion for material {material_id} ({ext_id})...")
            # We need the user object for Drive API auth
            from app.models.database import User
            user_res = await db.execute(select(User).where(User.id == user_id_from_token))
            proxy_user = user_res.scalar_one_or_none()
            
            if proxy_user:
                # Build service for current user
                service_factory = DriveSyncService(proxy_user)
                drive_service = await service_factory._get_drive_service()
            
            # Use the existing extraction logic
            from app.routers.integrations import _get_drive_file_content
            content, raw_bytes = await _get_drive_file_content(drive_service, ext_id)
            
            if raw_bytes:
                material.file_content = raw_bytes
                if content:
                    material.full_text = content
                material.mime_type = material.mime_type or "application/pdf"
                await db.commit()
                print(f"[Self-Heal] Successfully migrated {material_id} to local storage.")
                if material.file_content:
                    return {"url": f"{os.getenv('BACKEND_URL', 'http://localhost:8002')}/profile/proxy/drive/{material_id}/view?token={token}", "material_id": material_id, "type": "local"}
        except Exception as e:
            print(f"[Self-Heal] Failed on-demand ingestion: {e}")

    if is_drive_file:
        return {"url": f"https://drive.google.com/file/d/{ext_id}/preview", "material_id": material_id, "type": "drive"}
    elif material.source_link:
        return {"url": material.source_link, "material_id": material_id, "type": "link"}
    else:
        raise HTTPException(status_code=404, detail="Material has no previewable Drive file or source link.")


@router.get("/proxy/drive/{material_id}/view")
async def serve_local_binary(
    material_id: int,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Serves the raw binary content stored in SQLite."""
    try:
        token_data = _verify_pdf_token(token)
        user_id_from_token = token_data["user_id"]
        if token_data["material_id"] != int(material_id):
            raise ValueError("Token material_id mismatch")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")

    result = await db.execute(
        select(Material).where(
            Material.id == material_id,
            Material.user_id == user_id_from_token,
        )
    )
    material = result.scalar_one_or_none()
    if not material or not material.file_content:
        raise HTTPException(status_code=404, detail="Local binary content not found.")

    from fastapi import Response
    return Response(
        content=material.file_content,
        media_type=material.mime_type or "application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{material.title}"',
            "X-Content-Type-Options": "nosniff",
        }
    )


@router.get("/proxy/drive/{material_id}")
async def redirect_to_drive(
    material_id: int,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    try:
        token_data = _verify_pdf_token(token)
        user_id_from_token = token_data["user_id"]
        if token_data["material_id"] != int(material_id):
            raise ValueError("Token material_id mismatch")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")

    result = await db.execute(
        select(Material).where(
            Material.id == material_id,
            Material.user_id == user_id_from_token,
        )
    )
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found.")

    ext_id = material.external_id or ""
    is_drive_file = ext_id and not ext_id.isdigit() and len(ext_id) > 15

    if is_drive_file:
        return {"url": f"https://drive.google.com/file/d/{ext_id}/view", "material_id": material_id, "type": "drive"}
    
    if material.file_content:
        # Local content: return the view URL. Note: caller might need to append ?token=
        return {"url": f"{os.getenv('BACKEND_URL', 'http://localhost:8002')}/profile/proxy/drive/{material_id}/view", "material_id": material_id, "type": "local"}

    if material.source_link:
        return {"url": material.source_link, "material_id": material_id, "type": "link"}
    else:
        raise HTTPException(status_code=404, detail="Material has no viewable Drive file or source link.")

@router.delete("/materials/{material_id}")
async def delete_material(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a material from the local DB and Supermemory."""
    # 1. Find the material
    stmt = select(Material).where(Material.id == material_id, Material.user_id == current_user.id)
    res = await db.execute(stmt)
    material = res.scalar_one_or_none()
    
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
        
    # 2. Delete from Supermemory (if indexed)
    # We search by material_id in metadata to find the docId
    sm = get_sm_client()
    try:
        filters = {
            "AND": [
                {"key": "user_id", "value": current_user.email},
                {"key": "material_id", "value": str(material_id)}
            ]
        }
        # Search to find the doc ID
        search_res = await sm.search(query="*", filters=filters, limit=20)
        docs_to_delete = search_res.get("results", [])
        for doc in docs_to_delete:
            doc_id = doc.get("documentId")
            if doc_id:
                await sm.delete_document(doc_id)
    except Exception as e:
        # We don't block DB deletion if SM fails, but we log it
        print(f"Error deleting from Supermemory during material removal: {e}")
        
    # 3. Delete from Local DB
    await db.delete(material)
    await db.commit()
    
    return {"status": "success", "message": "Material removed from Digital Twin"}
