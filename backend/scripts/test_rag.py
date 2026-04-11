from dotenv import load_dotenv
load_dotenv()

import asyncio
import os
import sys
import json
from app.intelligence.retrieval import RetrievalOrchestrator
from app.models.database import AsyncSessionLocal, User
from sqlalchemy import select

# Force UTF-8 for windows stdout
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

async def test_rag_retrieval():
    print("--- RAG Retrieval Diagnostic (Safe Encoding) ---")
    
    # 1. Get user email
    user_email = ""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).limit(1))
        user = res.scalar_one_or_none()
        if user:
            user_email = user.email
            print(f"Testing for user: {user_email}\n")
        else:
            print("[!] No user in DB.")
            return

    orchestrator = RetrievalOrchestrator(user_email)
    
    # query = "What are structs in C++? Check my lecture notes."
    query = "struct" # Broad keyword
    print(f"Simulating Query: '{query}'")
    
    context = await orchestrator.retrieve_context(
        query=query,
        query_type="academic_question",
        history=[]
    )
    
    print("\n" + "="*50)
    print("RETRIEVED CONTEXT STREAMS")
    print("="*50)
    
    streams = [
        ("Course Context (Classroom)", "course_context"),
        ("Assistant Knowledge (Uploads)", "assistant_knowledge"),
        ("Memories (Digital Twin)", "memories"),
        ("Profile (Learning Style)", "profile")
    ]
    
    for label, key in streams:
        data = context.get(key, [])
        print(f"\n[{label}] - Found {len(data)} chunks")
        for idx, item in enumerate(data[:3]):
            meta = item.get("metadata", {})
            title = meta.get("title") or meta.get("file_name") or "Untitled"
            # Strip emojis manually just to be safe if sys.stdout hack fails
            safe_title = "".join(c for c in title if c.isprintable())
            print(f"  {idx+1}. [{safe_title}]")
            content = str(item.get("content", ""))[:200].replace("\n", " ")
            safe_content = "".join(c for c in content if ord(c) < 128) # ASCII filter for final safety
            print(f"     Content: {safe_content}...")

    print("\n" + "="*50)
    print("SUMMARY")
    print(f"Rewritten Query: {context.get('rewritten_query')}")
    total_found = sum(len(context.get(k, [])) for k in ["course_context", "assistant_knowledge", "chat_assets", "memories", "profile"])
    print(f"Total Context Chunks: {total_found}")
    print("="*50)

if __name__ == "__main__":
    asyncio.run(test_rag_retrieval())
