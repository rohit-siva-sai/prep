"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { listAttemptsByUser, listTests } from "@/lib/data-service";
import { ExamAttempt, ExamTest } from "@/types/models";
import { formatPercent, minutesFromSeconds } from "@/lib/utils";

export default function ExamTracksPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tests, setTests] = useState<ExamTest[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [openingTestId, setOpeningTestId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [testsData, attemptsData] = await Promise.all([
        listTests(),
        listAttemptsByUser(user.username),
      ]);
      setTests(testsData);
      setAttempts(attemptsData);
    };
    load();
  }, [user]);

  const latestByTest = useMemo(() => {
    const map = new Map<string, ExamAttempt>();
    for (const attempt of attempts) {
      const existing = map.get(attempt.testId);
      if (!existing || attempt.endTs >= existing.endTs) map.set(attempt.testId, attempt);
    }
    return map;
  }, [attempts]);

  const orderedTests = useMemo(() => {
    const unattempted = tests.filter((t) => !latestByTest.has(t.id));
    const attempted = tests.filter((t) => latestByTest.has(t.id));
    return [...unattempted, ...attempted];
  }, [tests, latestByTest]);

  const stats = useMemo(
    () => ({
      tracks: tests.length,
      questionPool: tests.reduce((sum, test) => sum + test.questions.length, 0),
      attempts: attempts.length,
    }),
    [attempts.length, tests],
  );

  const openExam = async (testId: string) => {
    if (openingTestId) return;
    setOpeningTestId(testId);
    router.push(`/exam/${testId}`);
  };

  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-8 md:py-10">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          title="Available Exam Tracks"
          subtitle="Auto-submit enabled on timeout"
          actions={[
            ...(user.role === "admin" ? [{ href: "/admin/exams", label: "Exam Admin" }] : []),
            { href: "/coding", label: "Coding Tracks" },
            { href: "/interviews", label: "Interview Tracks" },
            { href: "/exam-predictor", label: "Test Predictor" },
            { href: "/interview-predictor", label: "Interview Predictor" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
        />

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <StatCard label="Tracks" tone="cyan" value={stats.tracks} />
          <StatCard label="Question Pool" tone="emerald" value={stats.questionPool} />
          <StatCard label="Attempts" tone="blue" value={stats.attempts} />
        </section>

        <section className="mt-8">
          <div className="grid gap-4 lg:grid-cols-3">
            {orderedTests.map((test) => {
              const latest = latestByTest.get(test.id);
              return (
                <article
                  className="rounded-2xl border border-white/15 bg-white/10 p-5 shadow-xl shadow-slate-950/30"
                  key={test.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">{test.id}</p>
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                        latest
                          ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-200"
                          : "border-amber-300/40 bg-amber-500/15 text-amber-200"
                      }`}
                    >
                      {latest ? "Attempted" : "Unattempted"}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-2xl">{test.name}</h3>
                  <p className="mt-2 min-h-12 text-slate-300">{test.tagline}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2">
                      <p className="text-[11px] text-slate-400">Questions</p>
                      <p className="font-semibold">{test.questions.length}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2">
                      <p className="text-[11px] text-slate-400">Minutes</p>
                      <p className="font-semibold">{minutesFromSeconds(test.durationSec)}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2">
                      <p className="text-[11px] text-slate-400">Pass</p>
                      <p className="font-semibold">{test.passPercent}%</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-300">
                    {latest
                      ? `Latest: ${formatPercent(latest.percent)} (${latest.passed ? "PASS" : "FAIL"})`
                      : "Priority: not attempted yet"}
                  </p>
                  <button
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-2 text-center font-semibold text-slate-900 hover:brightness-110 disabled:opacity-70"
                    disabled={Boolean(openingTestId)}
                    onClick={() => openExam(test.id)}
                    type="button"
                  >
                    {openingTestId === test.id ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                        Opening...
                      </>
                    ) : latest ? (
                      "Retake Track"
                    ) : (
                      "Start Track"
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
      {openingTestId ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-cyan-300/30 bg-slate-900 p-5 text-center">
            <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-300" />
            <p className="mt-3 text-cyan-100">Loading exam console...</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
