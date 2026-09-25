"use client";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { date, humanize, pct } from "@/lib/format";

export interface ProjectRow {
  id: string; code: string; name: string; client: string | null; type: string; op: string; fin: string; start: string | null;
  contract: number; collected: number; outstanding: number; actual: number; forecast: number; margin: number | null; marketing: boolean;
}

const TYPES = ["event", "one_time_service", "subscription", "recurring_contract", "product_sale", "sponsorship", "internal", "other"];
const OPS = ["lead", "confirmed", "preparation", "live", "completed", "cancelled"];
const FINS = ["draft", "funding_required", "active", "awaiting_collection", "settlement_required", "partially_settled", "financially_closed"];

export function ProjectsTable({ rows, showMoney }: { rows: ProjectRow[]; showMoney: boolean }) {
  const cols: Column<ProjectRow>[] = [
    { key: "code", header: "Code", cell: (r) => <span className="num font-medium">{r.code}</span>, width: "96px" },
    { key: "name", header: "Project", cell: (r) => (
      <div className="min-w-[220px]"><p className="font-medium">{r.name}</p><p className="text-[12px] text-ink-3">{r.client ?? "No client"} · {humanize(r.type)}</p></div>),
      value: (r) => `${r.name} ${r.client ?? ""}` },
    { key: "client", header: "Client", hidden: true, value: (r) => r.client },
    { key: "op", header: "Operational", cell: (r) => <StatusBadge status={r.op} /> },
    { key: "fin", header: "Financial", cell: (r) => <StatusBadge status={r.fin} /> },
    { key: "start", header: "Start", cell: (r) => <span className="text-ink-2">{date(r.start)}</span>, value: (r) => r.start },
  ];
  if (showMoney) {
    cols.push(
      { key: "contract", header: "Contract", align: "right", cell: (r) => <Money value={r.contract} />, total: true },
      { key: "collected", header: "Collected", align: "right", cell: (r) => <Money value={r.collected} />, total: true },
      { key: "outstanding", header: "Outstanding", align: "right", cell: (r) => <Money value={r.outstanding} />, total: true },
      { key: "actual", header: "Actual cost", align: "right", cell: (r) => <Money value={r.actual} />, total: true, hidden: true },
      { key: "forecast", header: "Forecast profit", align: "right", total: true,
        cell: (r) => r.marketing && r.contract === 0 ? <Badge tone="info">Marketing investment</Badge> : <Money value={r.forecast} signed /> },
      { key: "margin", header: "Margin", align: "right", cell: (r) => <span className="text-ink-2">{pct(r.margin, 0)}</span>, value: (r) => r.margin ?? -999 },
    );
  }
  return (
    <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} rowHref={(r) => `/finance/projects/${r.id}`} exportName="projects"
      searchPlaceholder="Search by name, code or client…" footer={showMoney}
      filters={[
        { key: "type", label: "Type", options: TYPES.map((t) => ({ value: t, label: humanize(t) })), match: (r, v) => r.type === v },
        { key: "op", label: "Operational", options: OPS.map((t) => ({ value: t, label: humanize(t) })), match: (r, v) => r.op === v },
        { key: "fin", label: "Financial", options: FINS.map((t) => ({ value: t, label: humanize(t) })), match: (r, v) => r.fin === v },
      ]} />
  );
}
