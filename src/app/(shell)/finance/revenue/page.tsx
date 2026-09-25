import { requireSession } from "@/lib/session";
import { getCollections, getPnlMonthly, getProjectsFinancials } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { todayIso, toNum } from "@/lib/format";
import { CollectionsLog, MonthlyTable } from "./RevenueClient";

export const metadata = { title: "Revenue" };

export default async function RevenuePage() {
  const session = await requireSession("finance.view");
  const [cols, pnl, projects] = await Promise.all([getCollections(session.orgId), getPnlMonthly(session.orgId), getProjectsFinancials(session.orgId)]);
  const t = todayIso();
  const mtd = pnl.filter((m) => String(m.month).startsWith(t.slice(0, 7))).reduce((a, m) => a + toNum(m.revenue), 0);
  const ytd = pnl.filter((m) => String(m.month).startsWith(t.slice(0, 4))).reduce((a, m) => a + toNum(m.revenue), 0);
  return (
    <>
      <PageHeader title="Revenue" subtitle="Cash basis: revenue is recognised when collected (D1)." />
      <KpiGrid>
        <Kpi label="Month to date" value={mtd} />
        <Kpi label="Year to date" value={ytd} />
        <Kpi label="Contract value (all projects)" value={projects.reduce((a, p) => a + p.metrics.contractValue, 0)} />
        <Kpi label="Outstanding" value={projects.reduce((a, p) => a + p.metrics.outstanding, 0)} />
      </KpiGrid>
      <Card className="mt-6"><CardHeader title="Company P&L by month" subtitle="Revenue, direct costs, fees, CTO recovery and overhead from the ledger" /><MonthlyTable rows={pnl} /></Card>
      <Card className="mt-6"><CardHeader title="Collections log" /><CollectionsLog rows={cols} /></Card>
    </>
  );
}
