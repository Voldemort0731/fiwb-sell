from dotenv import load_dotenv
load_dotenv()

import asyncio
import sys
from app.intelligence.ms_client import get_ms_client
from app.models.database import AsyncSessionLocal, User
from sqlalchemy import select

async def main():
    sm = get_ms_client()
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).limit(1))
        user = res.scalar_one_or_none()
        if not user:
            print("No user found in DB")
            return
        user_email = user.email

    print(f"--- Wiping academic_material for user: {user_email} ---")
    
    # Search for all academic_material for this user
    # Note: we use query='*' and limit=100 (API max)
    res = await sm.search(query="*", limit=100)
    results = res.get("results", [])
    
    to_delete = [
        r.get("documentId") 
        for r in results 
        if r.get("metadata", {}).get("user_id") == user_email 
        and r.get("metadata", {}).get("type") == "academic_material"
    ]
    
    print(f"Found {len(to_delete)} candidates for deletion in this batch.")
    
    deleted_count = 0
    for doc_id in to_delete:
        print(f"  Deleting {doc_id}...", end=" ", flush=True)
        success = await sm.delete_document(doc_id)
        if success:
            print("OK")
            deleted_count += 1
        else:
            print("FAILED")
            
    print(f"\nSuccessfully deleted {deleted_count} documents.")

if __name__ == "__main__":
    asyncio.run(main())
