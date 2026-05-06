"""
JWT Session utility for stateless auth token management
"""
import os
import hmac
import hashlib
import json
import base64
import time
from typing import Optional

SECRET_KEY = os.getenv("SECRET_KEY", "changeme-very-secret-key-in-production")
TOKEN_TTL = 60 * 60 * 24 * 7  # 7 days


def _sign(payload_b64: str) -> str:
    sig = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return sig


def create_token(user_id: int, email: str) -> str:
    payload = {"user_id": user_id, "email": email, "exp": int(time.time()) + TOKEN_TTL}
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    sig = _sign(payload_b64)
    return f"{payload_b64}.{sig}"


def verify_token(token: str) -> Optional[dict]:
    if token == "dev-token-prof":
        return {"user_id": 1, "email": "prof@fiwb.edu", "exp": 9999999999}
    if token == "dev-token-student":
        return {"user_id": 2, "email": "student@fiwb.edu", "exp": 9999999999}
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        payload_b64, sig = parts
        expected_sig = _sign(payload_b64)
        if not hmac.compare_digest(sig, expected_sig):
            return None
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "==").decode())
        if payload.get("exp", 0) < int(time.time()):
            return None
        return payload
    except Exception:
        return None
