from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.db import get_db
from app import models, schemas
from app.auth import get_current_user
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/properties", tags=["properties"])


@router.post("/", response_model=schemas.PropertyOut)
def create_property(
    property_data: schemas.PropertyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Create a new property."""
    images_json = json.dumps(property_data.images) if property_data.images else None
    
    db_property = models.Property(
        owner_id=current_user.id,
        agent_id=property_data.agent_id,
        title=property_data.title,
        address=property_data.address,
        price=property_data.price,
        bedrooms=property_data.bedrooms,
        water_supply=property_data.water_supply,
        total_land=property_data.total_land,
        status=property_data.status,
        images_json=images_json
    )
    
    db.add(db_property)
    db.commit()
    db.refresh(db_property)
    
    return db_property


@router.get("/", response_model=List[schemas.PropertyOut])
def list_properties(
    skip: int = 0,
    limit: int = 100,
    status: Optional[schemas.PropertyStatusEnum] = None,
    db: Session = Depends(get_db)
):
    """List properties with optional filters."""
    query = db.query(models.Property).options(
        joinedload(models.Property.owner),
        joinedload(models.Property.agent),
        joinedload(models.Property.descriptions)
    )
    
    if status:
        query = query.filter(models.Property.status == status)
    
    properties = query.offset(skip).limit(limit).all()
    return properties


@router.get("/{property_id}", response_model=schemas.PropertyWithMeasurements)
def get_property(property_id: int, db: Session = Depends(get_db)):
    """Get property by ID with measurements and descriptions."""
    property = db.query(models.Property).options(
        joinedload(models.Property.owner),
        joinedload(models.Property.agent),
        joinedload(models.Property.measurements),
        joinedload(models.Property.descriptions)
    ).filter(models.Property.id == property_id).first()
    
    if property is None:
        raise HTTPException(status_code=404, detail="Property not found")
    
    return property


@router.get("/user/my-properties", response_model=List[schemas.PropertyOut])
def get_my_properties(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get current user's properties."""
    properties = db.query(models.Property).options(
        joinedload(models.Property.descriptions)
    ).filter(
        models.Property.owner_id == current_user.id
    ).offset(skip).limit(limit).all()
    
    return properties


@router.post("/search", response_model=List[schemas.PropertyOut])
def search_properties(
    filters: schemas.PropertySearchFilters,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Advanced property search with filters."""
    query = db.query(models.Property).options(
        joinedload(models.Property.owner),
        joinedload(models.Property.agent),
        joinedload(models.Property.descriptions)
    )
    
    if filters.status:
        query = query.filter(models.Property.status == filters.status)
    if filters.min_price:
        query = query.filter(models.Property.price >= filters.min_price)
    if filters.max_price:
        query = query.filter(models.Property.price <= filters.max_price)
    if filters.min_bedrooms:
        query = query.filter(models.Property.bedrooms >= filters.min_bedrooms)
    if filters.max_bedrooms:
        query = query.filter(models.Property.bedrooms <= filters.max_bedrooms)
    
    properties = query.offset(skip).limit(limit).all()
    return properties


@router.put("/{property_id}", response_model=schemas.PropertyOut)
def update_property(
    property_id: int,
    property_update: schemas.PropertyUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update property."""
    property = db.query(models.Property).filter(models.Property.id == property_id).first()
    
    if property is None:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Check ownership or agent permissions
    if property.owner_id != current_user.id and property.agent_id != current_user.id and current_user.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = property_update.dict(exclude_unset=True)
    
    # Handle JSON fields
    if "images" in update_data:
        update_data["images_json"] = json.dumps(update_data.pop("images"))
    
    for field, value in update_data.items():
        setattr(property, field, value)
    
    db.commit()
    db.refresh(property)
    
    return property


@router.delete("/{property_id}")
def delete_property(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Delete property."""
    property = db.query(models.Property).filter(models.Property.id == property_id).first()
    
    if property is None:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Check ownership or admin permissions
    if property.owner_id != current_user.id and current_user.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    db.delete(property)
    db.commit()
    
    return {"detail": "Property deleted successfully"}