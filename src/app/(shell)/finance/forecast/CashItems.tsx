"use client";
import { DataTable } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";
import { date, humanize } from "@/lib/format";
import type { CashItem } from "@/engines/cashflow";

export function CashItems({ rows }: { rows: CashItem[] }) {
  return <DataTable rows={rows.map((r, i) => ({ ...r, i }))} rowKey={(r) => String(r.i)} dense footer pageSize={15} exportName="cash-items" initialSort={{ key: "date", dir: "asc" }}
    columns={[
      { key: "date", header: "When", cell: (r) => (r.date ? date(r.date) : "Now"), value: (r) => r.date ?? "0000" },
      { key: "label", header: "Item" },
      { key: "kind", header: "Type", cell: (r) => <Badge>{humanize(r.kind)}</Badge> },
      { key: "amount", header: "Amount", align: "right", cell: (r) => <Money value={r.amount} />, total: true },
    ]} />;
}
