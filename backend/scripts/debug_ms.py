import asyncio
import os
import pprint
from app.intelligence.ms_client import MemsapienClient

async def check():
    client = MemsapienClient()
    res = await client.search("Calculus Convergence of Sequences", limit=5)
    for doc in res.get("results", []):
        meta = doc.get("metadata", {})
        print(f"Doc title: {meta.get('title')}, mat_id: {meta.get('material_id')}, type: {meta.get('type')}")

if __name__ == "__main__":
    asyncio.run(check())
