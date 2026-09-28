"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Lock, Unlock } from "lucide-react";
import { allocateLoss, closeProject, confirmSettlement, distributeProfit, reopenProject } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/Field";
import { Callout } from "@/components/ui/Callout";
import { Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { CashAccountSelect, today } from "@/components/finance/pickers";
import { cn } from "@/components/ui/cn";
import { planSettlement, unpaidObligationsAfter, type SettlementSnapshot } from "@/engines/settlement";
import { splitProfit } from "@/engines/profitSplit";
import { date, egp, humanize, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
const GROUP: Record<string, string> = {
  supplier: "1 · Supplier obligations", employee: "2 · Employee reimbursements", partner_funding: "3 · Partner funding",
  company_funding: "4 · Move Beyond funding recovery", fee: "5 · Partner / commercial fees", cto: "6 · CTO development recovery",
};

export function SettlementPanel({ projectId, marketing, snapshot, lookups, closed, canReopen, canClose, history, checklist }: {
  projectId: string; marketing?: boolean; snapshot: SettlementSnapshot; lookups: Lookups; closed: boolean; canReopen: boolean; canClose: boolean;
  history: { settlements: any[]; distributions: any[]; losses: any[] }; checklist: Record<string, number>;
}) {
  const [overrides, setOverrides] = useState<Record<string, { amount?: number; selected?: boolean }>>({});
  const [cash, setCash] = useState(lookups.cashAccounts.find((c) => c.is_default)?.id ?? "");
  const [d, setD] = useState(today());
  const plan = useMemo(() => planSettlement(snapshot, overrides), [snapshot, overrides]);
  const selected = plan.lines.filter((l) => l.selected && l.suggested > 0);
  const settle = useAction(confirmSettlement, { success: (r) => `Settlement recorded · ${egp(r.total_paid)} paid`, onSuccess: () => setOverrides({}) });
  const allSelected = plan.lines.length > 0 && plan.lines.every((l) => l.selected);

  const setAll = (on: boolean) => setOverrides(Object.fromEntries(plan.lines.map((l) => [l.key, { ...overrides[l.key], selected: on }])));
  const submit = () => settle.run(projectId, {
    date: d, cash_account_id: cash, available_cash: plan.availableCash,
    lines: selected.map((l) => ({ line_type: l.lineType, amount: l.suggested, suggested_amount: l.due, label: l.label, person_id: l.personId,
      expense_id: l.expenseId, fee_id: l.feeId, technology_id: l.technologyId, treatment: l.treatment })),
  });

  if (closed) return <ClosedState projectId={projectId} canReopen={canReopen} history={history} />;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Settlement checklist" subtitle="Recommended order. Tick, edit amounts, or pay partially — you stay in control."
            actions={plan.lines.length > 0 && <Checkbox label="Select all" checked={allSelected} onChange={(e) => setAll(e.target.checked)} />} />
          {plan.lines.length === 0 ? (
            <CardBody><Callout tone="success" title="No obligations outstanding">Everything owed on this project is paid. Continue to profit distribution below.</Callout></CardBody>
          ) : (
            <div>
              {plan.lines.map((l, i) => {
                const g = GROUP[l.lineType];
                const header = i === 0 || GROUP[plan.lines[i - 1].lineType] !== g
                  ? <p key={g + "h"} className="border-b border-line bg-subtle px-5 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{g}</p> : null;
                return (
                  <div key={l.key}>
                    {header}
                    <div className={cn("flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-0", !l.selected && "opacity-55")}>
                      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={l.selected}
                        onChange={(e) => setOverrides({ ...overrides, [l.key]: { ...overrides[l.key], selected: e.target.checked } })} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium">{l.label}</p>
                        <p className="text-[12px] text-ink-3">{l.technologyId ? "Maximum outstanding" : "Due"} {egp(l.due)}{l.note ? ` · ${l.note}` : ""}</p>
                      </div>
                      <Input type="number" className="h-8 w-36" value={String(l.suggested)} disabled={!l.selected}
                        onChange={(e) => setOverrides({ ...overrides, [l.key]: { ...overrides[l.key], amount: Number(e.target.value || 0), selected: true } })} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Cash" />
            <CardBody className="py-2">
              <DefinitionList items={[
                { label: "Available for settlement", value: <Money value={plan.availableCash} />, hint: "incl. Move Beyond funding" },
                { label: "Selected payments", value: <Money value={-plan.suggestedTotal} signed /> },
                { label: "Cash after obligations", value: <Money value={plan.cashAfterObligations} />, strong: true },
              ]} />
            </CardBody>
          </Card>
          {plan.warnings.map((w, i) => <Callout key={i} tone="warn">{w}</Callout>)}
          {selected.length > 0 && (
            <Card>
              <CardBody className="space-y-3">
                <Field label="Paid from"><CashAccountSelect lookups={lookups} value={cash} onChange={setCash} /></Field>
                <Field label="Settlement date"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
                <Button variant="primary" className="w-full" loading={settle.pending} onClick={submit}>Confirm {selected.length} payment{selected.length > 1 ? "s" : ""} · {egp(plan.suggestedTotal)}</Button>
                <p className="text-[12px] text-ink-3">All selected payments succeed together or none do.</p>
                {settle.error && <Callout tone="danger">{settle.error.error}</Callout>}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {plan.remainingProfit < 0 && marketing ? (
        <Callout tone="info" title="Sponsorship / marketing investment">This project&rsquo;s net cost of {egp(-snapshot.undistributedProfit)} is Move Beyond&rsquo;s planned marketing investment — no partner loss allocation is needed.</Callout>
      ) : plan.remainingProfit < 0 ? <LossAllocation projectId={projectId} loss={-snapshot.undistributedProfit} partners={snapshot.partners} />
        : <ProfitDistribution projectId={projectId} plan={plan} snapshot={snapshot} lookups={lookups} unpaid={unpaidObligationsAfter(plan)} />}

      <Closure projectId={projectId} checklist={marketing ? { ...checklist, companyFunding: 0, losses: 1 } : checklist} canClose={canClose} />
      <History history={history} />
    </div>
  );
}

function ProfitDistribution({ projectId, plan, snapshot, lookups, unpaid }: { projectId: string; plan: ReturnType<typeof planSettlement>; snapshot: SettlementSnapshot; lookups: Lookups; unpaid: number }) {
  const [retain, setRetain] = useState<string>(String(plan.reserveRecommendation));
  const [total, setTotal] = useState<string>("");
  const [reinvest, setReinvest] = useState<Record<string, string>>({});
  const [payNow, setPayNow] = useState(false);
  const [cash, setCash] = useState(lookups.cashAccounts.find((c) => c.is_default)?.id ?? "");
  const [warn, setWarn] = useState<string | null>(null);
  const distributable = total !== "" ? Math.max(Number(total), 0) : Math.max(Math.min(plan.remainingProfit - Number(retain || 0), plan.cashAfterObligations), 0);
  const split = splitProfit(distributable, snapshot.partners);
  const [lines, setLines] = useState<Record<string, string>>({});
  const amountOf = (id: string) => (lines[id] !== undefined ? Number(lines[id] || 0) : split.find((s) => s.personId === id)?.amount ?? 0);
  const sum = snapshot.partners.reduce((a, p) => a + amountOf(p.personId), 0);
  const dist = useAction(distributeProfit, { success: "Profit distribution recorded", onSuccess: () => { setWarn(null); setLines({}); setReinvest({}); } });

  const run = (ack: boolean) => dist.run(projectId, {
    retained_by_company: Number(retain || 0), pay_now: payNow, cash_account_id: cash, acknowledge_unpaid: ack,
    lines: snapshot.partners.map((p) => ({ person_id: p.personId, share_pct: p.sharePct, amount: amountOf(p.personId), reinvested: Number(reinvest[p.personId] || 0) })),
  }).then((r) => { if (!r.ok && r.kind === "warning") setWarn(r.error); });

  return (
    <Card>
      <CardHeader title="Profit & distribution" subtitle="Steps 7–9: remaining profit, company reserve, partner distribution." />
      <CardBody>
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div>
            <DefinitionList items={[
              { label: "Undistributed project profit", value: <Money value={snapshot.undistributedProfit} /> },
              { label: "After new fees / CTO in this plan", value: <Money value={plan.remainingProfit} />, strong: true },
              { label: "Company reserve", value: <span className={plan.reserveShortfall > 0 ? "text-warn" : "text-pos"}>{plan.reserveShortfall > 0 ? `${egp(plan.reserveShortfall)} below target` : "At or above target"}</span> },
            ]} />
            <Field label="Keep in company (reserve)" className="mt-3" hint={plan.reserveRecommendation > 0 ? `Recommended ${egp(plan.reserveRecommendation)}` : "Not undistributed profit — stays in the company."}>
              <Input type="number" min="0" value={retain} onChange={(e) => { setRetain(e.target.value); setTotal(""); setLines({}); }} />
            </Field>
            <Field label="Amount to distribute now" className="mt-3" hint={`Suggested ${egp(Math.max(Math.min(plan.remainingProfit - Number(retain || 0), plan.cashAfterObligations), 0))} (limited by profit and cash)`}>
              <Input type="number" min="0" value={total === "" ? String(distributable) : total} onChange={(e) => { setTotal(e.target.value); setLines({}); }} />
            </Field>
          </div>
          <div>
            <table className="w-full text-[13.5px]">
              <thead><tr className="border-b border-line text-[12px] text-ink-3">
                <th className="py-2 text-left font-medium">Partner</th><th className="py-2 text-right font-medium">Share</th>
                <th className="py-2 text-right font-medium">Entitlement</th><th className="py-2 text-right font-medium">Reinvest in company</th><th className="py-2 text-right font-medium">Cash payout</th>
              </tr></thead>
              <tbody>
                {snapshot.partners.map((p) => (
                  <tr key={p.personId} className="border-b border-line">
                    <td className="py-2 font-medium">{p.name}{p.alreadyDistributed ? <span className="ml-2 text-[12px] font-normal text-ink-3">already {egp(p.alreadyDistributed)}</span> : null}</td>
                    <td className="py-2 text-right text-ink-2">{p.sharePct}%</td>
                    <td className="py-2 text-right"><Input type="number" className="ml-auto h-8 w-32" value={String(amountOf(p.personId))} onChange={(e) => setLines({ ...lines, [p.personId]: e.target.value })} /></td>
                    <td className="py-2 text-right"><Input type="number" className="ml-auto h-8 w-32" placeholder="0" value={reinvest[p.personId] ?? ""} onChange={(e) => setReinvest({ ...reinvest, [p.personId]: e.target.value })} /></td>
                    <td className="num py-2 text-right font-semibold"><Money value={amountOf(p.personId) - Number(reinvest[p.personId] || 0)} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-semibold"><td className="py-2">Total</td><td /><td className="num py-2 text-right"><Money value={sum} /></td>
                <td className="num py-2 text-right"><Money value={Object.values(reinvest).reduce((a, v) => a + Number(v || 0), 0)} /></td><td /></tr></tfoot>
            </table>
            <p className="mt-2 text-[12px] text-ink-3">Reinvested profit becomes Partner Reinvestment / Company Reserve Contribution — not an expense.</p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Checkbox label="Pay the cash payouts now" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
              {payNow && <div className="w-64"><CashAccountSelect lookups={lookups} value={cash} onChange={setCash} /></div>}
              <Button variant="primary" className="ml-auto" disabled={!(sum > 0)} loading={dist.pending} onClick={() => run(false)}>Record distribution · {egp(sum)}</Button>
            </div>
            {unpaid > 0 && <p className="mt-2 text-[12.5px] text-warn">{egp(unpaid)} of obligations would still be unpaid.</p>}
            {dist.error && dist.error.kind !== "warning" && <Callout tone="danger" className="mt-3">{dist.error.error}</Callout>}
          </div>
        </div>
      </CardBody>
      <Dialog open={!!warn} onClose={() => setWarn(null)} title="Warning" size="sm"
        footer={<><Button variant="secondary" onClick={() => setWarn(null)}>Review obligations</Button>
          <Button variant="danger" loading={dist.pending} onClick={() => run(true)}>Continue anyway</Button></>}>
        <div className="flex gap-3"><AlertTriangle className="size-5 shrink-0 text-warn" /><p className="text-sm"><b>{warn}</b> Distributing profit now means those obligations must be paid from other money later.</p></div>
      </Dialog>
    </Card>
  );
}

function LossAllocation({ projectId, loss, partners }: { projectId: string; loss: number; partners: SettlementSnapshot["partners"] }) {
  const init = Object.fromEntries(partners.map((p) => [p.personId, String(Math.round((loss * p.sharePct) / 100))]));
  const [amounts, setAmounts] = useState<Record<string, string>>(init);
  const [company, setCompany] = useState("0");
  const [notes, setNotes] = useState("");
  const { run, pending, error } = useAction(allocateLoss, { success: "Loss allocated" });
  const sum = Object.values(amounts).reduce((a, v) => a + Number(v || 0), 0) + Number(company || 0);
  return (
    <Card className="border-neg/25">
      <CardHeader title="Loss allocation" subtitle={`This project has a loss of ${egp(loss)}. Partner shares are netted against future payouts.`} />
      <CardBody>
        <div className="grid max-w-2xl gap-3 md:grid-cols-3">
          {partners.map((p) => <Field key={p.personId} label={p.name}><Input type="number" value={amounts[p.personId]} onChange={(e) => setAmounts({ ...amounts, [p.personId]: e.target.value })} /></Field>)}
          <Field label="Move Beyond absorbs"><Input type="number" value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          <Field label="Notes" className="md:col-span-3"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <span className={cn("num text-sm", Math.abs(sum - loss) > 0.5 ? "text-warn" : "text-ink-3")}>Allocated {egp(sum)} of {egp(loss)}</span>
          <Button variant="primary" loading={pending} disabled={sum <= 0 || sum > loss + 0.5}
            onClick={() => run(projectId, [...partners.map((p) => ({ person_id: p.personId, amount: Number(amounts[p.personId] || 0) })), { person_id: null, amount: Number(company || 0) }].filter((l) => l.amount > 0), notes || null)}>
            Allocate loss</Button>
        </div>
        {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
      </CardBody>
    </Card>
  );
}

function Closure({ projectId, checklist, canClose }: { projectId: string; checklist: Record<string, number>; canClose: boolean }) {
  const [issues, setIssues] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const close = useAction(closeProject, { onSuccess: (r) => { if (!r.closed) setIssues(r.issues); else setIssues(null); }, success: (r) => (r.closed ? "Project financially closed" : "Checklist has open items") });
  const items: [string, boolean][] = [
    ["Client contract finalized", true],
    ["Collections reconciled", checklist.receivable <= 0],
    ["Discounts finalized", true],
    ["Suppliers finalized", checklist.unpaidSuppliers <= 0],
    ["Employee reimbursements finalized", checklist.employees <= 0],
    ["Partner funding finalized", checklist.partnerFunding <= 0],
    ["Move Beyond funding recovered", checklist.companyFunding <= 0],
    ["Partner fees finalized", checklist.fees <= 0],
    ["CTO Development Recovery assigned", checklist.ctoPending === 0],
    ["Assets registered", true],
    ["Profit calculated", true],
    ["Profit distribution recorded", checklist.undistributed <= 0.5 && (checklist.distributions > 0 || checklist.undistributed === 0 || checklist.losses > 0)],
    ["Loss allocated if applicable", checklist.undistributed >= -0.5 || checklist.losses > 0],
  ];
  const done = items.filter(([, ok]) => ok).length;
  return (
    <Card>
      <CardHeader title="Financial closure" subtitle={`${done} of ${items.length} checks complete`} />
      <CardBody>
        <ul className="grid gap-x-8 gap-y-1.5 md:grid-cols-2">
          {items.map(([label, ok]) => (
            <li key={label} className="flex items-center gap-2 text-[13.5px]">
              {ok ? <CheckCircle2 className="size-4 text-pos" /> : <Circle className="size-4 text-ink-4" />}<span className={ok ? "text-ink" : "text-ink-2"}>{label}</span>
            </li>
          ))}
        </ul>
        {issues && issues.length > 0 && (
          <Callout tone="warn" className="mt-4" title="Open items">
            <ul className="list-disc pl-4">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
            <Field label="Close anyway — reason (recorded as an override)" className="mt-3"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </Callout>
        )}
        {canClose && (
          <div className="mt-4 flex justify-end">
            <Button variant="primary" loading={close.pending} disabled={issues !== null && issues.length > 0 && reason.trim().length < 3}
              onClick={() => close.run(projectId, Object.fromEntries(items.map(([l, ok]) => [l, ok])), issues?.length ? reason : null)}>
              <Lock className="size-4" />{issues?.length ? "Close with override" : "Mark financially closed"}</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ClosedState({ projectId, canReopen, history }: { projectId: string; canReopen: boolean; history: { settlements: any[]; distributions: any[]; losses: any[] } }) {
  const [open, setOpen] = useState(false);
  const reopen = useAction(reopenProject, { success: "Project reopened", onSuccess: () => setOpen(false) });
  return (
    <div className="space-y-6">
      <Callout tone="success" title="Financially closed" action={canReopen && <Button size="sm" onClick={() => setOpen(true)}><Unlock className="size-3.5" />Reopen</Button>}>
        No new transactions can be posted. Reopening requires a reason and is audited.
      </Callout>
      <History history={history} />
      <ReasonDialog open={open} onClose={() => setOpen(false)} title="Reopen closed project" confirmLabel="Reopen" pending={reopen.pending} error={reopen.error?.error}
        description="Only partners and authorized admins can reopen." onConfirm={(r) => reopen.run(projectId, r)} />
    </div>
  );
}

function History({ history }: { history: { settlements: any[]; distributions: any[]; losses: any[] } }) {
  if (!history.settlements.length && !history.distributions.length && !history.losses.length) return null;
  return (
    <Card>
      <CardHeader title="Settlement history" />
      <ul className="divide-y divide-line">
        {history.settlements.map((s) => (
          <li key={s.id} className="px-5 py-3 text-[13.5px]">
            <div className="flex items-center gap-2"><Badge tone="info">Settlement</Badge><span className="text-ink-3">{date(s.settlement_date)}</span><b className="num ml-auto">{egp(s.total_paid)}</b></div>
            <p className="mt-1 text-[12.5px] text-ink-3">{s.settlement_lines?.map((l: any) => `${l.label ?? humanize(l.line_type)} ${toNum(l.amount).toLocaleString("en-US")}`).join(" · ")}</p>
          </li>
        ))}
        {history.distributions.map((d) => (
          <li key={d.id} className="px-5 py-3 text-[13.5px]">
            <div className="flex items-center gap-2"><Badge tone="pos">Profit distribution</Badge><span className="text-ink-3">{date(d.distribution_date)}</span>
              {toNum(d.obligations_unpaid_snapshot) > 0 && <Badge tone="warn">{egp(d.obligations_unpaid_snapshot)} unpaid at the time</Badge>}<b className="num ml-auto">{egp(d.total_amount)}</b></div>
            <p className="mt-1 text-[12.5px] text-ink-3">{d.profit_distribution_lines?.map((l: any) => `${l.people?.full_name} ${toNum(l.amount).toLocaleString("en-US")}${toNum(l.reinvested) ? ` (reinvested ${toNum(l.reinvested).toLocaleString("en-US")})` : ""}`).join(" · ")}</p>
          </li>
        ))}
        {history.losses.map((l) => (
          <li key={l.id} className="px-5 py-3 text-[13.5px]">
            <div className="flex items-center gap-2"><Badge tone="neg">Loss allocation</Badge><span className="text-ink-3">{date(l.allocation_date)}</span><b className="num ml-auto">{egp(l.loss_amount)}</b></div>
            <p className="mt-1 text-[12.5px] text-ink-3">{l.loss_allocation_lines?.map((x: any) => `${x.people?.full_name ?? "Move Beyond"} ${toNum(x.amount).toLocaleString("en-US")}`).join(" · ")}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
