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

async def search_item():
    sm = get_ms_client()
    query = "Lec-1"
    print(f"--- Searching Memsapien for specific item: '{query}' ---")
    
    # Try with tag first
    res = await sm.search(query=query, limit=5, container_tag="user_1")
    results = res.get("results", [])
    print(f"Found with tag user_1: {len(results)}")
    for r in results:
        print(f"  - {r.get('title')} (ID: {r.get('documentId')})")
        
    # Try without tag
    res_no_tag = await sm.search(query=query, limit=5)
    results_no_tag = res_no_tag.get("results", [])
    print(f"Found without tag: {len(results_no_tag)}")
    for r in results_no_tag:
        print(f"  - {r.get('title')} (ID: {r.get('documentId')})")

if __name__ == "__main__":
    asyncio.run(search_item())
