"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { AppBackground, Panel } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (!user) return null;

  return (
    <main className="min-h-screen px-4 py-8 md:py-10">
      <AppBackground />
      <div className="mx-auto max-w-7xl">
        <Panel className="p-6 md:p-8">
          <TopNav
            title="Welcome"
            subtitle={user.fullName}
            actions={[
              ...(user.role === "admin"
                ? [
                    { href: "/admin/exams", label: "Exam Admin" },
                   
                  ]
                : []),
              { href: "/tracks", label: "Exam Tracks" },
             
              { href: "/history", label: "Result Stream" },
              { href: "/logout", label: "Logout", danger: true },
            ]}
          />
        </Panel>
      </div>
    </main>
  );
}
