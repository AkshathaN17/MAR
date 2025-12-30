import cv2
from typing import Iterator, Tuple


class FrameSampler:
    """
    Lightweight frame sampler that reads a video stream and yields
    frames at fixed time intervals **without** saving them to disk.

    This is used client-side for real-time style processing.
    """

    def __init__(self, video_path: str, interval_sec: int = 20) -> None:
        """
        Args:
            video_path (str): Path to the input video file.
            interval_sec (int): Time interval between sampled frames (seconds).
        """
        self.video_path = video_path
        self.interval_sec = interval_sec

    def __iter__(self) -> Iterator[Tuple["cv2.Mat", int]]:
        """
        Iterate over the video and yield (frame, timestamp_sec) tuples.
        """
        cap = cv2.VideoCapture(self.video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video: {self.video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            # Fallback: assume 25 FPS if metadata is missing
            fps = 25.0

        frame_interval = int(fps * self.interval_sec)
        frame_idx = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % frame_interval == 0:
                    timestamp_sec = int(frame_idx / fps)
                    yield frame, timestamp_sec

                frame_idx += 1
        finally:
            cap.release()


