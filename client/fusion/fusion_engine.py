import json
from typing import Dict
from collections import defaultdict


class FusionEngine:
    """
    Decision-level fusion engine using weighted majority voting.
    """

    def __init__(self, fusion_config_path: str):
        """
        Args:
            fusion_config_path (str): Path to fusion_config.json
        """
        with open(fusion_config_path, "r") as f:
            self.config = json.load(f)

        self.cue_weights = self.config["cue_weights"]
        self.cue_to_emotion = self.config["cue_to_emotion"]
        self.emotions = self.config["emotions"]
        self.confidence_threshold = self.config.get("confidence_threshold", 0.2)

    # --------------------------------------------------
    # Core fusion logic
    # --------------------------------------------------
    def fuse(self, cues: Dict[str, Dict], timestamp_sec: int) -> Dict:
        """
        Fuse multiple cue outputs into a final emotion.

        Args:
            cues (Dict): {
                "gaze": {...},
                "posture": {...}
            }
            timestamp_sec (int)

        Returns:
            Dict: Final fused emotion output
        """
        emotion_scores = defaultdict(float)
        contributing_cues = []

        for cue_name, cue_data in cues.items():
            if cue_name not in self.cue_weights:
                continue

            if cue_data["confidence"] < self.confidence_threshold:
                continue

            weight = self.cue_weights[cue_name]
            confidence = cue_data["confidence"]
            cue_prediction = cue_data["prediction"]

            if cue_prediction not in self.cue_to_emotion[cue_name]:
                continue

            emotion_distribution = self.cue_to_emotion[cue_name][cue_prediction]

            for emotion, prob in emotion_distribution.items():
                emotion_scores[emotion] += weight * confidence * prob

            contributing_cues.append(cue_name)

        if not emotion_scores:
            return self._neutral_output(timestamp_sec)

        final_emotion = max(emotion_scores, key=emotion_scores.get)
        final_confidence = emotion_scores[final_emotion]

        return {
            "timestamp_sec": timestamp_sec,
            "final_emotion": final_emotion,
            "confidence": round(final_confidence, 4),
            "emotion_scores": dict(emotion_scores),
            "contributing_cues": contributing_cues,
            "fusion_type": "weighted_majority_voting"
        }

    # --------------------------------------------------
    # Fallback
    # --------------------------------------------------
    def _neutral_output(self, timestamp_sec: int) -> Dict:
        """
        Return neutral emotion when fusion is unreliable.
        """
        return {
            "timestamp_sec": timestamp_sec,
            "final_emotion": "neutral",
            "confidence": 0.0,
            "emotion_scores": {e: 0.0 for e in self.emotions},
            "contributing_cues": [],
            "fusion_type": "fallback_neutral"
        }
