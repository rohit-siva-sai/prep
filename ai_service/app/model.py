"""TensorFlow model training and inference helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import tensorflow as tf
from tensorflow import keras

from .preprocess import aggregate_test_records, build_topic_feature_vector, combine_feedback_text, load_topics
from .schemas import InterviewFeedbackRecord, TestRecord
from .utils import clamp_score, extract_feedback_highlights


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"

WEAKNESS_MODEL_PATH = MODELS_DIR / "topic_weakness_model.keras"
FEEDBACK_MODEL_PATH = MODELS_DIR / "feedback_analyzer_model.keras"
TOPICS_PATH = MODELS_DIR / "topics.json"

tf.random.set_seed(42)
np.random.seed(42)

STOP_WORDS = {
    "and",
    "the",
    "with",
    "that",
    "this",
    "were",
    "while",
    "from",
    "during",
    "into",
    "their",
    "they",
    "good",
}


def _ensure_dirs() -> None:
    """Creates the model output directory when missing."""

    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def _load_json(path: Path) -> list[dict[str, Any]]:
    """Reads a JSON file into Python objects."""

    return json.loads(path.read_text(encoding="utf-8"))


def build_topic_weakness_model(input_dim: int, output_dim: int) -> keras.Model:
    """Creates a simple dense model for topic weakness probabilities."""

    model = keras.Sequential(
        [
            keras.layers.Input(shape=(input_dim,)),
            keras.layers.Dense(32, activation="relu"),
            keras.layers.Dropout(0.15),
            keras.layers.Dense(16, activation="relu"),
            keras.layers.Dense(output_dim, activation="sigmoid"),
        ]
    )
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
    return model


def build_feedback_model(max_tokens: int = 1500, sequence_length: int = 120) -> keras.Model:
    """Creates the text model used for interview feedback scoring."""

    text_vectorizer = keras.layers.TextVectorization(
        max_tokens=max_tokens,
        output_mode="int",
        output_sequence_length=sequence_length,
        standardize="lower_and_strip_punctuation",
    )

    model = keras.Sequential(
        [
            keras.layers.Input(shape=(1,), dtype=tf.string),
            text_vectorizer,
            keras.layers.Embedding(max_tokens, 32),
            keras.layers.Bidirectional(keras.layers.LSTM(24)),
            keras.layers.Dense(24, activation="relu"),
            keras.layers.Dense(3, activation="sigmoid"),
        ]
    )
    return model


def train_models(epochs: int = 25) -> dict[str, str]:
    """Trains and saves both TensorFlow models plus metadata."""

    _ensure_dirs()

    performance_rows = _load_json(DATA_DIR / "performance_training.json")
    feedback_rows = _load_json(DATA_DIR / "feedback_training.json")

    topics = sorted({row["topic"] for row in performance_rows})
    TOPICS_PATH.write_text(json.dumps(topics, indent=2), encoding="utf-8")

    grouped_rows: dict[str, dict[str, float]] = {}
    grouped_labels: dict[str, dict[str, float]] = {}
    for row in performance_rows:
        student_id = row["student_id"]
        grouped_rows.setdefault(student_id, {topic: 0.0 for topic in topics})
        grouped_labels.setdefault(student_id, {topic: 0.0 for topic in topics})
        grouped_rows[student_id][row["topic"]] = float(row["accuracy"])
        grouped_labels[student_id][row["topic"]] = float(row["weak_label"])

    x_topic = np.asarray([[values[topic] for topic in topics] for values in grouped_rows.values()], dtype=np.float32)
    y_topic = np.asarray([[labels[topic] for topic in topics] for labels in grouped_labels.values()], dtype=np.float32)

    weakness_model = build_topic_weakness_model(input_dim=len(topics), output_dim=len(topics))
    weakness_model.fit(x_topic, y_topic, epochs=epochs, verbose=0)
    weakness_model.save(WEAKNESS_MODEL_PATH)

    feedback_texts = tf.convert_to_tensor([row["text"] for row in feedback_rows], dtype=tf.string)
    feedback_targets = np.asarray(
        [
            [
                float(row["communication_score"]) / 100.0,
                float(row["confidence_score"]) / 100.0,
                float(row["technical_skill_score"]) / 100.0,
            ]
            for row in feedback_rows
        ],
        dtype=np.float32,
    )

    feedback_model = build_feedback_model()
    vectorizer = feedback_model.layers[0]
    vectorizer.adapt(feedback_texts)
    feedback_model.compile(optimizer="adam", loss="mse", metrics=["mae"])
    feedback_model.fit(feedback_texts, feedback_targets, epochs=epochs, verbose=0)
    feedback_model.save(FEEDBACK_MODEL_PATH)

    return {
        "topic_model": str(WEAKNESS_MODEL_PATH),
        "feedback_model": str(FEEDBACK_MODEL_PATH),
        "topics": str(TOPICS_PATH),
    }


def ensure_models_trained() -> None:
    """Trains models when saved artifacts are missing."""

    if WEAKNESS_MODEL_PATH.exists() and FEEDBACK_MODEL_PATH.exists() and TOPICS_PATH.exists():
        return
    train_models()


def predict_topic_weakness(test_data: list[TestRecord]) -> list[dict[str, Any]]:
    """Returns aggregated topic metrics with weakness probabilities."""

    ensure_models_trained()
    topics = load_topics()
    model = keras.models.load_model(WEAKNESS_MODEL_PATH)

    aggregated = aggregate_test_records(test_data)
    if not aggregated:
        return []

    feature_vector = build_topic_feature_vector(aggregated, topics)
    probabilities = model.predict(feature_vector, verbose=0)[0]
    probability_map = {topic: float(probabilities[idx]) for idx, topic in enumerate(topics)}

    enriched: list[dict[str, Any]] = []
    for row in aggregated:
        weakness_probability = probability_map.get(row["topic"], 1.0 - float(row["accuracy"]))
        enriched.append(
            {
                **row,
                "weakness_probability": round(float(weakness_probability), 4),
                "is_weak": bool(row["is_weak"] or weakness_probability >= 0.5),
            }
        )
    return enriched


def analyze_feedback(feedback_items: list[InterviewFeedbackRecord]) -> dict[str, Any]:
    """Predicts communication, confidence, and technical scores from feedback text."""

    ensure_models_trained()
    model = keras.models.load_model(FEEDBACK_MODEL_PATH)
    combined_text = combine_feedback_text(feedback_items)
    if not combined_text:
        return {
            "communication_score": 0.0,
            "confidence_score": 0.0,
            "technical_skill_score": 0.0,
            "highlights": [],
        }

    prediction = model.predict(tf.convert_to_tensor([combined_text], dtype=tf.string), verbose=0)[0]
    communication_score, confidence_score, technical_score = [clamp_score(score * 100.0) for score in prediction]
    cleaned = "".join(char.lower() if char.isalnum() or char.isspace() else " " for char in combined_text)
    tokens = [token for token in cleaned.split() if len(token) > 2 and token not in STOP_WORDS]
    return {
        "communication_score": round(communication_score, 2),
        "confidence_score": round(confidence_score, 2),
        "technical_skill_score": round(technical_score, 2),
        "highlights": extract_feedback_highlights(tokens),
    }
