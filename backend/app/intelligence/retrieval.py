"""
RetrievalOrchestrator - ported from fiwb-mvp reference architecture.
Handles parallel context retrieval from Memsapien for the chatbot.
"""
import asyncio
import logging
from typing import List, Dict, Optional
from openai import AsyncOpenAI
import os
from sqlalchemy import select
from app.models.database import AsyncSessionLocal, User
from app.intelligence.ms_client import get_ms_client
from app.services.openai_service import contextualize_query, get_openai_client

logger = logging.getLogger("uvicorn.error")

from app.services.openai_service import get_openai_client


class RetrievalOrchestrator:
    """
    Parallel retrieval of academic context, memories, and user profile
    from Memsapien. Directly ported from the reference MVP's retrieval.py.
    """

    def __init__(self, user_email: str):
        self.user_email = user_email
        self.sm = get_ms_client()
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
        """Merge two Memsapien raw result dicts, deduplicating by documentId."""
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

        # 🚀 Step 3.1: Fetch user's enrolled courses for shared index search
        enrolled_course_ids = []
        mastery_info = {"recent_metrics": []}
        try:
            async with AsyncSessionLocal() as db:
                user_res = await db.execute(select(User).where(User.email == self.user_email))
                user_obj = user_res.scalar_one_or_none()
                if user_obj:
                    from app.models.database import Course, PerformanceMetric, Enrollment
                    
                    # 1. Courses owned by the user (Professor or Student's own synced courses)
                    courses_res = await db.execute(select(Course.id).where(Course.user_id == user_obj.id))
                    owned_ids = [c[0] for c in courses_res.all()]
                    
                    # 2. Courses the student is enrolled in (Professor-owned courses)
                    enroll_res = await db.execute(select(Enrollment.course_id).where(Enrollment.student_id == user_obj.id))
                    enrolled_ids = [e[0] for e in enroll_res.all()]
                    
                    enrolled_course_ids = list(set(owned_ids + enrolled_ids))
                    
                    metrics_res = await db.execute(select(PerformanceMetric).where(PerformanceMetric.user_id == user_obj.id).order_by(PerformanceMetric.timestamp.desc()).limit(10))
                    mastery_info["recent_metrics"] = [
                        {"type": m.metric_type, "value": m.value, "time": m.timestamp.isoformat()} 
                        for m in metrics_res.scalars().all()
                    ]
        except Exception as e:
            logger.error(f"[Retrieval] Error fetching courses/mastery: {e}")

        # 🚀 Step 3.2: DUAL SEARCH + Shared Course Search
        search_tasks = [
            self.sm.search(query=search_query, limit=FETCH_LIMIT, container_tag=ctag, user_id=uid) if ctag else skip(),
            self.sm.search(query=search_query, limit=FETCH_LIMIT, user_id=uid),
            self.sm.search(query="recent learning insights student progress", limit=20, container_tag=ctag, user_id=uid) if ctag else skip(),
            self.sm.search(query="recent learning insights student progress", limit=20, user_id=uid),
            self.sm.search(query=search_query, limit=20, container_tag=ctag, user_id=uid) if ctag else skip(),
            self.sm.search(query=search_query, limit=20, user_id=uid),
            self.sm.search(query=search_query, limit=20, container_tag=ctag, user_id=uid) if ctag else skip(),
            self.sm.search(query=search_query, limit=20, user_id=uid),
            self.sm.search(query="user learning style strengths gaps profile", limit=10, container_tag=ctag, user_id=uid) if ctag else skip(),
            self.sm.search(query="user learning style strengths gaps profile", limit=10, user_id=uid),
        ]

        # Add shared course searches
        for cid in enrolled_course_ids:
            search_tasks.append(self.sm.search(query=search_query, limit=FETCH_LIMIT, container_tag=f"course_{cid}", user_id=uid))

        results = await asyncio.gather(*search_tasks)
        
        (
            course_tagged, course_untagged,
            memory_tagged, memory_untagged,
            asst_tagged, asst_untagged,
            chat_tagged, chat_untagged,
            profile_tagged, profile_untagged,
        ) = results[:10]
        
        shared_course_results = results[10:]
        
        # Merge shared course results into course_tagged
        for shared_res in shared_course_results:
            course_tagged = self._merge_raw(course_tagged, shared_res)

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
                # Strict user isolation — allow shared course materials (course_ prefix)
                if item_uid and item_uid != uid and not (meta.get("course_id") and str(meta.get("course_id")) in [str(c) for c in enrolled_course_ids]):
                    # Check if it's a course index search (containerTag starts with course_)
                    ct = item.get("containerTag", "")
                    if not ct.startswith("course_"):
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
            "mastery":           mastery_info,
        }


        logger.info(
            f"[Retrieval] Final: course={len(context_data['course_context'])}, "
            f"assistant={len(context_data['assistant_knowledge'])}, "
            f"memories={len(context_data['memories'])}, "
            f"profile={len(context_data['profile'])}"
        )
        return context_data
