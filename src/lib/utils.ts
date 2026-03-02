export const cn = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

export const formatPercent = (value: number, digits = 1) =>
  `${Number.isFinite(value) ? value.toFixed(digits) : "0.0"}%`;

export const formatDate = (ts: number) => new Date(ts).toLocaleString();

export const minutesFromSeconds = (sec: number) => Math.max(1, Math.floor(sec / 60));

export const splitPoints = (raw: string) => {
  const source = (raw || "").trim();
  if (!source) return [] as string[];
  const first = source
    .split(/\r?\n|,/) 
    .map((v) => v.trim())
    .filter(Boolean);
  if (first.length > 1) return first;
  return source
    .split(/(?<=[.!?])\s+/)
    .map((v) => v.trim())
    .filter(Boolean);
};

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
