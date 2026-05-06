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

async def test_search():
    sm = get_ms_client()
    query = "recursion handout"
    print(f"--- 🔍 SEARCHING NEW KEY FOR: '{query}' ---")
    
    # 1. Broad keyword search
    res = await sm.search(query=query, limit=10)
    results = res.get("results", [])
    print(f"Results found with keywords: {len(results)}")
    for r in results:
        print(f"  - {r.get('title')} [{r.get('metadata', {}).get('type')}]")

if __name__ == "__main__":
    asyncio.run(test_search())
