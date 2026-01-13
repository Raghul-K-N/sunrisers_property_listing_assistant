from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db import get_db
from app import models, schemas
from app.auth import get_current_user, get_password_hash, verify_password
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", response_model=schemas.UserOut)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    """Create a new user."""
    # Check if user exists
    db_user = db.query(models.User).filter(
        (models.User.email == user.email) | (models.User.username == user.username)
    ).first()
    
    if db_user:
        raise HTTPException(
            status_code=400,
            detail="Email or username already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        username=user.username,
        hashed_password=hashed_password,
        first_name=user.first_name,
        last_name=user.last_name,
        phone_number=user.phone_number,
        role=user.role,
        license_number=user.license_number,
        agency_name=user.agency_name,
        bio=user.bio
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user


@router.get("/me", response_model=schemas.UserOut)
def get_current_user_profile(current_user: models.User = Depends(get_current_user)):
    """Get current user's profile."""
    return current_user


@router.put("/me", response_model=schemas.UserOut)
def update_current_user(
    user_update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update current user's profile."""
    update_data = user_update.dict(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(current_user, field, value)
    
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/{user_id}", response_model=schemas.UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    """Get user by ID (public profile info only)."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/", response_model=List[schemas.UserOut])
def list_users(
    skip: int = 0,
    limit: int = 100,
    role: Optional[schemas.UserRoleEnum] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """List users (admin only)."""
    if current_user.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = db.query(models.User)
    
    if role:
        query = query.filter(models.User.role == role)
    
    users = query.offset(skip).limit(limit).all()
    return users


@router.get("/agents/", response_model=List[schemas.UserOut])
def list_agents(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get list of real estate agents."""
    agents = db.query(models.User).filter(
        models.User.role == models.UserRole.AGENT,
        models.User.is_active == True
    ).offset(skip).limit(limit).all()
    
    return agents