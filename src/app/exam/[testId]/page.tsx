"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppBackground, Panel } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { addAttempt, getTest } from "@/lib/data-service";
import { normalizeTopicLabel, summarizeAttemptWeakTopics } from "@/lib/exam-topics";
import { ExamTest } from "@/types/models";

type RuntimeState = {
  startTs: number;
  attemptId: string;
};

type SubmittedSummary = {
  attemptId: string;
  weakTopics: Array<{ topic: string; accuracy: number; total: number }>;
};

const keyFor = (testId: string) => `exam-runtime-${testId}`;

export default function ExamPage() {
  const { testId } = useParams<{ testId: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [test, setTest] = useState<ExamTest | null>(null);
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remaining, setRemaining] = useState(0);
  const [timerReady, setTimerReady] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSummary, setSubmittedSummary] = useState<SubmittedSummary | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!testId) return;
    const load = async () => {
      const data = await getTest(testId);
      if (!data) {
        router.replace("/dashboard");
        return;
      }
      setTest(data);

      const raw = window.sessionStorage.getItem(keyFor(testId));
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as RuntimeState;
          setRuntime(parsed);
        } catch {
          window.sessionStorage.removeItem(keyFor(testId));
        }
      }
    };
    load();
  }, [testId, router]);

  useEffect(() => {
    if (!runtime || !test) return;
    setTimerReady(false);
    const tick = () => {
      const now = Date.now();
      const left = Math.max(0, Math.floor((runtime.startTs + test.durationSec * 1000 - now) / 1000));
      setRemaining(left);
      setTimerReady(true);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [runtime, test]);

  const answeredCount = useMemo(() => new Set(Object.keys(answers)).size, [answers]);

  useEffect(() => {
    if (!runtime || !test || !user) return;
    if (!timerReady) return;
    if (remaining !== 0) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    submitExam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, runtime, test, user, timerReady]);

  const startExam = () => {
    if (!test) return;
    setIsStarting(true);
    const state = {
      startTs: Date.now(),
      attemptId: crypto.randomUUID(),
    } as RuntimeState;
    submittingRef.current = false;
    setRemaining(test.durationSec);
    setTimerReady(true);
    setRuntime(state);
    window.sessionStorage.setItem(keyFor(test.id), JSON.stringify(state));
    setTimeout(() => setIsStarting(false), 250);
  };

  const submitExam = async () => {
    if (!test || !runtime || !user) return;
    if (submittingRef.current && remaining !== 0) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    const review = test.questions.map((question) => {
      const selected = answers[question.id] ?? -1;
      const isCorrect = selected === question.answer;
      return {
        qid: question.id,
        topic: normalizeTopicLabel(question.topic, question.text, test.name),
        question: question.text,
        options: question.options,
        selected,
        correct: question.answer,
        isCorrect,
      };
    });

    const score = review.filter((row) => row.isCorrect).length;
    const total = review.length;
    const percent = total ? (score * 100) / total : 0;
    const submittedAt = Math.min(Date.now(), runtime.startTs + test.durationSec * 1000);

    const attemptId = await addAttempt({
      username: user.username,
      fullName: user.fullName,
      testId: test.id,
      testName: test.name,
      passPercent: test.passPercent,
      durationSec: test.durationSec,
      score,
      total,
      percent,
      passed: percent >= test.passPercent,
      startTs: runtime.startTs,
      endTs: submittedAt,
      answers,
      review,
    });

    window.sessionStorage.removeItem(keyFor(test.id));
    setSubmittedSummary({
      attemptId,
      weakTopics: summarizeAttemptWeakTopics(review, test.name),
    });
    setIsSubmitting(false);
  };

  if (!test || !user) return null;

  return (
    <main className="min-h-screen px-4 py-7">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">{test.id}</p>
            <h1 className="font-display text-3xl md:text-4xl">{test.name}</h1>
          </div>
          <button
            className="rounded-xl border border-white/20 px-4 py-2 hover:bg-white/10"
            onClick={() => router.push("/dashboard")}
            type="button"
          >
            Dashboard
          </button>
        </div>

        {!runtime ? (
          <Panel className="rounded-3xl p-7 md:p-9">
            <p className="text-slate-200">{test.tagline}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-cyan-100">Questions</p>
                <p className="text-2xl font-semibold">{test.questions.length}</p>
              </div>
              <div className="rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-emerald-100">Duration</p>
                <p className="text-2xl font-semibold">{Math.floor(test.durationSec / 60)} min</p>
              </div>
              <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-amber-100">Pass</p>
                <p className="text-2xl font-semibold">{test.passPercent}%</p>
              </div>
            </div>
            <button
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-7 py-3 font-semibold text-slate-900 hover:brightness-110 disabled:opacity-70"
              disabled={isStarting}
              onClick={startExam}
              type="button"
            >
              {isStarting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                  Starting...
                </>
              ) : (
                "Start Assessment"
              )}
            </button>
          </Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <Panel className="rounded-3xl p-5 md:p-6">
              <div className="sticky top-3 z-10 mb-4 flex items-center justify-between rounded-2xl border border-white/15 bg-slate-900/70 p-3 backdrop-blur">
                <p className="text-sm text-slate-300">Auto-submit when timer reaches zero</p>
                <p className="font-display text-2xl text-cyan-300">
                  {String(Math.floor(remaining / 60)).padStart(2, "0")}:
                  {String(remaining % 60).padStart(2, "0")}
                </p>
              </div>

              <div className="space-y-4">
                {test.questions.map((question, index) => (
                  <article className="rounded-2xl border border-white/15 bg-slate-900/45 p-4" id={`card-${index + 1}`} key={question.id}>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Question {index + 1}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-emerald-200">
                      {normalizeTopicLabel(question.topic, question.text, test.name)}
                    </p>
                    <p className="mt-1 text-lg font-medium">{question.text}</p>
                    <div className="mt-3 grid gap-2">
                      {question.options.map((option, optIndex) => (
                        <label
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 hover:bg-white/10"
                          key={option}
                        >
                          <input
                            checked={answers[question.id] === optIndex}
                            className="accent-emerald-400"
                            name={question.id}
                            onChange={() =>
                              setAnswers((prev) => ({
                                ...prev,
                                [question.id]: optIndex,
                              }))
                            }
                            type="radio"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </article>
                ))}
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 py-3 font-semibold text-slate-900 hover:brightness-110 disabled:opacity-70"
                  disabled={isSubmitting}
                  onClick={submitExam}
                  type="button"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Exam"
                  )}
                </button>
              </div>
            </Panel>

            <Panel className="h-fit rounded-3xl p-4 lg:sticky lg:top-6">
              <h2 className="font-display text-xl">Question Matrix</h2>
              <p className="mt-1 text-sm text-slate-300">
                {answeredCount} / {test.questions.length} answered
              </p>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {test.questions.map((question, i) => {
                  const attempted = answers[question.id] !== undefined;
                  return (
                    <button
                      aria-label={`Question ${i + 1}${attempted ? " (attempted)" : ""}`}
                      className={`rounded-lg border py-1 text-sm transition-colors ${
                        attempted
                          ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25"
                          : "border-white/20 text-slate-200 hover:bg-cyan-300/20"
                      }`}
                      key={question.id}
                      onClick={() =>
                        document.getElementById(`card-${i + 1}`)?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                      type="button"
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </Panel>
          </div>
        )}
      </div>
      {isSubmitting ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-emerald-300/30 bg-slate-900 p-5 text-center">
            <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-emerald-200/30 border-t-emerald-300" />
            <p className="mt-3 text-emerald-100">Calculating your result...</p>
          </div>
        </div>
      ) : null}
      {submittedSummary ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-amber-300/30 bg-slate-900 p-6 shadow-2xl shadow-slate-950/50">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-200">Submission Summary</p>
            <h2 className="mt-2 font-display text-3xl">Topics To Improve</h2>
            <p className="mt-2 text-sm text-slate-300">
              This quick summary is based only on the test you just submitted.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              {submittedSummary.weakTopics.length === 0 ? (
                <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-3 text-emerald-100">
                  No weak topics detected in this attempt.
                </div>
              ) : (
                submittedSummary.weakTopics.map((entry) => (
                  <div
                    className="rounded-2xl border border-amber-300/25 bg-amber-500/10 px-4 py-3"
                    key={`${entry.topic}-${entry.total}`}
                  >
                    <p className="font-semibold text-amber-100">{entry.topic}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-amber-200">
                      Accuracy {(entry.accuracy * 100).toFixed(0)}%
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                className="rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-5 py-3 font-semibold text-slate-900 hover:brightness-110"
                onClick={() => router.replace(`/result/${submittedSummary.attemptId}`)}
                type="button"
              >
                Open Full Result
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
