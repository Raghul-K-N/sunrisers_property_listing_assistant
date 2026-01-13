from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_session
from .. import models, schemas
from sqlalchemy import select

router = APIRouter()


@router.get("/listings")
async def list_listings(session: AsyncSession = Depends(get_session)):
    stmt = select(models.Listing)
    result = await session.execute(stmt)
    items = result.scalars().all()
    return {"items": [schemas.ListingOut.from_orm(i) for i in items]}
