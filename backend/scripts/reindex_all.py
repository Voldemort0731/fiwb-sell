from dotenv import load_dotenv
load_dotenv()

import asyncio
import sys
from sqlalchemy import select
from app.models.database import AsyncSessionLocal, Material, User, Course
from app.intelligence.ms_client import get_ms_client

if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.buffer, "strict")

async def _extract_pages(full_text: str) -> list[dict]:
    """
    Split full_text into per-page chunks.
    Supports:
      1. PDFs already extracted with page markers like [PAGE_N] (from drive_sync)
      2. Pre-paginated text via form-feed character \\x0c (pypdf standard)
      3. Falls back to the whole text as page 1 if neither marker found
    """
    import re

    # Try form-feed splitting first (pypdf natural page boundary)
    pages_ff = full_text.split("\x0c")
    if len(pages_ff) > 1:
        return [
            {"page_number": i + 1, "text": p.strip()}
            for i, p in enumerate(pages_ff)
            if p.strip()
        ]

    # Try "--- [Page N] ---" format (legacy drive_sync format)
    page_dashes = re.split(r"---\s*\[Page\s+(\d+)\]\s*---", full_text)
    if len(page_dashes) > 1:
        result = []
        i = 1
        while i + 1 < len(page_dashes):
            page_num = int(page_dashes[i])
            text = page_dashes[i + 1].strip()
            if text:
                result.append({"page_number": page_num, "text": text})
            i += 2
        if result:
            return result

    # Try [PAGE_N] sentinel splitting
    parts = re.split(r"\[PAGE_(\d+)\]", full_text)
    if len(parts) > 1:
        result = []
        i = 1
        while i + 1 < len(parts):
            page_num = int(parts[i])
            text = parts[i + 1].strip()
            if text:
                result.append({"page_number": page_num, "text": text})
            i += 2
        if result:
            return result

    # Fallback: whole document is page 1
    return [{"page_number": 1, "text": full_text.strip()}]


async def reindex_all():
    print("--- STARTING MEMSAPIEN RE-INDEX (per-page chunks) ---")
    sm = get_ms_client()

    async with AsyncSessionLocal() as db:
        # 1. Get User
        res = await db.execute(select(User).limit(1))
        user = res.scalar_one_or_none()
        if not user:
            print("[ERROR] No user found in DB. Aborting.")
            return

        email = user.email
        print(f"Target User: {email}")

        # 2. Get all materials with text
        res = await db.execute(
            select(Material, Course.name)
            .join(Course, Material.course_id == Course.id)
            .where(Material.user_id == user.id)
            .where(Material.full_text != None)
        )
        items = res.all()
        print(f"Found {len(items)} items to index.\n")

        success_count = 0
        chunk_count = 0

        for mat, course_name in items:
            title = mat.title or f"Course Material ({(mat.external_id or 'unknown')[:8]})"
            pages = await _extract_pages(mat.full_text)
            print(f"  -> Indexing: {title} ({len(pages)} page(s))...", end="", flush=True)

            ok = True
            for page in pages:
                # Build content block with course context
                content = f"Course: {course_name}\n"
                if mat.material_type == "assignment":
                    content += "Type: Assignment\n"
                elif mat.material_type == "announcement":
                    content += "Type: Announcement\n"
                content += f"Title: {title}\n"
                content += f"Page: {page['page_number']}\n"
                content += f"Full Text:\n{page['text']}"

                page_title = f"{title} (p.{page['page_number']})" if len(pages) > 1 else title

                try:
                    res = await sm.add_document(
                        content=content,
                        metadata={
                            "source": mat.source,
                            "type": "academic_material",
                            "course": course_name,
                            "user_id": email,
                            "file_id": mat.external_id or "",
                            "material_id": str(mat.id),
                            "source_link": mat.source_link or "",
                            "page_number": page["page_number"],
                            "total_pages": len(pages),
                        },
                        user_email=email,
                        title=page_title,
                    )
                    if res:
                        chunk_count += 1
                    else:
                        ok = False
                        print(f"\n     [WARN] page {page['page_number']} failed to push")
                except Exception as e:
                    ok = False
                    print(f"\n     [ERROR] page {page['page_number']}: {e}")

            if ok:
                mat.indexed_in_memsapien = True
                success_count += 1
                print(" OK")
            else:
                print(" PARTIAL")

        await db.commit()
        print(f"\n--- RE-INDEXING COMPLETE ---")
        print(f"Materials processed: {success_count}/{len(items)}")
        print(f"Total page-chunks pushed: {chunk_count}")


if __name__ == "__main__":
    asyncio.run(reindex_all())
