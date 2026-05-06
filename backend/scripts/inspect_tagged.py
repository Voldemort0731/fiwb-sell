from dotenv import load_dotenv
load_dotenv()

import asyncio
import os
import sys
from app.intelligence.ms_client import get_ms_client
from app.models.database import AsyncSessionLocal, User
from sqlalchemy import select

# Force UTF-8 for windows stdout
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

async def inspect_tagged():
    # 1. Get user tag
    user_id = 0
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).limit(1))
        user = res.scalar_one_or_none()
        if user:
            user_id = user.id
    
    ctag = f"user_{user_id}"
    print(f"--- Listing Documents for {ctag} in Memsapien ---")
    
    sm = get_ms_client()
    # Using "*" retrieves everything
    res = await sm.search(query="*", limit=100, container_tag=ctag)
    
    results = res.get("results", [])
    print(f"Total documents found with tag: {len(results)}")
    
    for idx, doc in enumerate(results):
        meta = doc.get("metadata", {})
        title = doc.get("title", "Untitled")
        utype = meta.get("type", "unknown")
        # Strip/Filter for ASCII
        safe_title = "".join(c for c in title if ord(c) < 128)
        print(f"{idx+1}. [{utype}] {safe_title} (ID: {doc.get('documentId')})")

if __name__ == "__main__":
    asyncio.run(inspect_tagged())
