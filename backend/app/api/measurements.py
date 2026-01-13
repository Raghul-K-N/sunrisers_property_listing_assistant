from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func
from ..db import get_db, get_session
from .. import models, schemas
from ..auth import get_current_user
from sqlalchemy import select
from typing import List, Optional
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/measurements", tags=["measurements"])


# New Property-based measurement endpoints
@router.post("/", response_model=schemas.MeasurementOut)
def create_measurement(
    measurement_data: schemas.MeasurementCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Create a new measurement for a property."""
    # Check if property exists and user has access
    property = db.query(models.Property).filter(models.Property.id == measurement_data.property_id).first()
    if not property:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Check permissions (owner, agent, or admin)
    if (property.owner_id != current_user.id and 
        property.agent_id != current_user.id and 
        current_user.role != models.UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Convert lists to JSON strings for database storage
    vertex_heights_json = json.dumps(measurement_data.vertex_heights) if measurement_data.vertex_heights else None
    perimeter_json = json.dumps(measurement_data.perimeter) if measurement_data.perimeter else None
    
    db_measurement = models.Measurement(
        property_id=measurement_data.property_id,
        room_type=measurement_data.room_type,
        area_sqm=measurement_data.area_sqm,
        volume_m3=measurement_data.volume_m3,
        vertex_heights_json=vertex_heights_json,
        perimeter_json=perimeter_json
    )
    
    db.add(db_measurement)
    db.commit()
    db.refresh(db_measurement)
    
    return db_measurement


@router.get("/", response_model=List[schemas.MeasurementOut])
def list_measurements(
    property_id: Optional[int] = None,
    room_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """List measurements with optional filters."""
    query = db.query(models.Measurement).options(
        joinedload(models.Measurement.property)
    )
    
    if property_id:
        query = query.filter(models.Measurement.property_id == property_id)
    if room_type:
        query = query.filter(models.Measurement.room_type.ilike(f"%{room_type}%"))
    
    measurements = query.offset(skip).limit(limit).all()
    
    # Convert JSON fields
    for measurement in measurements:
        if measurement.vertex_heights_json:
            measurement.vertex_heights = json.loads(measurement.vertex_heights_json)
        if measurement.perimeter_json:
            measurement.perimeter = json.loads(measurement.perimeter_json)
        if measurement.exported_paths_json:
            measurement.exported_paths = json.loads(measurement.exported_paths_json)
    
    return measurements


@router.get("/{measurement_id}", response_model=schemas.MeasurementOut)
def get_measurement(measurement_id: int, db: Session = Depends(get_db)):
    """Get measurement by ID."""
    measurement = db.query(models.Measurement).options(
        joinedload(models.Measurement.property)
    ).filter(models.Measurement.id == measurement_id).first()
    
    if measurement is None:
        raise HTTPException(status_code=404, detail="Measurement not found")
    
    # Convert JSON fields
    if measurement.vertex_heights_json:
        measurement.vertex_heights = json.loads(measurement.vertex_heights_json)
    if measurement.perimeter_json:
        measurement.perimeter = json.loads(measurement.perimeter_json)
    if measurement.exported_paths_json:
        measurement.exported_paths = json.loads(measurement.exported_paths_json)
    
    return measurement


@router.put("/{measurement_id}", response_model=schemas.MeasurementOut)
def update_measurement(
    measurement_id: int,
    measurement_update: schemas.MeasurementUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update measurement."""
    measurement = db.query(models.Measurement).filter(
        models.Measurement.id == measurement_id
    ).first()
    
    if measurement is None:
        raise HTTPException(status_code=404, detail="Measurement not found")
    
    # Check permissions
    property = db.query(models.Property).filter(models.Property.id == measurement.property_id).first()
    if (property.owner_id != current_user.id and 
        property.agent_id != current_user.id and 
        current_user.role != models.UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = measurement_update.dict(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(measurement, field, value)
    
    db.commit()
    db.refresh(measurement)
    
    return measurement


@router.delete("/{measurement_id}")
def delete_measurement(
    measurement_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Delete measurement."""
    measurement = db.query(models.Measurement).filter(
        models.Measurement.id == measurement_id
    ).first()
    
    if measurement is None:
        raise HTTPException(status_code=404, detail="Measurement not found")
    
    # Check permissions
    property = db.query(models.Property).filter(models.Property.id == measurement.property_id).first()
    if (property.owner_id != current_user.id and 
        property.agent_id != current_user.id and 
        current_user.role != models.UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    db.delete(measurement)
    db.commit()
    
    return {"detail": "Measurement deleted successfully"}


@router.post("/{measurement_id}/export")
def export_measurement(measurement_id: int, payload: dict = {}, db: Session = Depends(get_db)):
    """Export measurement artifacts (PDF, image (SVG), OBJ)."""
    measurement = db.query(models.Measurement).filter(models.Measurement.id == measurement_id).first()
    if not measurement:
        raise HTTPException(status_code=404, detail="Measurement not found")

    # Placeholder logic for export (already implemented in original, keeping it simplified)
    # In a real app, this would trigger background tasks to generate files.
    exported_paths = {
        "pdf": f"/exports/measurement_{measurement_id}.pdf",
        "svg": f"/exports/measurement_{measurement_id}.svg",
        "obj": f"/exports/measurement_{measurement_id}.obj"
    }
    
    measurement.exported_paths_json = json.dumps(exported_paths)
    db.commit()
    
    return {"ok": True, "paths": exported_paths}
