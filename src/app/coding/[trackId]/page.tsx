"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { addCodingAttempt, getCodingTrack, listCodingAttemptsByUser } from "@/lib/data-service";
import { callGemini } from "@/lib/gemini-client";
import { notify } from "@/lib/toast";
import { CodingAttempt, CodingTrack } from "@/types/models";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((mod) => mod.Editor), {
  ssr: false,
});

const monacoLanguageMap: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  c: "c",
  java: "java",
  "c++": "cpp",
  cpp: "cpp",
};

const parseEvaluation = (raw: string) => {
  const parsed = JSON.parse(raw) as {
    score?: number;
    strengths?: string;
    weaknesses?: string;
    suggestions?: string;
    evaluationSummary?: string;
  };
  return {
    score: Math.max(0, Math.min(100, Number(parsed.score ?? 0))),
    strengths: parsed.strengths || "No strengths returned.",
    weaknesses: parsed.weaknesses || "No weaknesses returned.",
    suggestions: parsed.suggestions || "No suggestions returned.",
    evaluationSummary: parsed.evaluationSummary || "No summary returned.",
  };
};

type SampleRunResult = {
  id: string;
  passed: boolean;
  actualOutput: string;
  expectedOutput: string;
  error?: string;
};

type SubmitExecutionResponse = {
  output: string;
  errors: string;
  executionTimeMs: number;
  results: SampleRunResult[];
};

export default function CodingWorkspacePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ trackId: string }>();
  const trackId = params.trackId;
  const [track, setTrack] = useState<CodingTrack | null>(null);
  const [attempts, setAttempts] = useState<CodingAttempt[]>([]);
  const [code, setCode] = useState("");
  const [explanation, setExplanation] = useState("");
  const [evaluationApiKey, setEvaluationApiKey] = useState("");
  const [sampleResults, setSampleResults] = useState<SampleRunResult[]>([]);
  const [executionOutput, setExecutionOutput] = useState("");
  const [executionErrors, setExecutionErrors] = useState("");
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [runStage, setRunStage] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState("");
  const [startedAt, setStartedAt] = useState<number>(Date.now());

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !trackId) return;
    const load = async () => {
      const [trackData, userAttempts] = await Promise.all([
        getCodingTrack(trackId),
        listCodingAttemptsByUser(user.username),
      ]);
      if (!trackData) {
        notify.error("Coding track not found.");
        router.replace("/coding");
        return;
      }
      setTrack(trackData);
      setCode(trackData.starterCode);
      setAttempts(userAttempts.filter((attempt) => attempt.trackId === trackId));
      setStartedAt(Date.now());
    };
    load();
  }, [router, trackId, user]);

  const latestAttempt = useMemo(() => {
    return attempts.reduce<CodingAttempt | null>(
      (latest, attempt) => (!latest || attempt.submittedAt > latest.submittedAt ? attempt : latest),
      null,
    );
  }, [attempts]);

  const minutesSpent = useMemo(() => Math.max(1, Math.floor((Date.now() - startedAt) / 60000)), [startedAt]);
  const passedCount = useMemo(() => sampleResults.filter((item) => item.passed).length, [sampleResults]);

  const runSampleTests = async () => {
    if (!track) return;
    if (!code.trim()) {
      notify.error("Add code before running sample tests.");
      return;
    }
    setIsRunning(true);
    setRunStage("Preparing code execution...");
    try {
      setRunStage("Running sample tests through the execution engine...");
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: track.language,
          functionName: track.functionName,
          code,
          tests: track.sampleTests,
        }),
      });
      const data = (await response.json()) as {
        ok: boolean;
        data?: SubmitExecutionResponse;
        error?: string;
      };
      if (!data.ok || !data.data) {
        throw new Error(data.error || "Failed to run sample tests.");
      }
      setSampleResults(data.data.results);
      setExecutionOutput(data.data.output);
      setExecutionErrors(data.data.errors);
      setExecutionTimeMs(data.data.executionTimeMs);
      setRunStage("Finalizing sample test results...");
      notify.success("Sample tests completed.");
    } catch (error) {
      setExecutionOutput("");
      setExecutionErrors(error instanceof Error ? error.message : "Failed to run sample tests.");
      setExecutionTimeMs(null);
      notify.error(error instanceof Error ? error.message : "Failed to run sample tests.");
    } finally {
      setIsRunning(false);
      setRunStage("");
    }
  };

  const submit = async () => {
    if (!user || !track) return;
    if (!code.trim()) {
      notify.error("Add code before submitting.");
      return;
    }
    setIsSubmitting(true);
    setSubmitStage("Preparing coding submission...");
    try {
      const testRunSummary = sampleResults.length
        ? `Passed ${passedCount} of ${sampleResults.length} sample tests.\n${sampleResults
            .map(
              (item) =>
                `${item.id}: ${item.passed ? "PASS" : "FAIL"} | expected=${item.expectedOutput} | actual=${item.actualOutput}${item.error ? ` | error=${item.error}` : ""}`,
            )
            .join("\n")}`
        : "No sample tests were run before submission.";
      setSubmitStage("Evaluating code, explanation, and sample-test summary...");
      const evaluation = await callGemini<{ raw: string }>("evaluate_code_submission", {
        title: track.title,
        roleName: track.roleName,
        topics: track.topics,
        difficulty: track.difficulty,
        language: track.language,
        prompt: track.prompt,
        evaluationCriteria: track.evaluationCriteria,
        expectedSignals: track.expectedSignals,
        explanation,
        code,
        apiKey: evaluationApiKey.trim(),
        testRunSummary,
      });
      const parsed = parseEvaluation(evaluation.raw);
      setSubmitStage("Saving evaluation result...");
      const saved: Omit<CodingAttempt, "id"> = {
        trackId: track.id!,
        trackTitle: track.title,
        roleName: track.roleName,
        topics: track.topics,
        difficulty: track.difficulty,
        language: track.language,
        prompt: track.prompt,
        studentUsername: user.username,
        studentName: user.fullName,
        code,
        explanation,
        score: parsed.score,
        strengths: parsed.strengths,
        weaknesses: parsed.weaknesses,
        suggestions: parsed.suggestions,
        evaluationSummary: parsed.evaluationSummary,
        testRunSummary,
        passedSampleTests: passedCount,
        totalSampleTests: sampleResults.length,
        sampleTestResults: sampleResults,
        status: "COMPLETED",
        startedAt,
        submittedAt: Date.now(),
      };
      const attemptId = await addCodingAttempt(saved);
      setSubmitStage("Opening coding result...");
      notify.success("Coding submission evaluated.");
      router.push(`/coding/result/${attemptId}`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to evaluate submission.");
    } finally {
      setIsSubmitting(false);
      setSubmitStage("");
    }
  };

  if (!user || !track) return null;

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          actions={[
            ...(user.role === "admin" ? [{ href: "/admin/coding", label: "Coding Admin" }] : []),
            { href: "/coding", label: "Coding Tracks" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
          subtitle={`${track.roleName} | ${track.language} | ${track.difficulty}`}
          title={track.title}
        />

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <StatCard label="Minutes" tone="cyan" value={track.durationMinutes} />
          <StatCard label="Sample Tests" tone="emerald" value={track.sampleTests.length} />
          <StatCard label="Time Spent" tone="blue" value={`${minutesSpent}m`} />
          <StatCard label="Latest Score" tone="amber" value={latestAttempt ? `${latestAttempt.score}%` : "-"} />
        </section>

        <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
          <Panel className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Problem</p>
              <h2 className="mt-2 font-display text-2xl">{track.title}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{track.prompt}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Runner Contract</p>
              <p className="mt-2 text-sm text-slate-300">
                Function name: <span className="font-mono">{track.functionName}</span>
              </p>
              <p className="mt-2 text-sm text-slate-300">
                Sample test execution is currently enabled for Python, JavaScript, C, and C++ tracks.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">Evaluation Focus</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{track.evaluationCriteria}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-amber-200">Sample Tests</p>
              <div className="mt-2 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {track.sampleTests.map((test) => (
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm" key={test.id}>
                    <p className="font-mono text-cyan-200">{test.id}</p>
                    <p className="mt-1 text-slate-300">input: {test.input}</p>
                    <p className="mt-1 text-slate-300">expected: {test.expected}</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel className="overflow-hidden p-0">
            <div className="border-b border-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Coding IDE</p>
              <p className="mt-1 text-sm text-slate-300">
                Monaco editor is enabled here. The run button calls `/api/submit` and shows output, errors, and execution time before evaluation.
              </p>
            </div>
            <MonacoEditor
              height="520px"
              language={monacoLanguageMap[track.language.toLowerCase()] || "javascript"}
              onChange={(value) => setCode(value || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                roundedSelection: false,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
              theme="vs-dark"
              value={code}
            />
            <div className="grid gap-3 border-t border-white/10 p-4">
              <input
                className="rounded-lg border border-white/20 bg-slate-950/80 px-3 py-2"
                onChange={(e) => setEvaluationApiKey(e.target.value)}
                placeholder="Gemini API key(s) for evaluation: comma or newline separated"
                type="password"
                value={evaluationApiKey}
              />
              <textarea
                className="min-h-32 rounded-lg border border-white/20 bg-slate-950/80 px-3 py-2"
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Explain your approach, time complexity, and key edge cases."
                value={explanation}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  className="rounded-xl border border-cyan-300/40 py-3 font-semibold text-cyan-100 hover:bg-cyan-500/15 disabled:opacity-70"
                  disabled={isRunning}
                  onClick={runSampleTests}
                  type="button"
                >
                  {isRunning ? "Running Tests..." : "Run Sample Tests"}
                </button>
                <button
                  className="rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-3 font-semibold text-slate-900 disabled:opacity-70"
                  disabled={isSubmitting}
                  onClick={submit}
                  type="button"
                >
                  {isSubmitting ? "Submitting..." : "Submit For Evaluation"}
                </button>
              </div>
              {isRunning ? (
                <div className="rounded-xl border border-cyan-300/30 bg-slate-900/45 p-3">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-300" />
                    <span className="h-5 w-5 animate-spin rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#34d399,#22d3ee)] opacity-80" />
                    <p className="text-sm text-cyan-100">{runStage || "Running sample tests..."}</p>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-800">
                    <div className="h-2 w-1/2 animate-pulse rounded bg-gradient-to-r from-cyan-400 to-emerald-400" />
                  </div>
                </div>
              ) : null}
              {isSubmitting ? (
                <div className="rounded-xl border border-emerald-300/30 bg-slate-900/45 p-3">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200/30 border-t-emerald-300" />
                    <span className="h-5 w-5 animate-spin rounded-full bg-[conic-gradient(from_0deg,#34d399,#22d3ee,#34d399)] opacity-80" />
                    <p className="text-sm text-emerald-100">{submitStage || "Evaluating submission..."}</p>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-800">
                    <div className="h-2 w-2/3 animate-pulse rounded bg-gradient-to-r from-emerald-400 to-cyan-400" />
                  </div>
                </div>
              ) : null}
            </div>
          </Panel>
        </div>

        {sampleResults.length ? (
          <Panel className="mt-6 border-cyan-300/25 bg-cyan-500/10">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl">Sample Test Results</h2>
              <p className="text-sm text-slate-200">
                {passedCount}/{sampleResults.length} passed
              </p>
            </div>
            <div className="mt-4 max-h-[34rem] overflow-y-auto pr-1 grid gap-3 md:grid-cols-2">
              {sampleResults.map((item) => (
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4" key={item.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-cyan-200">{item.id}</p>
                      <span className={item.passed ? "text-emerald-200" : "text-red-200"}>
                        {item.passed ? "PASS" : "FAIL"}
                      </span>
                    </div>
                  <div className="mt-2 max-h-36 overflow-y-auto space-y-1 pr-1 text-xs text-slate-300">
                    <p>Expected: {item.expectedOutput}</p>
                    <p>Actual: {item.actualOutput}</p>
                    {item.error ? <p className="text-red-200">Error: {item.error}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        {executionOutput || executionErrors || executionTimeMs !== null ? (
          <Panel className="mt-6">
            <h2 className="font-display text-xl">Execution Engine Response</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Output</p>
                <pre className="mt-2 h-40 overflow-auto whitespace-pre-wrap text-xs text-slate-200">{executionOutput || "-"}</pre>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-amber-200">Errors</p>
                <pre className="mt-2 h-40 overflow-auto whitespace-pre-wrap text-xs text-slate-200">{executionErrors || "-"}</pre>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">Execution Time</p>
                <p className="mt-2 text-sm text-slate-200">{executionTimeMs == null ? "-" : `${executionTimeMs} ms`}</p>
              </div>
            </div>
          </Panel>
        ) : null}
      </div>
    </main>
  );
}
