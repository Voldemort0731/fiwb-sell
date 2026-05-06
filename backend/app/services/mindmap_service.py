"""
mindmap_service.py
Generation, caching, and editing of document mind maps using LiteLLM.
"""
from __future__ import annotations
import json
import hashlib
import logging
import os
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from litellm import acompletion

from app.models.database import MindMap, Material

logger = logging.getLogger(__name__)

# Configuration - Default to gpt-4o or gemini-1.5-pro for complex graph tasks
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()
if LLM_PROVIDER == "openai":
    DEFAULT_MODEL = "gpt-4o-mini"
elif LLM_PROVIDER == "anthropic":
    DEFAULT_MODEL = "anthropic/claude-3-5-sonnet-20240620"
else:
    DEFAULT_MODEL = "gemini/gemini-1.5-pro"

MINDMAP_MODEL = os.getenv("MINDMAP_MODEL", DEFAULT_MODEL)

GENERATION_PROMPT = """You are a knowledge graph architect. Your task is to extract a comprehensive, structured mind map from the provided document.

Extract the key concepts and their multifaceted relationships. Return ONLY a valid JSON object in this exact structure:

{{
  "central": "Main Topic Title",
  "nodes": [
    {{
      "id": "unique_id",
      "label": "Concept Name",
      "level": 0, 
      "definition": "Clear 1-2 sentence explanation of this concept",
      "citations": [
        {{
          "material_id": "{material_id}",
          "page": 1,
          "snippet": "verbatim text snippet"
        }}
      ]
    }}
  ],
  "edges": [
    {{
      "source": "id_a",
      "target": "id_b",
      "label": "Relationship name",
      "type": "hierarchical"
    }}
  ]
}}

Rules:
1. Levels: 0=Root Topic, 1=Key Pillar, 2=Sub-concept, 3=Supporting Detail.
2. Edge Types: 
   - 'hierarchical': Direct parent-child (Level N to N+1).
   - 'related': Non-hierarchical association (same level).
   - 'prerequisite': One concept is required to understand another.
3. Citations: Use the provided Material ID. snippet MUST be verbatim from the text.
4. Density: Adjust the number of nodes dynamically based on the document's complexity. Capture all key architectural concepts and their relationships without a fixed limit, but ensure the graph remains readable.

Document:
{document_text}"""



EDIT_PROMPT = """You are an expert knowledge graph editor. Your task is to update a mind map JSON structure based on user instructions.

Current mind map JSON:
{current_json}

User instruction: {instruction}

Return ONLY the updated mind map JSON in the exact same structure. No explanation, no markdown. 

Rules for editing:
1. Maintain Schema: Preserve the exact "central", "nodes", and "edges" structure.
2. Levels & IDs: Ensure new nodes have appropriate 'level' (0-3) and 'unique_id'.
3. Relationships: Use 'hierarchical', 'related', or 'prerequisite' for any new edges.
4. Persistence: Do not remove existing nodes or edges unless explicitly told to. Only apply requested changes.
5. Accuracy: Ensure any new content is factually consistent with the existing nodes."""


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


async def get_mind_map(
    db: AsyncSession,
    user_id: int,
    material_id: int,
    force_regenerate: bool = False,
) -> Optional[dict]:
    """
    Fetch cached mind map if valid. Returns None if it needs to be generated.
    If force_regenerate, deletes any existing cache and returns None.
    """
    result = await db.execute(
        select(MindMap).where(MindMap.user_id == user_id, MindMap.material_id == material_id)
    )
    mind_map = result.scalar_one_or_none()

    if mind_map and force_regenerate:
        await db.delete(mind_map)
        await db.commit()
        return None

    if mind_map:
        # Check if document has changed
        mat_res = await db.execute(select(Material).where(Material.id == material_id))
        material = mat_res.scalar_one_or_none()
        if material and material.full_text:
            current_hash = _hash_text(material.full_text)
            if current_hash != mind_map.content_hash:
                # Doc changed, invalidate
                await db.delete(mind_map)
                await db.commit()
                return None

        return {
            "data": json.loads(mind_map.json_data),
            "generated_at": mind_map.generated_at.isoformat(),
            "can_undo": bool(json.loads(mind_map.history_stack or "[]")),
        }

    return None


async def generate_mind_map(
    db: AsyncSession,
    user_id: int,
    material_id: int,
) -> dict:
    """
    Generate a fresh mind map for a document using LiteLLM. Saves to DB.
    """
    mat_res = await db.execute(
        select(Material).where(Material.id == material_id, Material.user_id == user_id)
    )
    material = mat_res.scalar_one_or_none()
    if not material or not material.full_text:
        raise ValueError(f"Material {material_id} not found or has no text.")

    doc_text = material.full_text[:80000]  # hard cap for context window
    content_hash = _hash_text(material.full_text)

    response = await acompletion(
        model=MINDMAP_MODEL,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are a structured mind map generator. Return only valid JSON."},
            {"role": "user", "content": GENERATION_PROMPT.format(document_text=doc_text, material_id=material_id)},
        ],
    )

    raw = response.choices[0].message.content.strip()

    mind_map_data = json.loads(raw)

    # Save to DB
    result = await db.execute(
        select(MindMap).where(MindMap.user_id == user_id, MindMap.material_id == material_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.json_data = json.dumps(mind_map_data)
        existing.content_hash = content_hash
        existing.history_stack = "[]"
        existing.generated_at = datetime.now(timezone.utc)
    else:
        db.add(MindMap(
            user_id=user_id,
            material_id=material_id,
            json_data=json.dumps(mind_map_data),
            content_hash=content_hash,
            history_stack="[]",
        ))

    await db.commit()

    return {
        "data": mind_map_data,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "can_undo": False,
    }


async def edit_mind_map(
    db: AsyncSession,
    user_id: int,
    material_id: int,
    instruction: str,
) -> dict:
    """
    Apply a natural language edit instruction to the current mind map.
    Pushes current state onto the history stack before modifying.
    """
    result = await db.execute(
        select(MindMap).where(MindMap.user_id == user_id, MindMap.material_id == material_id)
    )
    mind_map = result.scalar_one_or_none()
    if not mind_map:
        raise ValueError("No mind map exists for this document. Generate one first.")

    current_data = mind_map.json_data
    history = json.loads(mind_map.history_stack or "[]")

    response = await acompletion(
        model=MINDMAP_MODEL,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are a mind map editor. Return only valid JSON."},
            {"role": "user", "content": EDIT_PROMPT.format(current_json=current_data, instruction=instruction)},
        ],
    )

    raw = response.choices[0].message.content.strip()

    updated_data = json.loads(raw)

    # Push old state to history (cap at 20 states)
    history.append(current_data)
    if len(history) > 20:
        history = history[-20:]

    mind_map.json_data = json.dumps(updated_data)
    mind_map.history_stack = json.dumps(history)
    mind_map.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "data": updated_data,
        "generated_at": mind_map.generated_at.isoformat(),
        "can_undo": True,
    }


async def undo_mind_map(
    db: AsyncSession,
    user_id: int,
    material_id: int,
) -> dict:
    """
    Revert the mind map to its previous state from the history stack.
    """
    result = await db.execute(
        select(MindMap).where(MindMap.user_id == user_id, MindMap.material_id == material_id)
    )
    mind_map = result.scalar_one_or_none()
    if not mind_map:
        raise ValueError("No mind map found.")

    history = json.loads(mind_map.history_stack or "[]")
    if not history:
        raise ValueError("Nothing to undo.")

    previous_state = history.pop()
    mind_map.json_data = previous_state
    mind_map.history_stack = json.dumps(history)
    mind_map.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "data": json.loads(previous_state),
        "generated_at": mind_map.generated_at.isoformat(),
        "can_undo": bool(history),
    }
