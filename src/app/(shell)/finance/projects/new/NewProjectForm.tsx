"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createProject, setProjectTechnology } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Callout } from "@/components/ui/Callout";
import { ClientDialog } from "@/components/finance/forms";
import { egp, humanize, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";

type Milestone = { label: string; trigger_kind: string; due_date: string; amount: string };

const PRESETS: Record<string, (v: number, start: string, end: string) => Milestone[]> = {
  upfront: (v, s) => [{ label: "100% upfront", trigger_kind: "signing", due_date: s, amount: String(v) }],
  downpayment_final: (v, s, e) => [
    { label: "Downpayment (50%)", trigger_kind: "signing", due_date: s, amount: String(Math.round(v / 2)) },
    { label: "Final (50%)", trigger_kind: "completion", due_date: e, amount: String(v - Math.round(v / 2)) }],
  milestones: (v, s, e) => [
    { label: "Signing", trigger_kind: "signing", due_date: s, amount: String(Math.round(v * 0.3)) },
    { label: "Before event", trigger_kind: "before_event", due_date: s, amount: String(Math.round(v * 0.3)) },
    { label: "Completion", trigger_kind: "completion", due_date: e, amount: String(v - 2 * Math.round(v * 0.3)) }],
  after_completion: (v, _s, e) => [{ label: "After completion", trigger_kind: "completion", due_date: e, amount: String(v) }],
  custom: () => [],
  none: () => [],
};

export function NewProjectForm({ lookups }: { lookups: Lookups }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: "", client_id: "", project_type: "event", operational_status: "confirmed", start_date: "", end_date: "",
    contract_value: "", currency: "EGP", fx_rate: "1", payment_structure: "downpayment_final", budget_amount: "", location: "",
    description: "", is_marketing_investment: false,
  });
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [pm, setPm] = useState("");
  const [lead, setLead] = useState("");
  const [tech, setTech] = useState<{ id: string; decision: string }[]>([]);
  const [clientOpen, setClientOpen] = useState(false);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  const value = toNum(f.contract_value);
  const scheduled = milestones.reduce((a, m) => a + toNum(m.amount), 0);
  const applyPreset = (ps: string) => { set("payment_structure", ps); setMilestones(PRESETS[ps]?.(value, f.start_date, f.end_date || f.start_date) ?? []); };

  const { run, pending, error } = useAction(createProject, {
    success: (d) => `Project ${d.code} created`,
    onSuccess: async (d) => {
      for (const t of tech) await setProjectTechnology(d.project_id, t.id, t.decision, null, "");
      router.push(`/finance/projects/${d.project_id}`);
    },
    refresh: false,
  });

  const outstandingTech = useMemo(() => lookups.technologies.filter((t) => t.reusable && t.lifecycle_status !== "cancelled"), [lookups.technologies]);
  const valid = f.name.trim() && f.project_type && (f.project_type === "sponsorship" || f.project_type === "internal" || value >= 0);

  const submit = () => run({
    ...f, contract_value: value, fx_rate: toNum(f.fx_rate) || 1, budget_amount: f.budget_amount ? toNum(f.budget_amount) : null,
    client_id: f.client_id || null, start_date: f.start_date || null, end_date: f.end_date || null, service_ids: serviceIds,
    milestones: milestones.filter((m) => toNum(m.amount) > 0).map((m) => ({ ...m, amount: toNum(m.amount), due_date: m.due_date || null })),
    members: [pm && { person_id: pm, project_role: "project_manager" }, lead && { person_id: lead, project_role: "lead_generator" }].filter(Boolean),
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Project" />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field label="Project name" required className="md:col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Katameya Heights Padel Open" /></Field>
            <Field label="Client" hint={<button type="button" className="underline" onClick={() => setClientOpen(true)}>+ New client</button>}>
              <Select value={f.client_id} onChange={(e) => set("client_id", e.target.value)}>
                <option value="">No client (internal)</option>
                {lookups.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Project type" required>
              <Select value={f.project_type} onChange={(e) => { set("project_type", e.target.value); if (e.target.value === "sponsorship") set("is_marketing_investment", true); }}>
                {["event", "one_time_service", "subscription", "recurring_contract", "product_sale", "sponsorship", "internal", "other"].map((t) =>
                  <option key={t} value={t}>{t === "sponsorship" ? "Sponsorship / marketing investment" : t === "internal" ? "Internal company project" : humanize(t)}</option>)}
              </Select>
            </Field>
            <Field label="Start date"><Input type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
            <Field label="End date"><Input type="date" value={f.end_date} onChange={(e) => set("end_date", e.target.value)} /></Field>
            <Field label="Operational status">
              <Select value={f.operational_status} onChange={(e) => set("operational_status", e.target.value)}>
                {["lead", "confirmed", "preparation", "live", "completed"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
              </Select>
            </Field>
            <Field label="Location"><Input value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
            {f.project_type === "sponsorship" && (
              <div className="md:col-span-2"><Checkbox label="Marketing / sponsorship investment — zero revenue is intentional" checked={f.is_marketing_investment} onChange={(e) => set("is_marketing_investment", e.target.checked)} /></div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Services" subtitle="A project can combine several Move Beyond services." />
          <CardBody className="space-y-3">
            {lookups.serviceCategories.filter((c) => c.active).map((c) => {
              const svcs = lookups.services.filter((s) => s.category_id === c.id && s.active);
              if (!svcs.length) return null;
              return (
                <div key={c.id}>
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{c.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {svcs.map((s) => {
                      const on = serviceIds.includes(s.id);
                      return <button type="button" key={s.id} onClick={() => setServiceIds(on ? serviceIds.filter((x) => x !== s.id) : [...serviceIds, s.id])}
                        className={`rounded-full border px-2.5 py-1 text-[12.5px] transition-colors ${on ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:bg-muted"}`}>{s.name}</button>;
                    })}
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Contract & payment structure" />
          <CardBody>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Contract value" required><Input type="number" min="0" value={f.contract_value} onChange={(e) => set("contract_value", e.target.value)} /></Field>
              <Field label="Currency">
                <Select value={f.currency} onChange={(e) => { set("currency", e.target.value); if (e.target.value === "EGP") set("fx_rate", "1"); }}>
                  {["EGP", "USD", "EUR", "AED", "SAR"].map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Rate to EGP"><Input type="number" step="0.0001" disabled={f.currency === "EGP"} value={f.fx_rate} onChange={(e) => set("fx_rate", e.target.value)} /></Field>
              <Field label="Budget (expected cost)" hint="Used for budget alerts."><Input type="number" min="0" value={f.budget_amount} onChange={(e) => set("budget_amount", e.target.value)} /></Field>
              <Field label="Payment structure" className="md:col-span-2">
                <Select value={f.payment_structure} onChange={(e) => applyPreset(e.target.value)}>
                  <option value="upfront">100% upfront</option>
                  <option value="downpayment_final">Downpayment + final</option>
                  <option value="milestones">Multiple milestones</option>
                  <option value="after_completion">After completion</option>
                  <option value="custom">Custom schedule</option>
                  <option value="none">No client payments (sponsorship / internal)</option>
                </Select>
              </Field>
            </div>
            <div className="mt-4 space-y-2">
              {milestones.map((m, i) => (
                <div key={i} className="grid grid-cols-[1fr_150px_150px_140px_32px] items-center gap-2">
                  <Input value={m.label} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <Select value={m.trigger_kind} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, trigger_kind: e.target.value } : x)))}>
                    {["signing", "before_event", "completion", "date", "custom"].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
                  </Select>
                  <Input type="date" value={m.due_date} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} />
                  <Input type="number" value={m.amount} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  <button type="button" onClick={() => setMilestones(milestones.filter((_, j) => j !== i))} className="text-ink-4 hover:text-neg"><Trash2 className="size-4" /></button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button size="sm" variant="ghost" onClick={() => setMilestones([...milestones, { label: `Payment ${milestones.length + 1}`, trigger_kind: "date", due_date: "", amount: "" }])}><Plus className="size-3.5" />Add payment</Button>
                {milestones.length > 0 && <p className={`num text-[13px] ${Math.abs(scheduled - value) > 0.5 ? "text-warn" : "text-ink-3"}`}>Scheduled {egp(scheduled)} of {egp(value)}</p>}
              </div>
              {milestones.length === 0 && value > 0 && <Button size="sm" variant="secondary" onClick={() => applyPreset(f.payment_structure)}>Build schedule from “{humanize(f.payment_structure)}”</Button>}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="People" subtitle="Used for partner fee suggestions." />
          <CardBody className="space-y-4">
            <Field label="Project / event manager">
              <Select value={pm} onChange={(e) => setPm(e.target.value)}>
                <option value="">—</option>
                {lookups.people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Lead generated by">
              <Select value={lead} onChange={(e) => setLead(e.target.value)}>
                <option value="">—</option>
                {lookups.partners.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Technology used" subtitle="Reusable systems from the technology library." />
          <CardBody className="space-y-3">
            {outstandingTech.length === 0 && <p className="text-[13px] text-ink-3">No reusable technology recorded yet.</p>}
            {outstandingTech.map((t) => {
              const sel = tech.find((x) => x.id === t.technology_id);
              return (
                <div key={t.technology_id} className="rounded-lg border border-line p-3">
                  <Checkbox label={<span className="font-medium text-ink">{t.name}</span>} checked={!!sel}
                    onChange={(e) => setTech(e.target.checked ? [...tech, { id: t.technology_id, decision: "decide_at_settlement" }] : tech.filter((x) => x.id !== t.technology_id))} />
                  {sel && toNum(t.outstanding) > 0 && (
                    <div className="mt-2 rounded-md bg-warn-soft p-2.5 text-[12.5px] text-ink-2">
                      Outstanding CTO development recovery: <b className="num">{egp(t.outstanding)}</b> · Developer: {t.developer_name}
                      <Select className="mt-2 h-8" value={sel.decision} onChange={(e) => setTech(tech.map((x) => (x.id === t.technology_id ? { ...x, decision: e.target.value } : x)))}>
                        <option value="add_recovery">Add recovery (set amount on the project)</option>
                        <option value="decide_at_settlement">Decide during settlement</option>
                        <option value="no_recovery">No recovery from this project</option>
                      </Select>
                    </div>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Field label="Notes"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
            {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
            <Button variant="primary" className="mt-4 w-full" loading={pending} disabled={!valid} onClick={submit}>Create project</Button>
            <p className="mt-2 text-center text-[12px] text-ink-3">A short code like MB-26001 is assigned automatically.</p>
          </CardBody>
        </Card>
      </div>
      {clientOpen && <ClientDialog open onClose={() => { setClientOpen(false); router.refresh(); }} />}
    </div>
  );
}
