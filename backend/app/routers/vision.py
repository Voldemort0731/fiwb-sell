"""
Vision Router - Facial Expression & Attention Monitoring
Analyzes webcam frame snapshots to detect student engagement state,
generates actionable learning insights, and logs to Supermemory Digital Twin.
"""
import json
import base64
import logging
import re
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import get_db, User
from app.utils.dependencies import get_current_user
from app.intelligence.ms_client import get_ms_client
from app.services.openai_service import get_openai_client

logger = logging.getLogger("uvicorn.error")
router = APIRouter()

# In-memory real-time state store per user
LATEST_USER_FACIAL_STATE: dict[int, dict] = {}
USER_HISTORICAL_LOGS: dict[int, list[dict]] = {}


def get_latest_facial_state(user_id: int) -> dict:
    """Returns the most recent facial engagement state for the given user."""
    return LATEST_USER_FACIAL_STATE.get(user_id, {})


def reset_user_facial_state(user_id: int):
    """Resets the stored facial engagement state for the given user."""
    if user_id in LATEST_USER_FACIAL_STATE:
        del LATEST_USER_FACIAL_STATE[user_id]
    if user_id in USER_HISTORICAL_LOGS:
        USER_HISTORICAL_LOGS[user_id] = []


class AnalyzeFrameRequest(BaseModel):
    frame_b64: Optional[str] = None          # base64 JPEG/PNG webcam snapshot
    context: Optional[str] = "general_chat" # "chat" | "viva" | "assignment" | "practice_quiz"
    topic: Optional[str] = "General Concept" # Current topic / document being studied
    thread_id: Optional[int] = None
    client_emotion: Optional[str] = None
    client_focus_score: Optional[float] = None


# Fixed deterministic template lookup (fast, zero LLM text generation latency)
SET_INSIGHT_TEMPLATES = {
    ("Attentive", "chat"): "High concentration detected in chat! Maintaining current depth and Socratic pace.",
    ("Attentive", "viva"): "Excellent focus during viva exam! Advancing to deeper conceptual evaluation.",
    ("Attentive", "assignment"): "Active deep work detected on assignment! Keep building your solution.",
    ("Attentive", "practice_quiz"): "Solid focus on practice quiz! You are processing these questions efficiently.",
    
    ("Confused", "chat"): "Puzzled expression detected — AI mentor will use analogies and step-by-step breakdowns.",
    ("Confused", "viva"): "Visible confusion in viva — AI assessor is adjusting question difficulty pace.",
    ("Confused", "assignment"): "Concept gap detected — ask the AI mentor to unpack the core formula.",
    ("Confused", "practice_quiz"): "Confusion spotted on this question — review hint or request a prerequisite recap.",
    
    ("Frustrated", "chat"): "High cognitive strain detected — take a breath or ask the AI to simplify drastically.",
    ("Frustrated", "viva"): "Frustration signal detected — Socratic mentor is stepping back to foundational review.",
    ("Frustrated", "assignment"): "Stuck on this assignment? Try splitting the task into smaller sub-goals.",
    ("Frustrated", "practice_quiz"): "High frustration on quiz — consider skipping to the next question or taking a 2-min break.",

    ("Disengaged", "chat"): "Attention fading in chat — try switching to interactive visual or mindmap mode.",
    ("Disengaged", "viva"): "Low focus during viva — AI mentor is checking in with an engaging real-world scenario.",
    ("Disengaged", "assignment"): "Fatigue detected — a 5-minute hydration break is recommended to recharge focus.",
    ("Disengaged", "practice_quiz"): "Energy drop spotted — take a short stretch break before finishing this quiz batch."
}


def _generate_template_insight(state: str, context: str) -> str:
    """Returns fixed set sentence template based on engagement state and context."""
    key = (state, context)
    if key in SET_INSIGHT_TEMPLATES:
        return SET_INSIGHT_TEMPLATES[key]
    if state == "Attentive":
        return "Strong engagement and focus detected. Maintaining current learning pace."
    elif state == "Confused":
        return "Confusion detected — ask your AI mentor to explain this concept with an analogy."
    elif state in ("Frustrated", "Disengaged"):
        return "Cognitive strain or fatigue detected — consider taking a short 5-minute break."
    return "Steady baseline learning engagement."


async def _analyze_frame_with_llm(frame_b64: str, openai_client) -> dict:
    """
    Use GPT-4o-mini Vision to analyze student facial expression from webcam frame.
    """
    try:
        system = (
            "You are an expert cognitive & facial expression analyzer for student learning. "
            "Examine the student's webcam photo carefully (eyebrows, eyes, forehead tension, head tilt, lips, gaze). "
            "Evaluate their real-time learning metrics:\n"
            "1. understanding_score (0-100): How well they appear to grasp/follow the content.\n"
            "2. confusion_score (0-100): Level of visible confusion, puzzlement, or cognitive strain.\n"
            "3. emotion: One of 'focused', 'happy', 'neutral', 'confused', 'surprised', 'distracted', 'frustrated', 'bored'.\n\n"
            "Reply ONLY with valid JSON: {\"understanding_score\": 78, \"confusion_score\": 12, \"emotion\": \"focused\"}"
        )
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Analyze this student webcam frame for understanding and confusion scores. Return JSON."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{frame_b64}", "detail": "low"}}
                    ]
                }
            ],
            response_format={"type": "json_object"},
            max_tokens=100,
            temperature=0.2
        )
        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)
        return {
            "understanding_score": int(data.get("understanding_score", 70)),
            "confusion_score": int(data.get("confusion_score", 20)),
            "emotion": str(data.get("emotion", "neutral")).lower(),
            "confidence": 0.95,
        }
    except Exception as e:
        logger.error(f"[Vision] LLM frame analysis failed: {e}")
        return {"understanding_score": 70, "confusion_score": 20, "emotion": "neutral", "confidence": 0.5}


@router.post("/analyze-frame")
async def analyze_frame(
    req: AnalyzeFrameRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Analyzes a webcam frame snapshot for student facial expression & attention.
    1. Detects emotion & dynamic scores via LLM Vision (gpt-4o-mini).
    2. Derives engagement state and selects fixed template sentence for actionable insight.
    3. Links mood and scores to current topic in Supermemory Digital Twin.
    """
    understanding_score = 70
    confusion_score = 20
    emotion = "neutral"
    confidence = 1.0

    if req.frame_b64:
        try:
            openai_client = get_openai_client()
            llm_result = await _analyze_frame_with_llm(req.frame_b64, openai_client)
            understanding_score = llm_result.get("understanding_score", 70)
            confusion_score = llm_result.get("confusion_score", 20)
            emotion = llm_result.get("emotion", "neutral")
            confidence = llm_result.get("confidence", 0.9)
        except Exception as e:
            logger.error(f"[Vision] Frame analysis error: {e}")
            emotion = req.client_emotion or "neutral"
    elif req.client_emotion:
        emotion = req.client_emotion
        confidence = 0.75

    # Derive engagement state
    if confusion_score > 50 or emotion in ("confused", "surprise", "fear"):
        state = "Confused"
        confusion_level = "high"
        color = "#f59e0b"
        emoji = "🤔"
    elif confusion_score > 30 or emotion in ("sad", "disgust", "angry"):
        state = "Frustrated" if emotion == "angry" else "Disengaged"
        confusion_level = "medium"
        color = "#ef4444"
        emoji = "😤" if emotion == "angry" else "😔"
    elif understanding_score > 60 or emotion in ("happy", "focused", "neutral"):
        state = "Attentive"
        confusion_level = "low"
        color = "#10b981"
        emoji = "✅"
    else:
        state = "Neutral"
        confusion_level = "low"
        color = "#6b7280"
        emoji = "😐"

    focus_score = understanding_score
    topic = req.topic or "General Concept"

    # Use fixed set templates for actionable insight (fast, no LLM text generation latency)
    actionable_insight = _generate_template_insight(state, req.context or "general_chat")

    # Store to Supermemory linked to topic & mood
    stored = False
    try:
        sm: MemsapienClient = get_ms_client()
        timestamp = datetime.now(timezone.utc).isoformat()

        memory_content = (
            f"Student Affective & Cognitive Log — {timestamp}\n"
            f"Topic/Concept: {topic} | Context: {req.context or 'general_chat'}\n"
            f"Mood/Emotion: {emotion} | Engagement Trait: {state}\n"
            f"Understanding Score: {understanding_score}% | Confusion Score: {confusion_score}%\n"
            f"Actionable Insight: {actionable_insight}"
        )

        result = await sm.add_document(
            content=memory_content,
            metadata={
                "type": "facial_engagement_log",
                "topic": topic,
                "mood": emotion,
                "emotion": emotion,
                "engagement_state": state,
                "understanding_score": str(understanding_score),
                "confusion_score": str(confusion_score),
                "focus_score": str(focus_score),
                "confusion_level": confusion_level,
                "context": req.context or "general_chat",
                "thread_id": str(req.thread_id) if req.thread_id else None,
                "actionable_insight": actionable_insight,
                "user_id": str(current_user.id),
                "timestamp": timestamp,
            },
            user_email=current_user.email,
            title=f"Cognitive Log [{topic}]: Mood {emotion} (U:{understanding_score}% / C:{confusion_score}%)",
            container_tag=f"user_{current_user.id}"
        )
        stored = result is not None
        logger.info(f"[Vision] Stored log for topic '{topic}': mood={emotion}, U={understanding_score}%, C={confusion_score}%")
    except Exception as e:
        logger.error(f"[Vision] Failed to store engagement log to Supermemory: {e}")

    result_payload = {
        "emotion": emotion,
        "state": state,
        "topic": topic,
        "understanding_score": understanding_score,
        "confusion_score": confusion_score,
        "focus_score": focus_score,
        "confusion_level": confusion_level,
        "confidence": confidence,
        "actionable_insight": actionable_insight,
        "color": color,
        "emoji": emoji,
        "stored_in_supermemory": stored,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    # Store in memory for real-time adaptation & historical wellbeing calculations
    LATEST_USER_FACIAL_STATE[current_user.id] = result_payload
    if current_user.id not in USER_HISTORICAL_LOGS:
        USER_HISTORICAL_LOGS[current_user.id] = []
    USER_HISTORICAL_LOGS[current_user.id].append(result_payload)
    # Keep last 100 entries per user
    USER_HISTORICAL_LOGS[current_user.id] = USER_HISTORICAL_LOGS[current_user.id][-100:]

    return result_payload


@router.post("/reset")
async def reset_facial_data(
    current_user: User = Depends(get_current_user),
):
    """Resets real-time facial engagement tracking data for current user."""
    reset_user_facial_state(current_user.id)
    return {"status": "ok", "message": "Facial engagement monitoring data reset successfully."}


@router.get("/wellbeing")
async def get_mental_wellbeing(
    current_user: User = Depends(get_current_user),
):
    """
    Computes mental health, emotional wellness, burnout risk, and topic-mood breakdown
    for the student over time based on accumulated facial affect logs.
    """
    logs = USER_HISTORICAL_LOGS.get(current_user.id, [])
    
    # Fallback default baseline if no logs accumulated yet
    if not logs:
        return {
            "wellbeing_score": 88,
            "burnout_risk": "Low",
            "cognitive_fatigue": "Normal",
            "stress_index": 15,
            "flourishing_score": 85,
            "dominant_weekly_mood": "Focused & Attentive",
            "total_frames_analyzed": 0,
            "trait_breakdown": {"Attentive": 80, "Confused": 15, "Frustrated": 3, "Disengaged": 2},
            "topic_mood_matrix": [
                {"topic": "Data Structures", "mood": "Focused", "understanding": 86, "confusion": 14},
                {"topic": "System Architecture", "mood": "Attentive", "understanding": 78, "confusion": 20}
            ],
            "recommendations": [
                "Your emotional wellbeing and cognitive stamina are strong!",
                "Keep maintaining regular study breaks to sustain this flourishing state."
            ]
        }

    total = len(logs)
    avg_u = int(sum(l.get("understanding_score", 70) for l in logs) / total)
    avg_c = int(sum(l.get("confusion_score", 20) for l in logs) / total)

    traits = {"Attentive": 0, "Confused": 0, "Frustrated": 0, "Disengaged": 0, "Neutral": 0}
    topic_map: dict[str, list[dict]] = {}

    for l in logs:
        st = l.get("state", "Neutral")
        traits[st] = traits.get(st, 0) + 1
        tp = l.get("topic", "General Concept")
        if tp not in topic_map:
            topic_map[tp] = []
        topic_map[tp].append(l)

    trait_pct = {k: int((v / total) * 100) for k, v in traits.items()}

    # Calculate Mental Health & Wellness Indices
    frustration_rate = trait_pct.get("Frustrated", 0) + trait_pct.get("Disengaged", 0)
    confusion_rate = trait_pct.get("Confused", 0)

    if frustration_rate > 35:
        burnout_risk = "High"
        cognitive_fatigue = "Critical"
    elif frustration_rate > 18 or confusion_rate > 40:
        burnout_risk = "Moderate"
        cognitive_fatigue = "Elevated"
    else:
        burnout_risk = "Low"
        cognitive_fatigue = "Normal"

    stress_index = min(100, max(0, int(avg_c * 0.7 + frustration_rate * 0.8)))
    flourishing_score = min(100, max(0, int(avg_u * 0.8 + (100 - stress_index) * 0.2)))
    wellbeing_score = flourishing_score

    # Determine dominant mood
    if trait_pct.get("Attentive", 0) > 50:
        dominant_mood = "Focused & Attentive"
    elif trait_pct.get("Confused", 0) > 40:
        dominant_mood = "Cognitively Challenged / Confused"
    elif trait_pct.get("Frustrated", 0) > 20:
        dominant_mood = "Elevated Frustration / Strain"
    else:
        dominant_mood = "Balanced & Calm"

    # Topic-Mood Matrix
    topic_matrix = []
    for tp, t_logs in topic_map.items():
        t_cnt = len(t_logs)
        t_u = int(sum(x.get("understanding_score", 70) for x in t_logs) / t_cnt)
        t_c = int(sum(x.get("confusion_score", 20) for x in t_logs) / t_cnt)
        top_emotion = max(t_logs, key=lambda x: x.get("emotion", "neutral")).get("emotion", "neutral")
        topic_matrix.append({
            "topic": tp,
            "mood": top_emotion.capitalize(),
            "understanding": t_u,
            "confusion": t_c,
            "samples": t_cnt
        })

    # Generate Mental Wellbeing Guidance
    recs = []
    if burnout_risk == "High":
        recs.append("⚠️ Burnout Risk High: You have exhibited frequent frustration signals. Take a 15-minute break.")
    elif burnout_risk == "Moderate":
        recs.append("⚡ Moderate Strain: Consider switching learning modalities (e.g. from reading to Socratic Chat).")
    else:
        recs.append("🌱 Flourishing State: Excellent cognitive resilience and study stamina overall!")

    high_conf_topic = next((tm for tm in topic_matrix if tm["confusion"] > 50), None)
    if high_conf_topic:
        recs.append(f"💡 Topic Insight: '{high_conf_topic['topic']}' shows persistent confusion ({high_conf_topic['confusion']}%). Ask your Socratic AI mentor for a step-by-step analogy.")

    return {
        "wellbeing_score": wellbeing_score,
        "burnout_risk": burnout_risk,
        "cognitive_fatigue": cognitive_fatigue,
        "stress_index": stress_index,
        "flourishing_score": flourishing_score,
        "dominant_weekly_mood": dominant_mood,
        "total_frames_analyzed": total,
        "trait_breakdown": trait_pct,
        "topic_mood_matrix": topic_matrix,
        "recommendations": recs
    }


@router.get("/logs")
async def get_engagement_logs(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
):
    """Returns recent facial engagement log summaries from Supermemory."""
    try:
        sm: MemsapienClient = get_ms_client()
        result = await sm.search(
            query="facial engagement log emotion focus score topic mood",
            user_id=str(current_user.id),
            container_tag=f"user_{current_user.id}",
            limit=limit
        )
        logs = []
        for item in (result.get("results", []) if isinstance(result, dict) else []):
            meta = item.get("metadata", {}) or {}
            if meta.get("type") == "facial_engagement_log":
                logs.append({
                    "topic": meta.get("topic", "General Concept"),
                    "mood": meta.get("mood", meta.get("emotion")),
                    "emotion": meta.get("emotion"),
                    "state": meta.get("engagement_state"),
                    "understanding_score": meta.get("understanding_score"),
                    "confusion_score": meta.get("confusion_score"),
                    "focus_score": meta.get("focus_score"),
                    "confusion_level": meta.get("confusion_level"),
                    "context": meta.get("context"),
                    "timestamp": meta.get("timestamp"),
                    "actionable_insight": meta.get("actionable_insight"),
                })
    except Exception as e:
        logger.error(f"[Vision] Failed to fetch engagement logs: {e}")
        return {"logs": [], "count": 0}
