from typing import Dict, List
from collections import defaultdict
import time


class DataPackager:
    """
    Packages client-side inference & fusion outputs
    into structured JSON payloads for server transmission.
    """

    def __init__(
        self,
        student_id: str,
        class_id: str,
        session_id: str
    ):
        self.student_id = student_id
        self.class_id = class_id
        self.session_id = session_id

        self.start_time = time.time()
        self.emotion_history: List[Dict] = []
        self.emotion_counter = defaultdict(int)

    # --------------------------------------------------
    # Add fused output
    # --------------------------------------------------
    def add_fusion_result(self, fusion_output: Dict):
        """
        Add a fused emotion output to history.

        Args:
            fusion_output (Dict): Output from FusionEngine
        """
        emotion = fusion_output["final_emotion"]
        self.emotion_counter[emotion] += 1
        self.emotion_history.append(fusion_output)

    # --------------------------------------------------
    # Window-level payload (frequent updates)
    # --------------------------------------------------
    def build_window_payload(self, fusion_output: Dict) -> Dict:
        """
        Build payload for a single time window.
        Suitable for WebSocket streaming.
        """
        return {
            "type": "window_update",
            "class_id": self.class_id,
            "student_id": self.student_id,
            "session_id": self.session_id,
            "timestamp_sec": fusion_output["timestamp_sec"],
            "emotion": fusion_output["final_emotion"],
            "confidence": fusion_output["confidence"],
            "emotion_scores": fusion_output["emotion_scores"],
            "fusion_type": fusion_output["fusion_type"]
        }

    # --------------------------------------------------
    # Periodic summary payload (batched)
    # --------------------------------------------------
    def build_summary_payload(self) -> Dict:
        """
        Build cumulative summary payload.
        Suitable for HTTPS batch transmission.
        """
        total_windows = len(self.emotion_history)
        if total_windows == 0:
            return {}

        emotion_distribution = {
            emotion: round(count / total_windows, 3)
            for emotion, count in self.emotion_counter.items()
        }

        dominant_emotion = max(
            emotion_distribution,
            key=emotion_distribution.get
        )

        return {
            "type": "session_summary",
            "class_id": self.class_id,
            "student_id": self.student_id,
            "session_id": self.session_id,
            "duration_sec": int(time.time() - self.start_time),
            "total_windows": total_windows,
            "emotion_distribution": emotion_distribution,
            "dominant_emotion": dominant_emotion
        }

    # --------------------------------------------------
    # Final payload (end of session)
    # --------------------------------------------------
    def build_final_payload(self) -> Dict:
        """
        Build final payload when video/session ends.
        """
        summary = self.build_summary_payload()
        summary["type"] = "session_final"
        summary["ended_at"] = int(time.time())
        return summary
