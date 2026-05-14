import sys
import torch
import torch.nn as nn
import librosa
import numpy as np
from transformers import Wav2Vec2Model
from typing import Dict
import tempfile
import subprocess

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

label_map = {
    0: "Neutral",
    1: "Interested",
    2: "Bored",
    3: "Frustrated",
    4: "Confused"
}

TARGET_SR  = 16000
MAX_LENGTH = 64000  # must match dataset.py

# ── Model (must match train.py exactly) ──────────────────────────────────────

class Wav2Vec2Classifier(nn.Module):
    def __init__(self, num_classes=5, dropout=0.25):
        super().__init__()
        self.wav2vec2 = Wav2Vec2Model.from_pretrained("facebook/wav2vec2-base")
        for param in self.wav2vec2.feature_extractor.parameters():
            param.requires_grad = False
        hidden_size = self.wav2vec2.config.hidden_size
        self.classifier = nn.Sequential(
            nn.Linear(hidden_size, 256),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(256, num_classes)
        )

    def forward(self, input_values):
        outputs = self.wav2vec2(input_values=input_values)
        pooled  = outputs.last_hidden_state.mean(dim=1)
        return self.classifier(pooled)

class SpeechInference:
    """
    Performs speech emotion inference using Wav2Vec2.
    """

    def __init__(self, model_path: str, device: str = "cpu"):
        self.device = device
        self.model = Wav2Vec2Classifier(num_classes=5)
        self.model.load_state_dict(torch.load(model_path, map_location=device))
        self.model.to(device)
        self.model.eval()

    def _extract_audio_segment(self, video_path: str, start_time: float, duration: float) -> np.ndarray:
        """
        Extract audio segment from video using ffmpeg.
        """
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_path = temp_file.name

        # Use ffmpeg to extract audio segment
        cmd = [
            'ffmpeg', '-i', video_path, '-ss', str(start_time), '-t', str(duration),
            '-vn', '-acodec', 'pcm_s16le', '-ar', str(TARGET_SR), '-ac', '1', temp_path, '-y'
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        # Load the extracted audio
        waveform, _ = librosa.load(temp_path, sr=TARGET_SR, mono=True)

        # Clean up
        import os
        os.unlink(temp_path)

        return waveform

    def infer(self, frame: np.ndarray, timestamp_sec: int, video_path: str = None) -> Dict:
        """
        Run speech inference. For speech, we need the video path to extract audio.
        Since speech is continuous, we'll extract a segment around the timestamp.
        """
        if video_path is None:
            return {
                "cue": "speech",
                "timestamp_sec": timestamp_sec,
                "prediction": "unknown",
                "probabilities": {label: 0.0 for label in label_map.values()},
                "confidence": 0.0
            }

        # Extract 5-second audio segment centered on timestamp
        start_time = max(0, timestamp_sec - 2.5)
        duration = 5.0

        try:
            waveform = self._extract_audio_segment(video_path, start_time, duration)

            if len(waveform) < MAX_LENGTH:
                waveform = np.pad(waveform, (0, MAX_LENGTH - len(waveform)), mode='constant')
            else:
                waveform = waveform[:MAX_LENGTH]

            input_values = torch.tensor(waveform).unsqueeze(0).float().to(self.device)

            with torch.no_grad():
                logits = self.model(input_values)
                probs  = torch.softmax(logits, dim=1)[0]
                _, pred = torch.max(logits, 1)

            emotion = label_map[pred.item()]
            confidence = probs[pred.item()].item()

            return {
                "cue": "speech",
                "timestamp_sec": timestamp_sec,
                "prediction": emotion.lower(),
                "probabilities": {label.lower(): float(probs[idx]) for idx, label in label_map.items()},
                "confidence": confidence
            }
        except Exception as e:
            print(f"Speech inference failed: {e}")
            return {
                "cue": "speech",
                "timestamp_sec": timestamp_sec,
                "prediction": "unknown",
                "probabilities": {label.lower(): 0.0 for label in label_map.values()},
                "confidence": 0.0
            }