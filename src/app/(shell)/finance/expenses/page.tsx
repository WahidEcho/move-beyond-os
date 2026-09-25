import { requireSession, can } from "@/lib/session";
import { getExpenses, getLookups } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { ExpensesTable } from "@/components/finance/ExpensesTable";
import { ExpenseScope } from "./ExpenseScope";
import { toNum } from "@/lib/format";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: PageProps<"/finance/expenses">) {
  const session = await requireSession();
  const sp = await searchParams;
  const scope = sp.scope === "overhead" ? "overhead" : sp.scope === "projects" ? "projects" : "all";
  const [all, lookups] = await Promise.all([getExpenses(session.orgId, { overheadOnly: scope === "overhead" }), getLookups(session.orgId)]);
  const rows = scope === "projects" ? all.filter((e) => e.project_id) : all;
  const sum = (k: string) => rows.reduce((a, r) => a + toNum(r[k]), 0);
  return (
    <>
      <PageHeader title="Expenses" subtitle="Every cost, who paid it, and what is still owed. Company overhead has no project." />
      {can(session, "finance.view") && (
        <KpiGrid className="mb-6">
          <Kpi label="Committed" value={sum("committed_cost_egp")} />
          <Kpi label="Paid (actual cost)" value={sum("paid_egp")} />
          <Kpi label="Outstanding to suppliers" value={sum("outstanding_egp")} tone={sum("outstanding_egp") > 0 ? "warn" : undefined} />
          <Kpi label="Estimates not committed" value={sum("uncommitted_estimate_egp")} />
        </KpiGrid>
      )}
      <Card><ExpensesTable rows={rows} lookups={lookups} showProject filter={<ExpenseScope scope={scope} />} /></Card>
    </>
  );
}
