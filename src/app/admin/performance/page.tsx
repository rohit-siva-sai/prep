"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { listAllAttempts, listTests, listUsers } from "@/lib/data-service";
import { formatDate, formatPercent } from "@/lib/utils";
import { ExamAttempt, ExamTest, UserProfile } from "@/types/models";

const buildStudentRows = (students: UserProfile[], tests: ExamTest[], attempts: ExamAttempt[]) =>
  students.map((student) => {
    const studentAttempts = attempts.filter((attempt) => attempt.username === student.username);
    const latestByTest = new Map<string, ExamAttempt>();

    for (const attempt of studentAttempts) {
      const existing = latestByTest.get(attempt.testId);
      if (!existing || attempt.endTs > existing.endTs) {
        latestByTest.set(attempt.testId, attempt);
      }
    }

    const latestAttempt =
      studentAttempts.reduce<ExamAttempt | null>(
        (latest, attempt) => (!latest || attempt.endTs > latest.endTs ? attempt : latest),
        null,
      ) ?? null;

    const avgPercent = studentAttempts.length
      ? studentAttempts.reduce((sum, attempt) => sum + attempt.percent, 0) / studentAttempts.length
      : null;
    const bestPercent = studentAttempts.length
      ? Math.max(...studentAttempts.map((attempt) => attempt.percent))
      : null;

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
      username: student.username,
      fullName: student.fullName,
      attempts: studentAttempts.length,
      testsApplied: statuses.filter((status) => status.applied).length,
      testsPending: statuses.filter((status) => !status.applied).length,
      avgPercent,
      bestPercent,
      latestAttempt,
      statuses,
    };
  });

export default function AdminPerformancePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [tests, setTests] = useState<ExamTest[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.replace("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    const load = async () => {
      const [allUsers, allTests, allAttempts] = await Promise.all([
        listUsers(),
        listTests(),
        listAllAttempts(),
      ]);
      setStudents(allUsers.filter((entry) => entry.role === "student"));
      setTests(allTests);
      setAttempts(allAttempts);
    };
    load();
  }, [user]);

  const rows = useMemo(
    () => buildStudentRows(students, tests, attempts).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [attempts, students, tests],
  );

  const stats = useMemo(
    () => ({
      students: rows.length,
      tests: tests.length,
      appliedSlots: rows.reduce((sum, row) => sum + row.testsApplied, 0),
      pendingSlots: rows.reduce((sum, row) => sum + row.testsPending, 0),
    }),
    [rows, tests.length],
  );

  if (!user || user.role !== "admin") return null;

  return (
    <main className="min-h-screen px-4 py-8 md:py-10">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          title="Student Exam Performance"
          subtitle="Track every student, their scores, and whether each test was applied"
          actions={[
            { href: "/admin/exams", label: "Exam Admin" },
            { href: "/admin/interviews", label: "Interview Admin" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
        />

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <StatCard label="Students" tone="cyan" value={stats.students} />
          <StatCard label="Tests" tone="emerald" value={stats.tests} />
          <StatCard label="Applied" tone="blue" value={stats.appliedSlots} />
          <StatCard label="Pending" tone="amber" value={stats.pendingSlots} />
        </section>

        <Panel className="mt-6 overflow-x-auto p-0">
          <div className="border-b border-white/10 bg-slate-900/40 px-4 py-3">
            <h2 className="font-display text-xl">Student Summary</h2>
          </div>
          <div className="max-h-[30rem] overflow-auto">
            <table className="min-w-[1080px] w-full text-left">
              <thead className="bg-slate-900/70 text-sm uppercase tracking-[0.12em] text-slate-200">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Applied</th>
                  <th className="px-4 py-3">Pending</th>
                  <th className="px-4 py-3">Average</th>
                  <th className="px-4 py-3">Best</th>
                  <th className="px-4 py-3">Latest Test</th>
                  <th className="px-4 py-3">Latest Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-300" colSpan={8}>
                      No student records found yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr className="border-t border-white/10 align-top" key={row.username}>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{row.fullName}</p>
                        <p className="font-mono text-xs text-slate-400">{row.username}</p>
                      </td>
                      <td className="px-4 py-3">{row.attempts}</td>
                      <td className="px-4 py-3 text-emerald-300">{row.testsApplied} / {tests.length}</td>
                      <td className="px-4 py-3 text-amber-300">{row.testsPending}</td>
                      <td className="px-4 py-3">{row.avgPercent == null ? "-" : formatPercent(row.avgPercent, 1)}</td>
                      <td className="px-4 py-3">{row.bestPercent == null ? "-" : formatPercent(row.bestPercent, 1)}</td>
                      <td className="px-4 py-3">
                        {row.latestAttempt ? (
                          <>
                            <p>{row.latestAttempt.testName}</p>
                            <p className="text-xs text-slate-400">{formatDate(row.latestAttempt.endTs)}</p>
                          </>
                        ) : (
                          <span className="text-slate-400">No test yet</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.latestAttempt ? (
                          <div className="flex flex-col gap-1">
                            <span className={row.latestAttempt.passed ? "text-emerald-300" : "text-red-300"}>
                              {row.latestAttempt.passed ? "PASS" : "FAIL"} {formatPercent(row.latestAttempt.percent, 1)}
                            </span>
                            <Link
                              className="text-cyan-300 hover:underline"
                              href={`/result/${row.latestAttempt.id}`}
                            >
                              Open Result
                            </Link>
                          </div>
                        ) : (
                          <span className="text-slate-400">Not applied</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="mt-6">
          <h2 className="font-display text-xl">Applied Test Matrix</h2>
          <div className="mt-4 grid gap-4">
            {rows.length === 0 ? (
              <p className="text-slate-300">Student performance will appear here after registrations and attempts.</p>
            ) : (
              rows.map((row) => (
                <article className="rounded-2xl border border-white/10 bg-slate-950/30 p-4" key={row.username}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-display text-xl">{row.fullName}</h3>
                      <p className="font-mono text-xs text-slate-400">{row.username}</p>
                    </div>
                    <p className="text-sm text-slate-300">
                      Applied {row.testsApplied} of {tests.length} tests
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {row.statuses.map((status) => (
                      <div
                        className={`rounded-xl border p-3 ${
                          status.applied
                            ? "border-emerald-300/25 bg-emerald-500/10"
                            : "border-amber-300/25 bg-amber-500/10"
                        }`}
                        key={`${row.username}-${status.testId}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{status.testName}</p>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{status.testId}</p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                              status.applied
                                ? "bg-emerald-400/15 text-emerald-200"
                                : "bg-amber-400/15 text-amber-200"
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
                          <p className="mt-3 text-sm text-slate-300">
                            This student has not applied this test yet.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}
