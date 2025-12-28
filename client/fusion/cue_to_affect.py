from typing import Dict
import copy


class CueToAffectMapper:
    """
    Maps cue-level predictions (gaze, posture, etc.)
    to emotion probability distributions.
    """

    def __init__(self, cue_to_emotion_config: Dict):
        """
        Args:
            cue_to_emotion_config (Dict):
                Mapping of cue -> prediction -> emotion distribution
        """
        self.cue_to_emotion = cue_to_emotion_config

    def map(self, cue_output: Dict) -> Dict:
        """
        Convert a cue output into an affect (emotion) distribution.

        Args:
            cue_output (Dict): Smoothed cue output

        Returns:
            Dict: Cue output enriched with emotion probabilities
        """
        cue_name = cue_output.get("cue")
        prediction = cue_output.get("prediction")

        # Default: neutral distribution
        emotion_distribution = {
            "interested": 0.0,
            "bored": 0.0,
            "confused": 0.0,
            "frustrated": 0.0,
            "neutral": 1.0
        }

        if (
            cue_name not in self.cue_to_emotion
            or prediction not in self.cue_to_emotion[cue_name]
        ):
            enriched = copy.deepcopy(cue_output)
            enriched["emotion_distribution"] = emotion_distribution
            enriched["mapping_quality"] = "fallback_neutral"
            return enriched

        # Copy configured distribution
        emotion_distribution = copy.deepcopy(
            self.cue_to_emotion[cue_name][prediction]
        )

        enriched = copy.deepcopy(cue_output)
        enriched["emotion_distribution"] = emotion_distribution
        enriched["mapping_quality"] = "mapped"

        return enriched
