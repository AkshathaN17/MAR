"""
Analytics service for computing emotion distributions,
temporal trends, and dominant emotions at classroom level.
"""

import logging
from typing import Dict, List, Optional
from collections import defaultdict
from datetime import datetime

from shared.schemas import ClassroomAnalytics, StudentSummary, TemporalTrend
from server.persistence.storage import StorageService
from server.services.aggregation import AggregationService


logger = logging.getLogger(__name__)


class AnalyticsService:
    """
    Service for computing analytics and insights.
    """

    def __init__(
        self,
        storage_service: StorageService,
        aggregation_service: AggregationService,
    ):
        """
        Initialize analytics service.

        Args:
            storage_service (StorageService): Storage service instance
            aggregation_service (AggregationService): Aggregation service instance
        """
        self.storage = storage_service
        self.aggregation = aggregation_service

    # ============================================================
    # Classroom Analytics
    # ============================================================

    def compute_classroom_analytics(
        self,
        class_id: str,
    ) -> Optional[ClassroomAnalytics]:
        """
        Compute comprehensive analytics for a classroom.

        This includes:
        - Aggregated emotion distributions
        - Per-student summaries
        - Temporal trends
        - Dominant classroom emotion

        Args:
            class_id (str): Classroom identifier

        Returns:
            Optional[ClassroomAnalytics]: Complete classroom analytics
        """
        try:
            # Ensure classroom aggregation is up-to-date
            self.aggregation.aggregate_classroom(class_id)

            # Load aggregated classroom data
            classroom_data = self.storage.load_classroom_aggregate(class_id)

            if not classroom_data:
                return None

            # Load all student summaries
            student_summaries_raw = self.storage.load_classroom_students(class_id)

            # Convert to StudentSummary schemas
            student_summaries = [
                StudentSummary(
                    student_id=s["student_id"],
                    session_id=s["session_id"],
                    total_windows=s["total_windows"],
                    duration_sec=s["duration_sec"],
                    emotion_distribution=s["emotion_distribution"],
                    dominant_emotion=s["dominant_emotion"],
                    average_confidence=s.get("average_confidence", 0.0),
                )
                for s in student_summaries_raw
            ]

            # Compute temporal trends
            temporal_trends = self._compute_temporal_trends(class_id)

            # Build analytics response
            analytics = ClassroomAnalytics(
                class_id=class_id,
                total_students=classroom_data["total_students"],
                total_sessions=classroom_data["total_sessions"],
                total_windows=classroom_data["total_windows"],
                emotion_distribution=classroom_data["emotion_distribution"],
                dominant_emotion=classroom_data["dominant_emotion"],
                student_summaries=student_summaries,
                temporal_trends=temporal_trends,
                generated_at=datetime.now(),
            )

            logger.info(f"Computed analytics for classroom: {class_id}")

            return analytics

        except Exception as e:
            logger.error(f"Error computing classroom analytics: {e}")
            return None

    # ============================================================
    # Temporal Trends
    # ============================================================

    def _compute_temporal_trends(
        self,
        class_id: str,
    ) -> List[TemporalTrend]:
        """
        Compute temporal emotion trends for a classroom.

        Aggregates windows across all students and computes
        dominant emotion at each timestamp.

        Args:
            class_id (str): Classroom identifier

        Returns:
            List[TemporalTrend]: Temporal trends over time
        """
        try:
            # Load all windows for this classroom
            all_windows = self.storage.load_classroom_windows(class_id)

            if not all_windows:
                return []

            # Group windows by timestamp
            windows_by_timestamp = defaultdict(list)

            for window in all_windows:
                timestamp = window.get("timestamp_sec", 0)
                windows_by_timestamp[timestamp].append(window)

            # Compute dominant emotion per timestamp
            trends = []

            for timestamp in sorted(windows_by_timestamp.keys()):
                windows = windows_by_timestamp[timestamp]

                # Aggregate emotions at this timestamp
                emotion_counter = defaultdict(int)
                confidence_sum = 0.0

                for window in windows:
                    emotion = window.get("emotion", "neutral")
                    confidence = window.get("confidence", 0.0)
                    emotion_counter[emotion] += 1
                    confidence_sum += confidence

                # Find dominant emotion
                dominant_emotion = max(
                    emotion_counter,
                    key=emotion_counter.get,
                )

                # Average confidence
                avg_confidence = (
                    round(confidence_sum / len(windows), 3) if windows else 0.0
                )

                trends.append(
                    TemporalTrend(
                        timestamp_sec=timestamp,
                        emotion=dominant_emotion,
                        confidence=avg_confidence,
                    )
                )

            return trends

        except Exception as e:
            logger.error(f"Error computing temporal trends: {e}")
            return []

