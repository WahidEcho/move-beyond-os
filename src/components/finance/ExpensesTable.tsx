"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { cancelExpense, deleteExpense, deleteExpensePayment, payExpense, updateExpense } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Callout } from "@/components/ui/Callout";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { date, egp, humanize, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";
import { ExpenseDialog } from "./ExpenseForm";
import { CashAccountSelect, CategorySelect, PersonSelect, today } from "./pickers";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ExpenseRow = any;

const PAYER_LABEL: Record<string, string> = { company: "Move Beyond", partner: "Partner", employee: "Employee", other_person: "Funder" };

export function ExpensesTable({ rows, lookups, projectId, showProject, closed, addLabel = "Add expense", initialMode, filter }: {
  rows: ExpenseRow[]; lookups: Lookups; projectId?: string; showProject?: boolean; closed?: boolean; addLabel?: string;
  initialMode?: "paid" | "commitment" | "estimate"; filter?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [add, setAdd] = useState(false);
  const [pay, setPay] = useState<ExpenseRow | null>(null);
  const [edit, setEdit] = useState<ExpenseRow | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<{ kind: "cancel" | "delete" | "delete_payment"; id: string; label: string } | null>(null);
  const cancel = useAction(cancelExpense, { success: "Commitment cancelled", onSuccess: () => setReasonFor(null) });
  const del = useAction(deleteExpense, { success: "Expense deleted and reversed", onSuccess: () => setReasonFor(null) });
  const delPay = useAction(deleteExpensePayment, { success: "Payment deleted and reversed", onSuccess: () => setReasonFor(null) });

  const needle = q.trim().toLowerCase();
  const list = rows.filter((r) => (!status || r.status === status) &&
    (!needle || [r.description, r.supplier_name, r.category_label, r.project_code, r.project_name].some((v) => String(v ?? "").toLowerCase().includes(needle))));
  const tot = (k: string) => list.reduce((a, r) => a + toNum(r[k]), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, supplier, category…"
          className="h-8 min-w-[220px] max-w-sm flex-1 rounded-lg border border-line bg-subtle px-3 text-[13px] focus:border-info focus:bg-surface focus:outline-none" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink-2">
          <option value="">Status: All</option>
          {["estimated", "committed", "partially_paid", "paid", "cancelled"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
        {filter}
        {!closed && <Button size="sm" variant="primary" className="ml-auto" onClick={() => setAdd(true)}><Plus className="size-3.5" />{addLabel}</Button>}
      </div>
      {list.length === 0 ? <EmptyState title={rows.length ? "No matches" : "No expenses yet"} body={rows.length ? undefined : "Record costs as they are committed or paid."} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line bg-subtle text-[12px] text-ink-3">
                <th className="w-8" />
                <th className="px-3 py-2 text-left font-medium">Expense</th>
                {showProject && <th className="px-3 py-2 text-left font-medium">Project</th>}
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Estimated</th>
                <th className="px-3 py-2 text-right font-medium">Committed</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                <th className="px-3 py-2 text-left font-medium">Due</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <Fragment key={r.expense_id}>
                  <tr className={cn("border-b border-line", open[r.expense_id] && "bg-subtle")}>
                    <td className="pl-3">
                      <button onClick={() => setOpen({ ...open, [r.expense_id]: !open[r.expense_id] })} className="rounded p-0.5 text-ink-3 hover:bg-muted">
                        <ChevronRight className={cn("size-4 transition-transform", open[r.expense_id] && "rotate-90")} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{r.description}
                        {r.expense_type !== "normal" && <Badge className="ml-2" tone="info">{r.expense_type === "owned_asset" ? "Asset" : "Rental"}</Badge>}
                        {r.related_expense_id && <Badge className="ml-2">Landed cost</Badge>}
                      </p>
                      <p className="text-[12px] text-ink-3">{[r.category_label, r.supplier_name].filter(Boolean).join(" · ") || "Uncategorised"}
                        {r.payers?.length ? ` · paid by ${r.payers.map((p: string) => PAYER_LABEL[p] ?? p).join(", ")}` : ""}</p>
                    </td>
                    {showProject && <td className="px-3 py-2.5">{r.project_id ? <Link className="hover:underline" href={`/finance/projects/${r.project_id}?tab=expenses`}><span className="num text-ink-3">{r.project_code}</span> {r.project_name}</Link> : <span className="text-ink-3">Company overhead</span>}</td>}
                    <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-2.5 text-right text-ink-3"><Money value={r.estimated_egp} /></td>
                    <td className="px-3 py-2.5 text-right"><Money value={r.committed_egp} /></td>
                    <td className="px-3 py-2.5 text-right"><Money value={r.paid_egp} /></td>
                    <td className="px-3 py-2.5 text-right font-medium"><Money value={r.outstanding_egp} /></td>
                    <td className={cn("px-3 py-2.5 text-ink-2", r.due_date && r.due_date < today() && toNum(r.outstanding_egp) > 0 && "font-medium text-neg")}>{date(r.due_date, true)}</td>
                    <td className="relative pr-3 text-right">
                      {!closed && (
                        <button onClick={() => setMenu(menu === r.expense_id ? null : r.expense_id)} className="rounded p-1 text-ink-3 hover:bg-muted"><MoreHorizontal className="size-4" /></button>
                      )}
                      {menu === r.expense_id && (
                        <div className="absolute right-3 top-9 z-20 w-44 rounded-xl border border-line bg-surface p-1 text-left shadow-[var(--shadow-pop)]" onMouseLeave={() => setMenu(null)}>
                          {r.status !== "cancelled" && toNum(r.outstanding_egp) > 0 && <MenuItem onClick={() => { setMenu(null); setPay(r); }}>Record payment</MenuItem>}
                          {r.status === "estimated" && <MenuItem onClick={() => { setMenu(null); setEdit(r); }}>Commit / edit</MenuItem>}
                          {r.status !== "estimated" && <MenuItem onClick={() => { setMenu(null); setEdit(r); }}>Edit</MenuItem>}
                          {r.status !== "cancelled" && r.status !== "paid" && <MenuItem onClick={() => { setMenu(null); setReasonFor({ kind: "cancel", id: r.expense_id, label: r.description }); }}>Cancel unpaid part</MenuItem>}
                          <MenuItem danger onClick={() => { setMenu(null); setReasonFor({ kind: "delete", id: r.expense_id, label: r.description }); }}>Delete</MenuItem>
                        </div>
                      )}
                    </td>
                  </tr>
                  {open[r.expense_id] && (
                    <tr className="border-b border-line bg-subtle">
                      <td />
                      <td colSpan={showProject ? 9 : 8} className="px-3 pb-3 pt-1">
                        {r.payments.length === 0 ? <p className="text-[13px] text-ink-3">No payments yet.</p> : (
                          <table className="w-full max-w-3xl text-[13px]">
                            <tbody>
                              {r.payments.map((p: any) => (
                                <tr key={p.id} className="group">
                                  <td className="py-1 pr-3 text-ink-3">{date(p.payment_date)}</td>
                                  <td className="py-1 pr-3">
                                    {p.payer_type === "company" ? `Move Beyond · ${p.cash_accounts?.name ?? ""}` : `${p.people?.full_name} (${PAYER_LABEL[p.payer_type]})`}
                                    {p.payer_type === "partner" && !p.reimbursable && <Badge className="ml-2">Not reimbursable</Badge>}
                                  </td>
                                  <td className="py-1 pr-3 text-right"><Money value={p.amount_egp} /></td>
                                  <td className="w-8 text-right">
                                    {!closed && <button onClick={() => setReasonFor({ kind: "delete_payment", id: p.id, label: `${egp(p.amount_egp)} payment` })} className="text-[12px] text-ink-4 opacity-0 hover:text-neg group-hover:opacity-100">Delete</button>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {r.cancel_reason && <p className="mt-1 text-[12px] text-ink-3">Cancelled: {r.cancel_reason}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong bg-subtle font-semibold">
                <td /><td className="px-3 py-2.5">Total ({list.length})</td>{showProject && <td />}<td />
                <td className="px-3 py-2.5 text-right text-ink-3"><Money value={tot("estimated_egp")} /></td>
                <td className="px-3 py-2.5 text-right"><Money value={tot("committed_egp")} /></td>
                <td className="px-3 py-2.5 text-right"><Money value={tot("paid_egp")} /></td>
                <td className="px-3 py-2.5 text-right"><Money value={tot("outstanding_egp")} /></td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {add && <ExpenseDialog open onClose={() => setAdd(false)} lookups={lookups} projectId={projectId ?? null} initialMode={initialMode}
        relatedOptions={projectId ? rows.filter((r) => r.expense_type === "rental" || r.expense_type === "owned_asset").map((r) => ({ id: r.expense_id, label: r.description })) : []} />}
      {pay && <PayExpenseDialog expense={pay} lookups={lookups} onClose={() => setPay(null)} />}
      {edit && <EditExpenseDialog expense={edit} lookups={lookups} onClose={() => setEdit(null)} />}
      <ReasonDialog open={!!reasonFor} onClose={() => setReasonFor(null)} danger={reasonFor?.kind !== "cancel"}
        title={reasonFor?.kind === "cancel" ? `Cancel “${reasonFor.label}”` : `Delete ${reasonFor?.label ?? ""}`}
        confirmLabel={reasonFor?.kind === "cancel" ? "Cancel commitment" : "Delete"}
        description={reasonFor?.kind === "cancel" ? "Anything already paid stays as a cost; the unpaid part is released." : "Payments are reversed in the ledger. The record moves to Deleted Records and stays auditable."}
        pending={cancel.pending || del.pending || delPay.pending} error={(cancel.error ?? del.error ?? delPay.error)?.error}
        onConfirm={(reason) => {
          if (!reasonFor) return;
          if (reasonFor.kind === "cancel") cancel.run(reasonFor.id, reason);
          else if (reasonFor.kind === "delete") del.run(reasonFor.id, reason);
          else delPay.run(reasonFor.id, reason);
        }} />
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={cn("block w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted", danger && "text-neg")}>{children}</button>;
}

function PayExpenseDialog({ expense, lookups, onClose }: { expense: ExpenseRow; lookups: Lookups; onClose: () => void }) {
  const [amount, setAmount] = useState(String(toNum(expense.outstanding_egp) / (toNum(expense.fx_rate) || 1)));
  const [payer, setPayer] = useState<"company" | "partner" | "employee" | "other_person">("company");
  const [cash, setCash] = useState(lookups.cashAccounts.find((c) => c.is_default)?.id ?? "");
  const [person, setPerson] = useState("");
  const [reimbursable, setReimbursable] = useState(true);
  const [d, setD] = useState(today());
  const { run, pending, error } = useAction(payExpense.bind(null, expense.expense_id), { success: "Payment recorded", onSuccess: onClose });
  const people = payer === "partner" ? lookups.partners : payer === "employee" ? lookups.people.filter((p) => ["employee", "freelancer"].includes(p.kind)) : lookups.people.filter((p) => !p.is_partner);
  return (
    <Dialog open onClose={onClose} title="Record payment" subtitle={expense.description} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={!(Number(amount) > 0) || (payer !== "company" && !person)}
          onClick={() => run({ amount: Number(amount), date: d, payer_type: payer, cash_account_id: payer === "company" ? cash : null, person_id: payer === "company" ? null : person, reimbursable })}>Save</Button></>}>
      <div className="space-y-4">
        <Callout tone="info">Outstanding: <b className="num">{egp(expense.outstanding_egp)}</b></Callout>
        <Field label={`Amount (${expense.currency})`}><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Paid by">
          <Select value={payer} onChange={(e) => { setPayer(e.target.value as typeof payer); setPerson(""); }}>
            <option value="company">Move Beyond</option><option value="partner">A partner personally</option>
            <option value="employee">An employee</option><option value="other_person">Another person</option>
          </Select>
        </Field>
        {payer === "company" ? <Field label="From"><CashAccountSelect lookups={lookups} value={cash} onChange={setCash} /></Field>
          : <Field label="Person"><PersonSelect people={people} value={person} onChange={setPerson} /></Field>}
        {payer === "partner" && <Checkbox label="Reimbursable" checked={reimbursable} onChange={(e) => setReimbursable(e.target.checked)} />}
        <Field label="Date"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}

function EditExpenseDialog({ expense, lookups, onClose }: { expense: ExpenseRow; lookups: Lookups; onClose: () => void }) {
  const fx = toNum(expense.fx_rate) || 1;
  const [f, setF] = useState({
    description: expense.description, category_id: expense.category_id ?? "", supplier_id: expense.supplier_id ?? "",
    estimated_amount: expense.estimated_egp ? String(toNum(expense.estimated_egp) / fx) : "",
    committed_amount: expense.status === "estimated" ? "" : String(toNum(expense.committed_egp) / fx), due_date: expense.due_date ?? "",
  });
  const [reason, setReason] = useState("");
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const amountsChanged = toNum(f.committed_amount) !== toNum(expense.committed_egp) / fx || toNum(f.estimated_amount) !== toNum(expense.estimated_egp) / fx;
  const { run, pending, error } = useAction(updateExpense, { success: "Expense updated", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Edit expense" size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={amountsChanged && reason.trim().length < 3}
          onClick={() => run(expense.expense_id, { ...f, committed_amount: f.committed_amount === "" ? null : Number(f.committed_amount), estimated_amount: f.estimated_amount === "" ? null : Number(f.estimated_amount), due_date: f.due_date || null, category_id: f.category_id || null, supplier_id: f.supplier_id || null }, reason || null)}>Save</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Description" className="md:col-span-2"><Input value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
        <Field label="Category"><CategorySelect lookups={lookups} value={f.category_id} onChange={(v) => set("category_id", v)} /></Field>
        <Field label="Supplier">
          <Select value={f.supplier_id} onChange={(e) => set("supplier_id", e.target.value)}>
            <option value="">No supplier</option>
            {lookups.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Estimated"><Input type="number" value={f.estimated_amount} onChange={(e) => set("estimated_amount", e.target.value)} /></Field>
        <Field label="Committed" hint={`Paid so far: ${egp(expense.paid_egp)}`}><Input type="number" value={f.committed_amount} onChange={(e) => set("committed_amount", e.target.value)} /></Field>
        <Field label="Supplier payment due"><Input type="date" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} /></Field>
        {amountsChanged && (
          <Field label="Reason for change" required className="md:col-span-2" hint="e.g. Final supplier invoice received. Recorded in the audit log.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}
