from dotenv import load_dotenv
load_dotenv()

import asyncio
import os
import sys
import json
from app.intelligence.retrieval import RetrievalOrchestrator
from app.models.database import AsyncSessionLocal, User
from sqlalchemy import select
from app.intelligence.ms_client import get_ms_client

# Force UTF-8 for windows stdout
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

async def test_rag_raw_audit():
    print("--- 🔬 RAG Raw Search Audit ---")
    
    # 1. Get user email
    user_email = ""
    user_id = 0
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).limit(1))
        user = res.scalar_one_or_none()
        if user:
            user_email = user.email
            user_id = user.id
            print(f"Testing for user: {user_email}\n")

    # 2. Manual Raw Search (Replicating RetrievalOrchestrator steps)
    sm = get_ms_client()
    ctag = f"user_{user_id}"
    query = "struct"
    
    print(f"Searching ctag='{ctag}' for query='{query}'...")
    res = await sm.search(query=query, limit=20, container_tag=ctag)
    
    results = res.get("results", [])
    print(f"\n[Raw Tagged Search] Found {len(results)} items")
    for idx, r in enumerate(results):
        meta = r.get("metadata", {})
        print(f"  {idx+1}. {r.get('title')} (ID: {r.get('documentId')}, Type: {meta.get('type')}, User: {meta.get('user_id')})")

    # 3. Check specific file titles from the re-sync
    print("\n--- Checking specific document availability ---")
    check_titles = ["Lec-1.pdf", "Attachment: lec-11-struct.handout.pdf"]
    for title in check_titles:
        r2 = await sm.search(query=title, limit=1)
        r2_len = len(r2.get("results", []))
        print(f"Search for '{title}': {'FOUND' if r2_len > 0 else 'NOT FOUND'}")

if __name__ == "__main__":
    asyncio.run(test_rag_raw_audit())
