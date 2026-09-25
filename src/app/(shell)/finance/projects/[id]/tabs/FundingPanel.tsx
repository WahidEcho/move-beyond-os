"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { deleteFunding, deletePayout } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { FundingDialog, PayPersonDialog } from "@/components/finance/forms";
import { date, humanize, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CAT: Record<string, string> = { funding: "Funding", employee_reimbursement: "Expense reimbursement", fee: "Partner fee", cto: "CTO recovery", profit: "Profit", carry_forward: "Carry-forward" };

export function FundingPanel({ projectId, data, lookups, closed }: { projectId: string; data: { byFunder: any[]; records: any[]; dues: any[]; payouts: any[] }; lookups: Lookups; closed: boolean }) {
  const [add, setAdd] = useState(false);
  const [pay, setPay] = useState<any>(null);
  const [del, setDel] = useState<{ kind: "funding" | "payout"; id: string } | null>(null);
  const delFunding = useAction(deleteFunding, { success: "Funding removed", onSuccess: () => setDel(null) });
  const delPayout = useAction(deletePayout, { success: "Payment reversed", onSuccess: () => setDel(null) });
  const dues = data.dues.filter((d) => toNum(d.due) !== 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Funding by source" subtitle="Who put money into this project — exact amounts."
          actions={!closed && <Button size="sm" onClick={() => setAdd(true)}><Plus className="size-3.5" />Add funding</Button>} />
        {data.byFunder.length === 0 ? <EmptyState title="No funding yet" body="Company-paid and partner-paid expenses appear here automatically." /> : (
          <table className="w-full text-[13.5px]">
            <thead><tr className="border-b border-line bg-subtle text-[12px] text-ink-3">
              <th className="px-5 py-2 text-left font-medium">Funder</th><th className="px-3 py-2 text-right font-medium">Funded</th>
              <th className="px-3 py-2 text-right font-medium">Repaid / recovered</th><th className="px-5 py-2 text-right font-medium">Outstanding</th>
            </tr></thead>
            <tbody>
              {data.byFunder.map((f) => (
                <tr key={f.funder_id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-medium">{f.funder_name} {f.funder_type === "company" && <Badge className="ml-1">Company funding</Badge>}</td>
                  <td className="px-3 py-2.5 text-right"><Money value={f.funded} /></td>
                  <td className="px-3 py-2.5 text-right"><Money value={f.repaid} /></td>
                  <td className="px-5 py-2.5 text-right font-semibold"><Money value={toNum(f.funded) - toNum(f.repaid)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader title="Amounts due on this project" subtitle="Each category stays separate: funding ≠ reimbursement ≠ fee ≠ CTO recovery ≠ profit." />
        {dues.length === 0 ? <EmptyState title="Nothing is due to anyone on this project" /> : (
          <table className="w-full text-[13.5px]">
            <tbody>
              {dues.map((d, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-medium">{d.people?.full_name}</td>
                  <td className="px-3 py-2.5"><Badge>{CAT[d.category] ?? humanize(d.category)}</Badge></td>
                  <td className="px-3 py-2.5 text-right font-semibold"><Money value={d.due} signed={toNum(d.due) < 0} /></td>
                  <td className="w-28 px-5 text-right">
                    {!closed && toNum(d.due) > 0 && <Button size="sm" onClick={() => setPay(d)}>Pay</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Funding records" />
          {data.records.length === 0 ? <EmptyState title="None" /> : (
            <table className="w-full text-[13px]">
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.id} className="group border-b border-line last:border-0">
                    <td className="px-5 py-2 text-ink-3">{date(r.funding_date, true)}</td>
                    <td className="px-3 py-2">{r.funders?.name}<span className="ml-2 text-[12px] text-ink-3">{humanize(r.kind)}</span></td>
                    <td className="px-3 py-2 text-right"><Money value={r.amount_egp} /></td>
                    <td className="w-8 pr-3">{!closed && r.kind === "cash_contribution" && <button onClick={() => setDel({ kind: "funding", id: r.id })} className="text-ink-4 opacity-0 hover:text-neg group-hover:opacity-100"><Trash2 className="size-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <CardHeader title="Payments to people" />
          {data.payouts.length === 0 ? <EmptyState title="None yet" /> : (
            <table className="w-full text-[13px]">
              <tbody>
                {data.payouts.map((p) => (
                  <tr key={p.id} className="group border-b border-line last:border-0">
                    <td className="px-5 py-2 text-ink-3">{date(p.payout_date, true)}</td>
                    <td className="px-3 py-2">{p.category === "company_recovery" ? "Move Beyond funding recovered" : p.people?.full_name}
                      <span className="ml-2 text-[12px] text-ink-3">{p.category === "company_recovery" ? "memo" : CAT[p.category]}</span></td>
                    <td className="px-3 py-2 text-right"><Money value={p.amount} /></td>
                    <td className="w-8 pr-3">{!closed && <button onClick={() => setDel({ kind: "payout", id: p.id })} className="text-ink-4 opacity-0 hover:text-neg group-hover:opacity-100"><Trash2 className="size-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {add && <FundingDialog open onClose={() => setAdd(false)} lookups={lookups} projectId={projectId} />}
      {pay && <PayPersonDialog open onClose={() => setPay(null)} lookups={lookups} personId={pay.person_id} personName={pay.people?.full_name}
        category={pay.category} projectId={projectId} due={toNum(pay.due)} />}
      <ReasonDialog open={!!del} onClose={() => setDel(null)} danger confirmLabel="Reverse"
        title={del?.kind === "funding" ? "Remove funding" : "Reverse payment"} description="Reversed in the ledger; the original stays in Deleted Records."
        pending={delFunding.pending || delPayout.pending} error={(delFunding.error ?? delPayout.error)?.error}
        onConfirm={(reason) => (del?.kind === "funding" ? delFunding.run(del.id, reason) : delPayout.run(del!.id, reason))} />
    </div>
  );
}
