"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiTrash2, FiUpload } from "react-icons/fi";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
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

const readProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return null;
  if (file.size > 1024 * 1024 * 2) {
    throw new Error("Project file is too large. Keep it under 2 MB.");
  }
  const text = await file.text();
  return {
    name: file.name,
    text: text.trim(),
  };
};

export default function AdminProjectInterviewsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiStage, setAiStage] = useState("");
  const [isImportingPaste, setIsImportingPaste] = useState(false);
  const [deletingInterviewId, setDeletingInterviewId] = useState<string | null>(null);
  const [perfRows, setPerfRows] = useState<Array<{ username: string; name: string; sessions: number; avg: number | null; best: number | null }>>([]);
  const [manualQuestions, setManualQuestions] = useState("");
  const [shared, setShared] = useState({
    title: "",
    roleName: "Project Candidate",
    topics: "",
    difficulty: "Medium",
    questionCount: 8,
    durationMinutes: 25,
    projectName: "",
    projectDetails: "",
    projectLinks: "",
    projectFileName: "",
  });

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
    setInterviews(list.filter((entry) => entry.isProjectInterview));

    const projectInterviewIds = new Set(list.filter((entry) => entry.isProjectInterview).map((entry) => entry.id));
    const studentUsers = users.filter((u) => u.role === "student");
    const rows = studentUsers.map((u) => {
      const mineSessions = sessions.filter(
        (s) => s.studentUsername === u.username && projectInterviewIds.has(s.interviewId),
      );
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
    if (!shared.title.trim() || !shared.projectName.trim() || !shared.projectDetails.trim()) {
      throw new Error("Enter interview title, project name, and project details first.");
    }
  };

  const createWithAI = async (event: FormEvent) => {
    event.preventDefault();
    setIsGeneratingAI(true);
    setAiStage("Validating project brief...");
    try {
      validateShared();
      setErr("");
      setAiStage("Generating project interview intro and blueprint...");
      const payload = {
        ...shared,
        isProjectInterview: true,
        interviewType: "Project Viva",
        roleName: shared.roleName || "Project Candidate",
      };
      const [introResp, blueprintResp] = await Promise.all([
        callGemini<{ intro: string }>("intro", payload),
        callGemini<{ flow: string; followup: string; criteria: string }>("blueprint", payload),
      ]);

      setAiStage("Saving project interview configuration...");
      await createInterview({
        title: shared.title.trim(),
        roleName: shared.roleName.trim() || "Project Candidate",
        topics: shared.topics.trim() || "Project architecture, implementation, debugging, testing, deployment",
        difficulty: shared.difficulty,
        interviewType: "Project Viva",
        questionCount: Number(shared.questionCount),
        durationMinutes: Number(shared.durationMinutes),
        introMessage: introResp.intro,
        questionFlow: blueprintResp.flow,
        followupLogic: blueprintResp.followup,
        evaluationCriteria: blueprintResp.criteria,
        createdBy: user!.username,
        customQuestions: [],
        isProjectInterview: true,
        projectName: shared.projectName.trim(),
        projectDetails: shared.projectDetails.trim(),
        projectLinks: shared.projectLinks.trim(),
        projectFileName: shared.projectFileName.trim(),
      });
      setMsg("Project interview created successfully.");
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create project interview.");
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
      if (questions.length === 0) throw new Error("No valid project interview question rows found.");
      const intro = `Welcome to your project interview for ${shared.projectName}. Please explain your work clearly, defend your decisions, and use concrete examples from the project.`;
      await createInterview({
        title: shared.title.trim(),
        roleName: shared.roleName.trim() || "Project Candidate",
        topics: shared.topics.trim() || "Project architecture, implementation, debugging, testing, deployment",
        difficulty: shared.difficulty,
        interviewType: "Project Viva",
        questionCount: questions.length,
        durationMinutes: Number(shared.durationMinutes),
        introMessage: intro,
        questionFlow: "Begin with project overview, then architecture, implementation, challenges, testing, and deployment.",
        followupLogic:
          "If the answer is vague, ask for exact implementation details. If strong, ask deeper why, tradeoffs, scaling, debugging, and ownership follow-ups.",
        evaluationCriteria:
          "Evaluate project ownership, technical depth, architecture clarity, tradeoff reasoning, debugging, testing, deployment readiness, and communication.",
        createdBy: user!.username,
        customQuestions: questions,
        isProjectInterview: true,
        projectName: shared.projectName.trim(),
        projectDetails: shared.projectDetails.trim(),
        projectLinks: shared.projectLinks.trim(),
        projectFileName: shared.projectFileName.trim(),
      });
      setMsg(`Project interview created with pasted questions (${questions.length} questions).`);
      setManualQuestions("");
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create project interview.");
    } finally {
      setIsImportingPaste(false);
    }
  };

  const handleProjectUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      const file = await readProjectFile(event);
      if (!file) return;
      setShared((prev) => ({
        ...prev,
        projectFileName: file.name,
        projectDetails: file.text || prev.projectDetails,
      }));
      setMsg(`Loaded project brief from ${file.name}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to read project file.");
    } finally {
      event.target.value = "";
    }
  };

  const onDeleteInterview = async (interviewId: string) => {
    if (deletingInterviewId) return;
    const confirmed = await confirmToast(
      "Delete this project interview configuration?",
      "This removes the project interview and all linked session history and results.",
    );
    if (!confirmed) return;
    setDeletingInterviewId(interviewId);
    try {
      await deleteInterview(interviewId);
      setMsg("Project interview deleted.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete project interview.");
    } finally {
      setDeletingInterviewId(null);
    }
  };

  const stats = useMemo(
    () => ({
      interviews: interviews.length,
      sessions: perfRows.reduce((sum, row) => sum + row.sessions, 0),
      activeStudents: perfRows.filter((row) => row.sessions > 0).length,
    }),
    [interviews.length, perfRows],
  );

  if (!user || user.role !== "admin") return null;

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          actions={[
            { href: "/admin/interviews", label: "Interview Admin" },
            { href: "/project-interviews", label: "Project Interview Tracks" },
            { href: "/interviews", label: "Interview Tracks" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
          subtitle="Administrator"
          title="Project Interview Admin"
        />

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <Panel><p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Project Interviews</p><p className="mt-2 font-display text-3xl">{stats.interviews}</p></Panel>
          <Panel><p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Sessions</p><p className="mt-2 font-display text-3xl">{stats.sessions}</p></Panel>
          <Panel><p className="text-xs uppercase tracking-[0.2em] text-amber-200">Active Students</p><p className="mt-2 font-display text-3xl">{stats.activeStudents}</p></Panel>
        </section>

        <Panel className="mt-6 border-indigo-300/25 bg-indigo-500/10">
          <h2 className="font-display text-2xl">Project Interview Details</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Interview title" value={shared.title} onChange={(e) => setShared((p) => ({ ...p, title: e.target.value }))} />
            <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Project name" value={shared.projectName} onChange={(e) => setShared((p) => ({ ...p, projectName: e.target.value }))} />
            <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Candidate role (optional)" value={shared.roleName} onChange={(e) => setShared((p) => ({ ...p, roleName: e.target.value }))} />
            <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" placeholder="Tech stack / focus topics" value={shared.topics} onChange={(e) => setShared((p) => ({ ...p, topics: e.target.value }))} />
            <textarea className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2 md:col-span-2" placeholder="Paste project summary, architecture, modules, APIs, challenges, testing, deployment, and your exact contribution" rows={8} value={shared.projectDetails} onChange={(e) => setShared((p) => ({ ...p, projectDetails: e.target.value }))} />
            <textarea className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2 md:col-span-2" placeholder="Project links like GitHub, demo, docs, PPT, report" rows={3} value={shared.projectLinks} onChange={(e) => setShared((p) => ({ ...p, projectLinks: e.target.value }))} />
            <select className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" value={shared.difficulty} onChange={(e) => setShared((p) => ({ ...p, difficulty: e.target.value }))}>
              <option>Easy</option><option>Medium</option><option>Hard</option>
            </select>
            <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" min={4} max={25} type="number" value={shared.questionCount} onChange={(e) => setShared((p) => ({ ...p, questionCount: Number(e.target.value) }))} />
            <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" min={10} max={120} type="number" value={shared.durationMinutes} onChange={(e) => setShared((p) => ({ ...p, durationMinutes: Number(e.target.value) }))} />
            <label className="inline-flex items-center gap-3 rounded-lg border border-dashed border-cyan-300/40 bg-slate-900/50 px-3 py-2 text-sm text-cyan-100">
              <FiUpload />
              <span>{shared.projectFileName ? `Loaded: ${shared.projectFileName}` : "Upload project brief (.txt, .md, .json, code, notes)"}</span>
              <input className="hidden" onChange={handleProjectUpload} type="file" />
            </label>
          </div>
        </Panel>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Panel className="border-cyan-300/25 bg-cyan-500/10">
            <h2 className="font-display text-2xl">Method 1: Gemini Generate</h2>
            <p className="mt-2 text-sm text-slate-300">
              Generates a project-focused interview intro, flow, follow-up logic, and evaluation criteria from the uploaded project details.
            </p>
            <form className="mt-4" onSubmit={createWithAI}>
              <button className="rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-2 font-semibold text-slate-900 disabled:opacity-70" disabled={isGeneratingAI}>
                {isGeneratingAI ? "Generating..." : "Generate And Save"}
              </button>
            </form>
            {isGeneratingAI ? (
              <div className="mt-4 rounded-xl border border-cyan-300/30 bg-slate-900/45 p-3 text-sm text-cyan-100">
                {aiStage || "Working..."}
              </div>
            ) : null}
          </Panel>

          <Panel className="border-amber-300/25 bg-amber-500/10">
            <h2 className="font-display text-2xl">Method 2: Paste Questions</h2>
            <p className="mt-2 text-sm text-slate-300">
              Paste custom project viva questions if you already have them. Gemini will still use the saved project details for follow-up questions in the live session.
            </p>
            <form className="mt-4 grid gap-3" onSubmit={createWithPaste}>
              <textarea className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2 font-mono text-xs" rows={8} value={manualQuestions} onChange={(e) => setManualQuestions(e.target.value)} placeholder="IQ\tQ1\tExplain the architecture of your project\nIQ\tQ2\tWhy did you choose this database?\n..." required />
              <button className="rounded-xl bg-gradient-to-r from-amber-300 to-emerald-300 py-2 font-semibold text-slate-900 disabled:opacity-70" disabled={isImportingPaste}>
                {isImportingPaste ? "Importing..." : "Import And Save"}
              </button>
            </form>
          </Panel>
        </div>

        <Panel className="mt-6 overflow-x-auto">
          <h2 className="font-display text-xl">Project Interview Configurations</h2>
          <table className="mt-3 w-full min-w-[1080px] text-left">
            <thead className="text-xs uppercase tracking-[0.12em] text-slate-300">
              <tr><th className="py-2">Title</th><th className="py-2">Project</th><th className="py-2">Topics</th><th className="py-2">Difficulty</th><th className="py-2">Questions</th><th className="py-2">Duration</th><th className="py-2">Uploaded File</th><th className="py-2">Action</th></tr>
            </thead>
            <tbody>
              {interviews.map((interview) => (
                <tr className="border-t border-white/10" key={interview.id}>
                  <td className="py-2">{interview.title}</td>
                  <td className="py-2">{interview.projectName || "-"}</td>
                  <td className="py-2 text-sm">{interview.topics}</td>
                  <td className="py-2">{interview.difficulty}</td>
                  <td className="py-2">{interview.questionCount}</td>
                  <td className="py-2">{interview.durationMinutes} min</td>
                  <td className="py-2 text-sm">{interview.projectFileName || "-"}</td>
                  <td className="py-2">
                    <button
                      aria-label="Delete project interview"
                      className="inline-flex items-center justify-center rounded-lg bg-red-500/90 p-2 text-lg text-white hover:bg-red-500 disabled:opacity-60"
                      disabled={Boolean(deletingInterviewId)}
                      onClick={() => onDeleteInterview(interview.id!)}
                      type="button"
                    >
                      {deletingInterviewId === interview.id ? (
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
          <h2 className="font-display text-xl">Student Project Interview Performance</h2>
          <table className="mt-3 min-w-[720px] w-full text-left">
            <thead className="text-xs uppercase tracking-[0.12em] text-slate-300"><tr><th className="py-2">Username</th><th className="py-2">Name</th><th className="py-2">Sessions</th><th className="py-2">Avg Score</th><th className="py-2">Best Score</th></tr></thead>
            <tbody>
              {perfRows.map((row) => (
                <tr className="border-t border-white/10" key={row.username}>
                  <td className="py-2 font-mono text-xs">{row.username}</td>
                  <td className="py-2">{row.name}</td>
                  <td className="py-2">{row.sessions}</td>
                  <td className="py-2">{row.avg == null ? "-" : `${row.avg.toFixed(1)}%`}</td>
                  <td className="py-2">{row.best == null ? "-" : `${row.best}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </main>
  );
}
