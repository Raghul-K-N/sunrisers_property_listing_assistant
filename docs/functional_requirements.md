# Functional Requirements Document (FRD)
**Project Name:** Sunrisers Property Listing Assistant
**Version:** 1.1
**Date:** 2026-01-13
**Status:** Draft

## 1. Introduction
The Sunrisers Property Listing Assistant is a next-generation mobile application designed to revolutionize real estate listings. By integrating **Augmented Reality (AR)** for instant room measurement and **Generative AI (LLM)** for automated content creation, it drastically reduces the time required for agents to list properties while ensuring high accuracy and visual appeal.

## 2. User Personas & Roles

### 2.1 The Agent (Primary User)
*   **Goal:** Quickly list properties, get accurate measurements without carrying tools, and generate professional marketing copy instantly.
*   **Pain Points:** Manual measuring is tedious; writing descriptions is time-consuming; managing photos is disorganized.
*   **Key Features Used:** Create Listing, AR Measurement, AI Description Gen, Portfolio Management.

### 2.2 The Client (Property Seeker/Owner)
*   **Goal:** View detailed property verified information including 3D floor plans.
*   **Key Features Used:** Browse Listings, View 3D Plans, Search/Filter.

### 2.3 The Administrator
*   **Goal:** Ensure system health, manage user accounts, and oversee content quality.
*   **Key Features Used:** User Management Dashboard, Content Moderation.

## 3. Detailed Functional Requirements

### 3.1 Authentication Module
*   **FR-01 Registration:** Users must be able to register using Email, Username, and Password. Role selection (Agent/Client) happens during sign-up.
*   **FR-02 Secure Login:** System must authenticate users via encrypted credentials and issue a JWT for session management.
*   **FR-03 Password Recovery:** Users can request a password reset via email (simulation supported in MVP).

### 3.2 Property Listing Management
*   **FR-04 Create Property:** Agents can initialize a listing with:
    *   Basic Details: Title, Address, Price, Property Type (Apartment, House, etc.).
    *   Metadata: Water Supply, Power Backup status, Furnishing level.
*   **FR-05 Image Management:**
    *   Multi-upload support for specific categories: Bedroom, Washroom, Kitchen, etc.
    *   Images are automatically optimized for mobile viewing.
*   **FR-06 Listing Status:** Properties transition through states: `DRAFT` -> `ACTIVE` -> `SOLD`.

### 3.3 Augmented Reality (AR) Measurement
*   **FR-07 Surface Detection:** The app must detect horizontal floor planes using the device camera (ARCore).
*   **FR-08 Perimeter Scan:** Users tap corners of the room to define the floor boundary. The system visualizes lines connecting these points.
*   **FR-09 Auto-Calculation:**
    *   **Bounding Box:** Automatically calculates max Length and Width.
    *   **Area:** Calculates precise floor area in **sqm** and **sqft**.
*   **FR-10 Volumetric Data:** Users can scan the ceiling height to compute total room volume (m³ / ft³).
*   **FR-11 UI Feedback:** Real-time HUD (Heads-Up Display) showing current dimensions (L x W) and Area overlay.

### 3.4 AI Content Generation
*   **FR-12 Context-Aware Descriptions:** The system generates descriptions based on:
    *   Uploaded images (visual features).
    *   Numeric measurements (spaciousness).
    *   Location (neighborhood vibes).
*   **FR-13 Structured Output:** The AI must return:
    *   *Title Suggestion* (Catchy & SEO compliant).
    *   *Short Description* (For list views).
    *   *Detailed Description* (For full page views).
    *   *Key Features* (Bullet points).
    *   *Investment Analysis* (Rental yield potential).

### 3.5 Data & 3D Export
*   **FR-14 Offline Storage:** Measurements are saved locally if network is unavailable.
*   **FR-15 3D Export:** The scanned floor plan can be exported as an `.obj` file or `.pdf` report including 2D layout and dimensions.

## 4. User Interface (UI) Requirements
*   **Design Language:** "Glassmorphism" — usage of semi-transparent backgrounds, blur effects, and vibrant gradients.
*   **Navigation:** Bottom tab bar for primary navigation (Home, Scan, Profile).
*   **Responsiveness:** UI must adapt to various Android screen sizes and densities.
*   **Header Handling:** All screens must dynamically adjust padding for the Android Status Bar to prevent content overlap.

## 5. Assumptions & Constraints
*   **Device Support:** Requires Android devices supporting Google ARCore.
*   **Connectivity:** AI generation requires an active internet connection.
*   **Accuracy:** AR measurement accuracy depends on lighting conditions and hardware quality (typically +/- 2cm).
