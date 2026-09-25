"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";

/** Modal dialog (or right-side drawer with `side`). Esc and backdrop close it. */
export function Dialog({ open, onClose, title, subtitle, children, footer, size = "md", side }: {
  open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode;
  footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl"; side?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input,select,textarea,button[data-autofocus]")?.focus(), 30);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };
  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[rgb(14_14_17/0.36)]" onClick={onClose} />
      <div ref={ref} className={cn(
        "relative flex w-full flex-col bg-surface shadow-[var(--shadow-pop)]",
        side ? cn("ml-auto h-full animate-slide-in-right", widths[size]) : cn("m-auto max-h-[90vh] rounded-2xl animate-slide-up", widths[size]),
      )}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-muted hover:text-ink" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3 rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
