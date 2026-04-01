"""Training entry point for the student performance models."""

from app.model import train_models


if __name__ == "__main__":
    artifacts = train_models()
    print("Training complete.")
    for name, path in artifacts.items():
        print(f"{name}: {path}")
