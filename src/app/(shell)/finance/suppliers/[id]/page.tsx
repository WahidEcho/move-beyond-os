import { notFound } from "next/navigation";
import { requireSession, can } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getExpenses, getLookups } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { ExpensesTable } from "@/components/finance/ExpensesTable";
import { toNum } from "@/lib/format";
import { EditSupplierButton } from "../../clients/ClientsClient";
import { DocumentsTab } from "../../projects/[id]/tabs/DocumentsTab";

export default async function SupplierPage({ params }: PageProps<"/finance/suppliers/[id]">) {
  const session = await requireSession("masterdata.view");
  const { id } = await params;
  const s = await createSupabaseServer();
  const [{ data: sup }, rows, lookups] = await Promise.all([s.from("suppliers").select("*").eq("id", id).maybeSingle(), getExpenses(session.orgId, { supplierId: id }), getLookups(session.orgId)]);
  if (!sup) notFound();
  const sum = (k: string) => rows.reduce((a, r) => a + toNum(r[k]), 0);
  return (
    <>
      <PageHeader title={sup.name} crumbs={[{ label: "Suppliers", href: "/finance/suppliers" }, { label: sup.name }]} subtitle={sup.category ?? undefined}
        actions={can(session, "masterdata.manage") && <EditSupplierButton supplier={sup} />} />
      <KpiGrid className="mb-6">
        <Kpi label="Total spend" value={sum("committed_cost_egp")} />
        <Kpi label="Paid" value={sum("paid_egp")} />
        <Kpi label="Outstanding" value={sum("outstanding_egp")} tone={sum("outstanding_egp") > 0 ? "warn" : undefined} />
        <Kpi label="Projects" value={new Set(rows.map((r) => r.project_id).filter(Boolean)).size} format="count" />
      </KpiGrid>
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card><CardHeader title="Historical projects & expenses" /><ExpensesTable rows={rows} lookups={lookups} showProject closed /></Card>
        <div className="space-y-6">
          <Card><CardHeader title="Details" /><CardBody className="py-2"><DefinitionList items={[
            { label: "Company", value: sup.company_name ?? "—" }, { label: "Phone", value: sup.phone ?? "—" }, { label: "Email", value: sup.email ?? "—" },
          ]} />{sup.bank_details && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-subtle p-3 text-[13px]">{sup.bank_details}</p>}</CardBody></Card>
          <DocumentsTab entityType="supplier" entityId={id} />
        </div>
      </div>
    </>
  );
}
