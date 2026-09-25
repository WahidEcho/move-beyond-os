import Link from "next/link";
import { requireSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getProjectsFinancials } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { date, egp, toNum } from "@/lib/format";

export const metadata = { title: "Settlements" };

export default async function SettlementsPage() {
  const session = await requireSession("settlements.manage");
  const s = await createSupabaseServer();
  const [projects, { data: history }] = await Promise.all([
    getProjectsFinancials(session.orgId),
    s.from("settlements").select("*, projects(code, name)").eq("organization_id", session.orgId).order("created_at", { ascending: false }).limit(100),
  ]);
  const ready = projects.filter((p) => p.financial_status !== "financially_closed" &&
    (p.operational_status === "completed" || ["settlement_required", "partially_settled"].includes(p.financial_status) ||
     (p.metrics.collected > 0 && (toNum(p.partner_funding_due) + toNum(p.fee_due) + toNum(p.employee_due) + toNum(p.cto_due) + p.metrics.undistributedProfit) > 0)));
  return (
    <>
      <PageHeader title="Settlements" subtitle="When client money arrives: pay suppliers, reimburse funders, recover company funding, pay fees and CTO recovery, then distribute profit." />
      <Card>
        <CardHeader title="Ready for settlement" subtitle={`${ready.length} project(s)`} />
        {ready.length === 0 ? <EmptyState title="Nothing awaiting settlement" /> : (
          <table className="w-full text-[13.5px]">
            <thead><tr className="border-b border-line bg-subtle text-[12px] text-ink-3">
              <th className="px-5 py-2 text-left font-medium">Project</th><th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Cash available</th><th className="px-3 py-2 text-right font-medium">Owed to people</th>
              <th className="px-3 py-2 text-right font-medium">Undistributed profit</th><th className="w-40" />
            </tr></thead>
            <tbody>
              {ready.map((p) => (
                <tr key={p.project_id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5"><Link className="font-medium hover:underline" href={`/finance/projects/${p.project_id}`}><span className="num text-ink-3">{p.code}</span> {p.name}</Link></td>
                  <td className="px-3 py-2.5"><StatusBadge status={p.financial_status} /></td>
                  <td className="px-3 py-2.5 text-right"><Money value={p.metrics.settlementCash} /></td>
                  <td className="px-3 py-2.5 text-right"><Money value={toNum(p.partner_funding_due) + toNum(p.fee_due) + toNum(p.employee_due) + toNum(p.cto_due) + toNum(p.profit_due)} /></td>
                  <td className="px-3 py-2.5 text-right"><Money value={p.metrics.undistributedProfit} signed /></td>
                  <td className="px-5 text-right"><ButtonLink size="sm" variant="primary" href={`/finance/projects/${p.project_id}?tab=settlement`}>Settle</ButtonLink></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Settlement history" />
        {!history?.length ? <EmptyState title="No settlements yet" /> : (
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-5 py-2.5 text-[13.5px]">
                <span className="text-ink-3">{date(h.settlement_date)}</span>
                <Link className="hover:underline" href={`/finance/projects/${h.project_id}?tab=settlement`}>{h.projects?.code} {h.projects?.name}</Link>
                <b className="num ml-auto">{egp(h.total_paid)}</b>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
