"use client";
import { useMemo, useState } from "react";
import { addExpense } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";
import { egp } from "@/lib/format";
import type { Lookups } from "@/services/queries";
import { CashAccountSelect, CategorySelect, PersonSelect, ProjectSelect, n, today } from "./pickers";

type Mode = "paid" | "commitment" | "estimate";

/**
 * One form for every cost (spec §106): the user states the amount and who paid;
 * the database creates the expense, payment, funding / reimbursement, ledger
 * entry and (for owned assets) the asset register row atomically.
 */
export function ExpenseDialog({ open, onClose, lookups, projectId, initialMode = "paid", initialType = "normal", title, relatedOptions = [] }: {
  open: boolean; onClose: () => void; lookups: Lookups; projectId?: string | null; initialMode?: Mode; initialType?: "normal" | "rental" | "owned_asset"; title?: string;
  relatedOptions?: { id: string; label: string }[];
}) {
  const [project, setProject] = useState(projectId ?? "");
  const [mode, setMode] = useState<Mode>(initialMode);
  const [type, setType] = useState(initialType);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [estimated, setEstimated] = useState("");
  const [committed, setCommitted] = useState("");
  const [paid, setPaid] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [payer, setPayer] = useState<"company" | "partner" | "employee" | "other_person">("company");
  const [cashAccount, setCashAccount] = useState(lookups.cashAccounts.find((c) => c.is_default)?.id ?? "");
  const [person, setPerson] = useState("");
  const [reimbursable, setReimbursable] = useState(true);
  const [currency, setCurrency] = useState("EGP");
  const [fx, setFx] = useState("1");
  const [capitalize, setCapitalize] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [assetQty, setAssetQty] = useState("1");
  const [assetCategory, setAssetCategory] = useState("");
  const [serial, setSerial] = useState("");
  const [related, setRelated] = useState("");
  const [basis, setBasis] = useState("");
  const [notes, setNotes] = useState("");

  const payerPeople = useMemo(() => {
    if (payer === "partner") return lookups.partners;
    if (payer === "employee") return lookups.people.filter((p) => ["employee", "freelancer"].includes(p.kind) && p.active);
    return lookups.people.filter((p) => !p.is_partner && p.active);
  }, [payer, lookups]);

  const { run, pending, error } = useAction(addExpense, {
    success: (d) => (d.asset_id ? "Expense recorded and asset registered" : "Expense recorded"),
    onSuccess: () => onClose(),
  });

  const amountPaid = Number(paid || (mode === "paid" ? committed : 0) || 0);
  const committedValue = mode === "estimate" ? null : n(committed) ?? (mode === "paid" ? n(paid) : null);
  const personName = lookups.people.find((p) => p.id === person)?.full_name;

  const submit = () => {
    const payment = mode !== "estimate" && amountPaid > 0 ? {
      amount: amountPaid, date: payDate, payer_type: payer, cash_account_id: payer === "company" ? cashAccount : null,
      person_id: payer === "company" ? null : person, reimbursable, fx_rate: Number(fx || 1),
    } : undefined;
    run({
      project_id: project || null, description, category_id: category || null, supplier_id: supplier || null, expense_type: type,
      estimated_amount: n(estimated), committed_amount: committedValue, currency, fx_rate: Number(fx || 1), due_date: dueDate || null,
      capitalize, related_expense_id: related || null, allocation_basis: basis || null, notes,
      payment, asset: type === "owned_asset" ? { name: assetName || description, quantity: Number(assetQty || 1), category_id: assetCategory || null, serial_number: serial || null } : undefined,
    });
  };

  const valid = description.trim() && (mode === "estimate" ? Number(estimated) > 0 : Number(committed || paid) > 0)
    && (mode !== "paid" || payer === "company" || person);

  return (
    <Dialog open={open} onClose={onClose} title={title ?? "Add expense"} subtitle="The system creates the payment, funding or reimbursement for you." size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} loading={pending} disabled={!valid}>Save expense</Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Project" className="md:col-span-2">
          <ProjectSelect lookups={lookups} value={project} onChange={setProject} allowNone />
        </Field>
        <Field label="Description" required className="md:col-span-2">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. LED screens rental" />
        </Field>
        <Field label="Category">
          <CategorySelect lookups={lookups} value={category} onChange={setCategory} scope={project ? "project" : "overhead"} />
        </Field>
        <Field label="Supplier" hint="Recommended, not required.">
          <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">No supplier</option>
            {lookups.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Expense type">
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="normal">Normal expense</option>
            <option value="rental">Rental</option>
            <option value="owned_asset">Owned asset (registers an asset)</option>
          </Select>
        </Field>
        <Field label="Status">
          <div className="flex rounded-lg border border-line-strong p-0.5 text-[13px]">
            {([["paid", "Paid now"], ["commitment", "Committed"], ["estimate", "Estimate only"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMode(k)} className={`flex-1 rounded-md px-2 py-1.5 ${mode === k ? "bg-ink text-white" : "text-ink-2 hover:bg-muted"}`}>{l}</button>
            ))}
          </div>
        </Field>

        <Field label="Estimated cost" hint="Optional budget figure.">
          <Input type="number" min="0" step="0.01" value={estimated} onChange={(e) => setEstimated(e.target.value)} />
        </Field>
        {mode !== "estimate" && (
          <Field label={mode === "paid" ? "Total cost (agreed)" : "Committed amount"} required hint={mode === "paid" ? "Leave blank if it equals the amount paid." : "What you agreed with the supplier."}>
            <Input type="number" min="0" step="0.01" value={committed} onChange={(e) => setCommitted(e.target.value)} />
          </Field>
        )}
        {mode === "commitment" && (
          <Field label="Supplier payment due">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        )}
        {mode !== "estimate" && (
          <Field label={mode === "paid" ? "Amount paid now" : "Paid now (optional)"} hint={mode === "paid" ? "Leave blank to pay the full amount." : undefined}>
            <Input type="number" min="0" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} />
          </Field>
        )}
      </div>

      {mode !== "estimate" && amountPaid > 0 && (
        <div className="mt-5 rounded-xl border border-line bg-subtle p-4">
          <p className="mb-3 text-[13px] font-semibold">Who paid?</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Paid by">
              <Select value={payer} onChange={(e) => { setPayer(e.target.value as typeof payer); setPerson(""); }}>
                <option value="company">Move Beyond (company money)</option>
                <option value="partner">A partner personally</option>
                <option value="employee">An employee</option>
                <option value="other_person">Another person (funder)</option>
              </Select>
            </Field>
            {payer === "company" ? (
              <Field label="From account"><CashAccountSelect lookups={lookups} value={cashAccount} onChange={setCashAccount} /></Field>
            ) : (
              <Field label="Person"><PersonSelect people={payerPeople} value={person} onChange={setPerson} /></Field>
            )}
            <Field label="Payment date"><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field>
            {payer === "partner" && (
              <div className="flex items-end pb-2">
                <Checkbox label="Reimbursable" checked={reimbursable} onChange={(e) => setReimbursable(e.target.checked)} />
              </div>
            )}
          </div>
          <p className="mt-3 text-[13px] text-ink-2">
            {payer === "company" && project && <>Recorded as <b>Move Beyond funding</b> for this project — recovered at settlement.</>}
            {payer === "company" && !project && <>Recorded as company overhead.</>}
            {payer === "partner" && person && (reimbursable
              ? <><b>{egp(amountPaid)}</b> becomes due to <b>{personName}</b> as project funding.</>
              : <>Recorded as <b>{personName}</b>’s capital contribution — nothing becomes due.</>)}
            {payer === "employee" && person && <><b>{egp(amountPaid)}</b> reimbursement becomes due to <b>{personName}</b>. They are not a funder or profit participant.</>}
            {payer === "other_person" && person && <><b>{egp(amountPaid)}</b> becomes funding due to <b>{personName}</b>.</>}
          </p>
        </div>
      )}

      <details className="mt-4 rounded-xl border border-line px-4 py-2 text-sm">
        <summary className="cursor-pointer py-1 text-[13px] font-medium text-ink-2">More options — currency, asset details, landed cost</summary>
        <div className="grid gap-4 py-3 md:grid-cols-2">
          <Field label="Currency">
            <Select value={currency} onChange={(e) => { setCurrency(e.target.value); if (e.target.value === "EGP") setFx("1"); }}>
              {["EGP", "USD", "EUR", "AED", "SAR"].map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Exchange rate to EGP" hint="Locked at record time.">
            <Input type="number" step="0.0001" value={fx} disabled={currency === "EGP"} onChange={(e) => setFx(e.target.value)} />
          </Field>
          {type === "owned_asset" && (
            <>
              <Field label="Asset name"><Input value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder={description || "e.g. Samsung 65\" TV"} /></Field>
              <Field label="Quantity"><Input type="number" min="1" value={assetQty} onChange={(e) => setAssetQty(e.target.value)} /></Field>
              <Field label="Asset category">
                <Select value={assetCategory} onChange={(e) => setAssetCategory(e.target.value)}>
                  <option value="">—</option>
                  {lookups.assetCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Serial number"><Input value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
              <div className="md:col-span-2">
                <Checkbox label="Capitalise as a company asset instead of a project cost" checked={capitalize} onChange={(e) => setCapitalize(e.target.checked)} />
              </div>
            </>
          )}
          {relatedOptions.length > 0 && (<>
          <Field label="Related to (landed cost)" hint="e.g. delivery for a TV rental.">
            <Select value={related} onChange={(e) => setRelated(e.target.value)}>
              <option value="">Not a related charge</option>
              {relatedOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Charge applies">
            <Select value={basis} onChange={(e) => setBasis(e.target.value)}>
              <option value="">—</option>
              <option value="per_unit">Per unit</option>
              <option value="per_bundle">Per bundle</option>
              <option value="per_supplier_order">Per supplier order</option>
              <option value="per_project">Per project</option>
            </Select>
          </Field>
          </>)}
          <Field label="Notes" className="md:col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </details>
      {error && <Callout tone="danger" className="mt-4">{error.error}</Callout>}
    </Dialog>
  );
}
