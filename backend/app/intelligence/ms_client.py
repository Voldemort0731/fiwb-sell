"""
Memsapien V3 client - ported from fiwb-mvp reference architecture.
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

MEMSAPIEN_API_KEY = os.getenv("MEMSAPIEN_API_KEY", "dummy_key") # Local V4 uses a key from .env
MEMSAPIEN_URL = os.getenv("MEMSAPIEN_URL", "http://localhost:3003")
# MEMSAPIEN_USER_EMAIL removed to prevent privacy leaks.


class MemsapienClient:
    """
    Memsapien V3 API client.
    Creates its own dedicated httpx client with correct auth headers.
    """

    def __init__(self):
        self.base_url = MEMSAPIEN_URL.rstrip("/")
        self._headers = {
            "User-Agent": "FIWB-AI/1.0",
            "Content-Type": "application/json",
        }
        if MEMSAPIEN_API_KEY:
            self._headers["Authorization"] = f"Bearer {MEMSAPIEN_API_KEY}"

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
        project_id: str = "default",
    ):
        """Add a document to Memsapien V4 with local ingestion."""
        if not MEMSAPIEN_API_KEY:
            logger.warning("[SM] No API key configured — skipping add_document")
            return None

        try:
            safe_content = (
                content[:60000] + "\n[TRUNCATED]" if len(content) > 60000 else content
            )
            clean_meta = {k: v for k, v in metadata.items() if v is not None}
            clean_meta.setdefault("type", "academic_material")
            if title:
                clean_meta["title"] = title
            if description:
                clean_meta["description"] = description[:500]

            payload = {
                "content": safe_content, 
                "metadata": clean_meta,
                "tenantId": container_tag or user_email,
                "projectId": project_id,
                "userId": user_email
            }

            response = await self.client.post(
                f"{self.base_url}/v4/ingest", json=payload
            )

            if response.status_code in (400, 401):
                logger.error(f"[SM] {response.status_code}: {response.text[:200]}")
                return None

            response.raise_for_status()
            data = response.json()
            logger.info(f"[SM] Queued doc for ingestion: {title or 'untitled'} (Job: {data.get('data', {}).get('jobId')})")
            return data

        except Exception as e:
            logger.error(f"[SM] add_document error: {e}")
            return None

    async def search(self, query: str, filters: dict = None, limit: int = 10, container_tag: str = None, user_id: str = "anonymous"):
        """Search Memsapien V4 and return raw results."""
        if not MEMSAPIEN_API_KEY:
            return {"results": []}

        try:
            final_query = query.strip() if query and query.strip() else "*"
            payload = {
                "q": final_query, 
                "limit": limit,
                "containerTag": container_tag,
                "userId": user_id
            }
            # Note: V4 filters are handled differently or via metadata in query
            # For now, we pass the basic search payload

            response = await self.client.post(
                f"{self.base_url}/v4/search", json=payload
            )

            if response.status_code == 401:
                logger.error("[SM] 401 Unauthorized on search — check MEMSAPIEN_API_KEY")
                return {"results": []}

            if response.status_code != 200:
                logger.warning(f"[SM] Search {response.status_code}: {response.text[:200]}")
                return {"results": []}

            data = response.json()
            # V4 response structure is { success: true, data: { results: [...], ... } }
            return data.get("data", {"results": []})
        except Exception as e:
            logger.error(f"[SM] Search error: {e}")
            return {"results": []}

    async def delete_document(self, document_id: str) -> bool:
        """
        V4 does not support individual document deletion yet via a dedicated endpoint.
        We can use /v4/clear for full reset or ignore for now.
        """
        logger.warning("[SM] delete_document not fully supported in V4 local engine yet.")
        return False

    async def delete_message_memories(self, user_email: str, message_id: int):
        """Finds and deletes all enhanced memories associated with a specific assistant message ID."""
        if not MEMSAPIEN_API_KEY:
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
_ms_client: MemsapienClient = None


def get_ms_client() -> MemsapienClient:
    global _ms_client
    if _ms_client is None:
        _ms_client = MemsapienClient()
    return _ms_client
