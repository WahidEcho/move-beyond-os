"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { addContractAdjustment, deleteCollection, deleteContractAdjustment, recordRefund, saveMilestones } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Callout } from "@/components/ui/Callout";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { CollectionDialog } from "@/components/finance/forms";
import { CashAccountSelect, today } from "@/components/finance/pickers";
import { date, egp, humanize, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";
import type { ProjectMetrics } from "@/engines/projectFinancials";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rev = { milestones: any[]; collections: any[]; adjustments: any[] };

const ADJ_TYPES = [
  ["change_order", "Change order (+)"], ["increase", "Contract increase (+)"], ["discount", "Discount (−)"], ["tier_downgrade", "Tier downgrade (−)"],
  ["credit_note", "Credit note (−)"], ["reduction", "Contract reduction (−)"], ["compensation", "Compensation / late delivery (−)"], ["cancellation", "Cancellation (−)"],
] as const;

export function RevenuePanel({ projectId, contract, metrics, rev, lookups, closed }: {
  projectId: string; contract: any; metrics: ProjectMetrics | null; rev: Rev; lookups: Lookups; closed: boolean;
}) {
  const [dlg, setDlg] = useState<"collection" | "adjust" | "schedule" | "refund" | null>(null);
  const [del, setDel] = useState<{ kind: "collection" | "adjustment"; id: string } | null>(null);
  const delCollection = useAction(deleteCollection, { success: "Payment deleted and reversed", onSuccess: () => setDel(null) });
  const delAdj = useAction(deleteContractAdjustment, { success: "Adjustment removed", onSuccess: () => setDel(null) });
  const fx = toNum(contract?.fx_rate) || 1;
  const cur = contract?.currency ?? "EGP";
  const invoiced = rev.milestones.filter((m) => m.invoiced_at).reduce((a, m) => a + toNum(m.amount), 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Payment schedule" subtitle="Milestones are the receivables that drive reminders and ageing."
            actions={!closed && <Button size="sm" onClick={() => setDlg("schedule")}><Pencil className="size-3.5" />Edit schedule</Button>} />
          {rev.milestones.length === 0 ? <EmptyState title="No payment schedule" body="Add milestones to track what the client owes and when." /> : (
            <table className="w-full text-[13.5px]">
              <thead><tr className="border-b border-line bg-subtle text-[12px] text-ink-3">
                <th className="px-5 py-2 text-left font-medium">Milestone</th><th className="px-3 py-2 text-left font-medium">Due</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th><th className="px-3 py-2 text-right font-medium">Collected</th>
                <th className="px-3 py-2 text-right font-medium">Outstanding</th><th className="px-5 py-2 text-right font-medium">Status</th>
              </tr></thead>
              <tbody>
                {rev.milestones.map((m) => (
                  <tr key={m.milestone_id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5"><p className="font-medium">{m.label}</p><p className="text-[12px] text-ink-3">{humanize(m.trigger_kind)}{m.invoiced_at ? ` · invoiced ${date(m.invoiced_at, true)}` : ""}</p></td>
                    <td className="px-3 py-2.5 text-ink-2">{date(m.due_date)}</td>
                    <td className="px-3 py-2.5 text-right"><Money value={m.amount} /></td>
                    <td className="px-3 py-2.5 text-right"><Money value={m.collected} /></td>
                    <td className="px-3 py-2.5 text-right font-medium"><Money value={m.outstanding} /></td>
                    <td className="px-5 py-2.5 text-right">{m.days_overdue > 0 ? <Badge tone="neg">{m.days_overdue}d overdue</Badge> : <StatusBadge status={toNum(m.outstanding) <= 0 ? "paid" : "current"} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <CardHeader title="Collections" subtitle="Client payments received"
            actions={!closed && <>
              <Button size="sm" variant="ghost" onClick={() => setDlg("refund")}><Undo2 className="size-3.5" />Refund</Button>
              <Button size="sm" variant="primary" onClick={() => setDlg("collection")}><Plus className="size-3.5" />Record payment</Button>
            </>} />
          {rev.collections.length === 0 ? <EmptyState title="No payments yet" /> : (
            <table className="w-full text-[13.5px]">
              <tbody>
                {rev.collections.map((c) => (
                  <tr key={c.id} className="group border-b border-line last:border-0">
                    <td className="px-5 py-2.5 text-ink-2">{date(c.collection_date)}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{c.kind === "refund" ? "Refund to client" : c.reference || "Client payment"}</p>
                      <p className="text-[12px] text-ink-3">{c.cash_accounts?.name}{c.currency !== "EGP" ? ` · ${c.amount} ${c.currency} @ ${c.fx_rate}` : ""}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right"><Money value={c.kind === "refund" ? -toNum(c.amount_egp) : c.amount_egp} signed={c.kind === "refund"} /></td>
                    <td className="w-10 px-3 text-right">
                      {!closed && <button onClick={() => setDel({ kind: "collection", id: c.id })} className="rounded p-1 text-ink-4 opacity-0 hover:bg-muted hover:text-neg group-hover:opacity-100" title="Delete"><Trash2 className="size-3.5" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Contract" actions={!closed && <Button size="sm" onClick={() => setDlg("adjust")}><Plus className="size-3.5" />Adjust</Button>} />
          <CardBody className="py-2">
            <DefinitionList items={[
              { label: "Original contract", value: <Money value={toNum(contract?.original_value) * fx} /> },
              ...rev.adjustments.map((a) => ({
                label: <span className="group inline-flex items-center gap-1.5">v{a.version_no} · {a.description}
                  {!closed && <button onClick={() => setDel({ kind: "adjustment", id: a.id })} className="text-ink-4 opacity-0 hover:text-neg group-hover:opacity-100"><Trash2 className="size-3" /></button>}</span>,
                value: <Money value={toNum(a.amount) * fx} signed />, hint: humanize(a.adjustment_type),
              })),
              { label: "Revised contract value", value: <Money value={metrics?.contractValue} />, strong: true },
            ]} />
            {cur !== "EGP" && <p className="mt-2 text-[12px] text-ink-3">Contract in {cur} at {fx} EGP.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Receivable summary" />
          <CardBody className="py-2">
            <DefinitionList items={[
              { label: "Contract value", value: <Money value={metrics?.contractValue} /> },
              { label: "Invoiced", value: <Money value={invoiced * fx} /> },
              { label: "Collected", value: <Money value={metrics?.collected} /> },
              { label: "Outstanding", value: <Money value={metrics?.outstanding} />, strong: true },
              { label: "Overdue", value: <Money value={metrics?.overdue} className={toNum(metrics?.overdue) ? "text-neg" : ""} /> },
              { label: "Recognised revenue", value: <Money value={metrics?.collected} />, hint: "cash basis" },
            ]} />
          </CardBody>
        </Card>
      </div>

      {dlg === "collection" && <CollectionDialog open onClose={() => setDlg(null)} lookups={lookups} projectId={projectId} milestones={rev.milestones} />}
      {dlg === "adjust" && <AdjustDialog projectId={projectId} onClose={() => setDlg(null)} />}
      {dlg === "schedule" && <ScheduleDialog projectId={projectId} milestones={rev.milestones} onClose={() => setDlg(null)} contractValue={toNum(metrics?.contractValue) / fx} />}
      {dlg === "refund" && <RefundDialog projectId={projectId} lookups={lookups} onClose={() => setDlg(null)} />}
      <ReasonDialog open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete"
        title={del?.kind === "collection" ? "Delete client payment" : "Remove contract adjustment"}
        description={del?.kind === "collection" ? "The payment is reversed in the ledger and moved to Deleted Records. It stays auditable." : "The revision stays in history as deleted."}
        pending={delCollection.pending || delAdj.pending} error={(delCollection.error ?? delAdj.error)?.error}
        onConfirm={(reason) => (del?.kind === "collection" ? delCollection.run(del.id, projectId, reason) : delAdj.run(del!.id, projectId, reason))} />
    </div>
  );
}

function AdjustDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [type, setType] = useState("change_order");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [d, setD] = useState(today());
  const { run, pending, error } = useAction(addContractAdjustment, { success: "Contract revised", onSuccess: onClose });
  const plus = type === "change_order" || type === "increase";
  return (
    <Dialog open onClose={onClose} title="Revise contract" subtitle="Every revision is kept in the contract history." size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={!(Number(amount) > 0) || !description.trim()} onClick={() => run(projectId, type, Number(amount), description, d)}>Save revision</Button></>}>
      <div className="space-y-4">
        <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value)}>{ADJ_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label={plus ? "Amount added" : "Amount deducted"} hint="In the contract currency."><Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={plus ? "e.g. Extra screens" : "e.g. Loyalty discount"} /></Field>
        <Field label="Date"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}

function ScheduleDialog({ projectId, milestones, onClose, contractValue }: { projectId: string; milestones: any[]; onClose: () => void; contractValue: number }) {
  const [rows, setRows] = useState(milestones.map((m) => ({ id: m.milestone_id, label: m.label, trigger_kind: m.trigger_kind, due_date: m.due_date ?? "", amount: String(m.amount), invoiced_at: m.invoiced_at ?? "", collected: toNum(m.collected) })));
  const [reason, setReason] = useState("");
  const { run, pending, error } = useAction(saveMilestones, { success: "Payment schedule saved", onSuccess: onClose });
  const total = rows.reduce((a, r) => a + toNum(r.amount), 0);
  return (
    <Dialog open onClose={onClose} title="Edit payment schedule" size="xl"
      footer={<><span className={`num mr-auto text-[13px] ${Math.abs(total - contractValue) > 0.5 ? "text-warn" : "text-ink-3"}`}>Scheduled {egp(total)} of {egp(contractValue)}</span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} onClick={() => run(projectId, rows.map(({ collected: _c, ...r }) => ({ ...r, amount: toNum(r.amount) })), reason || null)}>Save schedule</Button></>}>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_140px_140px_130px_140px_28px] gap-2 text-[12px] font-medium text-ink-3"><span>Label</span><span>Trigger</span><span>Due date</span><span>Amount</span><span>Invoiced on</span><span /></div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_140px_130px_140px_28px] items-center gap-2">
            <Input value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <Select value={r.trigger_kind} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, trigger_kind: e.target.value } : x)))}>
              {["signing", "before_event", "completion", "date", "subscription_period", "custom"].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </Select>
            <Input type="date" value={r.due_date} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} />
            <Input type="number" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            <Input type="date" value={r.invoiced_at} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, invoiced_at: e.target.value } : x)))} />
            <button disabled={r.collected > 0} title={r.collected > 0 ? "Has payments" : "Remove"} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-ink-4 hover:text-neg disabled:opacity-30"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { id: "", label: `Payment ${rows.length + 1}`, trigger_kind: "date", due_date: "", amount: "", invoiced_at: "", collected: 0 }])}><Plus className="size-3.5" />Add payment</Button>
        <Field label="Reason for change (optional)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}

function RefundDialog({ projectId, lookups, onClose }: { projectId: string; lookups: Lookups; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [cash, setCash] = useState(lookups.cashAccounts.find((c) => c.is_default)?.id ?? "");
  const [d, setD] = useState(today());
  const [reason, setReason] = useState("");
  const { run, pending, error } = useAction(recordRefund, { success: "Refund recorded", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Refund to client" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={pending} disabled={!(Number(amount) > 0) || reason.trim().length < 3} onClick={() => run(projectId, Number(amount), d, cash, reason)}>Record refund</Button></>}>
      <div className="space-y-4">
        <Field label="Amount refunded"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Paid from"><CashAccountSelect lookups={lookups} value={cash} onChange={setCash} /></Field>
        <Field label="Date"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}
