import os
import torch
import torch.nn as nn
import joblib
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
    roc_curve,
    auc,
    accuracy_score
)

from load_dataset import create_train_test_loaders


# ----------------------------
# PATHS
# ----------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_PATH = os.path.join(BASE_DIR, "dataset", "gaze")

CNN_PATH = os.path.join(BASE_DIR, "models", "gaze_cnn.pt")
SVM_PATH = os.path.join(BASE_DIR, "models", "gaze_svm.joblib")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# ----------------------------
# LOAD CNN
# ----------------------------
def load_cnn():
    model = models.resnet18(weights=None)
    model.fc = nn.Identity()
    model.load_state_dict(torch.load(CNN_PATH, map_location=DEVICE))
    model.to(DEVICE)
    model.eval()
    return model


# ----------------------------
# EVALUATION
# ----------------------------
def evaluate():
    _, test_loader, class_map = create_train_test_loaders(DATASET_PATH)

    idx_to_class = {v: k for k, v in class_map.items()}
    class_names = [idx_to_class[i] for i in range(len(idx_to_class))]

    cnn = load_cnn()
    svm = joblib.load(SVM_PATH)

    y_true, y_pred, y_prob = [], [], []

    with torch.no_grad():
        for images, labels in test_loader:
            images = images.to(DEVICE)
            feats = cnn(images).cpu().numpy()
            preds = svm.predict(feats)
            probs = svm.predict_proba(feats)[:, 1]

            y_pred.extend(preds)
            y_prob.extend(probs)
            y_true.extend(labels.numpy())
    
    total_acc = accuracy_score(y_true, y_pred)
    print("\n🎯 Total Test Accuracy:", round(total_acc, 4)) 
    # ---------------- Metrics ----------------
    print("\n📄 Classification Report (GAZE)")
    print(classification_report(y_true, y_pred, target_names=class_names))

    print("Macro F1      :", f1_score(y_true, y_pred, average="macro"))
    print("Weighted F1   :", f1_score(y_true, y_pred, average="weighted"))
    print("Cohen’s Kappa :", cohen_kappa_score(y_true, y_pred))

    # ---------------- Confusion Matrix ----------------
    cm = confusion_matrix(y_true, y_pred)
    disp = ConfusionMatrixDisplay(cm, display_labels=class_names)
    disp.plot(cmap="Blues")
    plt.title("Gaze Confusion Matrix")
    plt.show()

    # ---------------- ROC / AUC ----------------
    fpr, tpr, _ = roc_curve(y_true, y_prob)
    roc_auc = auc(fpr, tpr)

    plt.figure()
    plt.plot(fpr, tpr, label=f"AUC = {roc_auc:.4f}")
    plt.plot([0, 1], [0, 1], linestyle="--")
    plt.xlabel("False Positive Rate")
    plt.ylabel("True Positive Rate")
    plt.title("ROC Curve - Gaze")
    plt.legend()
    plt.show()


if __name__ == "__main__":
    evaluate()
