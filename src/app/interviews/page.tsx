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

const VOICE_PREF_KEYS = {
  enabled: "interview.voice.enabled",
  voiceUri: "interview.voice.uri",
  rate: "interview.voice.rate",
  pitch: "interview.voice.pitch",
} as const;

export default function InterviewLobbyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [results, setResults] = useState<InterviewResult[]>([]);
  const [err, setErr] = useState("");
  const [startingInterviewId, setStartingInterviewId] = useState<string | null>(null);
  const [speakOutput, setSpeakOutput] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [voiceRate, setVoiceRate] = useState(0.9);
  const [voicePitch, setVoicePitch] = useState(0.95);

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
    setInterviews(allInterviews);
    setSessions(allSessions);
    setResults(allResults);
  };

  useEffect(() => {
    if (user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const storedEnabled = window.localStorage.getItem(VOICE_PREF_KEYS.enabled);
    const storedUri = window.localStorage.getItem(VOICE_PREF_KEYS.voiceUri);
    const storedRate = window.localStorage.getItem(VOICE_PREF_KEYS.rate);
    const storedPitch = window.localStorage.getItem(VOICE_PREF_KEYS.pitch);

    if (storedEnabled !== null) setSpeakOutput(storedEnabled === "true");
    if (storedUri) setSelectedVoiceURI(storedUri);
    if (storedRate) {
      const parsedRate = Number(storedRate);
      if (!Number.isNaN(parsedRate)) setVoiceRate(parsedRate);
    }
    if (storedPitch) {
      const parsedPitch = Number(storedPitch);
      if (!Number.isNaN(parsedPitch)) setVoicePitch(parsedPitch);
    }

    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      const english = all.filter((v) => /^en[-_]/i.test(v.lang));
      const finalVoices = english.length ? english : all;
      setVoices(finalVoices);
      if (!storedUri && finalVoices.length > 0) {
        setSelectedVoiceURI(finalVoices[0].voiceURI);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(VOICE_PREF_KEYS.enabled, String(speakOutput));
    window.localStorage.setItem(VOICE_PREF_KEYS.voiceUri, selectedVoiceURI);
    window.localStorage.setItem(VOICE_PREF_KEYS.rate, String(voiceRate));
    window.localStorage.setItem(VOICE_PREF_KEYS.pitch, String(voicePitch));
  }, [speakOutput, selectedVoiceURI, voiceRate, voicePitch]);

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

  const bestOverall = useMemo(() => results.reduce((max, r) => Math.max(max, r.overall), 0), [results]);
  const avgOverall = useMemo(
    () => (results.length ? results.reduce((sum, r) => sum + r.overall, 0) / results.length : 0),
    [results],
  );

  const testVoice = () => {
    if (!("speechSynthesis" in window)) return;
    if (!speakOutput) return;
    window.speechSynthesis.cancel();
    const sample = new SpeechSynthesisUtterance(
      "Hello, this is your interviewer voice preview.",
    );
    sample.rate = voiceRate;
    sample.pitch = voicePitch;
    sample.lang = "en-US";
    const picked = voices.find((v) => v.voiceURI === selectedVoiceURI);
    if (picked) sample.voice = picked;
    window.speechSynthesis.speak(sample);
  };

  const startInterview = async (interviewId: string) => {
    if (!user || startingInterviewId) return;
    setStartingInterviewId(interviewId);
    setErr("");
    try {
      const interview = await getInterview(interviewId);
      if (!interview) throw new Error("Interview not found.");

      const intro = interview.introMessage || (await callGemini<{ intro: string }>("intro", interview)).intro;

      const firstQuestion = interview.customQuestions[0]
        ? interview.customQuestions[0]
        : (
            await callGemini<{ question: string }>("next_question", {
              context: `Interview title: ${interview.title}\nRole: ${interview.roleName}\nTopics: ${interview.topics}`,
              currentQuestionNo: 0,
              totalQuestions: interview.questionCount,
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
      setErr(e instanceof Error ? e.message : "Unable to start interview.");
      setStartingInterviewId(null);
    }
  };

  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <TopNav
          actions={[{ href: "/dashboard", label: "Dashboard" }]}
          subtitle="AI Interview"
          title="Interview Lobby"
        />

        <section className="mt-5 grid gap-3 md:grid-cols-4">
          <StatCard label="Interviews" tone="cyan" value={interviews.length} />
          <StatCard label="Attempted" tone="emerald" value={attemptedSet.size} />
          <StatCard label="Avg Overall" tone="blue" value={`${avgOverall.toFixed(1)}%`} />
          <StatCard label="Best Overall" tone="amber" value={`${bestOverall}%`} />
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {ordered.map((i) => {
            const attempted = i.id ? attemptedSet.has(i.id) : false;
            const starting = startingInterviewId === i.id;
            return (
              <article className="rounded-2xl border border-white/15 bg-white/10 p-5" key={i.id}>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">INT-{i.id}</p>
                  <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${attempted ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-200" : "border-amber-300/40 bg-amber-500/15 text-amber-200"}`}>{attempted ? "Attempted" : "Unattempted"}</span>
                </div>
                <h3 className="mt-2 font-display text-2xl">{i.title}</h3>
                <p className="mt-2 text-slate-300">{i.roleName}</p>
                <p className="mt-1 text-sm text-slate-300">{i.topics}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2"><p className="text-[11px] text-slate-400">Type</p><p className="font-semibold">{i.interviewType}</p></div>
                  <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2"><p className="text-[11px] text-slate-400">Q</p><p className="font-semibold">{i.questionCount}</p></div>
                  <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2"><p className="text-[11px] text-slate-400">Min</p><p className="font-semibold">{i.durationMinutes}</p></div>
                </div>
                <button
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-2 font-semibold text-slate-900 disabled:opacity-70"
                  disabled={Boolean(startingInterviewId)}
                  onClick={() => startInterview(i.id!)}
                  type="button"
                >
                  {starting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                      Starting...
                    </>
                  ) : attempted ? (
                    "Retake Interview"
                  ) : (
                    "Start Interview"
                  )}
                </button>
              </article>
            );
          })}
        </div>

        {results.length ? (
          <Panel className="mt-8 overflow-x-auto">
            <h2 className="font-display text-xl">Your Recent Interview Results</h2>
            <table className="mt-3 min-w-[760px] w-full text-left">
              <thead className="text-xs uppercase tracking-[0.12em] text-slate-300"><tr><th className="py-2">Session</th><th className="py-2">Overall</th><th className="py-2">Technical</th><th className="py-2">Communication</th><th className="py-2">Action</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr className="border-t border-white/10" key={r.sessionId}>
                    <td className="py-2 font-mono text-xs">{r.sessionId}</td>
                    <td className="py-2">{r.overall}%</td>
                    <td className="py-2">{r.technical}%</td>
                    <td className="py-2">{r.communication}%</td>
                    <td className="py-2"><Link className="rounded-lg border border-cyan-300/40 px-3 py-1 text-cyan-200 hover:bg-cyan-400/15" href={`/interviews/result/${r.sessionId}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ) : null}

        <Panel className="mt-8">
          <h2 className="font-display text-xl">Interview Voice Settings</h2>
          <p className="mt-1 text-xs text-slate-300">
            These settings are used in interview chat for interviewer voice output.
          </p>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-200">
            <input
              checked={speakOutput}
              className="accent-emerald-400"
              onChange={(e) => setSpeakOutput(e.target.checked)}
              type="checkbox"
            />
            Enable interviewer voice output
          </label>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <select
              className="w-full rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2"
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
              value={selectedVoiceURI}
            >
              {voices.length === 0 ? (
                <option value="">Default Voice</option>
              ) : (
                voices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))
              )}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-300">
                Rate
                <input
                  className="mt-1 w-full"
                  max={1.2}
                  min={0.75}
                  onChange={(e) => setVoiceRate(Number(e.target.value))}
                  step={0.05}
                  type="range"
                  value={voiceRate}
                />
              </label>
              <label className="text-xs text-slate-300">
                Pitch
                <input
                  className="mt-1 w-full"
                  max={1.2}
                  min={0.8}
                  onChange={(e) => setVoicePitch(Number(e.target.value))}
                  step={0.05}
                  type="range"
                  value={voicePitch}
                />
              </label>
            </div>
            <button
              className="h-fit rounded-lg border border-cyan-300/40 px-3 py-2 text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
              disabled={!speakOutput}
              onClick={testVoice}
              type="button"
            >
              Test Voice
            </button>
          </div>
        </Panel>
      </div>
    </main>
  );
}
