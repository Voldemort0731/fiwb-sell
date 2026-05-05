"""
RetrievalOrchestrator - ported from fiwb-mvp reference architecture.
Handles parallel context retrieval from Supermemory for the chatbot.
"""
import asyncio
import logging
from typing import List, Dict, Optional
from openai import AsyncOpenAI
import os
from sqlalchemy import select

from app.models.database import AsyncSessionLocal, User
from app.intelligence.sm_client import get_sm_client
from app.services.openai_service import contextualize_query

logger = logging.getLogger("uvicorn.error")

_openai_client: AsyncOpenAI = None


def get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _openai_client


class RetrievalOrchestrator:
    """
    Parallel retrieval of academic context, memories, and user profile
    from Supermemory. Directly ported from the reference MVP's retrieval.py.
    """

    def __init__(self, user_email: str):
        self.user_email = user_email
        self.sm = get_sm_client()
        self.openai = get_openai_client()
        self.user_id: Optional[int] = None

    async def _ensure_user_id(self) -> Optional[int]:
        """Fetch the numeric user ID for containerTag isolation."""
        if self.user_id:
            return self.user_id

        try:
            async with AsyncSessionLocal() as db:
                res = await db.execute(select(User).where(User.email == self.user_email))
                user = res.scalar_one_or_none()
                if user:
                    self.user_id = user.id
        except Exception as e:
            logger.error(f"[Retrieval] Error fetching user ID: {e}")

        return self.user_id


    def _merge_raw(self, r1: dict, r2: dict) -> dict:
        """Merge two Supermemory raw result dicts, deduplicating by documentId."""
        seen = set()
        merged = []
        for item in r1.get("results", []) + r2.get("results", []):
            doc_id = item.get("documentId")
            if doc_id and doc_id in seen:
                continue
            if doc_id:
                seen.add(doc_id)
            merged.append(item)
        return {"results": merged}

    async def retrieve_context(
        self, query: str, query_type: str = "academic_question", history: List[Dict] = None
    ) -> Dict:
        """
        Parallel retrieval from 5 context streams with dual-search isolation.
        Always runs both tagged (material docs) and untagged (conversation memories) searches,
        then merges and filters the results.
        """

        # 🚀 Step 1: Prep isolation
        user_id = await self._ensure_user_id()
        ctag = f"user_{user_id}" if user_id else None

        # 🚀 Step 2: Contextualize query
        search_query = await contextualize_query(query, history)
        logger.info(f"[Retrieval] Rewritten query: {search_query}")

        uid = self.user_email
        FETCH_LIMIT = 60
        is_academic = query_type != "general_chat"

        logger.info(f"[Retrieval] Dual-search for '{uid}' (tag: {ctag})")

        async def skip():
            return {"results": []}

        # 🚀 Step 3: DUAL SEARCH — Run tagged + untagged in parallel for each stream
        # Tagged results: material PDFs, course files indexed with containerTag
        # Untagged results: conversation memories, question logs with no tag
        if is_academic:
            (
                course_tagged, course_untagged,
                memory_tagged, memory_untagged,
                asst_tagged, asst_untagged,
                chat_tagged, chat_untagged,
                profile_tagged, profile_untagged,
            ) = await asyncio.gather(
                self.sm.search(query=search_query, limit=FETCH_LIMIT, container_tag=ctag) if ctag else skip(),
                self.sm.search(query=search_query, limit=FETCH_LIMIT),
                self.sm.search(query="recent learning insights student progress", limit=20, container_tag=ctag) if ctag else skip(),
                self.sm.search(query="recent learning insights student progress", limit=20),
                self.sm.search(query=search_query, limit=20, container_tag=ctag) if ctag else skip(),
                self.sm.search(query=search_query, limit=20),
                self.sm.search(query=search_query, limit=20, container_tag=ctag) if ctag else skip(),
                self.sm.search(query=search_query, limit=20),
                self.sm.search(query="user learning style strengths gaps profile", limit=10, container_tag=ctag) if ctag else skip(),
                self.sm.search(query="user learning style strengths gaps profile", limit=10),
            )
        else:
            course_tagged = course_untagged = {"results": []}
            memory_tagged = memory_untagged = {"results": []}
            asst_tagged = asst_untagged = {"results": []}
            chat_tagged = chat_untagged = {"results": []}
            profile_tagged, profile_untagged = await asyncio.gather(
                self.sm.search(query="user learning style strengths gaps profile", limit=10, container_tag=ctag) if ctag else skip(),
                self.sm.search(query="user learning style strengths gaps profile", limit=10),
            )

        # Merge tagged + untagged
        course_raw   = self._merge_raw(course_tagged, course_untagged)
        memory_raw   = self._merge_raw(memory_tagged, memory_untagged)
        asst_raw     = self._merge_raw(asst_tagged, asst_untagged)
        chat_raw     = self._merge_raw(chat_tagged, chat_untagged)
        profile_raw  = self._merge_raw(profile_tagged, profile_untagged)

        # 🚀 STEP 4: CLIENT-SIDE USER ISOLATION FILTER (safety layer)
        def filter_results(raw_res, allowed_types=None, exclude_types=None):
            if not raw_res or "results" not in raw_res:
                return {"results": []}

            filtered = []
            for item in raw_res.get("results", []):
                meta = item.get("metadata", {})
                item_uid = meta.get("user_id")
                item_type = meta.get("type")

                # Strict user isolation
                if item_uid and item_uid != uid:
                    continue
                # Type allow/block
                if allowed_types and item_type not in allowed_types:
                    continue
                if exclude_types and item_type in exclude_types:
                    continue

                filtered.append(item)

            return {"results": filtered}

        course_res  = filter_results(course_raw,  exclude_types=["enhanced_memory", "user_profile"])
        memory_res  = filter_results(memory_raw,  allowed_types=["enhanced_memory"])
        asst_res    = filter_results(asst_raw,    allowed_types=["assistant_knowledge"])
        chat_res    = filter_results(chat_raw,    allowed_types=["chat_upload"])
        profile_res = filter_results(profile_raw, allowed_types=["user_profile"])

        logger.info(
            f"[Retrieval] Filtered: course={len(course_res['results'])}, "
            f"memory={len(memory_res['results'])}, "
            f"assistant={len(asst_res['results'])}, "
            f"profile={len(profile_res['results'])}"
        )

        # 🚀 STEP 5: FLATTEN
        flatten = self.sm.flatten_v3

        context_data = {
            "course_context":    flatten(course_res),
            "assistant_knowledge": flatten(asst_res),
            "chat_assets":       flatten(chat_res),
            "memories":          flatten(memory_res),
            "profile":           flatten(profile_res),
            "rewritten_query":   search_query,
        }


        logger.info(
            f"[Retrieval] Final: course={len(context_data['course_context'])}, "
            f"assistant={len(context_data['assistant_knowledge'])}, "
            f"memories={len(context_data['memories'])}, "
            f"profile={len(context_data['profile'])}"
        )
        return context_data
