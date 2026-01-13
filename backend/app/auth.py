from datetime import datetime, timedelta, timezone
from typing import Optional, Union
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from app.db import get_db
from app import models, schemas

# Configuration
SECRET_KEY = "your-secret-key-here-change-in-production"  # Change this in production!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def authenticate_user(db: Session, username: str, password: str) -> Union[models.User, bool]:
    """Authenticate a user by username/email and password."""
    user = db.query(models.User).filter(
        (models.User.username == username) | (models.User.email == username)
    ).first()
    
    if not user or not verify_password(password, user.hashed_password):
        return False
    return user


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    """Get the current authenticated user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = schemas.TokenData(username=username)
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(
        (models.User.username == token_data.username) | (models.User.email == token_data.username)
    ).first()
    
    if user is None:
        raise credentials_exception
    
    # Update last login
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    
    return user


async def get_current_active_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Get the current active user."""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def require_roles(allowed_roles: list):
    """Decorator to require specific user roles."""
    def role_checker(current_user: models.User = Depends(get_current_active_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return current_user
    return role_checker


# Role-specific dependencies
def get_admin_user(current_user: models.User = Depends(get_current_active_user)) -> models.User:
    """Get current user if they are an admin."""
    if current_user.role != models.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


def get_agent_user(current_user: models.User = Depends(get_current_active_user)) -> models.User:
    """Get current user if they are an agent or admin."""
    if current_user.role not in [models.UserRole.AGENT, models.UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent or admin access required"
        )
    return current_user