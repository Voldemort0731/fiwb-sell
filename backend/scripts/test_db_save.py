import asyncio
import json
from datetime import datetime, timezone
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import select
from app.models.database import ChatMessage, ChatThread

async def run_test():
    engine = create_async_engine("sqlite+aiosqlite:///d:/FIWB NEW/new-chatbot/backend/fiwb.db", echo=True)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        async with AsyncSessionLocal() as db_save:
            async with db_save.begin():
                thread_id = 52 # hardcoded thread from DB
                citations_json = json.dumps([{"test": "hello"}])
                print("[Chat] COMMIT: Assistant message")
                
                ai_msg = ChatMessage(
                    thread_id=thread_id, 
                    role="assistant", 
                    content="This is a test response",
                    citations=citations_json
                )
                db_save.add(ai_msg)
                await db_save.flush()
                ai_msg_id = ai_msg.id
                print(f"Flush complete: msg_id={ai_msg_id}")
    except Exception as e:
        print("EXCEPTION:", e)

if __name__ == "__main__":
    asyncio.run(run_test())
