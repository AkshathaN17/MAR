from pathlib import Path
import shutil

root = Path(r"E:\Desktop\Sem 5 EL\MAR\dataset")  # main dataset folder

image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}

for person_dir in root.iterdir():
    if not person_dir.is_dir():
        continue

    # Skip already-merged folders if script is re-run
    if person_dir.name in {"gaze", "posture"}:
        continue

    person_name = person_dir.name

    for task_dir in person_dir.iterdir():  # gaze / posture
        if not task_dir.is_dir():
            continue

        task_name = task_dir.name  # gaze or posture
        task_out = root / task_name
        task_out.mkdir(exist_ok=True)

        for class_dir in task_dir.iterdir():  # looking_at_screen, slouching, etc.
            if not class_dir.is_dir():
                continue

            class_name = class_dir.name
            class_out = task_out / class_name
            class_out.mkdir(parents=True, exist_ok=True)

            for img in class_dir.iterdir():
                if img.suffix.lower() not in image_exts:
                    continue

                new_name = f"{person_name}_{img.name}"
                dest = class_out / new_name

                if dest.exists():
                    raise FileExistsError(f"Collision detected: {dest}")

                shutil.copy2(img, dest)

print("✅ Dataset merged with structure preserved.")
