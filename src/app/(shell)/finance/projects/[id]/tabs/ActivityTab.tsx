import { getActivity } from "@/services/queries";
import { ActivityLog } from "@/components/shared/ActivityLog";

export async function ActivityTab({ orgId, projectId }: { orgId: string; projectId: string }) {
  const rows = await getActivity(orgId, { projectId, limit: 200 });
  return <ActivityLog rows={rows} />;
}
