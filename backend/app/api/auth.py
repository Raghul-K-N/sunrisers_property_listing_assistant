from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from app.db import get_db
from app import models, schemas
from app.auth import (
    authenticate_user, 
    create_access_token, 
    get_current_user, 
    ACCESS_TOKEN_EXPIRE_MINUTES,
    get_password_hash
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/forgot-password")
async def forgot_password(
    data: schemas.EmailSchema,
    db: Session = Depends(get_db)
):
    """
    Trigger password reset flow.
    In production, this would send an email. 
    For this prototype, it verifies the user exists and simply logs the action.
    """
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        # We return 200 even if user not found to prevent user enumeration
        return {"message": "If this email is registered, you will receive a password reset link."}
    
    # Logic to generate token and send email would go here
    print(f"[DEBUG] Password reset requested for user: {user.username} ({user.email})")
    
    return {"message": "If this email is registered, you will receive a password reset link."}


@router.post("/token", response_model=schemas.Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Login endpoint to get access token."""
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/register", response_model=schemas.UserOut)
def register_user(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    """Register a new user."""
    # Check if user already exists
    existing_user = db.query(models.User).filter(
        (models.User.email == user_data.email) | (models.User.username == user_data.username)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    db_user = models.User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed_password,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        phone_number=user_data.phone_number,
        role=user_data.role
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user


@router.get("/me", response_model=schemas.UserOut)
async def get_me(current_user: models.User = Depends(get_current_user)):
    """Get current user information."""
    return current_user


@router.post("/change-password")
async def change_password(
    current_password: str,
    new_password: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change user password."""
    from app.auth import verify_password, get_password_hash
    
    # Verify current password
    if not verify_password(current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    
    # Update password
    current_user.hashed_password = get_password_hash(new_password)
    db.commit()
    
    return {"detail": "Password updated successfully"}


@router.post("/refresh-token", response_model=schemas.Token)
async def refresh_access_token(current_user: models.User = Depends(get_current_user)):
    """Refresh access token."""
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": current_user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}