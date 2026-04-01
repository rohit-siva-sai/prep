"use client";

import { ExamAttempt, InterviewResult } from "@/types/models";
import { normalizeTopicLabel } from "@/lib/exam-topics";
import {
  PredictionMode,
  PredictionRequest,
  PredictionResponse,
  StudentInterviewFeedbackRecord,
  StudentTestRecord,
} from "@/types/prediction";

const API_URL = "/api/performance";

export const buildPredictionPayload = ({
  user,
  attempts,
  interviewResults,
  mode,
}: {
  user: { username: string; fullName: string };
  attempts: ExamAttempt[];
  interviewResults: InterviewResult[];
  mode: PredictionMode;
}): PredictionRequest => {
  const testData: StudentTestRecord[] = attempts.flatMap((attempt) =>
    attempt.review.map((row) => ({
      subject: attempt.testName,
      topic: normalizeTopicLabel(row.topic, row.question, attempt.testName),
      score: row.isCorrect ? 1 : 0,
      total_marks: 1,
      date: new Date(attempt.endTs).toISOString().slice(0, 10),
    })),
  );

  const interviewFeedback: StudentInterviewFeedbackRecord[] = interviewResults.flatMap((result) =>
    [
      { text: `Final Feedback: ${result.feedback}` },
      { text: result.improvementTopics ? `Topics To Improve: ${result.improvementTopics}` : "" },
      { text: result.improvementSubjects ? `Subjects To Improve: ${result.improvementSubjects}` : "" },
      { text: `Strengths: ${result.strengths}` },
      { text: `Weaknesses: ${result.weaknesses}` },
      { text: `Suggestions: ${result.suggestions}` },
    ].filter((entry) => entry.text.trim().length > 0),
  );

  return {
    student_id: user.username,
    student_name: user.fullName,
    analysis_mode: mode,
    test_data: mode === "interview" ? [] : testData,
    interview_feedback: mode === "test" ? [] : interviewFeedback,
  };
};

export const analyzePerformance = async (payload: PredictionRequest): Promise<PredictionResponse> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/analyze-performance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Prediction API is unreachable. Make sure the deployed app has PERFORMANCE_API_URL set to your Python backend.",
      );
    }
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to analyze performance.");
  }

  return (await response.json()) as PredictionResponse;
};
