"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, OctagonAlert, AlertTriangle, X } from "lucide-react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "warn";
interface Toast { id: number; tone: ToastTone; title: string; body?: string }
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.tone === "error" ? 9000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "warn" ? AlertTriangle : OctagonAlert;
          return (
            <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow-pop)] animate-slide-up" role="status">
              <Icon className={cn("mt-0.5 size-4 shrink-0", t.tone === "success" ? "text-pos" : t.tone === "warn" ? "text-warn" : "text-neg")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[13px] text-ink-3">{t.body}</p>}
              </div>
              <button onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="text-ink-4 hover:text-ink"><X className="size-3.5" /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
