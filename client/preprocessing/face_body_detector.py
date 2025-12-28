import cv2
import mediapipe as mp
from typing import Dict, Optional


class FaceBodyDetector:
    """
    Detects face and upper-body regions from a video frame.
    Outputs bounding boxes and landmarks for downstream inference.
    """

    def __init__(
        self,
        min_face_confidence: float = 0.5,
        min_pose_confidence: float = 0.5
    ):
        # MediaPipe initializations
        self.mp_face = mp.solutions.face_detection
        self.mp_pose = mp.solutions.pose

        self.face_detector = self.mp_face.FaceDetection(
            model_selection=0,
            min_detection_confidence=min_face_confidence
        )

        self.pose_detector = self.mp_pose.Pose(
            static_image_mode=False,
            min_detection_confidence=min_pose_confidence,
            min_tracking_confidence=min_pose_confidence
        )

    # --------------------------------------------------
    # Main API
    # --------------------------------------------------
    def detect(self, frame) -> Dict:
        """
        Detect face and body from a single frame.

        Args:
            frame (np.ndarray): BGR image

        Returns:
            Dict with face and body detections
        """
        h, w, _ = frame.shape
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        face_data = self._detect_face(rgb_frame, w, h)
        body_data = self._detect_body(rgb_frame, w, h)

        return {
            "face": face_data,
            "body": body_data
        }

    # --------------------------------------------------
    # Face detection
    # --------------------------------------------------
    def _detect_face(self, rgb_frame, w, h) -> Optional[Dict]:
        results = self.face_detector.process(rgb_frame)

        if not results.detections:
            return None

        detection = results.detections[0]
        bbox = detection.location_data.relative_bounding_box

        x1 = int(bbox.xmin * w)
        y1 = int(bbox.ymin * h)
        x2 = int((bbox.xmin + bbox.width) * w)
        y2 = int((bbox.ymin + bbox.height) * h)

        return {
            "bbox": [x1, y1, x2, y2],
            "confidence": round(detection.score[0], 3)
        }

    # --------------------------------------------------
    # Body / posture detection
    # --------------------------------------------------
    def _detect_body(self, rgb_frame, w, h) -> Optional[Dict]:
        results = self.pose_detector.process(rgb_frame)

        if not results.pose_landmarks:
            return None

        landmarks = []
        for lm in results.pose_landmarks.landmark:
            landmarks.append({
                "x": round(lm.x, 4),
                "y": round(lm.y, 4),
                "z": round(lm.z, 4),
                "visibility": round(lm.visibility, 3)
            })

        return {
            "landmarks": landmarks
        }
