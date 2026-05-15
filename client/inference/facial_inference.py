import cv2
import torch
import torch.nn as nn
import json
import numpy as np
import logging
from typing import Dict
from torchvision import models


logger = logging.getLogger(__name__)


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

        state_dict = self._load_state_dict(model_path)
        architecture = self._detect_architecture(state_dict)
        logger.info("Facial checkpoint architecture detected: %s", architecture)
        if architecture != "efficientnet_b0":
            raise RuntimeError(
                "Facial checkpoint architecture mismatch: expected efficientnet_b0 "
                f"(training architecture), detected {architecture}."
            )

        # Match training exactly: EfficientNetB0 backbone + custom classifier head.
        self.model = models.efficientnet_b0(weights=None)

        for param in self.model.parameters():
            param.requires_grad = False
        for param in self.model.features[-3:].parameters():
            param.requires_grad = True

        self.model.classifier = nn.Sequential(
            nn.Dropout(p=0.4),
            nn.Linear(1280, 256),
            nn.ReLU(),
            nn.Dropout(p=0.3),
            nn.Linear(256, num_classes),
        )

        self.model.load_state_dict(state_dict)
        
        # Move to device and set to eval mode
        self.model = self.model.to(device)
        self.model.eval()

        total_params = sum(p.numel() for p in self.model.parameters())
        trainable_params = sum(p.numel() for p in self.model.parameters() if p.requires_grad)
        logger.info(
            "Facial model loaded successfully from %s (params=%d, trainable=%d)",
            model_path,
            total_params,
            trainable_params,
        )

        # Face detector
        self.face_detector = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

    def _load_state_dict(self, model_path: str) -> Dict[str, torch.Tensor]:
        checkpoint = torch.load(model_path, map_location=self.device)

        if isinstance(checkpoint, dict):
            if all(torch.is_tensor(v) for v in checkpoint.values()):
                return checkpoint
            if "state_dict" in checkpoint and isinstance(checkpoint["state_dict"], dict):
                return checkpoint["state_dict"]
            if "model_state_dict" in checkpoint and isinstance(checkpoint["model_state_dict"], dict):
                return checkpoint["model_state_dict"]

        raise RuntimeError(
            "Unsupported facial checkpoint format. Expected a state_dict or a dict containing "
            "'state_dict'/'model_state_dict'."
        )

    def _detect_architecture(self, state_dict: Dict[str, torch.Tensor]) -> str:
        keys = set(state_dict.keys())
        has_efficientnet = any(k.startswith("features.") for k in keys) and any(
            k.startswith("classifier.") for k in keys
        )
        has_resnet = any(k.startswith("conv1.") for k in keys) and any(
            k.startswith("layer1.") for k in keys
        )

        if has_efficientnet and not has_resnet:
            return "efficientnet_b0"
        if has_resnet and not has_efficientnet:
            return "resnet18"

        sample = sorted(keys)[:8]
        raise RuntimeError(
            "Could not reliably detect facial checkpoint architecture from keys. "
            f"Sample keys: {sample}"
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
                "confidence": 0.0,
                "quality": "poor"
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
            "confidence": float(confidence),
            "quality": "good"
        }