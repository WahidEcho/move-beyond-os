import { amount, toNum } from "@/lib/format";
import { cn } from "./cn";

/** Right-aligned tabular amount. `signed` colours negatives; `muted` greys zero. */
export function Money({ value, currency = "EGP", showCurrency = false, signed, className, decimals }: {
  value: unknown; currency?: string; showCurrency?: boolean; signed?: boolean; className?: string; decimals?: boolean;
}) {
  const n = toNum(value);
  return (
    <span className={cn("num whitespace-nowrap", signed && n < 0 && "text-neg", signed && n > 0 && "text-pos", n === 0 && "text-ink-4", className)}>
      {n < 0 ? "−" : ""}
      {amount(Math.abs(n), { decimals })}
      {showCurrency && <span className="ml-1 text-[0.8em] font-normal text-ink-3">{currency}</span>}
    </span>
  );
}
