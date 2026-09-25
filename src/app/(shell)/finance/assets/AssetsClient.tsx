"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { saveAsset } from "@/app/actions/masterdata";
import { useAction } from "@/components/ui/useAction";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { DataTable } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { ExpenseDialog } from "@/components/finance/ExpenseForm";
import { date, humanize, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function BuyAssetButton({ lookups }: { lookups: Lookups }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" />Add asset</Button>
    {open && <ExpenseDialog open onClose={() => setOpen(false)} lookups={lookups} initialType="owned_asset" title="Add asset (purchase)" />}</>;
}

export function AssetsTable({ rows, lookups, canManage }: { rows: any[]; lookups: Lookups; canManage: boolean }) {
  const [edit, setEdit] = useState<any>(null);
  return (
    <>
      <DataTable rows={rows} rowKey={(r) => r.id} exportName="asset-register" footer
        filters={[{ key: "c", label: "Category", options: lookups.assetCategories.map((c) => ({ value: c.name, label: c.name })), match: (r, v) => r.asset_categories?.name === v }]}
        columns={[
          { key: "name", header: "Asset", cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-[12px] text-ink-3">{r.asset_categories?.name ?? "—"}{r.serial_number ? ` · SN ${r.serial_number}` : ""}</p></div> },
          { key: "quantity_owned", header: "Owned", align: "right", value: (r) => toNum(r.quantity_owned) },
          { key: "available", header: "Available", align: "right", value: (r) => r.available },
          { key: "in_event", header: "In event", align: "right", value: (r) => r.in_event },
          { key: "maintenance", header: "Maintenance", align: "right", value: (r) => r.maintenance },
          { key: "condition", header: "Condition", cell: (r) => <Badge tone={r.condition === "needs_repair" ? "warn" : "neutral"}>{humanize(r.condition)}</Badge> },
          { key: "location", header: "Location", value: (r) => r.location ?? "—" },
          { key: "purchase_date", header: "Purchased", cell: (r) => date(r.purchase_date) },
          { key: "purchase_value", header: "Value", align: "right", cell: (r) => <Money value={r.purchase_value} />, value: (r) => toNum(r.purchase_value), total: true },
          { key: "e", header: "", sortable: false, cell: (r) => canManage && <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>Edit</Button> },
        ]} />
      {edit && <EditAsset asset={edit} lookups={lookups} onClose={() => setEdit(null)} />}
    </>
  );
}

function EditAsset({ asset, lookups, onClose }: { asset: any; lookups: Lookups; onClose: () => void }) {
  const [f, setF] = useState({ name: asset.name, category_id: asset.category_id ?? "", quantity_owned: String(asset.quantity_owned), serial_number: asset.serial_number ?? "",
    location: asset.location ?? "", condition: asset.condition ?? "good", warranty_until: asset.warranty_until ?? "", custodian_person_id: asset.custodian_person_id ?? "", notes: asset.notes ?? "" });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const { run, pending, error } = useAction(saveAsset.bind(null, asset.id), { success: "Asset saved", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Edit asset" size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={() => run({ ...f, quantity_owned: Number(f.quantity_owned) })}>Save</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" className="md:col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Category"><Select value={f.category_id} onChange={(e) => set("category_id", e.target.value)}><option value="">—</option>{lookups.assetCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Quantity owned"><Input type="number" value={f.quantity_owned} onChange={(e) => set("quantity_owned", e.target.value)} /></Field>
        <Field label="Serial number"><Input value={f.serial_number} onChange={(e) => set("serial_number", e.target.value)} /></Field>
        <Field label="Location"><Input value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Condition"><Select value={f.condition} onChange={(e) => set("condition", e.target.value)}>{["new", "good", "fair", "needs_repair", "retired"].map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select></Field>
        <Field label="Warranty until"><Input type="date" value={f.warranty_until} onChange={(e) => set("warranty_until", e.target.value)} /></Field>
        <Field label="Custodian"><Select value={f.custodian_person_id} onChange={(e) => set("custodian_person_id", e.target.value)}><option value="">—</option>{lookups.people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></Field>
        <Field label="Notes" className="md:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}
