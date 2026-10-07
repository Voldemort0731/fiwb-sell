"""
Practice Quiz Router - Student Adaptive & Evolving Practice System
Generates, tracks, evaluates, and updates mastery for student practice quizzes.
"""
import json
import logging
from typing import List, Dict, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.models.database import (
    get_db, User, Course, Material, Enrollment, PerformanceMetric,
    PracticeQuiz, PracticeQuizAttempt, ChatThread, ChatMessage
)
from app.utils.dependencies import get_current_user
from app.services.openai_service import get_openai_client
from app.intelligence.retrieval import RetrievalOrchestrator

logger = logging.getLogger("uvicorn.error")
router = APIRouter()


class GenerateQuizRequest(BaseModel):
    course_id: Optional[int] = None
    quiz_type: str = "weak_concepts"  # "weak_concepts" or "topic_mastery"
    custom_concept: Optional[str] = None
    difficulty: str = "adaptive"  # "adaptive", "foundational", "intermediate", "advanced"
    question_count: int = 5
    quiz_mode: str = "standard_quiz"  # "standard_quiz" or "interactive_socratic"


class SubmitQuizRequest(BaseModel):
    answers: Dict[int, int]  # question_id -> selected_option_index (0-based)


@router.get("/recommendations")
async def get_practice_recommendations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Analyzes student's historical performance metrics and enrolled courses.
    Returns weak concepts (< 55% average score), mastered concepts (>= 75%),
    and available course topics for targeted practice.
    """
    # 1. Fetch user's enrolled courses
    enroll_stmt = (
        select(Course)
        .join(Enrollment, Enrollment.course_id == Course.id)
        .where(Enrollment.student_id == current_user.id)
    )
    res_courses = await db.execute(enroll_stmt)
    courses = res_courses.scalars().all()
    
    courses_list = [
        {"id": c.id, "name": c.name, "section": c.section, "teacher": c.teacher}
        for c in courses
    ]
    course_ids = [c.id for c in courses]

    # 2. Fetch all performance metrics for student
    metrics_stmt = select(PerformanceMetric).where(
        PerformanceMetric.user_id == current_user.id
    )
    res_metrics = await db.execute(metrics_stmt)
    metrics = res_metrics.scalars().all()

    def _normalize_concept_name(c: str) -> str:
        if not c: return "General Understanding"
        cl = c.lower()
        if "recurs" in cl: return "Recursion & Algorithms"
        if "siowa" in cl or "real estate" in cl: return "SIOWA Real Estate"
        if "ai" in cl or "anthropic" in cl or "claude" in cl or "tutor" in cl: return "AI & Intelligent Systems"
        # Truncate overly long fine phrases
        if len(c) > 30 and ":" in c:
            return c.split(":")[0].strip()
        return c.strip()

    # Aggregate by normalized concept
    concept_scores: Dict[str, List[float]] = {}
    for m in metrics:
        raw_c = m.concept or "General Understanding"
        norm_c = _normalize_concept_name(raw_c)
        concept_scores.setdefault(norm_c, []).append(float(m.value))

    weak_concepts = []
    mastered_concepts = []
    
    for concept, scores in concept_scores.items():
        avg_score = sum(scores) / len(scores) if scores else 0.0
        item = {"concept": concept, "avg_score": round(avg_score, 1), "count": len(scores)}
        if avg_score < 55.0:
            weak_concepts.append(item)
        elif avg_score >= 75.0:
            mastered_concepts.append(item)

    weak_concepts.sort(key=lambda x: x["avg_score"])
    mastered_concepts.sort(key=lambda x: x["avg_score"], reverse=True)

    # 3. Extract course topics from materials
    all_topics = []
    if course_ids:
        mats_stmt = select(Material).where(Material.course_id.in_(course_ids))
        res_mats = await db.execute(mats_stmt)
        mats = res_mats.scalars().all()
        for mat in mats:
            all_topics.append({
                "material_id": mat.id,
                "title": mat.title,
                "course_id": mat.course_id,
                "type": mat.material_type
            })

    return {
        "weak_concepts": weak_concepts,
        "mastered_concepts": mastered_concepts,
        "courses": courses_list,
        "available_topics": all_topics
    }


@router.post("/generate")
async def generate_practice_quiz(
    req: GenerateQuizRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates an adaptive, evolving practice quiz using RAG over course materials + LLM.
    """
    target_concepts_list: List[str] = []

    if req.quiz_type == "weak_concepts":
        # Pull student's lowest scoring concepts
        metrics_stmt = select(PerformanceMetric).where(
            PerformanceMetric.user_id == current_user.id
        )
        res_metrics = await db.execute(metrics_stmt)
        metrics = res_metrics.scalars().all()
        
        concept_map: Dict[str, List[float]] = {}
        for m in metrics:
            c_name = m.concept or "General"
            concept_map.setdefault(c_name, []).append(float(m.value))
        
        sorted_concepts = sorted(
            [{"concept": k, "avg": sum(v)/len(v)} for k, v in concept_map.items()],
            key=lambda x: x["avg"]
        )
        target_concepts_list = [sc["concept"] for sc in sorted_concepts[:3]]
        
        if not target_concepts_list:
            target_concepts_list = ["Core Principles", "Fundamental Concepts"]
    else:
        # Topic mastery mode
        if req.custom_concept and req.custom_concept.strip():
            target_concepts_list = [req.custom_concept.strip()]
        else:
            target_concepts_list = ["Selected Topic Mastery"]

    title_concept = ", ".join(target_concepts_list[:2])
    quiz_title = f"Adaptive Practice: {title_concept}" if req.quiz_type == "weak_concepts" else f"Mastery Studio: {title_concept}"

    # Fetch context from course materials using RAG / RetrievalOrchestrator
    retriever = RetrievalOrchestrator(current_user.email)
    context_query = f"Key definitions, formulas, and explanations for {title_concept}"
    retrieved = await retriever.retrieve_context(context_query, query_type="academic_question")
    
    course_context_chunks = retrieved.get("course_context", [])
    context_str = "\n\n".join([f"Source ({c.get('metadata', {}).get('title', 'Doc')}): {c.get('content', '')[:600]}" for c in course_context_chunks[:5]])

    # Build prompt for LLM
    openai_client = get_openai_client()
    
    system_prompt = (
        "You are an expert AI Educator & Adaptive Assessment Architect. "
        "Generate a high-quality practice quiz tailored to the student's learning goals. "
        "Strictly output a valid JSON array of question objects."
    )

    user_prompt = f"""
Course ID: {req.course_id or "General"}
Target Concepts: {json.dumps(target_concepts_list)}
Difficulty: {req.difficulty}
Question Count: {req.question_count}
Quiz Mode: {req.quiz_mode}

Academic Reference Material:
{context_str or "Use foundational academic principles for the specified target concepts."}

Instructions:
1. Generate exactly {req.question_count} questions.
2. For difficulty='adaptive', start with 1-2 diagnostic/foundational questions, then scale to 2-3 application/analysis questions.
3. Each question must have 4 clear multiple-choice options (`options`: list of 4 strings).
4. `correct_index`: integer (0, 1, 2, or 3) pointing to the correct option.
5. Provide a thorough `explanation` detailing why the correct option is right and others are incorrect.
6. Provide a subtle `hint` to guide the student if stuck.
7. Label each question with its broad, document/topic-level `concept` (e.g. 'Recursion & Algorithms' or 'SIOWA Real Estate'). Do NOT create hyper-fine subtopics or fragmented sub-bullets.

Return ONLY a JSON array with this structure:
[
  {{
    "id": 1,
    "question": "What is ...?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_index": 0,
    "explanation": "Option A is correct because...",
    "hint": "Remember that...",
    "concept": "Broad Document / Topic Name"
  }}
]
"""

    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"} if hasattr(openai_client, "chat") else None,
            temperature=0.7
        )
        raw_text = response.choices[0].message.content or "[]"
        
        # Parse JSON
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
        
        parsed_data = json.loads(raw_text.strip())
        if isinstance(parsed_data, dict) and "questions" in parsed_data:
            questions = parsed_data["questions"]
        elif isinstance(parsed_data, list):
            questions = parsed_data
        else:
            questions = [parsed_data]

    except Exception as e:
        logger.error(f"[PracticeQuiz] LLM generation failed: {e}")
        # Fallback question set
        questions = [
            {
                "id": 1,
                "question": f"Which of the following best describes the core mechanism of {target_concepts_list[0]}?",
                "options": [
                    f"A foundational methodology for optimizing {target_concepts_list[0]}.",
                    "A legacy protocol that has been deprecated in modern practice.",
                    "An unverified theoretical assumption with no practical application.",
                    "A purely random process with variable outcomes."
                ],
                "correct_index": 0,
                "explanation": f"Option A correctly identifies {target_concepts_list[0]} as an optimization methodology.",
                "hint": "Focus on practical optimization.",
                "concept": target_concepts_list[0]
            }
        ]

    # Normalize question IDs
    for idx, q in enumerate(questions, start=1):
        q["id"] = idx

    # Save practice quiz to database
    new_quiz = PracticeQuiz(
        user_id=current_user.id,
        course_id=req.course_id,
        title=quiz_title,
        quiz_type=req.quiz_type,
        target_concepts=json.dumps(target_concepts_list),
        difficulty=req.difficulty,
        questions_json=json.dumps(questions),
        quiz_mode=req.quiz_mode,
        status="pending"
    )
    db.add(new_quiz)
    await db.commit()
    await db.refresh(new_quiz)

    return {
        "id": new_quiz.id,
        "title": new_quiz.title,
        "quiz_type": new_quiz.quiz_type,
        "target_concepts": target_concepts_list,
        "difficulty": new_quiz.difficulty,
        "quiz_mode": new_quiz.quiz_mode,
        "questions": questions,
        "created_at": new_quiz.created_at.isoformat()
    }


@router.get("/")
async def list_practice_quizzes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all practice quizzes created by the current student."""
    stmt = (
        select(PracticeQuiz)
        .where(PracticeQuiz.user_id == current_user.id)
        .order_by(PracticeQuiz.created_at.desc())
    )
    res = await db.execute(stmt)
    quizzes = res.scalars().all()

    out = []
    for q in quizzes:
        out.append({
            "id": q.id,
            "title": q.title,
            "quiz_type": q.quiz_type,
            "target_concepts": json.loads(q.target_concepts) if q.target_concepts else [],
            "difficulty": q.difficulty,
            "quiz_mode": q.quiz_mode,
            "status": q.status,
            "score": q.score,
            "question_count": len(json.loads(q.questions_json)) if q.questions_json else 0,
            "created_at": q.created_at.isoformat()
        })
    return out


@router.get("/{quiz_id}")
async def get_practice_quiz_details(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves single practice quiz questions and metadata."""
    stmt = select(PracticeQuiz).where(
        PracticeQuiz.id == quiz_id,
        PracticeQuiz.user_id == current_user.id
    )
    res = await db.execute(stmt)
    quiz = res.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=404, detail="Practice quiz not found.")

    questions = json.loads(quiz.questions_json) if quiz.questions_json else []
    
    # Also check if there is a previous attempt
    att_stmt = select(PracticeQuizAttempt).where(
        PracticeQuizAttempt.quiz_id == quiz_id,
        PracticeQuizAttempt.user_id == current_user.id
    ).order_by(PracticeQuizAttempt.created_at.desc())
    res_att = await db.execute(att_stmt)
    latest_attempt = res_att.scalar_one_or_none()

    attempt_data = None
    if latest_attempt:
        attempt_data = {
            "score": latest_attempt.score,
            "answers": json.loads(latest_attempt.answers_json) if latest_attempt.answers_json else {},
            "feedback": json.loads(latest_attempt.feedback_json) if latest_attempt.feedback_json else {},
            "completed_at": latest_attempt.created_at.isoformat()
        }

    return {
        "id": quiz.id,
        "title": quiz.title,
        "quiz_type": quiz.quiz_type,
        "target_concepts": json.loads(quiz.target_concepts) if quiz.target_concepts else [],
        "difficulty": quiz.difficulty,
        "quiz_mode": quiz.quiz_mode,
        "status": quiz.status,
        "score": quiz.score,
        "questions": questions,
        "latest_attempt": attempt_data,
        "created_at": quiz.created_at.isoformat()
    }


@router.post("/{quiz_id}/submit")
async def submit_practice_quiz(
    quiz_id: int,
    req: SubmitQuizRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Evaluates student's submitted answers, computes score, updates PerformanceMetrics,
    and returns detailed question-by-question feedback + concept mastery improvements.
    """
    stmt = select(PracticeQuiz).where(
        PracticeQuiz.id == quiz_id,
        PracticeQuiz.user_id == current_user.id
    )
    res = await db.execute(stmt)
    quiz = res.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=404, detail="Practice quiz not found.")

    questions = json.loads(quiz.questions_json) if quiz.questions_json else []
    if not questions:
        raise HTTPException(status_code=400, detail="Quiz has no questions.")

    correct_count = 0
    total_count = len(questions)
    evaluation_list = []
    concept_results: Dict[str, List[float]] = {}

    for q in questions:
        q_id = q["id"]
        correct_idx = q.get("correct_index", 0)
        selected_idx = req.answers.get(q_id)
        is_correct = selected_idx is not None and int(selected_idx) == int(correct_idx)
        
        if is_correct:
            correct_count += 1

        concept_name = q.get("concept") or "General"
        score_val = 100.0 if is_correct else 25.0
        concept_results.setdefault(concept_name, []).append(score_val)

        evaluation_list.append({
            "question_id": q_id,
            "question": q["question"],
            "selected_index": selected_idx,
            "correct_index": correct_idx,
            "is_correct": is_correct,
            "explanation": q.get("explanation", ""),
            "concept": concept_name
        })

    overall_score = round((correct_count / total_count) * 100.0, 1)

    # Update PerformanceMetric entries in SQLite database for real-time mastery tracking!
    concept_updates = {}
    for concept, scores in concept_results.items():
        avg_concept_score = sum(scores) / len(scores)
        metric = PerformanceMetric(
            user_id=current_user.id,
            course_id=quiz.course_id or 1,
            metric_type="concept_mastery",
            concept=concept,
            value=float(avg_concept_score),
            timestamp=datetime.now(timezone.utc)
        )
        db.add(metric)
        concept_updates[concept] = round(avg_concept_score, 1)

    # Save Attempt record
    feedback_payload = {
        "evaluation": evaluation_list,
        "concept_updates": concept_updates,
        "correct_count": correct_count,
        "total_count": total_count
    }

    attempt = PracticeQuizAttempt(
        quiz_id=quiz.id,
        user_id=current_user.id,
        answers_json=json.dumps(req.answers),
        score=overall_score,
        feedback_json=json.dumps(feedback_payload)
    )
    db.add(attempt)

    # Update PracticeQuiz status
    quiz.status = "completed"
    quiz.score = overall_score
    await db.commit()

    return {
        "quiz_id": quiz.id,
        "score": overall_score,
        "correct_count": correct_count,
        "total_count": total_count,
        "evaluation": evaluation_list,
        "concept_updates": concept_updates
    }


@router.post("/{quiz_id}/start-socratic")
async def start_socratic_viva_for_quiz(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Converts a practice quiz into an interactive Socratic chat session.
    """
    stmt = select(PracticeQuiz).where(
        PracticeQuiz.id == quiz_id,
        PracticeQuiz.user_id == current_user.id
    )
    res = await db.execute(stmt)
    quiz = res.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=404, detail="Practice quiz not found.")

    target_concepts = json.loads(quiz.target_concepts) if quiz.target_concepts else ["Core Topics"]
    concepts_str = ", ".join(target_concepts)

    # Create new ChatThread of type "viva"
    thread = ChatThread(
        user_id=current_user.id,
        title=f"Practice Socratic Viva: {quiz.title}",
        thread_type="viva"
    )
    db.add(thread)
    await db.flush()

    # Initial AI message
    initial_msg = (
        f"Welcome to your Interactive Socratic Practice Session on **{concepts_str}**!\n\n"
        f"I am your Socratic Mentor. We will dynamically explore your understanding, "
        f"challenge your assumptions, and solidify your mastery. "
        f"Let's begin: How would you explain the core intuition behind **{target_concepts[0]}** in your own words?"
    )

    ai_msg = ChatMessage(
        thread_id=thread.id,
        role="assistant",
        content=initial_msg
    )
    db.add(ai_msg)
    await db.commit()

    return {"thread_id": thread.id}
