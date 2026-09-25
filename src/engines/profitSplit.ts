import { clampMin0, round2, splitByPercent } from "./money";

export interface PartnerShare {
  personId: string;
  name: string;
  sharePct: number;
  /** Already distributed to this partner on this project (incl. from-share fees / CTO). */
  alreadyDistributed: number;
}

export interface SplitLine {
  personId: string;
  name: string;
  sharePct: number;
  amount: number;
}

/**
 * Split `total` among partners so that, over the whole project, each partner
 * ends at their share % of everything distributed (spec §65, D3 from_share).
 * A partner who already took more than their share gets 0; the rest is shared
 * among the others in proportion to their shares.
 */
export function splitProfit(total: number, partners: PartnerShare[]): SplitLine[] {
  const t = clampMin0(total);
  if (t === 0 || partners.length === 0) return partners.map((p) => ({ ...pick(p), amount: 0 }));
  const already = partners.reduce((a, p) => a + p.alreadyDistributed, 0);
  const pctTotal = partners.reduce((a, p) => a + p.sharePct, 0) || 1;
  const gaps = partners.map((p) => Math.max((p.sharePct / pctTotal) * (already + t) - p.alreadyDistributed, 0));
  const gapTotal = gaps.reduce((a, b) => a + b, 0);
  const amounts = gapTotal > 0 ? splitByPercent(t, gaps) : splitByPercent(t, partners.map((p) => p.sharePct));
  return partners.map((p, i) => ({ ...pick(p), amount: round2(amounts[i]) }));
}

const pick = (p: PartnerShare) => ({ personId: p.personId, name: p.name, sharePct: p.sharePct });

/** Split a loss by explicit amounts; remainder is absorbed by Move Beyond (spec §68). */
export function lossRemainder(loss: number, partnerAmounts: number[]): number {
  return round2(loss - partnerAmounts.reduce((a, b) => a + b, 0));
}
