import { requireSession } from "@/lib/session";
import { getAlerts, refreshAlertsFor } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { AlertList, type AlertRow } from "@/components/finance/AlertList";

export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const session = await requireSession("finance.view");
  await refreshAlertsFor(session.orgId);
  const alerts = await getAlerts(session.orgId, 200);
  return (
    <>
      <PageHeader title="Financial alert center" subtitle="Priority-based and linked to the record. Alerts close themselves when the issue is resolved; dismiss the ones you've handled." />
      <Card><AlertList alerts={alerts as unknown as AlertRow[]} /></Card>
    </>
  );
}
