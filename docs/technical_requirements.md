# Technical Requirements Document (TRD)
**Project Name:** Sunrisers Property Listing Assistant
**Version:** 1.1
**Date:** 2026-01-13
**Status:** Draft

## 1. Executive Summary
This document outlines the technical architecture for the "Sunrisers Property Listing Assistant," a scalable mobile-first solution designed to digitize real estate workflows. The system utilizes a distributed client-server architecture, leveraging on-device AR computation for low latency and cloud-based AI for high-quality content generation.

## 2. Technology Stack

### 2.1 Mobile Application (Frontend)
*   **Core Framework:** React Native (0.76+), managed via Expo SDK 52.
*   **Language:** JavaScript (ES6+) / TypeScript.
*   **AR Engine:** `react-native-ar` / `ViroReact` (Custom Native Module Bridge for ARCore).
*   **State Management:** React Context API + Hooks (`useReducer`, `useState`).
*   **Networking:** `fetch` API for REST calls.
*   **Storage:** `@react-native-async-storage` for offline caching of measurements.
*   **UI Library:** Custom Component System with `StyleSheet` (no external heavyweight UI kits).

### 2.2 Backend Platform (API)
*   **Framework:** FastAPI (0.104+) - chosen for high-performance async capabilities.
*   **Language:** Python 3.10+.
*   **ASGI Server:** Uvicorn.
*   **AI Integration:** Google Generative AI SDK (`google-genai`).
*   **Image Processing:** `Pillow` (PIL) for resizing and format conversion.
*   **Dependency Management:** `pip` / `requirements.txt`.

### 2.3 Data Persistence
*   **Database:** SQLite (Development/Prototype) -> PostgreSQL 15+ (Production).
*   **ORM:** SQLAlchemy (Async + Sync Session management).
*   **Schema Migration:** `Alembic`.
*   **File Storage:** Local filesystem with static mounting (`/uploads` dir) -> S3/GCS (Production).

## 3. System Architecture

```mermaid
graph TD
    User-->|Interact| MobileApp[Mobile App (React Native)]
    MobileApp-->|AR Session| ARCore[AR Core Engine]
    MobileApp-->|REST API| Backend[FastAPI Backend]
    
    subgraph "Backend Services"
    Backend-->|Query/Write| Database[(SQL Database)]
    Backend-->|Prompt| AI[Google Gemini LLM]
    Backend-->|Store| FileSys[File System / S3]
    end
    
    subgraph "On-Device"
    ARCore-->|Plane Data| GeometryEngine[Geometry Engine]
    GeometryEngine-->|Polygon| MobileApp
    end
```

## 4. Database Schema Specification

### 4.1 Tables Overview
1.  **Users (`users`)**:
    *   `id` (PK), `email`, `username`, `hashed_password` (bcrypt), `role` (enum: agent, client, admin).
2.  **Properties (`properties`)**:
    *   `id` (PK), `owner_id` (FK), `title`, `price`, `images_json` (Text Array).
3.  **Measurements (`measurements`)**:
    *   `id` (PK), `property_id` (FK), `room_type`, `area_sqm`, `length_m`, `width_m`.
    *   `vertex_heights_json` (For 3D reconstruction).
4.  **Property Descriptions (`property_descriptions`)**:
    *   `id` (PK), `property_id` (FK), `detailed_description`, `key_features`, `llm_model_used`.

## 5. API Specification (Key Endpoints)

### 5.1 Authentication (`/auth`)
*   `POST /token`: Login (OAuth2 Password Grant).
*   `POST /register`: Create new user.
*   `POST /forgot-password`: Value: `{ email: string }`.

### 5.2 Properties (`/properties`)
*   `POST /`: Create draft property.
*   `POST /{id}/upload`: Multipart/form-data image upload.
*   `GET /`: List all active properties (with filters).

### 5.3 Measurements (`/measurements`)
*   `POST /`: Save measurement data (supports offline sync).
*   `POST /{id}/export`: Trigger export job (PDF/OBJ).

### 5.4 AI Services (`/property-descriptions`)
*   `POST /generate/{property_id}`: Triggers async LLM generation task.

## 6. Security & Compliance
*   **Transport Security:** TLS 1.2+ required for all API communications (HTTPS).
*   **Data Encryption:**
    *   Passwords verified via `bcrypt` (work factor 12).
    *   Sensitive user data encrypted at rest (DB level).
*   **Authorization:** Role-Based Access Control (RBAC). Middleware checks `user.role` before allowing Admin/Agent actions.
*   **Input Validation:** Strict Pydantic models prevent SQL Injection and XSS attacks.

## 7. Deployment Strategy
*   **Containerization:** `Dockerfile` provided for Backend.
*   **Orchestration:** `docker-compose.yml` for local service coordination (API + DB).
*   **CI/CD:** GitHub Actions pipeline for linting (flake8/eslint) and unit tests.
*   **Scalability:** Stateless backend design allows horizontal scaling behind a Load Balancer (Nginx).

## 8. Scalability & Performance
*   **Caching:** Redis implementation planned for frequent property queries.
*   **Database:** Read replicas recommended for high-volume viewing traffic.
*   **CDN:** Use CloudFront/Cloudflare for serving static images and 3D assets to minimize latency.
