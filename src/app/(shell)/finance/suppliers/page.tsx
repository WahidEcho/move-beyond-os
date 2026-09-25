import { requireSession, can } from "@/lib/session";
import { getSuppliers } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { NewSupplierButton } from "../clients/ClientsClient";
import { SuppliersTable } from "./SuppliersTable";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const session = await requireSession("masterdata.view");
  const rows = await getSuppliers(session.orgId);
  return (
    <>
      <PageHeader title="Suppliers" subtitle="Recommended on every expense, never required."
        actions={(can(session, "masterdata.manage") || can(session, "suppliers.create")) && <NewSupplierButton />} />
      <Card><SuppliersTable rows={rows} /></Card>
    </>
  );
}
