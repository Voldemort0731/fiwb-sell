"""
FIWB Backend - Main FastAPI Application
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import delete, and_, func, select
from app.models.database import init_db, AsyncSessionLocal, Material
from app.routers import auth, chat, integrations, profile


async def _cleanup_stale_link_records():
    """
    One-time cleanup:
    1. Delete all Link: records stored in local DB (source=classroom, external_id IS NULL,
       title starts with 'Link: ') — these should only live in Supermemory.
    2. Remove duplicate attachment rows, keeping the one with the highest id per
       (user_id, external_id) pair so only one card shows per file.
    """
    async with AsyncSessionLocal() as db:
        # 1. Delete link-only records
        await db.execute(
            delete(Material).where(
                and_(
                    Material.source == "classroom",
                    Material.external_id == None,
                    Material.title.like("Link: %"),
                )
            )
        )

        # 2. Delete duplicate attachment rows — keep highest id per (user_id, external_id)
        dupes_result = await db.execute(
            select(Material.user_id, Material.external_id)
            .where(Material.external_id != None)
            .group_by(Material.user_id, Material.external_id)
            .having(func.count(Material.id) > 1)
        )
        dupe_pairs = dupes_result.all()
        for user_id, ext_id in dupe_pairs:
            rows_result = await db.execute(
                select(Material.id)
                .where(Material.user_id == user_id, Material.external_id == ext_id)
                .order_by(Material.id.desc())
            )
            ids = [r[0] for r in rows_result.all()]
            # Keep the first (highest id), delete the rest
            if len(ids) > 1:
                await db.execute(
                    delete(Material).where(Material.id.in_(ids[1:]))
                )

        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _cleanup_stale_link_records()
    yield

app = FastAPI(
    title="FIWB - Institutional Intelligence & Digital Twin",
    version="1.0.0",
    lifespan=lifespan,
)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_url, 
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(integrations.router, prefix="/integrations", tags=["integrations"])
app.include_router(profile.router, prefix="/profile", tags=["profile"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "FIWB Backend"}
