"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { analyzePerformance, buildPredictionPayload } from "@/lib/prediction-client";
import {
  listAttemptsByUser,
  listInterviewResultsByUser,
  listInterviewSessionsByUser,
} from "@/lib/data-service";
import { notify } from "@/lib/toast";
import { formatDate, formatPercent } from "@/lib/utils";
import { ExamAttempt, InterviewResult, InterviewSession } from "@/types/models";
import { PredictionMode, PredictionResponse } from "@/types/prediction";

const chooseBestExamAttempts = (rows: ExamAttempt[]) => {
  const bestByTestId = new Map<string, ExamAttempt>();
  for (const attempt of rows) {
    const current = bestByTestId.get(attempt.testId);
    if (
      !current ||
      attempt.percent > current.percent ||
      (attempt.percent === current.percent && attempt.score > current.score) ||
      (attempt.percent === current.percent && attempt.score === current.score && attempt.endTs > current.endTs)
    ) {
      bestByTestId.set(attempt.testId, attempt);
    }
  }
  return Array.from(bestByTestId.values()).sort((a, b) => b.endTs - a.endTs);
};

const chooseBestInterviewResults = (rows: InterviewResult[], sessions: InterviewSession[]) => {
  const sessionById = new Map(sessions.map((session) => [session.id, session] as const));
  const bestByInterviewId = new Map<string, InterviewResult>();
  for (const result of rows) {
    const session = sessionById.get(result.sessionId);
    const key = session?.interviewId || session?.interviewTitle || result.sessionId;
    const current = bestByInterviewId.get(key);
    if (
      !current ||
      result.overall > current.overall ||
      (result.overall === current.overall && result.technical > current.technical) ||
      (result.overall === current.overall &&
        result.technical === current.technical &&
        result.createdAt > current.createdAt)
    ) {
      bestByInterviewId.set(key, result);
    }
  }
  return Array.from(bestByInterviewId.values()).sort((a, b) => b.createdAt - a.createdAt);
};

const modeLabels: Record<PredictionMode, string> = {
  combined: "Combined AI Analysis",
  test: "Test Prediction",
  interview: "Interview Prediction",
};

const modeButtonStyles: Record<PredictionMode, string> = {
  combined:
    "rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-3 font-semibold text-slate-900 hover:brightness-110",
  interview:
    "rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-emerald-100 hover:bg-emerald-500/20",
  test: "rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-4 py-3 text-cyan-100 hover:bg-cyan-500/20",
};

type PredictionWorkspaceProps = {
  title: string;
  subtitle: string;
  initialMode: PredictionMode;
  allowedModes: PredictionMode[];
  navActions?: Array<{ href: string; label: string; danger?: boolean }>;
  showExamSelector: boolean;
  showInterviewSelector: boolean;
};

export function PredictionWorkspace({
  title,
  subtitle,
  initialMode,
  allowedModes,
  navActions,
  showExamSelector,
  showInterviewSelector,
}: PredictionWorkspaceProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [interviewResults, setInterviewResults] = useState<InterviewResult[]>([]);
  const [interviewSessions, setInterviewSessions] = useState<InterviewSession[]>([]);
  const [mode, setMode] = useState<PredictionMode>(initialMode);
  const [selectedAttemptIds, setSelectedAttemptIds] = useState<string[]>([]);
  const [selectedInterviewIds, setSelectedInterviewIds] = useState<string[]>([]);
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [attemptRows, resultRows, sessionRows] = await Promise.all([
        listAttemptsByUser(user.username),
        listInterviewResultsByUser(user.username),
        listInterviewSessionsByUser(user.username),
      ]);
      setInterviewSessions(sessionRows);
      const bestAttempts = chooseBestExamAttempts(attemptRows);
      const bestInterviewResults = chooseBestInterviewResults(resultRows, sessionRows);
      setAttempts(bestAttempts);
      setSelectedAttemptIds(bestAttempts.map((attempt) => attempt.id));
      setInterviewResults(bestInterviewResults);
      setSelectedInterviewIds(bestInterviewResults.map((result) => result.sessionId));
    };
    load();
  }, [user]);

  const selectedAttempts = useMemo(
    () => attempts.filter((attempt) => selectedAttemptIds.includes(attempt.id)),
    [attempts, selectedAttemptIds],
  );

  const selectedInterviewResults = useMemo(
    () => interviewResults.filter((result) => selectedInterviewIds.includes(result.sessionId)),
    [interviewResults, selectedInterviewIds],
  );

  const allAttemptsSelected = attempts.length > 0 && selectedAttemptIds.length === attempts.length;
  const allInterviewsSelected =
    interviewResults.length > 0 && selectedInterviewIds.length === interviewResults.length;

  const payloadPreview = useMemo(() => {
    if (!user) return null;
    return buildPredictionPayload({
      user,
      attempts: selectedAttempts,
      interviewResults: selectedInterviewResults,
      mode,
    });
  }, [mode, selectedAttempts, selectedInterviewResults, user]);

  const handleAnalyze = async (nextMode: PredictionMode) => {
    if (!user) return;
    if (nextMode !== "interview" && selectedAttempts.length === 0) {
      notify.error("Select at least one test attempt to include in the analysis.");
      return;
    }
    if (nextMode !== "test" && selectedInterviewResults.length === 0) {
      notify.error("Select at least one interview result to include in the analysis.");
      return;
    }
    try {
      setMode(nextMode);
      setLoadingPrediction(true);
      const payload = buildPredictionPayload({
        user,
        attempts: selectedAttempts,
        interviewResults: selectedInterviewResults,
        mode: nextMode,
      });
      const response = await analyzePerformance(payload);
      setPrediction(response);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to analyze performance.");
    } finally {
      setLoadingPrediction(false);
    }
  };

  const coverageStats = useMemo(
    () => ({
      examSignals: selectedAttempts.reduce((sum, attempt) => sum + attempt.review.length, 0),
      interviewSignals: selectedInterviewResults.length,
      mode: modeLabels[mode],
    }),
    [selectedAttempts, selectedInterviewResults.length, mode],
  );

  const weakTopics = useMemo(
    () => Array.from(new Set(prediction?.weak_topics ?? [])),
    [prediction?.weak_topics],
  );

  const strongTopics = useMemo(
    () => Array.from(new Set(prediction?.strong_topics ?? [])),
    [prediction?.strong_topics],
  );

  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-8 md:py-10">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav title={title} subtitle={subtitle} actions={navActions} />

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <StatCard label="Exam Signals" tone="cyan" value={coverageStats.examSignals} />
          <StatCard label="Interview Signals" tone="emerald" value={coverageStats.interviewSignals} />
          <StatCard label="Focus Mode" tone="blue" value={coverageStats.mode} />
        </section>

        <Panel className="mt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Prediction Controls</p>
              <h2 className="mt-2 font-display text-2xl">
                {allowedModes.length > 1 ? "Choose an analysis mode" : "Run your analysis"}
              </h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-300">
                  {showInterviewSelector && showExamSelector
                    ? "Use interview-only analysis or run a combined view that blends interview feedback with selected test attempts."
                    : "Use your selected assessment history to call the hosted performance analysis service."}
                </p>
            </div>
            <div className={`grid gap-2 ${allowedModes.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {allowedModes.map((allowedMode) => (
                <button
                  className={modeButtonStyles[allowedMode]}
                  key={allowedMode}
                  onClick={() => handleAnalyze(allowedMode)}
                  type="button"
                >
                  {modeLabels[allowedMode]}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        {showExamSelector ? (
          <Panel className="mt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Choose Test Data</p>
                <h2 className="mt-2 font-display text-2xl">Select exam attempts for the API payload</h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-300">
                  Only the checked test attempts will be included in the data sent to the prediction API. If you took
                  the same test multiple times, only your highest-scoring attempt for that test is shown here.
                </p>
              </div>
              <button
                className="rounded-xl border border-white/20 px-4 py-3 text-sm text-slate-100 hover:bg-white/10"
                onClick={() =>
                  setSelectedAttemptIds(allAttemptsSelected ? [] : attempts.map((attempt) => attempt.id))
                }
                type="button"
              >
                {allAttemptsSelected ? "Clear All" : "Select All"}
              </button>
            </div>

            <div className="mt-5 max-h-[22rem] space-y-3 overflow-y-auto pr-2">
              {attempts.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
                  No exam attempts found yet. Complete a test first to include it here.
                </div>
              ) : (
                attempts.map((attempt) => {
                  const checked = selectedAttemptIds.includes(attempt.id);
                  return (
                    <label
                      className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition-colors ${
                        checked
                          ? "border-cyan-300/35 bg-cyan-500/10"
                          : "border-white/10 bg-slate-950/35 hover:bg-white/5"
                      }`}
                      key={attempt.id}
                    >
                      <input
                        checked={checked}
                        className="mt-1 h-4 w-4 accent-cyan-400"
                        onChange={() =>
                          setSelectedAttemptIds((current) =>
                            checked ? current.filter((id) => id !== attempt.id) : [...current, attempt.id],
                          )
                        }
                        type="checkbox"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-semibold text-slate-100">{attempt.testName}</p>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                              {attempt.testId}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                              attempt.passed
                                ? "bg-emerald-500/15 text-emerald-200"
                                : "bg-red-500/15 text-red-200"
                            }`}
                          >
                            {attempt.passed ? "Pass" : "Needs Work"}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
                          <p>
                            Score {attempt.score}/{attempt.total}
                          </p>
                          <p>Accuracy {formatPercent(attempt.percent, 1)}</p>
                          <p>Submitted {formatDate(attempt.endTs)}</p>
                          <p>Topics {new Set(attempt.review.map((row) => row.topic || "General")).size}</p>
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </Panel>
        ) : null}

        {showInterviewSelector ? (
          <Panel className="mt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-emerald-200">Choose Interview Data</p>
                <h2 className="mt-2 font-display text-2xl">Select interview reports for the API payload</h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-300">
                  Only the checked interview feedback reports will be included in the data sent to the
                  prediction API. If you completed the same interview track multiple times, only the highest-scoring
                  result for that track is shown here.
                </p>
              </div>
              <button
                className="rounded-xl border border-white/20 px-4 py-3 text-sm text-slate-100 hover:bg-white/10"
                onClick={() =>
                  setSelectedInterviewIds(
                    allInterviewsSelected ? [] : interviewResults.map((result) => result.sessionId),
                  )
                }
                type="button"
              >
                {allInterviewsSelected ? "Clear All" : "Select All"}
              </button>
            </div>

            <div className="mt-5 max-h-[22rem] space-y-3 overflow-y-auto pr-2">
              {interviewResults.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
                  No interview results found yet. Complete an interview first to include it here.
                </div>
              ) : (
                interviewResults.map((result) => {
                  const checked = selectedInterviewIds.includes(result.sessionId);
                  const session = interviewSessions.find((entry) => entry.id === result.sessionId);
                  return (
                    <label
                      className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition-colors ${
                        checked
                          ? "border-emerald-300/35 bg-emerald-500/10"
                          : "border-white/10 bg-slate-950/35 hover:bg-white/5"
                      }`}
                      key={result.sessionId}
                    >
                      <input
                        checked={checked}
                        className="mt-1 h-4 w-4 accent-emerald-400"
                        onChange={() =>
                          setSelectedInterviewIds((current) =>
                            checked
                              ? current.filter((id) => id !== result.sessionId)
                              : [...current, result.sessionId],
                          )
                        }
                        type="checkbox"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-semibold text-slate-100">
                              {session?.interviewTitle || session?.roleName || "Interview Result"}
                            </p>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                              {session?.roleName || result.sessionId}
                            </p>
                          </div>
                          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                            Overall {result.overall}%
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
                          <p>Technical {result.technical}%</p>
                          <p>Communication {result.communication}%</p>
                          <p>Confidence {result.confidence}%</p>
                          <p>
                            Feedback Blocks{" "}
                            {[
                              result.feedback,
                              result.improvementTopics,
                              result.improvementSubjects,
                              result.strengths,
                              result.weaknesses,
                              result.suggestions,
                            ].filter(Boolean).length}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </Panel>
        ) : null}

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Payload Preview</p>
                <h2 className="mt-2 font-display text-2xl">Student data sent to the API</h2>
              </div>
              {loadingPrediction ? (
                <div className="flex items-center gap-2 text-sm text-cyan-100">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-200/20 border-t-cyan-200" />
                  Analyzing
                </div>
              ) : null}
            </div>
            <pre className="mt-4 max-h-[28rem] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-xs leading-5 text-slate-200">
              {JSON.stringify(payloadPreview, null, 2)}
            </pre>
          </Panel>

          <Panel className="border-emerald-300/20 bg-emerald-500/10">
            <p className="text-xs uppercase tracking-[0.25em] text-emerald-200">Backend Connection</p>
            <h2 className="mt-2 font-display text-2xl">Performance API endpoint</h2>
            <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">
              Configure <code>PERFORMANCE_API_URL</code> on the deployment to point to your hosted analysis service.
              This app no longer falls back to a localhost backend.
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-100">
              <p>
                <code>POST /api/performance/analyze-performance</code>
              </p>
            </div>
            <p className="mt-4 text-sm text-slate-200">
              Gemini-powered app features continue to use the existing Next.js API routes separately.
            </p>
          </Panel>
        </section>

        {prediction ? (
          <>
            <section className="mt-6 grid gap-3 md:grid-cols-4">
              <StatCard label="Overall Score" tone="cyan" value={`${prediction.overall_performance_score}%`} />
              <StatCard
                label={mode === "interview" ? "Topics To Improve" : "Weak Topics"}
                tone="amber"
                value={weakTopics.length}
              />
              <StatCard label="Strong Topics" tone="emerald" value={strongTopics.length} />
              <StatCard
                label="Communication"
                tone="blue"
                value={`${prediction.feedback_scores.communication_score.toFixed(1)}%`}
              />
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <Panel>
                <h2 className="font-display text-2xl">Topic Performance Visualization</h2>
                <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-2">
                  {prediction.topic_metrics.length === 0 ? (
                    <p className="text-sm text-slate-300">No test data was included for this analysis mode.</p>
                  ) : (
                    prediction.topic_metrics.map((metric, index) => (
                      <div
                        className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                        key={`${metric.subject}-${metric.topic}-${index}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">{metric.topic}</p>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{metric.subject}</p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                              metric.is_weak ? "bg-red-500/15 text-red-200" : "bg-emerald-500/15 text-emerald-200"
                            }`}
                          >
                            {metric.is_weak ? "Needs Work" : "Stable"}
                          </span>
                        </div>
                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${metric.is_weak ? "bg-gradient-to-r from-rose-400 to-amber-300" : "bg-gradient-to-r from-cyan-400 to-emerald-400"}`}
                            style={{ width: `${Math.max(metric.accuracy * 100, 6)}%` }}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
                          <p>Accuracy: {(metric.accuracy * 100).toFixed(1)}%</p>
                          <p>Weakness Probability: {(metric.weakness_probability * 100).toFixed(1)}%</p>
                          <p>Attempts: {metric.attempts}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Panel>

              <div className="space-y-6">
                <Panel className="border-red-300/20 bg-red-500/10">
                  <h2 className="font-display text-xl">
                    {mode === "interview" ? "Topics To Improve" : "Weak Topics"}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {weakTopics.length ? (
                      weakTopics.map((topic, index) => (
                        <span
                          className="rounded-full bg-red-500/15 px-3 py-1 text-sm text-red-100"
                          key={`${topic}-${index}`}
                        >
                          {topic}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-slate-200">No weak topics were detected in this mode.</p>
                    )}
                  </div>
                </Panel>

                <Panel className="border-cyan-300/20 bg-cyan-500/10">
                  <h2 className="font-display text-xl">Communication Insights</h2>
                  <div className="mt-3 space-y-2 text-sm text-slate-100">
                    {prediction.communication_insights.map((item, index) => (
                      <p key={`${item}-${index}`}>{item}</p>
                    ))}
                    {prediction.feedback_scores.highlights.length ? (
                      <p className="text-xs uppercase tracking-[0.18em] text-cyan-100">
                        Highlights: {prediction.feedback_scores.highlights.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </Panel>
              </div>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <Panel>
                <h2 className="font-display text-xl">Suggested Improvement Areas</h2>
                <div className="mt-3 space-y-3">
                  {prediction.suggested_improvement_areas.map((item, index) => (
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3" key={`${item}-${index}`}>
                      {item}
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <h2 className="font-display text-xl">Personalized Learning Actions</h2>
                <div className="mt-3 space-y-3">
                  {prediction.generated_recommendations.map((item, index) => (
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3" key={`${item}-${index}`}>
                      {item}
                    </div>
                  ))}
                </div>
              </Panel>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
