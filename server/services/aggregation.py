"""
Aggregation service for combining window-level data into
student-level summaries and student-level data into classroom statistics.

This service performs:
- Window → Student aggregation
- Student → Classroom aggregation
"""

import json
import logging
from typing import Dict, List, Optional
from collections import defaultdict
from pathlib import Path

from server.persistence.storage import StorageService


logger = logging.getLogger(__name__)


class AggregationService:
    """
    Service for aggregating affect analysis data.
    """

    def __init__(self, storage_service: StorageService):
        """
        Initialize aggregation service.

        Args:
            storage_service (StorageService): Storage service instance
        """
        self.storage = storage_service

    # ============================================================
    # Window → Student Aggregation
    # ============================================================

    def aggregate_student_session(
        self,
        student_id: str,
        session_id: str,
        class_id: str,
    ) -> Optional[Dict]:
        """
        Aggregate all windows for a student session into a summary.

        Args:
            student_id (str): Student identifier
            session_id (str): Session identifier
            class_id (str): Classroom identifier

        Returns:
            Optional[Dict]: Aggregated student session summary
        """
        try:
            # Load all windows for this session
            windows = self.storage.load_student_windows(student_id, session_id)

            if not windows:
                logger.warning(
                    f"No windows found for student={student_id}, session={session_id}"
                )
                return None

            # Aggregate statistics
            total_windows = len(windows)
            emotion_counter = defaultdict(int)
            confidence_sum = 0.0

            for window in windows:
                emotion = window.get("emotion", "neutral")
                confidence = window.get("confidence", 0.0)
                emotion_counter[emotion] += 1
                confidence_sum += confidence

            # Compute emotion distribution
            emotion_distribution = {
                emotion: round(count / total_windows, 3)
                for emotion, count in emotion_counter.items()
            }

            # Find dominant emotion
            dominant_emotion = max(
                emotion_distribution,
                key=emotion_distribution.get,
            )

            # Compute average confidence
            average_confidence = round(confidence_sum / total_windows, 3)

            # Get duration from first and last window
            timestamps = [w.get("timestamp_sec", 0) for w in windows]
            duration_sec = max(timestamps) - min(timestamps) if timestamps else 0

            summary = {
                "student_id": student_id,
                "session_id": session_id,
                "class_id": class_id,
                "total_windows": total_windows,
                "duration_sec": duration_sec,
                "emotion_distribution": emotion_distribution,
                "dominant_emotion": dominant_emotion,
                "average_confidence": average_confidence,
            }

            # Save aggregated summary
            self.storage.save_student_summary(summary)

            logger.info(
                f"Aggregated student session: "
                f"student={student_id}, session={session_id}, "
                f"windows={total_windows}"
            )

            return summary

        except Exception as e:
            logger.error(f"Error aggregating student session: {e}")
            return None

    # ============================================================
    # Student → Classroom Aggregation
    # ============================================================

    def aggregate_classroom(
        self,
        class_id: str,
    ) -> Optional[Dict]:
        """
        Aggregate all student summaries for a classroom.

        Args:
            class_id (str): Classroom identifier

        Returns:
            Optional[Dict]: Aggregated classroom statistics
        """
        try:
            # Load all student summaries for this classroom
            student_summaries = self.storage.load_classroom_students(class_id)

            if not student_summaries:
                logger.warning(f"No student summaries found for class={class_id}")
                return None

            # Aggregate across all students
            total_students = len(student_summaries)
            total_sessions = len(student_summaries)
            total_windows = sum(s.get("total_windows", 0) for s in student_summaries)

            # Aggregate emotion distributions
            emotion_counter = defaultdict(float)
            total_weight = 0.0

            for summary in student_summaries:
                dist = summary.get("emotion_distribution", {})
                windows = summary.get("total_windows", 0)

                # Weight by number of windows
                for emotion, prob in dist.items():
                    emotion_counter[emotion] += prob * windows
                    total_weight += windows

            # Normalize emotion distribution
            if total_weight > 0:
                emotion_distribution = {
                    emotion: round(count / total_weight, 3)
                    for emotion, count in emotion_counter.items()
                }
            else:
                emotion_distribution = {"neutral": 1.0}

            # Find dominant classroom emotion
            dominant_emotion = max(
                emotion_distribution,
                key=emotion_distribution.get,
            )

            aggregated = {
                "class_id": class_id,
                "total_students": total_students,
                "total_sessions": total_sessions,
                "total_windows": total_windows,
                "emotion_distribution": emotion_distribution,
                "dominant_emotion": dominant_emotion,
            }

            # Save aggregated classroom data
            self.storage.save_classroom_aggregate(aggregated)

            logger.info(
                f"Aggregated classroom: class={class_id}, "
                f"students={total_students}, windows={total_windows}"
            )

            return aggregated

        except Exception as e:
            logger.error(f"Error aggregating classroom: {e}")
            return None

