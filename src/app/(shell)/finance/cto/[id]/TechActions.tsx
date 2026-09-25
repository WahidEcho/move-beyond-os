"use client";
import { useState } from "react";
import { adjustTechnologyValue } from "@/app/actions/finance";
import { saveTechnology } from "@/app/actions/masterdata";
import { useAction } from "@/components/ui/useAction";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Callout } from "@/components/ui/Callout";
import { AllocateCtoDialog } from "@/components/finance/forms";
import { humanize } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function TechActions({ techId, lookups, outstanding, name, developer, tech, canManage, canRecover }: {
  techId: string; lookups: Lookups; outstanding: number; name: string; developer: string; tech: any; canManage: boolean; canRecover: boolean;
}) {
  const [open, setOpen] = useState<"alloc" | "adjust" | "edit" | null>(null);
  return (
    <>
      {canManage && <Button onClick={() => setOpen("edit")}>Edit</Button>}
      {canManage && <Button onClick={() => setOpen("adjust")}>Change value</Button>}
      {canRecover && outstanding > 0 && <Button variant="primary" onClick={() => setOpen("alloc")}>Allocate recovery</Button>}
      {open === "alloc" && <AllocateCtoDialog open onClose={() => setOpen(null)} lookups={lookups} technologyId={techId} outstanding={outstanding} techName={name} developer={developer} />}
      {open === "adjust" && <AdjustValue techId={techId} onClose={() => setOpen(null)} />}
      {open === "edit" && <EditTech tech={tech} lookups={lookups} onClose={() => setOpen(null)} />}
    </>
  );
}

function AdjustValue({ techId, onClose }: { techId: string; onClose: () => void }) {
  const [kind, setKind] = useState<"extension" | "reduction">("extension");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const { run, pending, error } = useAction(adjustTechnologyValue, { success: "Development value updated", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Development change order" subtitle="Additional scope creates a new approved total; history is kept." size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!(Number(amount) > 0) || reason.trim().length < 3} onClick={() => run(techId, kind, Number(amount), reason)}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Change"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="extension">Extension / additional scope (+)</option><option value="reduction">Reduction (−)</option></Select></Field>
        <Field label="Amount"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Live scoring module added" /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}

function EditTech({ tech, lookups, onClose }: { tech: any; lookups: Lookups; onClose: () => void }) {
  const [f, setF] = useState({
    name: tech.name, description: tech.description ?? "", category_id: tech.category_id ?? "", lifecycle_status: tech.lifecycle_status,
    ownership: tech.ownership, reusable: tech.reusable, completion_date: tech.completion_date ?? "", current_version: tech.current_version ?? "",
    source_repository: tech.source_repository ?? "", hosting: tech.hosting ?? "", commercial_potential: tech.commercial_potential ?? "", notes: tech.notes ?? "",
  });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const { run, pending, error } = useAction(saveTechnology.bind(null, tech.id), { success: "Saved", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Edit technology" size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={() => run(f)}>Save</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" className="md:col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Category"><Select value={f.category_id} onChange={(e) => set("category_id", e.target.value)}><option value="">—</option>{lookups.technologyCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Status"><Select value={f.lifecycle_status} onChange={(e) => set("lifecycle_status", e.target.value)}>{["planned", "in_development", "completed", "cancelled", "archived"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
        <Field label="Ownership"><Input value={f.ownership} onChange={(e) => set("ownership", e.target.value)} /></Field>
        <Field label="Completed"><Input type="date" value={f.completion_date} onChange={(e) => set("completion_date", e.target.value)} /></Field>
        <Field label="Current version"><Input value={f.current_version} onChange={(e) => set("current_version", e.target.value)} /></Field>
        <Field label="Hosting"><Input value={f.hosting} onChange={(e) => set("hosting", e.target.value)} /></Field>
        <Field label="Source repository" className="md:col-span-2"><Input value={f.source_repository} onChange={(e) => set("source_repository", e.target.value)} /></Field>
        <Field label="Commercial potential" className="md:col-span-2"><Input value={f.commercial_potential} onChange={(e) => set("commercial_potential", e.target.value)} /></Field>
        <div className="md:col-span-2"><Checkbox label="Reusable across projects" checked={f.reusable} onChange={(e) => set("reusable", e.target.checked)} /></div>
        <Field label="Description" className="md:col-span-2"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
      </div>
      <p className="mt-3 text-[12.5px] text-ink-3">The agreed value changes only through “Change value”, so its history is preserved.</p>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}
