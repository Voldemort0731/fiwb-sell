"""
DriveSyncService - Specialized service for ingestion of Google Drive files.
Handles content extraction (PDF, Google Docs) and vault synchronization.
"""
import io
import json
import logging
import asyncio
import random
import os
from datetime import datetime, timezone
from typing import List, Dict, Optional

import pypdf
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import User, Course, Material, AsyncSessionLocal
from app.intelligence.ms_client import get_ms_client
from app.services.google_auth import build_credentials, refresh_credentials
from app.utils.locks import GLOBAL_API_LOCK

logger = logging.getLogger("uvicorn.error")

class DriveSyncService:
    def __init__(self, user: User):
        self.user = user
        self.ms_client = get_ms_client()
        self.service = None

    async def _get_drive_service(self):
        """Build and return an async-wrapped Drive service with refreshed credentials."""
        if self.service:
            return self.service
            
        async with GLOBAL_API_LOCK:
            # Re-fetch user to get latest tokens if necessary, though current_user from Depends should be fresh enough
            # Proactive refresh
            try:
                creds = await asyncio.to_thread(refresh_credentials, self.user.google_refresh_token)
                self.service = await asyncio.to_thread(
                    lambda: build('drive', 'v3', credentials=creds, static_discovery=True)
                )
                return self.service
            except Exception as e:
                logger.error(f"[Drive] Failed to build service (refresh fail?): {e}")
                # Fallback to current tokens if refresh fails
                creds = build_credentials(
                    self.user.google_access_token,
                    self.user.google_refresh_token,
                    self.user.google_token_expiry
                )
                self.service = await asyncio.to_thread(
                    lambda: build('drive', 'v3', credentials=creds, static_discovery=True)
                )
                return self.service

    async def sync_selected_files(self, file_ids: List[str], parent_folder_id: Optional[str] = None) -> Dict:
        """
        Ingest specifically selected files or folders from Google Drive.
        Folders are expanded recursively.
        """
        service = await self._get_drive_service()
        
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Course).where(Course.external_id == "GOOGLE_DRIVE", Course.user_id == self.user.id))
            drive_course = result.scalar_one_or_none()
            if not drive_course:
                drive_course = Course(
                    user_id=self.user.id,
                    external_id="GOOGLE_DRIVE",
                    name="Personal Google Drive",
                    teacher="Self",
                    source="drive"
                )
                db.add(drive_course)
                await db.commit()
                await db.refresh(drive_course)
            course_id = drive_course.id

        stats = {"success": 0, "failed": 0, "errors": []}
        
        # 1. Expand folders and create Folder materials for top-level selections
        all_files_map = {} # fid -> parent_fid
        for fid in file_ids:
            try:
                async with GLOBAL_API_LOCK:
                    meta = await asyncio.to_thread(
                        lambda: service.files().get(fileId=fid, fields="id, name, mimeType, webViewLink").execute()
                    )
                
                if meta.get('mimeType') == 'application/vnd.google-apps.folder':
                    # Save the folder itself as a material so it shows up in the feed
                    async with AsyncSessionLocal() as db:
                        dup_check = await db.execute(select(Material).where(Material.external_id == fid, Material.user_id == self.user.id))
                        existing_folder = dup_check.scalars().first()
                        if not existing_folder:
                            new_folder = Material(
                                user_id=self.user.id,
                                course_id=course_id,
                                title=meta.get('name', 'Untitled Folder'),
                                material_type="folder",
                                source="drive",
                                external_id=fid,
                                parent_external_id=None,
                                source_link=meta.get('webViewLink'),
                                content_preview=f"Drive Folder: {meta.get('name')}"
                            )
                            db.add(new_folder)
                            await db.commit()
                    
                    # Expand folder
                    folder_contents = await self._list_folder_recursive(service, fid)
                    all_files_map.update(folder_contents)
                else:
                    # Top level file picked directly
                    all_files_map[fid] = None
            except Exception as e:
                logger.error(f"[Drive] Failed to pre-process ID {fid}: {e}")

        # 2. Sync all collected files
        for fid, parent_fid in all_files_map.items():
            try:
                # 1. EARLY DEDUPLICATION: Check if already in DB and indexed
                async with AsyncSessionLocal() as db:
                    dup_check = await db.execute(select(Material).where(Material.external_id == fid, Material.user_id == self.user.id))
                    existing = dup_check.scalars().first()
                    
                    if existing and existing.indexed_in_memsapien:
                        logger.info(f"[Drive] File {existing.title} ({fid}) already exists and is indexed. Skipping.")
                        stats["success"] += 1 # Count as success since it's already there
                        continue

                # 2. Fetch metadata
                async with GLOBAL_API_LOCK:
                    meta = await asyncio.to_thread(
                        lambda: service.files().get(fileId=fid, fields="id, name, mimeType, webViewLink, createdTime").execute()
                    )
                
                # 3. Extract content (returns text and raw binary)
                content, raw_bytes = await self._extract_content(service, meta)
                if not content and not raw_bytes:
                    logger.warning(f"[Drive] Could not extract content for {meta.get('name')} ({fid})")
                    stats["failed"] += 1
                    continue

                # 4. Save locally
                async with AsyncSessionLocal() as db:
                    # Re-check or use existing from above (better to re-fetch or merge in session)
                    dup_check = await db.execute(select(Material).where(Material.external_id == fid, Material.user_id == self.user.id))
                    existing = dup_check.scalars().first()
                    
                    if existing:
                        existing.full_text = content
                        existing.content_preview = content[:500] if content else existing.content_preview
                        existing.file_content = raw_bytes
                        existing.mime_type = meta.get('mimeType')
                        # Update parent if it was provided (might have moved or been picked directly now)
                        existing.parent_external_id = parent_fid or existing.parent_external_id
                        existing.indexed_in_memsapien = True
                        existing.source_link = f"{os.getenv('BACKEND_URL', 'http://localhost:8002')}/profile/proxy/drive/{existing.id}"
                        new_mat = existing
                        logger.info(f"[Drive] File {meta.get('name')} updated in local DB")
                    else:
                        new_mat = Material(
                            user_id=self.user.id,
                            course_id=course_id,
                            title=meta.get('name', 'Untitled'),
                            content_preview=content[:500] if content else "Encrypted/Binary Document",
                            full_text=content,
                            file_content=raw_bytes,
                            mime_type=meta.get('mimeType'),
                            material_type="file",
                            source="drive",
                            external_id=fid,
                            parent_external_id=parent_fid,
                            # Temporary source_link, will be updated with actual ID below
                            source_link=f"{os.getenv('BACKEND_URL', 'http://localhost:8002')}/profile/proxy/drive/0",
                            indexed_in_memsapien=True
                        )
                        db.add(new_mat)
                    
                    await db.commit()
                    await db.refresh(new_mat)
                    
                    # Now we have the real ID, update the source_link
                    local_id = new_mat.id
                    new_mat.source_link = f"{os.getenv('BACKEND_URL', 'http://localhost:8002')}/profile/proxy/drive/{local_id}"
                    await db.commit()

                # 4. Push to Memsapien — per-page chunks
                doc_title = meta.get('name', 'Untitled Document')
                # Split on form-feed page boundaries
                raw_pages = content.split("\x0c") if "\x0c" in content else [content]
                pages = [p.strip() for p in raw_pages if p.strip()]
                total_pages = len(pages)
                any_ok = False
                for pg_idx, pg_text in enumerate(pages):
                    page_num = pg_idx + 1
                    pg_title = f"{doc_title} (p.{page_num})" if total_pages > 1 else doc_title
                    sm_resp = await self.ms_client.add_document(
                        content=pg_text,
                        metadata={
                            "source": "google_drive",
                            "type": "academic_material",
                            "file_id": fid,
                            "mime_type": meta.get('mimeType'),
                            "user_id": self.user.email,
                            "course": "Personal Google Drive",
                            "material_id": str(local_id),
                            "source_link": f"{os.getenv('BACKEND_URL', 'http://localhost:8002')}/profile/proxy/drive/{local_id}",
                            "page_number": page_num,
                            "total_pages": total_pages,
                        },
                        user_email=self.user.email,
                        title=pg_title,
                    )
                    if sm_resp:
                        any_ok = True

                if any_ok:
                    stats["success"] += 1
                    logger.info(f"[Drive] Successfully synced to Memsapien: {meta.get('name')}")
                else:
                    logger.error(f"[Drive] Failed to index in Memsapien: {meta.get('name')}")
                    stats["failed"] += 1

            except Exception as e:
                err_msg = f"Failed to sync {fid}: {str(e)}"
                logger.error(f"[Drive] {err_msg}")
                stats["failed"] += 1
                stats["errors"].append(err_msg)

        # Update user flag
        if stats["success"] > 0:
            async with AsyncSessionLocal() as db:
                db_user = await db.get(User, self.user.id)
                if db_user:
                    db_user.drive_synced = True
                    await db.commit()

        return stats

    async def _list_folder_recursive(self, service, folder_id: str) -> Dict[str, str]:
        """Recursively list all file IDs in a folder, returning mapping {file_id: parent_id}."""
        file_map = {}
        try:
            query = f"'{folder_id}' in parents and trashed = false"
            async with GLOBAL_API_LOCK:
                results = await asyncio.to_thread(
                    lambda: service.files().list(q=query, fields="files(id, mimeType)").execute()
                )
            
            for f in results.get('files', []):
                if f['mimeType'] == 'application/vnd.google-apps.folder':
                    sub_map = await self._list_folder_recursive(service, f['id'])
                    file_map.update(sub_map)
                else:
                    # Only collect actual documents/files
                    file_map[f['id']] = folder_id
        except Exception as e:
            logger.error(f"[Drive] Error listing folder {folder_id}: {e}")
            
        return file_map

    async def _extract_content(self, service, meta: Dict) -> tuple[Optional[str], Optional[bytes]]:
        """Extract text and capture raw binary from various Drive file types."""
        fid = meta['id']
        mime = meta['mimeType']
        
        try:
            async with GLOBAL_API_LOCK:
                if 'google-apps' in mime:
                    # Google Docs and Slides -> plain text; Sheets -> CSV
                    target_mime = 'text/plain' if ('document' in mime or 'presentation' in mime) else 'text/csv'
                    export_req = service.files().export_media(fileId=fid, mimeType=target_mime)
                    fh = io.BytesIO()
                    downloader = MediaIoBaseDownload(fh, export_req)
                    done = False
                    while not done:
                        _, done = await asyncio.to_thread(downloader.next_chunk)
                    raw_bytes = fh.getvalue()
                else:
                    # Binary files (PDF, Text)
                    print(f"DEBUG: Downloading binary file {fid}")
                    get_req = service.files().get_media(fileId=fid)
                    raw_bytes = await asyncio.to_thread(lambda: get_req.execute())
                    print(f"DEBUG: Downloaded {len(raw_bytes)} bytes")
            
            if not raw_bytes:
                print("DEBUG: raw_bytes is empty")
                return "", None

            if mime == 'application/pdf':
                parsed = await self._parse_pdf(raw_bytes)
                print(f"DEBUG: Parsed {len(parsed)} characters from PDF")
                return parsed, raw_bytes
            
            # Default to UTF-8 decoding for text/html/etc
            decoded = raw_bytes.decode('utf-8', errors='ignore')
            print(f"DEBUG: Decoded {len(decoded)} characters as UTF-8")
            return decoded, raw_bytes

        except Exception as e:
            logger.error(f"[Drive] Extraction error for {fid}: {e}")
            return "", None

    async def _parse_pdf(self, raw_bytes: bytes) -> str:
        """Parse PDF bytes using pypdf. Returns text with \x0c (form-feed) page separators."""
        try:
            reader = pypdf.PdfReader(io.BytesIO(raw_bytes))
            pages = []
            for page in reader.pages:
                text = page.extract_text() or ""
                pages.append(text)
            # Join with form-feed so reindex_all.py can split on it
            return "\x0c".join(pages)
        except Exception as e:
            logger.error(f"[Drive] PDF parsing error: {e}")
            return ""


