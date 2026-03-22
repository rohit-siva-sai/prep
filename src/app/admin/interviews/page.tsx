"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { FiTrash2 } from "react-icons/fi";
import {
  createInterview,
  deleteInterview,
  listAllInterviewResults,
  listAllInterviewSessions,
  listInterviews,
  listUsers,
} from "@/lib/data-service";
import { callGemini } from "@/lib/gemini-client";
import { confirmToast, notify } from "@/lib/toast";
import { Interview } from "@/types/models";

const parseManualQuestions = (payload: string) =>
  payload
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\\t/g, "\t"))
    .map((line) => {
      const tab = line.split("\t");
      if ((tab[0]?.toUpperCase() === "IQ" || tab[0]?.toUpperCase() === "Q") && tab[2]) {
        return tab[2].trim();
      }
      const compact = line.replace(/^\d+[\).:-]?\s*/, "").replace(/^[-*]\s*/, "").trim();
      return compact;
    })
    .filter(Boolean);

export default function AdminInterviewsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiStage, setAiStage] = useState("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isImportingPaste, setIsImportingPaste] = useState(false);
  const [deletingInterviewId, setDeletingInterviewId] = useState<string | null>(null);
  const [perfRows, setPerfRows] = useState<Array<{ username: string; name: string; sessions: number; avg: number | null; best: number | null }>>([]);

  const [shared, setShared] = useState({
    title: "",
    roleName: "",
    topics: "",
    difficulty: "Medium",
    interviewType: "Mixed",
    questionCount: 6,
    durationMinutes: 20,
  });
  const [manualQuestions, setManualQuestions] = useState("");

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.replace("/dashboard");
  }, [loading, user, router]);

  const refresh = async () => {
    const [list, users, sessions, results] = await Promise.all([
      listInterviews(),
      listUsers(),
      listAllInterviewSessions(),
      listAllInterviewResults(),
    ]);
    setInterviews(list);

    const studentUsers = users.filter((u) => u.role === "student");
    const rows = studentUsers.map((u) => {
      const mineSessions = sessions.filter((s) => s.studentUsername === u.username);
      const mineResultScores = mineSessions
        .map((s) => results.find((r) => r.sessionId === s.id)?.overall)
        .filter((v): v is number => typeof v === "number");
      const avg = mineResultScores.length
        ? mineResultScores.reduce((sum, n) => sum + n, 0) / mineResultScores.length
        : null;
      const best = mineResultScores.length ? Math.max(...mineResultScores) : null;
      return {
        username: u.username,
        name: u.fullName,
        sessions: mineSessions.length,
        avg,
        best,
      };
    });
    setPerfRows(rows);
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

  const validateShared = () => {
    if (!shared.title.trim() || !shared.roleName.trim() || !shared.topics.trim()) {
      throw new Error("Enter title, role, and topics first.");
    }
  };

  const createWithAI = async (event: FormEvent) => {
    event.preventDefault();
    setIsGeneratingAI(true);
    setAiStage("Validating interview details...");
    try {
      validateShared();
      setErr("");
      setAiStage("Generating intro and blueprint with AI...");
      const [introResp, blueprintResp] = await Promise.all([
        callGemini<{ intro: string }>("intro", shared),
        callGemini<{ flow: string; followup: string; criteria: string }>("blueprint", shared),
      ]);

      setAiStage("Saving interview configuration...");
      await createInterview({
        ...shared,
        introMessage: introResp.intro,
        questionFlow: blueprintResp.flow,
        followupLogic: blueprintResp.followup,
        evaluationCriteria: blueprintResp.criteria,
        createdBy: user!.username,
        customQuestions: [],
      });
      setMsg("AI interview created successfully.");
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create interview.");
    } finally {
      setIsGeneratingAI(false);
      setAiStage("");
    }
  };

  const createWithPaste = async (event: FormEvent) => {
    event.preventDefault();
    setIsImportingPaste(true);
    try {
      validateShared();
      const questions = parseManualQuestions(manualQuestions);
      if (questions.length === 0) throw new Error("No valid question rows found.");
      const intro = `Welcome to your ${shared.roleName} interview. Please answer each question clearly and provide practical examples.`;
      await createInterview({
        ...shared,
        questionCount: questions.length,
        introMessage: intro,
        questionFlow: `Start with warm-up, then ${Math.max(1, questions.length - 2)} core questions and one reflective close.`,
        followupLogic: "If answer is vague, ask for example. If strong, ask deeper why/how.",
        evaluationCriteria: "Evaluate technical depth, clarity, relevance, and confidence.",
        createdBy: user!.username,
        customQuestions: questions,
      });
      setMsg(`Interview created via Prompt+Paste (${questions.length} questions).`);
      setManualQuestions("");
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create interview.");
    } finally {
      setIsImportingPaste(false);
    }
  };

  const promptText = useMemo(
    () =>
      [
        "Generate interview questions in STRICT tab-separated format only.",
        "No markdown or extra text.",
        `Interview Title: ${shared.title || "<Interview Title>"}`,
        `Role: ${shared.roleName || "<Role>"}`,
        `Topics: ${shared.topics || "<Topics>"}`,
        `Difficulty: ${shared.difficulty}`,
        `Interview Type: ${shared.interviewType}`,
        `Number of Questions: ${shared.questionCount}`,
        "",
        "Output format for each line:",
        "IQ\t<QuestionId>\t<QuestionText>",
      ].join("\n"),
    [shared],
  );

  const generatePromptUI = async () => {
    setIsGeneratingPrompt(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 450));
      setPrompt(promptText);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const onDeleteInterview = async (interviewId: string) => {
    if (deletingInterviewId) return;
    const confirmed = await confirmToast(
      "Delete this interview configuration?",
      "Existing session history will remain.",
    );
    if (!confirmed) return;
    setDeletingInterviewId(interviewId);
    setMsg("");
    setErr("");
    try {
      await deleteInterview(interviewId);
      setMsg("Interview deleted.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete interview.");
    } finally {
      setDeletingInterviewId(null);
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
            { href: "/admin/performance", label: "Student Performance" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
          subtitle="Administrator"
          title="AI Interview Studio"
        />

        <Panel className="mt-6 border-indigo-300/25 bg-indigo-500/10">
          <h2 className="font-display text-2xl">Interview Details (Shared)</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Interview title" value={shared.title} onChange={(e) => setShared((p) => ({ ...p, title: e.target.value }))} />
            <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Role" value={shared.roleName} onChange={(e) => setShared((p) => ({ ...p, roleName: e.target.value }))} />
            <textarea className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Topics / skills" value={shared.topics} onChange={(e) => setShared((p) => ({ ...p, topics: e.target.value }))} />
            <select className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" value={shared.difficulty} onChange={(e) => setShared((p) => ({ ...p, difficulty: e.target.value }))}>
              <option>Easy</option><option>Medium</option><option>Hard</option>
            </select>
            <select className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" value={shared.interviewType} onChange={(e) => setShared((p) => ({ ...p, interviewType: e.target.value }))}>
              <option>Technical</option><option>HR</option><option>Mixed</option>
            </select>
            <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" min={3} max={30} type="number" value={shared.questionCount} onChange={(e) => setShared((p) => ({ ...p, questionCount: Number(e.target.value) }))} />
            <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" min={5} max={120} type="number" value={shared.durationMinutes} onChange={(e) => setShared((p) => ({ ...p, durationMinutes: Number(e.target.value) }))} />
          </div>
        </Panel>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Panel className="border-cyan-300/25 bg-cyan-500/10">
            <h2 className="font-display text-2xl">Method 1: AI Generate</h2>
            <form className="mt-4" onSubmit={createWithAI}>
              <button className="rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-2 font-semibold text-slate-900 disabled:opacity-70" disabled={isGeneratingAI}>
                {isGeneratingAI ? "Generating..." : "Generate And Save"}
              </button>
            </form>
            {isGeneratingAI ? (
              <div className="mt-4 rounded-xl border border-cyan-300/30 bg-slate-900/45 p-3">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-300" />
                  <span className="h-5 w-5 animate-spin rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#34d399,#22d3ee)] opacity-80" />
                  <p className="text-sm text-cyan-100">{aiStage || "Working..."}</p>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-800">
                  <div className="h-2 w-1/2 animate-pulse rounded bg-gradient-to-r from-cyan-400 to-emerald-400" />
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel className="border-amber-300/25 bg-amber-500/10">
            <h2 className="font-display text-2xl">Method 2: Prompt + Paste</h2>
            <div className="mt-3 flex gap-2">
              <button className="rounded-lg border border-amber-300/40 px-4 py-2 text-amber-100 hover:bg-amber-500/20 disabled:opacity-70" disabled={isGeneratingPrompt} onClick={generatePromptUI} type="button">{isGeneratingPrompt ? "Generating..." : "Generate Prompt"}</button>
              <button className="rounded-lg border border-cyan-300/40 px-4 py-2 text-cyan-100 hover:bg-cyan-500/20" onClick={() => navigator.clipboard.writeText(prompt)} type="button">Copy Prompt</button>
              <a className="rounded-lg border border-emerald-300/40 px-4 py-2 text-emerald-100 hover:bg-emerald-500/20" href="https://chatgpt.com/" rel="noreferrer" target="_blank">Open ChatGPT</a>
            </div>
            {isGeneratingPrompt ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-200/30 border-t-amber-200" />
                <p className="text-sm text-amber-100">Building a clean prompt from shared details...</p>
              </div>
            ) : null}
            <textarea className="mt-3 w-full rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2 font-mono text-xs" rows={9} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <form className="mt-4 grid gap-3" onSubmit={createWithPaste}>
              <textarea className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2 font-mono text-xs" rows={7} value={manualQuestions} onChange={(e) => setManualQuestions(e.target.value)} placeholder="Paste question rows here" required />
              <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-emerald-300 py-2 font-semibold text-slate-900 disabled:opacity-70" disabled={isImportingPaste}>
                {isImportingPaste ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                    Importing...
                  </>
                ) : (
                  "Import And Save"
                )}
              </button>
            </form>
          </Panel>
        </div>

        <Panel className="mt-6 overflow-x-auto">
          <h2 className="font-display text-xl">Interview Configurations</h2>
          <table className="mt-3 w-full min-w-[980px] text-left">
            <thead className="text-xs uppercase tracking-[0.12em] text-slate-300">
              <tr><th className="py-2">Title</th><th className="py-2">Role</th><th className="py-2">Topics</th><th className="py-2">Type</th><th className="py-2">Difficulty</th><th className="py-2">Configured Q</th><th className="py-2">Pasted Q</th><th className="py-2">Duration</th><th className="py-2">Action</th></tr>
            </thead>
            <tbody>
              {interviews.map((i) => (
                <tr className="border-t border-white/10" key={i.id}>
                  <td className="py-2">{i.title}</td>
                  <td className="py-2">{i.roleName}</td>
                  <td className="py-2 text-sm">{i.topics}</td>
                  <td className="py-2">{i.interviewType}</td>
                  <td className="py-2">{i.difficulty}</td>
                  <td className="py-2">{i.questionCount}</td>
                  <td className="py-2">{i.customQuestions.length}</td>
                  <td className="py-2">{i.durationMinutes} min</td>
                  <td className="py-2">
                    <button
                      aria-label="Delete interview"
                      className="inline-flex items-center justify-center rounded-lg bg-red-500/90 p-2 text-lg text-white hover:bg-red-500 disabled:opacity-60"
                      disabled={Boolean(deletingInterviewId)}
                      onClick={() => onDeleteInterview(i.id!)}
                      type="button"
                    >
                      {deletingInterviewId === i.id ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      ) : (
                        <FiTrash2 />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel className="mt-6 overflow-x-auto">
          <h2 className="font-display text-xl">Student Interview Performance</h2>
          <table className="mt-3 min-w-[720px] w-full text-left">
            <thead className="text-xs uppercase tracking-[0.12em] text-slate-300"><tr><th className="py-2">Username</th><th className="py-2">Name</th><th className="py-2">Sessions</th><th className="py-2">Avg Score</th><th className="py-2">Best Score</th></tr></thead>
            <tbody>
              {perfRows.map((p) => (
                <tr className="border-t border-white/10" key={p.username}>
                  <td className="py-2 font-mono text-xs">{p.username}</td>
                  <td className="py-2">{p.name}</td>
                  <td className="py-2">{p.sessions}</td>
                  <td className="py-2">{p.avg == null ? "-" : `${p.avg.toFixed(1)}%`}</td>
                  <td className="py-2">{p.best == null ? "-" : `${p.best}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </main>
  );
}
