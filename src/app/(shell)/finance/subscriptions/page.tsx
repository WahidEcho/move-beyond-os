import { requireSession, can } from "@/lib/session";
import { getLookups, getSubscriptions } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { isoInDays, toNum } from "@/lib/format";
import { SubscriptionsTable, NewSubscriptionButton } from "./SubscriptionsClient";

export const metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const session = await requireSession("finance.view");
  const [subs, lookups] = await Promise.all([getSubscriptions(session.orgId), getLookups(session.orgId)]);
  const mrr = subs.reduce((a, s) => a + toNum(s.mrr), 0);
  const in30 = isoInDays(30);
  const in7 = isoInDays(7);
  return (
    <>
      <PageHeader title="Subscriptions" subtitle="Move IT and other recurring services. Forecast, invoiced and collected are tracked separately."
        actions={can(session, "subscriptions.manage") && <NewSubscriptionButton lookups={lookups} />} />
      <KpiGrid className="mb-6 xl:grid-cols-6">
        <Kpi label="MRR" value={mrr} />
        <Kpi label="ARR" value={mrr * 12} />
        <Kpi label="Upcoming renewals (30d)" value={subs.filter((s) => s.status === "active" && s.next_billing_date && s.next_billing_date <= in30).length} format="count" />
        <Kpi label="Overdue payments" value={subs.reduce((a, s) => a + toNum(s.overdue), 0)} tone="neg" />
        <Kpi label="Trials ending (7d)" value={subs.filter((s) => s.status === "trial" && s.trial_end_date && s.trial_end_date <= in7).length} format="count" />
        <Kpi label="Collected" value={subs.reduce((a, s) => a + toNum(s.collected), 0)} />
      </KpiGrid>
      <Card><SubscriptionsTable rows={subs} canManage={can(session, "subscriptions.manage")} /></Card>
    </>
  );
}
