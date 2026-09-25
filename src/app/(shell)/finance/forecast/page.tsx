import { requireSession } from "@/lib/session";
import { getCashForecast } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { Callout } from "@/components/ui/Callout";
import { egp } from "@/lib/format";
import { CashItems } from "./CashItems";

export const metadata = { title: "Forecasting" };

export default async function ForecastPage() {
  const session = await requireSession("finance.view");
  const f = await getCashForecast(session.orgId);
  return (
    <>
      <PageHeader title="Cash flow forecast" subtitle="Confirmed commitments, reimbursements, CTO recovery due, subscription billing and client milestones." />
      {f.overdueIn > 0 && <Callout tone="warn" className="mb-6">{egp(f.overdueIn)} of overdue receivables is counted as expected now — chase it in Collections.</Callout>}
      <div className="grid gap-6 lg:grid-cols-3">
        {f.windows.map((w) => (
          <Card key={w.days} className={w.fundingGap > 0 ? "border-warn/40" : ""}>
            <CardHeader title={`Next ${w.days} days`} />
            <CardBody className="py-2">
              <DefinitionList items={[
                { label: "Cash today", value: <Money value={f.currentCash} /> },
                { label: "Expected collections", value: <Money value={w.expectedIn} /> },
                { label: "Required payments", value: <Money value={-w.requiredOut} signed /> },
                { label: "Projected balance", value: <Money value={w.projectedBalance} signed />, strong: true },
                { label: "Funding gap", value: <Money value={w.fundingGap} className={w.fundingGap > 0 ? "text-warn" : ""} />, hint: "required − expected" },
                { label: "Shortfall after today's cash", value: <Money value={w.shortfallAfterCash} className={w.shortfallAfterCash > 0 ? "text-neg" : ""} /> },
              ]} />
            </CardBody>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Expected in" /><CashItems rows={f.inflows} /></Card>
        <Card><CardHeader title="Required out" /><CashItems rows={f.outflows} /></Card>
      </div>
    </>
  );
}
