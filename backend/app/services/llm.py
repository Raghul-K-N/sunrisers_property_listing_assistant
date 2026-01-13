import os
import json
import logging
import google.generativeai as genai
from typing import Dict, Any, List, Optional
from decouple import config

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.api_key = config("GEMINI_API_KEY", default=None)
        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel('gemini-1.5-flash')
        else:
            logger.warning("GEMINI_API_KEY not found in environment. LLM features will be mocked.")
            self.model = None

    async def generate_property_description(self, property_data: Dict[str, Any], measurements: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Generate property description using Gemini.
        Returns a dict with title_suggestion, short_description, and detailed_description.
        """
        if not self.model:
            return self._get_mock_description(property_data)

        # Prepare context from measurements
        measurements_text = "\n".join([
            f"- {m['room_type']}: {m['area_sqm']} sqm (Volume: {m.get('volume_m3', 'N/A')} m3)"
            for m in measurements
        ])

        prompt = f"""
        Act as a professional real estate copywriter. Generate a compelling property listing based on the following data:

        Property Title: {property_data.get('title')}
        Address: {property_data.get('address')}
        Price: ₹{property_data.get('price')}
        Total Land Area: {property_data.get('total_land')} sqm
        Water Supply: {property_data.get('water_supply')}
        Bedrooms: {property_data.get('bedrooms')}

        Room Measurements:
        {measurements_text}

        Please provide:
        1. A catchy 'title_suggestion' (max 60 chars).
        2. A 'short_description' (max 200 chars) highlighting the best features.
        3. A 'detailed_description' (multi-paragraph) that tells a story and emphasizes the space, measurements, and location.
        4. A list of 'key_features' based on the data.

        Return the response strictly as a JSON object with these keys: 
        "title_suggestion", "short_description", "detailed_description", "key_features" (which should be a list of strings).
        """

        try:
            response = self.model.generate_content(prompt)
            # Remove markdown code blocks if present
            clean_text = response.text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:-3].strip()
            elif clean_text.startswith("```"):
                clean_text = clean_text[3:-3].strip()
            
            return json.loads(clean_text)
        except Exception as e:
            logger.error(f"Error generating description with Gemini: {e}")
            return self._get_mock_description(property_data)

    def _get_mock_description(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """Fall back to a simple template if LLM fails or no API key."""
        title = property_data.get('title', 'Property')
        address = property_data.get('address', 'Prime Location')
        land = property_data.get('total_land', '--')
        
        return {
            "title_suggestion": f"Stunning Property in {address}",
            "short_description": f"Beautiful listing featuring {land} sqm of land area and modern amenities.",
            "detailed_description": f"Located at {address}, this property offers a unique opportunity. With {land} sqm of total land and thoughtful design, it's perfect for families or investors. Explore the spacious rooms and excellent water supply infrastructure.",
            "key_features": ["Prime Location", f"{land} sqm Land Area", "Spacious Rooms"]
        }

llm_service = LLMService()
