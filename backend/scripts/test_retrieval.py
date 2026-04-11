import os
import asyncio
from app.intelligence.sm_client import get_sm_client
from dotenv import load_dotenv

# Load environment
load_dotenv()

async def test_supermemory_retrieval():
    print("--- Supermemory Retrieval Test ---")
    sm = get_sm_client()
    
    # We'll search for something the user has synced
    query = "CS Lecture Notes struct handout"
    print(f"Searching for: '{query}'...")
    
    results = await sm.search(query=query, limit=5)
    
    if not results or not results.get("results"):
        print("[-] No results found for specific query. Trying wildcard search (*)...")
        results = await sm.search(query="*", limit=5)
    
    if results and results.get("results"):
        print(f"[V] Found {len(results['results'])} documents in Supermemory!")
        for idx, doc in enumerate(results["results"]):
            title = doc.get("title", "Untitled")
            doc_id = doc.get("documentId", "No ID")
            print(f"    {idx+1}. [{title}] (ID: {doc_id})")
            chunks = doc.get("chunks", [])
            if chunks:
                snippet = chunks[0].get("content", "")[:150].replace("\n", " ")
                print(f"       Snippet: {snippet}...")
    else:
        print("[X] No data found in Supermemory.")

if __name__ == "__main__":
    asyncio.run(test_supermemory_retrieval())
