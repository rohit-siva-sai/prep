"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppBackground, Panel } from "@/components/ui/primitives";
import { TopNav } from "@/components/layout/top-nav";

export default function SessionCookieDemoPage() {
  const [status, setStatus] = useState("Ready");
  const [cookies, setCookies] = useState("");
  const [sessionDump, setSessionDump] = useState<Array<{ key: string; value: string }>>([]);

  const refresh = () => {
    setCookies(document.cookie || "(no client-side cookies visible)");
    const out: Array<{ key: string; value: string }> = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      out.push({ key, value: sessionStorage.getItem(key) || "" });
    }
    setSessionDump(out);
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => refresh());
    return () => cancelAnimationFrame(id);
  }, []);

  const setCookie = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("cookieName") || "").trim();
    const value = String(form.get("cookieValue") || "").trim();
    const maxAge = Number(form.get("cookieMaxAge") || 3600);
    if (!name) return;
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/`;
    setStatus(`Cookie set: ${name} (maxAge=${maxAge}s)`);
    refresh();
  };

  const deleteCookie = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("cookieName") || "").trim();
    if (!name) return;
    document.cookie = `${encodeURIComponent(name)}=; max-age=0; path=/`;
    setStatus(`Cookie deleted: ${name}`);
    refresh();
  };

  const setSession = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = String(form.get("sessionKey") || "").trim();
    const value = String(form.get("sessionValue") || "");
    if (!key) return;
    sessionStorage.setItem(key, value);
    setStatus(`Session attribute set: ${key}`);
    refresh();
  };

  const removeSession = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = String(new FormData(event.currentTarget).get("sessionKey") || "").trim();
    if (!key) return;
    sessionStorage.removeItem(key);
    setStatus(`Session attribute removed: ${key}`);
    refresh();
  };

  const clearSession = () => {
    sessionStorage.clear();
    setStatus("Session storage cleared.");
    refresh();
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <AppBackground />
      <div className="mx-auto max-w-6xl space-y-4">
        <TopNav actions={[{ href: "/dashboard", label: "Dashboard" }]} title="Cookies + Session Playground" />
        <Panel>
          <div className="rounded-lg border-l-4 border-emerald-400 bg-emerald-500/15 px-3 py-2 text-emerald-100">{status}</div>
        </Panel>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel>
            <h2 className="font-display text-xl">Cookie Actions</h2>
            <form className="mt-3 grid gap-2" onSubmit={setCookie}>
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" name="cookieName" placeholder="cookie name" required />
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" name="cookieValue" placeholder="cookie value" />
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" defaultValue={3600} min={0} name="cookieMaxAge" type="number" />
              <button className="rounded-xl bg-cyan-500/80 py-2">Set Cookie</button>
            </form>
            <form className="mt-3 grid gap-2" onSubmit={deleteCookie}>
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" name="cookieName" placeholder="cookie name" required />
              <button className="rounded-xl bg-red-500/80 py-2">Delete Cookie</button>
            </form>
          </Panel>

          <Panel>
            <h2 className="font-display text-xl">Session Actions</h2>
            <form className="mt-3 grid gap-2" onSubmit={setSession}>
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" name="sessionKey" placeholder="session key" required />
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" name="sessionValue" placeholder="session value" />
              <button className="rounded-xl bg-emerald-500/80 py-2">Set Session</button>
            </form>
            <form className="mt-3 grid gap-2" onSubmit={removeSession}>
              <input className="rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2" name="sessionKey" placeholder="session key" required />
              <button className="rounded-xl bg-slate-600 py-2">Remove Session Key</button>
            </form>
            <button className="mt-3 w-full rounded-xl bg-red-500/80 py-2" onClick={clearSession} type="button">Clear Session</button>
          </Panel>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel>
            <h2 className="font-display text-xl">Current Cookies</h2>
            <p className="mt-2 whitespace-pre-wrap break-all text-sm text-slate-300">{cookies}</p>
          </Panel>
          <Panel>
            <h2 className="font-display text-xl">Current Session Storage</h2>
            <div className="mt-2 space-y-2 text-sm">
              {sessionDump.length === 0 ? (
                <p className="text-slate-300">No session keys set.</p>
              ) : (
                sessionDump.map((item) => (
                  <div className="rounded-lg border border-white/10 bg-slate-900/40 p-2" key={item.key}>
                    <p className="font-mono text-xs text-cyan-200">{item.key}</p>
                    <p className="break-all text-slate-200">{item.value}</p>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}
