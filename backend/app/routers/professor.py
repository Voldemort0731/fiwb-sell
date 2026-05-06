from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, BackgroundTasks, Form
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
import os
import json
import logging
from datetime import datetime, timezone

from app.models.database import get_db, User, Course, Material, PerformanceMetric, VivaAssessment
from app.utils.dependencies import get_current_user
from app.intelligence.ms_client import get_ms_client
from app.routers.integrations import _extract_text_from_bytes

router = APIRouter(prefix="/professor", tags=["professor"])
logger = logging.getLogger(__name__)

def check_professor(user: User):
    if user.role != "professor":
        raise HTTPException(status_code=403, detail="Access denied: Professor role required")
    return user

@router.get("/courses")
async def get_professor_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all courses managed by this professor."""
    check_professor(current_user)
    result = await db.execute(select(Course).where(Course.user_id == current_user.id))
    courses = result.scalars().all()
    return courses

class CourseCreate(BaseModel):
    name: str
    section: Optional[str] = None

@router.post("/courses")
async def create_course(
    body: CourseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new course."""
    check_professor(current_user)
    course = Course(
        user_id=current_user.id,
        name=body.name,
        section=body.section,
        source="professor_direct"
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course

@router.post("/upload")
async def professor_upload(
    course_id: int = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload material to a specific course (shared index)."""
    check_professor(current_user)
    
    # Verify course ownership
    course_result = await db.execute(select(Course).where(Course.id == course_id, Course.user_id == current_user.id))
    course = course_result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found or not owned by you")

    file_bytes = await file.read()
    filename = file.filename or "prof_upload"
    mime_type = file.content_type or "application/octet-stream"
    
    content = await _extract_text_from_bytes(file_bytes, mime_type)
    preview = content[:500] if content else f"Professor upload: {filename}"
    
    new_mat = Material(
        user_id=current_user.id,
        course_id=course_id,
        title=filename,
        material_type="file",
        source="professor_upload",
        file_content=file_bytes,
        mime_type=mime_type,
        indexed_in_memsapien=False,
        content_preview=preview,
        full_text=content if content else None,
        source_link=f"{os.getenv('BACKEND_URL', 'http://localhost:8002')}/profile/proxy/drive/0"
    )
    db.add(new_mat)
    await db.commit()
    await db.refresh(new_mat)
    
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8002")
    new_mat.source_link = f"{backend_url}/profile/proxy/drive/{new_mat.id}"
    await db.commit()
    
    # Index in Memsapien with course_id as container_tag
    try:
        sm = get_ms_client()
        sm_id = await sm.add_document(
            content=f"Professor Uploaded Material [{course.name}]: {filename}\n\n{content or 'Binary file content'}",
            metadata={
                "source": "professor_upload",
                "type": "academic_material",
                "course_id": str(course_id),
                "course_name": course.name,
                "professor_email": current_user.email,
                "material_id": str(new_mat.id)
            },
            user_email=current_user.email,
            title=filename,
            container_tag=f"course_{course_id}" # Shared index for all students in this course
        )
        if sm_id:
            new_mat.indexed_in_memsapien = True
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to index professor upload in SM: {e}")
        
    return {"id": new_mat.id, "title": filename, "indexed": new_mat.indexed_in_memsapien}

class AssessmentCreate(BaseModel):
    title: str
    course_id: int
    objective: str
    config: dict
    material_id: Optional[int] = None

@router.post("/assessment")
async def create_assessment(
    body: AssessmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new AI Viva Assessment."""
    check_professor(current_user)
    
    assessment = VivaAssessment(
        professor_id=current_user.id,
        course_id=body.course_id,
        title=body.title,
        objective=body.objective,
        config_json=json.dumps(body.config)
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    return assessment

@router.get("/assessments")
async def list_professor_assessments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all AI Viva assessments created by this professor."""
    check_professor(current_user)
    from sqlalchemy import func
    from app.models.database import VivaAssessment, VivaResult
    
    # Fetch assessments + submission counts
    stmt = (
        select(VivaAssessment, func.count(VivaResult.id))
        .outerjoin(VivaResult, VivaResult.assessment_id == VivaAssessment.id)
        .where(VivaAssessment.professor_id == current_user.id)
        .group_by(VivaAssessment.id)
    )
    res = await db.execute(stmt)
    rows = res.all()
    
    return [
        {
            "id": ass.id,
            "title": ass.title,
            "objective": ass.objective,
            "course_id": ass.course_id,
            "student_count": count
        } for ass, count in rows
    ]

@router.post("/courses/{course_id}/enroll")
async def enroll_in_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Enroll a student in a course."""
    from app.models.database import Enrollment
    
    # Check if already enrolled
    res = await db.execute(select(Enrollment).where(Enrollment.student_id == current_user.id, Enrollment.course_id == course_id))
    if res.scalar_one_or_none():
        return {"message": "Already enrolled"}
        
    enrollment = Enrollment(student_id=current_user.id, course_id=course_id)
    db.add(enrollment)
    await db.commit()
    return {"ok": True}

@router.get("/courses/{course_id}/mastery-graph")
async def get_course_mastery_graph(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generates Nodes and Edges for the React Flow Mastery Graph (Class Average)."""
    check_professor(current_user)
    from app.services.openai_service import get_openai_client
    import json
    
    # Static cache for edges to prevent redundant LLM calls
    if not hasattr(router, "_edge_cache"):
        router._edge_cache = {}
    
    # Simple edge cache to avoid redundant LLM calls if concept list hasn't changed
    if not hasattr(router, "_graph_edge_cache"):
        router._graph_edge_cache = {}
    
    # 1. Fetch unique concepts from Performance
    res = await db.execute(
        select(
            PerformanceMetric.concept, 
            func.avg(PerformanceMetric.value).label('score')
        )
        .where(PerformanceMetric.course_id == course_id)
        .group_by(PerformanceMetric.concept)
    )
    performance_map = {row.concept: row.score for row in res.all() if row.concept}
    
    # 2. Fetch all materials for this course
    mat_res = await db.execute(
        select(Material.title)
        .where(Material.course_id == course_id)
    )
    material_concepts = [r[0] for r in mat_res.all()]
    
    # Combine
    all_names = list(set(list(performance_map.keys()) + material_concepts))
    
    if not all_names:
        return {"nodes": [], "edges": []}
        
    concepts = []
    for name in all_names:
        concepts.append({
            "concept": name, 
            "score": performance_map.get(name, 0)
        })
        
    # Check Cache
    cache_key = f"edges_{hash(tuple(sorted(all_names)))}"
    if cache_key in router._edge_cache:
        edges_list = router._edge_cache[cache_key]
    else:
        # 2. Use LLM to infer dependencies
        prompt = f"""
        1. Identify the 10-12 MOST CRITICAL "Anchor Concepts" that form the backbone of this course curriculum.
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

@router.get("/courses/{course_id}/analytics/history")
async def get_course_analytics_history(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns session-by-session class average mastery data for the Line Chart."""
    check_professor(current_user)
    
    res = await db.execute(
        select(
            func.date(PerformanceMetric.timestamp).label('session_date'),
            func.avg(PerformanceMetric.value).label('avg_mastery')
        )
        .where(PerformanceMetric.course_id == course_id)
        .group_by('session_date')
        .order_by('session_date')
        .limit(15)
    )
    
    history = []
    for row in res.all():
        history.append({
            "session": str(row.session_date),
            "mastery": round(row.avg_mastery * 100)
        })
        
    return history

@router.get("/analytics/summary")
async def get_analytics_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Aggregate stats for the professor dashboard."""
    check_professor(current_user)
    
    # Get courses owned by this professor
    course_ids_res = await db.execute(select(Course.id).where(Course.user_id == current_user.id))
    course_ids = [r[0] for r in course_ids_res.all()]
    
    if not course_ids:
        return {"total_students": 0, "avg_mastery": 0, "critical_concepts": 0, "course_mastery": [], "alerts_count": 0}

    # 1. Total students in these courses
    std_res = await db.execute(
        select(func.count(func.distinct(PerformanceMetric.user_id)))
        .where(PerformanceMetric.course_id.in_(course_ids))
    )
    total_students = std_res.scalar() or 0
    
    # 2. Avg Mastery in these courses
    avg_res = await db.execute(
        select(func.avg(PerformanceMetric.value))
        .where(PerformanceMetric.course_id.in_(course_ids))
    )
    avg_mastery = avg_res.scalar() or 0
    
    # 3. Critical Concepts (concepts with avg mastery < 50)
    crit_res = await db.execute(
        select(PerformanceMetric.concept, func.avg(PerformanceMetric.value))
        .where(PerformanceMetric.course_id.in_(course_ids))
        .group_by(PerformanceMetric.concept)
        .having(func.avg(PerformanceMetric.value) < 0.5)
    )
    critical_concepts_list = crit_res.all()
    
    # 4. Course-wise Mastery for Heatmap
    course_mastery_res = await db.execute(
        select(Course.name, func.avg(PerformanceMetric.value))
        .join(Course, PerformanceMetric.course_id == Course.id)
        .where(Course.user_id == current_user.id)
        .group_by(Course.name)
    )
    course_mastery = [{"name": r[0], "avg": round((r[1] or 0) * 100)} for r in course_mastery_res.all()]

    return {
        "total_students": total_students,
        "avg_mastery": round(avg_mastery * 100),
        "critical_concepts": len(critical_concepts_list),
        "course_mastery": course_mastery,
        "alerts_count": len(critical_concepts_list)
    }

@router.get("/insights")
async def get_professor_insights(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """AI Tier: Generates strategic insights across all student performance data."""
    check_professor(current_user)
    
    # 1. Get owned course IDs
    course_ids_res = await db.execute(select(Course.id).where(Course.user_id == current_user.id))
    course_ids = [r[0] for r in course_ids_res.all()]
    
    if not course_ids:
        return {"insight": "No course data available yet. Courses must be created and students enrolled to generate insights."}

    # 2. Fetch recent performance metrics (sample)
    from app.models.database import PerformanceMetric
    metrics_res = await db.execute(
        select(PerformanceMetric.concept, PerformanceMetric.value, Course.name)
        .join(Course, PerformanceMetric.course_id == Course.id)
        .where(PerformanceMetric.course_id.in_(course_ids))
        .order_by(PerformanceMetric.timestamp.desc())
        .limit(100)
    )
    metrics = metrics_res.all()
    
    if not metrics:
        return {"insight": "Insufficient student data to generate strategic insights. Metrics are gathered as students chat and complete Vivas."}

    # 3. Summarize with LLM
    from app.services.openai_service import generate_chat_response_simple
    
    data_str = "\n".join([f"Course: {c_name}, Concept: {concept}, Score: {score}" for concept, score, c_name in metrics])
    
    prompt = f"""
    You are an Institutional Intelligence analyst. Review the following student performance data and provide 3-4 bullet points of high-level strategic insights for the professor.
    Focus on:
    1. Overall class strengths.
    2. Shared misconceptions or bottlenecks.
    3. Actionable recommendations for the next lecture.
    
    DATA:
    {data_str}
    
    Format your response in professional markdown.
    """
    
    insight_text = await generate_chat_response_simple([{"role": "user", "content": prompt}])
    return {"insight": insight_text}

@router.post("/courses/{course_id}/reinforcement")
async def create_reinforcement_plan(
    course_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """AI Tier: Generates a targeted reinforcement plan for a specific concept."""
    check_professor(current_user)
    concept = body.get("concept")
    
    # 1. Fetch concept context from Memsapien (shared indices)
    sm = get_ms_client()
    context_res = await sm.search(
        query=concept,
        filters={"container_tag": f"course_{course_id}"},
        limit=5
    )
    docs = sm.flatten_v3(context_res)
    context_text = "\n\n".join([d.get("content", "") for d in docs])
    
    # 2. Generate Plan
    from app.services.openai_service import generate_chat_response_simple
    prompt = f"""
    You are an expert educator. Students in your course are struggling with the concept: '{concept}'.
    Based on the following course materials, generate a targeted 'Reinforcement Plan' to help them overcome this hurdle.
    
    COURSE CONTEXT:
    {context_text[:5000]}
    
    Return a professional markdown response with:
    1. A simplified explanation of the concept (The 'Aha!' moment).
    2. A concrete analogy or example.
    3. 3-4 practice prompts for the students to try in their AI mentor chat.
    """
    
    plan_text = await generate_chat_response_simple([{"role": "user", "content": prompt}])
    
    # 3. Store as a new 'Material' for the course (Announcement/Reinforcement type)
    new_mat = Material(
        user_id=current_user.id,
        course_id=course_id,
        title=f"Reinforcement: {concept}",
        material_type="announcement",
        source="ai_generator",
        full_text=plan_text,
        content_preview=f"Targeted support for {concept}",
        indexed_in_memsapien=True # Already in context basically
    )
    db.add(new_mat)
    await db.commit()
    
    return {"status": "success", "plan": plan_text}

@router.get("/alerts")
async def get_professor_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Detect 'Weak Concepts' where students are struggling."""
    check_professor(current_user)
    
    # Get courses owned by this professor
    course_ids_res = await db.execute(select(Course.id).where(Course.user_id == current_user.id))
    course_ids = [r[0] for r in course_ids_res.all()]
    
    if not course_ids:
        return []

    # Find concepts with average score < 50
    res = await db.execute(
        select(PerformanceMetric.concept, func.avg(PerformanceMetric.value), Course.name)
        .join(Course, PerformanceMetric.course_id == Course.id)
        .where(PerformanceMetric.course_id.in_(course_ids))
        .group_by(PerformanceMetric.concept, Course.name)
        .having(func.avg(PerformanceMetric.value) < 0.5)
    )
    rows = res.all()
    
    alerts = []
    for row in rows:
        alerts.append({
            "concept_name": row[0],
            "avg_mastery": round(row[1]),
            "course_name": row[2],
            "severity": "high" if row[1] < 30 else "medium"
        })
    return alerts

@router.get("/courses/{course_id}/materials")
async def get_course_materials(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List materials for a course."""
    check_professor(current_user)
    res = await db.execute(select(Material).where(Material.course_id == course_id))
    mats = res.scalars().all()
    return [
        {
            "id": m.id,
            "title": m.title,
            "type": m.material_type,
            "source": m.source,
            "preview": m.content_preview,
            "full_text": m.full_text,
            "external_id": m.external_id,
            "created_at": m.created_at.isoformat(),
        }
        for m in mats
    ]

@router.post("/upload/youtube")
async def youtube_sync(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch YouTube transcript, summarize, and index in SM."""
    check_professor(current_user)
    url = body.get("url")
    course_id = body.get("course_id")
    
    if not url or not course_id:
        raise HTTPException(status_code=400, detail="Missing URL or Course ID")

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        import re
        
        # Extract video ID
        video_id_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', url)
        if not video_id_match:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        video_id = video_id_match.group(1)

        # Get transcript
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        full_text = " ".join([t['text'] for t in transcript_list])
        
        # Create Material record
        new_mat = Material(
            user_id=current_user.id,
            course_id=course_id,
            title=f"YouTube Lecture: {video_id}",
            material_type="video_transcript",
            source="youtube",
            full_text=full_text,
            source_link=url,
            indexed_in_memsapien=False,
            content_preview=full_text[:500]
        )
        db.add(new_mat)
        await db.commit()
        await db.refresh(new_mat)
        
        # Index in Memsapien
        sm = get_ms_client()
        course_result = await db.execute(select(Course).where(Course.id == course_id))
        course = course_result.scalar_one_or_none()
        
        await sm.add_document(
            content=f"YouTube Lecture Transcript [{course.name if course else 'General'}]:\n\n{full_text}",
            metadata={
                "source": "youtube",
                "video_id": video_id,
                "course_id": str(course_id),
                "material_id": str(new_mat.id)
            },
            user_email=current_user.email,
            title=f"YT Lecture: {video_id}",
            container_tag=f"course_{course_id}"
        )
        
        new_mat.indexed_in_memsapien = True
        await db.commit()
        
        return {"status": "success", "id": new_mat.id, "title": new_mat.title}
        
    except Exception as e:
        logger.error(f"YouTube Sync Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-questions")
async def generate_questions(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Analyze a material and generate quiz question drafts."""
    check_professor(current_user)
    material_id = body.get("material_id")
    count = body.get("count", 5)
    
    res = await db.execute(select(Material).where(Material.id == material_id))
    mat = res.scalar_one_or_none()
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")
        
    from app.services.openai_service import generate_chat_response_simple
    
    prompt = f"""
    Based on the following academic material, generate {count} high-quality quiz questions.
    Include a mix of MCQs and Short Answer questions. 
    Format your response as a JSON list of objects:
    [{{ "type": "mcq", "question": "...", "options": ["A", "B", "C", "D"], "answer": "A" }}, ...]
    
    MATERIAL:
    {mat.full_text[:8000]}
    """
    
    response_text = await generate_chat_response_simple([{"role": "user", "content": prompt}])
    
    import re
    json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
    if json_match:
        try:
            questions = json.loads(json_match.group(0))
            return {"questions": questions}
        except:
            pass
            
    return {"error": "Failed to parse questions", "raw": response_text}

@router.get("/materials/{material_id}/heatmap")
async def get_material_heatmap(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Aggregate engagement hits for a specific material."""
    check_professor(current_user)
    
    from sqlalchemy import func
    from app.models.database import EngagementHit
    
    # Aggregate by page_number
    res = await db.execute(
        select(EngagementHit.page_number, func.count(EngagementHit.id))
        .where(EngagementHit.material_id == material_id)
        .group_by(EngagementHit.page_number)
    )
    rows = res.all()
    
    heatmap = [{"page": page or 1, "hits": count} for page, count in rows]
    return heatmap
@router.post("/courses/{course_id}/enroll")
async def enroll_in_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Enrolls the current student in a specific course."""
    from app.models.database import Enrollment, Course
    
    # 1. Check if already enrolled
    stmt = select(Enrollment).where(Enrollment.student_id == current_user.id, Enrollment.course_id == course_id)
    existing = await db.execute(stmt)
    if existing.scalar_one_or_none():
        return {"status": "already_enrolled"}
        
    # 2. Check if course exists
    course_stmt = select(Course).where(Course.id == course_id)
    course_res = await db.execute(course_stmt)
    if not course_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Course not found")
        
    # 3. Create enrollment
    enrollment = Enrollment(student_id=current_user.id, course_id=course_id)
    db.add(enrollment)
    await db.commit()
    
    return {"status": "success", "message": f"Enrolled in course {course_id}"}

@router.get("/analytics/overview")
async def get_professor_analytics_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Aggregated analytics across all courses taught by the professor."""
    check_professor(current_user)
    from app.models.database import Course, PerformanceMetric, Enrollment, VivaResult, VivaAssessment
    
    # 1. Courses owned
    course_stmt = select(Course).where(Course.user_id == current_user.id)
    courses = (await db.execute(course_stmt)).scalars().all()
    course_ids = [c.id for c in courses]
    
    # 2. Avg Mastery
    mastery_stmt = select(func.avg(PerformanceMetric.value)).where(PerformanceMetric.course_id.in_(course_ids))
    avg_mastery = (await db.execute(mastery_stmt)).scalar() or 0
    
    # 3. Total Enrollments
    enroll_stmt = select(func.count(Enrollment.id)).where(Enrollment.course_id.in_(course_ids))
    total_students = (await db.execute(enroll_stmt)).scalar() or 0
    
    # 4. Recent Viva Results
    viva_stmt = (
        select(VivaResult, User.name, VivaAssessment.title)
        .join(User, VivaResult.student_id == User.id)
        .join(VivaAssessment, VivaResult.assessment_id == VivaAssessment.id)
        .where(VivaAssessment.course_id.in_(course_ids))
        .order_by(VivaResult.created_at.desc())
        .limit(10)
    )
    recent_vivas = (await db.execute(viva_stmt)).all()
    
    return {
        "avg_mastery": round(avg_mastery * 100, 1),
        "total_students": total_students,
        "total_courses": len(courses),
        "recent_results": [
            {
                "id": r.VivaResult.id,
                "student_name": r.name,
                "assessment_title": r.title,
                "grade": r.VivaResult.grade,
                "status": r.VivaResult.status,
                "created_at": r.VivaResult.created_at.isoformat()
            }
            for r in recent_vivas
        ]
    }

@router.get("/viva/results/{result_id}")
async def get_viva_report(
    result_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch detailed AI report for a specific student's Viva."""
    check_professor(current_user)
    from app.models.database import VivaResult, User, VivaAssessment
    
    stmt = (
        select(VivaResult, User.name, User.email, VivaAssessment.title)
        .join(User, VivaResult.student_id == User.id)
        .join(VivaAssessment, VivaResult.assessment_id == VivaAssessment.id)
        .where(VivaResult.id == result_id)
    )
    res = (await db.execute(stmt)).first()
    if not res:
        raise HTTPException(status_code=404, detail="Result not found")
        
    return {
        "id": res.VivaResult.id,
        "student_name": res.name,
        "student_email": res.email,
        "assessment_title": res.title,
        "grade": res.VivaResult.grade,
        "report": json.loads(res.VivaResult.report_json),
        "created_at": res.VivaResult.created_at.isoformat()
    }
