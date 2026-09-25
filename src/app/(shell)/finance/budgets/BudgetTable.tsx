"use client";
import { DataTable } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function BudgetTable({ rows }: { rows: any[] }) {
  return <DataTable rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/finance/projects/${r.id}`} exportName="budget-vs-actual" footer
    columns={[
      { key: "name", header: "Project", cell: (r) => <span><span className="num text-ink-3">{r.code}</span> {r.name}</span> },
      { key: "budget", header: "Budget", align: "right", cell: (r) => <Money value={r.budget} />, total: true },
      { key: "actual", header: "Actual", align: "right", cell: (r) => <Money value={r.actual} />, total: true },
      { key: "committed", header: "Committed", align: "right", cell: (r) => <Money value={r.committed} />, total: true },
      { key: "forecast", header: "Forecast", align: "right", cell: (r) => <Money value={r.forecast} />, total: true },
      { key: "variance", header: "Variance", align: "right", cell: (r) => <Money value={r.variance} signed />, total: true },
    ]} />;
}
