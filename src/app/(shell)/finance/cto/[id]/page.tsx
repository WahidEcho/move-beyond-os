import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession, can } from "@/lib/session";
import { getLookups, getTechnology } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { date, humanize, toNum } from "@/lib/format";
import { TechActions } from "./TechActions";
import { DocumentsTab } from "../../projects/[id]/tabs/DocumentsTab";

export default async function TechPage({ params }: PageProps<"/finance/cto/[id]">) {
  const session = await requireSession("technology.view");
  const { id } = await params;
  const [t, lookups] = await Promise.all([getTechnology(id), getLookups(session.orgId)]);
  if (!t) notFound();
  const { tech, rec } = t;
  const history = t.allocations.reduce<{ rows: (typeof t.allocations[number] & { left: number })[]; left: number }>((acc, a) => {
    const left = a.status === "allocated" ? acc.left - toNum(a.amount) : acc.left;
    return { rows: [...acc.rows, { ...a, left }], left };
  }, { rows: [], left: toNum(rec.approved_value) }).rows;
  return (
    <>
      <PageHeader title={tech.name} crumbs={[{ label: "CTO Development", href: "/finance/cto" }, { label: tech.name }]}
        subtitle={`Developer: ${rec.developer_name} · Ownership: ${tech.ownership} · ${tech.reusable ? "Reusable across projects" : "Single use"}`}
        meta={<><StatusBadge status={tech.lifecycle_status} /><StatusBadge status={rec.recovery_status} />{rec.category_name && <Badge>{rec.category_name}</Badge>}</>}
        actions={<TechActions techId={id} lookups={lookups} outstanding={toNum(rec.outstanding)} name={tech.name} developer={rec.developer_name}
          tech={tech} canManage={can(session, "technology.manage")} canRecover={can(session, "technology.recover")} />} />
      <KpiGrid>
        <Kpi label="Approved recoverable value" value={rec.approved_value} />
        <Kpi label="Recovered" value={rec.recovered} tone="pos" />
        <Kpi label="Outstanding" value={rec.outstanding} tone={toNum(rec.outstanding) > 0 ? "warn" : "pos"} hint={toNum(rec.outstanding) <= 0 ? "Fully recovered — cannot be claimed again" : undefined} />
        <Kpi label="Revenue influenced" value={rec.revenue_influenced} hint={`${rec.projects_used} project(s) used it`} />
      </KpiGrid>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recovery statement" subtitle="Value, then every project's contribution" />
          <CardBody className="py-2">
            <DefinitionList items={[
              { label: "Approved development value", value: <Money value={rec.approved_value} />, strong: true },
              ...history.map((a) => {
                return {
                  label: <span>{a.project_id ? <Link className="hover:underline" href={`/finance/projects/${a.project_id}?tab=technology`}>{a.projects?.code} {a.projects?.name}</Link> : "Before go-live"}
                    <span className="ml-2 text-[12px] text-ink-3">{date(a.allocation_date, true)}{a.status === "reversed" ? " · reversed" : ""}</span></span>,
                  value: <Money value={a.status === "reversed" ? 0 : -toNum(a.amount)} signed className={a.status === "reversed" ? "line-through" : ""} />,
                  hint: a.status === "allocated" ? `→ ${Math.max(a.left, 0).toLocaleString("en-US")} left` : undefined,
                };
              }),
              { label: "Outstanding", value: <Money value={rec.outstanding} />, strong: true },
            ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Value history" subtitle="Extensions never overwrite the original value" />
          <CardBody className="py-2">
            <DefinitionList items={t.adjustments.map((a) => ({ label: <span>{humanize(a.kind)} · {a.reason}<span className="ml-2 text-[12px] text-ink-3">{date(a.effective_date, true)}</span></span>, value: <Money value={a.amount} signed={a.kind !== "initial"} /> }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Projects using this technology" />
          {t.usage.length === 0 ? <EmptyState title="Not used on any project yet" /> : (
            <CardBody className="py-2">
              <DefinitionList items={t.usage.map((u) => ({
                label: <Link className="hover:underline" href={`/finance/projects/${u.project_id}?tab=technology`}>{u.projects?.code} {u.projects?.name}</Link>,
                value: <span className="text-[12.5px] text-ink-2">{humanize(u.recovery_decision)}</span>,
              }))} />
            </CardBody>
          )}
        </Card>
        <Card>
          <CardHeader title="Details" />
          <CardBody className="py-2">
            <DefinitionList items={[
              { label: "Original project", value: rec.original_project_code ? `${rec.original_project_code} ${rec.original_project_name}` : "—" },
              { label: "Development period", value: `${date(tech.development_start_date)} – ${date(tech.completion_date)}` },
              { label: "Related services", value: t.services.map((s) => s.services?.name).join(", ") || "—" },
              { label: "Current version", value: tech.current_version ?? "—" },
              { label: "Source repository", value: tech.source_repository ?? "—" },
              { label: "Hosting", value: tech.hosting ?? "—" },
            ]} />
            {tech.description && <p className="mt-3 text-sm text-ink-2">{tech.description}</p>}
          </CardBody>
        </Card>
      </div>
      <div className="mt-6"><DocumentsTab entityType="technology_development" entityId={id} /></div>
    </>
  );
}
