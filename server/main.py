"""
FastAPI server for affect analysis data ingestion and analytics.

Endpoints:
- POST /ingest/window - Receive per-window streaming data
- POST /ingest/session - Receive end-of-session batch data
- GET /analytics/classroom/{classroom_id} - Get classroom analytics
- GET /health - Health check endpoint
"""

import logging
from typing import Dict, List
from datetime import datetime

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from shared.schemas import WindowPayload, SessionPayload, ClassroomAnalytics
from server.services.aggregation import AggregationService
from server.services.analytics import AnalyticsService
from server.persistence.storage import StorageService


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Affect Analysis API",
    description="Client-server system for multi-modal affect analysis",
    version="1.0.0",
)

# Initialize services
storage_service = StorageService()
aggregation_service = AggregationService(storage_service)
analytics_service = AnalyticsService(storage_service, aggregation_service)


# ============================================================
# Health Check
# ============================================================

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


# ============================================================
# Data Ingestion Endpoints
# ============================================================

@app.post("/ingest/window", status_code=status.HTTP_201_CREATED)
async def ingest_window(window_data: WindowPayload):
    """
    Receive and store a per-window affect analysis result.

    This endpoint receives streaming updates from clients
    and stores them for aggregation and analytics.

    Args:
        window_data (WindowPayload): Validated window payload

    Returns:
        Dict: Confirmation response
    """
    try:
        # Store window data
        storage_service.save_window(window_data.dict())

        logger.info(
            f"Window ingested: "
            f"class={window_data.class_id}, "
            f"student={window_data.student_id}, "
            f"timestamp={window_data.timestamp_sec}"
        )

        return {
            "status": "success",
            "message": "Window data ingested",
            "timestamp_sec": window_data.timestamp_sec,
        }

    except Exception as e:
        logger.error(f"Error ingesting window: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest window: {str(e)}",
        )


@app.post("/ingest/session", status_code=status.HTTP_201_CREATED)
async def ingest_session(session_data: SessionPayload):
    """
    Receive and store an end-of-session summary.

    This endpoint receives batch summaries from clients
    and triggers aggregation/analytics updates.

    Args:
        session_data (SessionPayload): Validated session payload

    Returns:
        Dict: Confirmation response
    """
    try:
        # Store session data
        storage_service.save_session(session_data.dict())

        # Trigger aggregation for this student
        aggregation_service.aggregate_student_session(
            student_id=session_data.student_id,
            session_id=session_data.session_id,
            class_id=session_data.class_id,
        )

        logger.info(
            f"Session ingested: "
            f"class={session_data.class_id}, "
            f"student={session_data.student_id}, "
            f"session={session_data.session_id}"
        )

        return {
            "status": "success",
            "message": "Session data ingested",
            "session_id": session_data.session_id,
        }

    except Exception as e:
        logger.error(f"Error ingesting session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest session: {str(e)}",
        )


# ============================================================
# Analytics Endpoints
# ============================================================

@app.get("/analytics/classroom/{classroom_id}", response_model=ClassroomAnalytics)
async def get_classroom_analytics(classroom_id: str):
    """
    Get aggregated analytics for a classroom.

    This endpoint aggregates data from all students in a classroom
    and returns comprehensive analytics including:
    - Emotion distributions
    - Temporal trends
    - Per-student summaries
    - Dominant classroom emotion

    Args:
        classroom_id (str): Classroom identifier

    Returns:
        ClassroomAnalytics: Aggregated classroom analytics
    """
    try:
        analytics = analytics_service.compute_classroom_analytics(classroom_id)

        if analytics is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No data found for classroom: {classroom_id}",
            )

        return analytics

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error computing analytics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compute analytics: {str(e)}",
        )


# ============================================================
# Realtime inference (preprocessed crops from browser relay)
# ============================================================

from server.realtime_infer_api import router as realtime_infer_router
from server.live_session_pipeline import router as live_session_router

app.include_router(realtime_infer_router, prefix="/realtime", tags=["realtime"])
app.include_router(live_session_router, prefix="/realtime", tags=["realtime-live"])


# ============================================================
# Error Handlers
# ============================================================

@app.exception_handler(ValidationError)
async def validation_exception_handler(request, exc: ValidationError):
    """Handle Pydantic validation errors."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "status": "validation_error",
            "message": "Invalid payload format",
            "errors": exc.errors(),
        },
    )


# ============================================================
# Startup/Shutdown
# ============================================================

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    logger.info("Starting Affect Analysis API server...")
    storage_service.ensure_directories()


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("Shutting down Affect Analysis API server...")


# ============================================================
# Entry Point
# ============================================================

if __name__ == "__main__":
    import argparse
    import os
    import uvicorn

    parser = argparse.ArgumentParser(
        description="Run the Affect Analysis API server"
    )
    parser.add_argument(
        "--host",
        default=os.getenv("SERVER_HOST", "0.0.0.0"),
        help="Server host address (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("SERVER_PORT", "8000")),
        help="Server port (default: 8000)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development",
    )
    args = parser.parse_args()

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        reload=args.reload,
    )

