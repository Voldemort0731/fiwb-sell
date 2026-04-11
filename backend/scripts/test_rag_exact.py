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
    print("--- Exact RAG Retrieval Test ---")
    user_email = "owaissayyed2007@gmail.com"
    orchestrator = RetrievalOrchestrator(user_email=user_email)
    
    query = "what example is used in my recursion handout"
    print(f"\nExecuting Orchestrated Retrieval for '{query}'...")
    
    res = await orchestrator.retrieve_context(query)
    
    from app.intelligence.prompt_architect import PromptArchitect
    messages = PromptArchitect.build_messages(
        user_query=query,
        retrieved_chunks=res.get("course_context", []),
        assistant_knowledge=res.get("assistant_knowledge", []),
        chat_assets=res.get("chat_assets", []),
        memories=res.get("memories", []),
        profile=res.get("profile", []),
        query_type="academic_question"
    )
    
    import json
    sys_msg = messages[0]['content']
    print(f"\nSystem Prompt Length (chars): {len(sys_msg)}")
    print(f"System Prompt Snippet (first 1000):\\n{sys_msg[:1000]}...")
    
    user_msg_parts = messages[-1]['content']
    for part in user_msg_parts:
        text = part.get('text', '')
        print(f"\nUserMsg Part Length: {len(text)}")
        if len(text) > 200:
            print(f"Snippet:\\n{text[:500]}...")
        else:
            print(f"Snippet:\\n{text}")

if __name__ == "__main__":
    asyncio.run(main())
