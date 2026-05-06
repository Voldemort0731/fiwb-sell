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

async def inspect():
    sm = get_ms_client()
    query = "struct handout"
    print(f"--- Raw Inspection of Memsapien for '{query}' ---")
    
    res = await sm.search(query=query, limit=5)
    
    if not res or not res.get("results"):
        print("No results found.")
        return
        
    for idx, doc in enumerate(res["results"]):
        print(f"\n[{idx+1}] Title: {doc.get('title')}")
        print(f"    DocumentId: {doc.get('documentId')}")
        print(f"    ContainerTag: {doc.get('containerTag')}")
        print(f"    Metadata Keys: {list(doc.get('metadata', {}).keys())}")
        chunks = doc.get("chunks", [])
        print(f"    Chunk Count: {len(chunks)}")
        if chunks:
            content = chunks[0].get("content", "")
            print(f"    First Chunk Length: {len(content)}")
            safe_content = "".join(c for c in content[:200] if ord(c) < 128)
            print(f"    Content Snippet: {safe_content}...")

if __name__ == "__main__":
    asyncio.run(inspect())
