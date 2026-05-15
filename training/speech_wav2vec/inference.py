import sys
import torch
import torch.nn as nn
import librosa
import numpy as np
from transformers import Wav2Vec2Model

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

# ── Load weights ──────────────────────────────────────────────────────────────

model = Wav2Vec2Classifier(num_classes=5)
model.load_state_dict(torch.load("wav2vec2_emotion_best.pt", map_location=device))
model.to(device)
model.eval()

# ── Inference function ────────────────────────────────────────────────────────

def predict_emotion(audio_path: str) -> str:
    waveform, _ = librosa.load(audio_path, sr=TARGET_SR, mono=True)

    if len(waveform) < MAX_LENGTH:
        waveform = np.pad(waveform, (0, MAX_LENGTH - len(waveform)), mode='constant')
    else:
        waveform = waveform[:MAX_LENGTH]

    input_values = torch.tensor(waveform).unsqueeze(0).float().to(device)

    with torch.no_grad():
        logits = model(input_values)
        probs  = torch.softmax(logits, dim=1)[0]
        _, pred = torch.max(logits, 1)

    emotion = label_map[pred.item()]

    # Print confidence scores for all classes
    print("\nConfidence scores:")
    for idx, label in label_map.items():
        print(f"  {label:<12} {probs[idx].item():.2%}")

    return emotion

# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python inference.py <path_to_audio.wav>")
        sys.exit(1)

    audio_path = sys.argv[1]
    emotion    = predict_emotion(audio_path)
    print(f"\nPredicted emotion: {emotion}")