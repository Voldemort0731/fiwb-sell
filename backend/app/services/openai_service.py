"""
LLM Service — Universal Intelligence Orchestrator.
Standardized using LiteLLM to support Gemini, OpenAI, and Anthropic.
"""
import os
import json
import logging
import asyncio
from typing import AsyncGenerator, Optional, List, Dict
import litellm
from litellm import acompletion
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

_openai_client: AsyncOpenAI = None

def get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _openai_client

# Configuration
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()

def get_model_name(tier: str = "flash") -> str:
    """
    Maps symbolic tiers to provider-specific model strings.
    Tiers: "flash" (fast, cheap), "pro" (smart, expensive).
    """
    if LLM_PROVIDER == "openai":
        return "gpt-4o-mini" # Best value: gpt-4o-mini for everything
    elif LLM_PROVIDER == "anthropic":
        return "anthropic/claude-3-haiku-20240307" if tier == "flash" else "anthropic/claude-3-5-sonnet-20240620"
    else: # Default to Gemini
        return "gemini/gemini-1.5-flash" if tier == "flash" else "gemini/gemini-1.5-pro"

async def unified_completion(
    messages: List[Dict], 
    model: Optional[str] = None,
    tier: str = "flash",
    json_mode: bool = False,
    retries: int = 2
) -> Dict:
    """Universal completion helper using LiteLLM."""
    target_model = model or get_model_name(tier)
    
    kwargs = {
        "model": target_model,
        "messages": messages,
        "num_retries": retries,
    }
    
    if json_mode:
        # LiteLLM handles json_mode for most providers
        kwargs["response_format"] = {"type": "json_object"}

    try:
        response = await acompletion(**kwargs)
        
        # Standardize output format
        text = response.choices[0].message.content
        usage = getattr(response, "usage", {})
        
        return {
            "text": text,
            "input_tokens": getattr(usage, "prompt_tokens", 0),
            "output_tokens": getattr(usage, "completion_tokens", 0)
        }
    except Exception as e:
        logger.error(f"LLM Call Failed ({target_model}): {e}")
        raise ValueError(f"LLM Service Error: {str(e)}")

async def triage_query(query: str, history: list[dict]) -> dict:
    """SLM Tier: Classifies query intent."""
    system = """You are a query classifier for an academic AI assistant.
Return JSON with two keys:
- intent: "academic" if the query relates to coursework, assignments, concepts, study materials, or anything school/academic-related; otherwise "general"
- rewritten_query: an enhanced, clearer version of the query for semantic search

Only return valid JSON, no extra text."""

    recent = history[-4:] if len(history) > 4 else history
    messages = [{"role": "system", "content": system}] + recent + [{"role": "user", "content": query}]

    try:
        res = await unified_completion(messages, tier="flash", json_mode=True)
        result = json.loads(res["text"])
        return {**result, "tokens": res["input_tokens"] + res["output_tokens"], "cost": 0}
    except Exception as e:
        logger.error(f"Triage failed: {e}")
        return {"intent": "academic", "rewritten_query": query, "tokens": 0, "cost": 0}

async def synthesize_memory(user_message: str, ai_response: str, user_email: str) -> Optional[str]:
    """SLM Tier: Extracts learning insights for the Digital Twin."""
    system = """You are a Neural Academic Intelligence analyzer for the student's Digital Twin.
Return a beautifully formatted markdown document with these sections:
## 🎯 Conceptual Milestone: [Specific Topic]
### 💡 High-Value Intelligence
### 🚀 Actionable Growth"""

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Student asked:\n{user_message}\n\nAI responded:\n{ai_response}"},
    ]
    try:
        res = await unified_completion(messages, tier="flash")
        return res["text"]
    except Exception as e:
        logger.error(f"Memory synthesis failed: {e}")
        return None

async def extract_mastery_from_chat(user_message: str, ai_response: str) -> List[Dict]:
    """SLM Tier: Detects concepts and estimated mastery levels (0.0-1.0)."""
    system = """Analyze the chat and identify academic concepts discussed. 
For each concept, estimate the student's mastery based on their questions/answers.
Return JSON list: [{"concept": "string", "score": float}] where score is 0.0 to 1.0.
Only return valid JSON."""
    
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"User: {user_message}\nAI: {ai_response}"}
    ]
    try:
        res = await unified_completion(messages, tier="flash", json_mode=True)
        # Attempt to find list in JSON (might be wrapped in an object)
        data = json.loads(res["text"])
        if isinstance(data, list): return data
        if isinstance(data, dict):
            for v in data.values():
                if isinstance(v, list): return v
        return []
    except Exception as e:
        logger.error(f"Mastery extraction failed: {e}")
        return []

async def contextualize_query(query: str, history: list[dict]) -> str:
    """Rewrites conversational query into a standalone search query."""
    if not history: return query
    
    history_str = "\n".join([f"{m['role']}: {m['content'][:300]}" for m in history[-5:]])
    prompt = f"Rewrite this question into a focused, standalone academic search query.\n\nHISTORY:\n{history_str}\n\nQUESTION: {query}"
    
    try:
        res = await unified_completion([{"role": "user", "content": prompt}], tier="flash")
        return res["text"].strip()
    except Exception as e:
        logger.error(f"Contextualization failed: {e}")
        return query

async def stream_llm_response(messages: List[Dict]) -> AsyncGenerator[str, None]:
    """Universal streaming helper."""
    target_model = get_model_name(tier="flash")
    
    try:
        response = await acompletion(
            model=target_model,
            messages=messages,
            stream=True
        )
        
        async for chunk in response:
            content = chunk.choices[0].delta.content
            if content:
                yield content
    except Exception as e:
        logger.error(f"Streaming LLM Failed ({target_model}): {e}")
        yield f"Error: {str(e)}"

async def generate_chat_response_simple(messages: List[Dict]) -> str:
    """Non-streaming helper for quick tasks like quiz generation."""
    res = await unified_completion(messages, tier="flash")
    return res["text"]

# Legacy alias for backward compatibility in some modules
async def stream_socratic_response(query: str, history: list, context: dict, user_profile: str = None):
    # This was partially redundant logic. Most calls now go through PromptArchitect -> stream_llm_response
    # But we'll keep the signature if any old code still calls it directly.
    from app.intelligence.prompt_architect import PromptArchitect
    
    # Extract chunks from context map
    course_chunks = context.get("academic", []) + context.get("course_context", [])
    
    messages = PromptArchitect.build_messages(
        user_query=query,
        retrieved_chunks=course_chunks,
        history=history,
        profile=[{"content": user_profile}] if user_profile else None
    )
    
    async for chunk in stream_llm_response(messages):
        yield chunk
async def evaluate_viva_transcript(transcript: List[Dict]) -> Dict:
    """Analyzes a Viva transcript and returns a detailed report and grade."""
    system = """You are an Academic Examiner. Evaluate the provided Viva transcript.
    Analyze the student's understanding, depth of reasoning, and accuracy.
    
    Return a JSON object:
    {
      "grade": 0-100,
      "strengths": ["list of 2-3 specific concepts mastered"],
      "gaps": ["list of 2-3 specific concepts needing improvement"],
      "grading_note": "A summary for the professor explaining the grade"
    }
    """
    
    transcript_text = "\n".join([f"{m['role']}: {m['content']}" for m in transcript])
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"TRANSCRIPT:\n{transcript_text}"}
    ]
    
    try:
        res = await unified_completion(messages, tier="pro", json_mode=True)
        return json.loads(res["text"])
    except Exception as e:
        logger.error(f"Viva evaluation failed: {e}")
        return {
            "grade": 0,
            "strengths": ["Evaluation failed"],
            "gaps": ["System error during analysis"],
            "grading_note": f"Error: {str(e)}"
        }
