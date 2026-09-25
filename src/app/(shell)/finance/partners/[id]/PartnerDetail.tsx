"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable } from "@/components/ui/DataTable";
import { PayPersonDialog } from "@/components/finance/forms";
import { date, humanize, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
const CAT: Record<string, string> = { funding: "Funding", employee_reimbursement: "Reimbursement", fee: "Partner fee", cto: "CTO recovery", profit: "Profit", carry_forward: "Carry-forward" };
const ACC: Record<string, string> = { DUE_FUNDING: "Funding", DUE_EMPLOYEE: "Reimbursement", DUE_FEE: "Fee", DUE_CTO: "CTO recovery", DUE_PROFIT: "Profit", DUE_CARRY: "Carry-forward", PARTNER_CAPITAL: "Reinvestment / capital" };

export function PartnerDues({ personId, personName, dues, lookups }: { personId: string; personName: string; dues: any[]; lookups: Lookups }) {
  const [pay, setPay] = useState<any>(null);
  const open = dues.filter((d) => toNum(d.due) !== 0);
  return (
    <Card className="mt-6">
      <CardHeader title="Open balances by project" subtitle="Pay in full or partially. Paying from another partner's holding account settles partner-to-partner." />
      {open.length === 0 ? <EmptyState title={`Nothing is currently due to ${personName}`} /> : (
        <table className="w-full text-[13.5px]"><tbody>
          {open.map((d, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              <td className="px-5 py-2.5">{d.project_id ? <Link className="hover:underline" href={`/finance/projects/${d.project_id}?tab=funding`}><span className="num text-ink-3">{d.projects?.code}</span> {d.projects?.name}</Link> : <span className="text-ink-3">Not project-specific</span>}</td>
              <td className="px-3 py-2.5"><Badge>{CAT[d.category] ?? humanize(d.category)}</Badge></td>
              <td className="px-3 py-2.5 text-right font-semibold"><Money value={d.due} signed={toNum(d.due) < 0} /></td>
              <td className="w-24 px-5 text-right">{toNum(d.due) > 0 && <Button size="sm" onClick={() => setPay(d)}>Pay</Button>}</td>
            </tr>
          ))}
        </tbody></table>
      )}
      {pay && <PayPersonDialog open onClose={() => setPay(null)} lookups={lookups} personId={personId} personName={personName} category={pay.category}
        projectId={pay.project_id} projectLabel={pay.projects ? `${pay.projects.code} ${pay.projects.name}` : undefined} due={toNum(pay.due)} />}
    </Card>
  );
}

export function PartnerStatement({ lines }: { lines: any[] }) {
  return (
    <Card className="mt-6">
      <CardHeader title="Statement" subtitle="Every movement on this person's account (reversed entries excluded)." />
      <DataTable rows={lines.map((l, i) => ({ ...l, i }))} rowKey={(r) => String(r.i)} exportName="partner-statement" dense
        columns={[
          { key: "entry_date", header: "Date", cell: (r) => date(r.entry_date) },
          { key: "account_code", header: "Category", cell: (r) => <Badge>{ACC[r.account_code] ?? r.account_code}</Badge>, value: (r) => ACC[r.account_code] },
          { key: "source_type", header: "Movement", cell: (r) => humanize(r.source_type.replace("payout_", "payment_")), value: (r) => r.source_type },
          { key: "project", header: "Project", value: (r) => (r.projects ? `${r.projects.code} ${r.projects.name}` : "—") },
          { key: "owed", header: "Owed to them", align: "right", cell: (r) => (toNum(r.amount) < 0 ? <Money value={-toNum(r.amount)} /> : ""), value: (r) => (toNum(r.amount) < 0 ? -toNum(r.amount) : 0), total: true },
          { key: "paid", header: "Paid / netted", align: "right", cell: (r) => (toNum(r.amount) > 0 ? <Money value={r.amount} /> : ""), value: (r) => (toNum(r.amount) > 0 ? toNum(r.amount) : 0), total: true },
        ]} footer />
    </Card>
  );
}
