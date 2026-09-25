import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { cn } from "./cn";

const map = {
  info: ["bg-info-soft border-info/20 text-info", Info],
  warn: ["bg-warn-soft border-warn/25 text-warn", AlertTriangle],
  danger: ["bg-neg-soft border-neg/20 text-neg", OctagonAlert],
  success: ["bg-pos-soft border-pos/20 text-pos", CheckCircle2],
} as const;

export function Callout({ tone = "info", title, children, action, className }: { tone?: keyof typeof map; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  const [cls, Icon] = map[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 animate-slide-up", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn("text-ink-2", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
