"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel, StatCard } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { listCodingAttemptsByUser, listCodingTracks } from "@/lib/data-service";
import { CodingAttempt, CodingTrack } from "@/types/models";

export default function CodingTracksPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tracks, setTracks] = useState<CodingTrack[]>([]);
  const [attempts, setAttempts] = useState<CodingAttempt[]>([]);
  const [openingTrackId, setOpeningTrackId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [trackData, attemptData] = await Promise.all([
        listCodingTracks(),
        listCodingAttemptsByUser(user.username),
      ]);
      setTracks(trackData);
      setAttempts(attemptData);
    };
    load();
  }, [user]);

  const latestByTrack = useMemo(() => {
    const map = new Map<string, CodingAttempt>();
    for (const attempt of attempts) {
      const existing = map.get(attempt.trackId);
      if (!existing || attempt.submittedAt >= existing.submittedAt) map.set(attempt.trackId, attempt);
    }
    return map;
  }, [attempts]);

  const stats = useMemo(
    () => ({
      tracks: tracks.length,
      attempted: latestByTrack.size,
      best: attempts.length ? `${Math.max(...attempts.map((attempt) => attempt.score))}%` : "-",
      avg: attempts.length
        ? `${(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length).toFixed(1)}%`
        : "-",
    }),
    [attempts, latestByTrack.size, tracks.length],
  );

  const orderedTracks = useMemo(() => {
    const newOnes = tracks.filter((track) => track.id && !latestByTrack.has(track.id));
    const seen = tracks.filter((track) => track.id && latestByTrack.has(track.id));
    return [...newOnes, ...seen];
  }, [latestByTrack, tracks]);

  const openTrack = (trackId: string) => {
    if (openingTrackId) return;
    setOpeningTrackId(trackId);
    router.push(`/coding/${trackId}`);
  };

  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          actions={[
            ...(user.role === "admin" ? [{ href: "/admin/coding", label: "Coding Admin" }] : []),
            { href: "/tracks", label: "Exam Tracks" },
            { href: "/interviews", label: "Interview Tracks" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
          subtitle="Practice implementation rounds with editor-based submissions"
          title="Coding Tracks"
        />

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <StatCard label="Tracks" tone="cyan" value={stats.tracks} />
          <StatCard label="Attempted" tone="emerald" value={stats.attempted} />
          <StatCard label="Best Score" tone="blue" value={stats.best} />
          <StatCard label="Avg Score" tone="amber" value={stats.avg} />
        </section>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {orderedTracks.map((track) => {
            const latest = track.id ? latestByTrack.get(track.id) : undefined;
            return (
              <article
                className="rounded-2xl border border-white/15 bg-white/10 p-5 shadow-xl shadow-slate-950/30"
                key={track.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">{track.language}</p>
                  <span
                    className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                      latest
                        ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-200"
                        : "border-amber-300/40 bg-amber-500/15 text-amber-200"
                    }`}
                  >
                    {latest ? "Attempted" : "New"}
                  </span>
                </div>
                <h3 className="mt-2 font-display text-2xl">{track.title}</h3>
                <p className="mt-2 text-slate-300">{track.roleName}</p>
                <p className="mt-1 min-h-12 text-sm text-slate-300">{track.topics}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2">
                    <p className="text-[11px] text-slate-400">Level</p>
                    <p className="font-semibold">{track.difficulty}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2">
                    <p className="text-[11px] text-slate-400">Minutes</p>
                    <p className="font-semibold">{track.durationMinutes}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2">
                    <p className="text-[11px] text-slate-400">Latest</p>
                    <p className="font-semibold">{latest ? `${latest.score}%` : "-"}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-300">
                  {latest
                    ? "Retake to improve your latest coding evaluation."
                    : "Open the coding IDE, solve the task, and submit for evaluation."}
                </p>
                <button
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-2 font-semibold text-slate-900 disabled:opacity-70"
                  disabled={Boolean(openingTrackId)}
                  onClick={() => openTrack(track.id!)}
                  type="button"
                >
                  {openingTrackId === track.id ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                      Opening...
                    </>
                  ) : latest ? (
                    "Retake Coding Track"
                  ) : (
                    "Start Coding Track"
                  )}
                </button>
              </article>
            );
          })}
        </div>

        {attempts.length ? (
          <Panel className="mt-8 overflow-x-auto">
            <h2 className="font-display text-xl">Recent Coding Results</h2>
            <table className="mt-3 min-w-[780px] w-full text-left">
              <thead className="text-xs uppercase tracking-[0.12em] text-slate-300">
                <tr>
                  <th className="py-2">Track</th>
                  <th className="py-2">Language</th>
                  <th className="py-2">Score</th>
                  <th className="py-2">Submitted</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((attempt) => (
                <tr className="border-t border-white/10" key={attempt.id}>
                  <td className="py-2">{attempt.trackTitle}</td>
                  <td className="py-2">{attempt.language}</td>
                  <td className="py-2">{attempt.score}%</td>
                  <td className="py-2">{new Date(attempt.submittedAt).toLocaleString()}</td>
                  <td className="py-2">
                    <Link className="rounded-lg border border-cyan-300/40 px-3 py-1 text-cyan-200 hover:bg-cyan-500/15" href={`/coding/result/${attempt.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </Panel>
        ) : null}
      </div>
      {openingTrackId ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-cyan-300/30 bg-slate-900 p-5 text-center">
            <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-300" />
            <p className="mt-3 text-cyan-100">Loading coding workspace...</p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded bg-slate-800">
              <div className="h-2 w-1/2 animate-pulse rounded bg-gradient-to-r from-cyan-400 to-emerald-400" />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
