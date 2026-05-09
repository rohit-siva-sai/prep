"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiTrash2 } from "react-icons/fi";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import {
  deleteAttempt,
  deleteCodingAttempt,
  deleteInterviewSessionResult,
  getInterviewSession,
  listCodingAttemptsByUser,
  listAttemptsByUser,
  listInterviewResultsByUser,
} from "@/lib/data-service";
import { confirmToast, notify } from "@/lib/toast";
import { CodingAttempt, ExamAttempt, InterviewResult } from "@/types/models";
import { formatDate, formatPercent } from "@/lib/utils";

type InterviewResultRow = InterviewResult & {
  interviewTitle: string;
  roleName: string;
};

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [codingAttempts, setCodingAttempts] = useState<CodingAttempt[]>([]);
  const [interviewResults, setInterviewResults] = useState<InterviewResultRow[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    try {
      const [examAttempts, rawInterviewResults, userCodingAttempts] = await Promise.all([
        listAttemptsByUser(user.username),
        listInterviewResultsByUser(user.username),
        listCodingAttemptsByUser(user.username),
      ]);
      setAttempts(examAttempts);
      setCodingAttempts(userCodingAttempts);

      const withTitle = await Promise.all(
        rawInterviewResults.map(async (result) => {
          const session = await getInterviewSession(result.sessionId);
          return {
            ...result,
            interviewTitle: session?.interviewTitle || "Interview",
            roleName: session?.roleName || "-",
          };
        }),
      );
      withTitle.sort((a, b) => b.createdAt - a.createdAt);
      setInterviewResults(withTitle);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to load result history.");
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadHistory();
  }, [user, loadHistory]);

  const handleDeleteExam = async (attemptId: string) => {
    if (deletingId) return;
    const confirmed = await confirmToast("Delete this exam result?", "This permanently removes the saved attempt.");
    if (!confirmed) return;
    setDeletingId(attemptId);
    try {
      await deleteAttempt(attemptId);
      await loadHistory();
      notify.success("Exam result deleted.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to delete exam result.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteInterview = async (sessionId: string) => {
    if (deletingId) return;
    const confirmed = await confirmToast(
      "Delete this interview result?",
      "This removes both the interview session and its saved result.",
    );
    if (!confirmed) return;
    setDeletingId(sessionId);
    try {
      await deleteInterviewSessionResult(sessionId);
      await loadHistory();
      notify.success("Interview result deleted.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to delete interview result.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteCoding = async (attemptId: string) => {
    if (deletingId) return;
    const confirmed = await confirmToast(
      "Delete this coding result?",
      "This permanently removes the saved coding submission.",
    );
    if (!confirmed) return;
    setDeletingId(attemptId);
    try {
      await deleteCodingAttempt(attemptId);
      await loadHistory();
      notify.success("Coding result deleted.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to delete coding result.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          actions={[
            { href: "/dashboard", label: "Dashboard" },
          ]}
          subtitle="Progress Ledger"
          title="Result Stream"
        />

        <Panel className="mt-5 p-0">
          <div className="border-b border-white/10 bg-slate-900/40 px-4 py-3">
            <h2 className="font-display text-xl">Interview Results</h2>
          </div>
          <div className="max-h-[31rem] overflow-auto">
            <table className="min-w-[840px] w-full text-left">
              <thead className="bg-slate-900/70 text-sm uppercase tracking-[0.12em] text-slate-200">
                <tr>
                  <th className="px-4 py-3">Interview</th>
                  <th className="px-4 py-3">Session ID</th>
                  <th className="px-4 py-3">Overall</th>
                  <th className="px-4 py-3">Technical</th>
                  <th className="px-4 py-3">Communication</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {interviewResults.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-300" colSpan={7}>
                      No interview results yet.
                    </td>
                  </tr>
                ) : (
                  interviewResults.map((result) => (
                    <tr className="border-t border-white/10" key={result.sessionId}>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{result.interviewTitle}</p>
                        <p className="text-xs text-slate-400">{result.roleName}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{result.sessionId}</td>
                      <td className="px-4 py-3">{formatPercent(result.overall, 1)}</td>
                      <td className="px-4 py-3">{result.technical}%</td>
                      <td className="px-4 py-3">{result.communication}%</td>
                      <td className="px-4 py-3 text-sm">{formatDate(result.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Link className="text-cyan-300 hover:underline" href={`/interviews/result/${result.sessionId}`}>
                            Open
                          </Link>
                          <button
                            aria-label="Delete interview result"
                            className="inline-flex items-center justify-center rounded-lg bg-red-500/90 p-2 text-white hover:bg-red-500 disabled:opacity-60"
                            disabled={Boolean(deletingId)}
                            onClick={() => handleDeleteInterview(result.sessionId)}
                            type="button"
                          >
                            {deletingId === result.sessionId ? (
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            ) : (
                              <FiTrash2 />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="mt-6 p-0">
          <div className="border-b border-white/10 bg-slate-900/40 px-4 py-3">
            <h2 className="font-display text-xl">Coding Results</h2>
          </div>
          <div className="max-h-[31rem] overflow-auto">
            <table className="min-w-[840px] w-full text-left">
              <thead className="bg-slate-900/70 text-sm uppercase tracking-[0.12em] text-slate-200">
                <tr>
                  <th className="px-4 py-3">Track</th>
                  <th className="px-4 py-3">Attempt ID</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Sample Tests</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {codingAttempts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-300" colSpan={7}>
                      No coding submissions yet.
                    </td>
                  </tr>
                ) : (
                  codingAttempts.map((attempt) => (
                    <tr className="border-t border-white/10" key={attempt.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{attempt.trackTitle}</p>
                        <p className="text-xs text-slate-400">{attempt.roleName}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{attempt.id}</td>
                      <td className="px-4 py-3">{attempt.score}%</td>
                      <td className="px-4 py-3">
                        {attempt.totalSampleTests ? `${attempt.passedSampleTests}/${attempt.totalSampleTests}` : "-"}
                      </td>
                      <td className="px-4 py-3">{attempt.language}</td>
                      <td className="px-4 py-3 text-sm">{formatDate(attempt.submittedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Link className="text-cyan-300 hover:underline" href={`/coding/result/${attempt.id}`}>
                            Open
                          </Link>
                          <button
                            aria-label="Delete coding result"
                            className="inline-flex items-center justify-center rounded-lg bg-red-500/90 p-2 text-white hover:bg-red-500 disabled:opacity-60"
                            disabled={Boolean(deletingId)}
                            onClick={() => handleDeleteCoding(attempt.id!)}
                            type="button"
                          >
                            {deletingId === attempt.id ? (
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            ) : (
                              <FiTrash2 />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="mt-6 p-0">
          <div className="border-b border-white/10 bg-slate-900/40 px-4 py-3">
            <h2 className="font-display text-xl">Exam Results</h2>
          </div>
          <div className="max-h-[31rem] overflow-auto">
            <table className="min-w-[840px] w-full text-left">
              <thead className="bg-slate-900/70 text-sm uppercase tracking-[0.12em] text-slate-200">
                <tr>
                  <th className="px-4 py-3">Track</th>
                  <th className="px-4 py-3">Attempt ID</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Percent</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {attempts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-300" colSpan={7}>
                      No attempts yet. Start a track from dashboard.
                    </td>
                  </tr>
                ) : (
                  attempts.map((attempt) => (
                    <tr className="border-t border-white/10" key={attempt.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{attempt.testName}</p>
                        <p className="text-xs text-slate-400">{attempt.testId}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{attempt.id}</td>
                      <td className="px-4 py-3">{attempt.score} / {attempt.total}</td>
                      <td className="px-4 py-3">{formatPercent(attempt.percent, 2)}</td>
                      <td className={`px-4 py-3 ${attempt.passed ? "text-emerald-300" : "text-red-300"}`}>
                        {attempt.passed ? "PASS" : "FAIL"}
                      </td>
                      <td className="px-4 py-3 text-sm">{formatDate(attempt.endTs)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Link className="text-cyan-300 hover:underline" href={`/result/${attempt.id}`}>
                            Open
                          </Link>
                          <button
                            aria-label="Delete exam result"
                            className="inline-flex items-center justify-center rounded-lg bg-red-500/90 p-2 text-white hover:bg-red-500 disabled:opacity-60"
                            disabled={Boolean(deletingId)}
                            onClick={() => handleDeleteExam(attempt.id)}
                            type="button"
                          >
                            {deletingId === attempt.id ? (
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            ) : (
                              <FiTrash2 />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </main>
  );
}
