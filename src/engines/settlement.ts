import { clampMin0, round2, sum } from "./money";
import { splitProfit, type PartnerShare, type SplitLine } from "./profitSplit";

export type SettlementLineType =
  | "supplier"
  | "employee"
  | "partner_funding"
  | "company_funding"
  | "fee"
  | "cto";

/** Default settlement order (spec §60). Profit, reserve and distribution follow. */
export const SETTLEMENT_PRIORITY: SettlementLineType[] = [
  "supplier",
  "employee",
  "partner_funding",
  "company_funding",
  "fee",
  "cto",
];

export interface SettlementSnapshot {
  /** Project cash incl. Move Beyond's own outstanding funding (see computeProjectMetrics.settlementCash). */
  availableCash: number;
  suppliers: { expenseId: string; label: string; outstanding: number; dueDate?: string | null }[];
  employees: { personId: string; name: string; due: number }[];
  partnerFunding: { personId: string; name: string; due: number }[];
  companyFunding: number;
  /** Accepted-but-unpaid fees (due) and suggestions not yet accepted. */
  fees: { feeId: string; personId: string; name: string; feeType: string; amount: number; accepted: boolean; treatment: "project_cost" | "from_share" }[];
  /** CTO recovery already allocated to this project but not yet paid. */
  ctoDues: { personId: string; name: string; due: number }[];
  /** Reusable technology used by this project with unrecovered value (spec §51–53). */
  technologies: {
    technologyId: string;
    name: string;
    developerId: string;
    developerName: string;
    outstanding: number;
    decision: "pending" | "add_recovery" | "decide_at_settlement" | "no_recovery";
    planned?: number | null;
  }[];
  /** Project profit not yet distributed (before this settlement's new fees / CTO). */
  undistributedProfit: number;
  partners: PartnerShare[];
  reserve: { available: number; target: number };
}

export interface SuggestedLine {
  key: string;
  lineType: SettlementLineType;
  label: string;
  /** What is owed (or the maximum for CTO). */
  due: number;
  /** Amount the engine proposes, limited by the cash left at this point in the order. */
  suggested: number;
  selected: boolean;
  personId?: string;
  expenseId?: string;
  feeId?: string;
  technologyId?: string;
  treatment?: "project_cost" | "from_share";
  /** New cost booked by this line (accepting a fee / allocating CTO) that reduces profit. */
  addsProjectCost: boolean;
  note?: string;
}

export interface SettlementPlan {
  availableCash: number;
  lines: SuggestedLine[];
  obligationsTotal: number;
  suggestedTotal: number;
  cashAfterObligations: number;
  /** Profit left after new fees/CTO booked by this plan (spec §60 step 7). */
  remainingProfit: number;
  /** Company reserve recommendation (step 8): amount to leave undistributed. */
  reserveRecommendation: number;
  reserveShortfall: number;
  /** Suggested distribution (step 9), limited by both profit and cash. */
  distributable: number;
  distribution: SplitLine[];
  warnings: string[];
}

/**
 * Build the recommended settlement. Pure and deterministic: the UI shows it,
 * the user edits amounts or unticks lines, and `recomputeWithOverrides` keeps
 * the downstream numbers honest.
 */
export function planSettlement(s: SettlementSnapshot, overrides: Record<string, { amount?: number; selected?: boolean }> = {}): SettlementPlan {
  let cash = clampMin0(s.availableCash);
  const lines: SuggestedLine[] = [];
  const warnings: string[] = [];

  const push = (l: Omit<SuggestedLine, "suggested" | "selected">, cap?: number) => {
    const o = overrides[l.key];
    const auto = Math.min(l.due, cash, cap ?? Number.POSITIVE_INFINITY);
    const suggested = round2(Math.max(o?.amount ?? auto, 0));
    const selected = o?.selected ?? suggested > 0;
    lines.push({ ...l, suggested, selected });
    if (selected) cash = round2(cash - suggested);
  };

  for (const x of s.suppliers.filter((x) => x.outstanding > 0)) {
    push({ key: `supplier:${x.expenseId}`, lineType: "supplier", label: x.label, due: x.outstanding, expenseId: x.expenseId, addsProjectCost: false });
  }
  for (const x of s.employees.filter((x) => x.due > 0)) {
    push({ key: `employee:${x.personId}`, lineType: "employee", label: `${x.name} reimbursement`, due: x.due, personId: x.personId, addsProjectCost: false });
  }
  for (const x of s.partnerFunding.filter((x) => x.due > 0)) {
    push({ key: `funding:${x.personId}`, lineType: "partner_funding", label: `${x.name} funding`, due: x.due, personId: x.personId, addsProjectCost: false });
  }
  if (s.companyFunding > 0) {
    push({ key: "company_funding", lineType: "company_funding", label: "Move Beyond funding", due: s.companyFunding, addsProjectCost: false,
      note: "Recovery is a memo — the money is already in the company account." });
  }

  // Profit headroom shrinks as new fees / CTO allocations are booked.
  let profitHeadroom = s.undistributedProfit;
  const fromShare: Record<string, number> = {};
  for (const f of s.fees.filter((f) => f.amount > 0)) {
    const addsCost = !f.accepted && f.treatment === "project_cost";
    push({
      key: `fee:${f.feeId}`, lineType: "fee", label: `${f.name} ${f.feeType.replace(/_/g, " ")} fee`, due: f.amount,
      personId: f.personId, feeId: f.feeId, treatment: f.treatment, addsProjectCost: addsCost,
      note: f.accepted ? undefined : "Suggested — accepting it books the fee.",
    });
    const line = lines[lines.length - 1];
    // Booking a new fee consumes undistributed profit whatever its treatment:
    // project_cost as a cost, from_share as part of that partner's distribution.
    if (!f.accepted && line.selected) {
      profitHeadroom = round2(profitHeadroom - line.suggested);
      if (f.treatment === "from_share") fromShare[f.personId] = round2((fromShare[f.personId] ?? 0) + line.suggested);
    }
  }
  for (const c of s.ctoDues.filter((c) => c.due > 0)) {
    push({ key: `cto_due:${c.personId}`, lineType: "cto", label: `${c.name} CTO recovery (allocated)`, due: c.due, personId: c.personId, addsProjectCost: false });
  }
  for (const t of s.technologies.filter((t) => t.outstanding > 0 && t.decision !== "no_recovery")) {
    // Spec §53: suggest up to the outstanding value, but never more than the
    // cash left or the profit the project can support.
    const cap = Math.max(Math.min(profitHeadroom, t.planned && t.planned > 0 ? t.planned : Number.POSITIVE_INFINITY), 0);
    push(
      {
        key: `tech:${t.technologyId}`, lineType: "cto", label: `${t.developerName} CTO recovery — ${t.name}`, due: t.outstanding,
        personId: t.developerId, technologyId: t.technologyId, treatment: "project_cost", addsProjectCost: true,
        note: `Outstanding ${t.outstanding.toLocaleString("en-US")} EGP. Unrecovered balance carries forward automatically.`,
      },
      cap,
    );
    const line = lines[lines.length - 1];
    if (line.selected) profitHeadroom = round2(profitHeadroom - line.suggested);
  }

  const selectedLines = lines.filter((l) => l.selected);
  const suggestedTotal = sum(selectedLines.map((l) => l.suggested));
  const obligationsTotal = sum(lines.map((l) => (l.technologyId ? 0 : l.due)));
  const unpaidAfter = round2(obligationsTotal - sum(selectedLines.filter((l) => !l.technologyId).map((l) => l.suggested)));
  const cashAfter = clampMin0(round2(s.availableCash - suggestedTotal));
  if (suggestedTotal > s.availableCash + 0.005) {
    warnings.push(`Selected payments exceed available project cash by ${(suggestedTotal - s.availableCash).toLocaleString("en-US")} EGP.`);
  }
  for (const l of selectedLines) {
    if (l.suggested > l.due + 0.005) warnings.push(`${l.label}: amount is above what is due (${l.due.toLocaleString("en-US")} EGP).`);
  }
  if (unpaidAfter > 0) warnings.push(`${unpaidAfter.toLocaleString("en-US")} EGP of project obligations remain unpaid.`);

  const remainingProfit = round2(profitHeadroom);
  const reserveShortfall = clampMin0(s.reserve.target - s.reserve.available);
  const reserveRecommendation = round2(Math.min(reserveShortfall, Math.max(remainingProfit, 0)));
  const distributable = clampMin0(Math.min(remainingProfit - reserveRecommendation, cashAfter));
  if (remainingProfit < 0) warnings.push("Project is in a loss position — allocate the loss instead of distributing profit.");

  return {
    availableCash: s.availableCash,
    lines,
    obligationsTotal,
    suggestedTotal,
    cashAfterObligations: cashAfter,
    remainingProfit,
    reserveRecommendation,
    reserveShortfall,
    distributable,
    distribution: splitProfit(
      distributable,
      s.partners.map((p) => ({ ...p, alreadyDistributed: round2(p.alreadyDistributed + (fromShare[p.personId] ?? 0)) })),
    ),
    warnings,
  };
}

/** Unpaid obligations if the user distributes profit now (spec §77 warning). */
export function unpaidObligationsAfter(plan: SettlementPlan): number {
  const owed = plan.lines.filter((l) => !l.technologyId);
  return clampMin0(sum(owed.map((l) => l.due)) - sum(owed.filter((l) => l.selected).map((l) => l.suggested)));
}
