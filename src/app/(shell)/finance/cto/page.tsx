import { requireSession, can } from "@/lib/session";
import { getLookups, getTechnologies } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { toNum } from "@/lib/format";
import { CtoTable, CtoActions } from "./CtoClient";

export const metadata = { title: "CTO Development Recovery" };

export default async function CtoPage() {
  const session = await requireSession("technology.view");
  const [techs, lookups] = await Promise.all([getTechnologies(session.orgId), getLookups(session.orgId)]);
  const live = techs.filter((t) => !["cancelled", "archived"].includes(t.lifecycle_status));
  const sum = (k: string) => live.reduce((a, t) => a + toNum(t[k]), 0);
  return (
    <>
      <PageHeader title="CTO Development Recovery" subtitle="Agreed value of reusable technology, recovered gradually from projects that use it. The system remembers what is still owed."
        actions={<CtoActions lookups={lookups} canManage={can(session, "technology.manage")} canRecover={can(session, "technology.recover")} />} />
      <KpiGrid className="xl:grid-cols-4">
        <Kpi label="Technology developed" value={live.length} format="count" />
        <Kpi label="Approved development value" value={sum("approved_value")} />
        <Kpi label="Total recovered" value={sum("recovered")} tone="pos" />
        <Kpi label="Total outstanding" value={sum("outstanding")} tone={sum("outstanding") > 0 ? "warn" : undefined} />
        <Kpi label="Projects using technology" value={live.reduce((a, t) => a + toNum(t.projects_used), 0)} format="count" />
        <Kpi label="Fully recovered systems" value={live.filter((t) => t.recovery_status === "fully_recovered").length} format="count" />
        <Kpi label="Unrecovered systems" value={live.filter((t) => toNum(t.outstanding) > 0).length} format="count" />
        <Kpi label="Revenue influenced" value={sum("revenue_influenced")} hint="Collected on projects using them" />
      </KpiGrid>
      <Card className="mt-6"><CtoTable rows={techs} /></Card>
    </>
  );
}
