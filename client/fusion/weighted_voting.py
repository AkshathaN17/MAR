from typing import Dict
from collections import defaultdict


class WeightedMajorityVoting:
    """
    Implements weighted majority voting over emotion distributions.
    """

    def __init__(self, emotions: list):
        """
        Args:
            emotions (list): List of all possible emotions
        """
        self.emotions = emotions

    def vote(
        self,
        cue_affects: Dict[str, Dict],
        cue_weights: Dict[str, float],
        confidence_threshold: float = 0.0
    ) -> Dict:
        """
        Perform weighted voting over cues.

        Args:
            cue_affects (Dict):
                {
                    "gaze": {
                        "emotion_distribution": {...},
                        "confidence": float
                    },
                    "posture": {
                        "emotion_distribution": {...},
                        "confidence": float
                    }
                }
            cue_weights (Dict): cue -> weight
            confidence_threshold (float): minimum cue confidence

        Returns:
            Dict: {
                "emotion_scores": {...},
                "winning_emotion": str,
                "winning_score": float
            }
        """
        emotion_scores = defaultdict(float)

        for cue_name, cue_data in cue_affects.items():
            if cue_name not in cue_weights:
                continue

            confidence = cue_data.get("confidence", 0.0)
            if confidence < confidence_threshold:
                continue

            weight = cue_weights[cue_name]
            emotion_dist = cue_data.get("emotion_distribution", {})

            for emotion in self.emotions:
                emotion_scores[emotion] += (
                    weight * confidence * emotion_dist.get(emotion, 0.0)
                )

        if not emotion_scores:
            return self._neutral_result()

        winning_emotion = max(emotion_scores, key=emotion_scores.get)
        winning_score = emotion_scores[winning_emotion]

        return {
            "emotion_scores": dict(emotion_scores),
            "winning_emotion": winning_emotion,
            "winning_score": round(winning_score, 4)
        }

    def _neutral_result(self) -> Dict:
        """
        Fallback neutral result.
        """
        return {
            "emotion_scores": {e: 0.0 for e in self.emotions},
            "winning_emotion": "neutral",
            "winning_score": 0.0
        }
