import { num, round2 } from "./money";

export interface ReceivableRow {
  milestone_id: string;
  outstanding: number | string;
  fx_rate: number | string;
  due_date: string | null;
  days_overdue: number;
  ageing_bucket: "paid" | "current" | "1_30" | "31_60" | "61_90" | "90_plus";
}

export const AGEING_BUCKETS = [
  { key: "current", label: "Current" },
  { key: "1_30", label: "1–30 days" },
  { key: "31_60", label: "31–60 days" },
  { key: "61_90", label: "61–90 days" },
  { key: "90_plus", label: "90+ days" },
] as const;

export const DUE_WINDOWS = [
  { key: "today", label: "Due today", days: 0 },
  { key: "d7", label: "Next 7 days", days: 7 },
  { key: "d14", label: "Next 14 days", days: 14 },
  { key: "d30", label: "Next 30 days", days: 30 },
] as const;

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Collections Center summary (spec §34). Amounts in EGP. */
export function summarizeCollections(rows: ReceivableRow[], todayIso: string) {
  const ageing: Record<string, number> = { current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
  const windows: Record<string, number> = { today: 0, d7: 0, d14: 0, d30: 0 };
  let total = 0;
  let overdue = 0;
  for (const r of rows) {
    const amt = round2(num(r.outstanding) * (num(r.fx_rate) || 1));
    if (amt <= 0) continue;
    total += amt;
    if (r.ageing_bucket in ageing) ageing[r.ageing_bucket] += amt;
    if (r.days_overdue > 0) overdue += amt;
    if (r.due_date) {
      const d = daysBetween(todayIso, r.due_date);
      if (d === 0) windows.today += amt;
      for (const w of DUE_WINDOWS) if (d >= 0 && d <= w.days && w.key !== "today") windows[w.key] += amt;
    }
  }
  for (const k of Object.keys(ageing)) ageing[k] = round2(ageing[k]);
  for (const k of Object.keys(windows)) windows[k] = round2(windows[k]);
  return { total: round2(total), overdue: round2(overdue), ageing, windows };
}
