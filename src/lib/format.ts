/** Display formatting. Amounts are EGP unless a currency is given. */
const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 1234567.5 → "1,234,568" (whole EGP) or with decimals when they matter. */
export function amount(v: unknown, opts: { decimals?: boolean } = {}): string {
  const n = toNum(v);
  if (opts.decimals || (Math.round(n) !== n && Math.abs(n) < 1000)) return nf2.format(n);
  return nf0.format(Math.round(n));
}

export function egp(v: unknown, opts: { decimals?: boolean } = {}): string {
  return `${amount(v, opts)} EGP`;
}

/** Compact for KPI tiles: 1,250,000 → "1.25M". */
export function compact(v: unknown): string {
  const n = toNum(v);
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2).replace(/\.0+$/, "")}M`;
  if (a >= 10_000) return `${(n / 1000).toFixed(a >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return nf0.format(Math.round(n));
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits).replace(/\.0$/, "")}%`;
}

const df = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Cairo" });
const dfShort = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "Africa/Cairo" });

export function date(v: string | null | undefined, short = false): string {
  if (!v) return "—";
  const d = v.length === 10 ? new Date(`${v}T12:00:00Z`) : new Date(v);
  return (short ? dfShort : df).format(d);
}

export function dateTime(v: string | null | undefined): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" }).format(new Date(v));
}

/** Today in Cairo as YYYY-MM-DD. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
}

export function humanize(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Cairo date N days from today as YYYY-MM-DD. */
export function isoInDays(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(Date.now() + days * 86_400_000));
}
