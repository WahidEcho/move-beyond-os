import { requireSession, can } from "@/lib/session";
import { getAssets, getLookups } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { toNum } from "@/lib/format";
import { AssetsTable, BuyAssetButton } from "./AssetsClient";

export const metadata = { title: "Assets & Inventory" };

export default async function AssetsPage() {
  const session = await requireSession("assets.view");
  const [assets, lookups] = await Promise.all([getAssets(session.orgId), getLookups(session.orgId)]);
  return (
    <>
      <PageHeader title="Assets & Inventory" subtitle="Owned equipment. The same register will power Operations and Inventory later."
        actions={can(session, "finance.manage") && <BuyAssetButton lookups={lookups} />} />
      <KpiGrid className="mb-6">
        <Kpi label="Asset value" value={assets.reduce((a, x) => a + toNum(x.purchase_value), 0)} />
        <Kpi label="Units owned" value={assets.reduce((a, x) => a + toNum(x.quantity_owned), 0)} format="count" />
        <Kpi label="Units in events" value={assets.reduce((a, x) => a + toNum(x.in_event), 0)} format="count" />
        <Kpi label="Units available" value={assets.reduce((a, x) => a + toNum(x.available), 0)} format="count" />
      </KpiGrid>
      <Card><AssetsTable rows={assets} lookups={lookups} canManage={can(session, "assets.manage")} /></Card>
    </>
  );
}
