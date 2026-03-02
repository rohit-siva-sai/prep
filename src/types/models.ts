export type UserRole = "admin" | "student";

export type UserProfile = {
  username: string;
  fullName: string;
  passwordHash: string;
  role: UserRole;
  createdAt: number;
};

export type Question = {
  id: string;
  text: string;
  options: string[];
  answer: number;
};

export type ExamTest = {
  id: string;
  name: string;
  tagline: string;
  durationSec: number;
  passPercent: number;
  questions: Question[];
};

export type AttemptReview = {
  qid: string;
  question: string;
  options: string[];
  selected: number;
  correct: number;
  isCorrect: boolean;
};

export type ExamAttempt = {
  id: string;
  username: string;
  fullName: string;
  testId: string;
  testName: string;
  passPercent: number;
  durationSec: number;
  score: number;
  total: number;
  percent: number;
  passed: boolean;
  startTs: number;
  endTs: number;
  answers: Record<string, number>;
  review: AttemptReview[];
};

export type Interview = {
  id?: string;
  title: string;
  roleName: string;
  topics: string;
  difficulty: string;
  questionCount: number;
  durationMinutes: number;
  interviewType: string;
  introMessage: string;
  questionFlow: string;
  followupLogic: string;
  evaluationCriteria: string;
  createdBy: string;
  customQuestions: string[];
  createdAt: number;
};

export type InterviewMessage = {
  sender: "AI" | "STUDENT";
  messageType: "INTRO" | "QUESTION" | "ANSWER" | "CLOSE";
  messageText: string;
  createdAt: number;
};

export type InterviewSession = {
  id?: string;
  interviewId: string;
  interviewTitle: string;
  roleName: string;
  topics: string;
  difficulty: string;
  interviewType: string;
  evaluationCriteria: string;
  studentUsername: string;
  studentName: string;
  status: "ACTIVE" | "PENDING_EVALUATION" | "COMPLETED";
  startTime: number;
  endTime?: number;
  currentQuestionNo: number;
  totalQuestions: number;
  durationMinutes: number;
  messages: InterviewMessage[];
};

export type InterviewResult = {
  sessionId: string;
  technical: number;
  communication: number;
  relevance: number;
  confidence: number;
  overall: number;
  strengths: string;
  weaknesses: string;
  suggestions: string;
  feedback: string;
  createdAt: number;
};
