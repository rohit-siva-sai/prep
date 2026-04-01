export type StudentTestRecord = {
  subject: string;
  topic: string;
  score: number;
  total_marks: number;
  date: string;
};

export type StudentInterviewFeedbackRecord = {
  text: string;
};

export type PredictionMode = "combined" | "test" | "interview";

export type PredictionRequest = {
  student_id: string;
  student_name: string;
  analysis_mode: PredictionMode;
  test_data: StudentTestRecord[];
  interview_feedback: StudentInterviewFeedbackRecord[];
};

export type TopicMetric = {
  topic: string;
  subject: string;
  attempts: number;
  score: number;
  total_marks: number;
  accuracy: number;
  weakness_probability: number;
  is_weak: boolean;
};

export type PredictionResponse = {
  student_id: string;
  student_name: string;
  weak_topics: string[];
  strong_topics: string[];
  suggested_improvement_areas: string[];
  communication_insights: string[];
  feedback_scores: {
    communication_score: number;
    confidence_score: number;
    technical_skill_score: number;
    highlights: string[];
  };
  topic_metrics: TopicMetric[];
  overall_performance_score: number;
  generated_recommendations: string[];
};
