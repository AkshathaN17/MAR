import os
import torch
import torch.nn as nn
import numpy as np
import matplotlib.pyplot as plt
from torchvision import models
from sklearn.metrics import (
    confusion_matrix,
    classification_report,
    ConfusionMatrixDisplay,
    precision_score,
    recall_score,
    f1_score,
    cohen_kappa_score,
    accuracy_score
)

from load_dataset import create_train_test_loaders


# ----------------------------
# PATHS
# ----------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_PATH = os.path.join(BASE_DIR, "dataset", "posture")
MODEL_PATH = os.path.join(BASE_DIR, "models", "posture_cnn.pt")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# ----------------------------
# LOAD MODEL
# ----------------------------
def load_model(num_classes):
    model = models.resnet18(weights=None)
    model.fc = nn.Linear(model.fc.in_features, num_classes)
    model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
    model.to(DEVICE)
    model.eval()
    return model


# ----------------------------
# PER-CLASS ACCURACY
# ----------------------------
def per_class_accuracy(y_true, y_pred, class_names):
    print("\n📊 Per-Class Accuracy")
    for i, name in enumerate(class_names):
        idx = np.where(np.array(y_true) == i)
        acc = np.mean(np.array(y_pred)[idx] == i)
        print(f"{name:15s}: {acc:.4f}")


# ----------------------------
# EVALUATION
# ----------------------------
def evaluate():
    _, test_loader, class_map = create_train_test_loaders(DATASET_PATH)

    idx_to_class = {v: k for k, v in class_map.items()}
    class_names = [idx_to_class[i] for i in range(len(idx_to_class))]

    model = load_model(len(class_names))

    y_true, y_pred = [], []

    with torch.no_grad():
        for images, labels in test_loader:
            images = images.to(DEVICE)
            outputs = model(images)
            preds = outputs.argmax(dim=1).cpu().numpy()

            y_pred.extend(preds)
            y_true.extend(labels.numpy())

    total_acc = accuracy_score(y_true, y_pred)
    print("\n🎯 Total Test Accuracy:", round(total_acc, 4))        

    # ---------------- Metrics ----------------
    print("\n📄 Classification Report")
    print(classification_report(y_true, y_pred, target_names=class_names))

    print("Macro F1      :", f1_score(y_true, y_pred, average="macro"))
    print("Weighted F1   :", f1_score(y_true, y_pred, average="weighted"))
    print("Cohen’s Kappa :", cohen_kappa_score(y_true, y_pred))
    

    per_class_accuracy(y_true, y_pred, class_names)

    # ---------------- Confusion Matrix ----------------
    cm = confusion_matrix(y_true, y_pred)
    disp = ConfusionMatrixDisplay(cm, display_labels=class_names)
    disp.plot(cmap="Blues", xticks_rotation=45)
    plt.title("Posture Confusion Matrix")
    plt.tight_layout()
    plt.show()

    # ---------------- Normalized CM ----------------
    cm_norm = confusion_matrix(y_true, y_pred, normalize="true")
    disp = ConfusionMatrixDisplay(cm_norm, display_labels=class_names)
    disp.plot(cmap="Blues", xticks_rotation=45)
    plt.title("Normalized Confusion Matrix (Posture)")
    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    evaluate()
