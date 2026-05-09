"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FiActivity,
  FiBookOpen,
  FiClipboard,
  FiCode,
  FiMessageSquare,
  FiShield,
} from "react-icons/fi";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";

const studentLaunchpad = [
  {
    href: "/tracks",
    label: "Exam Tracks",
    description: "Open and attempt your test tracks.",
    icon: FiClipboard,
    iconGlow: "text-amber-200 shadow-[0_0_28px_rgba(251,191,36,0.35)] group-hover:shadow-[0_0_34px_rgba(251,191,36,0.52)]",
  },
  {
    href: "/interviews",
    label: "Interview Tracks",
    description: "Practice AI interviews and review sessions.",
    icon: FiMessageSquare,
    iconGlow: "text-amber-200 shadow-[0_0_28px_rgba(251,191,36,0.35)] group-hover:shadow-[0_0_34px_rgba(251,191,36,0.52)]",
  },
  {
    href: "/project-interviews",
    label: "Project Interview Tracks",
    description: "Practice project viva rounds based on your uploaded project details.",
    icon: FiMessageSquare,
    iconGlow: "text-amber-200 shadow-[0_0_28px_rgba(251,191,36,0.35)] group-hover:shadow-[0_0_34px_rgba(251,191,36,0.52)]",
  },
  {
    href: "/coding",
    label: "Coding Tracks",
    description: "Solve coding rounds in the browser IDE and get evaluated feedback.",
    icon: FiCode,
    iconGlow: "text-amber-200 shadow-[0_0_28px_rgba(251,191,36,0.35)] group-hover:shadow-[0_0_34px_rgba(251,191,36,0.52)]",
  },
  {
    href: "/history",
    label: "Result Stream",
    description: "See your latest exam and interview results.",
    icon: FiActivity,
    iconGlow: "text-amber-200 shadow-[0_0_28px_rgba(251,191,36,0.35)] group-hover:shadow-[0_0_34px_rgba(251,191,36,0.52)]",
  },
];

const adminLaunchpad = [
  {
    href: "/admin/exams",
    label: "Exam Admin",
    description: "Create, repair, and manage exam tracks.",
    icon: FiBookOpen,
    iconGlow: "text-amber-200 shadow-[0_0_28px_rgba(251,191,36,0.35)] group-hover:shadow-[0_0_34px_rgba(251,191,36,0.52)]",
  },
  {
    href: "/admin/interviews",
    label: "Interview Admin",
    description: "Configure interview flows and question sets.",
    icon: FiMessageSquare,
    iconGlow: "text-amber-200 shadow-[0_0_28px_rgba(251,191,36,0.35)] group-hover:shadow-[0_0_34px_rgba(251,191,36,0.52)]",
  },
  {
    href: "/admin/project-interviews",
    label: "Project Interview Admin",
    description: "Create project-focused viva tracks from uploaded project details.",
    icon: FiMessageSquare,
    iconGlow: "text-amber-200 shadow-[0_0_28px_rgba(251,191,36,0.35)] group-hover:shadow-[0_0_34px_rgba(251,191,36,0.52)]",
  },
  {
    href: "/admin/coding",
    label: "Coding Admin",
    description: "Generate and manage coding tracks with IDE-ready prompts.",
    icon: FiCode,
    iconGlow: "text-amber-200 shadow-[0_0_28px_rgba(251,191,36,0.35)] group-hover:shadow-[0_0_34px_rgba(251,191,36,0.52)]",
  },
  {
    href: "/admin/performance",
    label: "Student Performance",
    description: "Review student outcomes and coaching opportunities.",
    icon: FiShield,
    iconGlow: "text-amber-200 shadow-[0_0_28px_rgba(251,191,36,0.35)] group-hover:shadow-[0_0_34px_rgba(251,191,36,0.52)]",
  },
];

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (!user) return null;

  const launchpad = user.role === "admin" ? [...adminLaunchpad, ...studentLaunchpad] : studentLaunchpad;

  return (
    <main className="min-h-screen px-4 py-8 md:py-10">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <Panel className="p-6 md:p-8">
          <TopNav
            title="Welcome"
            subtitle={user.fullName}
            actions={[{ href: "/logout", label: "Logout", danger: true }]}
          />

          <div className="mt-8">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Launchpad</p>
                <h2 className="mt-2 font-display text-3xl">Pick where you want to work</h2>
              </div>
              <p className="max-w-2xl text-sm text-slate-300">
                Quick access to exams, interviews, coding tracks, and admin controls.
              </p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {launchpad.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    className="group cursor-pointer rounded-3xl border border-white/10 bg-[linear-gradient(160deg,rgba(15,23,42,0.9),rgba(15,23,42,0.84),rgba(12,74,110,0.24))] p-5 shadow-2xl shadow-slate-950/25 backdrop-blur transition duration-200 hover:-translate-y-1 hover:border-cyan-300/20 hover:bg-[linear-gradient(160deg,rgba(15,23,42,0.92),rgba(15,23,42,0.86),rgba(6,95,70,0.22))]"
                    href={item.href}
                    key={item.href}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div
                        className={`rounded-2xl border border-amber-200/20 bg-slate-950/70 p-3 transition ${item.iconGlow}`}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-300 transition group-hover:text-white">
                        Open
                      </span>
                    </div>
                    <h3 className="mt-5 font-display text-2xl text-slate-50">{item.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        </Panel>
      </div>
    </main>
  );
}
