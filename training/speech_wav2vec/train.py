import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split
from transformers import Wav2Vec2Model

from dataset import AudioDataset

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

# ── Model ─────────────────────────────────────────────────────────────────────

class Wav2Vec2Classifier(nn.Module):
    def __init__(self, num_classes: int = 5, dropout: float = 0.25):
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

    def forward(self, input_values: torch.Tensor) -> torch.Tensor:
        outputs = self.wav2vec2(input_values=input_values)
        pooled  = outputs.last_hidden_state.mean(dim=1)
        return self.classifier(pooled)


# ── Data ──────────────────────────────────────────────────────────────────────

dataset = AudioDataset("../../dataset/RAVDESS")
print(f"Dataset size: {len(dataset)} files")

train_size = int(0.8 * len(dataset))
test_size  = len(dataset) - train_size
train_data, test_data = random_split(
    dataset, [train_size, test_size],
    generator=torch.Generator().manual_seed(42)
)

train_loader = DataLoader(train_data, batch_size=8, shuffle=True,  num_workers=0)
test_loader  = DataLoader(test_data,  batch_size=8, shuffle=False, num_workers=0)

# ── Training setup ────────────────────────────────────────────────────────────

model = Wav2Vec2Classifier(num_classes=5).to(device)

criterion = nn.CrossEntropyLoss()

optimizer = torch.optim.AdamW([
    {"params": model.wav2vec2.parameters(),   "lr": 1e-5},
    {"params": model.classifier.parameters(), "lr": 1e-4},
], weight_decay=0.01)

NUM_EPOCHS = 10

def lr_lambda(epoch):
    warmup = 2
    if epoch < warmup:
        return epoch / warmup
    return 0.5 * (1 + torch.cos(torch.tensor((epoch - warmup) / (NUM_EPOCHS - warmup) * 3.14159)).item())

scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)

# ── Helper: evaluate on any loader ───────────────────────────────────────────

def evaluate(loader):
    model.eval()
    correct, total, total_loss = 0, 0, 0.0
    with torch.no_grad():
        for waveforms, labels in loader:
            waveforms = waveforms.to(device)
            labels    = labels.to(device)
            logits    = model(waveforms)
            loss      = criterion(logits, labels)
            total_loss += loss.item()
            _, predicted = torch.max(logits, 1)
            total   += labels.size(0)
            correct += (predicted == labels).sum().item()
    return correct / total, total_loss / len(loader)

# ── Training loop ─────────────────────────────────────────────────────────────

best_test_acc  = 0.0
best_epoch     = 0

print(f"\n{'Epoch':<8} {'Train Loss':<12} {'Train Acc':<12} {'Test Loss':<12} {'Test Acc':<10}")
print("-" * 56)

for epoch in range(NUM_EPOCHS):
    model.train()
    total_loss   = 0
    train_correct = 0
    train_total   = 0

    for waveforms, labels in train_loader:
        waveforms = waveforms.to(device)
        labels    = labels.to(device)

        optimizer.zero_grad()
        logits = model(waveforms)
        loss   = criterion(logits, labels)
        loss.backward()

        nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()

        total_loss    += loss.item()
        _, predicted   = torch.max(logits, 1)
        train_total   += labels.size(0)
        train_correct += (predicted == labels).sum().item()

    scheduler.step()

    train_acc  = train_correct / train_total
    train_loss = total_loss / len(train_loader)

    test_acc, test_loss = evaluate(test_loader)

    print(f"{epoch+1:<8} {train_loss:<12.4f} {train_acc:<12.4f} {test_loss:<12.4f} {test_acc:<10.4f}", end="")

    if test_acc > best_test_acc:
        best_test_acc = test_acc
        best_epoch    = epoch + 1
        torch.save(model.state_dict(), "speech_wav2vec.pt")
        print(" ✓ best", end="")

    print()

# ── Summary ───────────────────────────────────────────────────────────────────

print("-" * 56)
print(f"\nBest Test Accuracy : {best_test_acc:.4f}  (epoch {best_epoch})")
print(f"Model saved        : speech_wav2vec.pt")