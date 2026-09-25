"use client";
import type { Lookups } from "@/services/queries";
import { Select } from "@/components/ui/Field";

type L = Pick<Lookups, "projects" | "people" | "partners" | "cashAccounts" | "expenseCategoryOptions" | "suppliers" | "clients" | "technologies">;

export function ProjectSelect({ lookups, value, onChange, allowNone, noneLabel = "No project (company overhead)", id }: {
  lookups: Pick<L, "projects">; value: string; onChange: (v: string) => void; allowNone?: boolean; noneLabel?: string; id?: string;
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} required={!allowNone}>
      {allowNone ? <option value="">{noneLabel}</option> : <option value="" disabled>Select a project…</option>}
      {lookups.projects.filter((p) => p.financial_status !== "financially_closed" || p.id === value).map((p) => (
        <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
      ))}
    </Select>
  );
}

export function CashAccountSelect({ lookups, value, onChange, label = "Paid from / received into" }: { lookups: Pick<L, "cashAccounts">; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {lookups.cashAccounts.map((c) => (
        <option key={c.id} value={c.id}>{c.name}{c.account_type === "partner_holding" ? " (partner holds company money)" : ""}</option>
      ))}
    </Select>
  );
}

export function CategorySelect({ lookups, value, onChange, scope }: { lookups: Pick<L, "expenseCategoryOptions">; value: string; onChange: (v: string) => void; scope?: "project" | "overhead" }) {
  const groups = new Map<string, typeof lookups.expenseCategoryOptions>();
  for (const o of lookups.expenseCategoryOptions) {
    if (!o.active) continue;
    if (scope && o.scope !== "both" && o.scope !== scope) continue;
    groups.set(o.group, [...(groups.get(o.group) ?? []), o]);
  }
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Uncategorised</option>
      {Array.from(groups.entries()).map(([g, opts]) => (
        <optgroup key={g} label={g}>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.isParent ? `${o.label} (general)` : o.label}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

export function PersonSelect({ people, value, onChange, placeholder = "Select a person…" }: { people: { id: string; full_name: string }[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="" disabled>{placeholder}</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
    </Select>
  );
}

export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
export const n = (v: string | number | null | undefined) => (v === "" || v === null || v === undefined ? null : Number(v));
