import { getExpenses, getProjectAssets, getAssets, type Lookups } from "@/services/queries";
import { AssetsPanel } from "./AssetsPanel";

export async function AssetsTab({ projectId, orgId, lookups }: { projectId: string; orgId: string; lookups: Lookups }) {
  const [a, expenses, all] = await Promise.all([getProjectAssets(projectId), getExpenses(orgId, { projectId }), getAssets(orgId)]);
  return <AssetsPanel projectId={projectId} data={a} rentals={expenses.filter((e) => e.expense_type === "rental" || e.related_expense_id)}
    available={all.map((x) => ({ id: x.id, name: x.name, available: x.available }))} lookups={lookups} />;
}
