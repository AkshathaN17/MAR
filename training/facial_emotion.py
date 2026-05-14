"""
==========================================================================
Facial Emotion Recognition -- Training Script
==========================================================================
Trains an EfficientNetB0 (ImageNet-pretrained, fine-tuned last 3 blocks
+ head) classifier to map FER2013 images (7 emotions) -> 5 classroom
emotions:
    happy, surprise  -> Interested
    sad              -> Bored
    angry, disgust   -> Frustrated
    fear             -> Confused
    neutral          -> Neutral

Run:  python facial_emotion.py
==========================================================================
"""

import os
import shutil
import json
import numpy as np
import matplotlib
matplotlib.use("Agg")  # non-interactive backend for saving plots
import matplotlib.pyplot as plt
import seaborn as sns

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torch.amp import GradScaler, autocast
from torchvision import models, transforms, datasets

from sklearn.metrics import (
    confusion_matrix,
    classification_report,
)


# ============================================================
# 1. PATH & CONFIG
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACE_DATASET_DIR = os.path.join(BASE_DIR, "dataset", "face")
OUTPUT_DIR = os.path.join(BASE_DIR, "training", "facial_outputs")
MODEL_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)

# FER2013 -> 5 classroom-emotion remapping
REMAP = {
    "happy":    "interested",
    "surprise": "interested",
    "sad":      "bored",
    "angry":    "frustrated",
    "disgust":  "frustrated",
    "fear":     "confused",
    "neutral":  "neutral",
}

# The 5 target class names (alphabetical order for consistency)
CLASS_NAMES = sorted(set(REMAP.values()))  # ['bored','confused','frustrated','interested','neutral']

# Training hyper-parameters
BATCH_SIZE = 128
EPOCHS     = 25
LR         = 1e-4
IMG_SIZE   = 224
DEVICE     = "cuda" if torch.cuda.is_available() else "cpu"

# Early-stopping
ES_PATIENCE = 7


# ============================================================
# 2. DATASET PREPARATION -- remap folder structure
# ============================================================

def remap_dataset(src_root: str, dst_root: str) -> str:
    """
    Copy images from the 7-class FER2013 folder structure into
    a new 5-class folder structure using the REMAP dictionary.

    Args:
        src_root: path to original face/{train|test} directory
        dst_root: path where the remapped folders will be created

    Returns:
        dst_root path
    """
    if os.path.exists(dst_root):
        print(f"  Remapped directory already exists: {dst_root}")
        return dst_root

    print(f"  Remapping {src_root} -> {dst_root} ...")

    for original_class, mapped_class in REMAP.items():
        src_dir = os.path.join(src_root, original_class)
        dst_dir = os.path.join(dst_root, mapped_class)
        os.makedirs(dst_dir, exist_ok=True)

        if not os.path.isdir(src_dir):
            print(f"    WARNING: Source folder not found, skipping: {src_dir}")
            continue

        for fname in os.listdir(src_dir):
            src_file = os.path.join(src_dir, fname)
            if not os.path.isfile(src_file):
                continue
            # Prefix with original class to avoid filename collisions
            # (e.g. happy/001.png and surprise/001.png both -> interested/)
            dst_file = os.path.join(dst_dir, f"{original_class}_{fname}")
            shutil.copy2(src_file, dst_file)

    return dst_root


def prepare_datasets():
    """
    Prepare remapped train and test directories.

    Returns:
        (remapped_train_dir, remapped_test_dir)
    """
    print("Preparing remapped dataset (7 -> 5 classes) ...")

    train_src = os.path.join(FACE_DATASET_DIR, "train")
    test_src  = os.path.join(FACE_DATASET_DIR, "test")

    remapped_base = os.path.join(BASE_DIR, "dataset", "face_remapped")
    train_dst = os.path.join(remapped_base, "train")
    test_dst  = os.path.join(remapped_base, "test")

    remap_dataset(train_src, train_dst)
    remap_dataset(test_src,  test_dst)

    return train_dst, test_dst


# ============================================================
# 3. DATA LOADERS with augmentation
# ============================================================

def build_dataloaders(train_dir: str, test_dir: str):
    """
    Build PyTorch DataLoaders.

    Training set:
        - Grayscale -> 3-channel conversion
        - Resize to 224
        - Random horizontal flip
        - Random rotation (+/-15 degrees)
        - Random affine (translate +/-10%)
        - ColorJitter (brightness=0.2, contrast=0.2)
        - Normalise to ImageNet stats

    Test set:
        - Grayscale -> 3-channel conversion
        - Resize to 256
        - Center crop to 224
        - Normalise to ImageNet stats
    """

    train_transform = transforms.Compose([
        transforms.Grayscale(num_output_channels=3),
        transforms.Resize(IMG_SIZE),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(degrees=15),
        transforms.RandomAffine(
            degrees=0,
            translate=(0.1, 0.1),
        ),
        transforms.ColorJitter(brightness=0.2, contrast=0.2),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ])

    test_transform = transforms.Compose([
        transforms.Grayscale(num_output_channels=3),
        transforms.Resize(256),
        transforms.CenterCrop(IMG_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ])

    train_dataset = datasets.ImageFolder(train_dir, transform=train_transform)
    test_dataset  = datasets.ImageFolder(test_dir,  transform=test_transform)

    # Verify class-to-index mapping matches our expected CLASS_NAMES
    print(f"  Train classes -> idx: {train_dataset.class_to_idx}")
    print(f"  Test  classes -> idx: {test_dataset.class_to_idx}")
    print(f"  Train samples: {len(train_dataset)}  |  Test samples: {len(test_dataset)}")

    train_loader = DataLoader(
        train_dataset, batch_size=BATCH_SIZE, shuffle=True,
        num_workers=4, pin_memory=True, persistent_workers=True,
    )
    test_loader = DataLoader(
        test_dataset, batch_size=BATCH_SIZE, shuffle=False,
        num_workers=4, pin_memory=True, persistent_workers=True,
    )

    return train_loader, test_loader, train_dataset


# ============================================================
# 4. MODEL -- EfficientNetB0, last 3 blocks + head unfrozen
# ============================================================

def build_model(num_classes: int = 5) -> nn.Module:
    """
    EfficientNetB0 with frozen backbone except the last 3 feature blocks.
    Head:  Dropout(0.4) -> Linear(1280, 256) -> ReLU -> Dropout(0.3) -> Linear(256, 5)

    The last 3 feature blocks and the entire classifier are trainable
    for facial feature adaptation.
    """
    model = models.efficientnet_b0(weights="IMAGENET1K_V1")

    # Freeze ALL layers first
    for param in model.parameters():
        param.requires_grad = False

    # Unfreeze the last 3 feature blocks
    for param in model.features[-3:].parameters():
        param.requires_grad = True

    # Replace the classifier head (unfrozen by default since it's new)
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.4),
        nn.Linear(1280, 256),
        nn.ReLU(),
        nn.Dropout(p=0.3),
        nn.Linear(256, num_classes),
    )

    return model.to(DEVICE)


# ============================================================
# 5. CLASS WEIGHTS for imbalanced FER2013
# ============================================================

def compute_class_weights(train_dataset) -> torch.Tensor:
    """
    Compute inverse-frequency class weights from the training dataset
    to handle FER2013 class imbalance.
    """
    targets = np.array([s[1] for s in train_dataset.samples])
    num_classes = len(train_dataset.class_to_idx)
    class_counts = np.bincount(targets, minlength=num_classes).astype(np.float64)

    # Inverse frequency weighting: total / (num_classes * count_per_class)
    total = class_counts.sum()
    weights = total / (num_classes * class_counts)

    print(f"\n  Class counts:  {dict(zip(train_dataset.class_to_idx.keys(), class_counts.astype(int)))}")
    print(f"  Class weights: {dict(zip(train_dataset.class_to_idx.keys(), np.round(weights, 4)))}")

    return torch.tensor(weights, dtype=torch.float32).to(DEVICE)


# ============================================================
# 6. TRAINING LOOP with EarlyStopping, LR warmup & AMP
# ============================================================

class EarlyStopping:
    """Stop training when val_loss stops improving."""

    def __init__(self, patience: int = 7):
        self.patience = patience
        self.counter = 0
        self.best_loss = float("inf")
        self.should_stop = False

    def step(self, val_loss: float) -> bool:
        if val_loss < self.best_loss:
            self.best_loss = val_loss
            self.counter = 0
        else:
            self.counter += 1
            if self.counter >= self.patience:
                self.should_stop = True
        return self.should_stop


def train_model(model, train_loader, test_loader, class_weights):
    """
    Train the model and return history dict with per-epoch metrics.

    Includes:
        - Adam optimiser (lr = 1e-4, with warmup at 1e-5 for first 2 epochs)
        - CrossEntropyLoss with class weights and label smoothing 0.1
        - ReduceLROnPlateau scheduler (patience=3, factor=0.3, min_lr=1e-7)
        - Mixed precision training (AMP) for 2-3x GPU speedup
        - EarlyStopping (patience=7, monitor val_loss)
        - ModelCheckpoint (saves best model on val_loss)
    """

    # Optimise unfrozen parameters (last 3 blocks + classifier)
    trainable_params = [p for p in model.parameters() if p.requires_grad]
    optimizer = optim.Adam(trainable_params, lr=LR)
    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=0.1)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", patience=3, factor=0.3, min_lr=1e-7,
    )
    early_stop = EarlyStopping(patience=ES_PATIENCE)

    # Mixed precision scaler
    scaler = GradScaler("cuda")

    best_val_loss = float("inf")
    best_model_path = os.path.join(MODEL_DIR, "best_facial_model.pth")

    history = {
        "train_acc": [], "val_acc": [],
        "train_loss": [], "val_loss": [],
    }

    print(f"\n  Training on {DEVICE} for up to {EPOCHS} epochs ...")
    print(f"  Mixed Precision: ON  |  Batch Size: {BATCH_SIZE}  |  LR: {LR}")
    print(f"  Warmup: epochs 1-2 at LR=1e-5\n")

    for epoch in range(1, EPOCHS + 1):

        # ---------- WARMUP: lower LR for first 2 epochs ----------
        if epoch <= 2:
            for pg in optimizer.param_groups:
                pg["lr"] = 1e-5
        else:
            for pg in optimizer.param_groups:
                pg["lr"] = LR

        # ---------- TRAINING PHASE ----------
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0

        for images, labels in train_loader:
            images = images.to(DEVICE, non_blocking=True)
            labels = labels.to(DEVICE, non_blocking=True)

            optimizer.zero_grad(set_to_none=True)

            # Mixed precision forward pass
            with autocast("cuda"):
                outputs = model(images)
                loss = criterion(outputs, labels)

            # Scaled backward pass
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

            running_loss += loss.item() * images.size(0)
            preds = outputs.argmax(dim=1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

        train_loss = running_loss / total
        train_acc = correct / total

        # ---------- VALIDATION PHASE ----------
        model.eval()
        val_running_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for images, labels in test_loader:
                images = images.to(DEVICE, non_blocking=True)
                labels = labels.to(DEVICE, non_blocking=True)

                with autocast("cuda"):
                    outputs = model(images)
                    loss = criterion(outputs, labels)

                val_running_loss += loss.item() * images.size(0)
                preds = outputs.argmax(dim=1)
                val_correct += (preds == labels).sum().item()
                val_total += labels.size(0)

        val_loss = val_running_loss / val_total
        val_acc = val_correct / val_total

        # Record history
        history["train_acc"].append(train_acc)
        history["val_acc"].append(val_acc)
        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)

        # Current LR
        current_lr = optimizer.param_groups[0]["lr"]

        print(
            f"Epoch [{epoch:>2}/{EPOCHS}]  "
            f"Train Loss: {train_loss:.4f}  Train Acc: {train_acc:.4f}  |  "
            f"Val Loss: {val_loss:.4f}  Val Acc: {val_acc:.4f}  |  "
            f"LR: {current_lr:.7f}"
        )

        # ---------- CHECKPOINT (save best) ----------
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), best_model_path)
            print(f"  [BEST] Model saved -> {best_model_path}")

        # ---------- SCHEDULER & EARLY STOPPING ----------
        scheduler.step(val_loss)
        if early_stop.step(val_loss):
            print(f"\n  Early stopping triggered at epoch {epoch}")
            break

    # Reload the best weights for evaluation
    model.load_state_dict(torch.load(best_model_path, map_location=DEVICE, weights_only=True))
    print(f"\n  Loaded best model weights from {best_model_path}")

    return history


# ============================================================
# 7. EVALUATION -- confusion matrix & classification report
# ============================================================

def evaluate_model(model, test_loader, class_to_idx: dict):
    """
    Run inference on the test set and produce:
        - Confusion matrix heatmap  -> confusion_matrix.png
        - Classification report     -> printed to console
    """
    # Invert idx -> class name
    idx_to_class = {v: k for k, v in class_to_idx.items()}

    model.eval()
    all_preds = []
    all_labels = []

    with torch.no_grad():
        for images, labels in test_loader:
            images = images.to(DEVICE)
            outputs = model(images)
            preds = outputs.argmax(dim=1).cpu().numpy()
            all_preds.extend(preds)
            all_labels.extend(labels.numpy())

    all_preds  = np.array(all_preds)
    all_labels = np.array(all_labels)

    # Map indices back to class names for display
    target_names = [idx_to_class[i] for i in sorted(idx_to_class.keys())]

    # ---------- Classification report ----------
    print("\n" + "=" * 60)
    print("CLASSIFICATION REPORT")
    print("=" * 60)
    report = classification_report(
        all_labels, all_preds,
        target_names=target_names,
        digits=4,
    )
    print(report)

    # ---------- Confusion matrix ----------
    cm = confusion_matrix(all_labels, all_preds)

    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(
        cm, annot=True, fmt="d", cmap="Blues",
        xticklabels=target_names,
        yticklabels=target_names,
        ax=ax,
    )
    ax.set_xlabel("Predicted", fontsize=12)
    ax.set_ylabel("Actual", fontsize=12)
    ax.set_title("Confusion Matrix -- 5 Classroom Emotions", fontsize=14)
    plt.tight_layout()

    cm_path = os.path.join(OUTPUT_DIR, "confusion_matrix.png")
    fig.savefig(cm_path, dpi=150)
    plt.close(fig)
    print(f"Confusion matrix saved -> {cm_path}")

    return target_names


# ============================================================
# 8. PLOTTING -- accuracy & loss curves
# ============================================================

def save_plots(history: dict):
    """Save accuracy and loss curves to OUTPUT_DIR."""

    epochs_range = range(1, len(history["train_acc"]) + 1)

    # ---------- Accuracy ----------
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(epochs_range, history["train_acc"], "o-", label="Train Accuracy")
    ax.plot(epochs_range, history["val_acc"],   "o-", label="Val Accuracy")
    ax.set_xlabel("Epoch")
    ax.set_ylabel("Accuracy")
    ax.set_title("Training & Validation Accuracy")
    ax.legend()
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    acc_path = os.path.join(OUTPUT_DIR, "accuracy_plot.png")
    fig.savefig(acc_path, dpi=150)
    plt.close(fig)
    print(f"Accuracy plot saved -> {acc_path}")

    # ---------- Loss ----------
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(epochs_range, history["train_loss"], "o-", label="Train Loss")
    ax.plot(epochs_range, history["val_loss"],   "o-", label="Val Loss")
    ax.set_xlabel("Epoch")
    ax.set_ylabel("Loss")
    ax.set_title("Training & Validation Loss")
    ax.legend()
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    loss_path = os.path.join(OUTPUT_DIR, "loss_plot.png")
    fig.savefig(loss_path, dpi=150)
    plt.close(fig)
    print(f"Loss plot saved -> {loss_path}")


# ============================================================
# 9. SAVE CLASS MAPPING
# ============================================================

def save_class_mapping(class_to_idx: dict):
    """Write the class <-> index mapping to a text file and JSON."""

    # Text file (UTF-8 to avoid encoding errors)
    txt_path = os.path.join(OUTPUT_DIR, "class_mapping.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write("Class Name -> Index\n")
        f.write("=" * 30 + "\n")
        for cls_name, idx in sorted(class_to_idx.items(), key=lambda x: x[1]):
            f.write(f"{cls_name:>15s} -> {idx}\n")
        f.write("\n")
        f.write("FER2013 -> Classroom Emotion Remap\n")
        f.write("=" * 30 + "\n")
        for orig, mapped in sorted(REMAP.items()):
            f.write(f"{orig:>10s} -> {mapped}\n")
    print(f"Class mapping saved -> {txt_path}")

    # JSON (machine-readable, useful for inference pipeline)
    json_path = os.path.join(MODEL_DIR, "facial_class_map.json")
    idx_to_class = {v: k for k, v in class_to_idx.items()}
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(idx_to_class, f, indent=2)
    print(f"JSON class map saved -> {json_path}")


# ============================================================
# 10. MAIN -- end-to-end pipeline
# ============================================================

def main():
    # Enable cuDNN auto-tuner for faster CUDA convolutions
    torch.backends.cudnn.benchmark = True

    print("=" * 60)
    print("  Facial Emotion Recognition -- EfficientNetB0")
    print("  FER2013 -> 5 Classroom Emotions")
    print(f"  Device: {DEVICE}  |  cuDNN benchmark: ON")
    print(f"  Mixed Precision: ON  |  Batch Size: {BATCH_SIZE}")
    print(f"  LR: {LR}  |  Epochs: {EPOCHS}  |  Patience: {ES_PATIENCE}")
    print("=" * 60)

    # Step 1: Remap dataset folders (7 -> 5 classes)
    train_dir, test_dir = prepare_datasets()

    # Step 2: Build data loaders with augmentation
    train_loader, test_loader, train_dataset = build_dataloaders(train_dir, test_dir)
    class_to_idx = train_dataset.class_to_idx

    # Step 3: Compute class weights for imbalance handling
    class_weights = compute_class_weights(train_dataset)

    # Step 4: Build model
    model = build_model(num_classes=len(class_to_idx))
    total_params = sum(p.numel() for p in model.parameters())
    trainable   = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\n  Model: EfficientNetB0  |  Total params: {total_params:,}  |  Trainable: {trainable:,}")

    # Step 5: Train
    history = train_model(model, train_loader, test_loader, class_weights)

    # Step 6: Evaluate on test set
    evaluate_model(model, test_loader, class_to_idx)

    # Step 7: Save plots
    save_plots(history)

    # Step 8: Save class mapping
    save_class_mapping(class_to_idx)

    print("\n" + "=" * 60)
    print("  Training complete!  All outputs saved to:")
    print(f"     {OUTPUT_DIR}")
    print(f"     {MODEL_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
