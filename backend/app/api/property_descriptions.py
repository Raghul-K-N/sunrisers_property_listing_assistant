from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.sql import func
from typing import List, Optional
from app.db import get_db
from app import models, schemas
from app.auth import get_current_user
from app.services.llm import llm_service
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/property-descriptions", tags=["property-descriptions"])


@router.post("/generate/{property_id}", response_model=schemas.PropertyDescriptionOut)
async def generate_description(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Generate professional descriptions using LLM (Gemini)."""
    # Fetch property and its measurements
    property = db.query(models.Property).options(
        joinedload(models.Property.measurements)
    ).filter(models.Property.id == property_id).first()
    
    if not property:
        raise HTTPException(status_code=404, detail="Property not found")
        
    # Check permissions
    if (property.owner_id != current_user.id and 
        property.agent_id != current_user.id and 
        current_user.role != models.UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Prepare data for LLM
    property_data = {
        "title": property.title,
        "address": property.address,
        "price": property.price,
        "total_land": property.total_land,
        "water_supply": property.water_supply,
        "bedrooms": property.bedrooms
    }
    
    measurements = [
        {
            "room_type": m.room_type,
            "area_sqm": m.area_sqm,
            "volume_m3": m.volume_m3
        }
        for m in property.measurements
    ]
    
    # Generate using service
    generated = await llm_service.generate_property_description(property_data, measurements)
    
    # Save to database
    key_features_json = json.dumps(generated.get("key_features", []))
    
    db_description = models.PropertyDescription(
        property_id=property_id,
        created_by_id=current_user.id,
        title_suggestion=generated.get("title_suggestion"),
        short_description=generated.get("short_description"),
        detailed_description=generated.get("detailed_description"),
        key_features=key_features_json,
        llm_model_used="gemini-1.5-flash",
        is_active=True # Set as active by default for first generation
    )
    
    # Set other descriptions for this property as inactive
    db.query(models.PropertyDescription).filter(
        models.PropertyDescription.property_id == property_id
    ).update({"is_active": False})
    
    db.add(db_description)
    db.commit()
    db.refresh(db_description)
    
    return db_description


@router.post("/", response_model=schemas.PropertyDescriptionOut)
def create_property_description(
    description_data: schemas.PropertyDescriptionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Create a new LLM-generated property description."""
    # Check if property exists and user has access
    property = db.query(models.Property).filter(models.Property.id == description_data.property_id).first()
    if not property:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Check permissions (owner, agent, or admin)
    if (property.owner_id != current_user.id and 
        property.agent_id != current_user.id and 
        current_user.role != models.UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Convert key_features list to JSON string
    key_features_json = json.dumps(description_data.key_features) if description_data.key_features else None
    generation_params_json = json.dumps(description_data.generation_parameters) if description_data.generation_parameters else None
    
    db_description = models.PropertyDescription(
        property_id=description_data.property_id,
        created_by_id=current_user.id,
        title_suggestion=description_data.title_suggestion,
        short_description=description_data.short_description,
        detailed_description=description_data.detailed_description,
        key_features=key_features_json,
        neighborhood_description=description_data.neighborhood_description,
        investment_analysis=description_data.investment_analysis,
        llm_model_used=description_data.llm_model_used,
        prompt_version=description_data.prompt_version,
        generation_parameters=generation_params_json,
        quality_score=description_data.quality_score
    )
    
    db.add(db_description)
    db.commit()
    db.refresh(db_description)
    
    return db_description


@router.get("/property/{property_id}", response_model=List[schemas.PropertyDescriptionOut])
def get_property_descriptions(
    property_id: int,
    skip: int = 0,
    limit: int = 10,
    active_only: bool = False,
    db: Session = Depends(get_db)
):
    """Get all descriptions for a property."""
    query = db.query(models.PropertyDescription).options(
        joinedload(models.PropertyDescription.created_by),
        joinedload(models.PropertyDescription.approved_by)
    ).filter(models.PropertyDescription.property_id == property_id)
    
    if active_only:
        query = query.filter(models.PropertyDescription.is_active == True)
    
    descriptions = query.offset(skip).limit(limit).all()
    
    # Convert JSON fields back to lists
    for desc in descriptions:
        if desc.key_features:
            desc.key_features = json.loads(desc.key_features)
        if desc.generation_parameters:
            desc.generation_parameters = json.loads(desc.generation_parameters)
    
    return descriptions


@router.get("/{description_id}", response_model=schemas.PropertyDescriptionOut)
def get_property_description(description_id: int, db: Session = Depends(get_db)):
    """Get property description by ID."""
    description = db.query(models.PropertyDescription).options(
        joinedload(models.PropertyDescription.created_by),
        joinedload(models.PropertyDescription.approved_by)
    ).filter(models.PropertyDescription.id == description_id).first()
    
    if description is None:
        raise HTTPException(status_code=404, detail="Property description not found")
    
    # Convert JSON fields
    if description.key_features:
        description.key_features = json.loads(description.key_features)
    if description.generation_parameters:
        description.generation_parameters = json.loads(description.generation_parameters)
    
    return description


@router.put("/{description_id}", response_model=schemas.PropertyDescriptionOut)
def update_property_description(
    description_id: int,
    description_update: schemas.PropertyDescriptionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update property description."""
    description = db.query(models.PropertyDescription).filter(
        models.PropertyDescription.id == description_id
    ).first()
    
    if description is None:
        raise HTTPException(status_code=404, detail="Property description not found")
    
    # Check permissions
    property = db.query(models.Property).filter(models.Property.id == description.property_id).first()
    if (property.owner_id != current_user.id and 
        property.agent_id != current_user.id and 
        description.created_by_id != current_user.id and
        current_user.role != models.UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = description_update.dict(exclude_unset=True)
    
    # Handle key_features conversion
    if "key_features" in update_data:
        update_data["key_features"] = json.dumps(update_data["key_features"])
    
    for field, value in update_data.items():
        setattr(description, field, value)
    
    db.commit()
    db.refresh(description)
    
    # Convert back for response
    if description.key_features:
        description.key_features = json.loads(description.key_features)
    
    return description


@router.post("/{description_id}/approve", response_model=schemas.PropertyDescriptionOut)
def approve_property_description(
    description_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Approve a property description."""
    description = db.query(models.PropertyDescription).filter(
        models.PropertyDescription.id == description_id
    ).first()
    
    if description is None:
        raise HTTPException(status_code=404, detail="Property description not found")
    
    # Check permissions (only property owner, agent, or admin can approve)
    property = db.query(models.Property).filter(models.Property.id == description.property_id).first()
    if (property.owner_id != current_user.id and 
        property.agent_id != current_user.id and 
        current_user.role != models.UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Set all other descriptions for this property as inactive
    db.query(models.PropertyDescription).filter(
        models.PropertyDescription.property_id == description.property_id,
        models.PropertyDescription.id != description_id
    ).update({"is_active": False})
    
    # Approve and activate this description
    description.is_approved = True
    description.is_active = True
    description.approved_by_id = current_user.id
    description.approved_at = func.now()
    
    db.commit()
    db.refresh(description)
    
    return description


@router.delete("/{description_id}")
def delete_property_description(
    description_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Delete property description."""
    description = db.query(models.PropertyDescription).filter(
        models.PropertyDescription.id == description_id
    ).first()
    
    if description is None:
        raise HTTPException(status_code=404, detail="Property description not found")
    
    # Check permissions
    property = db.query(models.Property).filter(models.Property.id == description.property_id).first()
    if (property.owner_id != current_user.id and 
        description.created_by_id != current_user.id and
        current_user.role != models.UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    db.delete(description)
    db.commit()
    
    return {"detail": "Property description deleted successfully"}


@router.post("/{description_id}/increment-view")
def increment_view_count(description_id: int, db: Session = Depends(get_db)):
    """Increment view count for analytics."""
    description = db.query(models.PropertyDescription).filter(
        models.PropertyDescription.id == description_id
    ).first()
    
    if description is None:
        raise HTTPException(status_code=404, detail="Property description not found")
    
    description.view_count += 1
    db.commit()
    
    return {"detail": "View count incremented"}


@router.get("/user/my-descriptions", response_model=List[schemas.PropertyDescriptionOut])
def get_my_descriptions(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get current user's property descriptions."""
    descriptions = db.query(models.PropertyDescription).options(
        joinedload(models.PropertyDescription.property),
        joinedload(models.PropertyDescription.approved_by)
    ).filter(
        models.PropertyDescription.created_by_id == current_user.id
    ).offset(skip).limit(limit).all()
    
    # Convert JSON fields
    for desc in descriptions:
        if desc.key_features:
            desc.key_features = json.loads(desc.key_features)
        if desc.generation_parameters:
            desc.generation_parameters = json.loads(desc.generation_parameters)
    
    return descriptions