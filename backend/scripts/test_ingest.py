import asyncio
import os
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import select
from app.models.database import User, Material
from app.services.drive_sync import DriveSyncService
from app.routers.integrations import _get_drive_file_content

async def run():
    # Setup DB
    engine = create_async_engine("sqlite+aiosqlite:///d:/FIWB NEW/new-chatbot/backend/fiwb.db")
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as db:
        res = await db.execute(select(Material).where(Material.id == 147))
        mat = res.scalar_one_or_none()
        
        user_res = await db.execute(select(User).where(User.id == mat.user_id))
        user = user_res.scalar_one_or_none()
        
        print(f"Testing download for material 147 (ext: {mat.external_id}) User: {user.email}")
        
        try:
            service_factory = DriveSyncService(user)
            drive = await service_factory._get_drive_service()
            
            content, raw = await _get_drive_file_content(drive, mat.external_id)
            print(f"Success! Content length: {len(content) if content else 0}, Raw size: {len(raw) if raw else 0}")
            
            mat.file_content = raw
            await db.commit()
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(run())
