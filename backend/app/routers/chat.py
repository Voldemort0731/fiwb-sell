"""
Chat Router — Thread management + streaming message endpoint
Uses the new intelligence module (RetrievalOrchestrator + PromptArchitect)
ported from the reference fiwb-mvp architecture.
"""
import json
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.models.database import get_db, ChatThread, ChatMessage, User
from app.utils.dependencies import get_current_user
from app.services.openai_service import synthesize_memory
from app.intelligence.retrieval import RetrievalOrchestrator
from app.intelligence.prompt_architect import PromptArchitect
from app.intelligence.sm_client import get_sm_client
from openai import AsyncOpenAI
import os
import logging

logger = logging.getLogger("uvicorn.error")

router = APIRouter()
_openai_client = None


def get_openai():
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _openai_client


# ── Schemas ──────────────────────────────────────────────────────────────
class ThreadCreate(BaseModel):
    title: str = "New Chat"


class MessageSend(BaseModel):
    thread_id: int
    content: str
    attachment_name: str = None
    image_base64: str = None


class MessageRegenerate(BaseModel):
    thread_id: int
    message_id: int
    new_content: str = None


class ThreadRename(BaseModel):
    title: str


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
    return [{"id": t.id, "title": t.title, "updated_at": t.updated_at.isoformat()} for t in threads]


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
        
    # Delete associated memories from Supermemory
    sm = get_sm_client()
    asyncio.create_task(sm.delete_thread_memories(user_email=current_user.email, thread_id=thread_id))
        
    await db.delete(thread)
    await db.commit()
    return {"ok": True}


@router.patch("/threads/{thread_id}")
async def rename_thread(
    thread_id: int,
    body: ThreadRename,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatThread).where(ChatThread.id == thread_id, ChatThread.user_id == current_user.id)
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
        
    thread.title = body.title
    thread.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "id": thread.id, "title": thread.title}


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
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]


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

    return await _generate_chat_response(body.thread_id, body.content, body.image_base64, current_user, db, user_msg.id)


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

    # 3. Cleanup Supermemory for assistant responses being deleted
    sm = get_sm_client()
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


async def _generate_chat_response(thread_id: int, content: str, image_base64: str | None, current_user: User, db: AsyncSession, user_msg_id: int):
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

    async def event_stream():
        full_response = ""
        try:
            query = content
            user_email = current_user.email

            # ── Step 1: Triage + retrieve context ──────────────────────────
            greetings = {"hello", "hi", "hey", "thanks", "thank you", "bye"}
            is_greeting = query.strip().lower() in greetings
            query_type = "general_chat" if is_greeting else "academic_question"

            orchestrator = RetrievalOrchestrator(user_email)
            logger.info(f"[Chat] Triggering retrieval for query: {query}")
            context = await orchestrator.retrieve_context(
                query=query,
                query_type=query_type,
                history=history[:-1],
            )

            # Metadata packet to communicate user_message_id
            yield f"data: {json.dumps({'type': 'metadata', 'user_message_id': user_msg_id})}\n\n"
            yield f"data: {json.dumps({'type': 'triage', 'intent': query_type})}\n\n"

            # ── Step 2: Build structured messages (Dual Grounding) ──────────
            messages = PromptArchitect.build_messages(
                user_query=query,
                retrieved_chunks=context.get("course_context", []),
                assistant_knowledge=context.get("assistant_knowledge", []),
                chat_assets=context.get("chat_assets", []),
                memories=context.get("memories", []),
                profile=context.get("profile", []),
                history=history[:-1],
                query_type=query_type,
                image_base64=image_base64,
            )
            
            # ── Step 3: Stream GPT-4o response ─────────────────────────────
            client = get_openai()
            stream = await client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                stream=True,
                max_tokens=2000,
            )

            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    full_response += delta.content
                    yield f"data: {json.dumps({'type': 'chunk', 'content': delta.content})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            full_response = f"I encountered an error: {str(e)}"

        # Save AI message & update thread title
        async with db.begin():
            ai_msg = ChatMessage(
                thread_id=thread_id, role="assistant", content=full_response
            )
            db.add(ai_msg)
            await db.flush() # Ensure we get the ID
            ai_msg_id = ai_msg.id
            
            if thread and thread.title == "New Chat":
                thread.title = content[:60] + ("..." if len(content) > 60 else "")
            if thread:
                thread.updated_at = datetime.now(timezone.utc)

        # Fire-and-forget memory synthesis
        asyncio.create_task(
            _synthesize_and_store(thread_id, ai_msg_id, content, full_response, current_user.email)
        )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _synthesize_and_store(thread_id: int, message_id: int, user_msg: str, ai_response: str, email: str):
    """Background task: synthesize conversation into a Digital Twin memory."""
    try:
        memory_doc = await synthesize_memory(user_msg, ai_response, email)
        if memory_doc:
            sm = get_sm_client()
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
    except Exception as e:
        print(f"[Memory Synthesis] Failed: {e}")


# ── File Upload ───────────────────────────────────────────────────────────
@router.post("/upload")
async def upload_file(
    thread_id: int = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF/text file into the chat context and index to Supermemory."""
    content_bytes = await file.read()
    text_content = ""

    if file.content_type == "application/pdf":
        import io
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content_bytes))
        text_content = "\n".join(page.extract_text() or "" for page in reader.pages)
    elif file.content_type and file.content_type.startswith("text/"):
        text_content = content_bytes.decode("utf-8", errors="replace")
    else:
        text_content = f"[Image file: {file.filename}]"

    if text_content.strip():
        sm = get_sm_client()
        await sm.add_document(
            content=f"File: {file.filename}\n\n{text_content[:10000]}",
            metadata={
                "type": "chat_upload",
                "file_name": file.filename,
                "thread_id": str(thread_id),
            },
            user_email=current_user.email,
            title=file.filename,
        )

    return {"ok": True, "filename": file.filename, "indexed": bool(text_content.strip())}
