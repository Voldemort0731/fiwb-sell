import asyncio
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import select
from app.models.database import User, Material
from app.services.drive_sync import DriveSyncService
from app.routers.integrations import _get_drive_file_content

async def run_backfill():
    engine = create_async_engine("sqlite+aiosqlite:///d:/FIWB NEW/new-chatbot/backend/fiwb.db")
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with SessionLocal() as db:
        res = await db.execute(select(Material).where(Material.file_content == None, Material.external_id != None))
        materials = res.scalars().all()
        
        print(f"Starting legacy document vault sync. Found {len(materials)} documents missing local binary payloads...")
        
        for mat in materials:
            if not mat.external_id:
                continue
            
            user_res = await db.execute(select(User).where(User.id == mat.user_id))
            user = user_res.scalar_one_or_none()
            if not user:
                continue
                
            print(f"[{mat.id}] Downloading '{mat.title}'...")
            try:
                service_factory = DriveSyncService(user)
                drive = await service_factory._get_drive_service()
                content, raw = await _get_drive_file_content(drive, mat.external_id)
                
                if raw:
                    mat.file_content = raw
                    mat.mime_type = mat.mime_type or "application/pdf"
                    await db.commit()
                    print(f"  -> Success: Saved {len(raw)} bytes.")
                else:
                    print(f"  -> Failed: Could not fetch raw bytes.")
            except Exception as e:
                print(f"  -> Error: {str(e)}")

        print("\nAll Legacy Documents Synchronized into Local Vault!")

if __name__ == '__main__':
    asyncio.run(run_backfill())
