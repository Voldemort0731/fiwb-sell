"""
Supermemory client wrapper.
Integrates the official supermemory SDK to perform add, search, and delete operations.
"""
import os
import logging
from dotenv import load_dotenv
from supermemory import AsyncSupermemory

import re

load_dotenv()

logger = logging.getLogger("uvicorn.error")

SUPERMEMORY_API_KEY = os.getenv("SUPERMEMORY_API_KEY")


def _sanitize_tag(tag: str) -> str:
    """
    Sanitize a container tag so it only contains alphanumeric chars,
    hyphens, underscores, and colons — as required by Supermemory.
    Email addresses like 'user@example.com' become 'user_example_com'.
    """
    return re.sub(r"[^a-zA-Z0-9\-_:]", "_", tag)

class MemsapienClient:
    """
    Supermemory SDK client wrapper.
    Conforms to the legacy client interface to minimize other file modifications.
    """

    def __init__(self):
        self.api_key = SUPERMEMORY_API_KEY
        if self.api_key:
            self.client = AsyncSupermemory(api_key=self.api_key)
        else:
            self.client = None
            logger.warning("[SM] SUPERMEMORY_API_KEY is missing from the environment.")

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
        """Add a document to Supermemory."""
        if not self.client:
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

            ctag = _sanitize_tag(container_tag or user_email or "default")

            res = await self.client.documents.add(
                content=safe_content,
                container_tag=ctag,
                metadata=clean_meta
            )
            logger.info(f"[SM] Queued doc for ingestion: {title or 'untitled'} (Job: {res.id})")
            return {"success": True, "data": {"jobId": res.id}}

        except Exception as e:
            logger.error(f"[SM] add_document error: {e}")
            return None

    async def search(self, query: str, filters: dict = None, limit: int = 10, container_tag: str = None, user_id: str = "anonymous"):
        """Search Supermemory and return a dict representation of results."""
        if not self.client:
            return {"results": []}

        try:
            final_query = query.strip() if query and query.strip() else "*"
            ctag = _sanitize_tag(container_tag or "default")

            res = await self.client.search.execute(
                q=final_query,
                container_tag=ctag,
                limit=limit
            )
            
            results_dict = []
            for doc in res.results:
                chunks_dict = []
                for chunk in doc.chunks:
                    chunks_dict.append({
                        "content": chunk.content,
                        "score": chunk.score,
                        "position": chunk.position,
                        "isRelevant": chunk.is_relevant
                    })
                
                results_dict.append({
                    "documentId": doc.document_id,
                    "title": doc.title,
                    "metadata": doc.metadata,
                    "score": doc.score,
                    "type": doc.type,
                    "updatedAt": doc.updated_at,
                    "createdAt": doc.created_at,
                    "chunks": chunks_dict,
                    "summary": doc.summary,
                    "content": doc.content
                })
            
            return {"results": results_dict}
        except Exception as e:
            logger.error(f"[SM] Search error: {e}")
            return {"results": []}

    async def delete_document(self, document_id: str) -> bool:
        """Delete a document by its ID."""
        if not self.client:
            return False
        try:
            await self.client.documents.delete(id=document_id)
            return True
        except Exception as e:
            logger.error(f"[SM] delete_document error: {e}")
            return False

    async def delete_message_memories(self, user_email: str, message_id: int):
        """Finds and deletes all memories associated with a specific assistant message ID."""
        if not self.client:
            return
            
        try:
            ctag = _sanitize_tag(user_email or "default")
            res = await self.search(query="*", limit=50, container_tag=ctag)
            
            docs_to_delete = res.get("results", [])
            deleted_count = 0
            for doc in docs_to_delete:
                meta = doc.get("metadata", {}) or {}
                if str(meta.get("message_id")) == str(message_id):
                    doc_id = doc.get("documentId")
                    if doc_id:
                        await self.delete_document(doc_id)
                        deleted_count += 1
                        
            logger.info(f"[SM] Deleted {deleted_count} docs for message_id {message_id}.")
        except Exception as e:
            logger.error(f"[SM] Error deleting message memories: {e}")

    def flatten_v3(self, res):
        """Flatten nested results into chunks with parent metadata."""
        if not res or not isinstance(res, dict):
            return []
        
        all_chunks = []
        for doc in res.get("results", []):
            doc_id = doc.get("documentId")
            doc_title = doc.get("title")
            meta = doc.get("metadata", {}) or {}
            if doc_title and "title" not in meta:
                meta["title"] = doc_title
                
            for chunk in doc.get("chunks", []):
                content = chunk.get("content", "")
                if any(x in content for x in ["PK\x03\x04", "PK\x01\x02", "PK\x05\x06", "PK\x07\x08"]):
                    continue
                
                sample = content[:500]
                if sample:
                    printable_count = sum(1 for c in sample if c.isprintable() or c.isspace())
                    if (printable_count / len(sample)) < 0.3:
                        continue
                
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
