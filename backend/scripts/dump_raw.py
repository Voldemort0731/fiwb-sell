import asyncio
import json
import sys
import os
from dotenv import load_dotenv
load_dotenv()
from app.intelligence.ms_client import get_ms_client

if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

async def main():
    sm = get_ms_client()
    res = await sm.search('*', limit=3)
    print(json.dumps(res, indent=2))

if __name__ == '__main__':
    asyncio.run(main())
