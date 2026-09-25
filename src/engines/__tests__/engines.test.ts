import { describe, expect, it } from "vitest";
import { splitByPercent, round2 } from "../money";
import { computeProjectMetrics, profitLabel, type ProjectAggregates } from "../projectFinancials";
import { splitProfit } from "../profitSplit";
import { planSettlement, unpaidObligationsAfter, type SettlementSnapshot } from "../settlement";
import { buildPartnerAccount, type PersonBalanceRow } from "../partnerAccount";
import { summarizeCollections } from "../collections";
import { forecastCash } from "../cashflow";
import { recoveryStatus, suggestRecovery, validateRecovery, remainingAfter } from "../ctoRecovery";

const agg = (o: Partial<ProjectAggregates>): ProjectAggregates => ({
  contract_value: 0, collected: 0, receivable_outstanding: 0, overdue: 0, actual_cost: 0, committed_cost: 0,
  remaining_commitments: 0, uncommitted_estimates: 0, estimated_cost: 0, fee_cost: 0, suggested_fees: 0, cto_cost: 0,
  planned_cto: 0, distributed: 0, cash_position: 0, company_funding_outstanding: 0, ...o,
});

describe("money", () => {
  it("splits exactly, even with odd cents", () => {
    expect(splitByPercent(100, [50, 50])).toEqual([50, 50]);
    expect(splitByPercent(100.01, [50, 50]).reduce((a, b) => a + b, 0)).toBeCloseTo(100.01, 2);
    expect(splitByPercent(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });
  it("rounds to 2dp", () => expect(round2(0.1 + 0.2)).toBe(0.3));
});

describe("project metrics (spec §59, §63–64)", () => {
  it("gross profit, CTO shown separately, remaining margin", () => {
    const m = computeProjectMetrics(agg({ contract_value: 300000, collected: 300000, actual_cost: 150000, cto_cost: 20000 }));
    expect(m.grossProfit).toBe(150000);
    expect(m.distributableProfit).toBe(130000);
    expect(m.grossMarginPct).toBe(50);
  });
  it("forecast uses committed cost, not just cash paid (spec §39)", () => {
    const m = computeProjectMetrics(agg({ contract_value: 500000, collected: 500000, actual_cost: 75000, remaining_commitments: 75000 }));
    expect(m.actualProfit).toBe(425000);
    expect(m.forecastProfit).toBe(350000);
  });
  it("actual vs forecast can diverge (spec §64 example)", () => {
    const m = computeProjectMetrics(agg({ contract_value: 400000, collected: 400000, actual_cost: 150000, remaining_commitments: 110000 }));
    expect(m.actualProfit).toBe(250000);
    expect(m.forecastProfit).toBe(140000);
  });
  it("forecast subtracts suggested fees and planned CTO recovery", () => {
    const m = computeProjectMetrics(agg({ contract_value: 100000, suggested_fees: 10000, planned_cto: 5000 }));
    expect(m.forecastProfit).toBe(85000);
  });
  it("settlement cash includes Move Beyond's outstanding funding (E3)", () => {
    const m = computeProjectMetrics(agg({ cash_position: 400000, company_funding_outstanding: 100000 }));
    expect(m.settlementCash).toBe(500000);
  });
  it("zero-revenue sponsorship is a marketing investment, not a failure (spec §16)", () => {
    const m = computeProjectMetrics(agg({ actual_cost: 50000, is_marketing_investment: true }));
    expect(profitLabel(m)).toBe("marketing_investment");
    expect(profitLabel(computeProjectMetrics(agg({ actual_cost: 50000 })))).toBe("loss");
  });
  it("budget variance uses committed + estimates", () => {
    const m = computeProjectMetrics(agg({ budget_amount: 100000, committed_cost: 108000 }));
    expect(m.budgetVariance).toBe(-8000);
  });
});

describe("profit split (spec §65, D3)", () => {
  const partners = [
    { personId: "w", name: "Wahid", sharePct: 50, alreadyDistributed: 0 },
    { personId: "b", name: "Belal", sharePct: 50, alreadyDistributed: 0 },
  ];
  it("defaults to 50/50", () => {
    expect(splitProfit(200000, partners).map((l) => l.amount)).toEqual([100000, 100000]);
  });
  it("accounts for a from-share item already taken by one partner", () => {
    const lines = splitProfit(90000, [{ ...partners[0], alreadyDistributed: 10000 }, partners[1]]);
    expect(lines.map((l) => l.amount)).toEqual([40000, 50000]);
  });
  it("configurable split", () => {
    expect(splitProfit(100, [{ ...partners[0], sharePct: 60 }, { ...partners[1], sharePct: 40 }]).map((l) => l.amount)).toEqual([60, 40]);
  });
});

const baseSnapshot = (o: Partial<SettlementSnapshot> = {}): SettlementSnapshot => ({
  availableCash: 500000, suppliers: [], employees: [], partnerFunding: [], companyFunding: 0, fees: [], ctoDues: [],
  technologies: [], undistributedProfit: 0,
  partners: [
    { personId: "w", name: "Wahid", sharePct: 50, alreadyDistributed: 0 },
    { personId: "b", name: "Belal", sharePct: 50, alreadyDistributed: 0 },
  ],
  reserve: { available: 200000, target: 100000 }, ...o,
});

describe("settlement engine (spec §60, §74–77)", () => {
  it("orders lines by the default priority", () => {
    const plan = planSettlement(baseSnapshot({
      suppliers: [{ expenseId: "e1", label: "Supplier ABC", outstanding: 50000 }],
      employees: [{ personId: "emp", name: "Employee", due: 3000 }],
      partnerFunding: [{ personId: "w", name: "Wahid", due: 70000 }, { personId: "b", name: "Belal", due: 30000 }],
      companyFunding: 80000,
      fees: [
        { feeId: "f1", personId: "w", name: "Wahid", feeType: "management", amount: 40000, accepted: true, treatment: "project_cost" },
        { feeId: "f2", personId: "b", name: "Belal", feeType: "lead_generation", amount: 40000, accepted: true, treatment: "project_cost" },
      ],
      technologies: [{ technologyId: "t", name: "Padel Platform", developerId: "w", developerName: "Wahid", outstanding: 40000, decision: "decide_at_settlement", planned: 10000 }],
      undistributedProfit: 200000,
    }));
    expect(plan.lines.map((l) => l.lineType)).toEqual([
      "supplier", "employee", "partner_funding", "partner_funding", "company_funding", "fee", "fee", "cto",
    ]);
    expect(plan.lines.map((l) => l.suggested)).toEqual([50000, 3000, 70000, 30000, 80000, 40000, 40000, 10000]); // §75 checklist
  });

  it("limits suggestions by the cash left (partial settlement)", () => {
    const plan = planSettlement(baseSnapshot({
      availableCash: 60000,
      suppliers: [{ expenseId: "e1", label: "Supplier", outstanding: 50000 }],
      partnerFunding: [{ personId: "w", name: "Wahid", due: 70000 }],
    }));
    expect(plan.lines[1].suggested).toBe(10000);
    expect(unpaidObligationsAfter(plan)).toBe(60000);
    expect(plan.warnings.join(" ")).toMatch(/60,000 EGP of project obligations remain unpaid/);
  });

  it("honours manual overrides and deselection", () => {
    const snap = baseSnapshot({ partnerFunding: [{ personId: "w", name: "Wahid", due: 70000 }] });
    const plan = planSettlement(snap, { "funding:w": { amount: 30000 } });
    expect(plan.lines[0].suggested).toBe(30000);
    const off = planSettlement(snap, { "funding:w": { selected: false } });
    expect(off.lines[0].selected).toBe(false);
    expect(off.suggestedTotal).toBe(0);
  });

  it("§113 Padel #2: suggests CTO recovery up to what the project affords", () => {
    const tech = { technologyId: "t", name: "Padel Tournament Platform", developerId: "w", developerName: "Wahid", outstanding: 50000, decision: "decide_at_settlement" as const };
    const rich = planSettlement(baseSnapshot({ availableCash: 150000, undistributedProfit: 150000, technologies: [tech] }));
    expect(rich.lines[0].suggested).toBe(50000);                      // full outstanding (§53)
    const poor = planSettlement(baseSnapshot({ availableCash: 150000, undistributedProfit: 10000, technologies: [tech] }));
    expect(poor.lines[0].suggested).toBe(10000);                      // capped by profit
    const edited = planSettlement(baseSnapshot({ availableCash: 150000, undistributedProfit: 150000, technologies: [tech] }), { "tech:t": { amount: 10000 } });
    expect(edited.lines[0].suggested).toBe(10000);
    expect(edited.remainingProfit).toBe(140000);
  });

  it("skips technologies marked 'no recovery from this project'", () => {
    const plan = planSettlement(baseSnapshot({ undistributedProfit: 100000, technologies: [
      { technologyId: "t", name: "X", developerId: "w", developerName: "Wahid", outstanding: 1000, decision: "no_recovery" }] }));
    expect(plan.lines).toHaveLength(0);
  });

  it("recommends a reserve contribution when below target (spec §66)", () => {
    const plan = planSettlement(baseSnapshot({ undistributedProfit: 200000, reserve: { available: 72000, target: 100000 } }));
    expect(plan.reserveShortfall).toBe(28000);
    expect(plan.reserveRecommendation).toBe(28000);
    expect(plan.distributable).toBe(172000);
    expect(plan.distribution.map((d) => d.amount)).toEqual([86000, 86000]);
  });

  it("suggested fees reduce profit; from-share fees count toward that partner", () => {
    const plan = planSettlement(baseSnapshot({ undistributedProfit: 100000, fees: [
      { feeId: "f", personId: "w", name: "Wahid", feeType: "management", amount: 10000, accepted: false, treatment: "from_share" }] }));
    expect(plan.remainingProfit).toBe(90000);
    expect(plan.distribution.map((d) => d.amount)).toEqual([40000, 50000]);
  });

  it("flags loss positions", () => {
    const plan = planSettlement(baseSnapshot({ undistributedProfit: -90000 }));
    expect(plan.distributable).toBe(0);
    expect(plan.warnings.join(" ")).toMatch(/loss/);
  });
});

const balance = (o: Partial<PersonBalanceRow>): PersonBalanceRow => ({
  person_id: "w", full_name: "Wahid", is_partner: true, technology_recovery_eligible: true, profit_share_pct: 50,
  funding_due: 0, employee_due: 0, fee_due: 0, cto_due: 0, profit_due: 0, carry_due: 0, capital: 0, funding_in: 0,
  funding_repaid: 0, fee_earned: 0, fee_paid: 0, cto_allocated: 0, cto_paid: 0, profit_entitled: 0, profit_paid: 0,
  held_for_company: 0, cto_approved_value: 0, cto_recovered: 0, cto_unrecovered: 0, ...o,
});

describe("partner account (spec §58, §69, §78)", () => {
  it("reproduces the §58 Wahid example: 250,000 total incl. CTO", () => {
    const acc = buildPartnerAccount(balance({ funding_due: 80000, fee_due: 50000, profit_due: 50000, carry_due: 30000, cto_unrecovered: 40000 }));
    expect(acc.totalCurrentlyDue).toBe(210000);
    expect(acc.totalIncludingCtoClaim).toBe(250000);
    expect(acc.sections.map((s) => s.key)).toEqual(["funding", "fees", "cto", "profit", "carry_forward"]);
  });
  it("§69 carry-forward: 30,000 previous + 80,000 new = 110,000", () => {
    expect(buildPartnerAccount(balance({ carry_due: 30000, profit_due: 80000 })).totalCurrentlyDue).toBe(110000);
  });
  it("nets money the partner holds for the company (D2)", () => {
    const acc = buildPartnerAccount(balance({ funding_due: 30000, held_for_company: 50000 }));
    expect(acc.netPayable).toBe(-20000);
  });
  it("Belal has no CTO section", () => {
    const acc = buildPartnerAccount(balance({ technology_recovery_eligible: false, full_name: "Belal" }));
    expect(acc.sections.some((s) => s.key === "cto")).toBe(false);
  });
});

describe("collections center (spec §34)", () => {
  it("buckets ageing and due windows", () => {
    const s = summarizeCollections([
      { milestone_id: "a", outstanding: 100, fx_rate: 1, due_date: "2026-09-25", days_overdue: 0, ageing_bucket: "current" },
      { milestone_id: "b", outstanding: 200, fx_rate: 1, due_date: "2026-10-01", days_overdue: 0, ageing_bucket: "current" },
      { milestone_id: "c", outstanding: 300, fx_rate: 1, due_date: "2026-08-01", days_overdue: 55, ageing_bucket: "31_60" },
      { milestone_id: "d", outstanding: 10, fx_rate: 50, due_date: "2026-10-20", days_overdue: 0, ageing_bucket: "current" },
    ], "2026-09-25");
    expect(s.total).toBe(1100);
    expect(s.overdue).toBe(300);
    expect(s.ageing["31_60"]).toBe(300);
    expect(s.windows).toEqual({ today: 100, d7: 300, d14: 300, d30: 800 });
  });
});

describe("cash flow & funding gap (spec §95–96)", () => {
  it("reproduces the §96 example: 600k required − 350k expected = 250k gap", () => {
    const [w30] = forecastCash(0,
      [{ amount: 350000, date: "2026-10-10", label: "Milestones", kind: "collection" }],
      [{ amount: 600000, date: "2026-10-05", label: "Suppliers", kind: "supplier" }], "2026-09-25", [30]);
    expect(w30.fundingGap).toBe(250000);
    expect(w30.projectedBalance).toBe(-250000);
  });
  it("respects horizons; unscheduled obligations count as due now", () => {
    const res = forecastCash(100000,
      [{ amount: 50000, date: "2026-12-01", label: "late", kind: "collection" }],
      [{ amount: 20000, date: null, label: "partner", kind: "partner" }], "2026-09-25");
    expect(res.map((r) => r.expectedIn)).toEqual([0, 0, 50000]);
    expect(res[0].requiredOut).toBe(20000);
    expect(res[0].shortfallAfterCash).toBe(0);
  });
});

describe("CTO recovery rules (spec §52–56)", () => {
  it("status progression 50K → 10K → 40K → fully recovered", () => {
    expect(recoveryStatus(50000, 0)).toBe("recovery_pending");
    expect(recoveryStatus(50000, 10000)).toBe("partially_recovered");
    expect(remainingAfter(50000, 10000)).toBe(40000);
    expect(recoveryStatus(50000, 50000)).toBe("fully_recovered");
  });
  it("cannot exceed outstanding", () => {
    expect(validateRecovery(30000, 20000)).toEqual({ ok: false, message: "Maximum remaining recovery is 20,000 EGP." });
    expect(validateRecovery(20000, 20000)).toEqual({ ok: true });
    expect(validateRecovery(0, 20000).ok).toBe(false);
  });
  it("suggests the outstanding amount, capped by what the project affords", () => {
    expect(suggestRecovery(40000)).toBe(40000);
    expect(suggestRecovery(40000, 10000)).toBe(10000);
    expect(suggestRecovery(40000, -5)).toBe(0);
  });
});
