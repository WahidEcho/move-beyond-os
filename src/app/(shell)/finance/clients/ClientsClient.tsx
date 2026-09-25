"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";
import { ClientDialog, SupplierDialog } from "@/components/finance/forms";
import { humanize, toNum } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function NewClientButton() {
  const [open, setOpen] = useState(false);
  return <><Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" />New client</Button>{open && <ClientDialog open onClose={() => setOpen(false)} />}</>;
}
export function EditClientButton({ client }: { client: any }) {
  const [open, setOpen] = useState(false);
  return <><Button onClick={() => setOpen(true)}>Edit</Button>{open && <ClientDialog open onClose={() => setOpen(false)} client={client} />}</>;
}
export function NewSupplierButton() {
  const [open, setOpen] = useState(false);
  return <><Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" />New supplier</Button>{open && <SupplierDialog open onClose={() => setOpen(false)} />}</>;
}
export function EditSupplierButton({ supplier }: { supplier: any }) {
  const [open, setOpen] = useState(false);
  return <><Button onClick={() => setOpen(true)}>Edit</Button>{open && <SupplierDialog open onClose={() => setOpen(false)} supplier={supplier} />}</>;
}

export function ClientsTable({ rows, showMoney }: { rows: any[]; showMoney: boolean }) {
  const cols: Column<any>[] = [
    { key: "name", header: "Client", cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-[12px] text-ink-3">{r.company_name ?? humanize(r.client_type)}</p></div> },
    { key: "client_type", header: "Type", cell: (r) => humanize(r.client_type) },
    { key: "status", header: "Status", cell: (r) => <Badge tone={r.status === "active" ? "pos" : "neutral"}>{humanize(r.status)}</Badge> },
    { key: "projects_count", header: "Projects", align: "right" },
    { key: "subscriptions_count", header: "Subscriptions", align: "right" },
  ];
  if (showMoney) cols.push(
    { key: "total_revenue", header: "Total revenue", align: "right", cell: (r) => <Money value={r.total_revenue} />, value: (r) => toNum(r.total_revenue), total: true },
    { key: "outstanding", header: "Outstanding", align: "right", cell: (r) => <Money value={r.outstanding} />, value: (r) => toNum(r.outstanding), total: true },
  );
  return <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} rowHref={(r) => `/finance/clients/${r.id}`} exportName="clients" footer={showMoney}
    filters={[{ key: "s", label: "Status", options: [{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }], match: (r, v) => r.status === v }]} />;
}
