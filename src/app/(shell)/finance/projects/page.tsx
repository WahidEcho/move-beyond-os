import { requireSession, can } from "@/lib/session";
import { getProjectsFinancials } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { Plus } from "lucide-react";
import { ProjectsTable } from "./ProjectsTable";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const session = await requireSession();
  const projects = await getProjectsFinancials(session.orgId);
  const showMoney = can(session, "finance.view");
  return (
    <>
      <PageHeader title="Projects" subtitle="Every project is financially independent — even for the same client."
        actions={can(session, "projects.manage") && <ButtonLink href="/finance/projects/new" variant="primary"><Plus className="size-4" />New project</ButtonLink>} />
      <Card>
        <ProjectsTable rows={projects.map((p) => ({
          id: p.project_id, code: p.code, name: p.name, client: p.client_name, type: p.project_type, op: p.operational_status, fin: p.financial_status,
          start: p.start_date, contract: p.metrics.contractValue, collected: p.metrics.collected, outstanding: p.metrics.outstanding,
          actual: p.metrics.actualCost, forecast: p.metrics.forecastProfit, margin: p.metrics.forecastMarginPct, marketing: p.metrics.isMarketingInvestment,
        }))} showMoney={showMoney} />
      </Card>
    </>
  );
}
