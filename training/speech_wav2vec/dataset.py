import os
import torch
import librosa
import numpy as np
from torch.utils.data import Dataset

emotion_map = {
    "01": "Neutral",
    "02": "Neutral",
    "03": "Interested",
    "04": "Bored",
    "05": "Frustrated",
    "06": "Confused",
    "07": "Frustrated",
    "08": "Interested"
}

label_map = {
    "Neutral": 0,
    "Interested": 1,
    "Bored": 2,
    "Frustrated": 3,
    "Confused": 4
}

# wav2vec2 expects 16kHz mono audio
TARGET_SR = 16000
# 4 seconds of audio at 16kHz
MAX_LENGTH = 64000


class AudioDataset(Dataset):
    def __init__(self, root_dir):
        self.files = []

        for actor in os.listdir(root_dir):
            actor_path = os.path.join(root_dir, actor)
            if not os.path.isdir(actor_path):
                continue

            for file in os.listdir(actor_path):
                if file.endswith(".wav"):
                    self.files.append(os.path.join(actor_path, file))

    def __len__(self):
        return len(self.files)

    def __getitem__(self, idx):
        path = self.files[idx]

        # Load as mono at 16kHz (wav2vec2 requirement)
        waveform, sr = librosa.load(path, sr=TARGET_SR, mono=True)

        # Pad or trim to fixed length
        if len(waveform) < MAX_LENGTH:
            pad_width = MAX_LENGTH - len(waveform)
            waveform = np.pad(waveform, (0, pad_width), mode='constant')
        else:
            waveform = waveform[:MAX_LENGTH]

        waveform = torch.tensor(waveform).float()  # (MAX_LENGTH,)

        # Label from filename
        file = os.path.basename(path)
        emotion_code = file.split("-")[2]
        emotion = emotion_map[emotion_code]
        label = label_map[emotion]

        return waveform, label