"use client";

import { PredictionWorkspace } from "@/components/performance/prediction-workspace";

export default function ExamPredictorPage() {
  return (
    <PredictionWorkspace
      allowedModes={["test"]}
      initialMode="test"
      navActions={[
        { href: "/interviews", label: "Interview Tracks" },
        { href: "/interview-predictor", label: "Interview Predictor" },
        { href: "/performance-enhancement", label: "Predictor Hub" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      showExamSelector
      showInterviewSelector={false}
      subtitle="Run topic weakness prediction from selected exam attempts"
      title="Exam Predictor"
    />
  );
}
