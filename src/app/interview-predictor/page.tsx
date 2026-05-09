"use client";

import { PredictionWorkspace } from "@/components/performance/prediction-workspace";

export default function InterviewPredictorPage() {
  return (
    <PredictionWorkspace
      allowedModes={["interview", "combined"]}
      initialMode="interview"
      navActions={[
        { href: "/interviews", label: "Interview Tracks" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      showExamSelector
      showInterviewSelector
      subtitle="Analyze interview feedback alone or combine it with selected exam attempts"
      title="Interview Predictor"
    />
  );
}
