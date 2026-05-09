"use client";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel } from "@/components/ui/primitives";

export default function PerformanceEnhancementPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:py-10">
      <AppBackground />
      <div className="mx-auto max-w-6xl">
        <TopNav
          title="Performance Enhancement AI"
          subtitle="Navigation hub"
          actions={[
            { href: "/tracks", label: "Exam Tracks" },
            { href: "/interviews", label: "Interview Tracks" },
            { href: "/dashboard", label: "Dashboard" },
          ]}
        />

        <Panel className="mt-8">
          <h2 className="font-display text-3xl">Predictor shortcuts removed</h2>
          <p className="mt-3 text-sm leading-6 text-slate-200">
            The predictor buttons have been removed from the app navigation. Use the main dashboard,
            exam tracks, interview tracks, and coding sections to continue.
          </p>
        </Panel>
      </div>
    </main>
  );
}
