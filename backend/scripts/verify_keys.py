import os
import asyncio
import httpx
from openai import AsyncOpenAI
from dotenv import load_dotenv

# Load environment
load_dotenv()

async def verify_openai():
    print("--- Verification: OpenAI ---")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[X] OPENAI_API_KEY is missing!")
        return False
    
    try:
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "Hello, are you functional?"}],
            max_tokens=10
        )
        print(f"[V] OpenAI Response: {response.choices[0].message.content}")
        return True
    except Exception as e:
        print(f"[X] OpenAI Error: {e}")
        return False

async def verify_memsapien():
    print("\n--- Verification: Memsapien ---")
    api_key = os.getenv("MEMSAPIEN_API_KEY")
    base_url = os.getenv("MEMSAPIEN_URL", "https://api.memsapien.ai").rstrip("/")
    if not api_key:
        print("[X] MEMSAPIEN_API_KEY is missing!")
        return False
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            response = await client.post(
                f"{base_url}/v3/search", 
                headers=headers, 
                json={"q": "test", "limit": 1}
            )
            if response.status_code == 200:
                print(f"[V] Memsapien API reachable (Status 200)")
                return True
            else:
                print(f"[X] Memsapien Error: Status {response.status_code} - {response.text}")
                return False
    except Exception as e:
        print(f"[X] Memsapien Connection Error: {e}")
        return False

async def verify_db():
    print("\n--- Verification: Local Database ---")
    import sqlite3
    db_path = "fiwb.db"
    if not os.path.exists(db_path):
        print("[X] fiwb.db not found!")
        return False
        
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM courses")
        courses = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM materials")
        materials = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM users")
        users = c.fetchone()[0]
        print(f"[V] Database connected:")
        print(f"   - Users: {users}")
        print(f"   - Courses: {courses}")
        print(f"   - Materials: {materials}")
        conn.close()
        return True
    except Exception as e:
        print(f"[X] Database Error: {e}")
        return False

async def main():
    print("Starting FIWB Backend Diagnostic...\n")
    results = await asyncio.gather(
        verify_openai(),
        verify_memsapien(),
        verify_db()
    )
    
    print("\n" + "="*30)
    if all(results):
        print("ALL SYSTEMS OPERATIONAL")
    else:
        print("SOME SYSTEMS FAILED")
    print("="*30)

if __name__ == "__main__":
    asyncio.run(main())
