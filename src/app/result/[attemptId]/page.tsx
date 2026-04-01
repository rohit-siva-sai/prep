"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppBackground, Panel, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { getAttempt } from "@/lib/data-service";
import { summarizeAttemptWeakTopics } from "@/lib/exam-topics";
import { ExamAttempt } from "@/types/models";
import { formatDate, formatPercent } from "@/lib/utils";

export default function ResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!attemptId || !user) return;
    const load = async () => {
      const data = await getAttempt(attemptId);
      if (!data || data.username !== user.username) {
        router.replace("/history");
        return;
      }
      setAttempt(data);
    };
    load();
  }, [attemptId, user, router]);

  const gauge = useMemo(() => Math.round(attempt?.percent ?? 0), [attempt]);
  const improvementTopics = useMemo(
    () => (attempt ? summarizeAttemptWeakTopics(attempt.review, attempt.testName) : []),
    [attempt],
  );

  if (!attempt || !user) return null;

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">{attempt.testId}</p>
            <h1 className="font-display text-3xl md:text-4xl">{attempt.testName}</h1>
          </div>
          <button
            className="rounded-xl border border-white/20 px-4 py-2 hover:bg-white/10"
            onClick={() => router.push("/dashboard")}
            type="button"
          >
            Dashboard
          </button>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-[220px_1fr]">
          <Panel className="flex flex-col items-center justify-center">
            <div
              className="grid h-36 w-36 place-items-center rounded-full"
              style={{
                background: `conic-gradient(${attempt.passed ? "#34d399" : "#f87171"} ${gauge}%, rgba(148,163,184,0.18) 0)`,
              }}
            >
              <div className="grid h-28 w-28 place-items-center rounded-full bg-slate-950">
                <p className="font-display text-2xl">{gauge}%</p>
              </div>
            </div>
            <p className={`mt-3 text-sm ${attempt.passed ? "text-emerald-300" : "text-red-300"}`}>
              {attempt.passed ? "PASS" : "FAIL"}
            </p>
          </Panel>

          <Panel>
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Score" tone="cyan" value={`${attempt.score}/${attempt.total}`} />
              <StatCard label="Accuracy" tone="emerald" value={formatPercent(attempt.percent, 2)} />
              <StatCard label="Pass Cutoff" tone="blue" value={`${attempt.passPercent}%`} />
              <StatCard
                label="Time Spent"
                tone="amber"
                value={`${Math.floor((attempt.endTs - attempt.startTs) / 1000)}s`}
              />
            </div>
            <div className="mt-4 text-sm text-slate-300">
              <p>
                <span className="text-slate-400">Started:</span> {formatDate(attempt.startTs)}
              </p>
              <p>
                <span className="text-slate-400">Submitted:</span> {formatDate(attempt.endTs)}
              </p>
              <p>
                <span className="text-slate-400">Attempt ID:</span>{" "}
                <span className="font-mono text-xs">{attempt.id}</span>
              </p>
            </div>
          </Panel>
        </section>

        <Panel className="mt-6 border-amber-300/25 bg-amber-500/10">
          <h2 className="font-display text-2xl">Topics To Improve</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {improvementTopics.length === 0 ? (
              <p className="text-sm text-slate-200">
                No weak topic was detected in this attempt. Keep practicing the same topics consistently.
              </p>
            ) : (
              improvementTopics.map((entry) => (
                <div
                  className="rounded-2xl border border-amber-300/30 bg-slate-950/40 px-4 py-3"
                  key={`${entry.topic}-${entry.total}`}
                >
                  <p className="font-semibold text-amber-100">{entry.topic}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-amber-200">
                    Accuracy {(entry.accuracy * 100).toFixed(0)}% in this test
                  </p>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel className="mt-6">
          <h2 className="font-display text-2xl">Answer Audit</h2>
          <div className="mt-4 grid gap-3">
            {attempt.review.map((row) => (
              <article
                className={`rounded-xl border p-4 ${
                  row.isCorrect
                    ? "border-emerald-400/30 bg-emerald-500/10"
                    : "border-red-400/30 bg-red-500/10"
                }`}
                key={row.qid}
              >
                <p className="font-medium">{row.qid}. {row.question}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-cyan-200">
                  Topic: {row.topic || "General"}
                </p>
                <p className={`mt-2 text-sm ${row.isCorrect ? "text-emerald-200" : "text-red-200"}`}>
                  Your answer: {row.selected >= 0 ? row.options[row.selected] : "Not answered"}
                </p>
                <p className="text-sm text-cyan-200">Correct answer: {row.options[row.correct]}</p>
              </article>
            ))}
          </div>
        </Panel>
      </div>
    </main>
  );
}
