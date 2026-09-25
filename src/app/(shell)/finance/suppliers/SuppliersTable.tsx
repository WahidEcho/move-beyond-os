"use client";
import { DataTable } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { date, toNum } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function SuppliersTable({ rows }: { rows: any[] }) {
  return <DataTable rows={rows} rowKey={(r) => r.supplier_id} rowHref={(r) => `/finance/suppliers/${r.supplier_id}`} exportName="suppliers" footer
    columns={[
      { key: "name", header: "Supplier", cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-[12px] text-ink-3">{r.category ?? "—"}</p></div> },
      { key: "phone", header: "Phone" },
      { key: "projects_count", header: "Projects", align: "right" },
      { key: "total_committed", header: "Total spend", align: "right", cell: (r) => <Money value={r.total_committed} />, value: (r) => toNum(r.total_committed), total: true },
      { key: "total_paid", header: "Paid", align: "right", cell: (r) => <Money value={r.total_paid} />, value: (r) => toNum(r.total_paid), total: true },
      { key: "outstanding", header: "Outstanding", align: "right", cell: (r) => <b><Money value={r.outstanding} /></b>, value: (r) => toNum(r.outstanding), total: true },
      { key: "next_due_date", header: "Next due", cell: (r) => date(r.next_due_date) },
    ]} />;
}
