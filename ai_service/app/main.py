"""FastAPI application entry point."""

from __future__ import annotations

import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .model import analyze_feedback, ensure_models_trained, predict_topic_weakness
from .schemas import FeedbackInsights, StudentPerformanceRequest, StudentPerformanceResponse, TopicMetric
from .transcription import get_transcription_model, transcribe_audio_bytes
from .utils import (
    build_communication_insights,
    build_improvement_areas,
    build_recommendations,
    extract_tagged_items,
)


app = FastAPI(
    title="Student Performance Enhancement Prediction System",
    version="1.0.0",
    description="AI-powered analysis for student tests and interview feedback.",
)

default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://prep-delta-six.vercel.app",
]
configured_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys([*default_origins, *configured_origins])),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def bootstrap_models() -> None:
    """Ensures trained TensorFlow artifacts exist before the API starts."""

    ensure_models_trained()
    get_transcription_model()


@app.get("/health")
def health() -> dict[str, str]:
    """Simple health check endpoint."""

    return {"status": "ok"}


@app.post("/analyze-performance", response_model=StudentPerformanceResponse)
def analyze_performance(payload: StudentPerformanceRequest) -> StudentPerformanceResponse:
    """Analyzes student performance and returns predicted improvement guidance."""

    feedback_texts = [item.text for item in payload.interview_feedback]
    topic_metrics_raw = predict_topic_weakness(payload.test_data) if payload.analysis_mode != "interview" else []
    feedback_scores_raw = (
        analyze_feedback(payload.interview_feedback)
        if payload.analysis_mode != "test"
        else {
            "communication_score": 0.0,
            "confidence_score": 0.0,
            "technical_skill_score": 0.0,
            "highlights": [],
        }
    )

    topic_metrics = [TopicMetric(**item) for item in topic_metrics_raw]
    weak_topics = [item.topic for item in topic_metrics if item.is_weak]
    strong_topics = [item.topic for item in topic_metrics if not item.is_weak and item.accuracy >= 0.75]

    interview_weak_topics = extract_tagged_items(feedback_texts, "Topics To Improve")
    interview_improvement_subjects = extract_tagged_items(feedback_texts, "Subjects To Improve")
    interview_strong_topics = [
        item
        for item in extract_tagged_items(feedback_texts, "Strengths")
        if len(item.split()) <= 6 and len(item) <= 48
    ]

    if payload.analysis_mode == "interview":
        weak_topics = interview_weak_topics
        strong_topics = [topic for topic in interview_strong_topics if topic.lower() not in {entry.lower() for entry in weak_topics}]
    elif payload.analysis_mode == "combined":
        weak_topics = list(dict.fromkeys([*weak_topics, *interview_weak_topics]))
        strong_topics = list(
            dict.fromkeys(
                [
                    topic
                    for topic in [*strong_topics, *interview_strong_topics]
                    if topic.lower() not in {entry.lower() for entry in weak_topics}
                ]
            )
        )

    test_score = (
        sum(item.accuracy for item in topic_metrics) / len(topic_metrics) * 100.0 if topic_metrics else 0.0
    )
    interview_score = (
        feedback_scores_raw["communication_score"]
        + feedback_scores_raw["confidence_score"]
        + feedback_scores_raw["technical_skill_score"]
    ) / 3.0

    if payload.analysis_mode == "test":
        overall_score = test_score
    elif payload.analysis_mode == "interview":
        overall_score = interview_score
    else:
        available_scores = [score for score in [test_score, interview_score] if score > 0]
        overall_score = sum(available_scores) / len(available_scores) if available_scores else 0.0

    communication_insights = build_communication_insights(
        feedback_scores_raw["communication_score"], feedback_scores_raw["confidence_score"]
    )
    improvement_areas = build_improvement_areas(
        weak_topics,
        feedback_scores_raw["communication_score"],
        feedback_scores_raw["confidence_score"],
        feedback_scores_raw["technical_skill_score"],
    )
    improvement_areas = list(dict.fromkeys([*improvement_areas, *interview_improvement_subjects]))
    recommendations = build_recommendations(
        weak_topics,
        feedback_scores_raw["communication_score"],
        feedback_scores_raw["confidence_score"],
        feedback_scores_raw["technical_skill_score"],
    )

    return StudentPerformanceResponse(
        student_id=payload.student_id,
        student_name=payload.student_name,
        weak_topics=weak_topics,
        strong_topics=strong_topics,
        suggested_improvement_areas=improvement_areas,
        communication_insights=communication_insights,
        feedback_scores=FeedbackInsights(**feedback_scores_raw),
        topic_metrics=topic_metrics,
        overall_performance_score=round(overall_score, 2),
        generated_recommendations=recommendations,
    )


@app.post("/transcribe-audio")
async def transcribe_audio(audio: UploadFile = File(...)) -> dict[str, str]:
    """Transcribes spoken audio into text using Faster Whisper."""

    filename = (audio.filename or "").lower()
    if filename and not filename.endswith((".wav", ".mp3", ".m4a", ".webm", ".mp4")):
        raise HTTPException(status_code=400, detail="Unsupported audio format.")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is empty.")

    transcript = transcribe_audio_bytes(audio_bytes, suffix=".wav" if filename.endswith(".wav") else ".bin")
    if not transcript:
        raise HTTPException(status_code=422, detail="No speech detected. Please try again.")

    return {"text": transcript}
