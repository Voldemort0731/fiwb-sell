import asyncio
import httpx

async def verify_proxy():
    backend_url = "http://localhost:8002"
    user_email = "owaissayyed2007@gmail.com"
    user_pass = "password" # Assumed based on common developer test setups here
    
    async with httpx.AsyncClient() as client:
        print(f"\n[1] Attempting login for {user_email}...")
        login_res = await client.post(f"{backend_url}/auth/login", data={"username": user_email, "password": user_pass})
        if login_res.status_code != 200:
            print(f"[!] Login failed: {login_res.text}")
            return
        
        token = login_res.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        print(f"[2] Fetching PDF token for material 158...")
        token_res = await client.get(f"{backend_url}/profile/proxy/drive/158/token", headers=headers)
        if token_res.status_code != 200:
            print(f"[!] PDF Token request failed: {token_res.text}")
            return
        
        pdf_token = token_res.json().get("token")
        print(f"[+] Got PDF token: {pdf_token[:20]}...")
        
        print(f"[3] Testing specific /preview route...")
        preview_res = await client.get(
            f"{backend_url}/profile/proxy/drive/158/preview?token={pdf_token}", 
            follow_redirects=False
        )
        
        if preview_res.status_code == 307 or preview_res.status_code == 302:
            location = preview_res.headers.get("Location")
            print(f"[+] SUCCESS: Route matched and redirected to: {location[:60]}...")
        else:
            print(f"[!] FAILED: Got status {preview_res.status_code}. Expected 307. Detail: {preview_res.text}")

if __name__ == "__main__":
    asyncio.run(verify_proxy())
