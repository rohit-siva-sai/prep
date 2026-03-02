import { cn } from "@/lib/utils";

export const AppBackground = () => (
  <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.2),transparent_30%),radial-gradient(circle_at_80%_5%,rgba(16,185,129,0.25),transparent_34%),linear-gradient(145deg,#020617,#0b1123,#111827)]" />
);

export const Panel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <section
    className={cn(
      "rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-xl",
      className,
    )}
  >
    {children}
  </section>
);

export const StatCard = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "cyan" | "emerald" | "blue" | "violet" | "amber" | "indigo";
}) => {
  const toneMap: Record<string, string> = {
    cyan: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
    emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    blue: "border-blue-400/30 bg-blue-500/10 text-blue-100",
    violet: "border-violet-400/30 bg-violet-500/10 text-violet-100",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    indigo: "border-indigo-400/30 bg-indigo-500/10 text-indigo-100",
  };

  return (
    <div className={cn("rounded-xl border p-4", toneMap[tone])}>
      <p className="text-xs uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-100">{value}</p>
    </div>
  );
};
