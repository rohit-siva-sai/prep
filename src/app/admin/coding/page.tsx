"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiTrash2 } from "react-icons/fi";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import {
  createCodingTrack,
  deleteCodingTrack,
  listAllCodingAttempts,
  listCodingTracks,
} from "@/lib/data-service";
import { callGemini } from "@/lib/gemini-client";
import { confirmToast, notify } from "@/lib/toast";
import { CodingAttempt, CodingTrack } from "@/types/models";

const parseGeneratedTrack = (raw: string) => {
  const parsed = JSON.parse(raw) as Partial<CodingTrack>;
  if (
    !parsed.title ||
    !parsed.roleName ||
    !parsed.topics ||
    !parsed.difficulty ||
    !parsed.durationMinutes ||
    !parsed.language ||
    !parsed.prompt ||
    !parsed.starterCode ||
    !parsed.functionName ||
    !parsed.sampleTests?.length ||
    !parsed.evaluationCriteria ||
    !parsed.expectedSignals
  ) {
    throw new Error("Generated coding track is missing required fields.");
  }
  return parsed as Omit<CodingTrack, "id" | "createdAt" | "createdBy">;
};

const difficultyOptions = ["Beginner", "Easy", "Medium", "Hard", "Advanced", "Expert"];
const languageOptions = ["JavaScript", "TypeScript", "Python", "C", "C++", "Java"];
const durationOptions = [20, 30, 45, 60, 90];
const cppStarterHint = `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int maxSubarraySum(vector<int>& nums, int k) {
        
    }
};`;
const defaultSampleTestsText = JSON.stringify(
  [
    { id: "T1", input: "[5]", expected: "5" },
    { id: "T2", input: "[1, 2, 3]", expected: "6" },
    { id: "T3", input: "[0, 0, 0, 0]", expected: "0" },
    { id: "T4", input: "[10, -2, 8, 4]", expected: "20" },
    { id: "T5", input: "[100, 200, 300, 400, 500]", expected: "1500" },
    { id: "T6", input: "[-5, -4, -3, -2]", expected: "-14" },
    { id: "T7", input: "[1, 1, 1, 1, 1, 1, 1, 1]", expected: "8" },
    { id: "T8", input: "[999999, 1, -1, 2, -2]", expected: "999999" },
  ],
  null,
  2,
);
const sampleTestHint =
  'Add 8-10 sample tests ordered from simple to harder. Use JSON-friendly input like [1,2,3] for one array and {"args":[[1,2,3],3]} for multiple arguments.';
const sampleTestPlaceholder =
  '[{"id":"T1","input":"[1,2,3]","expected":"6"},{"id":"T2","input":"{\\"args\\":[[1,2,3,4],3]}","expected":"12"}]';

const parseSampleTests = (value: string) => {
  const parsed = JSON.parse(value) as Array<{
    id?: string;
    input?: unknown;
    expected?: unknown;
    output?: unknown;
    expectedOutput?: unknown;
    args?: unknown;
    case?: unknown;
  }>;
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Add at least one sample test.");
  return parsed.map((entry, index) => {
    const rawInput =
      entry.input ?? entry.args ?? (entry.case && typeof entry.case === "object" ? (entry.case as { input?: unknown }).input : undefined);
    const rawExpected =
      entry.expected ??
      entry.output ??
      entry.expectedOutput ??
      (entry.case && typeof entry.case === "object"
        ? (entry.case as { expected?: unknown; output?: unknown }).expected ??
          (entry.case as { expected?: unknown; output?: unknown }).output
        : undefined);

    if (rawInput === undefined || rawExpected === undefined) {
      throw new Error(`Sample test ${index + 1} is missing input or expected.`);
    }
    return {
      id:
        typeof entry.id === "string"
          ? entry.id.trim() || `T${index + 1}`
          : entry.id != null
            ? String(entry.id)
            : `T${index + 1}`,
      input:
        typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput),
      expected:
        typeof rawExpected === "string" ? rawExpected : JSON.stringify(rawExpected),
    };
  });
};

const toText = (value: unknown) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (value == null) return "";
  return String(value);
};

export default function AdminCodingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tracks, setTracks] = useState<CodingTrack[]>([]);
  const [attempts, setAttempts] = useState<CodingAttempt[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateStage, setGenerateStage] = useState("");
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [saveStage, setSaveStage] = useState("");
  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [generatedPreview, setGeneratedPreview] = useState("");
  const [shared, setShared] = useState({
    title: "",
    roleName: "",
    topics: "",
    difficulty: "Medium",
    durationMinutes: 45,
    language: "C++",
    apiKey: "",
    prompt: "",
    starterCode: cppStarterHint,
    functionName: "",
    sampleTestsText: defaultSampleTestsText,
    evaluationCriteria: "",
    expectedSignals: "",
  });

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.replace("/dashboard");
  }, [loading, user, router]);

  const refresh = async () => {
    const [trackData, attemptData] = await Promise.all([listCodingTracks(), listAllCodingAttempts()]);
    setTracks(trackData);
    setAttempts(attemptData);
  };

  useEffect(() => {
    if (user?.role === "admin") refresh();
  }, [user]);

  useEffect(() => {
    if (!msg) return;
    notify.success(msg);
    setMsg("");
  }, [msg]);

  useEffect(() => {
    if (!err) return;
    notify.error(err);
    setErr("");
  }, [err]);

  const stats = useMemo(
    () => ({
      tracks: tracks.length,
      attempts: attempts.length,
      avgScore: attempts.length
        ? `${(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length).toFixed(1)}%`
        : "-",
    }),
    [attempts, tracks.length],
  );

  const persistTrack = async (payload: Omit<CodingTrack, "id" | "createdAt">) => {
    await createCodingTrack(payload);
    await refresh();
  };

  const generateWithAI = async (event: FormEvent) => {
    event.preventDefault();
    if (!shared.roleName.trim() || !shared.topics.trim()) {
      setErr("Enter at least role and topics before generating.");
      return;
    }
    setIsGenerating(true);
    setGenerateStage("Preparing coding track request...");
    try {
      setGenerateStage("Generating problem, rubric, and sample tests...");
      const data = await callGemini<{ raw: string }>("generate_coding_track", {
        roleName: shared.roleName,
        topics: shared.topics,
        difficulty: shared.difficulty,
        language: shared.language,
        durationMinutes: shared.durationMinutes,
        apiKey: shared.apiKey.trim(),
      });
      const generated = parseGeneratedTrack(data.raw);
      setShared((prev) => ({
        ...prev,
        title: toText(generated.title),
        roleName: toText(generated.roleName),
        topics: toText(generated.topics),
        difficulty: toText(generated.difficulty),
        durationMinutes: generated.durationMinutes,
        language: toText(generated.language),
        prompt: toText(generated.prompt),
        starterCode: toText(generated.starterCode),
        functionName: toText(generated.functionName),
        sampleTestsText: JSON.stringify(generated.sampleTests, null, 2),
        evaluationCriteria: toText(generated.evaluationCriteria),
        expectedSignals: toText(generated.expectedSignals),
      }));
      setGenerateStage("Loading generated draft into the studio...");
      setGeneratedPreview(data.raw);
      setMsg("AI coding track draft generated. Review and save when ready.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to generate coding track.");
    } finally {
      setIsGenerating(false);
      setGenerateStage("");
    }
  };

  const createManual = async (event: FormEvent) => {
    event.preventDefault();
    setIsCreatingManual(true);
    setSaveStage("Validating coding track fields...");
    try {
      const normalized = {
        title: toText(shared.title).trim(),
        roleName: toText(shared.roleName).trim(),
        topics: toText(shared.topics).trim(),
        prompt: toText(shared.prompt).trim(),
        starterCode: toText(shared.starterCode),
        functionName: toText(shared.functionName).trim(),
        evaluationCriteria: toText(shared.evaluationCriteria).trim(),
        expectedSignals: toText(shared.expectedSignals).trim(),
        language: toText(shared.language),
        difficulty: toText(shared.difficulty),
      };
      if (
        !normalized.title ||
        !normalized.roleName ||
        !normalized.topics ||
        !normalized.prompt ||
        !normalized.starterCode.trim() ||
        !normalized.functionName ||
        !normalized.evaluationCriteria ||
        !normalized.expectedSignals
      ) {
        throw new Error("Fill every coding track field before saving.");
      }
      setSaveStage("Parsing sample tests and runner metadata...");
      const sampleTests = parseSampleTests(shared.sampleTestsText);
      setSaveStage("Saving coding track...");
      await persistTrack({
        title: normalized.title,
        roleName: normalized.roleName,
        topics: normalized.topics,
        difficulty: normalized.difficulty,
        durationMinutes: Number(shared.durationMinutes),
        language: normalized.language,
        prompt: normalized.prompt,
        starterCode: normalized.starterCode,
        functionName: normalized.functionName,
        sampleTests,
        evaluationCriteria: normalized.evaluationCriteria,
        expectedSignals: normalized.expectedSignals,
        createdBy: user!.username,
      });
      setMsg("Coding track saved.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to save coding track.");
    } finally {
      setIsCreatingManual(false);
      setSaveStage("");
    }
  };

  const onDeleteTrack = async (trackId: string) => {
    if (deletingTrackId) return;
    const confirmed = await confirmToast(
      "Delete this coding track?",
      "This removes the coding track and all linked student coding results.",
    );
    if (!confirmed) return;
    setDeletingTrackId(trackId);
    try {
      await deleteCodingTrack(trackId);
      await refresh();
      setMsg("Coding track deleted.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to delete coding track.");
    } finally {
      setDeletingTrackId(null);
    }
  };

  if (!user || user.role !== "admin") return null;

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          actions={[
            { href: "/admin/exams", label: "Exam Admin" },
            { href: "/admin/interviews", label: "Interview Admin" },
            { href: "/coding", label: "Coding Tracks" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
          subtitle="Administrator"
          title="Coding Track Studio"
        />

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <StatCard label="Tracks" tone="cyan" value={stats.tracks} />
          <StatCard label="Attempts" tone="emerald" value={stats.attempts} />
          <StatCard label="Avg Score" tone="amber" value={stats.avgScore} />
        </section>

        <Panel className="mt-6 border-cyan-300/25 bg-cyan-500/10">
          <h2 className="font-display text-2xl">Generate Coding Track By Topic</h2>
          <p className="mt-2 text-sm text-slate-300">
            This works like exam admin, but produces interview-style coding challenges with starter code and a scoring rubric.
            The API key is optional. If you leave it empty, the server-side key is used.
          </p>
          <form className="mt-4 grid gap-3" onSubmit={generateWithAI}>
            <input
              className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2"
              onChange={(e) => setShared((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder="Gemini API key(s) optional: comma or newline separated"
              type="password"
              value={shared.apiKey}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, roleName: e.target.value }))} placeholder="Role name" value={shared.roleName} />
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, topics: e.target.value }))} placeholder="Topics like arrays, recursion, SQL, APIs" value={shared.topics} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <select className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, difficulty: e.target.value }))} value={shared.difficulty}>
                {difficultyOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, language: e.target.value }))} value={shared.language}>
                {languageOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, durationMinutes: Number(e.target.value) }))} value={shared.durationMinutes}>
                {durationOptions.map((option) => <option key={option} value={option}>{option} minutes</option>)}
              </select>
            </div>
            <button className="rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-2 font-semibold text-slate-900 disabled:opacity-70" disabled={isGenerating}>
              {isGenerating ? "Generating..." : "Generate Coding Track"}
            </button>
          </form>
          {isGenerating ? (
            <div className="mt-4 rounded-xl border border-cyan-300/30 bg-slate-900/45 p-3">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-300" />
                <span className="h-5 w-5 animate-spin rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#34d399,#22d3ee)] opacity-80" />
                <p className="text-sm text-cyan-100">{generateStage || "Working..."}</p>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-800">
                <div className="h-2 w-2/3 animate-pulse rounded bg-gradient-to-r from-cyan-400 to-emerald-400" />
              </div>
            </div>
          ) : null}
          {generatedPreview ? (
            <textarea className="mt-4 min-h-40 w-full rounded-lg border border-white/20 bg-slate-950/70 px-3 py-2 font-mono text-xs" onChange={(e) => setGeneratedPreview(e.target.value)} value={generatedPreview} />
          ) : null}
        </Panel>

        <Panel className="mt-6">
          <h2 className="font-display text-2xl">Review And Save Track</h2>
          <form className="mt-4 grid gap-3" onSubmit={createManual}>
            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, title: e.target.value }))} placeholder="Track title" value={shared.title} />
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, roleName: e.target.value }))} placeholder="Role name" value={shared.roleName} />
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, topics: e.target.value }))} placeholder="Topics" value={shared.topics} />
              <select className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, difficulty: e.target.value }))} value={shared.difficulty}>
                {difficultyOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, language: e.target.value }))} value={shared.language}>
                {languageOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, durationMinutes: Number(e.target.value) }))} value={shared.durationMinutes}>
                {durationOptions.map((option) => <option key={option} value={option}>{option} minutes</option>)}
              </select>
            </div>
            <textarea className="min-h-48 rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, prompt: e.target.value }))} placeholder="Coding prompt" value={shared.prompt} />
            <textarea className="min-h-48 rounded-lg border border-white/20 bg-slate-950/80 px-3 py-2 font-mono text-xs" onChange={(e) => setShared((prev) => ({ ...prev, starterCode: e.target.value }))} placeholder="Starter code" value={shared.starterCode} />
            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, functionName: e.target.value }))} placeholder="Function name for test execution" value={shared.functionName} />
              <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-sm text-slate-300">
                {sampleTestHint}
              </div>
            </div>
            <textarea className="min-h-40 rounded-lg border border-white/20 bg-slate-950/80 px-3 py-2 font-mono text-xs" onChange={(e) => setShared((prev) => ({ ...prev, sampleTestsText: e.target.value }))} placeholder={sampleTestPlaceholder} value={shared.sampleTestsText} />
            <textarea className="min-h-24 rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, evaluationCriteria: e.target.value }))} placeholder="Evaluation criteria" value={shared.evaluationCriteria} />
            <textarea className="min-h-24 rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" onChange={(e) => setShared((prev) => ({ ...prev, expectedSignals: e.target.value }))} placeholder="Expected strong-solution signals" value={shared.expectedSignals} />
            <button className="rounded-xl bg-gradient-to-r from-amber-300 to-emerald-300 py-2 font-semibold text-slate-900 disabled:opacity-70" disabled={isCreatingManual}>
              {isCreatingManual ? "Saving..." : "Save Coding Track"}
            </button>
          </form>
          {isCreatingManual ? (
            <div className="mt-4 rounded-xl border border-amber-300/30 bg-slate-900/45 p-3">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200/30 border-t-amber-200" />
                <span className="h-5 w-5 animate-spin rounded-full bg-[conic-gradient(from_0deg,#fbbf24,#34d399,#fbbf24)] opacity-80" />
                <p className="text-sm text-amber-100">{saveStage || "Saving coding track..."}</p>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-800">
                <div className="h-2 w-1/2 animate-pulse rounded bg-gradient-to-r from-amber-300 to-emerald-300" />
              </div>
            </div>
          ) : null}
        </Panel>

        <Panel className="mt-6 overflow-x-auto">
          <h2 className="font-display text-xl">Current Coding Tracks</h2>
          <table className="mt-3 min-w-[920px] w-full text-left">
            <thead className="text-xs uppercase tracking-[0.12em] text-slate-300">
              <tr>
                <th className="py-2">Title</th>
                <th className="py-2">Role</th>
                <th className="py-2">Topics</th>
                <th className="py-2">Difficulty</th>
                <th className="py-2">Language</th>
                <th className="py-2">Duration</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <tr className="border-t border-white/10" key={track.id}>
                  <td className="py-2">{track.title}</td>
                  <td className="py-2">{track.roleName}</td>
                  <td className="py-2 text-sm">{track.topics}</td>
                  <td className="py-2">{track.difficulty}</td>
                  <td className="py-2">{track.language}</td>
                  <td className="py-2">{track.durationMinutes} min</td>
                  <td className="py-2">
                    <button aria-label="Delete coding track" className="inline-flex items-center justify-center rounded-lg bg-red-500/90 p-2 text-lg text-white hover:bg-red-500 disabled:opacity-60" disabled={Boolean(deletingTrackId)} onClick={() => onDeleteTrack(track.id!)} type="button">
                      {deletingTrackId === track.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <FiTrash2 />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </main>
  );
}
