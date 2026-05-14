import cv2
import torch
import torch.nn as nn
import json
import numpy as np
from typing import Dict
from pathlib import Path
from torchvision import models


class FacialInference:
    """
    Performs facial expression inference using a CNN classifier.
    """

    def __init__(
        self,
        model_path: str,
        class_map_path: str,
        device: str = "cpu"
    ):
        self.device = device

        # Load class map first to determine number of classes
        with open(class_map_path, "r") as f:
            self.class_map = json.load(f)

        num_classes = len(self.class_map)

        # Reconstruct model architecture (matches training: ResNet18 with custom fc)
        self.model = models.resnet18(weights="IMAGENET1K_V1")
        # Freeze backbone (as done in training)
        for param in self.model.parameters():
            param.requires_grad = False
        # Replace fc layer with custom classifier
        self.model.fc = nn.Linear(self.model.fc.in_features, num_classes)
        
        # Load state dict
        state_dict = torch.load(model_path, map_location=device)
        self.model.load_state_dict(state_dict)
        
        # Move to device and set to eval mode
        self.model = self.model.to(device)
        self.model.eval()

        # Face detector
        self.face_detector = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

    # -----------------------------
    # Preprocessing
    # -----------------------------
    def _detect_face(self, frame: np.ndarray):
        """
        Detect the primary face in the frame.
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.face_detector.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
        )

        if len(faces) == 0:
            return None

        # Take the largest detected face
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
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
        Run facial expression inference on a single frame.

        Returns:
            Dict with facial expression prediction and probabilities
        """
        face_crop = self._detect_face(frame)

        if face_crop is None:
            return {
                "cue": "facial",
                "timestamp_sec": timestamp_sec,
                "prediction": "unknown",
                "probabilities": {label: 0.0 for label in self.class_map.values()},
                "confidence": 0.0
            }

        # Preprocess and infer
        input_tensor = self._preprocess(face_crop)

        with torch.no_grad():
            outputs = self.model(input_tensor)
            probabilities = torch.softmax(outputs, dim=1).squeeze().cpu().numpy()
            predicted_idx = np.argmax(probabilities)
            confidence = probabilities[predicted_idx]

        predicted_label = self.class_map[str(predicted_idx)]

        return {
            "cue": "facial",
            "timestamp_sec": timestamp_sec,
            "prediction": predicted_label,
            "probabilities": {self.class_map[str(idx)]: float(prob) for idx, prob in enumerate(probabilities)},
            "confidence": float(confidence)
        }