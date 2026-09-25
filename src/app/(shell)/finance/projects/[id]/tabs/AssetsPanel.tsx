"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { assignAsset, returnAsset } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { Callout } from "@/components/ui/Callout";
import { ExpenseDialog } from "@/components/finance/ExpenseForm";
import { date, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function AssetsPanel({ projectId, data, rentals, available, lookups }: {
  projectId: string; data: { bought: any[]; assigned: any[] }; rentals: any[]; available: { id: string; name: string; available: number }[]; lookups: Lookups;
}) {
  const [buy, setBuy] = useState(false);
  const [assign, setAssign] = useState(false);
  const ret = useAction(returnAsset, { success: "Asset returned" });
  const groups = rentals.filter((r) => !r.related_expense_id).map((r) => ({ base: r, related: rentals.filter((x) => x.related_expense_id === r.expense_id) }));
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Purchased for this project" actions={<Button size="sm" onClick={() => setBuy(true)}><Plus className="size-3.5" />Buy asset</Button>} />
          {data.bought.length === 0 ? <EmptyState title="No assets purchased" /> : (
            <table className="w-full text-[13.5px]"><tbody>
              {data.bought.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-medium">{a.name}</td><td className="px-3 py-2.5 text-ink-3">× {a.quantity_owned}</td>
                  <td className="px-5 py-2.5 text-right"><Money value={a.purchase_value} /></td>
                </tr>))}
            </tbody></table>
          )}
        </Card>
        <Card>
          <CardHeader title="Owned assets used here" subtitle="Reuse costs 0 unless an internal cost is set."
            actions={<Button size="sm" onClick={() => setAssign(true)}><Plus className="size-3.5" />Assign</Button>} />
          {data.assigned.length === 0 ? <EmptyState title="None assigned" /> : (
            <table className="w-full text-[13.5px]"><tbody>
              {data.assigned.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-medium">{a.assets?.name} <span className="text-ink-3">× {a.quantity}</span></td>
                  <td className="px-3 py-2.5 text-ink-3">{date(a.assigned_from, true)} – {date(a.assigned_to, true)}</td>
                  <td className="px-3 py-2.5 text-right"><Money value={a.internal_cost} /></td>
                  <td className="w-24 px-5 text-right">{a.returned_at ? <span className="text-[12px] text-ink-3">Returned</span> :
                    <Button size="sm" variant="ghost" loading={ret.pending} onClick={() => ret.run(a.id)}>Return</Button>}</td>
                </tr>))}
            </tbody></table>
          )}
        </Card>
      </div>
      <Card>
        <CardHeader title="Rentals & landed cost" subtitle="Rental plus related charges (delivery, installation…)" />
        {groups.length === 0 ? <EmptyState title="No rentals" body="Record rentals as expenses of type Rental; add delivery as a related charge." /> : (
          <table className="w-full text-[13.5px]"><tbody>
            {groups.map((g) => {
              const total = toNum(g.base.committed_egp) + g.related.reduce((s, r) => s + toNum(r.committed_egp), 0);
              return (
                <tr key={g.base.expense_id} className="border-b border-line last:border-0 align-top">
                  <td className="px-5 py-2.5"><p className="font-medium">{g.base.description}</p>
                    {g.related.map((r) => <p key={r.expense_id} className="text-[12.5px] text-ink-3">+ {r.description} · {r.allocation_basis?.replace(/_/g, " ")} · {toNum(r.committed_egp).toLocaleString("en-US")}</p>)}</td>
                  <td className="px-3 py-2.5 text-right text-ink-3"><Money value={g.base.committed_egp} /></td>
                  <td className="px-5 py-2.5 text-right"><p className="text-[12px] text-ink-3">Total landed cost</p><p className="font-semibold"><Money value={total} /></p></td>
                </tr>
              );
            })}
          </tbody></table>
        )}
      </Card>
      {buy && <ExpenseDialog open onClose={() => setBuy(false)} lookups={lookups} projectId={projectId} initialType="owned_asset" title="Buy asset for this project" />}
      {assign && <AssignAsset projectId={projectId} available={available} onClose={() => setAssign(false)} />}
    </div>
  );
}

function AssignAsset({ projectId, available, onClose }: { projectId: string; available: { id: string; name: string; available: number }[]; onClose: () => void }) {
  const [asset, setAsset] = useState("");
  const [qty, setQty] = useState("1");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cost, setCost] = useState("0");
  const a = available.find((x) => x.id === asset);
  const { run, pending, error } = useAction(assignAsset, { success: "Asset assigned", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Assign owned asset" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={!asset || !(Number(qty) > 0) || (a ? Number(qty) > a.available : true)}
          onClick={() => run(asset, projectId, Number(qty), from || null, to || null, Number(cost || 0), null)}>Assign</Button></>}>
      <div className="space-y-4">
        <Field label="Asset">
          <Select value={asset} onChange={(e) => setAsset(e.target.value)}>
            <option value="" disabled>Select…</option>
            {available.map((x) => <option key={x.id} value={x.id} disabled={x.available <= 0}>{x.name} · {x.available} available</option>)}
          </Select>
        </Field>
        <Field label="Quantity"><Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <Field label="Internal cost to this project" hint="Default 0. A value here becomes a project cost."><Input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}
