import Link from "next/link";
import { cn } from "./cn";

/** URL-driven tabs (?tab=key) so every tab is linkable. */
export function Tabs({ tabs, active, baseHref }: { tabs: { key: string; label: string; count?: number }[]; active: string; baseHref: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link key={t.key} href={`${baseHref}?tab=${t.key}`} scroll={false}
          className={cn("-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            active === t.key ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="num rounded bg-muted px-1.5 text-[11px] text-ink-2">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}
