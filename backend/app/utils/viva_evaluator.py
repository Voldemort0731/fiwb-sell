import json
import logging
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.database import User, ChatThread, ChatMessage, PerformanceMetric, AsyncSessionLocal

logger = logging.getLogger(__name__)

async def process_viva_completion(thread_id: int, user_email: str):
    """
    Called when a Viva session is completed.
    Uses AI to analyze the transcript, generate a detailed report, and store the result.
    """
    from app.services.openai_service import evaluate_viva_transcript
    from app.models.database import VivaResult, VivaAssessment
    
    async with AsyncSessionLocal() as db:
        try:
            # 1. Fetch thread and messages
            res = await db.execute(select(ChatThread).where(ChatThread.id == thread_id))
            thread = res.scalar_one_or_none()
            if not thread or thread.thread_type != "viva":
                return

            msg_res = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.thread_id == thread_id)
                .order_by(ChatMessage.created_at)
            )
            messages = msg_res.scalars().all()
            transcript = [{"role": m.role, "content": m.content} for m in messages]
            
            # 2. AI Evaluation
            report = await evaluate_viva_transcript(transcript)
            grade = float(report.get("grade", 0))
            
            # 3. Fetch Assessment for course_id
            course_id = 1
            if thread.viva_assessment_id:
                v_res = await db.execute(select(VivaAssessment.course_id).where(VivaAssessment.id == thread.viva_assessment_id))
                cid = v_res.scalar()
                if cid: course_id = cid

            # 4. Update User Profile & Metrics
            user_res = await db.execute(select(User).where(User.email == user_email))
            user = user_res.scalar_one_or_none()
            if user:
                # Save Viva Result (Report + Grade)
                v_result = VivaResult(
                    assessment_id=thread.viva_assessment_id,
                    student_id=user.id,
                    grade=grade,
                    report_json=json.dumps(report)
                )
                db.add(v_result)
                
                # Save Performance Metrics
                concept = thread.title.replace("Viva: ", "")
                db.add(PerformanceMetric(
                    user_id=user.id,
                    course_id=course_id,
                    metric_type="viva_score",
                    value=grade,
                    concept=concept
                ))
                db.add(PerformanceMetric(
                    user_id=user.id,
                    course_id=course_id,
                    metric_type="concept_mastery",
                    value=grade / 100.0,
                    concept=concept
                ))
                
                await db.commit()
                logger.info(f"Viva evaluation stored for {user_email}. Grade: {grade}%")
                
        except Exception as e:
            logger.error(f"Error processing viva completion: {e}")
            await db.rollback()
