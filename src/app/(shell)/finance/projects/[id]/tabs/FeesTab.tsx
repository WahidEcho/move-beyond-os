import { getProjectFees, type Lookups } from "@/services/queries";
import { FeesPanel } from "./FeesPanel";

export async function FeesTab({ projectId, lookups, closed, contractValue }: { projectId: string; lookups: Lookups; closed: boolean; contractValue: number }) {
  const fees = await getProjectFees(projectId);
  return <FeesPanel projectId={projectId} fees={fees} lookups={lookups} closed={closed} contractValue={contractValue} />;
}
