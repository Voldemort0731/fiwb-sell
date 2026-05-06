"""
mindmap.py — REST endpoints for mind map CRUD operations.
These are called by the frontend when SSE signals `mind_map_action`.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.models.database import get_db, User, Material
from app.utils.dependencies import get_current_user
from app.services.mindmap_service import (
    get_mind_map,
    generate_mind_map,
    edit_mind_map,
    undo_mind_map,
)

router = APIRouter(prefix="/mindmap", tags=["mindmap"])


class EditRequest(BaseModel):
    instruction: str


@router.get("/{material_id}")
async def fetch_mind_map(
    material_id: int,
    force: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    GET the cached mind map for a document.
    If `force=true`, clears cache and triggers fresh generation.
    Returns 404 if no cache and force=false (frontend should then POST to generate).
    """
    # Verify material belongs to user OR is from an enrolled course
    from app.models.database import Enrollment
    stmt = select(Material).where(Material.id == material_id)
    mat_res = await db.execute(stmt)
    material = mat_res.scalar_one_or_none()
    
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
        
    if material.user_id != current_user.id:
        # Check enrollment
        enr_res = await db.execute(select(Enrollment).where(Enrollment.student_id == current_user.id, Enrollment.course_id == material.course_id))
        if not enr_res.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Access denied: You are not enrolled in this course")

    if force:
        try:
            result = await generate_mind_map(db, current_user.id, material_id)
            return result
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

    cached = await get_mind_map(db, current_user.id, material_id)
    if cached:
        return cached

    raise HTTPException(status_code=404, detail="No mind map cached for this document")


@router.post("/{material_id}")
async def create_mind_map(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    POST: Generate (or re-use cache) for a document.
    Used by the frontend after receiving `mind_map_action: open` from SSE.
    """
    # Verify material belongs to user OR is from an enrolled course
    from app.models.database import Enrollment
    stmt = select(Material).where(Material.id == material_id)
    mat_res = await db.execute(stmt)
    material = mat_res.scalar_one_or_none()
    
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
        
    if material.user_id != current_user.id:
        # Check enrollment
        enr_res = await db.execute(select(Enrollment).where(Enrollment.student_id == current_user.id, Enrollment.course_id == material.course_id))
        if not enr_res.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Access denied: You are not enrolled in this course")

    # Try cache first (unless caller wants fresh)
    cached = await get_mind_map(db, current_user.id, material_id)
    if cached:
        return cached

    try:
        return await generate_mind_map(db, current_user.id, material_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.patch("/{material_id}/edit")
async def edit_mind_map_endpoint(
    material_id: int,
    body: EditRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    PATCH: Apply a natural language edit instruction to the current mind map.
    """
    try:
        return await edit_mind_map(db, current_user.id, material_id, body.instruction)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{material_id}/undo")
async def undo_mind_map_endpoint(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    POST: Revert to previous mind map state (from history stack).
    """
    try:
        return await undo_mind_map(db, current_user.id, material_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{material_id}")
async def delete_mind_map(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """DELETE: Close/clear the mind map for a document."""
    from app.models.database import MindMap
    result = await db.execute(
        select(MindMap).where(MindMap.user_id == current_user.id, MindMap.material_id == material_id)
    )
    mm = result.scalar_one_or_none()
    if mm:
        await db.delete(mm)
        await db.commit()
    return {"ok": True}
