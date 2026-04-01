import { AttemptReview, ExamTest, Question } from "@/types/models";

const TOPIC_RULES: Array<{ topic: string; patterns: RegExp[] }> = [
  { topic: "Arrays", patterns: [/\barray/i, /\bmatrix/i] },
  { topic: "Stacks and Queues", patterns: [/\bstack\b/i, /\bqueue\b/i] },
  { topic: "Trees and Graphs", patterns: [/\btree\b/i, /\bgraph\b/i] },
  { topic: "Algorithms", patterns: [/\balgorithm/i, /binary search/i, /sorting/i, /\bcomplexity\b/i, /\bbig-?o\b/i] },
  { topic: "DBMS", patterns: [/\bsql\b/i, /database/i, /mysql/i, /postgres/i, /mongo/i, /\bjoin\b/i, /\bnormalization\b/i, /\bdbms\b/i] },
  { topic: "Networking", patterns: [/\bhttp\b/i, /\bhttps\b/i, /\bprotocol\b/i, /\bnetwork/i, /\bheader\b/i, /\bstatus\b/i] },
  { topic: "Security", patterns: [/\bsecurity\b/i, /\bxss\b/i, /\bcsrf\b/i, /encryption/i, /certificate/i, /phishing/i, /password/i] },
  { topic: "Machine Learning", patterns: [/\bmodel\b/i, /precision/i, /gradient/i, /\brelu\b/i, /\bclassification\b/i, /overfitting/i, /\bmachine learning\b/i] },
  { topic: "NLP", patterns: [/\bnlp\b/i, /token/i, /\btransformer\b/i, /\bllm\b/i, /language model/i] },
  { topic: "Programming", patterns: [/\bc language\b/i, /\bc\+\+\b/i, /\bjava\b/i, /\bpython\b/i, /\bphp\b/i, /\boop\b/i] },
  { topic: "Web", patterns: [/\bhtml\b/i, /\bcss\b/i, /\bjavascript\b/i, /\bdom\b/i] },
];

const titleCase = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

export const inferTopicFromQuestion = (question: string, fallbackSubject: string) => {
  const match = TOPIC_RULES.find((entry) => entry.patterns.some((pattern) => pattern.test(question)));
  if (match) return match.topic;

  const subject = fallbackSubject.trim();
  if (subject) return titleCase(subject);
  return "General";
};

export const normalizeTopicLabel = (topic: string | undefined, question: string, subject: string) => {
  const cleaned = (topic || "").trim();
  if (cleaned) return titleCase(cleaned);
  return inferTopicFromQuestion(question, subject);
};

export const normalizeQuestionTopic = (question: Question, subject: string): Question => ({
  ...question,
  topic: normalizeTopicLabel(question.topic, question.text, subject),
});

export const normalizeExamTest = (test: ExamTest): ExamTest => ({
  ...test,
  questions: test.questions.map((question) => normalizeQuestionTopic(question, test.name)),
});

export const normalizeAttemptReviewTopics = (review: AttemptReview[], subject: string): AttemptReview[] =>
  review.map((row) => ({
    ...row,
    topic: normalizeTopicLabel(row.topic, row.question, subject),
  }));

export const normalizeAttemptReviewTopicsWithQuestionMap = (
  review: AttemptReview[],
  subject: string,
  questionTopicMap: Map<string, string>,
): AttemptReview[] =>
  review.map((row) => ({
    ...row,
    topic: normalizeTopicLabel(questionTopicMap.get(row.qid) || row.topic, row.question, subject),
  }));

export const summarizeAttemptWeakTopics = (review: AttemptReview[], subject: string, threshold = 0.6) => {
  const grouped = new Map<string, { total: number; correct: number }>();

  for (const row of normalizeAttemptReviewTopics(review, subject)) {
    const topic = row.topic || "General";
    const entry = grouped.get(topic) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (row.isCorrect) entry.correct += 1;
    grouped.set(topic, entry);
  }

  return Array.from(grouped.entries())
    .map(([topic, stats]) => ({
      topic,
      accuracy: stats.total ? stats.correct / stats.total : 0,
      total: stats.total,
    }))
    .filter((entry) => entry.accuracy < threshold)
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
};
