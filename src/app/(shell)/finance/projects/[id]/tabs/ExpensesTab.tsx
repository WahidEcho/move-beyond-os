import { Card } from "@/components/ui/Card";
import { getExpenses, type Lookups } from "@/services/queries";
import { ExpensesTable } from "@/components/finance/ExpensesTable";

export async function ExpensesTab({ projectId, orgId, lookups, closed }: { projectId: string; orgId: string; lookups: Lookups; closed: boolean }) {
  const rows = await getExpenses(orgId, { projectId });
  return <Card><ExpensesTable rows={rows} lookups={lookups} projectId={projectId} closed={closed} /></Card>;
}
