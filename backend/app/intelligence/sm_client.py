"""
Supermemory V3 client - ported from fiwb-mvp reference architecture.
Handles all add/search/delete operations with proper retry logic.
"""
import httpx
import json
import asyncio
import random
import logging
import os
from dotenv import load_dotenv

# Ensure .env is loaded before module-level constants are initialized
load_dotenv()

logger = logging.getLogger("uvicorn.error")

SUPERMEMORY_API_KEY = os.getenv("SUPERMEMORY_API_KEY", "")
SUPERMEMORY_URL = os.getenv("SUPERMEMORY_URL", "https://api.supermemory.ai")
# SUPERMEMORY_USER_EMAIL removed to prevent privacy leaks.


class SupermemoryClient:
    """
    Supermemory V3 API client.
    Creates its own dedicated httpx client with correct auth headers.
    """

    def __init__(self):
        self.base_url = SUPERMEMORY_URL.rstrip("/")
        self._headers = {
            "User-Agent": "FIWB-AI/1.0",
            "Content-Type": "application/json",
        }
        if SUPERMEMORY_API_KEY:
            self._headers["Authorization"] = f"Bearer {SUPERMEMORY_API_KEY}"

        self.client = httpx.AsyncClient(
            headers=self._headers,
            timeout=httpx.Timeout(30.0),
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
        )

    # _effective_user_id logic removed to ensure strictly authenticated identity.

    async def add_document(
        self,
        content: str,
        metadata: dict,
        user_email: str,
        title: str = None,
        description: str = None,
        container_tag: str = None,
    ):
        """Add a document to Supermemory with exponential-backoff retry on rate limit."""
        if not SUPERMEMORY_API_KEY:
            logger.warning("[SM] No API key configured — skipping add_document")
            return None

        max_retries = 3
        for attempt in range(max_retries):
            try:
                safe_content = (
                    content[:60000] + "\n[TRUNCATED]" if len(content) > 60000 else content
                )
                clean_meta = {k: v for k, v in metadata.items() if v is not None}
                clean_meta.setdefault("type", "academic_material")
                clean_meta["user_id"] = user_email # Use authenticated email directly

                payload = {"content": safe_content, "metadata": clean_meta}
                if title:
                    payload["title"] = title
                if description:
                    payload["description"] = description[:500]
                # if container_tag:
                #     payload["containerTag"] = container_tag

                response = await self.client.post(
                    f"{self.base_url}/v3/documents", json=payload
                )

                if response.status_code == 429:
                    wait = (2**attempt) + random.random()
                    logger.warning(
                        f"[SM] 429 raw body: {response.text}"
                    )
                    logger.warning(
                        f"[SM] Rate limited. Retrying in {wait:.1f}s (attempt {attempt+1})"
                    )
                    await asyncio.sleep(wait)
                    continue

                if response.status_code in (400, 401):
                    logger.error(f"[SM] {response.status_code}: {response.text[:200]}")
                    return None

                response.raise_for_status()
                data = response.json()
                logger.info(f"[SM] Added doc: {title or 'untitled'}")
                return data

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < max_retries - 1:
                    continue
                logger.error(f"[SM] HTTP {e.response.status_code} on add_document")
                return None
            except Exception as e:
                logger.error(f"[SM] add_document error: {e}")
                return None

        return None

    async def search(self, query: str, filters: dict = None, limit: int = 10, container_tag: str = None):
        """Search Supermemory and return raw V3 response."""
        if not SUPERMEMORY_API_KEY:
            return {"results": []}

        try:
            final_query = query.strip() if query and query.strip() else "*"
            payload = {"q": final_query, "limit": limit}
            if filters:
                payload["filters"] = filters
            if container_tag:
                payload["containerTag"] = container_tag

            response = await self.client.post(
                f"{self.base_url}/v3/search", json=payload
            )

            if response.status_code == 401:
                logger.error("[SM] 401 Unauthorized on search — check SUPERMEMORY_API_KEY")
                return {"results": []}

            if response.status_code != 200:
                logger.warning(f"[SM] Search {response.status_code}: {response.text[:200]}")
                return {"results": []}

            return response.json()
        except Exception as e:
            logger.error(f"[SM] Search error: {e}")
            return {"results": []}

    async def delete_document(self, document_id: str) -> bool:
        """Deletes a document from Supermemory by its ID."""
        if not SUPERMEMORY_API_KEY:
            return False
            
        try:
            response = await self.client.delete(f"{self.base_url}/v3/documents/{document_id}")
            if response.status_code in (200, 204):
                logger.info(f"[SM] Deleted document: {document_id}")
                return True
            logger.warning(f"[SM] Failed to delete doc {document_id} — {response.status_code}: {response.text[:100]}")
            return False
        except Exception as e:
            logger.error(f"[SM] Delete error for {document_id}: {e}")
            return False

    async def delete_message_memories(self, user_email: str, message_id: int):
        """Finds and deletes all enhanced memories associated with a specific assistant message ID."""
        if not SUPERMEMORY_API_KEY:
            return
            
        try:
            filters = {
                "AND": [
                    {"key": "user_id", "value": user_email},
                    {"key": "message_id", "value": str(message_id)}
                ]
            }
            res = await self.search(query="*", filters=filters, limit=20)
            
            docs_to_delete = res.get("results", [])
            for doc in docs_to_delete:
                doc_id = doc.get("documentId")
                if doc_id:
                    await self.delete_document(doc_id)
                    
            logger.info(f"[SM] Deleted {len(docs_to_delete)} docs for message_id {message_id}.")
        except Exception as e:
            logger.error(f"[SM] Error deleting message memories: {e}")

    def flatten_v3(self, res):
        """Flatten nested V3 results into chunks with parent metadata."""
        if not res or not isinstance(res, dict):
            return []
        
        all_chunks = []
        for doc in res.get("results", []):
            doc_id = doc.get("documentId")
            doc_title = doc.get("title")
            meta = doc.get("metadata", {})
            if doc_title and "title" not in meta:
                meta["title"] = doc_title
                
            for chunk in doc.get("chunks", []):
                # 🚀 SANITY CHECK: Softened binary filter (Refined in Step 2562)
                content = chunk.get("content", "")
                if any(x in content for x in ["PK\x03\x04", "PK\x01\x02", "PK\x05\x06", "PK\x07\x08"]):
                    continue
                
                sample = content[:500]
                if sample:
                    printable_count = sum(1 for c in sample if c.isprintable() or c.isspace())
                    if (printable_count / len(sample)) < 0.3:
                        continue
                
                # Combine doc metadata, chunk metadata, and doc_id
                chunk_meta = {**meta, **chunk.get("metadata", {})}
                chunk_meta["documentId"] = doc_id
                all_chunks.append({"content": content, "metadata": chunk_meta})
                
        return all_chunks


# Singleton instance
_sm_client: SupermemoryClient = None


def get_sm_client() -> SupermemoryClient:
    global _sm_client
    if _sm_client is None:
        _sm_client = SupermemoryClient()
    return _sm_client
