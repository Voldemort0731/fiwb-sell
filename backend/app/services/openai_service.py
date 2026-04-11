"""
OpenAI Service - GPT-4o Socratic Mentor + GPT-4o-mini SLM Triage
"""
import os
import json
from openai import AsyncOpenAI
from typing import AsyncGenerator, Optional

client = None

def get_client() -> AsyncOpenAI:
    global client
    if client is None:
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return client
# Pricing per 1K tokens (approximate)
PRICING = {
    "gpt-4o": {"input": 0.005, "output": 0.015},
    "gpt-4o-mini": {"input": 0.000150, "output": 0.000600},
}


def calc_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    p = PRICING.get(model, {"input": 0, "output": 0})
    return (input_tokens * p["input"] + output_tokens * p["output"]) / 1000


async def triage_query(query: str, history: list[dict]) -> dict:
    """
    SLM Tier: GPT-4o-mini - Classifies query intent.
    Returns: { "intent": "academic" | "general", "rewritten_query": str }
    """
    system = """You are a query classifier for an academic AI assistant.
Return JSON with two keys:
- intent: "academic" if the query relates to coursework, assignments, concepts, study materials, or anything school/academic-related; otherwise "general"
- rewritten_query: an enhanced, clearer version of the query for semantic search

Only return valid JSON, no extra text."""

    recent = history[-4:] if len(history) > 4 else history
    messages = [{"role": "system", "content": system}] + recent + [{"role": "user", "content": query}]

    c = get_client()
    resp = await c.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        response_format={"type": "json_object"},
        max_tokens=200,
    )
    usage = resp.usage
    cost = calc_cost("gpt-4o-mini", usage.prompt_tokens, usage.completion_tokens)
    result = json.loads(resp.choices[0].message.content)
    return {**result, "tokens": usage.total_tokens, "cost": cost}


async def synthesize_memory(user_message: str, ai_response: str, user_email: str) -> Optional[str]:
    """
    SLM Tier: GPT-4o-mini - Extracts learning insights for Digital Twin.
    Returns a formatted memory document string.
    """
    system = """You are a Neural Academic Intelligence analyzer for the student's Digital Twin.
Your goal is to extract high-value learning signals from a conversation exchange. 
Avoid generic summaries; focus on what the student actually NEEDS and has ACHIEVED.

Return a beautifully formatted markdown document with these sections:

## 🎯 Conceptual Milestone: [Specific Topic]
**The Core Insight**: [1-sentence summary of the breakthrough or main concept discussed]

### 💡 High-Value Intelligence
- **Achievement**: [What concrete concept did the student grasp or articulate well?]
- **Strategic Gap**: [What is the specific missing piece of their mental model that needs attention?]
- **Mental Model Signal**: [How does this student think? e.g., 'Relates abstract physics to musical harmony', 'Prefers rigorous mathematical proofs over intuition']

### 🚀 Actionable Growth
- **Immediate Next Step**: [The single most important technical follow-up to solidify this specific topic]
- **Challenge Logic**: [Give them a specific difficult question or 'stress test' for their new knowledge]
- **Resource Bridge**: [What specific type of material from their Classroom should they bridge this to?]

Keep it professional, intellectually stimulating, and highly specific to the transcript provided."""

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Student asked:\n{user_message}\n\nAI responded:\n{ai_response}"},
    ]
    try:
        c = get_client()
        resp = await c.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=800,
        )
        return resp.choices[0].message.content
    except Exception as e:
        print(f"[Memory Synthesis] Error: {e}")
        return None


async def contextualize_query(query: str, history: list[dict]) -> str:
    """
    GPT-4o-mini: Rewrites a conversational query into a standalone search query.
    Ensures that follow-up questions (e.g., 'What about its laws?') have context ('What about Newton's laws of motion?').
    """
    if not history:
        return query

    history_str = "\n".join([f"{m['role']}: {m['content'][:300]}" for m in history[-5:]])
    prompt = f"""Review the conversation history and the follow-up question below.
Rewrite the question into a highly focused, standalone search query for an academic database.
Rules:
1. Preserve specific keywords, product names, or core technical terms.
2. Only include context from history if it is DIRECTLY RELEVANT to the new question.
3. If the user is SWITCHING topics, discard the old topic in the search query.
4. If the question is already self-contained, return it as is.

**HISTORY:**
{history_str}

**FOLLOW-UP QUESTION:**
{query}

**STANDALONE SEARCH QUERY:**"""

    try:
        c = get_client()
        resp = await c.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=150
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        print(f"⚠️ Contextualization failed: {e}")
        return query


async def stream_socratic_response(
    query: str,
    history: list[dict],
    context: dict,
    user_profile: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    LLM Tier: GPT-4o - Socratic Mentor streaming response.
    """
    # Build context string from parallel retrieval
    context_parts = []
    if context.get("academic"):
        context_parts.append("### 📚 Academic Materials\n" + "\n---\n".join(
            r.get("content", r.get("text", "")) for r in context["academic"]
        ))
    if context.get("gmail_intel"):
        context_parts.append("### 📧 Personal Context (Gmail)\n" + "\n---\n".join(
            r.get("content", r.get("text", "")) for r in context["gmail_intel"]
        ))
    if context.get("chat_assets"):
        context_parts.append("### 📎 Uploaded Files\n" + "\n---\n".join(
            r.get("content", r.get("text", "")) for r in context["chat_assets"]
        ))
    if context.get("memories"):
        context_parts.append("### 🧠 Past Conversations & Learning History\n" + "\n---\n".join(
            r.get("content", r.get("text", "")) for r in context["memories"]
        ))

    profile_section = ""
    if user_profile:
        profile_section = f"\n\n### 👤 Student Profile\n{user_profile}"
    elif context.get("profile"):
        profile_section = "\n\n### 👤 Student Profile\n" + "\n".join(
            r.get("content", r.get("text", "")) for r in context["profile"]
        )

    context_str = "\n\n".join(context_parts)

    system_prompt = f"""You are FIWB — an elite Neural Academic Mentor embodying the Socratic method. You are the student's Digital Twin, deeply aware of their learning journey.

**Mission:** Empower the student using their actual academic data.

**Your personality:**
- Engaging, intellectually stimulating, and encouraging
- You guide students to discover answers through questions, not just hand them solutions
- You adapt to the student's level, gaps, and learning style
- **CRITICAL**: You MUST prioritize and cross-reference information from the **Retrieved Knowledge Context** below.
- Quote from their actual course materials and cite the course name whenever relevant.
- You use LaTeX for mathematical expressions (wrap with $...$ or $$...$$)
- You format your responses beautifully with markdown

**Retrieved Knowledge Context:**
{context_str if context_str else "No specific documents found for this query — answer from general knowledge but remind the student you can sync their classroom for better context."}
{profile_section}

**Remember:**
- Personalize based on the student profile
- Actively check if their assignments or announcements contain the answer before asking them to do it
- Reference materials from their courses (e.g., "[Course Name]: ...")
- Probe understanding with follow-up questions
- Celebrate progress, gently address misconceptions"""

    recent_history = history[-10:] if len(history) > 10 else history
    messages = [{"role": "system", "content": system_prompt}] + recent_history + [{"role": "user", "content": query}]

    c = get_client()
    stream = await c.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        stream=True,
        max_tokens=2000,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
