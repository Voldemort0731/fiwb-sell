import asyncio
import os
import sys
from dotenv import load_dotenv
load_dotenv()
from app.intelligence.ms_client import get_ms_client

if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

async def run():
    sm = get_ms_client()
    print("--- Adding Test Document WITHOUT container_tag ---")
    res = await sm.add_document('test content no tag', {'type': 'academic_material'}, 'test@test.com', 'Test No Tag Doc')
    print('Add Response:', res)
    
    print("\n--- Waiting 6 seconds for indexing... ---")
    await asyncio.sleep(6)
    
    print("\n--- Searching for Test Document ---")
    res_search = await sm.search('test content no tag', limit=2)
    titles = [r.get('title') for r in res_search.get('results', [])]
    print('Search Response Titles:', titles)

if __name__ == "__main__":
    asyncio.run(run())
