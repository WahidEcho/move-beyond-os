/**
 * Read-only integration smoke test: runs every read function against the demo
 * organization so broken selects/embeds fail here, not in front of a partner.
 * Skipped automatically when SUPABASE_SERVICE_ROLE_KEY is not available.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const admin = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServer: async () => admin, createSupabaseAdmin: () => admin }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const d = admin ? describe : describe.skip;

d("read layer against demo data", () => {
  let q: typeof import("../queries");
  let org = "";
  let project = "";
  let tech = "";
  beforeAll(async () => {
    q = await import("../queries");
    const { data } = await admin!.from("organizations").select("id").eq("slug", "move-beyond-demo").single();
    org = data!.id;
    const { data: p } = await admin!.from("projects").select("id").eq("organization_id", org).eq("name", "Katameya Heights Padel Open").single();
    project = p!.id;
    const { data: t } = await admin!.from("technology_developments").select("id").eq("organization_id", org).ilike("name", "%Padel%").single();
    tech = t!.id;
  });

  it("lookups", async () => {
    const l = await q.getLookups(org);
    expect(l.partners.length).toBe(2);
    expect(l.expenseCategoryOptions.length).toBeGreaterThan(50);
    expect(l.technologies.length).toBe(2);
  });
  it("company level", async () => {
    const pos = await q.getCompanyPosition(org);
    expect(Number(pos.company_cash)).toBeGreaterThan(0);
    expect((await q.getCashAccounts(org)).length).toBe(3);
    expect((await q.getPersonBalances(org)).length).toBeGreaterThan(2);
    expect((await q.getPnlMonthly(org)).length).toBeGreaterThan(0);
    await q.getAlerts(org);
  });
  it("projects and every project tab", async () => {
    const all = await q.getProjectsFinancials(org);
    expect(all.length).toBe(10);
    const p = await q.getProject(project);
    expect(p?.metrics?.contractValue).toBe(540000);
    const rev = await q.getProjectRevenue(project);
    expect(rev.milestones.length).toBe(3);
    const exp = await q.getExpenses(org, { projectId: project });
    expect(exp.some((e) => e.payments.length > 0)).toBe(true);
    const f = await q.getProjectFunding(project);
    expect(f.byFunder.length).toBeGreaterThan(0);
    expect((await q.getProjectFees(project)).length).toBe(2);
    await q.getProjectTechnology(project);
    await q.getProjectDistributions(project);
    await q.getProjectAssets(project);
    await q.getDocuments("project", project);
    await q.getActivity(org, { projectId: project, limit: 20 });
  });
  it("§113: Padel platform 50K / 10K / 40K", async () => {
    const t = await q.getTechnology(tech);
    expect(Number(t?.rec.approved_value)).toBe(50000);
    expect(Number(t?.rec.recovered)).toBe(10000);
    expect(Number(t?.rec.outstanding)).toBe(40000);
    expect(t?.rec.recovery_status).toBe("partially_recovered");
  });
  it("lists", async () => {
    expect((await q.getReceivables(org)).length).toBeGreaterThan(0);
    expect((await q.getCollections(org)).length).toBeGreaterThan(0);
    expect((await q.getSubscriptions(org)).length).toBe(2);
    expect((await q.getTechnologies(org)).length).toBe(2);
    expect((await q.getSuppliers(org)).length).toBe(6);
    expect((await q.getClientsOverview(org)).length).toBe(5);
    const assets = await q.getAssets(org);
    const quest = assets.find((a) => a.name === "Meta Quest 3");
    expect(quest?.available).toBe(3);
    expect(quest?.in_event).toBe(2);
    const fc = await q.getCashForecast(org);
    expect(fc.windows).toHaveLength(3);
  });
});
