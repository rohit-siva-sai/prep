"""Pydantic schemas for the performance prediction API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class TestRecord(BaseModel):
    """Represents a single topic-wise test observation."""

    subject: str = Field(..., description="Course or assessment name.")
    topic: str = Field(..., description="Topic covered by the test question or section.")
    score: float = Field(..., ge=0, description="Marks earned for the topic entry.")
    total_marks: float = Field(..., gt=0, description="Maximum possible marks for the topic entry.")
    date: str = Field(..., description="Attempt date in ISO format.")


class InterviewFeedbackRecord(BaseModel):
    """Represents one textual interview feedback entry."""

    text: str = Field(..., min_length=3, description="Interview feedback text.")


class StudentPerformanceRequest(BaseModel):
    """Combined request body for performance analysis."""

    student_id: str = Field(..., description="Unique student identifier.")
    student_name: str = Field(..., description="Student display name.")
    analysis_mode: Literal["combined", "test", "interview"] = "combined"
    test_data: list[TestRecord] = Field(default_factory=list)
    interview_feedback: list[InterviewFeedbackRecord] = Field(default_factory=list)


class TopicMetric(BaseModel):
    """Aggregated performance metrics for a topic."""

    topic: str
    subject: str
    attempts: int
    score: float
    total_marks: float
    accuracy: float
    weakness_probability: float
    is_weak: bool


class FeedbackInsights(BaseModel):
    """Normalized feedback model outputs."""

    communication_score: float
    confidence_score: float
    technical_skill_score: float
    highlights: list[str]


class StudentPerformanceResponse(BaseModel):
    """Structured API response for the frontend and Postman testing."""

    student_id: str
    student_name: str
    weak_topics: list[str]
    strong_topics: list[str]
    suggested_improvement_areas: list[str]
    communication_insights: list[str]
    feedback_scores: FeedbackInsights
    topic_metrics: list[TopicMetric]
    overall_performance_score: float
    generated_recommendations: list[str]
