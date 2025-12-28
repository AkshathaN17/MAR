import cv2
import os
import json
from pathlib import Path
from typing import List, Dict


class FrameExtractor:
    """
    Extracts frames from a video at fixed time intervals.
    """

    def __init__(
        self,
        output_root: str,
        interval_sec: int = 10,
        image_format: str = "jpg"
    ):
        """
        Args:
            output_root (str): Root directory to store extracted frames
            interval_sec (int): Time interval between frames (seconds)
            image_format (str): Image format (jpg / png)
        """
        self.output_root = Path(output_root)
        self.interval_sec = interval_sec
        self.image_format = image_format

        self.output_root.mkdir(parents=True, exist_ok=True)

    def extract(self, video_path: str, video_id: str) -> List[Dict]:
        """
        Extract frames from a video.

        Args:
            video_path (str): Path to input video
            video_id (str): Unique ID for the video (student/session)

        Returns:
            List[Dict]: Metadata for extracted frames
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_sec = int(total_frames / fps)

        frame_interval = int(fps * self.interval_sec)

        video_frame_dir = self.output_root / video_id
        video_frame_dir.mkdir(parents=True, exist_ok=True)

        metadata = []
        frame_idx = 0
        saved_count = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_interval == 0:
                timestamp_sec = int(frame_idx / fps)
                frame_name = f"frame_{timestamp_sec:06d}.{self.image_format}"
                frame_path = video_frame_dir / frame_name

                cv2.imwrite(str(frame_path), frame)

                metadata.append({
                    "video_id": video_id,
                    "frame_index": frame_idx,
                    "timestamp_sec": timestamp_sec,
                    "frame_path": str(frame_path)
                })

                saved_count += 1

            frame_idx += 1

        cap.release()

        # Save metadata JSON
        metadata_path = video_frame_dir / "frames_metadata.json"
        with open(metadata_path, "w") as f:
            json.dump({
                "video_id": video_id,
                "video_path": video_path,
                "fps": fps,
                "duration_sec": duration_sec,
                "interval_sec": self.interval_sec,
                "total_frames_extracted": saved_count,
                "frames": metadata
            }, f, indent=4)

        return metadata
