"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBackground } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { FirebaseNotice } from "@/components/ui/firebase-notice";
import { listTests } from "@/lib/data-service";
import { notify } from "@/lib/toast";

export default function LoginPage() {
  const router = useRouter();
  const { user, login, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tracks, setTracks] = useState(0);
  const [questions, setQuestions] = useState(0);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const tests = await listTests();
        setTracks(tests.length);
        setQuestions(tests.reduce((sum, t) => sum + t.questions.length, 0));
      } catch {
        setTracks(0);
        setQuestions(0);
      }
    };
    loadMeta();
  }, []);

  useEffect(() => {
    if (!error) return;
    notify.error(error);
  }, [error]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await login(username, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-10 md:py-16">
      <AppBackground />
      <div className="mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-2">
        <section>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">Exam Grid 2050</p>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-6xl">Neural Assessment Portal</h1>
          <p className="mt-4 max-w-lg text-slate-300">
            Multi-track certification exams with timed execution, instant scoring, and performance analytics.
          </p>
          <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-4">
              <p className="text-xs text-cyan-200">Tracks</p>
              <p className="text-2xl font-semibold">{tracks}</p>
            </div>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-4">
              <p className="text-xs text-emerald-200">Questions</p>
              <p className="text-2xl font-semibold">{questions}</p>
            </div>
            <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-3 py-4">
              <p className="text-xs text-blue-200">Mode</p>
              <p className="text-2xl font-semibold">Live</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/15 bg-white/10 p-7 shadow-2xl shadow-cyan-900/20 backdrop-blur-xl md:p-9">
          <h2 className="font-display text-2xl">Student Login</h2>
          <p className="mt-2 text-slate-300">Authenticate to continue to your command dashboard.</p>
          <div className="mt-4">
            <FirebaseNotice />
          </div>
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-300">Username</label>
              <input
                className="mt-2 w-full rounded-xl border border-white/20 bg-slate-900/70 px-3 py-3 outline-none focus:border-cyan-300"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="enter username"
                required
                value={username}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-300">Password</label>
              <input
                className="mt-2 w-full rounded-xl border border-white/20 bg-slate-900/70 px-3 py-3 outline-none focus:border-cyan-300"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="enter password"
                required
                type="password"
                value={password}
              />
            </div>
            <button className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-3 font-semibold text-slate-900 hover:brightness-110">
              Enter Grid
            </button>
          </form>

          <p className="mt-5 text-sm text-slate-300">
            No account yet? <Link className="text-emerald-300 hover:underline" href="/signup">Create one</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
