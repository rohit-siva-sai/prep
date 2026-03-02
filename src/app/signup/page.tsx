"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBackground } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { FirebaseNotice } from "@/components/ui/firebase-notice";
import { notify } from "@/lib/toast";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!error) return;
    notify.error(error);
  }, [error]);

  useEffect(() => {
    if (!message) return;
    notify.success(message);
  }, [message]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await signup({ fullName, username, password, confirmPassword });
      setMessage("Account created successfully. Please login.");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
    }
  };

  return (
    <main className="min-h-screen px-4 py-12 md:py-16">
      <AppBackground />
      <div className="mx-auto max-w-2xl">
        <section className="rounded-3xl border border-white/15 bg-white/10 p-7 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl md:p-9">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">New Student</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl">Identity Enrollment</h1>
          <p className="mt-2 text-slate-300">
            Create your account to access advanced test tracks and analytics.
          </p>
          <div className="mt-4">
            <FirebaseNotice />
          </div>

          <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
            <input
              className="w-full rounded-xl border border-white/20 bg-slate-900/70 px-3 py-3 outline-none focus:border-cyan-300"
              onChange={(e) => setFullName(e.target.value)}
              placeholder="full name"
              required
              value={fullName}
            />
            <input
              className="w-full rounded-xl border border-white/20 bg-slate-900/70 px-3 py-3 outline-none focus:border-cyan-300"
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              required
              value={username}
            />
            <input
              className="w-full rounded-xl border border-white/20 bg-slate-900/70 px-3 py-3 outline-none focus:border-cyan-300"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              required
              type="password"
              value={password}
            />
            <input
              className="w-full rounded-xl border border-white/20 bg-slate-900/70 px-3 py-3 outline-none focus:border-cyan-300"
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="confirm password"
              required
              type="password"
              value={confirmPassword}
            />
            <button className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-3 font-semibold text-slate-900 hover:brightness-110">
              Register Identity
            </button>
          </form>

          <p className="mt-5 text-sm text-slate-300">
            Already registered? <Link className="text-cyan-300 hover:underline" href="/login">Login</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
