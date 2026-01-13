from sqlalchemy import Column, Integer, String, Float, ForeignKey, Table, DateTime, Text, Boolean, Enum
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
import enum

Base = declarative_base()


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    AGENT = "agent"
    CLIENT = "client"


class PropertyStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    SOLD = "sold"
    WITHDRAWN = "withdrawn"
    PENDING = "pending"


class PropertyType(str, enum.Enum):
    HOUSE = "house"
    APARTMENT = "apartment"
    CONDO = "condo"
    TOWNHOUSE = "townhouse"
    COMMERCIAL = "commercial"
    LAND = "land"
    OTHER = "other"


class ListingType(str, enum.Enum):
    SALE = "sale"
    RENT = "rent"
    LEASE = "lease"


class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    
    # Profile information
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    phone_number = Column(String(20), nullable=True)
    profile_image_url = Column(String(500), nullable=True)
    
    # User role and status
    role = Column(Enum(UserRole), default=UserRole.CLIENT)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    properties = relationship('Property', back_populates='owner', foreign_keys='Property.owner_id')
    agent_properties = relationship('Property', back_populates='agent', foreign_keys='Property.agent_id')
    property_descriptions = relationship('PropertyDescription', back_populates='created_by', foreign_keys='PropertyDescription.created_by_id')


class Property(Base):
    __tablename__ = 'properties'
    
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    agent_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    # Basic property information
    title = Column(String(255), nullable=False)
    address = Column(String(500), nullable=False)
    price = Column(Float, nullable=True)
    bedrooms = Column(Integer, nullable=True)
    
    # Specific details
    water_supply = Column(String(100), nullable=True)
    total_land = Column(Float, nullable=True)
    
    status = Column(Enum(PropertyStatus), default=PropertyStatus.DRAFT)
    
    # Media
    images_json = Column(Text, nullable=True)  # Array of image URLs
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    owner = relationship('User', back_populates='properties', foreign_keys=[owner_id])
    agent = relationship('User', back_populates='agent_properties', foreign_keys=[agent_id])
    measurements = relationship('Measurement', back_populates='property', cascade='all, delete-orphan')
    descriptions = relationship('PropertyDescription', back_populates='property', cascade='all, delete-orphan')


class PropertyDescription(Base):
    __tablename__ = 'property_descriptions'
    
    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey('properties.id'), nullable=False)
    created_by_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    
    # LLM-generated content
    title_suggestion = Column(String(255), nullable=True)
    short_description = Column(Text, nullable=True)
    detailed_description = Column(Text, nullable=True)
    key_features = Column(Text, nullable=True)
    neighborhood_description = Column(Text, nullable=True)
    investment_analysis = Column(Text, nullable=True)
    
    # Metadata
    llm_model_used = Column(String(100), nullable=True)
    prompt_version = Column(String(50), nullable=True)
    generation_parameters = Column(Text, nullable=True)  # JSON string
    quality_score = Column(Float, nullable=True)
    
    # Status and Analytics
    is_active = Column(Boolean, default=False)
    is_approved = Column(Boolean, default=False)
    approved_by_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    view_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    property = relationship('Property', back_populates='descriptions')
    created_by = relationship('User', back_populates='property_descriptions', foreign_keys=[created_by_id])
    approved_by = relationship('User', foreign_keys=[approved_by_id])


class Measurement(Base):
    __tablename__ = 'measurements'
    
    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey('properties.id'), nullable=False)
    room_type = Column(String(64), nullable=False)
    
    # Dimensions
    area_sqm = Column(Float, nullable=False)
    volume_m3 = Column(Float, nullable=True)
    
    # AR/3D data
    vertex_heights_json = Column(Text, nullable=True)  # Heights at each vertex
    perimeter_json = Column(Text, nullable=True)      # Floor polygon coordinates
    exported_paths_json = Column(Text, nullable=True)  # Exported files (PDF, OBJ, etc.)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    property = relationship('Property', back_populates='measurements')
