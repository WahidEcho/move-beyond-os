import { clampMin0, round2 } from "./money";

export type RecoveryStatus = "recovery_pending" | "partially_recovered" | "fully_recovered" | "no_value" | "cancelled" | "archived";

export function recoveryStatus(value: number, recovered: number, lifecycle?: string): RecoveryStatus {
  if (lifecycle === "cancelled") return "cancelled";
  if (lifecycle === "archived") return "archived";
  if (value <= 0) return "no_value";
  if (recovered >= value) return "fully_recovered";
  if (recovered > 0) return "partially_recovered";
  return "recovery_pending";
}

/** Mirror of the database hard rule (spec §54) so forms can warn before submitting. */
export function validateRecovery(amount: number, outstanding: number): { ok: true } | { ok: false; message: string } {
  if (!(amount > 0)) return { ok: false, message: "Enter a recovery amount above 0." };
  if (amount > outstanding + 0.005) {
    return { ok: false, message: `Maximum remaining recovery is ${outstanding.toLocaleString("en-US")} EGP.` };
  }
  return { ok: true };
}

/** Suggested recovery (spec §53, §132): the outstanding value, capped by what the project can afford. */
export function suggestRecovery(outstanding: number, affordable?: number | null): number {
  const cap = affordable === null || affordable === undefined ? outstanding : Math.min(outstanding, affordable);
  return clampMin0(round2(cap));
}

export function remainingAfter(outstanding: number, amount: number): number {
  return clampMin0(round2(outstanding - amount));
}
