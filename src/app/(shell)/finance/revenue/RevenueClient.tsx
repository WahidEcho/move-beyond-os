"use client";
import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";
import { date, toNum } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function MonthlyTable({ rows }: { rows: any[] }) {
  const data = [...rows].reverse().map((m) => {
    const gross = toNum(m.revenue) - toNum(m.direct_cost);
    return { ...m, gross, net: gross - toNum(m.fee_cost) - toNum(m.cto_cost) - toNum(m.overhead) };
  });
  return (
    <DataTable rows={data} rowKey={(r) => r.month} exportName="company-pnl" footer pageSize={24} dense
      columns={[
        { key: "month", header: "Month", cell: (r) => new Date(`${r.month}T12:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric" }) },
        { key: "revenue", header: "Revenue", align: "right", cell: (r) => <Money value={r.revenue} />, value: (r) => toNum(r.revenue), total: true },
        { key: "direct_cost", header: "Direct costs", align: "right", cell: (r) => <Money value={r.direct_cost} />, value: (r) => toNum(r.direct_cost), total: true },
        { key: "gross", header: "Gross profit", align: "right", cell: (r) => <Money value={r.gross} signed />, total: true },
        { key: "fee_cost", header: "Partner fees", align: "right", cell: (r) => <Money value={r.fee_cost} />, value: (r) => toNum(r.fee_cost), total: true },
        { key: "cto_cost", header: "CTO recovery", align: "right", cell: (r) => <Money value={r.cto_cost} />, value: (r) => toNum(r.cto_cost), total: true },
        { key: "overhead", header: "Overhead", align: "right", cell: (r) => <Money value={r.overhead} />, value: (r) => toNum(r.overhead), total: true },
        { key: "net", header: "Net profit", align: "right", cell: (r) => <b><Money value={r.net} signed /></b>, total: true },
      ]} />
  );
}

export function CollectionsLog({ rows }: { rows: any[] }) {
  return (
    <DataTable rows={rows} rowKey={(r) => r.id} exportName="collections" footer
      filters={[{ key: "acc", label: "Received into", options: Array.from(new Set(rows.map((r) => r.cash_accounts?.name))).filter(Boolean).map((n) => ({ value: n, label: n })), match: (r, v) => r.cash_accounts?.name === v }]}
      columns={[
        { key: "collection_date", header: "Date", cell: (r) => date(r.collection_date) },
        { key: "client", header: "Client", value: (r) => r.clients?.name ?? "—" },
        { key: "project", header: "Project", cell: (r) => <Link className="hover:underline" href={`/finance/projects/${r.project_id}?tab=revenue`}><span className="num text-ink-3">{r.projects?.code}</span> {r.projects?.name}</Link>, value: (r) => `${r.projects?.code} ${r.projects?.name}` },
        { key: "reference", header: "Reference", cell: (r) => <>{r.reference ?? "—"}{r.kind === "refund" && <Badge tone="neg" className="ml-2">Refund</Badge>}</> },
        { key: "acc", header: "Received into", value: (r) => r.cash_accounts?.name },
        { key: "amount_egp", header: "Amount (EGP)", align: "right", cell: (r) => <Money value={r.kind === "refund" ? -toNum(r.amount_egp) : r.amount_egp} signed={r.kind === "refund"} />, value: (r) => (r.kind === "refund" ? -1 : 1) * toNum(r.amount_egp), total: true },
      ]} />
  );
}
