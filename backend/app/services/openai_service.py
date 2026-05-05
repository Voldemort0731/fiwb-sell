"""
LLM Service — Multi-tier Intelligence using Gemini 1.5 Pro & Flash.
Switched from OpenAI to Gemini as per user request.
"""
import os
import json
import httpx
import logging
import asyncio
from typing import AsyncGenerator, Optional, List, Dict

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini")# Pricing is handled differently for Gemini (free tier vs pay-as-you-go)
# We'll set symbolic costs for now or just zero them out if not tracking.
PRICING = {
    "gemini-flash-latest": {"input": 0.000075, "output": 0.0003},
}

async def _prepare_gemini_payload(messages: List[Dict], json_mode: bool = False) -> Dict:
    """Helper to transform OpenAI messages to Gemini contents/system_instruction."""
    contents = []
    system_instruction = None
    
    current_role = None
    current_parts = []
    
    for m in messages:
        role = m.get("role")
        raw_content = m.get("content", "")
        
        # 1. Handle System Messages
        if role == "system":
            # Gemini only supports string parts in system_instruction
            if isinstance(raw_content, list):
                text_parts = [p.get("text", "") for p in raw_content if p.get("type") == "text"]
                system_instruction = {"parts": [{"text": " ".join(text_parts)}]}
            else:
                system_instruction = {"parts": [{"text": str(raw_content)}]}
            continue

        # 2. Extract Parts (Handle String or List)
        g_parts = []
        if isinstance(raw_content, list):
            for part in raw_content:
                if part.get("type") == "text":
                    g_parts.append({"text": part.get("text", "")})
                elif part.get("type") == "image_url":
                    url = part.get("image_url", {}).get("url", "")
                    if url.startswith("data:"):
                        try:
                            # data:image/jpeg;base64,/9j/...
                            header, data = url.split(",", 1)
                            mime_type = header.split(";")[0].split(":")[1]
                            g_parts.append({
                                "inline_data": {
                                    "mime_type": mime_type,
                                    "data": data
                                }
                            })
                        except Exception as e:
                            logger.error(f"Failed to parse image data: {e}")
        else:
            if str(raw_content).strip():
                g_parts.append({"text": str(raw_content)})

        if not g_parts: continue

        # 3. Group consecutive roles
        g_role = "user" if role == "user" else "model"
        if g_role == current_role:
            current_parts.extend(g_parts)
        else:
            if current_role:
                contents.append({"role": current_role, "parts": current_parts})
            current_role = g_role
            current_parts = g_parts
                
    if current_role:
        contents.append({"role": current_role, "parts": current_parts})
        
    if not contents:
        contents = [{"role": "user", "parts": [{"text": "Hello"}]}]
    elif contents[0]["role"] == "model":
        contents.insert(0, {"role": "user", "parts": [{"text": "Please continue."}]})

    payload = {"contents": contents}
    if system_instruction:
        payload["system_instruction"] = system_instruction
    if json_mode:
        payload["generationConfig"] = {"response_mime_type": "application/json"}
    
    return payload

async def call_gemini(model: str, messages: List[Dict], json_mode: bool = False, retries: int = 2) -> Dict:
    """Helper to call Gemini API via HTTPX with retry logic."""
    key = os.getenv("GEMINI_API_KEY", "").strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    payload = await _prepare_gemini_payload(messages, json_mode)
        
    for attempt in range(retries + 1):
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 429:
                if attempt < retries:
                    wait_time = (attempt + 1) * 2
                    logger.warning(f"Gemini 429 hit. Retrying in {wait_time}s... (Attempt {attempt + 1}/{retries})")
                    await asyncio.sleep(wait_time)
                    continue
                
                retry_after = resp.headers.get("Retry-After")
                wait_msg = f" (Wait {retry_after}s)" if retry_after else ""
                logger.error(f"Gemini Rate Limit Hit: 429{wait_msg}")
                raise ValueError(f"Rate limit exceeded. Please wait a moment before trying again.{wait_msg}")
                
            if resp.status_code != 200:
                logger.error(f"Gemini error {resp.status_code}: {resp.text}")
                resp.raise_for_status()
                
            data = resp.json()
            try:
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                usage = data.get("usageMetadata", {})
                return {
                    "text": text,
                    "input_tokens": usage.get("promptTokenCount", 0),
                    "output_tokens": usage.get("candidatesTokenCount", 0)
                }
            except (KeyError, IndexError) as e:
                logger.error(f"Gemini response parsing failed: {e} | Raw: {data}")
                raise ValueError("Unexpected Gemini response format")
            
        data = resp.json()
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            usage = data.get("usageMetadata", {})
            return {
                "text": text,
                "input_tokens": usage.get("promptTokenCount", 0),
                "output_tokens": usage.get("candidatesTokenCount", 0)
            }
        except (KeyError, IndexError) as e:
            logger.error(f"Gemini response parsing failed: {e} | Raw: {data}")
            raise ValueError("Unexpected Gemini response format")

async def triage_query(query: str, history: list[dict]) -> dict:
    """SLM Tier: Gemini Flash - Classifies query intent."""
    system = """You are a query classifier for an academic AI assistant.
Return JSON with two keys:
- intent: "academic" if the query relates to coursework, assignments, concepts, study materials, or anything school/academic-related; otherwise "general"
- rewritten_query: an enhanced, clearer version of the query for semantic search

Only return valid JSON, no extra text."""

    recent = history[-4:] if len(history) > 4 else history
    messages = [{"role": "system", "content": system}] + recent + [{"role": "user", "content": query}]

    try:
        res = await call_gemini("gemini-flash-latest", messages, json_mode=True)
        result = json.loads(res["text"])
        return {**result, "tokens": res["input_tokens"] + res["output_tokens"], "cost": 0}
    except Exception as e:
        logger.error(f"Triage failed: {e}")
        return {"intent": "academic", "rewritten_query": query, "tokens": 0, "cost": 0}

async def synthesize_memory(user_message: str, ai_response: str, user_email: str) -> Optional[str]:
    """SLM Tier: Gemini Flash - Extracts learning insights."""
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
        res = await call_gemini("gemini-flash-latest", messages)
        return res["text"]
    except Exception as e:
        logger.error(f"Memory synthesis failed: {e}")
        return None

async def contextualize_query(query: str, history: list[dict]) -> str:
    """Gemini Flash: Rewrites conversational query into a standalone search query."""
    if not history: return query
    
    history_str = "\n".join([f"{m['role']}: {m['content'][:300]}" for m in history[-5:]])
    prompt = f"Rewrite this question into a focused, standalone academic search query.\n\nHISTORY:\n{history_str}\n\nQUESTION: {query}"
    
    try:
        res = await call_gemini("gemini-flash-latest", [{"role": "user", "content": prompt}])
        return res["text"].strip()
    except Exception as e:
        logger.error(f"Contextualization failed: {e}")
        return query

async def stream_socratic_response(
    query: str,
    history: list[dict],
    context: dict,
    user_profile: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """LLM Tier: Gemini Flash - Socratic Mentor streaming response."""
    context_parts = []
    for key, label in [("academic", "📚 Academic Materials"), ("gmail_intel", "📧 Personal Context (Gmail)"), 
                       ("chat_assets", "📎 Uploaded Files"), ("memories", "🧠 Past Conversations")]:
        if context.get(key):
            context_parts.append(f"### {label}\n" + "\n---\n".join(r.get("content", r.get("text", "")) for r in context[key]))

    profile_section = f"\n\n### 👤 Student Profile\n{user_profile}" if user_profile else ""
    context_str = "\n\n".join(context_parts)

    system_prompt = f"""You are FIWB — an elite Neural Academic Mentor (Socratic method).
Mission: Empower the student using their actual academic data.
Rules:
- Guide with questions, don't just give answers.
- Use LaTeX for math ($...$).
- Reference retrieved documents and cite course names.
- Personality: Engaging and encouraging.

Retrieved Knowledge Context:
{context_str if context_str else "No specific documents found."}
{profile_section}"""

    recent_history = history[-10:] if len(history) > 10 else history
    messages = [{"role": "system", "content": system_prompt}] + recent_history + [{"role": "user", "content": query}]

    # Gemini Streaming Implementation
    key = os.getenv("GEMINI_API_KEY", "").strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key={key}"
    payload = await _prepare_gemini_payload(messages)

    retries = 1
    for attempt in range(retries + 1):
        async with httpx.AsyncClient(timeout=90.0) as client:
            async with client.stream("POST", url, json=payload) as resp:
                if resp.status_code == 429:
                    if attempt < retries:
                        await asyncio.sleep(2)
                        continue
                    retry_after = resp.headers.get("Retry-After")
                    wait_msg = f" (Wait {retry_after}s)" if retry_after else ""
                    logger.error(f"Gemini Rate Limit (Stream): 429{wait_msg}")
                    yield f"Rate limit exceeded. Please wait a moment before trying again.{wait_msg}"
                    return
                if resp.status_code != 200:
                    body = await resp.aread()
                    logger.error(f"Gemini stream error {resp.status_code}: {body.decode()}")
                    resp.raise_for_status()
                    
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            chunk_data = json.loads(line[6:])
                            if "candidates" in chunk_data:
                                text = chunk_data["candidates"][0]["content"]["parts"][0]["text"]
                                yield text
                        except Exception:
                            continue
                return # Success
                
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    try:
                        chunk_data = json.loads(line[6:])
                        if "candidates" in chunk_data:
                            text = chunk_data["candidates"][0]["content"]["parts"][0]["text"]
                            yield text
                    except Exception:
                        continue

async def stream_llm_response(messages: List[Dict]) -> AsyncGenerator[str, None]:
    """Generic helper to stream from Gemini based on messages (OpenAI style)."""
    key = os.getenv("GEMINI_API_KEY", "").strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key={key}"
    payload = await _prepare_gemini_payload(messages)

    retries = 1
    for attempt in range(retries + 1):
        async with httpx.AsyncClient(timeout=90.0) as client:
            async with client.stream("POST", url, json=payload) as resp:
                if resp.status_code == 429:
                    if attempt < retries:
                        await asyncio.sleep(2)
                        continue
                    retry_after = resp.headers.get("Retry-After")
                    wait_msg = f" (Wait {retry_after}s)" if retry_after else ""
                    logger.error(f"Gemini Rate Limit (Stream LLM): 429{wait_msg}")
                    yield f"Rate limit exceeded. Please wait a moment before trying again.{wait_msg}"
                    return
                if resp.status_code != 200:
                    body = await resp.aread()
                    logger.error(f"Gemini stream error {resp.status_code}: {body.decode()}")
                    resp.raise_for_status()
                    
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            chunk_data = json.loads(line[6:])
                            if "candidates" in chunk_data:
                                text = chunk_data["candidates"][0]["content"]["parts"][0]["text"]
                                yield text
                        except Exception:
                            continue
                return # Success
                
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    try:
                        chunk_data = json.loads(line[6:])
                        if "candidates" in chunk_data:
                            text = chunk_data["candidates"][0]["content"]["parts"][0]["text"]
                            yield text
                    except Exception:
                        continue
