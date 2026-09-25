import { cn } from "./cn";

export type Tone = "neutral" | "pos" | "neg" | "warn" | "info" | "dark";
const tones: Record<Tone, string> = {
  neutral: "bg-muted text-ink-2 ring-line",
  pos: "bg-pos-soft text-pos ring-pos/15",
  neg: "bg-neg-soft text-neg ring-neg/15",
  warn: "bg-warn-soft text-warn ring-warn/15",
  info: "bg-info-soft text-info ring-info/15",
  dark: "bg-ink text-white ring-ink",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium ring-1 ring-inset", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS: Record<string, [string, Tone]> = {
  // operational
  lead: ["Lead", "neutral"], confirmed: ["Confirmed", "info"], preparation: ["Preparation", "info"], live: ["Live", "pos"],
  completed: ["Completed", "dark"], cancelled: ["Cancelled", "neutral"],
  // financial
  draft: ["Draft", "neutral"], funding_required: ["Funding required", "warn"], active: ["Active", "info"],
  awaiting_collection: ["Awaiting collection", "warn"], settlement_required: ["Settlement required", "warn"],
  partially_settled: ["Partially settled", "info"], financially_closed: ["Financially closed", "pos"],
  // expenses
  estimated: ["Estimate", "neutral"], committed: ["Committed", "info"], partially_paid: ["Partially paid", "warn"], paid: ["Paid", "pos"],
  // CTO
  recovery_pending: ["Recovery pending", "warn"], partially_recovered: ["Partially recovered", "info"],
  fully_recovered: ["Fully recovered", "pos"], no_value: ["No value", "neutral"], archived: ["Archived", "neutral"],
  planned: ["Planned", "neutral"], in_development: ["In development", "info"],
  // subscriptions
  trial: ["Trial", "info"], paused: ["Paused", "warn"], expired: ["Expired", "neutral"],
  // fees
  suggested: ["Suggested", "warn"], accepted: ["Accepted", "pos"], ignored: ["Ignored", "neutral"], reversed: ["Reversed", "neutral"],
  allocated: ["Allocated", "pos"],
  // ageing
  current: ["Current", "neutral"], "1_30": ["1–30 days", "warn"], "31_60": ["31–60 days", "warn"], "61_90": ["61–90 days", "neg"], "90_plus": ["90+ days", "neg"],
  // priority
  critical: ["Critical", "neg"], high: ["High", "warn"], normal: ["Normal", "info"], low: ["Low", "neutral"],
};

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return null;
  const [label, tone] = STATUS[status] ?? [status.replace(/_/g, " "), "neutral" as Tone];
  return <Badge tone={tone} className={className}>{label}</Badge>;
}
