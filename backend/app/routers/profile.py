"""
Profile Router — Digital Twin profile, usage stats, courses
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import io
import json
import asyncio
import time
import hmac
import hashlib
import base64
import httpx
import os
from datetime import datetime, timedelta, timezone
from app.models.database import get_db, User, Course, Material
from app.utils.locks import GLOBAL_API_LOCK
from app.utils.dependencies import get_current_user
from app.intelligence.ms_client import get_ms_client
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
    """Retrieve the user's Digital Twin profile from Memsapien."""
    sm = get_ms_client()
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

@router.get("/announcements")
async def get_student_announcements(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch recent announcements/reinforcement plans for enrolled courses."""
    from app.models.database import Enrollment
    
    # Get enrolled courses
    enr_res = await db.execute(select(Enrollment.course_id).where(Enrollment.student_id == current_user.id))
    course_ids = [r[0] for r in enr_res.all()]
    
    if not course_ids:
        return []
        
    res = await db.execute(
        select(Material, Course.name)
        .join(Course, Material.course_id == Course.id)
        .where(Material.course_id.in_(course_ids), Material.material_type == "announcement")
        .order_by(Material.created_at.desc())
        .limit(5)
    )
    
    return [
        {
            "id": mat.id,
            "title": mat.title,
            "content_preview": mat.content_preview,
            "course_name": course_name,
            "created_at": mat.created_at.isoformat()
        }
        for mat, course_name in res.all()
    ]

@router.get("/mastery")
async def get_student_mastery(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve concept-level mastery scores for the student."""
    from app.models.database import PerformanceMetric
    
    # Fetch recent metrics grouped by concept
    res = await db.execute(
        select(PerformanceMetric.concept, PerformanceMetric.value, PerformanceMetric.timestamp)
        .where(PerformanceMetric.user_id == current_user.id, PerformanceMetric.metric_type == "concept_mastery")
        .order_by(PerformanceMetric.timestamp.desc())
    )
    rows = res.all()
    # Build unique concept map (latest score)
    mastery = {}
    for concept, score, ts in rows:
        if concept not in mastery:
            mastery[concept] = {
                "concept": concept,
                "score": score,
                "last_reviewed": ts.strftime("%Y-%m-%d")
            }
            
    # Filter for top N concepts
    items = list(mastery.values())
    items.sort(key=lambda x: x['score'], reverse=True)
    return items[:12] 

@router.get("/stats")
async def get_profile_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns overall mastery stats for the user."""
    # Mastery is the average of all concept scores
    from app.models.database import PerformanceMetric
    mastery_res = await db.execute(
        select(func.avg(PerformanceMetric.value))
        .where(PerformanceMetric.user_id == current_user.id, PerformanceMetric.metric_type == "concept_mastery")
    )
    avg_mastery = mastery_res.scalar() or 0
    
    # Calculate Velocity: Avg change in mastery over last 7 days
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    vel_res = await db.execute(
        select(func.avg(PerformanceMetric.value))
        .where(PerformanceMetric.user_id == current_user.id, PerformanceMetric.timestamp > week_ago)
    )
    avg_recent = vel_res.scalar() or 0
    
    old_res = await db.execute(
        select(func.avg(PerformanceMetric.value))
        .where(PerformanceMetric.user_id == current_user.id, PerformanceMetric.timestamp <= week_ago)
    )
    avg_old = old_res.scalar() or 0
    
    velocity = 0
    if avg_old > 0:
        velocity = ((avg_recent - avg_old) / avg_old) * 100
    elif avg_recent > 0:
        velocity = 100 # Initial growth
        
    return {
        "mastery": round(avg_mastery * 100),
        "velocity": f"{'+' if velocity >= 0 else ''}{round(velocity, 1)}%"
    }

@router.get("/mastery/history")
async def get_mastery_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns session-by-session mastery data for the Line Chart."""
    from app.models.database import PerformanceMetric
    
    # We aggregate performance by day (session)
    res = await db.execute(
        select(
            func.date(PerformanceMetric.timestamp).label('session_date'),
            func.avg(PerformanceMetric.value).label('avg_mastery')
        )
        .where(PerformanceMetric.user_id == current_user.id)
        .group_by('session_date')
        .order_by('session_date')
        .limit(15)
    )
    
    history = []
    for row in res.all():
        history.append({
            "session": str(row.session_date),
            "mastery": round(row.avg_mastery * 100) # Convert 0-1 to percentage
        })
        
    return history

@router.get("/mastery-graph")
async def get_mastery_graph(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generates Nodes and Edges for the React Flow Mastery Graph."""
    from app.models.database import PerformanceMetric
    from app.services.openai_service import get_openai_client
    import json
    
    # Cache for edges
    if not hasattr(router, "_edge_cache"):
        router._edge_cache = {}
    
    # 1. Fetch unique concepts from Performance (Actual Progress)
    res = await db.execute(
        select(
            PerformanceMetric.concept, 
            func.avg(PerformanceMetric.value).label('score')
        )
        .where(PerformanceMetric.user_id == current_user.id)
        .group_by(PerformanceMetric.concept)
    )
    
    performance_map = {row.concept: row.score for row in res.all() if row.concept}
    
    # 2. Fetch concepts from Materials (Curriculum Scope)
    # We join Enrollment -> Course -> Material
    from app.models.database import Enrollment, Course, Material
    mat_res = await db.execute(
        select(Material.title, Material.content_preview)
        .join(Course, Material.course_id == Course.id)
        .join(Enrollment, Course.id == Enrollment.course_id)
        .where(Enrollment.student_id == current_user.id)
    )
    
    # Extract concepts from titles/previews using a simple LLM pass or just using titles
    material_concepts = []
    for title, preview in mat_res.all():
        material_concepts.append(title)
        # Could extract more here, but titles are a good proxy for "Topics"
        
    # Combine and Deduplicate
    all_concept_names = list(set(list(performance_map.keys()) + material_concepts))
    
    if not all_concept_names:
        # Fallback: if totally empty, return empty
        return {"nodes": [], "edges": []}
        
    concepts = []
    for name in all_concept_names:
        concepts.append({
            "concept": name,
            "score": performance_map.get(name, 0) # 0 if not encountered yet
        })
        
    # Check Cache
    cache_key = f"edges_{hash(tuple(sorted(all_concept_names)))}"
    if cache_key in router._edge_cache:
        edges_list = router._edge_cache[cache_key]
    else:
        # 2. Use LLM to infer dependencies (edges)
        prompt = f"""
        You are an AI Curriculum mapper. Analyze this list of concepts the student has encountered:
        {[c['concept'] for c in concepts]}
        
        1. Identify the 10-12 MOST CRITICAL "Anchor Concepts" that form the backbone of this subject.
        2. Filter out minor details or highly specific sub-topics.
        3. Return a JSON array of edges representing PRE-REQUISITE relationships between these anchor concepts. 
        
        Format: {{"edges": [{{"source": "Concept A", "target": "Concept B"}}]}}
        Return ONLY JSON. 
        """
        
        client = get_openai_client()
        try:
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            try:
                edges_data = json.loads(response.choices[0].message.content)
                if isinstance(edges_data, dict):
                    edges_list = edges_data.get("edges", edges_data.get("relationships", []))
                else:
                    edges_list = edges_data
                router._edge_cache[cache_key] = edges_list
            except:
                edges_list = []
        except:
            edges_list = []
        
    # Filter nodes to only include those in the anchor set (sources/targets from LLM)
    anchor_names = set()
    for e in edges_list:
        anchor_names.add(e.get("source"))
        anchor_names.add(e.get("target"))
        
    final_nodes = []
    for c in concepts:
        if c['concept'] in anchor_names:
            final_nodes.append({
                "id": c['concept'],
                "data": {"label": c['concept'], "score": c['score']},
                "position": {"x": 0, "y": 0}
            })
            
    edges = []
    for idx, e in enumerate(edges_list):
        if e.get("source") and e.get("target"):
            edges.append({
                "id": f"e{idx}",
                "source": e["source"],
                "target": e["target"],
                "animated": True
            })
            
    return {"nodes": final_nodes, "edges": edges}


@router.get("/courses/discover")
async def discover_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all available institutional courses that the student isn't enrolled in yet."""
    from app.models.database import Course, Enrollment
    # Subquery for enrolled IDs
    enrolled_stmt = select(Enrollment.course_id).where(Enrollment.student_id == current_user.id)
    enrolled_ids = (await db.execute(enrolled_stmt)).scalars().all()
    
    # Select courses not in enrolled_ids
    stmt = select(Course).where(Course.id.notin_(enrolled_ids) if enrolled_ids else True)
    courses = (await db.execute(stmt)).scalars().all()
    
    return [
        {
            "id": c.id,
            "name": c.name,
            "teacher": c.teacher,
            "section": c.section,
        }
        for c in courses
    ]

@router.get("/courses")
async def get_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all courses the student is enrolled in."""
    from app.models.database import Course, Enrollment
    result = await db.execute(
        select(Course)
        .join(Enrollment, Course.id == Enrollment.course_id)
        .where(Enrollment.student_id == current_user.id)
    )
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
    """Get details and materials for a specific course."""
    from app.models.database import Course, Enrollment, Material
    # 1. Check enrollment
    enr_stmt = select(Enrollment).where(Enrollment.student_id == current_user.id, Enrollment.course_id == course_id)
    enr = (await db.execute(enr_stmt)).scalar_one_or_none()
    if not enr:
        raise HTTPException(status_code=403, detail="Not enrolled in this course")
        
    # 2. Get course
    course = (await db.execute(select(Course).where(Course.id == course_id))).scalar_one_or_none()
    
    # 3. Get materials
    mats_stmt = select(Material).where(Material.course_id == course_id)
    mats = (await db.execute(mats_stmt)).scalars().all()
    
    return {
        "id": course.id,
        "name": course.name,
        "section": course.section,
        "teacher": course.teacher,
        "materials": [
            {
                "id": m.id,
                "title": m.title,
                "type": m.material_type,
                "created_at": m.created_at.isoformat() if m.created_at else None
            }
            for m in mats
        ]
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

@router.get("/courses/{course_id}")
async def get_course_detail(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch detailed course info for a student, including their enrollment status and materials."""
    from app.models.database import Course, Enrollment, Material
    
    # Check if student is enrolled
    stmt = select(Enrollment).where(Enrollment.student_id == current_user.id, Enrollment.course_id == course_id)
    enrolled = (await db.execute(stmt)).scalar_one_or_none()
    if not enrolled:
        raise HTTPException(status_code=403, detail="Access denied. You are not enrolled in this course.")
        
    course_stmt = select(Course).where(Course.id == course_id)
    course = (await db.execute(course_stmt)).scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    # Get materials
    mat_stmt = select(Material).where(Material.course_id == course_id)
    materials = (await db.execute(mat_stmt)).scalars().all()
    
    return {
        "id": course.id,
        "name": course.name,
        "teacher": "Institutional Faculty",
        "section": course.section,
        "materials": [
            {
                "id": m.id,
                "title": m.title,
                "created_at": m.created_at.isoformat(),
                "type": m.type
            } for m in materials
        ]
    }
@router.get("/materials")
async def get_materials(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.database import Enrollment, Course
    # 1. Get enrolled course IDs
    enr_res = await db.execute(select(Enrollment.course_id).where(Enrollment.student_id == current_user.id))
    course_ids = [r[0] for r in enr_res.all()]
    
    # 2. Query materials owned by user OR in enrolled courses
    from sqlalchemy import or_
    stmt = (
        select(Material)
        .where(or_(
            Material.user_id == current_user.id,
            Material.course_id.in_(course_ids) if course_ids else False
        ))
        .order_by(Material.created_at.desc())
        .limit(100)
    )
    
    result = await db.execute(stmt)
    mats = result.scalars().all()
    return [
        {
            "id": m.id,
            "title": m.title,
            "type": m.material_type,
            "source": m.source,
            "preview": m.content_preview,
            "full_text": m.full_text,
            "external_id": m.external_id,
            "parent_id": m.parent_external_id,
            "source_link": m.source_link,
            "file_content_exists": m.file_content is not None,
            "indexed": m.indexed_in_memsapien,
            "attachments": json.loads(m.attachments) if m.attachments else [],
            "due_date": m.due_date.isoformat() if m.due_date else None,
            "course_id": m.course_id
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
    """Delete a material from the local DB and Memsapien."""
    # 1. Find the material
    stmt = select(Material).where(Material.id == material_id, Material.user_id == current_user.id)
    res = await db.execute(stmt)
    material = res.scalar_one_or_none()
    
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
        
    # 2. Delete from Memsapien (if indexed)
    # We search by material_id in metadata to find the docId
    sm = get_ms_client()
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
        print(f"Error deleting from Memsapien during material removal: {e}")
        
    # 3. Delete from Local DB
    await db.delete(material)
    await db.commit()
    
    return {"status": "success", "message": "Material removed from Digital Twin"}
