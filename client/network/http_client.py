"""
HTTP client for sending affect analysis results to the server.

Supports:
- Per-window streaming (POST /ingest/window)
- End-of-session batch upload (POST /ingest/session)
- Retry logic with exponential backoff
- Error handling and logging
"""

import json
import time
import logging
from typing import Dict, Optional
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from shared.schemas import WindowPayload, SessionPayload


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AffectAnalysisClient:
    """
    HTTP client for affect analysis server communication.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        max_retries: int = 3,
        timeout: int = 10,
        enable_retry: bool = True,
    ):
        """
        Initialize HTTP client.

        Args:
            base_url (str): Server base URL
            max_retries (int): Maximum number of retry attempts
            timeout (int): Request timeout in seconds
            enable_retry (bool): Whether to enable automatic retries
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

        # Create session with retry strategy
        self.session = requests.Session()

        if enable_retry:
            retry_strategy = Retry(
                total=max_retries,
                backoff_factor=1,  # Exponential backoff: 1s, 2s, 4s
                status_forcelist=[429, 500, 502, 503, 504],
                allowed_methods=["POST", "GET"],
            )
            adapter = HTTPAdapter(max_retries=retry_strategy)
            self.session.mount("http://", adapter)
            self.session.mount("https://", adapter)

    # ============================================================
    # Window Streaming
    # ============================================================

    def send_window(
        self,
        window_payload: Dict,
        validate: bool = True,
    ) -> bool:
        """
        Send a per-window payload to the server.

        Args:
            window_payload (Dict): Window payload (will be validated if validate=True)
            validate (bool): Whether to validate payload against schema

        Returns:
            bool: True if successful, False otherwise
        """
        endpoint = f"{self.base_url}/ingest/window"

        try:
            # Validate payload if requested
            if validate:
                validated = WindowPayload(**window_payload)
                payload_dict = validated.dict(exclude_none=True)
            else:
                payload_dict = window_payload

            response = self.session.post(
                endpoint,
                json=payload_dict,
                timeout=self.timeout,
            )

            response.raise_for_status()

            logger.info(
                f"Window sent successfully: "
                f"student={payload_dict.get('student_id')}, "
                f"timestamp={payload_dict.get('timestamp_sec')}"
            )
            return True

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send window: {e}")
            return False
        except Exception as e:
            logger.error(f"Validation or other error: {e}")
            return False

    # ============================================================
    # Session Batch Upload
    # ============================================================

    def send_session(
        self,
        session_payload: Dict,
        validate: bool = True,
    ) -> bool:
        """
        Send an end-of-session payload to the server.

        Args:
            session_payload (Dict): Session payload (will be validated if validate=True)
            validate (bool): Whether to validate payload against schema

        Returns:
            bool: True if successful, False otherwise
        """
        endpoint = f"{self.base_url}/ingest/session"

        try:
            # Validate payload if requested
            if validate:
                validated = SessionPayload(**session_payload)
                payload_dict = validated.dict(exclude_none=True)
            else:
                payload_dict = session_payload

            response = self.session.post(
                endpoint,
                json=payload_dict,
                timeout=self.timeout,
            )

            response.raise_for_status()

            logger.info(
                f"Session sent successfully: "
                f"student={payload_dict.get('student_id')}, "
                f"session={payload_dict.get('session_id')}"
            )
            return True

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send session: {e}")
            return False
        except Exception as e:
            logger.error(f"Validation or other error: {e}")
            return False

    # ============================================================
    # Health Check
    # ============================================================

    def health_check(self) -> bool:
        """
        Check if server is reachable.

        Returns:
            bool: True if server is healthy, False otherwise
        """
        try:
            response = self.session.get(
                f"{self.base_url}/health",
                timeout=5,
            )
            return response.status_code == 200
        except Exception:
            return False

    # ============================================================
    # Batch Upload with Retry Logic
    # ============================================================

    def send_window_with_retry(
        self,
        window_payload: Dict,
        max_attempts: int = 3,
        backoff_sec: float = 1.0,
    ) -> bool:
        """
        Send window with manual retry logic (for additional control).

        Args:
            window_payload (Dict): Window payload
            max_attempts (int): Maximum retry attempts
            backoff_sec (float): Initial backoff delay in seconds

        Returns:
            bool: True if successful after retries, False otherwise
        """
        for attempt in range(max_attempts):
            success = self.send_window(window_payload, validate=True)

            if success:
                return True

            if attempt < max_attempts - 1:
                wait_time = backoff_sec * (2 ** attempt)  # Exponential backoff
                logger.warning(
                    f"Retry attempt {attempt + 1}/{max_attempts} "
                    f"after {wait_time:.1f}s"
                )
                time.sleep(wait_time)

        logger.error(f"Failed to send window after {max_attempts} attempts")
        return False

