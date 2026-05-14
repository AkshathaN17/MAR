import os
import random
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import models
from load_dataset import create_train_test_loaders


# ============================
# PATH SETUP
# ============================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_PATH = os.path.join(BASE_DIR, "dataset", "posture_balanced")
MODEL_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODEL_DIR, exist_ok=True)

# ============================
# CONFIG
# ============================
BATCH_SIZE = 32
EPOCHS = 25
LR = 3e-4
WEIGHT_DECAY = 1e-4
SEED = 42
ES_PATIENCE = 5
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# ============================
# MODEL
# ============================
def get_model(num_classes):
    model = models.resnet18(weights="IMAGENET1K_V1")

    # Freeze all layers first
    for param in model.parameters():
        param.requires_grad = False

    # Unfreeze the final block for light fine-tuning
    for param in model.layer4.parameters():
        param.requires_grad = True

    model.fc = nn.Linear(model.fc.in_features, num_classes)
    return model.to(DEVICE)


def set_seed(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def _compute_class_weights(class_map, dataset):
    counts = {idx: 0 for idx in class_map.values()}
    for _, label in dataset.samples:
        counts[label] += 1
    total = sum(counts.values())
    weights = [total / max(counts[i], 1) for i in range(len(counts))]
    return torch.tensor(weights, dtype=torch.float32, device=DEVICE)


# ============================
# TRAIN + TEST
# ============================
def train_and_test():
    set_seed(SEED)

    print("📂 Loading dataset...")
    train_loader, test_loader, class_map = create_train_test_loaders(
        DATASET_PATH,
        batch_size=BATCH_SIZE,
    )

    print("Class mapping:", class_map)

    model = get_model(num_classes=len(class_map))

    class_weights = _compute_class_weights(class_map, train_loader.dataset.dataset)
    criterion = nn.CrossEntropyLoss(weight=class_weights)

    trainable_params = [p for p in model.parameters() if p.requires_grad]
    optimizer = optim.AdamW(trainable_params, lr=LR, weight_decay=WEIGHT_DECAY)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="max", patience=2, factor=0.5
    )

    best_acc = 0.0
    epochs_no_improve = 0

    for epoch in range(EPOCHS):
        # ---------- TRAIN ----------
        model.train()
        train_loss = 0.0
        correct_train = 0
        total_train = 0

        for images, labels in train_loader:
            images, labels = images.to(DEVICE), labels.to(DEVICE)

            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            train_loss += loss.item()
            preds = outputs.argmax(dim=1)
            correct_train += (preds == labels).sum().item()
            total_train += labels.size(0)

        train_acc = correct_train / total_train

        # ---------- TEST ----------
        model.eval()
        correct_test = 0
        total_test = 0
        test_loss = 0.0

        with torch.no_grad():
            for images, labels in test_loader:
                images, labels = images.to(DEVICE), labels.to(DEVICE)
                outputs = model(images)
                loss = criterion(outputs, labels)
                test_loss += loss.item()
                preds = outputs.argmax(dim=1)
                correct_test += (preds == labels).sum().item()
                total_test += labels.size(0)

        test_acc = correct_test / total_test

        print(
            f"Epoch [{epoch+1}/{EPOCHS}] "
            f"Train Loss: {train_loss:.4f} | Train Acc: {train_acc:.4f} | "
            f"Val Loss: {test_loss:.4f} | Val Acc: {test_acc:.4f}"
        )

        scheduler.step(test_acc)

        if test_acc > best_acc:
            best_acc = test_acc
            epochs_no_improve = 0
            model_path = os.path.join(MODEL_DIR, "posture_cnn_balanced_v2.pt")
            torch.save(model.state_dict(), model_path)
            print(f"  ✅ Best model saved → {model_path}")
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= ES_PATIENCE:
                print(f"\n⏹ Early stopping at epoch {epoch+1}")
                break

    print(f"\n✅ Best Val Acc: {best_acc:.4f}")


# ============================
# RUN
# ============================
if __name__ == "__main__":
    train_and_test()
