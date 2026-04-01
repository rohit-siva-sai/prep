"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { getCodingAttempt } from "@/lib/data-service";
import { notify } from "@/lib/toast";
import { CodingAttempt } from "@/types/models";

const toPoints = (value: unknown) =>
  (typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value.map((item) => String(item)).join("\n")
      : value == null
        ? ""
        : String(value))
    .split(/\r?\n|(?<=\.)\s+(?=[A-Z])|;\s*/)
    .map((item) => item.replace(/^[-*•\s]+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((item) => (item.length > 90 ? `${item.slice(0, 87)}...` : item))
    .slice(0, 6);

const PointList = ({
  points,
  tone,
}: {
  points: string[];
  tone: "cyan" | "emerald" | "amber";
}) => {
  const dotTone = {
    cyan: "bg-cyan-300",
    emerald: "bg-emerald-300",
    amber: "bg-amber-300",
  }[tone];

  return (
    <ul className="space-y-2 text-sm leading-6 text-slate-200">
      {points.map((point) => (
        <li className="flex items-start gap-2" key={point}>
          <span className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${dotTone}`} />
          <span className="line-clamp-3">{point}</span>
        </li>
      ))}
    </ul>
  );
};

export default function CodingResultPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ attemptId: string }>();
  const [attempt, setAttempt] = useState<CodingAttempt | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const data = await getCodingAttempt(params.attemptId);
      if (!data) {
        notify.error("Coding result not found.");
        router.replace("/coding");
        return;
      }
      if (data.studentUsername !== user.username && user.role !== "admin") {
        notify.error("You do not have access to this coding result.");
        router.replace("/coding");
        return;
      }
      setAttempt(data);
    };
    load();
  }, [params.attemptId, router, user]);

  if (!user || !attempt) return null;

  const summaryPoints = toPoints(attempt.evaluationSummary || "");
  const strengthPoints = toPoints(attempt.strengths || "");
  const weaknessPoints = toPoints(attempt.weaknesses || "");
  const suggestionPoints = toPoints(attempt.suggestions || "");
  const testRunPoints = toPoints(attempt.testRunSummary || "");

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          actions={[
            { href: "/coding", label: "Coding Tracks" },
            { href: `/coding/${attempt.trackId}`, label: "Retry Track" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
          subtitle={`${attempt.trackTitle} | ${attempt.language} | ${new Date(attempt.submittedAt).toLocaleString()}`}
          title="Coding Evaluation Result"
        />

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <StatCard label="Score" tone="cyan" value={`${attempt.score}%`} />
          <StatCard label="Passed Tests" tone="emerald" value={attempt.totalSampleTests ? `${attempt.passedSampleTests}/${attempt.totalSampleTests}` : "-"} />
          <StatCard label="Difficulty" tone="blue" value={attempt.difficulty} />
          <StatCard label="Language" tone="amber" value={attempt.language} />
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Panel className="min-h-80">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Summary</p>
            <div className="mt-3 max-h-40 overflow-y-auto pr-1">
              <PointList points={summaryPoints} tone="cyan" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-emerald-200">Strengths</p>
            <div className="mt-2 max-h-40 overflow-y-auto pr-1">
              <PointList points={strengthPoints} tone="emerald" />
            </div>
          </Panel>
          <Panel className="min-h-80">
            <p className="text-xs uppercase tracking-[0.22em] text-amber-200">Weaknesses</p>
            <div className="mt-3 max-h-40 overflow-y-auto pr-1">
              <PointList points={weaknessPoints} tone="amber" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-cyan-200">Suggestions</p>
            <div className="mt-2 max-h-40 overflow-y-auto pr-1">
              <PointList points={suggestionPoints} tone="cyan" />
            </div>
          </Panel>
          <Panel className="min-h-80">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">Sample Test Run</p>
            <div className="mt-3 max-h-72 overflow-y-auto pr-1">
              <PointList
                points={testRunPoints.length ? testRunPoints : ["No sample tests were run before submission."]}
                tone="emerald"
              />
            </div>
          </Panel>
        </div>

        {attempt.sampleTestResults?.length ? (
          <Panel className="mt-6">
            <h2 className="font-display text-xl">Executed Sample Tests</h2>
            <div className="mt-4 max-h-[34rem] overflow-y-auto pr-1 grid gap-3 md:grid-cols-2">
              {attempt.sampleTestResults.map((result) => (
                <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4" key={result.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-cyan-200">{result.id}</p>
                    <span className={result.passed ? "text-emerald-200" : "text-red-200"}>
                      {result.passed ? "PASS" : "FAIL"}
                    </span>
                  </div>
                  <div className="mt-2 max-h-44 overflow-y-auto space-y-1 pr-1 text-sm text-slate-300">
                    <p>Expected: {result.expectedOutput}</p>
                    <p>Actual: {result.actualOutput}</p>
                    {result.error ? <p className="text-red-200">Error: {result.error}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl">Submitted Code</h2>
            <Link className="rounded-lg border border-cyan-300/40 px-3 py-2 text-cyan-100 hover:bg-cyan-500/15" href={`/coding/${attempt.trackId}`}>
              Try Again
            </Link>
          </div>
          <pre className="mt-4 max-h-[40rem] overflow-auto rounded-xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-200">
            <code>{attempt.code}</code>
          </pre>
        </Panel>
      </div>
    </main>
  );
}
