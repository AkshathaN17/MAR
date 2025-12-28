import cv2
import torch
import joblib
import numpy as np
from pathlib import Path
from typing import Dict, Tuple


class GazeInference:
    """
    Performs gaze inference using:
    - CNN feature extractor
    - SVM classifier
    """

    def __init__(
        self,
        cnn_model_path: str,
        svm_model_path: str,
        device: str = "cpu"
    ):
        self.device = device

        # Load CNN feature extractor
        self.cnn = torch.load(cnn_model_path, map_location=device)
        self.cnn.eval()

        # Load SVM
        self.svm = joblib.load(svm_model_path)

        # Haar cascades for face & eyes
        self.face_detector = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self.eye_detector = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_eye.xml"
        )

    # -----------------------------
    # Preprocessing
    # -----------------------------
    def _extract_eye_region(self, frame: np.ndarray) -> Tuple[np.ndarray, bool]:
        """
        Detect face and extract eye region.
        Returns cropped eye image and success flag.
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.face_detector.detectMultiScale(gray, 1.3, 5)

        if len(faces) == 0:
            return None, False

        (x, y, w, h) = faces[0]
        face_roi = gray[y:y + h, x:x + w]

        eyes = self.eye_detector.detectMultiScale(face_roi)

        if len(eyes) == 0:
            return None, False

        # Combine eye regions
        eye_images = []
        for (ex, ey, ew, eh) in eyes[:2]:
            eye_images.append(face_roi[ey:ey + eh, ex:ex + ew])

        eye_region = np.concatenate(eye_images, axis=1)
        eye_region = cv2.resize(eye_region, (224, 224))

        return eye_region, True

    def _preprocess_eye(self, eye_img: np.ndarray) -> torch.Tensor:
        """
        Prepare eye image for CNN.
        """
        eye_img = eye_img / 255.0
        eye_img = torch.tensor(eye_img, dtype=torch.float32)
        eye_img = eye_img.unsqueeze(0).unsqueeze(0)  # [1,1,H,W]
        eye_img = eye_img.repeat(1, 3, 1, 1)          # fake RGB
        return eye_img.to(self.device)

    # -----------------------------
    # Inference
    # -----------------------------
    def infer(self, frame: np.ndarray, timestamp_sec: int) -> Dict:
        """
        Run gaze inference on a single frame.

        Returns:
            Dict with gaze prediction and confidence
        """
        eye_img, success = self._extract_eye_region(frame)

        if not success:
            return {
                "cue": "gaze",
                "timestamp_sec": timestamp_sec,
                "prediction": "unknown",
                "confidence": 0.0,
                "quality": "face_not_detected"
            }

        input_tensor = self._preprocess_eye(eye_img)

        with torch.no_grad():
            features = self.cnn(input_tensor)
            features = features.cpu().numpy().reshape(1, -1)

        probs = self.svm.predict_proba(features)[0]
        pred_idx = np.argmax(probs)

        label_map = {
            0: "looking_away",
            1: "looking_at_screen"
        }

        return {
            "cue": "gaze",
            "timestamp_sec": timestamp_sec,
            "prediction": label_map[pred_idx],
            "confidence": float(probs[pred_idx]),
            "quality": "good"
        }
