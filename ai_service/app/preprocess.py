"""Data preprocessing helpers for the prediction service."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np

from .schemas import InterviewFeedbackRecord, TestRecord


BASE_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE_DIR / "models"
TOPICS_PATH = MODELS_DIR / "topics.json"


def load_topics() -> list[str]:
    """Loads the canonical topic order used by the weakness model."""

    if not TOPICS_PATH.exists():
        return []
    return json.loads(TOPICS_PATH.read_text(encoding="utf-8"))


def aggregate_test_records(
    test_data: list[TestRecord], weak_threshold: float = 0.6
) -> list[dict[str, Any]]:
    """Aggregates raw test records into topic-level accuracy summaries."""

    grouped: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {"score": 0.0, "total_marks": 0.0, "attempts": 0}
    )

    for record in test_data:
        key = (record.subject, record.topic)
        grouped[key]["score"] += record.score
        grouped[key]["total_marks"] += record.total_marks
        grouped[key]["attempts"] += 1

    aggregated: list[dict[str, Any]] = []
    for (subject, topic), values in sorted(grouped.items(), key=lambda item: item[0][1]):
        total_marks = values["total_marks"] or 1.0
        accuracy = float(values["score"] / total_marks)
        aggregated.append(
            {
                "subject": subject,
                "topic": topic,
                "attempts": int(values["attempts"]),
                "score": float(values["score"]),
                "total_marks": float(values["total_marks"]),
                "accuracy": accuracy,
                "is_weak": accuracy < weak_threshold,
            }
        )
    return aggregated


def build_topic_feature_vector(aggregated_topics: list[dict[str, Any]], topic_order: list[str]) -> np.ndarray:
    """Builds a fixed-size feature vector ordered by the trained topic vocabulary."""

    if not topic_order:
        return np.zeros((1, 1), dtype=np.float32)

    accuracy_map = {item["topic"]: float(item["accuracy"]) for item in aggregated_topics}
    vector = [accuracy_map.get(topic, 0.0) for topic in topic_order]
    return np.asarray([vector], dtype=np.float32)


def combine_feedback_text(feedback_items: list[InterviewFeedbackRecord]) -> str:
    """Joins multiple feedback snippets into one document for inference."""

    return " ".join(item.text.strip() for item in feedback_items if item.text.strip())
