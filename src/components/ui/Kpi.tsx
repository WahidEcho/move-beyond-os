import Link from "next/link";
import { compact, toNum } from "@/lib/format";
import { cn } from "./cn";

export function Kpi({ label, value, hint, tone, href, format = "money", className }: {
  label: string; value: unknown; hint?: React.ReactNode; tone?: "pos" | "neg" | "warn"; href?: string;
  format?: "money" | "count" | "text"; className?: string;
}) {
  const display = format === "money" ? compact(value) : format === "count" ? String(toNum(value)) : String(value ?? "—");
  const inner = (
    <>
      <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
      <p className={cn("num mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink",
        tone === "pos" && "text-pos", tone === "neg" && "text-neg", tone === "warn" && "text-warn")}>
        {format === "money" && toNum(value) < 0 ? "−" + compact(Math.abs(toNum(value))) : display}
        {format === "money" && <span className="ml-1 text-[12px] font-medium text-ink-3">EGP</span>}
      </p>
      {hint && <p className="mt-1.5 text-[12px] text-ink-3">{hint}</p>}
    </>
  );
  const cls = cn("block rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3.5 shadow-[var(--shadow-card)]", href && "transition-colors hover:border-line-strong", className);
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4", className)}>{children}</div>;
}
