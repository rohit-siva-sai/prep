"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { getInterviewResult, getInterviewSession } from "@/lib/data-service";
import { splitPoints } from "@/lib/utils";
import { InterviewResult, InterviewSession } from "@/types/models";

export default function InterviewResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [result, setResult] = useState<InterviewResult | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!sessionId || !user) return;
    const load = async () => {
      const [sessionData, resultData] = await Promise.all([
        getInterviewSession(sessionId),
        getInterviewResult(sessionId),
      ]);
      if (!sessionData || !resultData) {
        router.replace("/interviews");
        return;
      }
      if (user.role !== "admin" && sessionData.studentUsername !== user.username) {
        router.replace("/interviews");
        return;
      }
      setSession(sessionData);
      setResult(resultData);
    };
    load();
  }, [sessionId, user, router]);

  const qa = useMemo(() => {
    if (!session) return [] as Array<{ q: string; a: string }>;
    const rows: Array<{ q: string; a: string }> = [];
    let latestQ = "";
    for (const m of session.messages) {
      if (m.sender === "AI" && m.messageType === "QUESTION") {
        latestQ = m.messageText;
        continue;
      }
      if (m.sender !== "STUDENT") continue;
      rows.push({ q: latestQ || "Question context not captured.", a: m.messageText });
    }
    return rows;
  }, [session]);

  if (!session || !result) return null;

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-6xl">
        <TopNav actions={[{ href: "/interviews", label: "Interview Lobby" }]} title="Interview Feedback Report" />

        <Panel className="mt-6">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Candidate</p>
          <h2 className="mt-1 font-display text-2xl">{session.studentName}</h2>
          <p className="mt-1 text-sm text-slate-300">{session.interviewTitle} - {session.roleName}</p>
        </Panel>

        <section className="mt-4 grid gap-3 md:grid-cols-5">
          <StatCard label="Technical" tone="cyan" value={result.technical} />
          <StatCard label="Communication" tone="emerald" value={result.communication} />
          <StatCard label="Relevance" tone="blue" value={result.relevance} />
          <StatCard label="Confidence" tone="violet" value={result.confidence} />
          <StatCard label="Overall" tone="amber" value={result.overall} />
        </section>

        <Panel className="mt-6">
          <h2 className="font-display text-xl">Final Feedback</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-200">
            {splitPoints(result.feedback).map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </Panel>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <Panel className="border-emerald-300/25 bg-emerald-500/10"><h3 className="font-display text-lg">Strengths</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">{splitPoints(result.strengths).map((p) => <li key={p}>{p}</li>)}</ul></Panel>
          <Panel className="border-red-300/25 bg-red-500/10"><h3 className="font-display text-lg">Weaknesses</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">{splitPoints(result.weaknesses).map((p) => <li key={p}>{p}</li>)}</ul></Panel>
          <Panel className="border-cyan-300/25 bg-cyan-500/10"><h3 className="font-display text-lg">Suggestions</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">{splitPoints(result.suggestions).map((p) => <li key={p}>{p}</li>)}</ul></Panel>
        </section>

        <Panel className="mt-6">
          <h2 className="font-display text-xl">Questions And Answers</h2>
          <div className="mt-3 space-y-4">
            {qa.length === 0 ? (
              <p className="text-sm text-slate-300">No Q&A found for this session.</p>
            ) : (
              qa.map((row, idx) => (
                <article className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 p-3" key={`${idx}-${row.q}`}>
                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Q&A {idx + 1}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-300">Question</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{row.q}</p>
                  <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-slate-300">Answer</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{row.a}</p>
                </article>
              ))
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}
