import { getCompanyPosition, getExpenses, getProjectDistributions, getProjectFees, getProjectFunding, type getProject, type getProjectTechnology, type Lookups } from "@/services/queries";
import type { SettlementSnapshot } from "@/engines/settlement";
import { toNum } from "@/lib/format";
import { SettlementPanel } from "./SettlementPanel";

export async function SettlementTab({ projectId, orgId, data, tech, lookups, closed, canReopen, canClose }: {
  projectId: string; orgId: string; data: NonNullable<Awaited<ReturnType<typeof getProject>>>; tech: Awaited<ReturnType<typeof getProjectTechnology>>;
  lookups: Lookups; closed: boolean; canReopen: boolean; canClose: boolean;
}) {
  const [expenses, funding, fees, dist, pos] = await Promise.all([
    getExpenses(orgId, { projectId }), getProjectFunding(projectId), getProjectFees(projectId), getProjectDistributions(projectId), getCompanyPosition(orgId),
  ]);
  const m = data.metrics!;
  const dues = funding.dues;
  const byCat = (c: string) => dues.filter((d) => d.category === c && toNum(d.due) > 0).map((d) => ({ personId: d.person_id as string, name: d.people?.full_name as string, due: toNum(d.due) }));
  const accepted = fees.filter((f) => f.status === "accepted");

  const snapshot: SettlementSnapshot = {
    availableCash: m.settlementCash,
    suppliers: expenses.filter((e) => toNum(e.outstanding_egp) > 0).map((e) => ({
      expenseId: e.expense_id, label: [e.supplier_name, e.description].filter(Boolean).join(" — "), outstanding: toNum(e.outstanding_egp), dueDate: e.due_date })),
    employees: byCat("employee_reimbursement"),
    partnerFunding: byCat("funding"),
    companyFunding: toNum(data.fin?.company_funding_outstanding),
    fees: [
      ...byCat("fee").map((d) => ({ feeId: accepted.find((f) => f.person_id === d.personId)?.id ?? "", personId: d.personId, name: d.name,
        feeType: accepted.find((f) => f.person_id === d.personId)?.fee_type ?? "partner", amount: d.due, accepted: true, treatment: "project_cost" as const })),
      ...fees.filter((f) => f.status === "suggested").map((f) => ({ feeId: f.id, personId: f.person_id, name: f.people?.full_name, feeType: f.fee_type,
        amount: toNum(f.amount), accepted: false, treatment: f.treatment })),
    ],
    ctoDues: byCat("cto"),
    technologies: tech.usage.filter((u) => toNum(u.tech?.outstanding) > 0).map((u) => ({
      technologyId: u.technology_id, name: u.tech?.name, developerId: u.tech?.developer_person_id, developerName: u.tech?.developer_name,
      outstanding: toNum(u.tech?.outstanding), decision: u.recovery_decision, planned: u.planned_recovery === null ? null : toNum(u.planned_recovery) })),
    undistributedProfit: m.undistributedProfit,
    partners: lookups.partners.map((p) => ({ personId: p.id, name: p.full_name, sharePct: toNum(p.profit_share_pct), alreadyDistributed: dist.alreadyByPerson[p.id] ?? 0 })),
    reserve: { available: toNum(pos.available_reserve), target: toNum(pos.reserve_target) },
  };
  const checklist = {
    receivable: m.outstanding, unpaidSuppliers: snapshot.suppliers.reduce((a, s) => a + s.outstanding, 0),
    employees: snapshot.employees.reduce((a, s) => a + s.due, 0), partnerFunding: snapshot.partnerFunding.reduce((a, s) => a + s.due, 0),
    companyFunding: snapshot.companyFunding, fees: byCat("fee").reduce((a, s) => a + s.due, 0) + fees.filter((f) => f.status === "suggested").length,
    ctoPending: tech.usage.filter((u) => ["pending", "decide_at_settlement"].includes(u.recovery_decision) && toNum(u.tech?.outstanding) > 0).length,
    assets: expenses.filter((e) => e.expense_type === "owned_asset").length, undistributed: m.undistributedProfit,
    distributions: dist.distributions.length, losses: dist.losses.length,
  };
  return <SettlementPanel projectId={projectId} snapshot={snapshot} lookups={lookups} closed={closed} canReopen={canReopen} canClose={canClose}
    history={{ settlements: dist.settlements, distributions: dist.distributions, losses: dist.losses }} checklist={checklist} />;
}
