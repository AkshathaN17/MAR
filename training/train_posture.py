import os
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import models
from load_dataset import create_train_test_loaders


# ============================
# PATH SETUP
# ============================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_PATH = os.path.join(BASE_DIR, "dataset", "posture")
MODEL_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODEL_DIR, exist_ok=True)

# ============================
# CONFIG
# ============================
BATCH_SIZE = 32
EPOCHS = 10
LR = 1e-4
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# ============================
# MODEL
# ============================
def get_model(num_classes):
    model = models.resnet18(weights="IMAGENET1K_V1")
    for param in model.parameters():
        param.requires_grad = False  # freeze backbone
    model.fc = nn.Linear(model.fc.in_features, num_classes)
    return model.to(DEVICE)


# ============================
# TRAIN + TEST
# ============================
def train_and_test():
    print("📂 Loading dataset...")
    train_loader, test_loader, class_map = create_train_test_loaders(DATASET_PATH)

    print("Class mapping:", class_map)

    model = get_model(num_classes=len(class_map))
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.fc.parameters(), lr=LR)

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

    # Save model
    model_path = os.path.join(MODEL_DIR, "posture_cnn.pt")
    torch.save(model.state_dict(), model_path)
    print(f"\n✅ Model saved to {model_path}")


# ============================
# RUN
# ============================
if __name__ == "__main__":
    train_and_test()
