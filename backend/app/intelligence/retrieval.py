"""
RetrievalOrchestrator - ported from fiwb-mvp reference architecture.
Handles parallel context retrieval from Memsapien for the chatbot.
"""
import asyncio
import logging
from typing import List, Dict, Optional
from openai import AsyncOpenAI
import os
from sqlalchemy import select, or_
from app.models.database import AsyncSessionLocal, User, Material, Course, Enrollment
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

    async def _local_sqlite_search(
        self, query: str, enrolled_course_ids: List[int], user_id: Optional[int], limit: int = 15
    ) -> List[Dict]:
        """
        Fallback: keyword search over Material.full_text in SQLite.
        Returns chunk-formatted dicts compatible with flatten_v3 output.
        """
        chunks = []
        keywords = [w.lower() for w in query.split() if len(w) > 3][:10]
        if not keywords:
            keywords = [query.lower()[:20]]

        try:
            async with AsyncSessionLocal() as db:
                # Fetch materials from enrolled courses + personal materials
                conditions = []
                if enrolled_course_ids:
                    conditions.append(Material.course_id.in_(enrolled_course_ids))
                if user_id:
                    conditions.append(Material.user_id == user_id)

                if not conditions:
                    return []

                from sqlalchemy import or_ as _or
                res = await db.execute(
                    select(Material).where(_or(*conditions))
                )
                materials = res.scalars().all()

                for mat in materials:
                    text = mat.full_text or mat.content_preview or ""
                    if not text:
                        continue

                    text_lower = text.lower()
                    # Score by how many keywords appear
                    score = sum(1 for kw in keywords if kw in text_lower)
                    if score == 0:
                        continue

                    # Extract a relevant snippet (find first keyword hit)
                    snippet_start = 0
                    for kw in keywords:
                        idx = text_lower.find(kw)
                        if idx >= 0:
                            snippet_start = max(0, idx - 200)
                            break

                    snippet = text[snippet_start:snippet_start + 800].strip()

                    # Estimate page number (form 0C splits or ~2000 chars per page)
                    page_num = 1
                    if snippet_start > 0:
                        if "\x0c" in text[:snippet_start]:
                            page_num = text[:snippet_start].count("\x0c") + 1
                        else:
                            page_num = max(1, snippet_start // 2000 + 1)

                    chunks.append({
                        "content": snippet,
                        "metadata": {
                            "material_id": str(mat.id),
                            "title": mat.title,
                            "file_name": mat.title,
                            "course_id": str(mat.course_id) if mat.course_id else None,
                            "source": mat.source or "local",
                            "source_link": mat.source_link,
                            "type": "academic_material",
                            "page_number": page_num,
                            "_local_score": score,
                        }
                    })

            # Sort by score descending, cap at limit
            chunks.sort(key=lambda c: c["metadata"].get("_local_score", 0), reverse=True)
            return chunks[:limit]

        except Exception as e:
            logger.error(f"[Retrieval] Local search error: {e}")
            return []

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

        course_chunks = flatten(course_res)

        # 🔄 LOCAL FALLBACK: If Supermemory returned no course content (e.g. still indexing),
        # fall back to direct keyword search over SQLite Material.full_text.
        if not course_chunks and is_academic:
            logger.info("[Retrieval] Supermemory has no course results — falling back to local SQLite search.")
            course_chunks = await self._local_sqlite_search(
                query=search_query,
                enrolled_course_ids=enrolled_course_ids,
                user_id=user_id,
                limit=15,
            )
            if course_chunks:
                logger.info(f"[Retrieval] Local SQLite fallback found {len(course_chunks)} chunks.")

        context_data = {
            "course_context":    course_chunks,
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

