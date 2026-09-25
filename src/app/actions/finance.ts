"use server";
/**
 * Server actions for every money movement. Each is a thin wrapper around a
 * Postgres RPC that checks permissions, validates, writes the domain rows and
 * the balanced ledger entry atomically, and honours the idempotency key.
 * The last argument of every action is the idempotency key from useAction.
 */
import { callRpc, type ActionResult } from "@/lib/actions";
import { getSession } from "@/lib/session";

type J = Record<string, unknown>;
const F = ["/finance"];
const proj = (id: string) => [`/finance/projects/${id}`, "/finance"];

async function org(): Promise<string> {
  const s = await getSession();
  if (!s?.orgId) throw new Error("Not signed in");
  return s.orgId;
}

// Projects & revenue ----------------------------------------------------------
export async function createProject(payload: J, key: string) {
  return callRpc<{ project_id: string; code: string }>("mb_create_project", { p_org: await org(), p_payload: payload, p_idempotency_key: key }, F);
}
export async function setProjectStatus(projectId: string, operational: string | null, financial: string | null, reason: string | null, _key: string) {
  return callRpc("mb_set_project_status", { p_project: projectId, p_operational: operational, p_financial: financial, p_reason: reason }, proj(projectId));
}
export async function saveMilestones(projectId: string, milestones: J[], reason: string | null, _key: string) {
  return callRpc("mb_save_milestones", { p_project: projectId, p_milestones: milestones, p_reason: reason }, proj(projectId));
}
export async function updateContractValue(projectId: string, value: number, reason: string, _key: string) {
  return callRpc("mb_update_contract_value", { p_project: projectId, p_value: value, p_reason: reason }, proj(projectId));
}
export async function addContractAdjustment(projectId: string, type: string, amount: number, description: string, date: string | null, key: string) {
  return callRpc("mb_add_contract_adjustment", { p_project: projectId, p_type: type, p_amount: amount, p_description: description, p_date: date, p_idempotency_key: key }, proj(projectId));
}
export async function deleteContractAdjustment(id: string, projectId: string, reason: string, _key: string) {
  return callRpc("mb_delete_contract_adjustment", { p_adjustment: id, p_reason: reason }, proj(projectId));
}
export async function recordCollection(p: { projectId: string; amount: number; date: string; cashAccountId?: string | null; currency?: string; fxRate?: number; reference?: string; notes?: string; allocations?: { milestone_id: string; amount: number }[] | null }, key: string) {
  return callRpc("mb_record_collection", {
    p_project: p.projectId, p_amount: p.amount, p_date: p.date, p_cash_account: p.cashAccountId || null, p_currency: p.currency ?? "EGP",
    p_fx_rate: p.fxRate ?? 1, p_reference: p.reference || null, p_notes: p.notes || null, p_allocations: p.allocations?.length ? p.allocations : null,
    p_idempotency_key: key }, [...proj(p.projectId), "/finance/collections", "/finance/revenue", "/finance/bank"]);
}
export async function recordRefund(projectId: string, amount: number, date: string, cashAccountId: string | null, reason: string, key: string) {
  return callRpc("mb_record_refund", { p_project: projectId, p_amount: amount, p_date: date, p_cash_account: cashAccountId, p_reason: reason, p_idempotency_key: key }, proj(projectId));
}
export async function deleteCollection(id: string, projectId: string, reason: string, _key: string) {
  return callRpc("mb_delete_collection", { p_collection: id, p_reason: reason }, proj(projectId));
}

// Expenses ----------------------------------------------------------------------
export async function addExpense(payload: J, key: string) {
  const pid = payload.project_id as string | undefined;
  return callRpc<{ expense_id: string; payment_id?: string; asset_id?: string }>("mb_add_expense", { p_org: await org(), p_payload: payload, p_idempotency_key: key },
    pid ? [...proj(pid), "/finance/expenses"] : ["/finance/expenses", "/finance"]);
}
export async function payExpense(expenseId: string, payment: J, key: string) {
  return callRpc("mb_record_expense_payment", { p_expense: expenseId, p_payment: payment, p_idempotency_key: key }, ["/finance"]);
}
export async function updateExpense(expenseId: string, payload: J, reason: string | null, _key: string) {
  return callRpc("mb_update_expense", { p_expense: expenseId, p_payload: payload, p_reason: reason }, ["/finance"]);
}
export async function cancelExpense(expenseId: string, reason: string, _key: string) {
  return callRpc("mb_cancel_expense", { p_expense: expenseId, p_reason: reason }, ["/finance"]);
}
export async function deleteExpense(expenseId: string, reason: string, _key: string) {
  return callRpc("mb_delete_expense", { p_expense: expenseId, p_reason: reason }, ["/finance"]);
}
export async function deleteExpensePayment(paymentId: string, reason: string, _key: string) {
  return callRpc("mb_delete_expense_payment", { p_payment: paymentId, p_reason: reason }, ["/finance"]);
}

// Funding & payouts -------------------------------------------------------------
export async function addFunding(projectId: string, personId: string, amount: number, date: string, cashAccountId: string | null, notes: string | null, key: string) {
  return callRpc("mb_add_funding", { p_project: projectId, p_person: personId, p_amount: amount, p_date: date, p_cash_account: cashAccountId, p_notes: notes, p_idempotency_key: key }, proj(projectId));
}
export async function deleteFunding(fundingId: string, reason: string, _key: string) {
  return callRpc("mb_delete_funding", { p_funding: fundingId, p_reason: reason }, ["/finance"]);
}
export async function payPerson(p: { personId: string; category: string; projectId: string | null; amount: number; date: string; cashAccountId?: string | null; reference?: string; notes?: string }, key: string) {
  return callRpc("mb_pay_person", { p_org: await org(), p_person: p.personId, p_category: p.category, p_project: p.projectId, p_amount: p.amount, p_date: p.date,
    p_cash_account: p.cashAccountId || null, p_reference: p.reference || null, p_notes: p.notes || null, p_idempotency_key: key }, ["/finance"]);
}
export async function deletePayout(payoutId: string, reason: string, _key: string) {
  return callRpc("mb_delete_payout", { p_payout: payoutId, p_reason: reason }, ["/finance"]);
}
export async function cashTransfer(fromId: string, toId: string, amount: number, date: string, reason: string | null, key: string) {
  return callRpc("mb_cash_transfer", { p_org: await org(), p_from: fromId, p_to: toId, p_amount: amount, p_date: date, p_reason: reason, p_idempotency_key: key }, ["/finance"]);
}
export async function bankAdjustment(cashAccountId: string, amount: number, date: string, reason: string, key: string) {
  return callRpc("mb_bank_adjustment", { p_org: await org(), p_cash_account: cashAccountId, p_amount: amount, p_date: date, p_reason: reason, p_idempotency_key: key }, ["/finance"]);
}
export async function postOpeningBalance(payload: J, key: string) {
  return callRpc("mb_post_opening_balance", { p_org: await org(), p_payload: payload, p_idempotency_key: key }, ["/finance"]);
}
export async function deleteOpeningBalance(id: string, reason: string, _key: string) {
  return callRpc("mb_delete_opening_balance", { p_id: id, p_reason: reason }, ["/finance"]);
}

// Partner finance ----------------------------------------------------------------
export async function suggestFees(projectId: string, _key: string) {
  return callRpc<number>("mb_suggest_fees", { p_project: projectId }, proj(projectId));
}
export async function addPartnerFee(projectId: string, payload: J, key: string) {
  return callRpc("mb_add_partner_fee", { p_project: projectId, p_payload: payload, p_idempotency_key: key }, proj(projectId));
}
export async function decideFee(feeId: string, decision: "accept" | "ignore", amount: number | null, treatment: string | null, _key: string) {
  return callRpc("mb_decide_fee", { p_fee: feeId, p_decision: decision, p_amount: amount, p_treatment: treatment }, ["/finance"]);
}
export async function reverseFee(feeId: string, reason: string, _key: string) {
  return callRpc("mb_reverse_fee", { p_fee: feeId, p_reason: reason }, ["/finance"]);
}
export async function distributeProfit(projectId: string, payload: J, key: string) {
  return callRpc("mb_distribute_profit", { p_project: projectId, p_payload: payload, p_idempotency_key: key }, [...proj(projectId), "/finance/partners"]);
}
export async function reverseDistribution(id: string, reason: string, _key: string) {
  return callRpc("mb_reverse_distribution", { p_distribution: id, p_reason: reason }, ["/finance"]);
}
export async function allocateLoss(projectId: string, lines: J[], notes: string | null, key: string) {
  return callRpc("mb_allocate_loss", { p_project: projectId, p_lines: lines, p_notes: notes, p_idempotency_key: key }, proj(projectId));
}
export async function confirmSettlement(projectId: string, payload: J, key: string) {
  return callRpc<{ settlement_id: string; total_paid: number }>("mb_confirm_settlement", { p_project: projectId, p_payload: payload, p_idempotency_key: key },
    [...proj(projectId), "/finance/settlements", "/finance/partners", "/finance/cto"]);
}
export async function closeProject(projectId: string, checklist: J, overrideReason: string | null, _key: string) {
  return callRpc<{ closed: boolean; issues: string[] }>("mb_close_project", { p_project: projectId, p_checklist: checklist, p_override_reason: overrideReason }, proj(projectId));
}
export async function reopenProject(projectId: string, reason: string, _key: string) {
  return callRpc("mb_reopen_project", { p_project: projectId, p_reason: reason }, proj(projectId));
}

// CTO development recovery ---------------------------------------------------------
export async function createTechnology(payload: J, key: string) {
  return callRpc<{ technology_id: string }>("mb_create_technology", { p_org: await org(), p_payload: payload, p_idempotency_key: key }, ["/finance/cto"]);
}
export async function adjustTechnologyValue(techId: string, kind: "extension" | "reduction", amount: number, reason: string, _key: string) {
  return callRpc("mb_adjust_technology_value", { p_tech: techId, p_kind: kind, p_amount: amount, p_reason: reason }, ["/finance/cto"]);
}
export async function setProjectTechnology(projectId: string, techId: string, decision: string, planned: number | null, _key: string) {
  return callRpc<{ outstanding: number; developer: string }>("mb_set_project_technology", { p_project: projectId, p_tech: techId, p_decision: decision, p_planned: planned }, proj(projectId));
}
export async function removeProjectTechnology(projectId: string, techId: string, _key: string) {
  return callRpc("mb_remove_project_technology", { p_project: projectId, p_tech: techId }, proj(projectId));
}
export async function allocateCtoRecovery(techId: string, projectId: string, amount: number, treatment: string, notes: string | null, key: string) {
  return callRpc<{ allocation_id: string; outstanding: number }>("mb_allocate_cto_recovery",
    { p_tech: techId, p_project: projectId, p_amount: amount, p_treatment: treatment, p_notes: notes, p_idempotency_key: key }, [...proj(projectId), "/finance/cto"]);
}
export async function reverseCtoRecovery(allocationId: string, reason: string, _key: string) {
  return callRpc("mb_reverse_cto_recovery", { p_allocation: allocationId, p_reason: reason }, ["/finance/cto", "/finance"]);
}

// Subscriptions & assets --------------------------------------------------------------
export async function createSubscription(payload: J, key: string) {
  return callRpc<{ subscription_id: string; project_id: string }>("mb_create_subscription", { p_org: await org(), p_payload: payload, p_idempotency_key: key }, ["/finance/subscriptions"]);
}
export async function billSubscription(subId: string, _key: string) {
  return callRpc("mb_bill_subscription_period", { p_sub: subId }, ["/finance/subscriptions", "/finance/collections"]);
}
export async function setSubscriptionStatus(subId: string, status: string, reason: string | null, _key: string) {
  return callRpc("mb_set_subscription_status", { p_sub: subId, p_status: status, p_reason: reason }, ["/finance/subscriptions"]);
}
export async function assignAsset(assetId: string, projectId: string, qty: number, from: string | null, to: string | null, internalCost: number, notes: string | null, _key: string) {
  return callRpc("mb_assign_asset", { p_asset: assetId, p_project: projectId, p_quantity: qty, p_from: from, p_to: to, p_internal_cost: internalCost, p_notes: notes }, ["/finance/assets", `/finance/projects/${projectId}`]);
}
export async function returnAsset(assignmentId: string, _key: string) {
  return callRpc("mb_return_asset", { p_assignment: assignmentId }, ["/finance/assets"]);
}

export type { ActionResult };
