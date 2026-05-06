from dotenv import load_dotenv
load_dotenv()

import asyncio
import os
import sys
import json
from app.intelligence.ms_client import get_ms_client

# Force UTF-8 for windows stdout
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

async def test_tagged():
    sm = get_ms_client()
    tag = "user_1"
    query = "struct" # Broad keyword
    
    print(f"--- 🔍 TAGGED SEARCH AUDIT (Tag: {tag}, Query: {query}) ---")
    
    # 1. Search with tag
    res = await sm.search(query=query, limit=10, container_tag=tag)
    results = res.get("results", [])
    print(f"Items found with tag '{tag}': {len(results)}")
    for r in results:
        print(f"  - {r.get('title')} [{r.get('metadata', {}).get('type')}] (ID: {r.get('documentId')})")

    # 2. Search without tag
    res_no = await sm.search(query=query, limit=10)
    results_no = res_no.get("results", [])
    print(f"\nItems found without tag: {len(results_no)}")
    for r in results_no:
        print(f"  - {r.get('title')} [{r.get('metadata', {}).get('type')}] (ID: {r.get('documentId')})")

    # 3. List ALL items in that tag (Wildcard)
    print(f"\n--- 📋 LISTING ALL IN TAG: {tag} ---")
    res_all = await sm.search(query="*", limit=50, container_tag=tag)
    results_all = res_all.get("results", [])
    print(f"Total in tag '{tag}': {len(results_all)}")
    for idx, r in enumerate(results_all):
        print(f"  {idx+1}. {r.get('title')} [{r.get('metadata', {}).get('type')}]")

if __name__ == "__main__":
    asyncio.run(test_tagged())
