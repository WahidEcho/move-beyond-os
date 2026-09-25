import { requireSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getCompanyPosition } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { Money } from "@/components/ui/Money";
import { Callout } from "@/components/ui/Callout";
import { ButtonLink } from "@/components/ui/Button";
import { egp, toNum } from "@/lib/format";

export const metadata = { title: "Company Reserve" };

export default async function ReservePage() {
  const session = await requireSession("finance.view");
  const s = await createSupabaseServer();
  const [pos, { data: reinvest }] = await Promise.all([
    getCompanyPosition(session.orgId),
    s.from("journal_lines").select("amount, person_id, people(full_name)").eq("organization_id", session.orgId).eq("account_code", "PARTNER_CAPITAL"),
  ]);
  const gap = toNum(pos.available_reserve) - toNum(pos.reserve_target);
  const byPerson = new Map<string, number>();
  for (const l of reinvest ?? []) {
    const n = (l.people as unknown as { full_name: string } | null)?.full_name ?? "—";
    byPerson.set(n, (byPerson.get(n) ?? 0) - toNum(l.amount));
  }
  return (
    <>
      <PageHeader title="Company Reserve" subtitle="What Move Beyond truly has after everything it owes." actions={<ButtonLink href="/settings?tab=company">Change target</ButtonLink>} />
      {gap < 0 && <Callout tone="warn" className="mb-6" title={`Reserve below ${egp(pos.reserve_target)}`}>Shortfall of {egp(-gap)}. Settlements will recommend keeping profit in the company until the target is met.</Callout>}
      <KpiGrid className="mb-6">
        <Kpi label="Current available reserve" value={pos.available_reserve} tone={gap < 0 ? "warn" : "pos"} />
        <Kpi label="Minimum target" value={pos.reserve_target} />
        <Kpi label={gap >= 0 ? "Surplus" : "Shortfall"} value={Math.abs(gap)} tone={gap < 0 ? "neg" : "pos"} />
        <Kpi label="Partner reinvestment to date" value={Array.from(byPerson.values()).reduce((a, b) => a + b, 0)} />
      </KpiGrid>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="How it is calculated" subtitle="Decision D4" />
          <CardBody className="py-2"><DefinitionList items={[
            { label: "Company cash (bank)", value: <Money value={pos.company_cash} /> },
            { label: "Unpaid supplier commitments", value: <Money value={-toNum(pos.unpaid_suppliers)} signed /> },
            { label: "Employee reimbursements due", value: <Money value={-toNum(pos.employee_dues)} signed /> },
            { label: "Net partner dues", value: <Money value={-toNum(pos.net_partner_dues)} signed />, hint: `${egp(pos.partner_dues)} due − ${egp(pos.held_by_partners)} they hold` },
            { label: "Available reserve", value: <Money value={pos.available_reserve} />, strong: true },
          ]} /></CardBody></Card>
        <Card><CardHeader title="Partner reinvestment / reserve contributions" subtitle="Profit partners left inside Move Beyond — not an expense." />
          <CardBody className="py-2">{byPerson.size ? <DefinitionList items={Array.from(byPerson.entries()).map(([n, v]) => ({ label: n, value: <Money value={v} /> }))} /> : <p className="py-3 text-[13px] text-ink-3">No reinvestment yet.</p>}</CardBody></Card>
      </div>
    </>
  );
}
