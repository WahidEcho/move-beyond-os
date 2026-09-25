import { notFound } from "next/navigation";
import { requireSession, can } from "@/lib/session";
import { getLookups, getProject, getProjectTechnology } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { date, humanize } from "@/lib/format";
import { ProjectActions } from "./ProjectActions";
import { OverviewTab } from "./tabs/OverviewTab";
import { RevenueTab } from "./tabs/RevenueTab";
import { ExpensesTab } from "./tabs/ExpensesTab";
import { FundingTab } from "./tabs/FundingTab";
import { FeesTab } from "./tabs/FeesTab";
import { TechnologyTab } from "./tabs/TechnologyTab";
import { AssetsTab } from "./tabs/AssetsTab";
import { SettlementTab } from "./tabs/SettlementTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { ActivityTab } from "./tabs/ActivityTab";

const FINANCE_TABS = [
  { key: "overview", label: "Overview" }, { key: "revenue", label: "Revenue" }, { key: "expenses", label: "Expenses" },
  { key: "funding", label: "Funding" }, { key: "fees", label: "Fees" }, { key: "technology", label: "Technology" },
  { key: "assets", label: "Assets" }, { key: "settlement", label: "Settlement" }, { key: "documents", label: "Documents" },
  { key: "activity", label: "Activity" },
];

export async function generateMetadata({ params }: PageProps<"/finance/projects/[id]">) {
  const { id } = await params;
  const p = await getProject(id);
  return { title: p ? `${p.project.code} ${p.project.name}` : "Project" };
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/finance/projects/[id]">) {
  const session = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const data = await getProject(id);
  if (!data) notFound();
  const { project, metrics } = data;
  const finance = can(session, "finance.view");
  // Project managers only see the operational tabs they are allowed (spec §89).
  const tabs = finance ? FINANCE_TABS : FINANCE_TABS.filter((t) => ["overview", "expenses", "documents"].includes(t.key));
  const tab = tabs.some((t) => t.key === sp.tab) ? (sp.tab as string) : "overview";
  const [lookups, tech] = await Promise.all([getLookups(session.orgId), getProjectTechnology(id)]);
  const closed = project.financial_status === "financially_closed";
  const base = `/finance/projects/${id}`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Projects", href: "/finance/projects" }, { label: project.code }]}
        title={<span className="flex items-baseline gap-3"><span className="num text-ink-3">{project.code}</span>{project.name}</span>}
        subtitle={`${project.clients?.name ?? "No client"} · ${humanize(project.project_type)} · ${date(project.start_date)}${project.end_date && project.end_date !== project.start_date ? ` – ${date(project.end_date)}` : ""}`}
        meta={<>
          <StatusBadge status={project.operational_status} />
          <StatusBadge status={project.financial_status} />
          {project.is_marketing_investment && <Badge tone="info">Marketing / sponsorship investment</Badge>}
          {data.services.map((s) => <Badge key={s.service_id}>{s.services?.name}</Badge>)}
        </>}
        actions={<ProjectActions projectId={id} project={{ code: project.code, operational_status: project.operational_status, financial_status: project.financial_status }}
          lookups={lookups} milestones={[]} can={{ finance: can(session, "finance.manage"), projects: can(session, "projects.manage"), reopen: can(session, "projects.reopen") }}
          closed={closed} />}
      />
      <Tabs tabs={tabs} active={tab} baseHref={base} />
      <div className="animate-fade-in">
        {tab === "overview" && <OverviewTab data={data} tech={tech} lookups={lookups} showMoney={finance} />}
        {tab === "revenue" && <RevenueTab projectId={id} data={data} lookups={lookups} closed={closed} />}
        {tab === "expenses" && <ExpensesTab projectId={id} orgId={session.orgId} lookups={lookups} closed={closed} />}
        {tab === "funding" && <FundingTab projectId={id} lookups={lookups} closed={closed} />}
        {tab === "fees" && <FeesTab projectId={id} lookups={lookups} closed={closed} contractValue={metrics?.contractValue ?? 0} />}
        {tab === "technology" && <TechnologyTab projectId={id} tech={tech} lookups={lookups} closed={closed} />}
        {tab === "assets" && <AssetsTab projectId={id} orgId={session.orgId} lookups={lookups} />}
        {tab === "settlement" && <SettlementTab projectId={id} orgId={session.orgId} data={data} tech={tech} lookups={lookups} closed={closed}
          canReopen={can(session, "projects.reopen")} canClose={can(session, "projects.close")} />}
        {tab === "documents" && <DocumentsTab entityType="project" entityId={id} />}
        {tab === "activity" && <ActivityTab orgId={session.orgId} projectId={id} />}
      </div>
    </>
  );
}
