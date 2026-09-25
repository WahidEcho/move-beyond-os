import { num, round2 } from "./money";

/** Row shape of v_person_balances. */
export interface PersonBalanceRow {
  person_id: string;
  full_name: string;
  is_partner: boolean;
  technology_recovery_eligible: boolean;
  profit_share_pct: number | string;
  funding_due: number | string;
  employee_due: number | string;
  fee_due: number | string;
  cto_due: number | string;
  profit_due: number | string;
  carry_due: number | string;
  capital: number | string;
  funding_in: number | string;
  funding_repaid: number | string;
  fee_earned: number | string;
  fee_paid: number | string;
  cto_allocated: number | string;
  cto_paid: number | string;
  profit_entitled: number | string;
  profit_paid: number | string;
  held_for_company: number | string;
  cto_approved_value: number | string;
  cto_recovered: number | string;
  cto_unrecovered: number | string;
}

export interface AccountSection {
  key: "funding" | "fees" | "cto" | "profit" | "carry_forward" | "employee";
  title: string;
  rows: { label: string; value: number }[];
  due: number;
}

export interface PartnerAccount {
  sections: AccountSection[];
  /** Spec §58/§78: how much does Move Beyond currently owe this person (ledger). */
  totalCurrentlyDue: number;
  /** Company money this person holds (client paid them, etc. — D2). */
  heldForCompany: number;
  /** Due minus held: the net cash still to hand over (negative = person owes company). */
  netPayable: number;
  /** CTO development value not yet recovered from any project (a claim, not yet a debt). */
  ctoUnrecoveredClaim: number;
  /** Spec §58 example total, which includes the unrecovered CTO claim. */
  totalIncludingCtoClaim: number;
}

/**
 * Categorised partner statement. Categories are never merged (spec §130);
 * only the headline totals combine them.
 */
export function buildPartnerAccount(r: PersonBalanceRow): PartnerAccount {
  const funding = num(r.funding_due);
  const fees = num(r.fee_due);
  const cto = num(r.cto_due);
  const profit = num(r.profit_due);
  const carry = num(r.carry_due);
  const employee = num(r.employee_due);
  const claim = num(r.cto_unrecovered);

  const sections: AccountSection[] = [
    { key: "funding", title: "Project Funding", due: funding, rows: [
      { label: "Funded", value: num(r.funding_in) }, { label: "Repaid", value: num(r.funding_repaid) }, { label: "Outstanding", value: funding }] },
    { key: "fees", title: "Partner Fees", due: fees, rows: [
      { label: "Earned", value: num(r.fee_earned) }, { label: "Paid", value: num(r.fee_paid) }, { label: "Outstanding", value: fees }] },
  ];
  if (r.technology_recovery_eligible || num(r.cto_approved_value) > 0 || cto !== 0) {
    sections.push({ key: "cto", title: "CTO Development Recovery", due: cto, rows: [
      { label: "Approved development value", value: num(r.cto_approved_value) },
      { label: "Recovered from projects", value: num(r.cto_recovered) },
      { label: "Paid to date", value: num(r.cto_paid) },
      { label: "Recovered, not yet paid", value: cto },
      { label: "Not yet recovered (claim)", value: claim }] });
  }
  sections.push(
    { key: "profit", title: "Profit", due: profit, rows: [
      { label: "Entitlement", value: num(r.profit_entitled) }, { label: "Paid", value: num(r.profit_paid) },
      { label: "Reinvested (capital)", value: num(r.capital) }, { label: "Outstanding", value: profit }] },
    { key: "carry_forward", title: "Carry-Forward Recovery", due: carry, rows: [
      { label: carry < 0 ? "Owed to Move Beyond (netted)" : "Historical adjustments due", value: carry }] },
  );
  if (employee !== 0) {
    sections.push({ key: "employee", title: "Expense Reimbursement", due: employee, rows: [{ label: "Outstanding", value: employee }] });
  }

  const totalCurrentlyDue = round2(funding + fees + cto + profit + carry + employee);
  const held = num(r.held_for_company);
  return {
    sections,
    totalCurrentlyDue,
    heldForCompany: held,
    netPayable: round2(totalCurrentlyDue - held),
    ctoUnrecoveredClaim: claim,
    totalIncludingCtoClaim: round2(totalCurrentlyDue + claim),
  };
}
