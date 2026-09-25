"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Columns3, Download, Search } from "lucide-react";
import { cn } from "./cn";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  cell?: (row: T) => React.ReactNode;
  /** Plain value for sorting, searching and CSV export. */
  value?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  width?: string;
  hidden?: boolean;
  sortable?: boolean;
  /** Footer total for numeric columns. */
  total?: boolean;
}

export interface Filter<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
}

/**
 * Finance-grade table (spec §109): search, filters, sort, pagination, column
 * visibility, CSV export, totals. Dense, tabular numbers, no card-ification.
 */
export function DataTable<T>({ rows, columns, rowKey, rowHref, filters = [], searchPlaceholder = "Search…", pageSize = 25,
  exportName, empty, initialSort, toolbar, dense, footer }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; rowHref?: (r: T) => string | null; filters?: Filter<T>[];
  searchPlaceholder?: string; pageSize?: number; exportName?: string; empty?: React.ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" }; toolbar?: React.ReactNode; dense?: boolean; footer?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.hidden).map((c) => c.key)));
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showCols, setShowCols] = useState(false);

  const visible = columns.filter((c) => !hidden.has(c.key));
  const valueOf = (c: Column<T>, r: T) => (c.value ? c.value(r) : (r as Record<string, unknown>)[c.key] as string | number | null | undefined);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) =>
      filters.every((f) => !filterValues[f.key] || f.match(r, filterValues[f.key])) &&
      (!needle || columns.some((c) => String(valueOf(c, r) ?? "").toLowerCase().includes(needle))));
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      if (c) {
        out = [...out].sort((a, b) => {
          const va = valueOf(c, a), vb = valueOf(c, b);
          const na = typeof va === "number" ? va : Number(va), nb = typeof vb === "number" ? vb : Number(vb);
          const cmp = Number.isFinite(na) && Number.isFinite(nb) && va !== "" && vb !== "" && va !== null && vb !== null
            ? na - nb : String(va ?? "").localeCompare(String(vb ?? ""));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sort, filterValues]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const exportCsv = () => {
    const cols = visible;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.map((c) => esc(c.header)).join(","), ...filtered.map((r) => cols.map((c) => esc(valueOf(c, r))).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const totals = footer ? visible.map((c) => (c.total ? filtered.reduce((acc, r) => acc + (Number(valueOf(c, r)) || 0), 0) : null)) : [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={searchPlaceholder}
            className="h-8 w-full rounded-lg border border-line bg-subtle pl-8 pr-3 text-[13px] placeholder:text-ink-4 focus:border-info focus:bg-surface focus:outline-none" />
        </div>
        {filters.map((f) => (
          <select key={f.key} value={filterValues[f.key] ?? ""} onChange={(e) => { setFilterValues((v) => ({ ...v, [f.key]: e.target.value })); setPage(0); }}
            className={cn("h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink-2 focus:outline-none", filterValues[f.key] && "border-ink-4 text-ink")}>
            <option value="">{f.label}: All</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {toolbar}
          <div className="relative">
            <button onClick={() => setShowCols((s) => !s)} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-ink-3 hover:bg-muted hover:text-ink" title="Columns">
              <Columns3 className="size-3.5" />
            </button>
            {showCols && (
              <div className="absolute right-0 top-9 z-20 w-52 rounded-xl border border-line bg-surface p-2 shadow-[var(--shadow-pop)]" onMouseLeave={() => setShowCols(false)}>
                {columns.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-muted">
                    <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} />
                    {c.header}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button onClick={exportCsv} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-ink-3 hover:bg-muted hover:text-ink" title="Export CSV">
            <Download className="size-3.5" /> <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-line bg-subtle">
              {visible.map((c) => {
                const sortable = c.sortable !== false;
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} style={{ width: c.width }}
                    className={cn("whitespace-nowrap px-4 py-2 text-[12px] font-medium text-ink-3", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}>
                    {sortable ? (
                      <button className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}
                        onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === "asc" ? { key: c.key, dir: "desc" } : null) : { key: c.key, dir: "asc" }))}>
                        {c.header}
                        {active && (sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => {
              const href = rowHref?.(r);
              return (
                <tr key={rowKey(r)} onClick={href ? (e) => { if (!(e.target as HTMLElement).closest("a,button,input,select")) router.push(href); } : undefined}
                  className={cn("border-b border-line last:border-0", href && "cursor-pointer hover:bg-subtle")}>
                  {visible.map((c) => (
                    <td key={c.key} className={cn("px-4 align-middle text-ink", dense ? "py-1.5" : "py-2.5",
                      c.align === "right" ? "num text-right" : c.align === "center" ? "text-center" : "text-left")}>
                      {c.cell ? c.cell(r) : String(valueOf(c, r) ?? "—")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {footer && slice.length > 0 && (
            <tfoot>
              <tr className="border-t border-line-strong bg-subtle font-semibold">
                {visible.map((c, i) => (
                  <td key={c.key} className={cn("px-4 py-2.5 num", c.align === "right" && "text-right")}>
                    {i === 0 ? "Total" : totals[i] !== null && totals[i] !== undefined ? Math.round(totals[i]!).toLocaleString("en-US") : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
        {filtered.length === 0 && (empty ?? <EmptyState title={rows.length ? "No matches" : "Nothing here yet"} body={rows.length ? "Try a different search or filter." : undefined} />)}
      </div>

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[12.5px] text-ink-3">
          <span className="num">{current * pageSize + 1}–{Math.min((current + 1) * pageSize, filtered.length)} of {filtered.length}</span>
          <div className="flex gap-1">
            <button disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded-md px-2 py-1 hover:bg-muted disabled:opacity-40">Previous</button>
            <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded-md px-2 py-1 hover:bg-muted disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
