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

async def check_meta():
    sm = get_ms_client()
    query = "lec-11-struct.handout.pdf"
    print(f"--- Checking Metadata for '{query}' ---")
    
    res = await sm.search(query=query, limit=1)
    results = res.get("results", [])
    
    if not results:
        print("No results found.")
        return
        
    doc = results[0]
    print(f"Title: {doc.get('title')}")
    print(f"DocumentId: {doc.get('documentId')}")
    print(f"ContainerTag: {doc.get('containerTag')}")
    print("\nFull Metadata:")
    print(json.dumps(doc.get("metadata", {}), indent=2))

if __name__ == "__main__":
    asyncio.run(check_meta())
