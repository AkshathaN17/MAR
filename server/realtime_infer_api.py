"""
Realtime inference API: accepts browser-preprocessed crops and runs the
existing torch/SVM paths from client.inference without modifying those modules.
"""

from __future__ import annotations

import base64
import json
import logging
from pathlib import Path
from typing import Any, Dict

import numpy as np
import torch
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()

_gaze_model = None
_posture_model = None
_facial_model = None
_speech_model = None

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONSTANTS_PATH = PROJECT_ROOT / "shared" / "pipeline_public_constants.json"


def _load_public_constants() -> Dict[str, Any]:
    with open(CONSTANTS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _get_models():
    global _gaze_model, _posture_model
    if _gaze_model is not None and _posture_model is not None:
        return _gaze_model, _posture_model

    try:
        from client.inference.gaze_inference import GazeInference
        from client.inference.posture_inference import PostureInference
    except Exception as e:
        logger.exception("Failed to import gaze/posture inference modules")
        raise RuntimeError(
            "Could not import gaze/posture models. This is often a broken torch/torchvision "
            f"install (e.g. 'operator torchvision::nms does not exist'). Original error: {e!s}"
        ) from e

    try:
        gaze = GazeInference(
            cnn_model_path=str(PROJECT_ROOT / "models" / "gaze_cnn.pt"),
            svm_model_path=str(PROJECT_ROOT / "models" / "gaze_svm.joblib"),
            device="cpu",
        )
        posture = PostureInference(
            model_path=str(PROJECT_ROOT / "models" / "posture_cnn.pt"),
            class_map_path=str(PROJECT_ROOT / "models" / "posture_class_map.json"),
            device="cpu",
        )
    except Exception as e:
        logger.exception("Failed to construct gaze/posture models")
        raise RuntimeError(f"Gaze/posture model load failed: {e!s}") from e
    _gaze_model = gaze
    _posture_model = posture
    logger.info("Realtime inference models loaded")
    return _gaze_model, _posture_model


class _FacialLiveStub:
    """Used when facial weights are missing or FacialInference fails to import/load."""

    def infer(self, frame, timestamp_sec: int) -> Dict[str, Any]:
        return {
            "cue": "facial",
            "timestamp_sec": timestamp_sec,
            "prediction": "unknown",
            "probabilities": {},
            "confidence": 0.0,
        }


class _SpeechLiveStub:
    """Same output as SpeechInference.infer(..., video_path=None) when speech cannot load."""

    def infer(self, frame, timestamp_sec: int, video_path=None) -> Dict[str, Any]:
        return {
            "cue": "speech",
            "timestamp_sec": timestamp_sec,
            "prediction": "unknown",
            "probabilities": {
                "Neutral": 0.0,
                "Interested": 0.0,
                "Bored": 0.0,
                "Frustrated": 0.0,
                "Confused": 0.0,
            },
            "confidence": 0.0,
        }


def get_full_pipeline_models():
    """
    Same four models as client/run_client_pipeline._init_models (gaze, posture,
    facial, speech). Used by live JPEG pipeline; gaze/posture reuse /infer/* singletons.

    Facial or speech may fall back to stubs if weights/HF/transformers fail so live-frame
    still returns JSON instead of a generic 500.
    """
    global _facial_model, _speech_model
    gaze, posture = _get_models()
    if _facial_model is None:
        try:
            from client.inference.facial_inference import FacialInference

            _facial_model = FacialInference(
                model_path=str(PROJECT_ROOT / "models" / "best_facial_model.pth"),
                class_map_path=str(PROJECT_ROOT / "models" / "facial_class_map.json"),
                device="cpu",
            )
            logger.info("Facial model loaded for full pipeline")
        except Exception as e:
            logger.warning("Facial model unavailable; using stub for live pipeline: %s", e)
            _facial_model = _FacialLiveStub()
    if _speech_model is None:
        try:
            from client.inference.speech_inference import SpeechInference

            _speech_model = SpeechInference(
                model_path=str(PROJECT_ROOT / "models" / "speech_wav2vec" / "speech_wav2vec.pt"),
                device="cpu",
            )
            logger.info("Speech model loaded for full pipeline")
        except Exception as e:
            logger.warning("Speech model unavailable; using stub for live pipeline: %s", e)
            _speech_model = _SpeechLiveStub()
    return gaze, posture, _facial_model, _speech_model


def get_inference_models():
    """Shared gaze/posture singletons (used by live webcam parity pipeline)."""
    return _get_models()


class GazeInferRequest(BaseModel):
    timestamp_sec: int = Field(..., ge=0)
    eye_gray_u8_b64: str = Field(..., description="Base64 of 224*224 uint8 grayscale row-major")


class PostureInferRequest(BaseModel):
    timestamp_sec: int = Field(..., ge=0)
    person_bgr_u8_b64: str = Field(..., description="Base64 of H*W*3 uint8 BGR row-major")
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)


def _decode_u8_b64(b64: str) -> np.ndarray:
    raw = base64.b64decode(b64)
    return np.frombuffer(raw, dtype=np.uint8)


@router.post("/infer/gaze")
async def infer_gaze(req: GazeInferRequest) -> Dict[str, Any]:
    const = _load_public_constants()
    expected = int(const["gaze_eye_resize"]) * int(const["gaze_eye_resize"])
    gaze_model, _ = _get_models()
    arr = _decode_u8_b64(req.eye_gray_u8_b64)
    if arr.size != expected:
        raise HTTPException(
            status_code=422,
            detail=f"eye_gray must decode to {expected} bytes, got {arr.size}",
        )
    eye = arr.reshape(int(const["gaze_eye_resize"]), int(const["gaze_eye_resize"]))

    input_tensor = gaze_model._preprocess_eye(eye)

    with torch.no_grad():
        features = gaze_model.cnn(input_tensor)
        features = features.cpu().numpy().reshape(1, -1)

    probs = gaze_model.svm.predict_proba(features)[0]
    pred_idx = int(np.argmax(probs))
    label_map = {0: "looking_away", 1: "looking_at_screen"}

    return {
        "cue": "gaze",
        "timestamp_sec": req.timestamp_sec,
        "prediction": label_map[pred_idx],
        "confidence": float(probs[pred_idx]),
        "quality": "good",
    }


@router.post("/infer/posture")
async def infer_posture(req: PostureInferRequest) -> Dict[str, Any]:
    const = _load_public_constants()
    _, posture_model = _get_models()
    arr = _decode_u8_b64(req.person_bgr_u8_b64)
    expected = req.width * req.height * 3
    if arr.size != expected:
        raise HTTPException(
            status_code=422,
            detail=f"person_bgr must decode to {expected} bytes, got {arr.size}",
        )
    person = arr.reshape(req.height, req.width, 3)

    input_tensor = posture_model._preprocess(person)

    with torch.no_grad():
        logits = posture_model.model(input_tensor)
        probs = torch.softmax(logits, dim=1)[0].cpu().numpy()

    pred_idx = int(np.argmax(probs))
    pred_label = posture_model.class_map[str(pred_idx)]
    confidence = float(probs[pred_idx])
    prob_dict = {
        posture_model.class_map[str(i)]: float(probs[i]) for i in range(len(probs))
    }

    return {
        "cue": "posture",
        "timestamp_sec": req.timestamp_sec,
        "prediction": pred_label,
        "confidence": confidence,
        "probabilities": prob_dict,
        "quality": "good",
    }
