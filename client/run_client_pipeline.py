import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, Any, Optional

from client.preprocessing.frame_sampler import FrameSampler
from client.inference.gaze_inference import GazeInference
from client.inference.posture_inference import PostureInference
from client.temporal.temporal_smoothing import TemporalSmoother
from client.fusion.cue_to_affect import CueToAffectMapper
from client.fusion.fusion_engine import FusionEngine
from client.packaging.data_packager import DataPackager
from client.network.http_client import AffectAnalysisClient


# --------------------------------------------------
# Config
# --------------------------------------------------
VIDEO_PATH = "data/sample_video.mp4"
FUSION_CONFIG_PATH = "client/fusion/fusion_config.json"

# Frame sampling every 20 seconds as required
FRAME_INTERVAL_SEC = 20
OUTPUT_DIR = "outputs/client_jsons"

STUDENT_ID = "student_001"
CLASS_ID = "CS101"
SESSION_ID = "session_2025_01_01"

# Server configuration
SERVER_URL = os.getenv("AFFECT_SERVER_URL", "http://localhost:8000")
ENABLE_NETWORK = os.getenv("ENABLE_NETWORK", "true").lower() == "true"


def _init_models() -> Dict[str, Any]:
    """
    Initialize gaze and posture models.
    Model paths assume the default layout in the repository.
    """
    gaze_model = GazeInference(
        cnn_model_path="models/gaze_cnn.pt",
        svm_model_path="models/gaze_svm.joblib",
        device="cpu",
    )

    posture_model = PostureInference(
        model_path="models/posture_cnn.pt",
        class_map_path="models/posture_class_map.json",
        device="cpu",
    )

    return {
        "gaze": gaze_model,
        "posture": posture_model,
    }


# --------------------------------------------------
# Pipeline Runner
# --------------------------------------------------
def run_pipeline(
    video_path: str = VIDEO_PATH,
    server_url: Optional[str] = None,
    enable_network: bool = ENABLE_NETWORK,
) -> None:
    """
    End-to-end client-side pipeline:
    - Samples frames from video input
    - Runs gaze & posture inference in parallel
    - Applies temporal smoothing
    - Performs decision-level fusion
    - Writes JSON outputs (per-window + session summary)
    - Optionally sends data to server via HTTP

    Args:
        video_path (str): Path to input video
        server_url (Optional[str]): Server URL (defaults to SERVER_URL env var or config)
        enable_network (bool): Whether to send data to server
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # -------- Init components --------
    frame_sampler = FrameSampler(video_path, interval_sec=FRAME_INTERVAL_SEC)

    models = _init_models()
    gaze_model: GazeInference = models["gaze"]
    posture_model: PostureInference = models["posture"]

    gaze_smoother = TemporalSmoother(window_size=3)
    posture_smoother = TemporalSmoother(window_size=3)

    with open(FUSION_CONFIG_PATH, "r") as f:
        fusion_cfg = json.load(f)

    cue_mapper = CueToAffectMapper(fusion_cfg["cue_to_emotion"])
    fusion_engine = FusionEngine(FUSION_CONFIG_PATH)

    packager = DataPackager(
        student_id=STUDENT_ID,
        class_id=CLASS_ID,
        session_id=SESSION_ID,
    )

    # Initialize HTTP client if network is enabled
    http_client: Optional[AffectAnalysisClient] = None
    if enable_network:
        server_url = server_url or SERVER_URL
        http_client = AffectAnalysisClient(base_url=server_url)
        
        # Check server health
        if not http_client.health_check():
            print(f"Warning: Server at {server_url} is not reachable. Continuing without network...")
            http_client = None
        else:
            print(f"Connected to server: {server_url}")

    executor = ThreadPoolExecutor(max_workers=2)

    # -------- Process frames --------
    for frame, timestamp_sec in frame_sampler:
        # ---------------- Inference (parallel) ----------------
        gaze_future = executor.submit(gaze_model.infer, frame, timestamp_sec)
        posture_future = executor.submit(
            posture_model.infer, frame, timestamp_sec
        )

        gaze_raw = gaze_future.result()
        posture_raw = posture_future.result()

        # ---------------- Temporal smoothing ----------------
        gaze_smoothed = gaze_smoother.update(gaze_raw)
        posture_smoothed = posture_smoother.update(posture_raw)

        # ---------------- Cue → affect mapping ----------------
        gaze_affect = cue_mapper.map(gaze_smoothed)
        posture_affect = cue_mapper.map(posture_smoothed)

        # ---------------- Fusion ----------------
        fusion_output = fusion_engine.fuse(
            cues={
                "gaze": gaze_affect,
                "posture": posture_affect,
            },
            timestamp_sec=timestamp_sec,
        )

        # ---------------- Packaging ----------------
        packager.add_fusion_result(fusion_output)
        window_payload = packager.build_window_payload(fusion_output)

        # Save rich intermediate JSON (cue-level + fusion-level)
        window_record = {
            "timestamp_sec": timestamp_sec,
            "cues": {
                "gaze": gaze_affect,
                "posture": posture_affect,
            },
            "fusion": fusion_output,
            "streaming_payload": window_payload,
        }

        out_path = Path(OUTPUT_DIR) / f"window_{timestamp_sec}.json"
        with open(out_path, "w") as f_out:
            json.dump(window_record, f_out, indent=2)

        # ---------------- Send to server (if enabled) ----------------
        if http_client:
            http_client.send_window(window_payload, validate=True)

        print(
            f"[{timestamp_sec:>4}s] "
            f"Emotion={fusion_output['final_emotion']} "
            f"Conf={fusion_output['confidence']}"
        )

    # -------- Final summary --------
    final_payload = packager.build_final_payload()
    final_path = Path(OUTPUT_DIR) / "session_final.json"
    with open(final_path, "w") as f_final:
        json.dump(final_payload, f_final, indent=2)

    # ---------------- Send session summary to server (if enabled) ----------------
    if http_client:
        http_client.send_session(final_payload, validate=True)

    print("\nSession complete.")
    print("Final dominant emotion:", final_payload.get("dominant_emotion"))


# --------------------------------------------------
# Entry point
# --------------------------------------------------
if __name__ == "__main__":
    run_pipeline(VIDEO_PATH)