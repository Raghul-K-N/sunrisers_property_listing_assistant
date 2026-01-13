from pydantic import BaseModel, Field, ConfigDict, EmailStr, model_validator
from typing import Optional, List, Dict, Any
import json
from datetime import datetime
from enum import Enum


# Enums for API schemas
class UserRoleEnum(str, Enum):
    ADMIN = "admin"
    AGENT = "agent"
    CLIENT = "client"


class PropertyStatusEnum(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    SOLD = "sold"
    WITHDRAWN = "withdrawn"
    PENDING = "pending"


class PropertyTypeEnum(str, Enum):
    HOUSE = "house"
    APARTMENT = "apartment"
    CONDO = "condo"
    TOWNHOUSE = "townhouse"
    COMMERCIAL = "commercial"
    LAND = "land"
    OTHER = "other"


class ListingTypeEnum(str, Enum):
    SALE = "sale"
    RENT = "rent"
    LEASE = "lease"


# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone_number: Optional[str] = None
    role: UserRoleEnum = UserRoleEnum.CLIENT


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone_number: Optional[str] = None
    profile_image_url: Optional[str] = None


class UserOut(UserBase):
    id: int
    profile_image_url: Optional[str] = None
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Property Schemas
class PropertyBase(BaseModel):
    title: str
    address: str
    price: Optional[float] = None
    bedrooms: Optional[int] = None
    water_supply: Optional[str] = None
    total_land: Optional[float] = None
    images: Optional[List[str]] = None
    status: PropertyStatusEnum = PropertyStatusEnum.DRAFT


class PropertyCreate(PropertyBase):
    agent_id: Optional[int] = None


class PropertyUpdate(BaseModel):
    title: Optional[str] = None
    price: Optional[float] = None
    status: Optional[PropertyStatusEnum] = None
    images: Optional[List[str]] = None


class PropertyOut(PropertyBase):
    id: int
    owner_id: int
    agent_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    # Related data
    owner: Optional[UserOut] = None
    agent: Optional[UserOut] = None
    descriptions: List['PropertyDescriptionOut'] = []

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode='before')
    @classmethod
    def parse_json_fields(cls, data: Any) -> Any:
        if hasattr(data, "images_json") and data.images_json:
            try:
                data.images = json.loads(data.images_json)
            except:
                data.images = []
        return data


# Property Description Schemas
class PropertyDescriptionBase(BaseModel):
    title_suggestion: Optional[str] = None
    short_description: Optional[str] = None
    detailed_description: Optional[str] = None
    key_features: Optional[List[str]] = None
    neighborhood_description: Optional[str] = None
    investment_analysis: Optional[str] = None
    llm_model_used: Optional[str] = None
    prompt_version: Optional[str] = None
    generation_parameters: Optional[Dict[str, Any]] = None
    quality_score: Optional[float] = None


class PropertyDescriptionCreate(PropertyDescriptionBase):
    property_id: int


class PropertyDescriptionUpdate(BaseModel):
    title_suggestion: Optional[str] = None
    short_description: Optional[str] = None
    detailed_description: Optional[str] = None
    key_features: Optional[List[str]] = None
    neighborhood_description: Optional[str] = None
    investment_analysis: Optional[str] = None
    quality_score: Optional[float] = None


class PropertyDescriptionOut(PropertyDescriptionBase):
    id: int
    property_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    is_active: bool = False
    view_count: int = 0
    
    # Related data
    created_by: Optional[UserOut] = None

    model_config = ConfigDict(from_attributes=True)
    
    @model_validator(mode='before')
    @classmethod
    def parse_json_fields(cls, data: Any) -> Any:
        if hasattr(data, "key_features") and isinstance(data.key_features, str):
            try:
                data.key_features = json.loads(data.key_features)
            except:
                data.key_features = []
        if hasattr(data, "generation_parameters") and isinstance(data.generation_parameters, str):
            try:
                data.generation_parameters = json.loads(data.generation_parameters)
            except:
                data.generation_parameters = {}
        return data


# Measurement Schemas
class MeasurementBase(BaseModel):
    room_type: str
    area_sqm: float
    volume_m3: Optional[float] = None
    
    # AR/3D data
    vertex_heights: Optional[List[float]] = None
    perimeter: Optional[List[List[float]]] = None


class MeasurementCreate(MeasurementBase):
    property_id: int


class MeasurementUpdate(BaseModel):
    area_sqm: Optional[float] = None
    volume_m3: Optional[float] = None


class MeasurementOut(MeasurementBase):
    id: int
    property_id: int
    exported_paths: Optional[Dict[str, str]] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
    
    @model_validator(mode='before')
    @classmethod
    def parse_json_fields(cls, data: Any) -> Any:
        if hasattr(data, "vertex_heights_json") and data.vertex_heights_json:
            try:
                data.vertex_heights = json.loads(data.vertex_heights_json)
            except:
                data.vertex_heights = []
        if hasattr(data, "perimeter_json") and data.perimeter_json:
            try:
                data.perimeter = json.loads(data.perimeter_json)
            except:
                data.perimeter = []
        if hasattr(data, "exported_paths_json") and data.exported_paths_json:
            try:
                data.exported_paths = json.loads(data.exported_paths_json)
            except:
                data.exported_paths = {}
        return data


# API Response Models
class PropertyWithMeasurements(PropertyOut):
    measurements: List[MeasurementOut] = []
    descriptions: List[PropertyDescriptionOut] = []


class MeasurementWithProperty(MeasurementOut):
    property: Optional[PropertyOut] = None


# Bulk operation schemas
class BulkPropertyCreate(BaseModel):
    properties: List[PropertyCreate]


class BulkMeasurementCreate(BaseModel):
    measurements: List[MeasurementCreate]


# Search and filter schemas
class PropertySearchFilters(BaseModel):
    status: Optional[PropertyStatusEnum] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    min_bedrooms: Optional[int] = None
    max_bedrooms: Optional[int] = None


# Authentication schemas
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


class EmailSchema(BaseModel):
    email: EmailStr


# Statistics and analytics schemas
class PropertyStats(BaseModel):
    total_properties: int
    active_listings: int
    sold_properties: int
    average_price: Optional[float] = None


class MeasurementStats(BaseModel):
    total_measurements: int
    total_measured_area: Optional[float] = None
        
