import { getProjectFunding, type Lookups } from "@/services/queries";
import { FundingPanel } from "./FundingPanel";

export async function FundingTab({ projectId, lookups, closed }: { projectId: string; lookups: Lookups; closed: boolean }) {
  const f = await getProjectFunding(projectId);
  return <FundingPanel projectId={projectId} data={f} lookups={lookups} closed={closed} />;
}
