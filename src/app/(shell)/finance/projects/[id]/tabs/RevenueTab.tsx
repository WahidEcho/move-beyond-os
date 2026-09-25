import { getProjectRevenue, type getProject, type Lookups } from "@/services/queries";
import { RevenuePanel } from "./RevenuePanel";

export async function RevenueTab({ projectId, data, lookups, closed }: {
  projectId: string; data: NonNullable<Awaited<ReturnType<typeof getProject>>>; lookups: Lookups; closed: boolean;
}) {
  const rev = await getProjectRevenue(projectId);
  return <RevenuePanel projectId={projectId} contract={data.contract} metrics={data.metrics} rev={rev} lookups={lookups} closed={closed} />;
}
