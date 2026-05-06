import asyncio
from app.intelligence.ms_client import MemsapienClient

async def run():
    client = MemsapienClient()
    res = await client.search('Convergence', limit=3)
    for c in res.get('results', []):
        print("metadata:", c.get('metadata'))

if __name__ == '__main__':
    asyncio.run(run())
