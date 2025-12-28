import cv2
import torch
import json
import numpy as np
from typing import Dict
from pathlib import Path


class PostureInference:
    """
    Performs posture / gesture inference using a CNN classifier.
    """

    def __init__(
        self,
        model_path: str,
        class_map_path: str,
        device: str = "cpu"
    ):
        self.device = device

        # Load posture CNN
        self.model = torch.load(model_path, map_location=device)
        self.model.eval()

        # Load class map
        with open(class_map_path, "r") as f:
            self.class_map = json.load(f)

        # Person detector (HOG-based, lightweight)
        self.person_detector = cv2.HOGDescriptor()
        self.person_detector.setSVMDetector(
            cv2.HOGDescriptor_getDefaultPeopleDetector()
        )

    # -----------------------------
    # Preprocessing
    # -----------------------------
    def _detect_person(self, frame: np.ndarray):
        """
        Detect the primary person in the frame.
        """
        boxes, _ = self.person_detector.detectMultiScale(
            frame,
            winStride=(8, 8),
            padding=(8, 8),
            scale=1.05
        )

        if len(boxes) == 0:
            return None

        # Take the largest detected person
        x, y, w, h = max(boxes, key=lambda b: b[2] * b[3])
        return frame[y:y + h, x:x + w]

    def _preprocess(self, img: np.ndarray) -> torch.Tensor:
        """
        Prepare image for CNN.
        """
        img = cv2.resize(img, (224, 224))
        img = img / 255.0
        img = torch.tensor(img, dtype=torch.float32)
        img = img.permute(2, 0, 1)  # HWC → CHW
        img = img.unsqueeze(0)
        return img.to(self.device)

    # -----------------------------
    # Inference
    # -----------------------------
    def infer(self, frame: np.ndarray, timestamp_sec: int) -> Dict:
        """
        Run posture inference on a single frame.

        Returns:
            Dict with posture prediction and probabilities
        """
        person_crop = self._detect_person(frame)

        if person_crop is None:
            return {
                "cue": "posture",
                "timestamp_sec": timestamp_sec,
                "prediction": "unknown",
                "confidence": 0.0,
                "probabilities": {},
                "quality": "person_not_detected"
            }

        input_tensor = self._preprocess(person_crop)

        with torch.no_grad():
            logits = self.model(input_tensor)
            probs = torch.softmax(logits, dim=1)[0].cpu().numpy()

        pred_idx = int(np.argmax(probs))
        pred_label = self.class_map[str(pred_idx)]
        confidence = float(probs[pred_idx])

        prob_dict = {
            self.class_map[str(i)]: float(probs[i])
            for i in range(len(probs))
        }

        return {
            "cue": "posture",
            "timestamp_sec": timestamp_sec,
            "prediction": pred_label,
            "confidence": confidence,
            "probabilities": prob_dict,
            "quality": "good"
        }
