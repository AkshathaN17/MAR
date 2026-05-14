import os
import torch
import torch.nn as nn
from torchvision import models
from torch.utils.data import DataLoader
import joblib
from tqdm import tqdm

from load_dataset import create_train_test_loaders


# --------------------------------------------------
# PATH SETUP (ROBUST & SAFE)
# --------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_PATH = os.path.join(BASE_DIR, "dataset", "gaze_balanced")
MODEL_DIR = os.path.join(BASE_DIR, "models")

os.makedirs(MODEL_DIR, exist_ok=True)

# --------------------------------------------------
# CONFIG
# --------------------------------------------------
BATCH_SIZE = 32
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

CNN_MODEL_PATH = os.path.join(MODEL_DIR, "gaze_cnn_balanced.pt")
SVM_MODEL_PATH = os.path.join(MODEL_DIR, "gaze_svm_balanced.joblib")


# --------------------------------------------------
# CNN FEATURE EXTRACTOR
# --------------------------------------------------
def get_feature_extractor():
    model = models.resnet18(weights="IMAGENET1K_V1")
    model.fc = nn.Identity()  # Remove classifier
    model = model.to(DEVICE)
    model.eval()
    return model


# --------------------------------------------------
# FEATURE EXTRACTION
# --------------------------------------------------
def extract_features(model, dataloader):
    features = []
    labels = []

    with torch.no_grad():
        for images, targets in tqdm(dataloader, desc="Extracting features"):
            images = images.to(DEVICE)
            feats = model(images)
            features.append(feats.cpu())
            labels.append(targets)

    return torch.cat(features).numpy(), torch.cat(labels).numpy()


# --------------------------------------------------
# TRAIN PIPELINE
# --------------------------------------------------
def main():
    print("📂 Loading dataset...")
    print("Dataset path:", DATASET_PATH)

    train_loader, test_loader, class_map = create_train_test_loaders(
        DATASET_PATH,
        batch_size=BATCH_SIZE
    )

    print("Class mapping:", class_map)

    print("🧠 Initializing CNN backbone...")
    cnn = get_feature_extractor()

    print("📤 Extracting training features...")
    X_train, y_train = extract_features(cnn, train_loader)

    print("📤 Extracting test features...")
    X_test, y_test = extract_features(cnn, test_loader)

    print("🤖 Training SVM classifier...")
    from sklearn.svm import SVC

    svm = SVC(
        kernel="rbf",
        C=1.0,
        gamma="scale",
        probability=True
    )

    svm.fit(X_train, y_train)

    train_acc = svm.score(X_train, y_train)
    test_acc = svm.score(X_test, y_test)

    print(f"✅ Train Accuracy: {train_acc:.4f}")
    print(f"✅ Test Accuracy : {test_acc:.4f}")

    print("💾 Saving models...")
    torch.save(cnn.state_dict(), CNN_MODEL_PATH)
    joblib.dump(svm, SVM_MODEL_PATH)

    print("🎉 Training completed successfully!")
    print(f"Saved CNN  -> {CNN_MODEL_PATH}")
    print(f"Saved SVM  -> {SVM_MODEL_PATH}")


# --------------------------------------------------
# ENTRY POINT
# --------------------------------------------------
if __name__ == "__main__":
    main()
