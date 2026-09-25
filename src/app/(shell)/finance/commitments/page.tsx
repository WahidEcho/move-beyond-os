import { requireSession } from "@/lib/session";
import { getExpenses, getLookups } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { ExpensesTable } from "@/components/finance/ExpensesTable";
import { isoInDays, todayIso, toNum } from "@/lib/format";

export const metadata = { title: "Commitments" };

export default async function CommitmentsPage() {
  const session = await requireSession("finance.view");
  const [rows, lookups] = await Promise.all([getExpenses(session.orgId, { outstandingOnly: true }), getLookups(session.orgId)]);
  const t = todayIso();
  const in30 = isoInDays(30);
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((a, r) => a + toNum(r.outstanding_egp), 0);
  return (
    <>
      <PageHeader title="Commitments" subtitle="Agreed with suppliers but not fully paid. Forecasts always include these (spec §39)." />
      <KpiGrid className="mb-6">
        <Kpi label="Total unpaid commitments" value={sum(() => true)} />
        <Kpi label="Overdue" value={sum((r) => !!r.due_date && r.due_date < t)} tone="neg" />
        <Kpi label="Due in 30 days" value={sum((r) => !!r.due_date && r.due_date >= t && r.due_date <= in30)} />
        <Kpi label="No due date" value={sum((r) => !r.due_date)} />
      </KpiGrid>
      <Card><ExpensesTable rows={rows} lookups={lookups} showProject initialMode="commitment" addLabel="Add commitment" /></Card>
    </>
  );
}
