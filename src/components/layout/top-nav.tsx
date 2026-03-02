import Link from "next/link";

export const TopNav = ({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: Array<{ href: string; label: string; danger?: boolean }>;
}) => (
  <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div>
      <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-slate-300">{subtitle}</p> : null}
    </div>
    {actions ? (
      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
        {actions.map((action) => (
          <Link
            className={
              action.danger
                ? "rounded-xl bg-red-500/80 px-4 py-2 hover:bg-red-500"
                : "rounded-xl border border-white/20 px-4 py-2 hover:bg-white/10"
            }
            href={action.href}
            key={action.href + action.label}
          >
            {action.label}
          </Link>
        ))}
      </div>
    ) : null}
  </header>
);
