import { clampMin0, num, round2 } from "./money";

/** Raw sums for one project, as returned by the v_project_financials view. */
export interface ProjectAggregates {
  contract_value: number | string;
  collected: number | string;
  receivable_outstanding: number | string;
  overdue: number | string;
  actual_cost: number | string;
  committed_cost: number | string;
  remaining_commitments: number | string;
  uncommitted_estimates: number | string;
  estimated_cost: number | string;
  fee_cost: number | string;
  suggested_fees: number | string;
  cto_cost: number | string;
  planned_cto: number | string;
  distributed: number | string;
  cash_position: number | string;
  company_funding_outstanding: number | string;
  budget_amount?: number | string | null;
  is_marketing_investment?: boolean;
}

export interface ProjectMetrics {
  contractValue: number;
  collected: number;
  outstanding: number;
  overdue: number;
  actualCost: number;
  committedCost: number;
  remainingCommitments: number;
  forecastCost: number;
  /** Revenue − direct project costs (spec §63). */
  grossProfit: number;
  grossMarginPct: number | null;
  /** Gross − fees − CTO recovery booked as project cost (spec §59 "Remaining Project Margin"). */
  distributableProfit: number;
  /** Distributable minus what has already been distributed / allocated. */
  undistributedProfit: number;
  /** Actual profit to date on a cash basis (D1). */
  actualProfit: number;
  forecastRevenue: number;
  forecastProfit: number;
  forecastMarginPct: number | null;
  /** Cash available to settle obligations, including Move Beyond's own funding (E3). */
  settlementCash: number;
  budget: number | null;
  budgetVariance: number | null;
  isMarketingInvestment: boolean;
}

/**
 * The single place that turns raw project sums into the numbers users see.
 * Forecast (spec §64) = expected final revenue − (actual cost + remaining
 * commitments + uncommitted estimates) − partner fees − expected CTO recovery.
 */
export function computeProjectMetrics(a: ProjectAggregates): ProjectMetrics {
  const contractValue = num(a.contract_value);
  const collected = num(a.collected);
  const actualCost = num(a.actual_cost);
  const feeCost = num(a.fee_cost);
  const ctoCost = num(a.cto_cost);
  const remaining = num(a.remaining_commitments);
  const uncommitted = num(a.uncommitted_estimates);

  const grossProfit = round2(collected - actualCost);
  const distributableProfit = round2(grossProfit - feeCost - ctoCost);
  const forecastRevenue = Math.max(contractValue, collected);
  const forecastCost = round2(actualCost + remaining + uncommitted);
  const forecastProfit = round2(
    forecastRevenue - forecastCost - feeCost - num(a.suggested_fees) - ctoCost - num(a.planned_cto),
  );
  const budget = a.budget_amount === null || a.budget_amount === undefined || a.budget_amount === "" ? null : num(a.budget_amount);

  return {
    contractValue,
    collected,
    outstanding: num(a.receivable_outstanding),
    overdue: num(a.overdue),
    actualCost,
    committedCost: num(a.committed_cost),
    remainingCommitments: remaining,
    forecastCost,
    grossProfit,
    grossMarginPct: collected > 0 ? round2((grossProfit / collected) * 100) : null,
    distributableProfit,
    undistributedProfit: round2(distributableProfit - num(a.distributed)),
    actualProfit: distributableProfit,
    forecastRevenue,
    forecastProfit,
    forecastMarginPct: forecastRevenue > 0 ? round2((forecastProfit / forecastRevenue) * 100) : null,
    settlementCash: clampMin0(num(a.cash_position) + num(a.company_funding_outstanding)),
    budget,
    budgetVariance: budget === null ? null : round2(budget - (num(a.committed_cost) + uncommitted)),
    isMarketingInvestment: Boolean(a.is_marketing_investment),
  };
}

/** Sponsorship with zero revenue is intentional, not a failed project (spec §16). */
export function profitLabel(m: ProjectMetrics): "profit" | "loss" | "marketing_investment" | "break_even" {
  if (m.isMarketingInvestment && m.collected === 0) return "marketing_investment";
  if (m.distributableProfit > 0) return "profit";
  if (m.distributableProfit < 0) return "loss";
  return "break_even";
}
