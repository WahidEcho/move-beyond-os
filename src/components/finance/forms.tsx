"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addFunding, addPartnerFee, allocateCtoRecovery, createSubscription, createTechnology, payPerson, recordCollection,
} from "@/app/actions/finance";
import { saveClient, saveSupplier } from "@/app/actions/masterdata";
import { useAction } from "@/components/ui/useAction";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";
import { egp, humanize, toNum } from "@/lib/format";
import { validateRecovery, remainingAfter } from "@/engines/ctoRecovery";
import type { Lookups } from "@/services/queries";
import { CashAccountSelect, PersonSelect, ProjectSelect, n, today } from "./pickers";

type Base = { open: boolean; onClose: () => void; lookups: Lookups };

// ---------------------------------------------------------------------------
// Record client payment (spec §31, D2)
// ---------------------------------------------------------------------------
export function CollectionDialog({ open, onClose, lookups, projectId, milestones = [] }: Base & {
  projectId?: string; milestones?: { milestone_id: string; label: string; outstanding: number | string; due_date: string | null }[];
}) {
  const [project, setProject] = useState(projectId ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [cash, setCash] = useState(lookups.cashAccounts.find((c) => c.is_default)?.id ?? "");
  const [currency, setCurrency] = useState("EGP");
  const [fx, setFx] = useState("1");
  const [reference, setReference] = useState("");
  const [manual, setManual] = useState(false);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const holding = lookups.cashAccounts.find((c) => c.id === cash && c.account_type === "partner_holding");
  const { run, pending, error } = useAction(recordCollection, { success: "Payment recorded", onSuccess: onClose });
  const open_ = milestones.filter((m) => toNum(m.outstanding) > 0);

  return (
    <Dialog open={open} onClose={onClose} title="Record client payment" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={!project || !(Number(amount) > 0)} onClick={() => run({
          projectId: project, amount: Number(amount), date, cashAccountId: cash, currency, fxRate: Number(fx || 1), reference,
          allocations: manual ? Object.entries(alloc).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ milestone_id: k, amount: Number(v) })) : null,
        })}>Record payment</Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-2">
        {!projectId && <Field label="Project" className="md:col-span-2"><ProjectSelect lookups={lookups} value={project} onChange={setProject} /></Field>}
        <Field label="Amount received" required><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Date received"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Received into" className="md:col-span-2" hint={holding ? "The partner holds this money for Move Beyond — it shows on their account until deposited or netted." : undefined}>
          <CashAccountSelect lookups={lookups} value={cash} onChange={setCash} />
        </Field>
        <Field label="Currency">
          <Select value={currency} onChange={(e) => { setCurrency(e.target.value); if (e.target.value === "EGP") setFx("1"); }}>
            {["EGP", "USD", "EUR", "AED", "SAR"].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Exchange rate to EGP"><Input type="number" step="0.0001" disabled={currency === "EGP"} value={fx} onChange={(e) => setFx(e.target.value)} /></Field>
        <Field label="Reference" className="md:col-span-2"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer / cheque number" /></Field>
      </div>
      {open_.length > 0 && (
        <div className="mt-4 rounded-xl border border-line p-3">
          <Checkbox label="Allocate to specific milestones (default: oldest due first)" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          {manual && (
            <div className="mt-3 space-y-2">
              {open_.map((m) => (
                <div key={m.milestone_id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1">{m.label} <span className="text-ink-3">· {egp(m.outstanding)} open</span></span>
                  <Input type="number" className="w-36" value={alloc[m.milestone_id] ?? ""} onChange={(e) => setAlloc({ ...alloc, [m.milestone_id]: e.target.value })} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <Callout tone="danger" className="mt-4">{error.error}</Callout>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Cash funding contribution (spec §24)
// ---------------------------------------------------------------------------
export function FundingDialog({ open, onClose, lookups, projectId }: Base & { projectId?: string }) {
  const [project, setProject] = useState(projectId ?? "");
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [cash, setCash] = useState(lookups.cashAccounts.find((c) => c.is_default)?.id ?? "");
  const [notes, setNotes] = useState("");
  const { run, pending, error } = useAction(addFunding, { success: "Funding recorded", onSuccess: onClose });
  const funders = lookups.people.filter((p) => p.active && (p.is_partner || p.kind === "external" || p.kind === "other"));
  return (
    <Dialog open={open} onClose={onClose} title="Add project funding" subtitle="A partner or funder puts money into the company for this project." size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={!project || !person || !(Number(amount) > 0)}
          onClick={() => run(project, person, Number(amount), date, cash, notes || null)}>Add funding</Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-2">
        {!projectId && <Field label="Project" className="md:col-span-2"><ProjectSelect lookups={lookups} value={project} onChange={setProject} /></Field>}
        <Field label="Funded by"><PersonSelect people={funders} value={person} onChange={setPerson} /></Field>
        <Field label="Amount"><Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Received into"><CashAccountSelect lookups={lookups} value={cash} onChange={setCash} /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Notes" className="md:col-span-2"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <p className="mt-3 text-[13px] text-ink-3">Partner-paid expenses are funding too — record those as expenses with “Paid by”.</p>
      {error && <Callout tone="danger" className="mt-4">{error.error}</Callout>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Pay a person what is due (partial allowed, spec §76)
// ---------------------------------------------------------------------------
const CATEGORY_LABEL: Record<string, string> = {
  funding: "Funding repayment", employee_reimbursement: "Expense reimbursement", fee: "Partner fee", cto: "CTO development recovery",
  profit: "Profit payout", carry_forward: "Carry-forward",
};

export function PayPersonDialog({ open, onClose, lookups, personId, personName, category, projectId, projectLabel, due }: Base & {
  personId: string; personName: string; category: string; projectId: string | null; projectLabel?: string; due: number;
}) {
  const [amount, setAmount] = useState(String(due));
  const [date, setDate] = useState(today());
  const [cash, setCash] = useState(lookups.cashAccounts.find((c) => c.is_default)?.id ?? "");
  const [reference, setReference] = useState("");
  const { run, pending, error } = useAction(payPerson, { success: "Payment recorded", onSuccess: onClose });
  const over = Number(amount) > due + 0.005;
  const fromHolding = lookups.cashAccounts.find((c) => c.id === cash && c.account_type === "partner_holding");
  return (
    <Dialog open={open} onClose={onClose} title={`Pay ${personName}`} subtitle={`${CATEGORY_LABEL[category] ?? humanize(category)}${projectLabel ? ` · ${projectLabel}` : ""}`} size="sm"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={!(Number(amount) > 0) || over}
          onClick={() => run({ personId, category, projectId, amount: Number(amount), date, cashAccountId: cash, reference })}>Record payment</Button>
      </>}>
      <div className="space-y-4">
        <Callout tone="info">Currently due: <b className="num">{egp(due)}</b>. Partial payments leave the rest outstanding.</Callout>
        <Field label="Amount" error={over ? `Maximum payable is ${egp(due)}.` : null}><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Paid from" hint={fromHolding ? "Paid out of company money another partner holds (partner-to-partner settlement)." : undefined}>
          <CashAccountSelect lookups={lookups} value={cash} onChange={setCash} />
        </Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-4">{error.error}</Callout>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Partner fee (spec §42)
// ---------------------------------------------------------------------------
export function FeeDialog({ open, onClose, lookups, projectId, contractValue }: Base & { projectId?: string; contractValue?: number }) {
  const [project, setProject] = useState(projectId ?? "");
  const [person, setPerson] = useState("");
  const [feeType, setFeeType] = useState("management");
  const [basis, setBasis] = useState("pct_contract");
  const [rate, setRate] = useState("10");
  const [amount, setAmount] = useState("");
  const [treatment, setTreatment] = useState("project_cost");
  const [description, setDescription] = useState("");
  const { run, pending, error } = useAction(addPartnerFee.bind(null, project), { success: "Partner fee added", onSuccess: onClose });
  const preview = basis === "fixed" ? Number(amount || 0) : basis === "pct_contract" && contractValue ? (contractValue * Number(rate || 0)) / 100 : null;
  return (
    <Dialog open={open} onClose={onClose} title="Add partner fee" subtitle="Separate from funding, CTO recovery and profit share." size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={!project || !person}
          onClick={() => run({ person_id: person, fee_type: feeType, basis, rate: basis === "fixed" ? null : n(rate), amount: basis === "fixed" ? n(amount) : null, treatment, description })}>Add fee</Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-2">
        {!projectId && <Field label="Project" className="md:col-span-2"><ProjectSelect lookups={lookups} value={project} onChange={setProject} /></Field>}
        <Field label="Partner"><PersonSelect people={lookups.partners} value={person} onChange={setPerson} /></Field>
        <Field label="Fee type">
          <Select value={feeType} onChange={(e) => setFeeType(e.target.value)}>
            {["management", "lead_generation", "sales_commission", "project", "consulting", "custom"].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </Select>
        </Field>
        <Field label="Calculation">
          <Select value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option value="pct_contract">% of contract</option>
            <option value="pct_revenue">% of collected revenue</option>
            <option value="pct_gross_profit">% of gross profit</option>
            <option value="pct_net_profit">% of net profit</option>
            <option value="fixed">Fixed amount</option>
          </Select>
        </Field>
        {basis === "fixed"
          ? <Field label="Amount"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          : <Field label="Rate %"><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>}
        <Field label="Paid as" className="md:col-span-2" hint={treatment === "project_cost" ? "Reduces project profit before the partner split." : "Comes out of this partner’s own profit share."}>
          <Select value={treatment} onChange={(e) => setTreatment(e.target.value)}>
            <option value="project_cost">Project cost (before the split)</option>
            <option value="from_share">From the partner’s own share</option>
          </Select>
        </Field>
        <Field label="Description" className="md:col-span-2"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      {preview !== null && <p className="mt-3 text-sm text-ink-2">Fee: <b className="num">{egp(preview)}</b></p>}
      {error && <Callout tone="danger" className="mt-4">{error.error}</Callout>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Technology development (spec §46–49)
// ---------------------------------------------------------------------------
export function TechnologyDialog({ open, onClose, lookups, originalProjectId }: Base & { originalProjectId?: string }) {
  const router = useRouter();
  const eligible = lookups.people.filter((p) => p.technology_recovery_eligible && p.active);
  const [f, setF] = useState({
    name: "", description: "", developer_person_id: eligible[0]?.id ?? "", category_id: "", original_project_id: originalProjectId ?? "",
    development_start_date: "", completion_date: "", ownership: "Move Beyond", reusable: true, lifecycle_status: "completed",
    agreed_value: "", already_recovered: "", notes: "", service_ids: [] as string[],
  });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const { run, pending, error } = useAction(createTechnology, {
    success: "Technology development recorded",
    onSuccess: (d) => { onClose(); router.push(`/finance/cto/${d.technology_id}`); },
  });
  const techServices = lookups.services.filter((s) => {
    const cat = lookups.serviceCategories.find((c) => c.id === s.category_id)?.name;
    return cat === "Move Pro" || cat === "Event Technology" || cat === "Move Tick" || cat === "Move IT";
  });
  return (
    <Dialog open={open} onClose={onClose} title="Add CTO technology development" subtitle="Tracks the agreed value to recover from future projects that reuse it." size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={!f.name.trim() || !f.developer_person_id} onClick={() => run(f)}>Save technology</Button>
      </>}>
      {eligible.length === 0 && <Callout tone="warn" className="mb-4">No person is marked as eligible for technology recovery. Set this in Settings → People.</Callout>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Technology / system name" required className="md:col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Move Beyond Padel Tournament Platform" /></Field>
        <Field label="Developer"><PersonSelect people={eligible} value={f.developer_person_id} onChange={(v) => set("developer_person_id", v)} /></Field>
        <Field label="Category">
          <Select value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
            <option value="">—</option>
            {lookups.technologyCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Agreed recoverable development value (EGP)" required hint="Agreed value of the development effort — not the external cash cost.">
          <Input type="number" min="0" value={f.agreed_value} onChange={(e) => set("agreed_value", e.target.value)} />
        </Field>
        <Field label="Already recovered before go-live" hint="Only for systems built before this platform.">
          <Input type="number" min="0" value={f.already_recovered} onChange={(e) => set("already_recovered", e.target.value)} />
        </Field>
        <Field label="Original project" className="md:col-span-2"><ProjectSelect lookups={lookups} value={f.original_project_id} onChange={(v) => set("original_project_id", v)} allowNone noneLabel="None / internal" /></Field>
        <Field label="Development started"><Input type="date" value={f.development_start_date} onChange={(e) => set("development_start_date", e.target.value)} /></Field>
        <Field label="Completed"><Input type="date" value={f.completion_date} onChange={(e) => set("completion_date", e.target.value)} /></Field>
        <Field label="Status">
          <Select value={f.lifecycle_status} onChange={(e) => set("lifecycle_status", e.target.value)}>
            {["planned", "in_development", "completed"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
        </Field>
        <Field label="Ownership" hint="Operational ownership only — not a legal IP statement."><Input value={f.ownership} onChange={(e) => set("ownership", e.target.value)} /></Field>
        <div className="md:col-span-2"><Checkbox label="Reusable across projects" checked={f.reusable} onChange={(e) => set("reusable", e.target.checked)} /></div>
        <Field label="Related services" className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            {techServices.map((s) => {
              const on = f.service_ids.includes(s.id);
              return (
                <button key={s.id} type="button" onClick={() => set("service_ids", on ? f.service_ids.filter((x) => x !== s.id) : [...f.service_ids, s.id])}
                  className={`rounded-full border px-2.5 py-1 text-[12.5px] ${on ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:bg-muted"}`}>{s.name}</button>
              );
            })}
          </div>
        </Field>
        <Field label="Description" className="md:col-span-2"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-4">{error.error}</Callout>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Allocate CTO recovery from a project (spec §51–54)
// ---------------------------------------------------------------------------
export function AllocateCtoDialog({ open, onClose, lookups, projectId, technologyId, outstanding, techName, developer }: Base & {
  projectId?: string; technologyId?: string; outstanding?: number; techName?: string; developer?: string;
}) {
  const [project, setProject] = useState(projectId ?? "");
  const [tech, setTech] = useState(technologyId ?? "");
  const t = lookups.technologies.find((x) => x.technology_id === tech);
  const out = outstanding ?? toNum(t?.outstanding);
  const [amount, setAmount] = useState(out ? String(out) : "");
  const [treatment, setTreatment] = useState("project_cost");
  const [notes, setNotes] = useState("");
  const check = validateRecovery(Number(amount || 0), out);
  const { run, pending, error } = useAction(allocateCtoRecovery, {
    success: (d) => `CTO recovery allocated · ${egp(d.outstanding)} still outstanding`, onSuccess: onClose,
  });
  const available = useMemo(() => lookups.technologies.filter((x) => toNum(x.outstanding) > 0), [lookups.technologies]);
  return (
    <Dialog open={open} onClose={onClose} title="Allocate CTO development recovery" size="md"
      subtitle={techName ? `${techName} · Developer: ${developer ?? t?.developer_name ?? ""}` : "Enter the exact amount this project can support."}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={!project || !tech || !check.ok}
          onClick={() => run(tech, project, Number(amount), treatment, notes || null)}>Allocate recovery</Button>
      </>}>
      <div className="grid gap-4">
        {!technologyId && (
          <Field label="Technology">
            <Select value={tech} onChange={(e) => { setTech(e.target.value); const o = toNum(lookups.technologies.find((x) => x.technology_id === e.target.value)?.outstanding); setAmount(o ? String(o) : ""); }}>
              <option value="" disabled>Select technology…</option>
              {available.map((x) => <option key={x.technology_id} value={x.technology_id}>{x.name} · {egp(x.outstanding)} outstanding</option>)}
            </Select>
          </Field>
        )}
        {!projectId && <Field label="Recover from project"><ProjectSelect lookups={lookups} value={project} onChange={setProject} /></Field>}
        {tech && <Callout tone="info">Outstanding CTO development recovery: <b className="num">{egp(out)}</b>. The project may pay 0, part, or all of it.</Callout>}
        <Field label="Recovery amount (exact)" error={!check.ok && amount ? check.message : null}
          hint={check.ok ? `Remaining after this: ${egp(remainingAfter(out, Number(amount || 0)))}` : undefined}>
          <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paid as" hint={treatment === "project_cost" ? "Shown separately in project profitability, before the partner split." : "Comes out of the developer’s own profit share on this project."}>
          <Select value={treatment} onChange={(e) => setTreatment(e.target.value)}>
            <option value="project_cost">Project cost (before the split)</option>
            <option value="from_share">From the developer’s own share</option>
          </Select>
        </Field>
        <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-4">{error.error}</Callout>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Subscription (spec §36)
// ---------------------------------------------------------------------------
export function SubscriptionDialog({ open, onClose, lookups }: Base) {
  const router = useRouter();
  const moveIt = lookups.serviceCategories.find((c) => c.name === "Move IT");
  const defaultService = lookups.services.find((s) => s.category_id === moveIt?.id)?.id ?? "";
  const [f, setF] = useState({
    client_id: "", service_id: defaultService, plan_name: "", billing_cycle: "annual", cycle_months: "", cycle_amount: "", discount_pct: "",
    setup_fee: "", start_date: today(), trial_end_date: "", end_date: "", currency: "EGP", fx_rate: "1", auto_renew: true, notes: "",
    items: [] as { item_type: string; description: string; quantity: string; amount_per_cycle: string }[],
  });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const { run, pending, error } = useAction(createSubscription, {
    success: "Subscription created", onSuccess: (d) => { onClose(); router.push(`/finance/projects/${d.project_id}`); },
  });
  return (
    <Dialog open={open} onClose={onClose} title="Create subscription" subtitle="Creates the subscription project and bills the first period." size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={pending} disabled={!f.client_id || !(Number(f.cycle_amount) >= 0) || !f.cycle_amount}
          onClick={() => run({ ...f, items: f.items.map((i) => ({ ...i, quantity: n(i.quantity) ?? 1, amount_per_cycle: n(i.amount_per_cycle) ?? 0 })) })}>Create</Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Client" required>
          <Select value={f.client_id} onChange={(e) => set("client_id", e.target.value)}>
            <option value="" disabled>Select client…</option>
            {lookups.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Service">
          <Select value={f.service_id} onChange={(e) => set("service_id", e.target.value)}>
            {lookups.serviceCategories.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {lookups.services.filter((s) => s.category_id === c.id && s.billing_nature !== "one_time").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Plan name"><Input value={f.plan_name} onChange={(e) => set("plan_name", e.target.value)} placeholder="e.g. Academy Pro" /></Field>
        <Field label="Billing">
          <Select value={f.billing_cycle} onChange={(e) => set("billing_cycle", e.target.value)}>
            {["monthly", "quarterly", "semiannual", "annual", "custom"].map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
          </Select>
        </Field>
        {f.billing_cycle === "custom" && <Field label="Months per cycle"><Input type="number" min="1" value={f.cycle_months} onChange={(e) => set("cycle_months", e.target.value)} /></Field>}
        <Field label="Price per cycle" required><Input type="number" min="0" value={f.cycle_amount} onChange={(e) => set("cycle_amount", e.target.value)} /></Field>
        <Field label="Discount %"><Input type="number" min="0" max="100" value={f.discount_pct} onChange={(e) => set("discount_pct", e.target.value)} /></Field>
        <Field label="Setup fee"><Input type="number" min="0" value={f.setup_fee} onChange={(e) => set("setup_fee", e.target.value)} /></Field>
        <Field label="Start date"><Input type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
        <Field label="Free trial until" hint="Leave blank for no trial."><Input type="date" value={f.trial_end_date} onChange={(e) => set("trial_end_date", e.target.value)} /></Field>
        <Field label="End date (optional)"><Input type="date" value={f.end_date} onChange={(e) => set("end_date", e.target.value)} /></Field>
        <div className="flex items-end pb-2"><Checkbox label="Auto-renew" checked={f.auto_renew} onChange={(e) => set("auto_renew", e.target.checked)} /></div>
      </div>
      <div className="mt-4 rounded-xl border border-line p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-semibold">Add-ons</p>
          <Button size="sm" variant="ghost" onClick={() => set("items", [...f.items, { item_type: "branch_addon", description: "Additional branch", quantity: "1", amount_per_cycle: "" }])}>+ Add-on</Button>
        </div>
        {f.items.length === 0 && <p className="text-[13px] text-ink-3">Branch, user or module add-ons billed each cycle.</p>}
        {f.items.map((it, i) => (
          <div key={i} className="mb-2 grid grid-cols-[140px_1fr_70px_110px_28px] gap-2">
            <Select value={it.item_type} onChange={(e) => set("items", f.items.map((x, j) => (j === i ? { ...x, item_type: e.target.value } : x)))}>
              {["branch_addon", "user_addon", "module_addon", "discount", "other"].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </Select>
            <Input value={it.description} onChange={(e) => set("items", f.items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            <Input type="number" value={it.quantity} onChange={(e) => set("items", f.items.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
            <Input type="number" placeholder="per cycle" value={it.amount_per_cycle} onChange={(e) => set("items", f.items.map((x, j) => (j === i ? { ...x, amount_per_cycle: e.target.value } : x)))} />
            <button className="text-ink-3 hover:text-neg" onClick={() => set("items", f.items.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
      {error && <Callout tone="danger" className="mt-4">{error.error}</Callout>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Client & supplier master records
// ---------------------------------------------------------------------------
export function ClientDialog({ open, onClose, client }: { open: boolean; onClose: () => void; client?: Record<string, string | null> }) {
  const [f, setF] = useState({
    name: client?.name ?? "", company_name: client?.company_name ?? "", client_type: client?.client_type ?? "company",
    phone: client?.phone ?? "", email: client?.email ?? "", notes: client?.notes ?? "", status: client?.status ?? "active",
  });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const { run, pending, error } = useAction(saveClient.bind(null, (client?.id as string) ?? null), { success: "Client saved", onSuccess: onClose });
  return (
    <Dialog open={open} onClose={onClose} title={client ? "Edit client" : "New client"} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!f.name.trim()} onClick={() => run(f)}>Save</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Client name" required className="md:col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Levels FC" /></Field>
        <Field label="Company name"><Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
        <Field label="Client type">
          <Select value={f.client_type} onChange={(e) => set("client_type", e.target.value)}>
            {["company", "club", "academy", "federation", "brand", "agency", "government", "individual", "other"].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </Select>
        </Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        {client && (
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set("status", e.target.value)}><option value="active">Active</option><option value="archived">Archived</option></Select>
          </Field>
        )}
        <Field label="Notes" className="md:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-4">{error.error}</Callout>}
    </Dialog>
  );
}

export function SupplierDialog({ open, onClose, supplier }: { open: boolean; onClose: () => void; supplier?: Record<string, string | null> }) {
  const [f, setF] = useState({
    name: supplier?.name ?? "", company_name: supplier?.company_name ?? "", category: supplier?.category ?? "", phone: supplier?.phone ?? "",
    email: supplier?.email ?? "", bank_details: supplier?.bank_details ?? "", notes: supplier?.notes ?? "",
  });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const { run, pending, error } = useAction(saveSupplier.bind(null, (supplier?.id as string) ?? null), { success: "Supplier saved", onSuccess: onClose });
  return (
    <Dialog open={open} onClose={onClose} title={supplier ? "Edit supplier" : "New supplier"} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!f.name.trim()} onClick={() => run(f)}>Save</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Supplier name" required><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Company"><Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
        <Field label="Category"><Input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Production, Rentals" /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Bank details" className="md:col-span-2"><Textarea value={f.bank_details} onChange={(e) => set("bank_details", e.target.value)} /></Field>
        <Field label="Notes" className="md:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
      {error && <Callout tone="danger" className="mt-4">{error.error}</Callout>}
    </Dialog>
  );
}
