"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Plus, Scale } from "lucide-react";
import { bankAdjustment, cashTransfer, deleteOpeningBalance, postOpeningBalance } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { DataTable } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { CashAccountSelect, PersonSelect, ProjectSelect, today } from "@/components/finance/pickers";
import { date, humanize, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function BankActions({ lookups }: { lookups: Lookups }) {
  const [open, setOpen] = useState<"transfer" | "adjust" | "opening" | null>(null);
  return (
    <>
      <Button onClick={() => setOpen("opening")}><Plus className="size-4" />Opening balance</Button>
      <Button onClick={() => setOpen("adjust")}><Scale className="size-4" />Bank adjustment</Button>
      <Button variant="primary" onClick={() => setOpen("transfer")}><ArrowLeftRight className="size-4" />Transfer / deposit</Button>
      {open === "transfer" && <TransferDialog lookups={lookups} onClose={() => setOpen(null)} />}
      {open === "adjust" && <AdjustDialog lookups={lookups} onClose={() => setOpen(null)} />}
      {open === "opening" && <OpeningDialog lookups={lookups} onClose={() => setOpen(null)} />}
    </>
  );
}

function TransferDialog({ lookups, onClose }: { lookups: Lookups; onClose: () => void }) {
  const hold = lookups.cashAccounts.find((c) => c.account_type === "partner_holding");
  const [from, setFrom] = useState(hold?.id ?? "");
  const [to, setTo] = useState(lookups.cashAccounts.find((c) => c.is_default)?.id ?? "");
  const [amount, setAmount] = useState("");
  const [d, setD] = useState(today());
  const [reason, setReason] = useState("Deposit of company money held by partner");
  const { run, pending, error } = useAction(cashTransfer, { success: "Transfer recorded", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Transfer between accounts" subtitle="e.g. a partner deposits client money they received into the company bank." size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!(Number(amount) > 0) || from === to} onClick={() => run(from, to, Number(amount), d, reason)}>Record</Button></>}>
      <div className="space-y-4">
        <Field label="From"><CashAccountSelect lookups={lookups} value={from} onChange={setFrom} /></Field>
        <Field label="To"><CashAccountSelect lookups={lookups} value={to} onChange={setTo} /></Field>
        <Field label="Amount"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Date"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label="Note"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}

function AdjustDialog({ lookups, onClose }: { lookups: Lookups; onClose: () => void }) {
  const [acc, setAcc] = useState(lookups.cashAccounts.find((c) => c.is_default)?.id ?? "");
  const [amount, setAmount] = useState("");
  const [d, setD] = useState(today());
  const [reason, setReason] = useState("");
  const { run, pending, error } = useAction(bankAdjustment, { success: "Adjustment recorded", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Bank adjustment" subtitle="Correct the system balance to the real bank statement (bank charges, interest…)." size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!Number(amount) || reason.trim().length < 3} onClick={() => run(acc, Number(amount), d, reason)}>Record</Button></>}>
      <div className="space-y-4">
        <Field label="Account"><CashAccountSelect lookups={lookups} value={acc} onChange={setAcc} /></Field>
        <Field label="Amount" hint="Negative for charges, positive for interest / corrections."><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Date"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}

const OPENING_CATS = [
  ["cash", "Cash in an account (bank or held by partner)"], ["funding", "Funding owed to a person"], ["fee", "Partner fee owed"],
  ["cto", "CTO recovery owed (already allocated)"], ["profit", "Profit owed"], ["carry_forward", "Carry-forward / historical adjustment"],
  ["employee_reimbursement", "Employee reimbursement owed"],
];

function OpeningDialog({ lookups, onClose }: { lookups: Lookups; onClose: () => void }) {
  const [cat, setCat] = useState("cash");
  const [acc, setAcc] = useState(lookups.cashAccounts.find((c) => c.is_default)?.id ?? "");
  const [person, setPerson] = useState("");
  const [project, setProject] = useState("");
  const [amount, setAmount] = useState("");
  const [d, setD] = useState(today());
  const [reason, setReason] = useState("Opening balance at go-live");
  const [opening, setOpening] = useState(true);
  const { run, pending, error } = useAction(postOpeningBalance, { success: "Balance posted", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Opening balance / carry-forward" subtitle="Bring existing balances into the system at go-live." size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={!Number(amount) || (cat === "cash" ? !acc : !person)}
          onClick={() => run({ category: cat, amount: Number(amount), cash_account_id: cat === "cash" ? acc : null, person_id: cat === "cash" ? null : person, project_id: project || null, date: d, reason, is_opening: opening })}>Post</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="What" className="md:col-span-2"><Select value={cat} onChange={(e) => setCat(e.target.value)}>{OPENING_CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        {cat === "cash" ? <Field label="Account" className="md:col-span-2"><CashAccountSelect lookups={lookups} value={acc} onChange={setAcc} /></Field>
          : <><Field label="Person"><PersonSelect people={lookups.people} value={person} onChange={setPerson} /></Field>
              <Field label="Project (optional)"><ProjectSelect lookups={lookups} value={project} onChange={setProject} allowNone noneLabel="Not project-specific" /></Field></>}
        <Field label="Amount" hint={cat === "cash" ? undefined : "Positive = Move Beyond owes them; negative = they owe Move Beyond."}><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Effective date"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label="Reason" className="md:col-span-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Checkbox label="This is a go-live opening balance" checked={opening} onChange={(e) => setOpening(e.target.checked)} />
      </div>
      <p className="mt-3 text-[12.5px] text-ink-3">Technology already partly recovered before go-live is entered on the technology itself (CTO Development → Add).</p>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}

export function OpeningBalances({ rows, lookups, canManage }: { rows: any[]; lookups: Lookups; canManage: boolean }) {
  const [del, setDel] = useState<string | null>(null);
  const remove = useAction(deleteOpeningBalance, { success: "Reversed", onSuccess: () => setDel(null) });
  void lookups;
  return (
    <Card className="mt-6">
      <CardHeader title="Opening balances & carry-forwards" />
      {rows.length === 0 ? <EmptyState title="None posted" body="Post the real bank balance and existing partner balances before going live." /> : (
        <table className="w-full text-[13.5px]"><tbody>
          {rows.map((r) => (
            <tr key={r.id} className="group border-b border-line last:border-0">
              <td className="px-5 py-2.5 text-ink-3">{date(r.effective_date)}</td>
              <td className="px-3 py-2.5">{r.category === "cash" ? r.cash_accounts?.name : r.people?.full_name} <Badge className="ml-1">{humanize(r.category)}</Badge>{r.is_opening && <Badge className="ml-1" tone="info">Opening</Badge>}</td>
              <td className="px-3 py-2.5 text-ink-2">{r.reason}</td>
              <td className="px-3 py-2.5 text-right font-medium"><Money value={r.amount} signed={toNum(r.amount) < 0} /></td>
              <td className="w-20 pr-5 text-right">{canManage && <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => setDel(r.id)}>Reverse</Button>}</td>
            </tr>
          ))}
        </tbody></table>
      )}
      <ReasonDialog open={!!del} onClose={() => setDel(null)} danger title="Reverse balance" confirmLabel="Reverse" pending={remove.pending} error={remove.error?.error} onConfirm={(r) => remove.run(del!, r)} />
    </Card>
  );
}

export function BankLedger({ rows, accounts }: { rows: any[]; accounts: any[] }) {
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  return (
    <DataTable rows={rows} rowKey={(r) => String(r.id)} exportName="bank-transactions" footer dense
      filters={[{ key: "a", label: "Account", options: accounts.map((a) => ({ value: a.id, label: a.name })), match: (r, v) => r.cash_account_id === v }]}
      columns={[
        { key: "entry_date", header: "Date", cell: (r) => date(r.entry_date) },
        { key: "desc", header: "Description", value: (r) => r.journal_entries?.description ?? humanize(r.source_type) },
        { key: "source_type", header: "Type", cell: (r) => <Badge>{humanize(r.source_type.replace("payout_", "payment_"))}</Badge>, value: (r) => r.source_type },
        { key: "project", header: "Project", cell: (r) => r.project_id ? <Link className="hover:underline" href={`/finance/projects/${r.project_id}`}>{r.projects?.code}</Link> : "—", value: (r) => r.projects?.code },
        { key: "acc", header: "Account", value: (r) => name.get(r.cash_account_id) },
        { key: "in", header: "In", align: "right", cell: (r) => (toNum(r.amount) > 0 ? <Money value={r.amount} /> : ""), value: (r) => Math.max(toNum(r.amount), 0), total: true },
        { key: "out", header: "Out", align: "right", cell: (r) => (toNum(r.amount) < 0 ? <Money value={-toNum(r.amount)} /> : ""), value: (r) => Math.max(-toNum(r.amount), 0), total: true },
      ]} />
  );
}
