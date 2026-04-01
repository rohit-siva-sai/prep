"""Utility helpers for recommendations and API responses."""

from __future__ import annotations

from collections import Counter


def clamp_score(value: float) -> float:
    """Clamps floating scores into the 0-100 range."""

    return max(0.0, min(100.0, float(value)))


def extract_feedback_highlights(tokens: list[str], limit: int = 6) -> list[str]:
    """Returns the most frequent informative feedback tokens."""

    if not tokens:
        return []
    counts = Counter(tokens)
    return [token for token, _ in counts.most_common(limit)]


def build_improvement_areas(
    weak_topics: list[str], communication_score: float, confidence_score: float, technical_score: float
) -> list[str]:
    """Converts model outputs into concise focus areas."""

    areas: list[str] = []
    if weak_topics:
        areas.extend(f"Revise {topic}" for topic in weak_topics[:4])
    if communication_score < 65:
        areas.append("Improve communication clarity")
    if confidence_score < 65:
        areas.append("Build interview confidence")
    if technical_score < 65:
        areas.append("Strengthen technical depth")
    return areas or ["Maintain current preparation cadence"]


def build_recommendations(
    weak_topics: list[str], communication_score: float, confidence_score: float, technical_score: float
) -> list[str]:
    """Generates personalized action recommendations."""

    recommendations: list[str] = []

    for topic in weak_topics[:3]:
        recommendations.append(f"Revise {topic} with 20 focused practice questions this week.")

    if communication_score < 70:
        recommendations.append("Practice mock answers aloud and shorten long sentences for clearer delivery.")
    if confidence_score < 70:
        recommendations.append("Record two mock interviews and review posture, pace, and filler words.")
    if technical_score < 70:
        recommendations.append("Revisit core problem-solving patterns and explain one solution daily in plain language.")

    if not recommendations:
        recommendations.append("Keep a steady revision plan and schedule one advanced mock assessment.")

    return recommendations


def build_communication_insights(communication_score: float, confidence_score: float) -> list[str]:
    """Produces human-readable communication insights."""

    insights: list[str] = []

    if communication_score >= 75:
        insights.append("Communication is clear and mostly well-structured.")
    elif communication_score >= 55:
        insights.append("Communication is understandable but needs sharper structure and brevity.")
    else:
        insights.append("Communication needs more clarity, pacing control, and concise phrasing.")

    if confidence_score >= 75:
        insights.append("Confidence level appears strong during interview responses.")
    elif confidence_score >= 55:
        insights.append("Confidence is moderate; steadier delivery would improve impact.")
    else:
        insights.append("Confidence appears low; more mock practice should reduce hesitation.")

    return insights


def _clean_list_value(value: str) -> list[str]:
    return [
        item.strip(" .:-")
        for item in value.replace("\r", "\n").replace(";", ",").split("\n")
        for item in item.split(",")
        if item.strip(" .:-")
    ]


def extract_tagged_items(feedback_texts: list[str], tag: str) -> list[str]:
    """Extracts comma/newline separated values from tagged feedback sections."""

    prefix = f"{tag.lower()}:"
    items: list[str] = []
    for text in feedback_texts:
        normalized = text.strip()
        if not normalized.lower().startswith(prefix):
            continue
        value = normalized[len(prefix) :].strip()
        items.extend(_clean_list_value(value))
    seen: set[str] = set()
    deduped: list[str] = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped
