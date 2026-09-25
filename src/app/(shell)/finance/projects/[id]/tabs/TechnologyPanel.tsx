"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { removeProjectTechnology, reverseCtoRecovery, setProjectTechnology } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select } from "@/components/ui/Field";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { Callout } from "@/components/ui/Callout";
import { AllocateCtoDialog, TechnologyDialog } from "@/components/finance/forms";
import { date, humanize, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DECISIONS = [["pending", "Not decided"], ["add_recovery", "Add recovery"], ["decide_at_settlement", "Decide during settlement"], ["no_recovery", "No recovery from this project"]];

export function TechnologyPanel({ projectId, tech, lookups, closed }: { projectId: string; tech: { usage: any[]; allocations: any[] }; lookups: Lookups; closed: boolean }) {
  const [alloc, setAlloc] = useState<any>(null);
  const [assign, setAssign] = useState(false);
  const [create, setCreate] = useState(false);
  const [rev, setRev] = useState<any>(null);
  const decide = useAction(setProjectTechnology, { success: "Recovery decision saved" });
  const remove = useAction(removeProjectTechnology, { success: "Removed from project" });
  const reverse = useAction(reverseCtoRecovery, { success: "Recovery reversed", onSuccess: () => setRev(null) });
  const used = new Set(tech.usage.map((u) => u.technology_id));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Technologies used" subtitle="Reusable Move Beyond systems deployed on this project."
          actions={!closed && <>
            <Button size="sm" variant="ghost" onClick={() => setCreate(true)}>New technology from this project</Button>
            <Button size="sm" onClick={() => setAssign(true)}><Plus className="size-3.5" />Assign technology</Button>
          </>} />
        {tech.usage.length === 0 ? <EmptyState title="No technology assigned" body="Assign a reusable system to see its unrecovered CTO development value." /> : (
          <table className="w-full text-[13.5px]">
            <thead><tr className="border-b border-line bg-subtle text-[12px] text-ink-3">
              <th className="px-5 py-2 text-left font-medium">Technology</th><th className="px-3 py-2 text-right font-medium">Outstanding recovery</th>
              <th className="px-3 py-2 text-left font-medium">Status</th><th className="px-3 py-2 text-left font-medium">This project</th><th className="w-44" />
            </tr></thead>
            <tbody>
              {tech.usage.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5"><Link href={`/finance/cto/${u.technology_id}`} className="font-medium hover:underline">{u.tech?.name}</Link>
                    <p className="text-[12px] text-ink-3">Developer: {u.tech?.developer_name}</p></td>
                  <td className="px-3 py-2.5 text-right font-semibold"><Money value={u.tech?.outstanding} /></td>
                  <td className="px-3 py-2.5"><StatusBadge status={u.tech?.recovery_status} /></td>
                  <td className="px-3 py-2.5">
                    <Select className="h-8 w-56" disabled={closed || decide.pending} value={u.recovery_decision}
                      onChange={(e) => decide.run(projectId, u.technology_id, e.target.value, u.planned_recovery)}>
                      {DECISIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </Select>
                  </td>
                  <td className="px-5 text-right">
                    {!closed && toNum(u.tech?.outstanding) > 0 && <Button size="sm" variant="primary" onClick={() => setAlloc(u)}>Allocate</Button>}
                    {!closed && !tech.allocations.some((a) => a.technology_id === u.technology_id && a.status === "allocated") &&
                      <Button size="sm" variant="ghost" onClick={() => remove.run(projectId, u.technology_id)}>Remove</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader title="CTO development recovery from this project" subtitle="Separate from funding, fees and profit share." />
        {tech.allocations.length === 0 ? <EmptyState title="No recovery allocated yet" body="Allocate an exact amount now, or decide during settlement." /> : (
          <table className="w-full text-[13.5px]">
            <tbody>
              {tech.allocations.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 text-ink-3">{date(a.allocation_date)}</td>
                  <td className="px-3 py-2.5 font-medium">{a.technology_developments?.name}<span className="ml-2 text-[12px] font-normal text-ink-3">to {a.people?.full_name}</span></td>
                  <td className="px-3 py-2.5"><Badge>{a.treatment === "project_cost" ? "Project cost" : "From own share"}</Badge></td>
                  <td className="px-3 py-2.5"><StatusBadge status={a.status} /></td>
                  <td className="px-3 py-2.5 text-right font-semibold"><Money value={a.amount} className={a.status === "reversed" ? "line-through text-ink-4" : ""} /></td>
                  <td className="w-24 px-5 text-right">{!closed && a.status === "allocated" && <Button size="sm" variant="ghost" onClick={() => setRev(a)}>Reverse</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {alloc && <AllocateCtoDialog open onClose={() => setAlloc(null)} lookups={lookups} projectId={projectId} technologyId={alloc.technology_id}
        outstanding={toNum(alloc.tech?.outstanding)} techName={alloc.tech?.name} developer={alloc.tech?.developer_name} />}
      {assign && <AssignTech projectId={projectId} lookups={lookups} used={used} onClose={() => setAssign(false)} />}
      {create && <TechnologyDialog open onClose={() => setCreate(false)} lookups={lookups} originalProjectId={projectId} />}
      <ReasonDialog open={!!rev} onClose={() => setRev(null)} danger title="Reverse CTO recovery" confirmLabel="Reverse"
        description="The outstanding development value goes back up. Blocked if the recovery was already paid to the developer."
        pending={reverse.pending} error={reverse.error?.error} onConfirm={(r) => reverse.run(rev.id, r)} />
    </div>
  );
}

function AssignTech({ projectId, lookups, used, onClose }: { projectId: string; lookups: Lookups; used: Set<string>; onClose: () => void }) {
  const [tech, setTech] = useState("");
  const [decision, setDecision] = useState("decide_at_settlement");
  const t = lookups.technologies.find((x) => x.technology_id === tech);
  const { run, pending, error } = useAction(setProjectTechnology, { success: "Technology assigned", onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Assign technology" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!tech} loading={pending} onClick={() => run(projectId, tech, decision, null)}>Assign</Button></>}>
      <div className="space-y-4">
        <Field label="Technology">
          <Select value={tech} onChange={(e) => setTech(e.target.value)}>
            <option value="" disabled>Select…</option>
            {lookups.technologies.filter((x) => !used.has(x.technology_id)).map((x) => <option key={x.technology_id} value={x.technology_id}>{x.name}</option>)}
          </Select>
        </Field>
        {t && toNum(t.outstanding) > 0 && (
          <Callout tone="warn" title={`This project uses ${t.name}`}>
            Outstanding CTO development recovery: <b className="num">{toNum(t.outstanding).toLocaleString("en-US")} EGP</b> · Developer: {t.developer_name}
          </Callout>
        )}
        <Field label="Recovery from this project">
          <Select value={decision} onChange={(e) => setDecision(e.target.value)}>{DECISIONS.slice(1).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        <p className="text-[12px] text-ink-3">{humanize(decision)}: you can change this any time before closing.</p>
      </div>
      {error && <Callout tone="danger" className="mt-3">{error.error}</Callout>}
    </Dialog>
  );
}
