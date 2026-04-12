import asyncio
from app.intelligence.sm_client import SupermemoryClient

async def run():
    client = SupermemoryClient()
    res = await client.search('Convergence', limit=3)
    for c in res.get('results', []):
        print("metadata:", c.get('metadata'))

if __name__ == '__main__':
    asyncio.run(run())
