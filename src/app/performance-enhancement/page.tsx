"use client";

import Link from "next/link";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel } from "@/components/ui/primitives";

const predictorCards = [
  {
    href: "/exam-predictor",
    title: "Exam Predictor",
    eyebrow: "Tests Only",
    description: "Analyze selected exam attempts to find weak topics, topic risk, and targeted study actions.",
    accent: "border-cyan-300/25 bg-cyan-500/10",
    actionClass: "border-cyan-300/40 text-cyan-100 hover:bg-cyan-500/20",
  },
  {
    href: "/interview-predictor",
    title: "Interview Predictor",
    eyebrow: "Interview + Combined",
    description:
      "Run interview-only feedback analysis or switch to a combined mode that blends interview feedback with selected tests.",
    accent: "border-emerald-300/25 bg-emerald-500/10",
    actionClass: "border-emerald-300/40 text-emerald-100 hover:bg-emerald-500/20",
  },
];

export default function PerformanceEnhancementPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:py-10">
      <AppBackground />
      <div className="mx-auto max-w-6xl">
        <TopNav
          title="Performance Enhancement AI"
          subtitle="Choose the predictor workspace you want to run"
          actions={[
            { href: "/tracks", label: "Exam Tracks" },
            { href: "/interviews", label: "Interview Tracks" },
            { href: "/exam-predictor", label: "Exam Predictor" },
            { href: "/interview-predictor", label: "Interview Predictor" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
        />

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          {predictorCards.map((card) => (
            <Panel className={card.accent} key={card.href}>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-200">{card.eyebrow}</p>
              <h2 className="mt-3 font-display text-3xl">{card.title}</h2>
              <p className="mt-3 min-h-20 text-sm leading-6 text-slate-200">{card.description}</p>
              <Link
                className={`mt-6 inline-flex rounded-xl border px-4 py-3 font-medium transition-colors ${card.actionClass}`}
                href={card.href}
              >
                Open {card.title}
              </Link>
            </Panel>
          ))}
        </section>
      </div>
    </main>
  );
}
