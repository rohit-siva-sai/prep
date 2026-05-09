"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import {
  createInterviewSession,
  getInterview,
  listInterviewResultsByUser,
  listInterviews,
  listInterviewSessionsByUser,
} from "@/lib/data-service";
import { callGemini } from "@/lib/gemini-client";
import { notify } from "@/lib/toast";
import { Interview, InterviewResult, InterviewSession } from "@/types/models";

export default function ProjectInterviewLobbyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [results, setResults] = useState<InterviewResult[]>([]);
  const [err, setErr] = useState("");
  const [startingInterviewId, setStartingInterviewId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const refresh = async () => {
    if (!user) return;
    const [allInterviews, allSessions, allResults] = await Promise.all([
      listInterviews(),
      listInterviewSessionsByUser(user.username),
      listInterviewResultsByUser(user.username),
    ]);
    const projectInterviews = allInterviews.filter((entry) => entry.isProjectInterview);
    const projectInterviewIds = new Set(projectInterviews.map((entry) => entry.id));
    const projectSessions = allSessions.filter((session) => projectInterviewIds.has(session.interviewId));
    const projectSessionIds = new Set(projectSessions.map((session) => session.id));
    setInterviews(projectInterviews);
    setSessions(projectSessions);
    setResults(allResults.filter((result) => projectSessionIds.has(result.sessionId)));
  };

  useEffect(() => {
    if (user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!err) return;
    notify.error(err);
    setErr("");
  }, [err]);

  const attemptedSet = useMemo(() => new Set(sessions.map((s) => s.interviewId)), [sessions]);
  const ordered = useMemo(() => {
    const fresh = interviews.filter((i) => i.id && !attemptedSet.has(i.id));
    const old = interviews.filter((i) => i.id && attemptedSet.has(i.id));
    return [...fresh, ...old];
  }, [interviews, attemptedSet]);

  const stats = useMemo(
    () => ({
      interviews: interviews.length,
      attempted: attemptedSet.size,
      avgOverall: results.length
        ? `${(results.reduce((sum, row) => sum + row.overall, 0) / results.length).toFixed(1)}%`
        : "0.0%",
      bestOverall: `${results.reduce((max, row) => Math.max(max, row.overall), 0)}%`,
    }),
    [attemptedSet.size, interviews.length, results],
  );

  const startInterview = async (interviewId: string) => {
    if (!user || startingInterviewId) return;
    setStartingInterviewId(interviewId);
    setErr("");
    try {
      const interview = await getInterview(interviewId);
      if (!interview) throw new Error("Project interview not found.");

      const intro = interview.introMessage || (await callGemini<{ intro: string }>("intro", interview)).intro;
      const context = [
        `Interview title: ${interview.title}`,
        `Project name: ${interview.projectName || interview.title}`,
        `Role: ${interview.roleName}`,
        `Topics: ${interview.topics}`,
        interview.projectDetails ? `Project details:\n${interview.projectDetails}` : "",
        interview.projectLinks ? `Project links:\n${interview.projectLinks}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const firstQuestion = interview.customQuestions[0]
        ? interview.customQuestions[0]
        : (
            await callGemini<{ question: string }>("next_question", {
              context,
              currentQuestionNo: 0,
              totalQuestions: interview.questionCount,
              isProjectInterview: true,
              projectName: interview.projectName,
              projectDetails: interview.projectDetails,
              projectLinks: interview.projectLinks,
            })
          ).question;

      const sessionId = await createInterviewSession(
        {
          interviewId,
          interviewTitle: interview.title,
          roleName: interview.roleName,
          topics: interview.topics,
          difficulty: interview.difficulty,
          interviewType: interview.interviewType,
          evaluationCriteria: interview.evaluationCriteria,
          projectName: interview.projectName,
          projectDetails: interview.projectDetails,
          projectLinks: interview.projectLinks,
          studentUsername: user.username,
          studentName: user.fullName,
          totalQuestions: interview.customQuestions.length || interview.questionCount,
          durationMinutes: interview.durationMinutes,
        },
        intro,
        firstQuestion,
      );

      router.push(`/interviews/${sessionId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unable to start project interview.");
      setStartingInterviewId(null);
    }
  };

  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          actions={[
            ...(user.role === "admin" ? [{ href: "/admin/project-interviews", label: "Project Interview Admin" }] : []),
            { href: "/interviews", label: "Interview Tracks" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
          subtitle="Project Viva"
          title="Project Interview Tracks"
        />

        <section className="mt-5 grid gap-3 md:grid-cols-4">
          <StatCard label="Project Interviews" tone="cyan" value={stats.interviews} />
          <StatCard label="Attempted" tone="emerald" value={stats.attempted} />
          <StatCard label="Avg Overall" tone="blue" value={stats.avgOverall} />
          <StatCard label="Best Overall" tone="amber" value={stats.bestOverall} />
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {ordered.map((interview) => {
            const attempted = interview.id ? attemptedSet.has(interview.id) : false;
            const starting = startingInterviewId === interview.id;
            return (
              <article className="rounded-2xl border border-white/15 bg-white/10 p-5" key={interview.id}>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">PRJ-{interview.id}</p>
                  <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${attempted ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-200" : "border-amber-300/40 bg-amber-500/15 text-amber-200"}`}>{attempted ? "Attempted" : "Unattempted"}</span>
                </div>
                <h3 className="mt-2 font-display text-2xl">{interview.title}</h3>
                <p className="mt-2 text-slate-300">{interview.projectName || interview.roleName}</p>
                <p className="mt-1 text-sm text-slate-300">{interview.topics}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2"><p className="text-[11px] text-slate-400">Type</p><p className="font-semibold">{interview.interviewType}</p></div>
                  <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2"><p className="text-[11px] text-slate-400">Q</p><p className="font-semibold">{interview.questionCount}</p></div>
                  <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2"><p className="text-[11px] text-slate-400">Min</p><p className="font-semibold">{interview.durationMinutes}</p></div>
                </div>
                <p className="mt-3 line-clamp-4 text-xs text-slate-300">
                  {interview.projectDetails || "Project-specific questions will be generated from the uploaded project brief."}
                </p>
                <button
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-2 font-semibold text-slate-900 disabled:opacity-70"
                  disabled={Boolean(startingInterviewId)}
                  onClick={() => startInterview(interview.id!)}
                  type="button"
                >
                  {starting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                      Starting...
                    </>
                  ) : attempted ? "Retake Project Interview" : "Start Project Interview"}
                </button>
              </article>
            );
          })}
        </div>

        {results.length ? (
          <Panel className="mt-8 overflow-x-auto">
            <h2 className="font-display text-xl">Your Recent Project Interview Results</h2>
            <table className="mt-3 min-w-[760px] w-full text-left">
              <thead className="text-xs uppercase tracking-[0.12em] text-slate-300"><tr><th className="py-2">Session</th><th className="py-2">Overall</th><th className="py-2">Technical</th><th className="py-2">Communication</th><th className="py-2">Action</th></tr></thead>
              <tbody>
                {results.map((result) => (
                  <tr className="border-t border-white/10" key={result.sessionId}>
                    <td className="py-2 font-mono text-xs">{result.sessionId}</td>
                    <td className="py-2">{result.overall}%</td>
                    <td className="py-2">{result.technical}%</td>
                    <td className="py-2">{result.communication}%</td>
                    <td className="py-2"><Link className="rounded-lg border border-cyan-300/40 px-3 py-1 text-cyan-200 hover:bg-cyan-400/15" href={`/interviews/result/${result.sessionId}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ) : null}
      </div>
    </main>
  );
}
