from dotenv import load_dotenv
load_dotenv()

import asyncio
import os
import sys
from app.intelligence.ms_client import get_ms_client

# Force UTF-8 for windows stdout
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

async def inspect_all():
    sm = get_ms_client()
    print("--- Listing ALL Documents in Memsapien ---")
    
    # Using "*" retrieves everything
    res = await sm.search(query="*", limit=50)
    
    results = res.get("results", [])
    print(f"Total documents found: {len(results)}")
    
    for idx, doc in enumerate(results):
        meta = doc.get("metadata", {})
        title = doc.get("title", "Untitled")
        utype = meta.get("type", "unknown")
        # Strip/Filter for ASCII
        safe_title = "".join(c for c in title if ord(c) < 128)
        print(f"{idx+1}. [{utype}] {safe_title} (ID: {doc.get('documentId')})")

if __name__ == "__main__":
    asyncio.run(inspect_all())
