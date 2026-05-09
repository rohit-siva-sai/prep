"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { listAllAttempts, listTests, listUsers } from "@/lib/data-service";
import { formatPercent } from "@/lib/utils";
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
            { href: "/admin/coding", label: "Coding Admin" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
        />

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <StatCard label="Students" tone="cyan" value={stats.students} />
          <StatCard label="Tests" tone="emerald" value={stats.tests} />
          <StatCard label="Applied" tone="blue" value={stats.appliedSlots} />
          <StatCard label="Pending" tone="amber" value={stats.pendingSlots} />
        </section>

        <Panel className="mt-6 p-0">
          <div className="border-b border-white/10 bg-slate-900/40 px-4 py-3">
            <h2 className="font-display text-xl">Student List</h2>
            <p className="mt-1 text-sm text-slate-300">
              Open a student profile to view exam performance and interview results on a dedicated page.
            </p>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-slate-300 md:col-span-2 xl:col-span-3">
                No student records found yet.
              </p>
            ) : (
              rows.map((row) => (
                <button
                  className="rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-left transition hover:border-cyan-300/30 hover:bg-cyan-500/10"
                  key={row.username}
                  onClick={() => router.push(`/admin/performance/${row.username}`)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-100">{row.fullName}</p>
                      <p className="font-mono text-xs text-slate-400">{row.username}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                        row.latestAttempt?.passed
                          ? "bg-emerald-500/15 text-emerald-200"
                          : row.latestAttempt
                            ? "bg-red-500/15 text-red-200"
                            : "bg-slate-500/15 text-slate-200"
                      }`}
                    >
                      {row.latestAttempt ? (row.latestAttempt.passed ? "Passing" : "Needs Work") : "No Tests"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
                    <p>Attempts {row.attempts}</p>
                    <p>Applied {row.testsApplied}/{tests.length}</p>
                    <p>Average {row.avgPercent == null ? "-" : formatPercent(row.avgPercent, 1)}</p>
                  </div>
                  <p className="mt-4 text-sm text-cyan-200">Open full report</p>
                </button>
              ))
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}
