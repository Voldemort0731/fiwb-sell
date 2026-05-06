"""
re_extract_pages.py
Re-downloads PDFs from Google Drive using stored credentials and re-extracts
them page-by-page (with form-feed separators), updating the local DB full_text
and re-indexing to Memsapien with page_number metadata.
"""
from dotenv import load_dotenv
load_dotenv()

import asyncio
import io
import sys
import os
from sqlalchemy import select

if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.buffer, "strict")

from app.models.database import AsyncSessionLocal, Material, User
from app.intelligence.ms_client import get_ms_client
from app.services.google_auth import refresh_credentials
from app.services.drive_sync import DriveSyncService

import pypdf


async def extract_pdf_pages_from_drive(file_id: str, creds) -> list[dict]:
    """Download PDF from Drive and extract per-page text."""
    from googleapiclient.discovery import build
    service = build("drive", "v3", credentials=creds, static_discovery=True)
    get_req = service.files().get_media(fileId=file_id)
    raw_bytes = get_req.execute()
    if not raw_bytes:
        return []
    reader = pypdf.PdfReader(io.BytesIO(raw_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append({"page_number": i + 1, "text": text.strip()})
    return pages


async def main():
    print("--- RE-EXTRACTING PDF PAGES FROM GOOGLE DRIVE ---\n")
    sm = get_ms_client()

    async with AsyncSessionLocal() as db:
        user_res = await db.execute(select(User).limit(1))
        user = user_res.scalar_one_or_none()
        if not user:
            print("[ERROR] No user found.")
            return

        print(f"User: {user.email}")

        try:
            creds = refresh_credentials(user.google_refresh_token)
        except Exception as e:
            print(f"[ERROR] Could not refresh credentials: {e}")
            return

        # Only re-process PDF materials (source=classroom, has a drive external_id)
        mat_res = await db.execute(
            select(Material)
            .where(
                Material.user_id == user.id,
                Material.external_id != None,
                Material.full_text != None,
            )
        )
        materials = mat_res.scalars().all()

        # Filter to likely PDFs (those whose title contains .pdf or source is drive/classroom file type)
        pdf_mats = [
            m for m in materials
            if (m.title or "").lower().endswith(".pdf") or m.material_type == "file"
        ]
        print(f"Found {len(pdf_mats)} candidate PDF/file materials to re-extract.\n")

        success = 0
        skipped = 0
        for mat in pdf_mats:
            title = mat.title or f"Material {mat.id}"
            print(f"  -> {title}...", end="", flush=True)

            try:
                pages = await asyncio.to_thread(
                    lambda: asyncio.run(
                        asyncio.coroutine(lambda: None)()
                    )
                )
            except Exception:
                pass

            try:
                from googleapiclient.discovery import build
                service = build("drive", "v3", credentials=creds, static_discovery=True)
                get_req = service.files().get_media(fileId=mat.external_id)
                raw_bytes = await asyncio.to_thread(get_req.execute)
                if not raw_bytes:
                    print(" SKIP (empty)")
                    skipped += 1
                    continue

                reader = pypdf.PdfReader(io.BytesIO(raw_bytes))
                page_texts = []
                for page in reader.pages:
                    page_texts.append(page.extract_text() or "")

                if not any(p.strip() for p in page_texts):
                    print(" SKIP (no text extracted — may be scanned/image PDF)")
                    skipped += 1
                    continue

                total_pages = len(page_texts)
                # Update DB with form-feed separated full_text
                mat.full_text = "\x0c".join(page_texts)
                mat.content_preview = (page_texts[0] or "")[:500]
                await db.commit()

                # Re-push to Memsapien per-page
                for i, pg_text in enumerate(page_texts):
                    if not pg_text.strip():
                        continue
                    page_num = i + 1
                    pg_title = f"{title} (p.{page_num})" if total_pages > 1 else title
                    await sm.add_document(
                        content=pg_text.strip(),
                        metadata={
                            "source": mat.source,
                            "type": "academic_material",
                            "user_id": user.email,
                            "material_id": str(mat.id),
                            "file_id": mat.external_id or "",
                            "source_link": mat.source_link or "",
                            "page_number": page_num,
                            "total_pages": total_pages,
                        },
                        user_email=user.email,
                        title=pg_title,
                    )

                print(f" OK ({total_pages} pages)")
                success += 1

            except Exception as e:
                print(f" ERROR: {e}")

    print(f"\n--- DONE ---")
    print(f"Re-extracted: {success} | Skipped: {skipped}")


if __name__ == "__main__":
    asyncio.run(main())
