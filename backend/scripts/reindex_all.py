from dotenv import load_dotenv
load_dotenv()

import asyncio
import os
import sys
from sqlalchemy import select
from app.models.database import AsyncSessionLocal, Material, User, Course
from app.intelligence.sm_client import get_sm_client

async def reindex_all():
    print("--- STARTING SUPERMEMORY RE-INDEX ---")
    sm = get_sm_client()
    
    async with AsyncSessionLocal() as db:
        # 1. Get User
        res = await db.execute(select(User).limit(1))
        user = res.scalar_one_or_none()
        if not user:
            print("[ERROR] No user found in DB. Aborting.")
            return
        
        email = user.email
        ctag = f"user_{user.id}"
        print(f"Target User: {email} (Tag: {ctag})")

        # 2. Get all materials with text
        res = await db.execute(
            select(Material, Course.name)
            .join(Course, Material.course_id == Course.id)
            .where(Material.user_id == user.id)
            .where(Material.full_text != None)
        )
        
        items = res.all()
        print(f"Found {len(items)} items to index.")

        success_count = 0
        for mat, course_name in items:
            title = mat.title or f"Course Material ({mat.external_id[:8]})"
            print(f"  -> Indexing: {title}...", end="", flush=True)
            
            # Construct content similar to integrations.py
            content = f"Course: {course_name}\n"
            if mat.material_type == "assignment":
                content += f"Type: Assignment\n"
            elif mat.material_type == "announcement":
                content += f"Type: Announcement\n"
            
            content += f"Title: {title}\n"
            content += f"Full Text:\n{mat.full_text}"
            
            try:
                # Force index
                res = await sm.add_document(
                    content=content,
                    metadata={
                        "source": mat.source,
                        "type": "academic_material",
                        "course": course_name,
                        "user_id": email,
                        "file_id": mat.external_id,
                        "source_link": mat.source_link
                    },
                    user_email=email,
                    title=title
                )
                
                if res:
                    mat.indexed_in_supermemory = True
                    success_count += 1
                    print(" OK")
                else:
                    print(" FAILED")
            except Exception as e:
                print(f" ERROR: {e}")

        await db.commit()
        print(f"\n--- RE-INDEXING COMPLETE ---")
        print(f"Successfully pushed: {success_count}/{len(items)}")

if __name__ == "__main__":
    asyncio.run(reindex_all())
