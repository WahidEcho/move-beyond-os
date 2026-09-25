import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireSession, can } from "@/lib/session";
import { getAlerts, getCashForecast, getCompanyPosition, getLookups, getPersonBalances, getPnlMonthly, getProjectsFinancials, getSubscriptions, refreshAlertsFor } from "@/services/queries";
import { buildPartnerAccount, type PersonBalanceRow } from "@/engines/partnerAccount";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { Money } from "@/components/ui/Money";
import { AlertList, type AlertRow } from "@/components/finance/AlertList";
import { QuickActions } from "@/components/finance/QuickActions";
import { todayIso, toNum, pct, egp } from "@/lib/format";

export const metadata = { title: "Finance Home" };

export default async function FinanceHome() {
  const session = await requireSession("finance.view");
  const org = session.orgId;
  await refreshAlertsFor(org);
  const [pos, projects, balances, pnl, subs, forecast, alerts, lookups] = await Promise.all([
    getCompanyPosition(org), getProjectsFinancials(org), getPersonBalances(org), getPnlMonthly(org), getSubscriptions(org),
    getCashForecast(org), getAlerts(org, 8), getLookups(org),
  ]);

  const today = todayIso();
  const ym = today.slice(0, 7), yr = today.slice(0, 4);
  const mtd = pnl.filter((m) => String(m.month).startsWith(ym)).reduce((a, m) => a + toNum(m.revenue), 0);
  const ytd = pnl.filter((m) => String(m.month).startsWith(yr)).reduce((a, m) => a + toNum(m.revenue), 0);

  const active = projects.filter((p) => p.financial_status !== "financially_closed" && p.operational_status !== "cancelled");
  const awaitingSettlement = projects.filter((p) => ["settlement_required", "partially_settled"].includes(p.financial_status) || (p.operational_status === "completed" && p.financial_status !== "financially_closed"));
  const partners = balances.filter((b) => b.is_partner).map((b) => ({ row: b, acc: buildPartnerAccount(b as unknown as PersonBalanceRow) }));
  const sumP = (k: string) => partners.reduce((a, p) => a + toNum(p.row[k]), 0);

  const w30 = forecast.windows.find((w) => w.days === 30)!;
  const reserveGap = toNum(pos.available_reserve) - toNum(pos.reserve_target);
  const availableCash = toNum(pos.company_cash) - toNum(pos.unpaid_suppliers) - toNum(pos.employee_dues);
  const mrr = subs.reduce((a, s) => a + toNum(s.mrr), 0);
  const renewals = subs.filter((s) => s.status === "active" && s.next_billing_date && s.next_billing_date <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));

  return (
    <>
      <PageHeader title="Finance Home" subtitle={`${session.orgName} · all figures in EGP`} />

      <KpiGrid className="xl:grid-cols-4">
        <Kpi label="Company bank balance" value={pos.company_cash} href="/finance/bank" hint={toNum(pos.held_by_partners) ? `+ ${egp(pos.held_by_partners)} held by partners` : undefined} />
        <Kpi label="Available cash" value={availableCash} tone={availableCash < 0 ? "neg" : undefined} hint="After unpaid suppliers & employees" />
        <Kpi label="Outstanding receivables" value={pos.receivables} href="/finance/collections" hint={toNum(pos.overdue_receivables) ? <span className="text-neg">{egp(pos.overdue_receivables)} overdue</span> : "Nothing overdue"} />
        <Kpi label="Outstanding payables" value={toNum(pos.unpaid_suppliers) + toNum(pos.employee_dues)} href="/finance/commitments" hint="Suppliers + employee reimbursements" />
        {partners.map((p) => (
          <Kpi key={p.row.person_id} label={`Total due to ${p.row.full_name}`} value={p.acc.totalCurrentlyDue} href={`/finance/partners/${p.row.person_id}`}
            hint={p.acc.ctoUnrecoveredClaim ? `+ ${egp(p.acc.ctoUnrecoveredClaim)} unrecovered CTO value` : p.acc.heldForCompany ? `Holds ${egp(p.acc.heldForCompany)} of company money` : undefined} />
        ))}
        <Kpi label="Funding gap (30 days)" value={w30.fundingGap} tone={w30.fundingGap > 0 ? "warn" : undefined} href="/finance/forecast" hint="Required out − expected in" />
        <Kpi label="30-day forecast balance" value={w30.projectedBalance} tone={w30.projectedBalance < 0 ? "neg" : undefined} href="/finance/forecast" hint={`In ${egp(w30.expectedIn)} · Out ${egp(w30.requiredOut)}`} />
      </KpiGrid>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader title="Revenue" subtitle="Cash basis — recognised when collected" actions={<Link href="/finance/revenue" className="text-[13px] text-ink-3 hover:text-ink">Details</Link>} />
            <CardBody className="py-2">
              <DefinitionList items={[
                { label: "Month to date", value: <Money value={mtd} /> },
                { label: "Year to date", value: <Money value={ytd} /> },
                { label: "Outstanding", value: <Money value={pos.receivables} /> },
                { label: "Overdue", value: <Money value={pos.overdue_receivables} className={toNum(pos.overdue_receivables) ? "text-neg" : ""} /> },
              ]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Projects" subtitle={`${active.length} active`} actions={<Link href="/finance/projects" className="text-[13px] text-ink-3 hover:text-ink">All projects</Link>} />
            <CardBody className="py-2">
              <DefinitionList items={[
                { label: "Contract value (active)", value: <Money value={active.reduce((a, p) => a + p.metrics.contractValue, 0)} /> },
                { label: "Actual costs", value: <Money value={active.reduce((a, p) => a + p.metrics.actualCost, 0)} /> },
                { label: "Committed costs", value: <Money value={active.reduce((a, p) => a + p.metrics.committedCost, 0)} /> },
                { label: "Forecast profit", value: <Money value={active.reduce((a, p) => a + p.metrics.forecastProfit, 0)} signed /> },
                { label: "Awaiting settlement", value: <Link href="/finance/settlements" className="font-medium underline-offset-2 hover:underline">{awaitingSettlement.length} projects</Link> },
              ]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Partner obligations" actions={<Link href="/finance/partners" className="text-[13px] text-ink-3 hover:text-ink">Partners</Link>} />
            <CardBody className="py-2">
              <DefinitionList items={[
                { label: "Funding due", value: <Money value={sumP("funding_due")} /> },
                { label: "Fees due", value: <Money value={sumP("fee_due")} /> },
                { label: "CTO recovery due", value: <Money value={sumP("cto_due")} />, hint: sumP("cto_unrecovered") ? `+ ${egp(sumP("cto_unrecovered"))} not yet recovered` : undefined },
                { label: "Profit due", value: <Money value={sumP("profit_due")} /> },
                { label: "Carry-forward", value: <Money value={sumP("carry_due")} signed /> },
              ]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Subscriptions" actions={<Link href="/finance/subscriptions" className="text-[13px] text-ink-3 hover:text-ink">Subscriptions</Link>} />
            <CardBody className="py-2">
              <DefinitionList items={[
                { label: "MRR", value: <Money value={mrr} /> },
                { label: "ARR", value: <Money value={mrr * 12} /> },
                { label: "Renewals (30 days)", value: renewals.length },
                { label: "Collected", value: <Money value={subs.reduce((a, s) => a + toNum(s.collected), 0)} /> },
                { label: "Overdue", value: <Money value={subs.reduce((a, s) => a + toNum(s.overdue), 0)} /> },
              ]} />
            </CardBody>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader title="Company reserve" subtitle="Company cash − unpaid suppliers − employee dues − net partner dues"
              actions={<Link href="/finance/reserve" className="text-[13px] text-ink-3 hover:text-ink">Reserve</Link>} />
            <CardBody>
              <div className="grid grid-cols-3 gap-4">
                <div><p className="text-[12.5px] text-ink-3">Current reserve</p><p className="num mt-1 text-xl font-semibold"><Money value={pos.available_reserve} /></p></div>
                <div><p className="text-[12.5px] text-ink-3">Target</p><p className="num mt-1 text-xl font-semibold"><Money value={pos.reserve_target} /></p></div>
                <div><p className="text-[12.5px] text-ink-3">{reserveGap >= 0 ? "Surplus" : "Shortfall"}</p>
                  <p className={`num mt-1 text-xl font-semibold ${reserveGap < 0 ? "text-neg" : "text-pos"}`}><Money value={Math.abs(reserveGap)} /></p></div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${reserveGap < 0 ? "bg-warn" : "bg-pos"}`}
                  style={{ width: `${Math.max(0, Math.min(100, (toNum(pos.available_reserve) / Math.max(toNum(pos.reserve_target), 1)) * 100))}%` }} />
              </div>
              <p className="mt-2 text-[12px] text-ink-3">{pct((toNum(pos.available_reserve) / Math.max(toNum(pos.reserve_target), 1)) * 100, 0)} of target</p>
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Quick actions" />
            <CardBody>
              <QuickActions lookups={lookups} can={{
                projects: can(session, "projects.manage"), finance: can(session, "finance.manage"), tech: can(session, "technology.manage"),
                techRecover: can(session, "technology.recover"), subscriptions: can(session, "subscriptions.manage"), settlements: can(session, "settlements.manage"),
              }} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Alert center" subtitle="Priority first" actions={<Link href="/finance/alerts" className="flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">All <ArrowRight className="size-3.5" /></Link>} />
            <AlertList alerts={alerts as unknown as AlertRow[]} compact />
          </Card>
        </div>
      </div>
    </>
  );
}
