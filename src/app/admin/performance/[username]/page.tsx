"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import {
  listAllAttempts,
  listAllInterviewResults,
  listAllInterviewSessions,
  listTests,
  listUsers,
} from "@/lib/data-service";
import { formatDate, formatPercent } from "@/lib/utils";
import { ExamAttempt, ExamTest, InterviewResult, InterviewSession, UserProfile } from "@/types/models";

type StudentPerformanceDetailPageProps = {
  params: Promise<{ username: string }>;
};

const buildStudentExamSummary = (student: UserProfile, tests: ExamTest[], attempts: ExamAttempt[]) => {
  const studentAttempts = attempts.filter((attempt) => attempt.username === student.username);
  const latestByTest = new Map<string, ExamAttempt>();

  for (const attempt of studentAttempts) {
    const existing = latestByTest.get(attempt.testId);
    if (!existing || attempt.endTs > existing.endTs) latestByTest.set(attempt.testId, attempt);
  }

  const latestAttempt =
    studentAttempts.reduce<ExamAttempt | null>(
      (latest, attempt) => (!latest || attempt.endTs > latest.endTs ? attempt : latest),
      null,
    ) ?? null;

  const avgPercent = studentAttempts.length
    ? studentAttempts.reduce((sum, attempt) => sum + attempt.percent, 0) / studentAttempts.length
    : null;
  const bestPercent = studentAttempts.length ? Math.max(...studentAttempts.map((attempt) => attempt.percent)) : null;

  const statuses = tests.map((test) => {
    const latest = latestByTest.get(test.id) ?? null;
    return {
      testId: test.id,
      testName: test.name,
      applied: Boolean(latest),
      latestAttempt: latest,
    };
  });

  return {
    attempts: studentAttempts.length,
    testsApplied: statuses.filter((status) => status.applied).length,
    testsPending: statuses.filter((status) => !status.applied).length,
    avgPercent,
    bestPercent,
    latestAttempt,
    statuses,
  };
};

export default function StudentPerformanceDetailPage({ params }: StudentPerformanceDetailPageProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [tests, setTests] = useState<ExamTest[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [interviewSessions, setInterviewSessions] = useState<InterviewSession[]>([]);
  const [interviewResults, setInterviewResults] = useState<InterviewResult[]>([]);

  useEffect(() => {
    params.then(({ username: nextUsername }) => setUsername(nextUsername));
  }, [params]);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.replace("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    const load = async () => {
      const [allUsers, allTests, allAttempts, allSessions, allResults] = await Promise.all([
        listUsers(),
        listTests(),
        listAllAttempts(),
        listAllInterviewSessions(),
        listAllInterviewResults(),
      ]);
      setStudents(allUsers.filter((entry) => entry.role === "student"));
      setTests(allTests);
      setAttempts(allAttempts);
      setInterviewSessions(allSessions);
      setInterviewResults(allResults);
    };
    load();
  }, [user]);

  const student = useMemo(
    () => students.find((entry) => entry.username === username) ?? null,
    [students, username],
  );

  const examSummary = useMemo(
    () => (student ? buildStudentExamSummary(student, tests, attempts) : null),
    [student, tests, attempts],
  );

  const studentInterviewSessions = useMemo(
    () =>
      interviewSessions
        .filter((session) => session.studentUsername === username)
        .sort((a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime)),
    [interviewSessions, username],
  );

  const studentInterviewRows = useMemo(
    () =>
      studentInterviewSessions.map((session) => ({
        session,
        result: interviewResults.find((result) => result.sessionId === session.id) ?? null,
      })),
    [studentInterviewSessions, interviewResults],
  );

  const interviewStats = useMemo(() => {
    const scored = studentInterviewRows.filter((row) => row.result);
    const scores = scored.map((row) => row.result!.overall);
    return {
      sessions: studentInterviewSessions.length,
      completed: scored.length,
      avgOverall: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      bestOverall: scores.length ? Math.max(...scores) : null,
    };
  }, [studentInterviewRows, studentInterviewSessions.length]);

  if (!user || user.role !== "admin") return null;

  return (
    <main className="min-h-screen px-4 py-8 md:py-10">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          title={student ? `${student.fullName} Performance` : "Student Performance Detail"}
          subtitle={student ? student.username : "Loading student profile"}
          actions={[
            { href: "/admin/performance", label: "Back To Students" },
            { href: "/admin/interviews", label: "Interview Admin" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
        />

        {!student ? (
          <Panel className="mt-6">
            <p className="text-slate-300">Student not found.</p>
          </Panel>
        ) : (
          <>
            <section className="mt-6 grid gap-3 md:grid-cols-4">
              <StatCard label="Exam Attempts" tone="cyan" value={examSummary?.attempts ?? 0} />
              <StatCard
                label="Exam Average"
                tone="emerald"
                value={examSummary?.avgPercent == null ? "-" : formatPercent(examSummary.avgPercent, 1)}
              />
              <StatCard
                label="Interviews"
                tone="blue"
                value={interviewStats.sessions}
              />
              <StatCard
                label="Interview Avg"
                tone="amber"
                value={interviewStats.avgOverall == null ? "-" : formatPercent(interviewStats.avgOverall, 1)}
              />
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-2">
              <Panel>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl">Exam Performance</h2>
                    <p className="mt-1 text-sm text-slate-300">
                      Applied {examSummary?.testsApplied ?? 0} of {tests.length} tests.
                    </p>
                  </div>
                  {examSummary?.latestAttempt ? (
                    <Link
                      className="rounded-xl border border-cyan-300/40 px-4 py-2 text-cyan-200 hover:bg-cyan-400/15"
                      href={`/result/${examSummary.latestAttempt.id}`}
                    >
                      Open Latest Result
                    </Link>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <StatCard
                    label="Applied"
                    tone="cyan"
                    value={`${examSummary?.testsApplied ?? 0}/${tests.length}`}
                  />
                  <StatCard
                    label="Pending"
                    tone="amber"
                    value={examSummary?.testsPending ?? tests.length}
                  />
                  <StatCard
                    label="Best"
                    tone="emerald"
                    value={examSummary?.bestPercent == null ? "-" : formatPercent(examSummary.bestPercent, 1)}
                  />
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {examSummary?.statuses.map((status) => (
                    <div
                      className={`rounded-xl border p-3 ${
                        status.applied
                          ? "border-emerald-300/25 bg-emerald-500/10"
                          : "border-amber-300/25 bg-amber-500/10"
                      }`}
                      key={`${student.username}-${status.testId}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{status.testName}</p>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{status.testId}</p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                            status.applied ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-200"
                          }`}
                        >
                          {status.applied ? "Applied" : "Not Applied"}
                        </span>
                      </div>
                      {status.latestAttempt ? (
                        <div className="mt-3 text-sm text-slate-200">
                          <p>
                            Score: {status.latestAttempt.score}/{status.latestAttempt.total} (
                            {formatPercent(status.latestAttempt.percent, 1)})
                          </p>
                          <p className={status.latestAttempt.passed ? "text-emerald-300" : "text-red-300"}>
                            {status.latestAttempt.passed ? "Passed" : "Failed"}
                          </p>
                          <p className="text-xs text-slate-400">{formatDate(status.latestAttempt.endTs)}</p>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-300">This test has not been attempted yet.</p>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl">Interview Results</h2>
                    <p className="mt-1 text-sm text-slate-300">
                      Sessions: {interviewStats.sessions} | Completed: {interviewStats.completed}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <StatCard label="Sessions" tone="blue" value={interviewStats.sessions} />
                  <StatCard
                    label="Completed"
                    tone="cyan"
                    value={interviewStats.completed}
                  />
                  <StatCard
                    label="Best Overall"
                    tone="emerald"
                    value={interviewStats.bestOverall == null ? "-" : formatPercent(interviewStats.bestOverall, 1)}
                  />
                </div>

                <div className="mt-6 space-y-3">
                  {studentInterviewRows.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
                      No interview sessions found for this student yet.
                    </div>
                  ) : (
                    studentInterviewRows.map(({ session, result }) => (
                      <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4" key={session.id}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold text-slate-100">{session.interviewTitle}</p>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                              {session.roleName}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                              result
                                ? "bg-emerald-500/15 text-emerald-200"
                                : "bg-amber-500/15 text-amber-200"
                            }`}
                          >
                            {result ? `Overall ${result.overall}%` : session.status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
                          <p>Started {formatDate(session.startTime)}</p>
                          <p>Topics {session.topics}</p>
                          <p>Type {session.interviewType}</p>
                        </div>
                        {result ? (
                          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-200">
                            <p>Technical {result.technical}%</p>
                            <p>Communication {result.communication}%</p>
                            <p>Confidence {result.confidence}%</p>
                            <Link
                              className="text-cyan-300 hover:underline"
                              href={`/interviews/result/${result.sessionId}`}
                            >
                              Open Interview Report
                            </Link>
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-300">Evaluation result is not available yet.</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
