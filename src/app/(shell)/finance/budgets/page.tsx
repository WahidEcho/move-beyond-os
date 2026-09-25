import { requireSession } from "@/lib/session";
import { getProjectsFinancials } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { BudgetTable } from "./BudgetTable";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  const session = await requireSession("finance.view");
  const projects = await getProjectsFinancials(session.orgId);
  const rows = projects.filter((p) => p.metrics.budget !== null).map((p) => ({ id: p.project_id, code: p.code, name: p.name, budget: p.metrics.budget ?? 0,
    committed: p.metrics.committedCost, forecast: p.metrics.forecastCost, actual: p.metrics.actualCost, variance: p.metrics.budgetVariance ?? 0 }));
  return (
    <>
      <PageHeader title="Budgets" subtitle="Budget vs actual vs forecast." />
      <Callout tone="info" className="mb-6">Annual company budgets (revenue target, expense, sponsorship, asset and technology budgets) arrive after go-live. The database is ready; project budgets work today.</Callout>
      <Card><CardHeader title="Project budgets" /><BudgetTable rows={rows} /></Card>
    </>
  );
}
