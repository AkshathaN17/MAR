from collections import deque, Counter
from typing import Dict, List
import numpy as np


class TemporalSmoother:
    """
    Applies temporal smoothing over a sliding window
    for cue predictions (gaze / posture).
    """

    def __init__(
        self,
        window_size: int = 3,
        confidence_threshold: float = 0.0
    ):
        """
        Args:
            window_size (int): Number of past frames to consider
            confidence_threshold (float): Ignore predictions below this confidence
        """
        self.window_size = window_size
        self.confidence_threshold = confidence_threshold
        self.buffers = {}  # cue_name -> deque

    def _init_buffer(self, cue_name: str):
        self.buffers[cue_name] = deque(maxlen=self.window_size)

    def update(self, cue_output: Dict) -> Dict:
        """
        Update temporal buffer for a cue and return smoothed output.

        Args:
            cue_output (Dict): Output from inference module

        Returns:
            Dict: Smoothed cue output
        """
        cue_name = cue_output["cue"]

        if cue_name not in self.buffers:
            self._init_buffer(cue_name)

        # Ignore low-quality frames
        if (
            cue_output["confidence"] < self.confidence_threshold
            or cue_output.get("quality", "unknown") != "good"
        ):
            return cue_output

        self.buffers[cue_name].append(cue_output)

        return self._smooth(cue_name)

    def _smooth(self, cue_name: str) -> Dict:
        """
        Perform smoothing for a given cue.
        """
        buffer = self.buffers[cue_name]

        predictions = [item["prediction"] for item in buffer]
        confidences = [item["confidence"] for item in buffer]

        # Majority vote
        most_common = Counter(predictions).most_common(1)[0][0]

        # Average confidence of majority class
        majority_conf = np.mean(
            [
                item["confidence"]
                for item in buffer
                if item["prediction"] == most_common
            ]
        )

        smoothed_output = buffer[-1].copy()
        smoothed_output.update({
            "prediction": most_common,
            "confidence": float(majority_conf),
            "window_size": len(buffer),
            "temporal_smoothed": True
        })

        return smoothed_output
