import { cn } from "./cn";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-3.5", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

/** Label / value rows for summaries. */
export function DefinitionList({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; hint?: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {items.map((it, i) => (
        <div key={i} className={cn("flex items-baseline justify-between gap-4 py-2 text-sm", it.strong && "font-semibold")}>
          <dt className={cn("text-ink-2", it.strong && "text-ink")}>
            {it.label}
            {it.hint && <span className="ml-1.5 text-xs font-normal text-ink-3">{it.hint}</span>}
          </dt>
          <dd className="num text-right text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
