import os
import random
from PIL import Image
from typing import List, Tuple

import torch
from torch.utils.data import Dataset, DataLoader, random_split
from torchvision import transforms


# --------------------------------------------------
# Dataset class
# --------------------------------------------------
class FolderDataset(Dataset):
    """
    Reads images from folder structure:
    root/
      class_1/
      class_2/
      ...
    """

    def __init__(self, root_dir: str, transform=None):
        self.root_dir = root_dir
        self.transform = transform
        self.samples: List[Tuple[str, int]] = []
        self.class_to_idx = {}

        self._index_dataset()

    def _index_dataset(self):
        classes = sorted(
            d for d in os.listdir(self.root_dir)
            if os.path.isdir(os.path.join(self.root_dir, d))
        )

        self.class_to_idx = {
            class_name: idx for idx, class_name in enumerate(classes)
        }

        for class_name, class_idx in self.class_to_idx.items():
            class_path = os.path.join(self.root_dir, class_name)
            for img in os.listdir(class_path):
                if img.lower().endswith((".jpg", ".png", ".jpeg")):
                    self.samples.append(
                        (os.path.join(class_path, img), class_idx)
                    )

        random.shuffle(self.samples)

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        image = Image.open(img_path).convert("RGB")

        if self.transform:
            image = self.transform(image)

        return image, label


# --------------------------------------------------
# Transforms
# --------------------------------------------------
def get_transforms(train=True):
    if train:
        return transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomRotation(10),
            transforms.ColorJitter(brightness=0.2, contrast=0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.5]*3, [0.5]*3)
        ])
    else:
        return transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.5]*3, [0.5]*3)
        ])


# --------------------------------------------------
# Train / Test loader
# --------------------------------------------------
def create_train_test_loaders(
    dataset_path: str,
    batch_size: int = 32,
    train_ratio: float = 0.8
):
    dataset = FolderDataset(
        dataset_path,
        transform=get_transforms(train=True)
    )

    total_size = len(dataset)
    train_size = int(train_ratio * total_size)
    test_size = total_size - train_size

    train_set, test_set = random_split(dataset, [train_size, test_size])

    # Disable augmentation for test
    test_set.dataset.transform = get_transforms(train=False)

    train_loader = DataLoader(train_set, batch_size=batch_size, shuffle=True)
    test_loader = DataLoader(test_set, batch_size=batch_size, shuffle=False)

    return train_loader, test_loader, dataset.class_to_idx


# --------------------------------------------------
# Sanity check
# --------------------------------------------------
if __name__ == "__main__":
    DATASET_PATH = r"E:\Desktop\Sem 5 EL\MAR\dataset\gaze"  # change to dataset/gaze
    BATCH_SIZE = 32

    train_loader, test_loader, class_map = create_train_test_loaders(
        DATASET_PATH,
        batch_size=BATCH_SIZE
    )

    print("\nClass mapping:")
    for k, v in class_map.items():
        print(f"{k} → {v}")

    print("\nDataset sizes:")
    print("Train:", len(train_loader.dataset))
    print("Test :", len(test_loader.dataset))

    images, labels = next(iter(train_loader))
    print("\nBatch shape:", images.shape)
    print("Sample labels:", labels[:10])
