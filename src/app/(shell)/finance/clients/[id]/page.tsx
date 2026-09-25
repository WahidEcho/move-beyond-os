import { notFound } from "next/navigation";
import { requireSession, can } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getProjectsFinancials, getSubscriptions } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { humanize } from "@/lib/format";
import { EditClientButton } from "../ClientsClient";
import { ProjectsTable } from "../../projects/ProjectsTable";

export default async function ClientPage({ params }: PageProps<"/finance/clients/[id]">) {
  const session = await requireSession("masterdata.view");
  const { id } = await params;
  const s = await createSupabaseServer();
  const [{ data: client }, projects, subs, { data: contacts }] = await Promise.all([
    s.from("clients").select("*").eq("id", id).maybeSingle(), getProjectsFinancials(session.orgId), getSubscriptions(session.orgId),
    s.from("contacts").select("*").eq("client_id", id).is("deleted_at", null),
  ]);
  if (!client) notFound();
  const mine = projects.filter((p) => p.client_id === id);
  const money = can(session, "finance.view");
  return (
    <>
      <PageHeader title={client.name} crumbs={[{ label: "Clients", href: "/finance/clients" }, { label: client.name }]}
        subtitle={`${humanize(client.client_type)}${client.company_name ? ` · ${client.company_name}` : ""}`}
        actions={can(session, "masterdata.manage") && <EditClientButton client={client} />} />
      {money && (
        <KpiGrid className="mb-6">
          <Kpi label="Projects" value={mine.length} format="count" />
          <Kpi label="Total revenue" value={mine.reduce((a, p) => a + p.metrics.collected, 0)} />
          <Kpi label="Outstanding" value={mine.reduce((a, p) => a + p.metrics.outstanding, 0)} />
          <Kpi label="Active subscriptions" value={subs.filter((x) => x.client_id === id && x.status === "active").length} format="count" />
        </KpiGrid>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card><CardHeader title="Projects" subtitle="Each project is financially independent." />
          <ProjectsTable showMoney={money} rows={mine.map((p) => ({ id: p.project_id, code: p.code, name: p.name, client: p.client_name, type: p.project_type, op: p.operational_status, fin: p.financial_status,
            start: p.start_date, contract: p.metrics.contractValue, collected: p.metrics.collected, outstanding: p.metrics.outstanding, actual: p.metrics.actualCost,
            forecast: p.metrics.forecastProfit, margin: p.metrics.forecastMarginPct, marketing: p.metrics.isMarketingInvestment }))} /></Card>
        <Card><CardHeader title="Contact" />
          <CardBody className="py-2"><DefinitionList items={[
            { label: "Phone", value: client.phone ?? "—" }, { label: "Email", value: client.email ?? "—" },
            ...(contacts ?? []).map((c) => ({ label: c.full_name, value: c.phone ?? c.email ?? "" })),
          ]} />{client.notes && <p className="mt-3 text-sm text-ink-2">{client.notes}</p>}</CardBody></Card>
      </div>
    </>
  );
}
