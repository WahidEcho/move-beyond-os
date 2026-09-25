/** Money helpers. All ledger amounts are EGP with 2 decimals. */

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const sum = (values: Array<number | null | undefined>): number =>
  round2(values.reduce<number>((acc, v) => acc + (Number(v) || 0), 0));

export const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const clampMin0 = (n: number): number => (n < 0 ? 0 : round2(n));

/** Split `total` by percentages so the parts add up exactly to `total` (largest remainder, 2dp). */
export function splitByPercent(total: number, pcts: number[]): number[] {
  const cents = Math.round(total * 100);
  const pctSum = pcts.reduce((a, b) => a + b, 0);
  if (pctSum <= 0) return pcts.map(() => 0);
  const raw = pcts.map((p) => (cents * p) / pctSum);
  const floors = raw.map(Math.floor);
  let remainder = cents - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors.map((c) => c / 100);
}
