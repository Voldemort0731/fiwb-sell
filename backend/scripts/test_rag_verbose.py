import asyncio
import os
import sys
import json
from dotenv import load_dotenv
load_dotenv()
from app.intelligence.retrieval import RetrievalOrchestrator

if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

async def main():
    print("--- Verbose RAG Retrieval Test ---")
    user_email = "owaissayyed2007@gmail.com"
    orchestrator = RetrievalOrchestrator(user_email=user_email)
    
    query = "what example is used in my recursion handout"
    print(f"\nExecuting Orchestrated Retrieval for '{query}'...")
    
    res = await orchestrator.retrieve_context(query)
    
    course_chunks = res.get("course_context", [])
    print(f"\nOrchestrated course_context: {len(course_chunks)} chunks")
    if course_chunks:
        print("First chunk preview:", course_chunks[0].get('content')[:200])

if __name__ == "__main__":
    asyncio.run(main())
