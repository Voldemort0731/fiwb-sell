"""
Chat Router — Thread management + streaming message endpoint
Uses the new intelligence module (RetrievalOrchestrator + PromptArchitect)
ported from the reference fiwb-mvp architecture.
"""
from __future__ import annotations
import json
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from pydantic import BaseModel
from app.models.database import get_db, ChatThread, ChatMessage, User, Material, AsyncSessionLocal
from app.utils.dependencies import get_current_user
from app.services.openai_service import (
    triage_query, synthesize_memory, contextualize_query, stream_llm_response, extract_mastery_from_chat
)
from app.intelligence.retrieval import RetrievalOrchestrator
from app.intelligence.prompt_architect import PromptArchitect
from app.intelligence.ms_client import get_ms_client
import os
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────
class ThreadCreate(BaseModel):
    title: str = "New Chat"


class MessageSend(BaseModel):
    thread_id: int
    content: str
    attachment_name: str = None
    image_base64: str = None
    viewer_context: dict = None  # {docId, pageNumber} snapshot from frontend


class MessageRegenerate(BaseModel):
    thread_id: int
    message_id: int
    new_content: str = None


class ThreadUpdate(BaseModel):
    title: Optional[str] = None
    folder_name: Optional[str] = None

class FolderUpdate(BaseModel):
    old_name: str
    new_name: str

class FolderMove(BaseModel):
    source_folder: str
    target_folder: Optional[str] # If empty, moves to root


# ── Threads ───────────────────────────────────────────────────────────────
@router.get("/threads")
async def list_threads(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatThread)
        .where(ChatThread.user_id == current_user.id)
        .order_by(ChatThread.updated_at.desc())
    )
    threads = result.scalars().all()
    return [{
        "id": t.id, 
        "title": t.title, 
        "folder_name": t.folder_name,
        "updated_at": t.updated_at.isoformat()
    } for t in threads]


@router.post("/threads")
async def create_thread(
    body: ThreadCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    thread = ChatThread(user_id=current_user.id, title=body.title)
    db.add(thread)
    await db.commit()
    await db.refresh(thread)
    return {"id": thread.id, "title": thread.title}


@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatThread).where(ChatThread.id == thread_id, ChatThread.user_id == current_user.id)
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
        
    # Delete associated memories from Memsapien
    sm = get_ms_client()
    asyncio.create_task(sm.delete_thread_memories(user_email=current_user.email, thread_id=thread_id))
        
    await db.delete(thread)
    await db.commit()
    return {"ok": True}


@router.patch("/threads/{thread_id}")
async def patch_thread(
    thread_id: int,
    body: ThreadUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatThread).where(ChatThread.id == thread_id, ChatThread.user_id == current_user.id)
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
        
    if body.title is not None:
        thread.title = body.title
    if body.folder_name is not None:
        # If frontend explicitly passes empty string, it removes it from a folder
        thread.folder_name = body.folder_name if body.folder_name else None
        
    thread.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "id": thread.id, "title": thread.title, "folder_name": thread.folder_name}


@router.patch("/threads/folders/rename")
async def rename_folder(
    body: FolderUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Perform atomic bulk update for all threads in this exact folder
    await db.execute(
        update(ChatThread)
        .where(ChatThread.user_id == current_user.id, ChatThread.folder_name == body.old_name)
        .values(folder_name=body.new_name)
    )

    # RECURSIVE: Update all sub-paths (e.g., A/B -> C/B)
    old_prefix = body.old_name + "/"
    new_prefix = body.new_name + "/"
    
    # We use SQLite's replace function via func.replace
    await db.execute(
        update(ChatThread)
        .where(ChatThread.user_id == current_user.id, ChatThread.folder_name.like(old_prefix + "%"))
        .values(folder_name=func.replace(ChatThread.folder_name, old_prefix, new_prefix))
    )

    await db.commit()
    return {"ok": True, "old_name": body.old_name, "new_name": body.new_name}


@router.patch("/threads/folders/move")
async def move_folder(
    body: FolderMove,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    source = body.source_folder
    target = body.target_folder
    
    # Extract the basename of the source folder (e.g., "Physics" from "Science/Physics")
    source_basename = source.split("/")[-1]
    
    if not target:
        # Move to root
        new_base_path = source_basename
    else:
        # Move into target
        new_base_path = f"{target}/{source_basename}"

    if source == new_base_path:
        return {"ok": True, "message": "No move necessary"}

    # 1. Update the folder itself
    await db.execute(
        update(ChatThread)
        .where(ChatThread.id == thread_id, ChatThread.user_id == current_user.id)
        .values(folder_name=new_base_path)
    )

    # 2. Update sub-chats (Physics/Quantum -> Science/Physics/Quantum)
    source_prefix = source + "/"
    new_prefix = new_base_path + "/"
    
    await db.execute(
        update(ChatThread)
        .where(ChatThread.user_id == current_user.id, ChatThread.folder_name.like(source_prefix + "%"))
        .values(folder_name=func.replace(ChatThread.folder_name, source_prefix, new_prefix))
    )

    await db.commit()
    return {"ok": True, "source": source, "destination": new_base_path}


@router.get("/threads/{thread_id}/messages")
async def get_messages(
    thread_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    thread_res = await db.execute(
        select(ChatThread).where(ChatThread.id == thread_id, ChatThread.user_id == current_user.id)
    )
    if not thread_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Thread not found")

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.created_at)
    )
    msgs = result.scalars().all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "attachment_name": m.attachment_name,
            "image_base64": m.image_base64,
            "citations": json.loads(m.citations) if getattr(m, 'citations', None) else [],
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]


# ── Viva / Assignments ────────────────────────────────────────────────
@router.post("/assignments/{assessment_id}/start")
async def start_viva_assessment(
    assessment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a new AI Viva thread for a specific assessment."""
    from app.models.database import VivaAssessment, Course
    
    # 1. Fetch assessment
    res = await db.execute(select(VivaAssessment).where(VivaAssessment.id == assessment_id))
    assessment = res.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
        
    # 2. Create dedicated viva thread
    thread = ChatThread(
        user_id=current_user.id, 
        title=f"Viva: {assessment.title}",
        thread_type="viva",
        viva_assessment_id=assessment_id
    )
    db.add(thread)
    await db.commit()
    await db.refresh(thread)
    
    # 3. Create the initial prompt (Assistant opens the thread)
    initial_prompt = f"Welcome to the Viva session for '{assessment.title}'. I will be evaluating your understanding of the following objectives: {assessment.objective}. Let's begin. Can you explain your core understanding of this topic?"
    
    ai_msg = ChatMessage(
        thread_id=thread.id,
        role="assistant",
        content=initial_prompt
    )
    db.add(ai_msg)
    await db.commit()
    
    return {"thread_id": thread.id, "title": thread.title}


@router.get("/assignments")
async def list_assignments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List assessments available to the student."""
    from app.models.database import VivaAssessment, Course, PerformanceMetric, Enrollment
    
    # Filter by student enrollment
    res = await db.execute(
        select(VivaAssessment, Course.name)
        .join(Course, VivaAssessment.course_id == Course.id)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(Enrollment.student_id == current_user.id)
    )
    rows = res.all()
    
    assignments = []
    for ass, course_name in rows:
        met_res = await db.execute(select(PerformanceMetric).where(
            PerformanceMetric.user_id == current_user.id,
            PerformanceMetric.metric_type == "viva_score",
            PerformanceMetric.course_id == ass.course_id
        ))
        met = met_res.scalar_one_or_none()
        
        assignments.append({
            "id": ass.id,
            "title": ass.title,
            "course_name": course_name,
            "objectives_count": len(ass.objective.split(',')),
            "status": "completed" if met else "pending",
            "score": met.value if met else None
        })
    return assignments


@router.get("/assignments/{assessment_id}/report")
async def get_viva_report_student(
    assessment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch student's own detailed AI report for a completed Viva."""
    from app.models.database import VivaResult, VivaAssessment
    
    stmt = (
        select(VivaResult, VivaAssessment.title)
        .join(VivaAssessment, VivaResult.assessment_id == VivaAssessment.id)
        .where(VivaResult.student_id == current_user.id, VivaResult.assessment_id == assessment_id)
        .order_by(VivaResult.created_at.desc())
        .limit(1)
    )
    res = (await db.execute(stmt)).first()
    if not res:
        raise HTTPException(status_code=404, detail="Result not found. Complete the Viva first.")
        
    return {
        "id": res.VivaResult.id,
        "assessment_title": res.title,
        "grade": res.VivaResult.grade,
        "report": json.loads(res.VivaResult.report_json),
        "created_at": res.VivaResult.created_at.isoformat()
    }


# ── Streaming Chat ────────────────────────────────────────────────────────
@router.post("/send")
async def send_message(
    body: MessageSend,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a message and stream the Socratic AI response via SSE."""
    thread_res = await db.execute(
        select(ChatThread).where(
            ChatThread.id == body.thread_id,
            ChatThread.user_id == current_user.id,
        )
    )
    thread = thread_res.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Save user message
    user_msg = ChatMessage(
        thread_id=body.thread_id, 
        role="user", 
        content=body.content,
        attachment_name=body.attachment_name,
        image_base64=body.image_base64
    )
    db.add(user_msg)
    await db.commit()

    return await _generate_chat_response(body.thread_id, body.content, body.image_base64, current_user, db, user_msg.id, viewer_context=body.viewer_context)


@router.post("/regenerate")
async def regenerate_message(
    body: MessageRegenerate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit a past user message, delete subsequent turns & memories, and regenerate response."""
    # 1. Fetch thread and original message (already exists, so we just pass body.message_id)
    res = await db.execute(select(ChatThread).where(ChatThread.id == body.thread_id, ChatThread.user_id == current_user.id))
    thread = res.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    res = await db.execute(select(ChatMessage).where(ChatMessage.id == body.message_id, ChatMessage.thread_id == body.thread_id))
    target_msg = res.scalar_one_or_none()
    if not target_msg or target_msg.role != "user":
        raise HTTPException(status_code=400, detail="Invalid message to regenerate")

    # 2. Identify all messages to delete (all AFTER target_msg)
    res = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.thread_id == body.thread_id, ChatMessage.created_at > target_msg.created_at)
    )
    to_delete = res.scalars().all()

    # 3. Cleanup Memsapien for assistant responses being deleted
    sm = get_ms_client()
    for msg in to_delete:
        if msg.role == "assistant":
            # Fire-and-forget deletion
            asyncio.create_task(sm.delete_message_memories(current_user.email, msg.id))

    # 4. Delete from DB
    for msg in to_delete:
        await db.delete(msg)
    
    # 5. Update target message
    target_msg.content = body.new_content
    await db.commit()
    return await _generate_chat_response(body.thread_id, body.new_content, None, current_user, db, body.message_id)


async def _generate_chat_response(thread_id: int, content: str, image_base64: Optional[str], current_user: User, db: AsyncSession, user_msg_id: int, viewer_context: dict = None):
    """Internal helper to stream GPT response and handle memory synthesis."""
    # Fetch thread for context
    res = await db.execute(select(ChatThread).where(ChatThread.id == thread_id))
    thread = res.scalar_one_or_none()

    # Build conversation history
    hist_res = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.created_at)
    )
    history = [{"role": m.role, "content": m.content} for m in hist_res.scalars().all()]

    # We'll use a shared state container to pass data from the generator back to the saving logic
    class StreamState:
        def __init__(self):
            self.full_response = ""
            self.citation_map: dict[str, dict] = {}

    state = StreamState()

    async def event_stream():
        try:
            query = content
            user_email = current_user.email

            # ── Step 0: Check Thread Type ──────────────────────────────────
            is_viva = thread.thread_type == "viva"
            viva_objective = None
            if is_viva and thread.viva_assessment_id:
                from app.models.database import VivaAssessment
                v_res = await db.execute(select(VivaAssessment).where(VivaAssessment.id == thread.viva_assessment_id))
                v_ass = v_res.scalar_one_or_none()
                if v_ass:
                    viva_objective = v_ass.objective

            # ── Step 1: Triage + retrieve context ──────────────────────────
            greetings = {"hello", "hi", "hey", "thanks", "thank you", "bye"}
            is_greeting = query.strip().lower() in greetings
            query_type = "viva" if is_viva else ("general_chat" if is_greeting else "academic_question")

            # ── Record Engagement (Background) ─────────────────────────────
            async def _record_hits(chunks):
                from app.models.database import EngagementHit, AsyncSessionLocal
                async with AsyncSessionLocal() as db_hit:
                    for chunk in chunks:
                        meta = chunk.get("metadata", {})
                        mat_id = meta.get("material_id")
                        if mat_id:
                            hit = EngagementHit(
                                material_id=int(mat_id),
                                page_number=meta.get("page_number"),
                                chunk_index=meta.get("chunk_index")
                            )
                            db_hit.add(hit)
                    await db_hit.commit()

            # ── Mind Map Intent Detection ──────────────────────────────────────
            import re as _re
            _q = query.strip()
            mm_open = _re.search(r'(open|show|generate|create|make|build|display).*(mind.?map|concept.map)|(mind.?map).*(this|it|doc|document|open|show|me)|(map this doc)', _q, _re.I)
            mm_regen = _re.search(r'(regenerate|refresh|redo|reset|rebuild).*(mind.?map|map)', _q, _re.I)
            mm_close = _re.search(r'(close|hide|dismiss).*(mind.?map|map)', _q, _re.I)
            mm_edit = _re.search(r'(add|remove|delete|rename|move|change|update|modify|edit|put|insert).*(node|branch|connection|summary|topic|concept|link|edge|map)', _q, _re.I) or _re.search(r'mind.?map.*(add|remove|change|edit|update)', _q, _re.I)
            mm_undo = bool(_re.match(r'^undo\s*$', _q, _re.I))
            _active_doc_id = viewer_context.get("docId") if viewer_context else None

            if mm_close:
                yield f"data: {json.dumps({'type': 'mind_map_action', 'action': 'close'})}\n\n"
                yield f"data: {json.dumps({'type': 'chunk', 'content': 'Mind map closed.'})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return
            if mm_undo:
                yield f"data: {json.dumps({'type': 'mind_map_action', 'action': 'undo', 'docId': _active_doc_id})}\n\n"
                yield f"data: {json.dumps({'type': 'chunk', 'content': 'Reverting the last mind map edit…'})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return
            if mm_regen:
                yield f"data: {json.dumps({'type': 'mind_map_action', 'action': 'regenerate', 'docId': _active_doc_id})}\n\n"
                yield f"data: {json.dumps({'type': 'chunk', 'content': 'Regenerating mind map…'})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return
            if mm_edit:
                yield f"data: {json.dumps({'type': 'mind_map_action', 'action': 'edit', 'docId': _active_doc_id, 'instruction': _q})}\n\n"
                _edit_msg = f'Applying edit: “{_q}”'
                yield f"data: {json.dumps({'type': 'chunk', 'content': _edit_msg})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return
            if mm_open:
                resolved_doc_id = _active_doc_id

                # If no doc is open, try to find one by name mentioned in the query
                if not resolved_doc_id:
                    _stripped = _re.sub(
                        r'\b(generate|create|show|open|make|build|display|mind.?map|concept.map|on|for|about|the|a)\b\s*',
                        ' ', _q, flags=_re.I
                    ).strip()

                    if _stripped:
                        # Split into keywords and filter out trivial noise
                        keywords = [k for k in _re.split(r'[\s._-]+', _stripped) if len(k) > 1]
                        if keywords:
                            from sqlalchemy import and_
                            filters = [Material.title.ilike(f"%{k}%") for k in keywords]
                            _mat_res = await db.execute(
                                select(Material).where(
                                    Material.user_id == current_user.id,
                                    and_(*filters)
                                ).order_by(Material.created_at.desc()).limit(1)
                            )

                            _found_mat = _mat_res.scalar_one_or_none()
                            if _found_mat:
                                resolved_doc_id = str(_found_mat.id)


                yield f"data: {json.dumps({'type': 'mind_map_action', 'action': 'open', 'docId': resolved_doc_id})}\n\n"
                if resolved_doc_id:
                    _msg = f'Generating mind map\u2026'
                else:
                    _msg = 'I couldn\u2019t find that document. Open it in the viewer first, then ask me to mind map it.'
                _msg_with_tag = f"{_msg} [[mindmap:{resolved_doc_id}]]" if resolved_doc_id else _msg
                yield f"data: {json.dumps({'type': 'chunk', 'content': _msg_with_tag})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return


            orchestrator = RetrievalOrchestrator(user_email)

            logger.info(f"[Chat] Triggering retrieval for query: {query}")
            context = await orchestrator.retrieve_context(
                query=query,
                query_type=query_type,
                history=history[:-1],
            )

            # Strip out legacy chunks that lack a database material_id so the AI does not hallucinate fake citations
            raw_course_chunks = context.get("course_context", [])
            course_chunks = [c for c in raw_course_chunks if c.get("metadata", {}).get("material_id")]
            
            # ── Inject exact Viewer Context ─────────────────────────────────────
            if viewer_context and viewer_context.get("docId") and viewer_context.get("pageNumber"):
                try:
                    mat_id = int(viewer_context["docId"])
                    page_num = int(viewer_context["pageNumber"])
                    mat_res = await db.execute(select(Material).where(Material.id == mat_id, Material.user_id == current_user.id))
                    active_mat = mat_res.scalar_one_or_none()
                    if active_mat and active_mat.full_text:
                        raw_pages = active_mat.full_text.split("\x0c") if "\x0c" in active_mat.full_text else [active_mat.full_text]
                        if 1 <= page_num <= len(raw_pages):
                            page_text = raw_pages[page_num - 1].strip()
                            if page_text:
                                logger.info(f"[Chat] Injecting exact viewer context: Mat {mat_id} Page {page_num}")
                                
                                # Filter out any duplicate chunk from Memsapien that matches this exact page
                                course_chunks = [
                                    c for c in course_chunks 
                                    if str(c.get("metadata", {}).get("material_id")) != str(mat_id) 
                                    or int(c.get("metadata", {}).get("page_number", 0)) != page_num
                                ]
                                
                                synthetic_chunk = {
                                    "content": f"[CURRENTLY VIEWED PAGE] File: {active_mat.title}\nPage: {page_num}\n\n{page_text}",
                                    "metadata": {
                                        "material_id": str(mat_id),
                                        "page_number": page_num,
                                        "title": active_mat.title,
                                        "type": active_mat.material_type,
                                        "source": active_mat.source,
                                        "source_link": active_mat.source_link
                                    }
                                }
                                course_chunks.insert(0, synthetic_chunk)
                except Exception as e:
                    logger.error(f"[Chat] Failed to inject viewer context: {e}")

            final_citations = []
            
            for idx, chunk in enumerate(course_chunks):
                meta = chunk.get("metadata", {})
                raw_mat_id = meta.get("material_id")
                
                # Broaden filter: accept any non-null material_id
                if not raw_mat_id:
                    continue
                
                material_id_str = str(raw_mat_id)
                passage_id = f"{material_id_str}:{idx}"
                title = meta.get("title") or meta.get("file_name") or "Document"
                
                citation_obj = {
                    "docId": material_id_str,
                    "passageId": passage_id,
                    "pageNumber": int(meta.get("page_number", 1)),
                    "highlightText": (chunk.get("content") or "")[:400],
                    "label": title[:40],
                    "type": meta.get("type", "academic_material"),
                    "source": meta.get("source", "drive"),
                    "course": meta.get("course") or "Personal Drive",
                    "sourceLink": meta.get("source_link") or None,
                }
                state.citation_map[passage_id] = citation_obj
                final_citations.append(citation_obj)
                
                # Stamp passage_id into the chunk so prompt_architect can annotate it
                chunk.setdefault("metadata", {})["passage_id"] = passage_id

            print(f"[Chat] Snapshot taken: {len(final_citations)} citations ready for prompt and DB.")
            logger.info(f"[Chat] Snapshot taken: {len(final_citations)} citations ready for prompt and DB.")

            # Record engagement hit in background
            asyncio.create_task(_record_hits(course_chunks))

            # ── Viewer context injection ────────────────────────────────────
            viewer_hint = ""
            if viewer_context and viewer_context.get("docId") and viewer_context.get("pageNumber"):
                viewer_hint = (
                    f"\n\n[VIEWER CONTEXT] The student is currently viewing page "
                    f"{viewer_context['pageNumber']} of document with ID "
                    f"'{viewer_context['docId']}'. If their question refers to the "
                    f"document, answer using content from that page."
                )

            # Metadata packet to communicate user_message_id
            yield f"data: {json.dumps({'type': 'metadata', 'user_message_id': user_msg_id})}\n\n"
            yield f"data: {json.dumps({'type': 'triage', 'intent': query_type})}\n\n"
            
            if final_citations:
                yield f"data: {json.dumps({'type': 'citations', 'data': final_citations})}\n\n"

            # ── Step 2: Build structured messages (Dual Grounding) ──────────
            messages = PromptArchitect.build_messages(
                user_query=query + viewer_hint,
                retrieved_chunks=course_chunks,
                assistant_knowledge=context.get("assistant_knowledge", []),
                chat_assets=context.get("chat_assets", []),
                memories=context.get("memories", []),
                profile=context.get("profile", []),
                history=history[:-1],
                query_type=query_type,
                image_base64=image_base64,
                citation_map=state.citation_map,
                mastery={
                    **(context.get("mastery") or {}),
                    "viva_objective": viva_objective
                },
            )
            
            # ── Step 3: Stream Gemini response ─────────────────────────────
            async for text in stream_llm_response(messages):
                state.full_response += text
                yield f"data: {json.dumps({'type': 'chunk', 'content': text})}\n\n"

            # ── Step 4: High-Priority DB Persistence ─────────────────────────
            try:
                # Capture the original user query for title logic
                user_query_for_title = content if 'content' in locals() else "Conversation"
                
                async with AsyncSessionLocal() as db_save:
                    async with db_save.begin():
                        citations_json = json.dumps(final_citations) if final_citations else None
                        print(f"[Chat] COMMIT: Assistant message | Bytes: {len(state.full_response)} | Citations: {len(final_citations)}")
                        logger.info(f"[Chat] COMMIT: Saving message with {len(final_citations)} citations to DB")
                        
                        ai_msg = ChatMessage(
                            thread_id=thread_id, 
                            role="assistant", 
                            content=state.full_response,
                            citations=citations_json
                        )
                        db_save.add(ai_msg)
                        await db_save.flush()
                        ai_msg_id = ai_msg.id
                        
                        # Set thread title if it's currently default
                        res_t = await db_save.execute(select(ChatThread).where(ChatThread.id == thread_id))
                        thread_rec = res_t.scalar_one_or_none()
                        if thread_rec and thread_rec.title == "New Chat":
                            thread_rec.title = user_query_for_title[:60] + ("..." if len(user_query_for_title) > 60 else "")
                            thread_rec.updated_at = datetime.now(timezone.utc)

                    # Start background memory tasks
                    if ai_msg_id:
                        asyncio.create_task(
                            _synthesize_and_store(thread_id, ai_msg_id, user_query_for_title, state.full_response, current_user.email)
                        )
            except Exception as db_err:
                print(f"[Chat] CRITICAL DB ERROR: {db_err}")
                logger.error(f"[Chat] CRITICAL: DB save failed: {db_err}")

            # ── Stream End Protocol ──────────────────────────────────────────
            yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            print(f"[Chat] STREAM EXCEPTION: {e}")
            logger.error(f"[Chat] Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        except asyncio.CancelledError:
            print("[Chat] CLIENT DISCONNECTED - Stream Cancelled")
            # We still try to save if not already saved, but Step 4 is usually hit before closure message is handled.
            # In a true cancellation during Step 3, Step 4 is skipped. 
            # To fix this, we should move Step 4 into a Shield or Finalizer if needed.
            logger.warning("[Chat] Client disconnected, stream context ending.")
            raise
        finally:
            pass

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _synthesize_and_store(thread_id: int, message_id: int, user_msg: str, ai_response: str, email: str):
    """Background task: synthesize conversation into a Digital Twin memory."""
    try:
        memory_doc = await synthesize_memory(user_msg, ai_response, email)
        if memory_doc:
            sm = get_ms_client()
            await sm.add_document(
                content=memory_doc,
                metadata={
                    "type": "enhanced_memory",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "thread_id": str(thread_id),
                    "message_id": str(message_id),
                },
                user_email=email,
                title="Learning Memory",
            )
            
        # ── Step 2: Extract Mastery ──────────────────────────────────
        mastery_data = await extract_mastery_from_chat(user_msg, ai_response)
        if mastery_data:
            from app.models.database import PerformanceMetric, User
            async with AsyncSessionLocal() as db_m:
                user_res = await db_m.execute(select(User).where(User.email == email))
                user = user_res.scalar_one_or_none()
                if user:
                    for m in mastery_data:
                        concept = m.get("concept")
                        score = m.get("score")
                        if concept and score is not None:
                            metric = PerformanceMetric(
                                user_id=user.id,
                                course_id=1, # Default or link to thread course
                                metric_type="concept_mastery",
                                value=float(score),
                                concept=concept
                            )
                            db_m.add(metric)
                    await db_m.commit()
        # ── Check for Viva Completion ──────────────────────────────────
        if "[VIVA_COMPLETE" in ai_response:
            from app.utils.viva_evaluator import process_viva_completion
            asyncio.create_task(process_viva_completion(thread_id, email))

    except Exception as e:
        print(f"[Memory Synthesis] Failed: {e}")


# ── File Upload ───────────────────────────────────────────────────────────
def _split_pdf_pages(reader) -> list[dict]:
    """Extract a list of {page_number, text} dicts from a PdfReader."""
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append({"page_number": i + 1, "text": text.strip()})
    return pages or [{"page_number": 1, "text": ""}]


@router.post("/upload")
async def upload_file(
    thread_id: int = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF/text file into the chat context and index to Memsapien per-page."""
    import io
    content_bytes = await file.read()
    sm = get_ms_client()
    indexed = False

    if file.content_type == "application/pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content_bytes))
        pages = _split_pdf_pages(reader)
        total_pages = len(pages)
        for page in pages:
            if not page["text"]:
                continue
            page_title = f"{file.filename} (p.{page['page_number']})" if total_pages > 1 else file.filename
            await sm.add_document(
                content=f"File: {file.filename}\nPage: {page['page_number']}\n\n{page['text'][:10000]}",
                metadata={
                    "type": "chat_upload",
                    "file_name": file.filename,
                    "thread_id": str(thread_id),
                    "page_number": page["page_number"],
                    "total_pages": total_pages,
                },
                user_email=current_user.email,
                title=page_title,
            )
        indexed = total_pages > 0

    elif file.content_type and file.content_type.startswith("text/"):
        text_content = content_bytes.decode("utf-8", errors="replace")
        if text_content.strip():
            await sm.add_document(
                content=f"File: {file.filename}\n\n{text_content[:10000]}",
                metadata={
                    "type": "chat_upload",
                    "file_name": file.filename,
                    "thread_id": str(thread_id),
                    "page_number": 1,
                    "total_pages": 1,
                },
                user_email=current_user.email,
                title=file.filename,
            )
            indexed = True
    else:
        # Image or unsupported — single doc, no page metadata needed
        await sm.add_document(
            content=f"[Image file: {file.filename}]",
            metadata={"type": "chat_upload", "file_name": file.filename, "thread_id": str(thread_id)},
            user_email=current_user.email,
            title=file.filename,
        )
        indexed = True
    
    # NEW: Store binary content in local DB for autonomous viewing
    new_mat = Material(
        user_id=current_user.id,
        title=file.filename,
        material_type="file",
        source="chat_upload",
        file_content=content_bytes,
        mime_type=file.content_type or "application/octet-stream",
        full_text=text_content if 'text_content' in locals() else None,
        indexed_in_memsapien=indexed
    )
    db.add(new_mat)
    await db.commit()
    await db.refresh(new_mat)

    return {"ok": True, "filename": file.filename, "indexed": indexed, "material_id": new_mat.id}
