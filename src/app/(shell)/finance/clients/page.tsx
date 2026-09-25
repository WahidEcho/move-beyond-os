import { requireSession, can } from "@/lib/session";
import { getClientsOverview } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ClientsTable, NewClientButton } from "./ClientsClient";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const session = await requireSession("masterdata.view");
  const rows = await getClientsOverview(session.orgId);
  return (
    <>
      <PageHeader title="Clients" subtitle="One client record shared by Finance today and CRM, Sales and Operations later."
        actions={can(session, "masterdata.manage") && <NewClientButton />} />
      <Card><ClientsTable rows={rows} showMoney={can(session, "finance.view")} /></Card>
    </>
  );
}
