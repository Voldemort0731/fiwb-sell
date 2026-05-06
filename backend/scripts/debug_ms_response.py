from dotenv import load_dotenv
load_dotenv()

import asyncio
import os
import sys
from sqlalchemy import select
from app.models.database import AsyncSessionLocal, Material, User, Course
from app.intelligence.ms_client import get_ms_client

async def debug_one():
    print("--- DEBUGGING ONE DOCUMENT INDEXING ---")
    sm = get_ms_client()
    
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).limit(1))
        user = res.scalar_one_or_none()
        email = user.email
        ctag = f"user_{user.id}"

        # Get the struct handout
        res = await db.execute(
            select(Material, Course.name)
            .join(Course, Material.course_id == Course.id)
            .where(Material.title.like("%struct%"))
            .limit(1)
        )
        mat, course_name = res.one()
        
        print(f"Target: {mat.title}")
        print(f"Length: {len(mat.full_text)}")

        resp_data = await sm.add_document(
            content=f"TEST RE-INDEX\n{mat.full_text[:500]}",
            metadata={
                "source": "debug",
                "type": "academic_material",
                "user_id": email
            },
            user_email=email,
            title="DEBUG_STRUCT_INDEX",
            container_tag=ctag
        )
        
        print(f"Response Body: {resp_data}")
        
        if resp_data:
            doc_id = resp_data.get("documentId")
            print(f"CREATED DOCUMENT ID: {doc_id}")
            
            # Now immediately try to search for the title
            print("\nWaiting 5s for short-term search availability...")
            await asyncio.sleep(5)
            
            search_res = await sm.search(query="DEBUG_STRUCT_INDEX", limit=1)
            print(f"Search result for 'DEBUG_STRUCT_INDEX': {len(search_res.get('results', []))}")

if __name__ == "__main__":
    asyncio.run(debug_one())
