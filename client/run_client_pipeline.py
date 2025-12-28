import cv2
import json
import os
from pathlib import Path

from client.preprocessing.frame_sampler import FrameSampler
from client.preprocessing.face_body_detector import FaceBodyDetector

from client.inference.gaze_inference import GazeInference
from client.inference.posture_inference import PostureInference

from client.temporal.temporal_smoothing import TemporalSmoother
from client.fusion.cue_to_affect import CueToAffectMapper
from client.fusion.fusion_engine import FusionEngine
from client.packaging.data_packager import DataPackager


# --------------------------------------------------
# Config
# --------------------------------------------------
VIDEO_PATH = "data/sample_video.mp4"
FUSION_CONFIG_PATH = "client/fusion/fusion_config.json"

FRAME_INTERVAL_SEC = 10
OUTPUT_DIR = "outputs/client_jsons"

STUDENT_ID = "student_001"
CLASS_ID = "CS101"
SESSION_ID = "session_2025_01_01"


# --------------------------------------------------
# Pipeline Runner
# --------------------------------------------------
def run_pipeline(video_path: str):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # -------- Init components --------
    frame_sampler = FrameSampler(video_path, interval_sec=FRAME_INTERVAL_SEC)
    detector = FaceBodyDetector()

    gaze_model = GazeInference()
    posture_model = PostureInference()

    gaze_smoother = TemporalSmoother(window_size=3)
    posture_smoother = TemporalSmoother(window_size=3)

    with open(FUSION_CONFIG_PATH, "r") as f:
        fusion_cfg = json.load(f)

    cue_mapper = CueToAffectMapper(fusion_cfg["cue_to_emotion"])
    fusion_engine = FusionEngine(FUSION_CONFIG_PATH)

    packager = DataPackager(
        student_id=STUDENT_ID,
        class_id=CLASS_ID,
        session_id=SESSION_ID
    )

    # -------- Process frames --------
    for frame, timestamp_sec in frame_sampler:
        detections = detector.detect(frame)

        # ---------------- Gaze ----------------
        gaze_raw = gaze_model.predict(
            frame,
            detections.get("face")
        )
        gaze_smoothed = gaze_smoother.update(gaze_raw)
        gaze_affect = cue_mapper.map(gaze_smoothed)

        # ---------------- Posture ----------------
        posture_raw = posture_model.predict(
            frame,
            detections.get("body")
        )
        posture_smoothed = posture_smoother.update(posture_raw)
        posture_affect = cue_mapper.map(posture_smoothed)

        # ---------------- Fusion ----------------
        fusion_output = fusion_engine.fuse(
            cues={
                "gaze": gaze_affect,
                "posture": posture_affect
            },
            timestamp_sec=timestamp_sec
        )

        # ---------------- Packaging ----------------
        packager.add_fusion_result(fusion_output)

        window_payload = packager.build_window_payload(fusion_output)

        # Save intermediate JSON (debug / research)
        out_path = Path(OUTPUT_DIR) / f"window_{timestamp_sec}.json"
        with open(out_path, "w") as f:
            json.dump(window_payload, f, indent=2)

        print(
            f"[{timestamp_sec:>4}s] "
            f"Emotion={fusion_output['final_emotion']} "
            f"Conf={fusion_output['confidence']}"
        )

    # -------- Final summary --------
    final_payload = packager.build_final_payload()
    final_path = Path(OUTPUT_DIR) / "session_final.json"
    with open(final_path, "w") as f:
        json.dump(final_payload, f, indent=2)

    print("\nSession complete.")
    print("Final dominant emotion:", final_payload["dominant_emotion"])


# --------------------------------------------------
# Entry point
# --------------------------------------------------
if __name__ == "__main__":
    run_pipeline(VIDEO_PATH)