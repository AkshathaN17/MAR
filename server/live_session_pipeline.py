"""
Live webcam pipeline matching client/run_client_pipeline.py for each sampled
frame: parallel infer → temporal smooth → cue→affect → fusion → persist window.

Frames arrive as JPEG (browser canvas); decoded with cv2.imdecode to BGR like
VideoCapture.read(). Session state (smoothers, fusion, packager) is keyed by
session_id on the server.
"""

from __future__ import annotations

import base64
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from client.fusion.cue_to_affect import CueToAffectMapper
from client.fusion.fusion_engine import FusionEngine
from client.packaging.data_packager import DataPackager
from client.temporal.temporal_smoothing import TemporalSmoother
from server.realtime_infer_api import get_inference_models
from server.persistence.storage import StorageService
from server.services.aggregation import AggregationService
from shared.schemas import SessionPayload, WindowPayload

logger = logging.getLogger(__name__)

router = APIRouter()

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONSTANTS_PATH = PROJECT_ROOT / "shared" / "pipeline_public_constants.json"
FUSION_CONFIG_PATH = PROJECT_ROOT / "client" / "fusion" / "fusion_config.json"

_storage = StorageService()
_aggregation = AggregationService(_storage)

SESSION_LOCK = threading.Lock()
SESSIONS: Dict[str, "LiveSessionState"] = {}


def _load_public_constants() -> Dict[str, Any]:
    with open(CONSTANTS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@dataclass
class LiveSessionState:
    student_id: str
    class_id: str
    session_id: str
    gaze_smoother: TemporalSmoother
    posture_smoother: TemporalSmoother
    cue_mapper: CueToAffectMapper
    fusion_engine: FusionEngine
    packager: DataPackager


def _get_or_create_session(student_id: str, class_id: str, session_id: str) -> LiveSessionState:
    with SESSION_LOCK:
        existing = SESSIONS.get(session_id)
        if existing:
            if existing.student_id != student_id or existing.class_id != class_id:
                raise HTTPException(
                    status_code=403,
                    detail="session_id is bound to a different student or class",
                )
            return existing

        const = _load_public_constants()
        win_size = int(const["temporal_smoothing_window_size"])
        conf_th = float(const.get("temporal_smoothing_confidence_threshold", 0.0))

        with open(FUSION_CONFIG_PATH, "r", encoding="utf-8") as f:
            fusion_cfg = json.load(f)

        state = LiveSessionState(
            student_id=student_id,
            class_id=class_id,
            session_id=session_id,
            gaze_smoother=TemporalSmoother(
                window_size=win_size, confidence_threshold=conf_th
            ),
            posture_smoother=TemporalSmoother(
                window_size=win_size, confidence_threshold=conf_th
            ),
            cue_mapper=CueToAffectMapper(fusion_cfg["cue_to_emotion"]),
            fusion_engine=FusionEngine(str(FUSION_CONFIG_PATH)),
            packager=DataPackager(
                student_id=student_id,
                class_id=class_id,
                session_id=session_id,
            ),
        )
        SESSIONS[session_id] = state
        logger.info(
            "Live session created: session_id=%s student=%s class=%s",
            session_id,
            student_id,
            class_id,
        )
        return state


class LiveFrameRequest(BaseModel):
    timestamp_sec: int = Field(..., ge=0)
    student_id: str
    class_id: str
    session_id: str
    jpeg_b64: str = Field(..., description="Raw base64 JPEG (no data: URL prefix)")


class LiveSessionEndRequest(BaseModel):
    session_id: str
    student_id: str
    class_id: str


def _decode_jpeg_bgr(jpeg_b64: str) -> np.ndarray:
    try:
        raw = base64.b64decode(jpeg_b64)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"invalid base64: {e}") from e
    buf = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=422, detail="could not decode JPEG to BGR")
    return frame


@router.post("/live-frame")
def live_frame(req: LiveFrameRequest) -> Dict[str, Any]:
    """
    One iteration of run_client_pipeline loop: infer (parallel), smooth, map,
    fuse, validate WindowPayload, persist like /ingest/window.
    """
    frame = _decode_jpeg_bgr(req.jpeg_b64)
    state = _get_or_create_session(req.student_id, req.class_id, req.session_id)

    gaze_model, posture_model = get_inference_models()
    ts = int(req.timestamp_sec)

    with ThreadPoolExecutor(max_workers=2) as ex:
        gaze_future = ex.submit(gaze_model.infer, frame, ts)
        posture_future = ex.submit(posture_model.infer, frame, ts)
        gaze_raw = gaze_future.result()
        posture_raw = posture_future.result()

    gaze_smoothed = state.gaze_smoother.update(gaze_raw)
    posture_smoothed = state.posture_smoother.update(posture_raw)

    gaze_affect = state.cue_mapper.map(gaze_smoothed)
    posture_affect = state.cue_mapper.map(posture_smoothed)

    fusion_output = state.fusion_engine.fuse(
        cues={"gaze": gaze_affect, "posture": posture_affect},
        timestamp_sec=ts,
    )

    state.packager.add_fusion_result(fusion_output)
    window_payload = state.packager.build_window_payload(fusion_output)

    validated = WindowPayload(**window_payload)
    _storage.save_window(validated.dict())

    summary = state.packager.build_summary_payload()
    dominant_emotion = summary.get("dominant_emotion") if summary else None
    emotion_distribution = summary.get("emotion_distribution") if summary else None

    logger.info(
        "Live frame window saved: student=%s session=%s t=%s emotion=%s",
        req.student_id,
        req.session_id,
        ts,
        fusion_output.get("final_emotion"),
    )

    return {
        "status": "success",
        "timestamp_sec": ts,
        "fusion": fusion_output,
        "dominant_emotion": dominant_emotion,
        "emotion_distribution": emotion_distribution,
        "total_windows": summary.get("total_windows") if summary else 0,
    }


@router.post("/live-session-end")
def live_session_end(req: LiveSessionEndRequest) -> Dict[str, Any]:
    """
    End a live session: same as pipeline end — SessionPayload + aggregation.
    Idempotent if session already removed.
    """
    with SESSION_LOCK:
        state = SESSIONS.pop(req.session_id, None)

    if state is None:
        return {"ok": True, "already_ended": True}

    if state.student_id != req.student_id or state.class_id != req.class_id:
        raise HTTPException(status_code=403, detail="session mismatch")

    n = len(state.packager.emotion_history)
    if n == 0:
        return {"ok": True, "windows": 0}

    final_payload = state.packager.build_final_payload()
    session_data = SessionPayload(**final_payload)
    _storage.save_session(session_data.dict())
    _aggregation.aggregate_student_session(
        student_id=session_data.student_id,
        session_id=session_data.session_id,
        class_id=session_data.class_id,
    )
    logger.info(
        "Live session ended: student=%s session=%s windows=%s",
        req.student_id,
        req.session_id,
        n,
    )
    return {
        "ok": True,
        "windows": n,
        "dominant_emotion": final_payload.get("dominant_emotion"),
        "session_id": req.session_id,
    }
