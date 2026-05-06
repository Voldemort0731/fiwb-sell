from dotenv import load_dotenv
load_dotenv()

import asyncio
import sys
import json
from app.intelligence.ms_client import get_ms_client
from app.models.database import AsyncSessionLocal, User
from sqlalchemy import select

if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

async def main():
    sm = get_ms_client()
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).limit(1))
        user = res.scalar_one_or_none()
        user_email = user.email if user else ""

    print(f"Searching as: {user_email}\n")
    # No filters, just search
    res = await sm.search(query="*", limit=100)
    results = res.get("results", [])
    print(f"Found {len(results)} raw results\n")
    
    academic_results = [r for r in results if r.get("metadata", {}).get("type") == "academic_material"]
    print(f"Found {len(academic_results)} academic results\n")

    for r in academic_results[:10]:
        print(f"Title: {r.get('title')}")
        print(f"  documentId: {r.get('documentId')}")
        meta = r.get("metadata", {})
        # Print all metadata keys
        for k, v in meta.items():
            print(f"  meta.{k}: {v}")
        if "material_id" not in meta:
            print("  ❌ MISSING material_id")
        else:
            print(f"  ✅ material_id: {meta['material_id']}")
        print()

if __name__ == "__main__":
    asyncio.run(main())
