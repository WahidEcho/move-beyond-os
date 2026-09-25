"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import {
  inviteUser, saveExpenseCategory, saveFeePreset, savePerson, saveService, saveServiceCategory, saveSettings, saveSimpleCategory, setUserRoles,
} from "@/app/actions/masterdata";
import { useAction } from "@/components/ui/useAction";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { humanize, toNum } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
export function CompanyPanel({ settings }: { settings: any }) {
  const [f, setF] = useState({
    company_name: settings.company_name, reserve_target: String(settings.reserve_target), approval_workflow_enabled: settings.approval_workflow_enabled,
    tax_enabled: settings.tax_enabled, cto_recovery_enabled: settings.cto_recovery_enabled, collection_reminder_days: (settings.collection_reminder_days ?? []).join(", "),
    overdue_reminder_every_days: String(settings.overdue_reminder_every_days), email_notifications_enabled: settings.email_notifications_enabled, project_code_prefix: settings.project_code_prefix,
  });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const { run, pending, error } = useAction(saveSettings, { success: "Settings saved" });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader title="Company" /><CardBody className="grid gap-4">
        <Field label="Company name"><Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
        <Field label="Base currency" hint="All executive reporting consolidates into EGP."><Input value="EGP" disabled /></Field>
        <Field label="Project code prefix" hint="Codes look like MB-26001."><Input value={f.project_code_prefix} onChange={(e) => set("project_code_prefix", e.target.value)} /></Field>
        <Field label="Logo & letterhead" hint="Used on PDF reports (after go-live). Files live in /Logos."><Input value="Move Beyond wordmark" disabled /></Field>
      </CardBody></Card>
      <Card><CardHeader title="Finance rules" /><CardBody className="grid gap-4">
        <Field label="Company reserve minimum (EGP)"><Input type="number" value={f.reserve_target} onChange={(e) => set("reserve_target", e.target.value)} /></Field>
        <Checkbox label="Approval workflow (OFF in V1 — partners approve their own actions)" checked={f.approval_workflow_enabled} onChange={(e) => set("approval_workflow_enabled", e.target.checked)} />
        <Checkbox label="Tax / VAT (OFF — amounts are entered as paid)" checked={f.tax_enabled} onChange={(e) => set("tax_enabled", e.target.checked)} />
        <Checkbox label="CTO development recovery enabled" checked={f.cto_recovery_enabled} onChange={(e) => set("cto_recovery_enabled", e.target.checked)} />
      </CardBody></Card>
      <Card><CardHeader title="Notifications" /><CardBody className="grid gap-4">
        <Field label="Collection reminders — days before due" hint="0 = on the due date. Individual contracts can override."><Input value={f.collection_reminder_days} onChange={(e) => set("collection_reminder_days", e.target.value)} /></Field>
        <Field label="Repeat overdue reminders every (days)"><Input type="number" value={f.overdue_reminder_every_days} onChange={(e) => set("overdue_reminder_every_days", e.target.value)} /></Field>
        <Checkbox label="Email high-priority alerts (Resend)" checked={f.email_notifications_enabled} onChange={(e) => set("email_notifications_enabled", e.target.checked)} />
      </CardBody></Card>
      <div className="lg:col-span-2 flex items-center justify-end gap-3">
        {error && <Callout tone="danger">{error.error}</Callout>}
        <Button variant="primary" loading={pending} onClick={() => run({
          ...f, reserve_target: Number(f.reserve_target), overdue_reminder_every_days: Number(f.overdue_reminder_every_days),
          collection_reminder_days: f.collection_reminder_days.split(",").map((x: string) => parseInt(x.trim(), 10)).filter((x: number) => Number.isFinite(x)),
        })}>Save settings</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function PeoplePanel({ people }: { people: any[] }) {
  const [edit, setEdit] = useState<any>(null);
  const partners = people.filter((p) => p.is_partner && p.active);
  const total = partners.reduce((a, p) => a + toNum(p.profit_share_pct), 0);
  return (
    <Card>
      <CardHeader title="People" subtitle="Partners, employees, freelancers and external funders." actions={<Button size="sm" variant="primary" onClick={() => setEdit({})}><Plus className="size-3.5" />Add person</Button>} />
      {Math.abs(total - 100) > 0.001 && <Callout tone="warn" className="mx-5 mt-4">Active partner profit shares add up to {total}% — they should total 100%.</Callout>}
      <table className="w-full text-[13.5px]"><tbody>
        {people.map((p) => (
          <tr key={p.id} className="border-b border-line last:border-0">
            <td className="px-5 py-2.5 font-medium">{p.full_name}<span className="ml-2 text-[12px] font-normal text-ink-3">{p.job_title ?? ""}</span></td>
            <td className="px-3 py-2.5"><Badge>{humanize(p.kind)}</Badge></td>
            <td className="px-3 py-2.5">{p.is_partner ? `${toNum(p.profit_share_pct)}% profit share` : "—"}</td>
            <td className="px-3 py-2.5">{p.technology_recovery_eligible && <Badge tone="info">CTO recovery eligible</Badge>}</td>
            <td className="px-3 py-2.5">{!p.active && <Badge>Inactive</Badge>}</td>
            <td className="w-20 px-5 text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(p)}>Edit</Button></td>
          </tr>
        ))}
      </tbody></table>
      {edit && <PersonDialog person={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function PersonDialog({ person, onClose }: { person: any; onClose: () => void }) {
  const [f, setF] = useState({ full_name: person.full_name ?? "", email: person.email ?? "", phone: person.phone ?? "", kind: person.kind ?? "employee", job_title: person.job_title ?? "",
    is_partner: !!person.is_partner, profit_share_pct: String(person.profit_share_pct ?? 0), technology_recovery_eligible: !!person.technology_recovery_eligible, active: person.active ?? true });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const { run, pending, error } = useAction(savePerson.bind(null, person.id ?? null), { success: "Saved", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={person.id ? `Edit ${person.full_name}` : "Add person"} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!f.full_name.trim()} onClick={() => run({ ...f, profit_share_pct: f.is_partner ? Number(f.profit_share_pct) : 0 })}>Save</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full name" className="md:col-span-2"><Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
        <Field label="Kind"><Select value={f.kind} onChange={(e) => set("kind", e.target.value)}>{["partner", "employee", "freelancer", "external", "other"].map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</Select></Field>
        <Field label="Job title"><Input value={f.job_title} onChange={(e) => set("job_title", e.target.value)} /></Field>
        <Field label="Email"><Input value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Checkbox label="Partner (profit participant)" checked={f.is_partner} onChange={(e) => set("is_partner", e.target.checked)} />
        {f.is_partner && <Field label="Profit share %"><Input type="number" value={f.profit_share_pct} onChange={(e) => set("profit_share_pct", e.target.value)} /></Field>}
        <div className="md:col-span-2"><Checkbox label="Eligible for technology development recovery (CTO)" checked={f.technology_recovery_eligible} onChange={(e) => set("technology_recovery_eligible", e.target.checked)} /></div>
        <Checkbox label="Active" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
      </div>
      <p className="mt-3 text-[12.5px] text-ink-3">New partners also need a funder record and holding account — these are created automatically the first time they fund or hold money.</p>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
const ROLE_KEYS = ["partner", "cto", "admin", "finance", "project_manager", "event_manager"];

export function UsersPanel({ members, roles, people, selfId }: { members: any[]; roles: any[]; people: any[]; selfId: string }) {
  const [invite, setInvite] = useState(false);
  const setRoles = useAction(setUserRoles, { success: "Roles updated" });
  return (
    <Card>
      <CardHeader title="Users & roles" subtitle="Permissions come from roles, never from names." actions={<Button size="sm" variant="primary" onClick={() => setInvite(true)}><Plus className="size-3.5" />Invite user</Button>} />
      <table className="w-full text-[13.5px]"><tbody>
        {members.map((m) => {
          const mine = roles.filter((r) => r.user_id === m.user_id).map((r) => r.role_key);
          const person = people.find((p) => p.id === m.person_id);
          return (
            <tr key={m.user_id} className="border-b border-line last:border-0">
              <td className="px-5 py-3"><p className="font-medium">{m.profiles?.full_name || person?.full_name || m.profiles?.email}</p><p className="text-[12px] text-ink-3">{m.profiles?.email}{person ? ` · linked to ${person.full_name}` : ""}</p></td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {ROLE_KEYS.map((r) => {
                    const on = mine.includes(r);
                    return <button key={r} disabled={setRoles.pending || (m.user_id === selfId && r === "partner" && on)}
                      onClick={() => setRoles.run(m.user_id, on ? mine.filter((x: string) => x !== r) : [...mine, r])}
                      className={`rounded-full border px-2.5 py-0.5 text-[12px] ${on ? "border-ink bg-ink text-white" : "border-line-strong text-ink-3 hover:bg-muted"} disabled:opacity-60`}>{humanize(r)}</button>;
                  })}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody></table>
      {invite && <InviteDialog people={people} onClose={() => setInvite(false)} />}
    </Card>
  );
}

function InviteDialog({ people, onClose }: { people: any[]; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [person, setPerson] = useState("");
  const [r, setR] = useState<string[]>(["project_manager"]);
  const { run, pending, error } = useAction(inviteUser, { success: "Invitation sent", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Invite user" subtitle="They receive an email to set their password." size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!email.includes("@") || !r.length} onClick={() => run(email, person || null, r)}>Send invite</Button></>}>
      <div className="space-y-4">
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Link to person"><Select value={person} onChange={(e) => setPerson(e.target.value)}><option value="">—</option>{people.filter((p) => !p.user_id).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></Field>
        <Field label="Roles"><div className="flex flex-wrap gap-1.5">{ROLE_KEYS.map((k) => (
          <button key={k} type="button" onClick={() => setR(r.includes(k) ? r.filter((x) => x !== k) : [...r, k])}
            className={`rounded-full border px-2.5 py-0.5 text-[12px] ${r.includes(k) ? "border-ink bg-ink text-white" : "border-line-strong text-ink-3"}`}>{humanize(k)}</button>))}</div></Field>
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
export function ServicesPanel({ categories, services }: { categories: any[]; services: any[] }) {
  const [svc, setSvc] = useState<any>(null);
  const [cat, setCat] = useState<any>(null);
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="primary" onClick={() => setCat({})}><Plus className="size-4" />New service category</Button></div>
      {categories.map((c) => (
        <Card key={c.id}>
          <CardHeader title={<span>{c.name} {!c.active && <Badge className="ml-2">Inactive</Badge>}</span>} subtitle={c.tagline}
            actions={<><Button size="sm" variant="ghost" onClick={() => setCat(c)}>Edit</Button><Button size="sm" onClick={() => setSvc({ category_id: c.id })}><Plus className="size-3.5" />Service</Button></>} />
          <div className="flex flex-wrap gap-2 px-5 py-3">
            {services.filter((s) => s.category_id === c.id).map((s) => (
              <button key={s.id} onClick={() => setSvc(s)} className={`rounded-lg border px-2.5 py-1 text-[13px] hover:border-line-strong ${s.active ? "border-line" : "border-dashed border-line text-ink-4"}`}>
                {s.name}<span className="ml-1.5 text-[11px] text-ink-3">{humanize(s.billing_nature)}</span>
              </button>
            ))}
          </div>
        </Card>
      ))}
      {svc && <ServiceDialog service={svc} categories={categories} onClose={() => setSvc(null)} />}
      {cat && <CategoryDialog cat={cat} onClose={() => setCat(null)} />}
    </div>
  );
}

function ServiceDialog({ service, categories, onClose }: { service: any; categories: any[]; onClose: () => void }) {
  const [f, setF] = useState({ name: service.name ?? "", category_id: service.category_id, description: service.description ?? "", billing_nature: service.billing_nature ?? "both",
    default_billing_model: service.default_billing_model ?? "", active: service.active ?? true });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const { run, pending, error } = useAction(saveService.bind(null, service.id ?? null), { success: "Service saved", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={service.id ? "Edit service" : "New service"} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!f.name.trim()} onClick={() => run(f)}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Category"><Select value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Billing"><Select value={f.billing_nature} onChange={(e) => set("billing_nature", e.target.value)}><option value="one_time">One-time</option><option value="recurring">Recurring</option><option value="both">Both</option></Select></Field>
        <Field label="Default billing model"><Input value={f.default_billing_model} onChange={(e) => set("default_billing_model", e.target.value)} placeholder="e.g. annual, one_time_event" /></Field>
        <Field label="Description"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
        <Checkbox label="Active" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}

function CategoryDialog({ cat, onClose }: { cat: any; onClose: () => void }) {
  const [f, setF] = useState({ name: cat.name ?? "", tagline: cat.tagline ?? "", active: cat.active ?? true, sort_order: cat.sort_order ?? 99 });
  const { run, pending, error } = useAction(saveServiceCategory.bind(null, cat.id ?? null), { success: "Saved", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={cat.id ? "Edit service category" : "New service category"} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!f.name.trim()} onClick={() => run(f)}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Tagline"><Input value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></Field>
        <Checkbox label="Active" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
export function CategoriesPanel({ expense, technology, asset }: { expense: any[]; technology: any[]; asset: any[] }) {
  const [edit, setEdit] = useState<{ table: "expense" | "technology_categories" | "asset_categories"; row: any } | null>(null);
  const move = useAction(saveExpenseCategory, {});
  const parents = expense.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const swap = (list: any[], i: number, j: number) => { if (j < 0 || j >= list.length) return; move.run(list[i].id, { sort_order: list[j].sort_order }); move.run(list[j].id, { sort_order: list[i].sort_order }); };
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader title="Expense categories" subtitle="Add, rename, reorder or deactivate." actions={<Button size="sm" variant="primary" onClick={() => setEdit({ table: "expense", row: {} })}><Plus className="size-3.5" />Category</Button>} />
        <div className="divide-y divide-line">
          {parents.map((p, i) => (
            <div key={p.id} className="px-5 py-3">
              <div className="flex items-center gap-2">
                <p className={`font-medium ${!p.active ? "text-ink-4 line-through" : ""}`}>{p.name}</p><Badge>{humanize(p.scope)}</Badge>
                <div className="ml-auto flex items-center gap-1">
                  <button className="rounded p-1 text-ink-3 hover:bg-muted" onClick={() => swap(parents, i, i - 1)}><ArrowUp className="size-3.5" /></button>
                  <button className="rounded p-1 text-ink-3 hover:bg-muted" onClick={() => swap(parents, i, i + 1)}><ArrowDown className="size-3.5" /></button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ table: "expense", row: p })}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ table: "expense", row: { parent_id: p.id, scope: p.scope } })}>+ Sub</Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {expense.filter((c) => c.parent_id === p.id).map((c) => (
                  <button key={c.id} onClick={() => setEdit({ table: "expense", row: c })} className={`rounded-md border px-2 py-0.5 text-[12.5px] ${c.active ? "border-line text-ink-2" : "border-dashed border-line text-ink-4"}`}>{c.name}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="space-y-6">
        {([["technology_categories", "Technology categories", technology], ["asset_categories", "Asset categories", asset]] as const).map(([t, title, rows]) => (
          <Card key={t}>
            <CardHeader title={title} actions={<Button size="sm" onClick={() => setEdit({ table: t, row: {} })}><Plus className="size-3.5" /></Button>} />
            <div className="flex flex-wrap gap-1.5 px-5 py-3">
              {rows.map((c: any) => <button key={c.id} onClick={() => setEdit({ table: t, row: c })} className={`rounded-md border px-2 py-0.5 text-[12.5px] ${c.active ? "border-line" : "border-dashed text-ink-4"}`}>{c.name}</button>)}
            </div>
          </Card>
        ))}
      </div>
      {edit && <SimpleCategoryDialog edit={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function SimpleCategoryDialog({ edit, onClose }: { edit: { table: string; row: any }; onClose: () => void }) {
  const [name, setName] = useState(edit.row.name ?? "");
  const [active, setActive] = useState(edit.row.active ?? true);
  const [scope, setScope] = useState(edit.row.scope ?? "project");
  const isExpense = edit.table === "expense";
  const exp = useAction(saveExpenseCategory.bind(null, edit.row.id ?? null), { success: "Saved", onSuccess: onClose });
  const simple = useAction(saveSimpleCategory.bind(null, edit.table as "technology_categories", edit.row.id ?? null), { success: "Saved", onSuccess: onClose });
  const a = isExpense ? exp : simple;
  return (
    <Dialog open onClose={onClose} title={edit.row.id ? "Edit category" : "New category"} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={a.pending} disabled={!name.trim()}
        onClick={() => (isExpense ? exp.run({ name, active, scope, parent_id: edit.row.parent_id ?? null, ...(edit.row.id ? {} : { sort_order: 99 }) }) : simple.run({ name, active }))}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {isExpense && <Field label="Used for"><Select value={scope} onChange={(e) => setScope(e.target.value)}><option value="project">Project costs</option><option value="overhead">Company overhead</option><option value="both">Both</option></Select></Field>}
        <Checkbox label="Active" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </div>
      {a.error && <Callout tone="danger" className="mt-3">{a.error.error}</Callout>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
export function FeePresetsPanel({ presets }: { presets: any[] }) {
  const [edit, setEdit] = useState<any>(null);
  return (
    <Card>
      <CardHeader title="Partner fee presets" subtitle="Used for quick suggestions — never applied automatically." actions={<Button size="sm" variant="primary" onClick={() => setEdit({})}><Plus className="size-3.5" />Preset</Button>} />
      <table className="w-full text-[13.5px]"><tbody>
        {presets.map((p) => (
          <tr key={p.id} className="border-b border-line last:border-0">
            <td className="px-5 py-2.5 font-medium">{p.name}</td><td className="px-3 py-2.5">{humanize(p.fee_type)}</td>
            <td className="px-3 py-2.5 text-ink-2">{p.basis === "fixed" ? `Fixed ${toNum(p.fixed_amount).toLocaleString("en-US")}` : `${toNum(p.rate)}% (${humanize(p.basis.replace("pct_", ""))})`}</td>
            <td className="px-3 py-2.5 text-ink-2">When person is {humanize(p.trigger_project_role ?? "—")}</td>
            <td className="px-3 py-2.5">{!p.active && <Badge>Inactive</Badge>}</td>
            <td className="w-20 px-5 text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(p)}>Edit</Button></td>
          </tr>
        ))}
      </tbody></table>
      {edit && <PresetDialog preset={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function PresetDialog({ preset, onClose }: { preset: any; onClose: () => void }) {
  const [f, setF] = useState({ name: preset.name ?? "", fee_type: preset.fee_type ?? "management", basis: preset.basis ?? "pct_contract", rate: String(preset.rate ?? 10),
    fixed_amount: String(preset.fixed_amount ?? ""), trigger_project_role: preset.trigger_project_role ?? "project_manager", default_treatment: preset.default_treatment ?? "project_cost", active: preset.active ?? true });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const { run, pending, error } = useAction(saveFeePreset.bind(null, preset.id ?? null), { success: "Preset saved", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={preset.id ? "Edit preset" : "New preset"} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!f.name.trim()}
        onClick={() => run({ ...f, rate: f.basis === "fixed" ? null : Number(f.rate), fixed_amount: f.basis === "fixed" ? Number(f.fixed_amount) : null })}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Fee type"><Select value={f.fee_type} onChange={(e) => set("fee_type", e.target.value)}>{["management", "lead_generation", "sales_commission", "project", "consulting", "custom"].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
        <Field label="Calculation"><Select value={f.basis} onChange={(e) => set("basis", e.target.value)}>
          <option value="pct_contract">% of contract</option><option value="pct_revenue">% of revenue</option><option value="pct_gross_profit">% of gross profit</option><option value="pct_net_profit">% of net profit</option><option value="fixed">Fixed amount</option></Select></Field>
        {f.basis === "fixed" ? <Field label="Amount"><Input type="number" value={f.fixed_amount} onChange={(e) => set("fixed_amount", e.target.value)} /></Field>
          : <Field label="Rate %"><Input type="number" value={f.rate} onChange={(e) => set("rate", e.target.value)} /></Field>}
        <Field label="Suggest when the partner is the project's"><Select value={f.trigger_project_role} onChange={(e) => set("trigger_project_role", e.target.value)}>
          {["project_manager", "event_manager", "lead_generator", "operations", "other"].map((r) => <option key={r} value={r}>{humanize(r)}</option>)}</Select></Field>
        <Field label="Default treatment"><Select value={f.default_treatment} onChange={(e) => set("default_treatment", e.target.value)}><option value="project_cost">Project cost</option><option value="from_share">From own share</option></Select></Field>
        <Checkbox label="Active" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}
