import Link from "next/link";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";
import { egp, pct, toNum, humanize } from "@/lib/format";
import type { getProject, getProjectTechnology, Lookups } from "@/services/queries";
import { profitLabel } from "@/engines/projectFinancials";
import { TechnologyPrompt } from "./TechnologyPrompt";

export function OverviewTab({ data, tech, lookups, showMoney }: {
  data: NonNullable<Awaited<ReturnType<typeof getProject>>>; tech: Awaited<ReturnType<typeof getProjectTechnology>>; lookups: Lookups; showMoney: boolean;
}) {
  const m = data.metrics;
  const prompts = tech.usage.filter((u) => u.recovery_decision === "pending" && toNum(u.tech?.outstanding) > 0);
  const label = m ? profitLabel(m) : null;
  return (
    <div className="space-y-6">
      {prompts.map((u) => (
        <TechnologyPrompt key={u.id} projectId={data.project.id} lookups={lookups} technologyId={u.technology_id} name={u.tech?.name}
          outstanding={toNum(u.tech?.outstanding)} developer={u.tech?.developer_name} />
      ))}
      {showMoney && m && (
        <>
          <KpiGrid className="xl:grid-cols-5">
            <Kpi label="Contract value" value={m.contractValue} />
            <Kpi label="Collected" value={m.collected} hint={m.contractValue ? `${pct((m.collected / m.contractValue) * 100, 0)} of contract` : undefined} />
            <Kpi label="Outstanding" value={m.outstanding} tone={m.overdue > 0 ? "neg" : undefined} hint={m.overdue > 0 ? `${egp(m.overdue)} overdue` : undefined} />
            <Kpi label="Budget" value={m.budget ?? 0} hint={m.budgetVariance !== null ? (m.budgetVariance >= 0 ? `${egp(m.budgetVariance)} under` : `${egp(-m.budgetVariance)} over`) : "Not set"}
              tone={m.budgetVariance !== null && m.budgetVariance < 0 ? "neg" : undefined} />
            <Kpi label="Cash position" value={data.fin?.cash_position} hint="Project money in − out" />
            <Kpi label="Actual cost" value={m.actualCost} hint="Paid by anyone" />
            <Kpi label="Committed cost" value={m.committedCost} hint={`${egp(m.remainingCommitments)} still unpaid`} />
            <Kpi label="Forecast cost" value={m.forecastCost} hint="Actual + commitments + estimates" />
            <Kpi label="Gross profit" value={m.grossProfit} tone={m.grossProfit < 0 ? "neg" : undefined} hint={m.grossMarginPct !== null ? `${pct(m.grossMarginPct)} margin` : undefined} />
            <Kpi label="Forecast profit" value={m.forecastProfit} tone={m.forecastProfit < 0 ? "neg" : "pos"} hint={m.forecastMarginPct !== null ? `${pct(m.forecastMarginPct)} forecast margin` : undefined} />
          </KpiGrid>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Profitability" subtitle="Actual, cash basis" actions={label === "marketing_investment" ? <Badge tone="info">Marketing investment</Badge> : label === "loss" ? <Badge tone="neg">Loss</Badge> : null} />
              <CardBody className="py-2">
                <DefinitionList items={[
                  { label: "Revenue collected", value: <Money value={m.collected} /> },
                  { label: "Direct project costs", value: <Money value={-m.actualCost} signed /> },
                  { label: "Gross operating margin before CTO recovery", value: <Money value={m.grossProfit} />, strong: true },
                  { label: "Partner / commercial fees", value: <Money value={-toNum(data.fin?.fee_cost)} signed /> },
                  { label: "CTO development recovery", value: <Money value={-toNum(data.fin?.cto_cost)} signed /> },
                  { label: "Remaining project margin", value: <Money value={m.distributableProfit} />, strong: true },
                  { label: "Distributed / allocated", value: <Money value={-toNum(data.fin?.distributed)} signed /> },
                  { label: "Undistributed", value: <Money value={m.undistributedProfit} signed />, strong: true },
                ]} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Forecast" subtitle="Expected final result" />
              <CardBody className="py-2">
                <DefinitionList items={[
                  { label: "Expected revenue", value: <Money value={m.forecastRevenue} /> },
                  { label: "Actual costs", value: <Money value={-m.actualCost} signed /> },
                  { label: "Remaining commitments", value: <Money value={-m.remainingCommitments} signed /> },
                  { label: "Estimates not yet committed", value: <Money value={-toNum(data.fin?.uncommitted_estimates)} signed /> },
                  { label: "Partner fees (accepted + suggested)", value: <Money value={-(toNum(data.fin?.fee_cost) + toNum(data.fin?.suggested_fees))} signed /> },
                  { label: "CTO recovery (allocated + planned)", value: <Money value={-(toNum(data.fin?.cto_cost) + toNum(data.fin?.planned_cto))} signed /> },
                  { label: "Forecast final profit", value: <Money value={m.forecastProfit} signed />, strong: true },
                ]} />
              </CardBody>
            </Card>
          </div>
        </>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Services" />
          <CardBody className="flex flex-wrap gap-1.5">
            {data.services.length ? data.services.map((s) => <Badge key={s.service_id}>{s.services?.service_categories?.name} · {s.services?.name}</Badge>) : <p className="text-[13px] text-ink-3">No services assigned.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Team" />
          <CardBody className="py-2">
            {data.members.length ? <DefinitionList items={data.members.map((mm) => ({ label: humanize(mm.project_role), value: mm.people?.full_name }))} />
              : <p className="py-2 text-[13px] text-ink-3">No team assigned.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Technology" actions={<Link href="?tab=technology" className="text-[13px] text-ink-3 hover:text-ink">Manage</Link>} />
          <CardBody className="py-2">
            {tech.usage.length ? <DefinitionList items={tech.usage.map((u) => ({ label: u.tech?.name, value: toNum(u.tech?.outstanding) > 0 ? `${egp(u.tech?.outstanding)} open` : "Recovered" }))} />
              : <p className="py-2 text-[13px] text-ink-3">No reusable technology used.</p>}
          </CardBody>
        </Card>
      </div>
      {data.project.description && <Card><CardBody><p className="whitespace-pre-wrap text-sm text-ink-2">{data.project.description}</p></CardBody></Card>}
    </div>
  );
}
