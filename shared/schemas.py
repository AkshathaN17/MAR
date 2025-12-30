"""
Shared Pydantic schemas for client-server communication.

These schemas ensure type safety and validation across
the entire affect analysis system.
"""

from typing import Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field, validator


# ============================================================
# Cue-Level Schemas
# ============================================================

class CueOutput(BaseModel):
    """
    Schema for a single cue's inference output.
    """
    cue: str = Field(..., description="Cue name (e.g., 'gaze', 'posture')")
    timestamp_sec: int = Field(..., ge=0, description="Timestamp in seconds")
    prediction: str = Field(..., description="Cue prediction label")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    quality: str = Field(..., description="Quality indicator (e.g., 'good', 'face_not_detected')")
    
    # Optional fields
    emotion_distribution: Optional[Dict[str, float]] = Field(
        None,
        description="Emotion probability distribution after cue→affect mapping"
    )
    mapping_quality: Optional[str] = Field(
        None,
        description="Quality of cue→emotion mapping (e.g., 'mapped', 'fallback_neutral')"
    )
    probabilities: Optional[Dict[str, float]] = Field(
        None,
        description="Raw class probabilities (for posture)"
    )

    @validator("emotion_distribution")
    def validate_emotion_dist(cls, v):
        """Ensure emotion distribution sums to ~1.0 if present."""
        if v is not None:
            total = sum(v.values())
            if abs(total - 1.0) > 0.01:
                raise ValueError(f"Emotion distribution must sum to ~1.0, got {total}")
        return v


# ============================================================
# Fusion-Level Schemas
# ============================================================

class FusionOutput(BaseModel):
    """
    Schema for decision-level fusion output.
    """
    timestamp_sec: int = Field(..., ge=0, description="Timestamp in seconds")
    final_emotion: str = Field(
        ...,
        description="Final fused emotion (interested, bored, confused, frustrated, neutral)"
    )
    confidence: float = Field(..., ge=0.0, description="Fused confidence score")
    emotion_scores: Dict[str, float] = Field(
        ...,
        description="Weighted emotion scores from fusion"
    )
    contributing_cues: List[str] = Field(
        ...,
        description="List of cues that contributed to fusion"
    )
    fusion_type: str = Field(
        ...,
        description="Fusion method (e.g., 'weighted_majority_voting', 'fallback_neutral')"
    )

    @validator("final_emotion")
    def validate_emotion(cls, v):
        """Ensure emotion is one of the supported values."""
        valid_emotions = {"interested", "bored", "confused", "frustrated", "neutral"}
        if v not in valid_emotions:
            raise ValueError(f"Invalid emotion: {v}. Must be one of {valid_emotions}")
        return v


# ============================================================
# Per-Window Payload Schema
# ============================================================

class WindowPayload(BaseModel):
    """
    Schema for per-window streaming payload.
    Sent from client to server for real-time updates.
    """
    type: str = Field("window_update", description="Payload type identifier")
    class_id: str = Field(..., description="Classroom identifier")
    student_id: str = Field(..., description="Student identifier")
    session_id: str = Field(..., description="Session identifier")
    timestamp_sec: int = Field(..., ge=0, description="Window timestamp")
    emotion: str = Field(..., description="Fused emotion")
    confidence: float = Field(..., ge=0.0, description="Fused confidence")
    emotion_scores: Dict[str, float] = Field(..., description="All emotion scores")
    fusion_type: str = Field(..., description="Fusion method used")
    
    # Optional: include cue-level details for debugging/research
    cues: Optional[Dict[str, CueOutput]] = Field(
        None,
        description="Optional cue-level outputs for explainability"
    )

    @validator("type")
    def validate_type(cls, v):
        if v != "window_update":
            raise ValueError("Window payload type must be 'window_update'")
        return v


# ============================================================
# Per-Student Session Payload Schema
# ============================================================

class SessionPayload(BaseModel):
    """
    Schema for end-of-session batch payload.
    Sent from client to server when a session completes.
    """
    type: str = Field(..., description="Payload type ('session_summary' or 'session_final')")
    class_id: str = Field(..., description="Classroom identifier")
    student_id: str = Field(..., description="Student identifier")
    session_id: str = Field(..., description="Session identifier")
    duration_sec: int = Field(..., ge=0, description="Session duration in seconds")
    total_windows: int = Field(..., ge=0, description="Total number of windows processed")
    emotion_distribution: Dict[str, float] = Field(
        ...,
        description="Normalized emotion distribution over session"
    )
    dominant_emotion: str = Field(..., description="Most frequent emotion in session")
    ended_at: Optional[int] = Field(None, description="Unix timestamp when session ended")

    @validator("type")
    def validate_type(cls, v):
        valid_types = {"session_summary", "session_final"}
        if v not in valid_types:
            raise ValueError(f"Invalid session type: {v}")
        return v

    @validator("emotion_distribution")
    def validate_distribution(cls, v):
        """Ensure emotion distribution sums to ~1.0."""
        total = sum(v.values())
        if abs(total - 1.0) > 0.01:
            raise ValueError(f"Emotion distribution must sum to ~1.0, got {total}")
        return v


# ============================================================
# Classroom Analytics Schema
# ============================================================

class TemporalTrend(BaseModel):
    """
    Schema for temporal emotion trends.
    """
    timestamp_sec: int = Field(..., ge=0, description="Window timestamp")
    emotion: str = Field(..., description="Dominant emotion at this timestamp")
    confidence: float = Field(..., ge=0.0, description="Average confidence")


class StudentSummary(BaseModel):
    """
    Schema for aggregated student-level summary.
    """
    student_id: str = Field(..., description="Student identifier")
    session_id: str = Field(..., description="Session identifier")
    total_windows: int = Field(..., ge=0, description="Total windows")
    duration_sec: int = Field(..., ge=0, description="Session duration")
    emotion_distribution: Dict[str, float] = Field(..., description="Emotion distribution")
    dominant_emotion: str = Field(..., description="Dominant emotion")
    average_confidence: float = Field(..., ge=0.0, le=1.0, description="Average confidence")


class ClassroomAnalytics(BaseModel):
    """
    Schema for classroom-level analytics response.
    """
    class_id: str = Field(..., description="Classroom identifier")
    total_students: int = Field(..., ge=0, description="Number of students")
    total_sessions: int = Field(..., ge=0, description="Number of sessions")
    total_windows: int = Field(..., ge=0, description="Total windows across all students")
    
    # Aggregated emotion distribution
    emotion_distribution: Dict[str, float] = Field(
        ...,
        description="Normalized emotion distribution across all students"
    )
    dominant_emotion: str = Field(..., description="Dominant classroom emotion")
    
    # Per-student summaries
    student_summaries: List[StudentSummary] = Field(
        ...,
        description="Individual student summaries"
    )
    
    # Temporal trends (aggregated)
    temporal_trends: List[TemporalTrend] = Field(
        ...,
        description="Temporal emotion trends over time"
    )
    
    # Metadata
    generated_at: datetime = Field(default_factory=datetime.now, description="Analytics generation timestamp")
    
    @validator("emotion_distribution")
    def validate_distribution(cls, v):
        """Ensure emotion distribution sums to ~1.0."""
        total = sum(v.values())
        if abs(total - 1.0) > 0.01:
            raise ValueError(f"Emotion distribution must sum to ~1.0, got {total}")
        return v

