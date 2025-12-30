"""
Persistence layer for storing affect analysis data.

Stores structured JSON files organized by:
- Per-window data
- Per-student summaries
- Per-classroom aggregates
"""

import json
import logging
from typing import Dict, List, Optional
from pathlib import Path
from datetime import datetime


logger = logging.getLogger(__name__)


class StorageService:
    """
    Service for persisting affect analysis data to JSON files.
    """

    def __init__(self, base_dir: str = "outputs/server"):
        """
        Initialize storage service.

        Args:
            base_dir (str): Base directory for storing data
        """
        self.base_dir = Path(base_dir)
        self.windows_dir = self.base_dir / "windows"
        self.sessions_dir = self.base_dir / "sessions"
        self.students_dir = self.base_dir / "students"
        self.classrooms_dir = self.base_dir / "classrooms"

    # ============================================================
    # Directory Management
    # ============================================================

    def ensure_directories(self):
        """Create all necessary directories."""
        self.windows_dir.mkdir(parents=True, exist_ok=True)
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self.students_dir.mkdir(parents=True, exist_ok=True)
        self.classrooms_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Storage directories ensured at: {self.base_dir}")

    # ============================================================
    # Window Storage
    # ============================================================

    def save_window(self, window_data: Dict):
        """
        Save a per-window data record.

        Args:
            window_data (Dict): Window payload data
        """
        class_id = window_data.get("class_id", "unknown")
        student_id = window_data.get("student_id", "unknown")
        timestamp_sec = window_data.get("timestamp_sec", 0)

        # Organize by class/student
        class_dir = self.windows_dir / class_id / student_id
        class_dir.mkdir(parents=True, exist_ok=True)

        # Save individual window file
        window_file = class_dir / f"window_{timestamp_sec:06d}.json"
        with open(window_file, "w") as f:
            json.dump(window_data, f, indent=2)

        logger.debug(f"Saved window: {window_file}")

    def load_student_windows(
        self,
        student_id: str,
        session_id: str,
        class_id: Optional[str] = None,
    ) -> List[Dict]:
        """
        Load all windows for a student session.

        Args:
            student_id (str): Student identifier
            session_id (str): Session identifier (used for filtering if needed)
            class_id (Optional[str]): Classroom identifier (optional filter)

        Returns:
            List[Dict]: List of window data records
        """
        windows = []

        # Search in all class directories if class_id not specified
        if class_id:
            search_dirs = [self.windows_dir / class_id / student_id]
        else:
            # Search all classes
            search_dirs = [
                d / student_id
                for d in self.windows_dir.iterdir()
                if d.is_dir()
            ]

        for student_dir in search_dirs:
            if not student_dir.exists():
                continue

            for window_file in sorted(student_dir.glob("window_*.json")):
                try:
                    with open(window_file, "r") as f:
                        window_data = json.load(f)
                        # Filter by session_id if provided
                        if session_id and window_data.get("session_id") != session_id:
                            continue
                        windows.append(window_data)
                except Exception as e:
                    logger.warning(f"Failed to load window {window_file}: {e}")

        return windows

    def load_classroom_windows(self, class_id: str) -> List[Dict]:
        """
        Load all windows for a classroom.

        Args:
            class_id (str): Classroom identifier

        Returns:
            List[Dict]: List of window data records
        """
        windows = []
        class_dir = self.windows_dir / class_id

        if not class_dir.exists():
            return windows

        for student_dir in class_dir.iterdir():
            if not student_dir.is_dir():
                continue

            for window_file in sorted(student_dir.glob("window_*.json")):
                try:
                    with open(window_file, "r") as f:
                        windows.append(json.load(f))
                except Exception as e:
                    logger.warning(f"Failed to load window {window_file}: {e}")

        return windows

    # ============================================================
    # Session Storage
    # ============================================================

    def save_session(self, session_data: Dict):
        """
        Save an end-of-session summary.

        Args:
            session_data (Dict): Session payload data
        """
        class_id = session_data.get("class_id", "unknown")
        student_id = session_data.get("student_id", "unknown")
        session_id = session_data.get("session_id", "unknown")

        # Organize by class/student
        class_dir = self.sessions_dir / class_id / student_id
        class_dir.mkdir(parents=True, exist_ok=True)

        # Save session file
        session_file = class_dir / f"{session_id}.json"
        with open(session_file, "w") as f:
            json.dump(session_data, f, indent=2)

        logger.info(f"Saved session: {session_file}")

    # ============================================================
    # Student Summary Storage
    # ============================================================

    def save_student_summary(self, summary_data: Dict):
        """
        Save an aggregated student session summary.

        Args:
            summary_data (Dict): Student summary data
        """
        class_id = summary_data.get("class_id", "unknown")
        student_id = summary_data.get("student_id", "unknown")
        session_id = summary_data.get("session_id", "unknown")

        # Organize by class/student
        class_dir = self.students_dir / class_id / student_id
        class_dir.mkdir(parents=True, exist_ok=True)

        # Save summary file
        summary_file = class_dir / f"{session_id}.json"
        with open(summary_file, "w") as f:
            json.dump(summary_data, f, indent=2)

        logger.debug(f"Saved student summary: {summary_file}")

    def load_classroom_students(self, class_id: str) -> List[Dict]:
        """
        Load all student summaries for a classroom.

        Args:
            class_id (str): Classroom identifier

        Returns:
            List[Dict]: List of student summary records
        """
        summaries = []
        class_dir = self.students_dir / class_id

        if not class_dir.exists():
            return summaries

        for student_dir in class_dir.iterdir():
            if not student_dir.is_dir():
                continue

            for summary_file in student_dir.glob("*.json"):
                try:
                    with open(summary_file, "r") as f:
                        summaries.append(json.load(f))
                except Exception as e:
                    logger.warning(f"Failed to load summary {summary_file}: {e}")

        return summaries

    # ============================================================
    # Classroom Aggregate Storage
    # ============================================================

    def save_classroom_aggregate(self, aggregate_data: Dict):
        """
        Save an aggregated classroom summary.

        Args:
            aggregate_data (Dict): Classroom aggregate data
        """
        class_id = aggregate_data.get("class_id", "unknown")

        # Save classroom aggregate file
        aggregate_file = self.classrooms_dir / f"{class_id}.json"
        with open(aggregate_file, "w") as f:
            json.dump(aggregate_data, f, indent=2)

        logger.info(f"Saved classroom aggregate: {aggregate_file}")

    def load_classroom_aggregate(self, class_id: str) -> Optional[Dict]:
        """
        Load aggregated classroom data.

        Args:
            class_id (str): Classroom identifier

        Returns:
            Optional[Dict]: Classroom aggregate data if found
        """
        aggregate_file = self.classrooms_dir / f"{class_id}.json"

        if not aggregate_file.exists():
            return None

        try:
            with open(aggregate_file, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load classroom aggregate: {e}")
            return None

