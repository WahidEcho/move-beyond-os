"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Building2, ChevronDown, CornerDownLeft, FolderKanban, LogOut, Package, Search, Truck, Cpu, Layers } from "lucide-react";
import { globalSearch, signOut, switchOrganization, type SearchHit } from "@/app/actions/shell";
import { cn } from "@/components/ui/cn";

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  project: FolderKanban, client: Building2, supplier: Truck, technology: Cpu, asset: Package, service: Layers,
};

export function Topbar({ orgName, orgs, orgId, userLabel, alertCount }: {
  orgName: string; orgs: { id: string; name: string }[]; orgId: string; userLabel: string; alertCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:px-6">
      <button onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-[520px] items-center gap-2 rounded-lg border border-line bg-subtle px-3 text-[13.5px] text-ink-3 transition-colors hover:border-line-strong">
        <Search className="size-4" />
        <span>Search projects, clients, suppliers, technology…</span>
        <kbd className="ml-auto hidden rounded border border-line bg-surface px-1.5 font-sans text-[11px] text-ink-3 sm:block">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        <Link href="/finance/alerts" className="relative rounded-lg p-2 text-ink-2 hover:bg-muted" aria-label="Alerts">
          <Bell className="size-[18px]" />
          {alertCount > 0 && (
            <span className="num absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neg px-1 text-[10px] font-semibold text-white">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
            <span className="flex size-7 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">{userLabel.slice(0, 1).toUpperCase()}</span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-[13px] font-medium">{userLabel}</span>
              <span className="block text-[11.5px] text-ink-3">{orgName}</span>
            </span>
            <ChevronDown className="size-3.5 text-ink-3" />
          </button>
          {menu && (
            <div className="absolute right-0 top-11 z-40 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)] animate-slide-up" onMouseLeave={() => setMenu(false)}>
              {orgs.length > 1 && (
                <>
                  <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4">Organization</p>
                  {orgs.map((o) => (
                    <form key={o.id} action={switchOrganization.bind(null, o.id)}>
                      <button className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted", o.id === orgId && "font-medium")}>
                        <Building2 className="size-3.5 text-ink-3" /> {o.name}
                        {o.id === orgId && <span className="ml-auto size-1.5 rounded-full bg-pos" />}
                      </button>
                    </form>
                  ))}
                  <div className="my-1 border-t border-line" />
                </>
              )}
              <form action={signOut}>
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-muted">
                  <LogOut className="size-3.5" /> Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
      {open && <CommandSearch onClose={() => setOpen(false)} />}
    </header>
  );
}

function CommandSearch({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sel, setSel] = useState(0);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const t = setTimeout(() => start(async () => { setHits(await globalSearch(q)); setSel(0); }), 160);
    return () => clearTimeout(t);
  }, [q]);

  const go = (h?: SearchHit) => { if (!h) return; onClose(); router.push(h.href); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgb(14_14_17/0.3)] pt-[12vh] animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-[600px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)] animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-ink-3" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or code (e.g. MB-26001)…"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter") go(hits[sel]);
            }}
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-4" />
          {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-ink-4 border-r-transparent" />}
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {q.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink-3">Type at least two characters.</p>
          ) : hits.length === 0 && !pending ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink-3">No results for “{q}”.</p>
          ) : (
            hits.map((h, i) => {
              const Icon = KIND_ICON[h.kind] ?? Layers;
              return (
                <button key={`${h.kind}-${h.id}`} onMouseEnter={() => setSel(i)} onClick={() => go(h)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === sel && "bg-muted")}>
                  <Icon className="size-4 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{h.title}</span>
                    <span className="block truncate text-[12px] text-ink-3">{h.subtitle}</span>
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-ink-4">{h.kind}</span>
                  {i === sel && <CornerDownLeft className="size-3.5 text-ink-3" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
