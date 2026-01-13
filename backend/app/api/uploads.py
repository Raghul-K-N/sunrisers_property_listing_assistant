from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Depends
from pathlib import Path
import shutil
from ..auth import get_current_user
from .. import models
from ..db import get_db
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post('/property-photo')
def upload_property_photo(
    property_id: int = Form(...),
    category: str = Form(None),
    file: UploadFile = File(...),
    db=Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Upload a photo for a property. Saves file under uploads/<property_id>/ and returns relative path."""
    logger.info(f"Received upload request: prop_id={property_id}, cat={category}, filename={file.filename}")
    # ensure property exists and user has permission
    prop = db.query(models.Property).filter(models.Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail='Property not found')

    # check ownership/agent/admin
    is_owner = prop.owner_id == current_user.id
    is_agent = prop.agent_id == current_user.id
    is_admin = getattr(current_user.role, 'value', current_user.role) == 'admin'
    
    if not (is_owner or is_agent or is_admin):
        logger.warning(f"User {current_user.id} unauthorized for property {property_id}")
        raise HTTPException(status_code=403, detail='Not authorized to upload for this property')

    BASE_DIR = Path(__file__).resolve().parents[2]
    uploads_dir = BASE_DIR.joinpath('uploads')
    os.makedirs(uploads_dir, exist_ok=True)
    prop_dir = uploads_dir.joinpath(str(property_id))
    os.makedirs(prop_dir, exist_ok=True)

    filename = f"{category or 'photo'}_{file.filename}"
    dest = prop_dir.joinpath(filename)
    logger.info(f"Saving upload to {dest}")
    try:
        with dest.open('wb') as out_file:
            shutil.copyfileobj(file.file, out_file)
    except Exception as e:
        logger.error(f"Failed to save file: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to save image")
    finally:
        file.file.close()

    # return a relative path the client can store
    rel_path = f"/uploads/{property_id}/{filename}"
    return {"ok": True, "path": rel_path}
