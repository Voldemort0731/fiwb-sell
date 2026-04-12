import httpx
import json
import asyncio

async def main():
    client = httpx.AsyncClient()
    resp = await client.post('http://localhost:8002/auth/login', data={'username':'owaissayyed2007@gmail.com', 'password':'password'})
    token = resp.json().get('access_token')
    print('Token:', bool(token))
    if not token: return
    # 1. Get token
    resp2 = await client.get('http://localhost:8002/profile/proxy/drive/158/token', headers={'Authorization': f'Bearer {token}'})
    pdf_token = resp2.json().get('token')
    print('PDF Token:', bool(pdf_token))
    if not pdf_token:
        print(resp2.text)
        return
    # 2. Get stream
    resp3 = await client.get(f'http://localhost:8002/profile/proxy/drive/stream?token={pdf_token}')
    print('Stream Status:', resp3.status_code, 'Content-Type:', resp3.headers.get('Content-Type'))
    print('Body Start:', resp3.content[:500])

if __name__ == '__main__':
    asyncio.run(main())
