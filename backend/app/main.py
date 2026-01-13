from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import listings, measurements, users, properties, property_descriptions, auth, uploads
from .db import engine
from . import models
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app = FastAPI(
    title='Sunrisers Property Listing Assistant API',
    description='Comprehensive real estate management API with AR measurements and LLM-generated descriptions',
    version='2.0.0'
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all API routers
app.include_router(auth.router, prefix='/api')
app.include_router(users.router, prefix='/api')
app.include_router(properties.router, prefix='/api')
app.include_router(property_descriptions.router, prefix='/api')
app.include_router(measurements.router, prefix='/api')
app.include_router(uploads.router, prefix='/api')

# Legacy routes for backward compatibility
app.include_router(listings.router, prefix='/api', tags=['legacy'])

# Serve uploads and exports from project root
BASE_DIR = Path(__file__).resolve().parents[1]

uploads_dir = BASE_DIR.joinpath('uploads')
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount('/uploads', StaticFiles(directory=str(uploads_dir)), name='uploads')

exports_dir = BASE_DIR.joinpath('exports')
exports_dir.mkdir(parents=True, exist_ok=True)
app.mount('/exports', StaticFiles(directory=str(exports_dir)), name='exports')


@app.on_event('startup')
async def on_startup():
    """Create DB tables if they don't exist and log success."""
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)
        print("Database initialized: All missing tables have been automatically created.")


@app.get('/health')
async def health():
    return {
        'status': 'ok',
        'version': '2.0.0',
        'features': [
            'user_management',
            'property_management', 
            'ar_measurements',
            'llm_descriptions',
            'export_capabilities'
        ]
    }


@app.get('/')
async def root():
    return {
        'message': 'Sunrisers Property Listing Assistant API',
        'version': '2.0.0',
        'docs': '/docs',
        'redoc': '/redoc'
    }
