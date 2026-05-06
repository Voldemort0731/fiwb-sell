"""
Auth Router — Google OAuth 2.0 login flow
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import RedirectResponse, JSONResponse
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.database import get_db, User
from app.services.google_auth import get_auth_url, exchange_code, get_user_info, standardize_email
from app.utils.auth import create_token
from app.utils.dependencies import get_current_user

router = APIRouter()
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

from pydantic import BaseModel

class LoginRequest(BaseModel):
    code: str

@router.post("/login")
async def login(
    request: LoginRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth login from frontend postmessage code."""
    try:
        token_data = exchange_code(request.code)
        user_info = get_user_info(token_data["access_token"])
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Google authentication failed: {str(e)}")

    email = standardize_email(user_info.get("email", ""))
    name = user_info.get("name", "")
    picture = user_info.get("picture", "")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=email,
            name=name,
            picture=picture,
            google_access_token=token_data["access_token"],
            google_refresh_token=token_data.get("refresh_token"),
            google_token_expiry=token_data.get("expiry"),
        )
        db.add(user)
    else:
        user.name = name
        user.picture = picture
        user.google_access_token = token_data["access_token"]
        if token_data.get("refresh_token"):
            user.google_refresh_token = token_data["refresh_token"]
        user.google_token_expiry = token_data.get("expiry")

    from app.routers.integrations import _do_classroom_sync, _get_creds
    
    await db.commit()
    await db.refresh(user)

    # Trigger background sync on login ONLY if not already synced
    try:
        if not user.classroom_synced:
            creds = await _get_creds(user)
            background_tasks.add_task(_do_classroom_sync, user.id, user.email, creds)
        else:
            print(f"[Auth] skipping initial sync for {user.email} (already synced)")
    except Exception as e:
        print(f"[Auth] Could not trigger initial sync: {e}")

    app_token = create_token(user.id, user.email)
    return {
        "token": app_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
            "role": user.role,
            "role_finalized": user.role_finalized
        }
    }

@router.get("/config")
async def get_auth_config():
    from app.services.google_auth import GOOGLE_CLIENT_ID
    return {"client_id": GOOGLE_CLIENT_ID}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Return current user profile."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "picture": current_user.picture,
        "role": current_user.role,
        "role_finalized": current_user.role_finalized,
        "classroom_synced": current_user.classroom_synced,
        "drive_synced": current_user.drive_synced,
        "gmail_synced": current_user.gmail_synced,
        "moodle_configured": bool(current_user.moodle_url and current_user.moodle_token),
        "stats": {
            "total_slm_tokens": current_user.total_slm_tokens,
            "total_llm_tokens": current_user.total_llm_tokens,
            "total_cost_usd": round(current_user.total_cost_usd, 6),
        },
    }

class RoleFinalizeRequest(BaseModel):
    role: str # "student" or "professor"
    password: Optional[str] = None

@router.post("/finalize-role")
async def finalize_role(
    request: RoleFinalizeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Finalize user role during onboarding."""
    if request.role not in ["student", "professor"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    if request.role == "professor":
        if request.password != "-9876":
            raise HTTPException(status_code=403, detail="Incorrect password for Professor role")
    
    current_user.role = request.role
    current_user.role_finalized = True
    await db.commit()
    
    return {"status": "success", "role": current_user.role}
