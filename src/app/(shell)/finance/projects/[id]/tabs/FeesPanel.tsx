"use client";
import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { decideFee, reverseFee, suggestFees } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { Callout } from "@/components/ui/Callout";
import { FeeDialog } from "@/components/finance/forms";
import { humanize, toNum, egp } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
const BASIS: Record<string, string> = { pct_contract: "% of contract", pct_revenue: "% of revenue", pct_gross_profit: "% of gross profit", pct_net_profit: "% of net profit", fixed: "Fixed" };

export function FeesPanel({ projectId, fees, lookups, closed, contractValue }: { projectId: string; fees: any[]; lookups: Lookups; closed: boolean; contractValue: number }) {
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [rev, setRev] = useState<any>(null);
  const suggest = useAction(suggestFees, { success: (n) => (Number(n) ? `${n} suggestion(s) added` : "No new suggestions — assign a project manager or lead generator first") });
  const decide = useAction(decideFee, { success: "Fee updated", onSuccess: () => setEdit(null) });
  const reverse = useAction(reverseFee, { success: "Fee reversed", onSuccess: () => setRev(null) });
  const suggestions = fees.filter((f) => f.status === "suggested");
  const others = fees.filter((f) => f.status !== "suggested");

  return (
    <div className="space-y-6">
      {suggestions.length > 0 && (
        <Card className="border-warn/30">
          <CardHeader title="Suggested partner fees" subtitle="Not applied until you accept them." />
          <table className="w-full text-[13.5px]">
            <tbody>
              {suggestions.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3"><p className="font-medium">{f.people?.full_name} · {humanize(f.fee_type)} fee</p>
                    <p className="text-[12px] text-ink-3">{f.rate ? `${toNum(f.rate)}% × ${egp(f.base_amount)}` : BASIS[f.basis]} · {f.treatment === "project_cost" ? "project cost" : "from own share"}</p></td>
                  <td className="px-3 py-3 text-right text-base font-semibold"><Money value={f.amount} /></td>
                  <td className="w-[250px] px-5 py-3 text-right">
                    {!closed && <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="primary" loading={decide.pending} onClick={() => decide.run(f.id, "accept", null, null)}>Accept</Button>
                      <Button size="sm" onClick={() => setEdit(f)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => decide.run(f.id, "ignore", null, null)}>Ignore</Button>
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Card>
        <CardHeader title="Partner & commercial fees" subtitle="Separate from funding, CTO recovery and profit share."
          actions={!closed && <>
            <Button size="sm" variant="ghost" loading={suggest.pending} onClick={() => suggest.run(projectId)}><Sparkles className="size-3.5" />Suggest fees</Button>
            <Button size="sm" variant="primary" onClick={() => setAdd(true)}><Plus className="size-3.5" />Add fee</Button>
          </>} />
        {others.length === 0 ? <EmptyState title="No fees" body="Management, lead generation, commission, project, consulting or custom fees." /> : (
          <table className="w-full text-[13.5px]">
            <thead><tr className="border-b border-line bg-subtle text-[12px] text-ink-3">
              <th className="px-5 py-2 text-left font-medium">Partner</th><th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Calculation</th><th className="px-3 py-2 text-left font-medium">Paid as</th>
              <th className="px-3 py-2 text-left font-medium">Status</th><th className="px-3 py-2 text-right font-medium">Amount</th><th className="w-24" />
            </tr></thead>
            <tbody>
              {others.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-medium">{f.people?.full_name}</td>
                  <td className="px-3 py-2.5">{humanize(f.fee_type)}</td>
                  <td className="px-3 py-2.5 text-ink-2">{f.rate ? `${toNum(f.rate)}% ${BASIS[f.basis].replace("% ", "")}` : BASIS[f.basis]}</td>
                  <td className="px-3 py-2.5 text-ink-2">{f.treatment === "project_cost" ? "Project cost" : "Own share"}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={f.status} /></td>
                  <td className="px-3 py-2.5 text-right font-medium"><Money value={f.amount} /></td>
                  <td className="px-5 text-right">
                    {!closed && f.status === "accepted" && <Button size="sm" variant="ghost" onClick={() => setRev(f)}>Reverse</Button>}
                    {!closed && f.status === "ignored" && <Button size="sm" variant="ghost" onClick={() => setEdit(f)}>Reconsider</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-[13px] text-ink-3">Fees are paid from the Funding tab or during settlement.</p>
      {add && <FeeDialog open onClose={() => setAdd(false)} lookups={lookups} projectId={projectId} contractValue={contractValue} />}
      {edit && <EditFee fee={edit} onClose={() => setEdit(null)} decide={decide} />}
      <ReasonDialog open={!!rev} onClose={() => setRev(null)} danger title="Reverse fee" confirmLabel="Reverse" description="Only possible if the fee has not been paid."
        pending={reverse.pending} error={reverse.error?.error} onConfirm={(r) => reverse.run(rev.id, r)} />
    </div>
  );
}

function EditFee({ fee, onClose, decide }: { fee: any; onClose: () => void; decide: ReturnType<typeof useAction<[string, "accept" | "ignore", number | null, string | null], Record<string, unknown>>> }) {
  const [amount, setAmount] = useState(String(fee.amount));
  const [treatment, setTreatment] = useState(fee.treatment);
  return (
    <Dialog open onClose={onClose} title={`Edit ${humanize(fee.fee_type)} fee`} subtitle={fee.people?.full_name} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={decide.pending} onClick={() => decide.run(fee.id, "accept", Number(amount), treatment)}>Accept with changes</Button></>}>
      <div className="space-y-4">
        <Field label="Amount"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Paid as">
          <Select value={treatment} onChange={(e) => setTreatment(e.target.value)}>
            <option value="project_cost">Project cost (before the split)</option>
            <option value="from_share">From the partner’s own share</option>
          </Select>
        </Field>
      </div>
      {decide.error && <Callout tone="danger" className="mt-3">{decide.error.error}</Callout>}
    </Dialog>
  );
}
