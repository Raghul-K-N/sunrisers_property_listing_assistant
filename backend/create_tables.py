#!/usr/bin/env python3
"""
Database table creation script for Sunrisers Property Listing Assistant
Run this script to create all the necessary database tables.
"""

from app.db import sync_engine
from app.models import Base
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_tables():
    """Create all database tables."""
    try:
        logger.info("Creating database tables...")
        Base.metadata.create_all(bind=sync_engine)
        logger.info("Successfully created all database tables!")
        
        # Print created tables
        logger.info("Created tables:")
        for table_name in Base.metadata.tables.keys():
            logger.info(f"  - {table_name}")
            
    except Exception as e:
        logger.error(f"Error creating tables: {e}")
        raise


if __name__ == "__main__":
    create_tables()