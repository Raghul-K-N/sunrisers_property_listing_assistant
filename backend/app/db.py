from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os

# Read database URL from env var or fallback to a local dev DB
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql+asyncpg://sai:191911@localhost:5432/sunrisers')

# Async engine and session
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# Sync engine and session for specific tasks/legacy compatibility
SYNC_DATABASE_URL = DATABASE_URL.replace('postgresql+asyncpg://', 'postgresql://')
sync_engine = create_engine(SYNC_DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
