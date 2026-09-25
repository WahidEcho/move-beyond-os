import "server-only";
import { cache } from "react";
import { createSupabaseServer } from "@/lib/supabase/server";
import { todayIso, toNum } from "@/lib/format";
import { computeProjectMetrics, type ProjectAggregates } from "@/engines/projectFinancials";
import { forecastCash, type CashItem } from "@/engines/cashflow";

/**
 * Read layer. Every screen gets its numbers from these functions, which read
 * the reporting views (single source of truth) and the pure engines — never
 * ad-hoc arithmetic in components (spec §104).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

async function db() {
  return createSupabaseServer();
}

function rows<T = Row>(res: { data: unknown; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T[];
}

// ---------------------------------------------------------------------------
// Lookups for forms
// ---------------------------------------------------------------------------
export const getLookups = cache(async (orgId: string) => {
  const s = await db();
  const [clients, serviceCats, services, suppliers, people, cash, expCats, techCats, assetCats, techs, projects] = await Promise.all([
    s.from("clients").select("id, name").eq("organization_id", orgId).is("deleted_at", null).eq("status", "active").order("name"),
    s.from("service_categories").select("id, name, tagline, sort_order, active").eq("organization_id", orgId).order("sort_order"),
    s.from("services").select("id, name, category_id, parent_service_id, active, sort_order, billing_nature, default_billing_model, description").eq("organization_id", orgId).order("sort_order"),
    s.from("suppliers").select("id, name, category").eq("organization_id", orgId).is("deleted_at", null).order("name"),
    s.from("people").select("id, full_name, kind, is_partner, profit_share_pct, technology_recovery_eligible, active, email, phone, job_title, user_id").eq("organization_id", orgId).is("deleted_at", null).order("full_name"),
    s.from("cash_accounts").select("id, name, account_type, person_id, is_default, active").eq("organization_id", orgId).eq("active", true).order("is_default", { ascending: false }),
    s.from("expense_categories").select("id, name, parent_id, code, scope, sort_order, active").eq("organization_id", orgId).order("sort_order"),
    s.from("technology_categories").select("id, name, sort_order, active").eq("organization_id", orgId).order("sort_order"),
    s.from("asset_categories").select("id, name, sort_order, active").eq("organization_id", orgId).order("sort_order"),
    s.from("v_technology_recovery").select("technology_id, name, outstanding, developer_name, reusable, lifecycle_status").eq("organization_id", orgId).order("name"),
    s.from("projects").select("id, code, name, financial_status").eq("organization_id", orgId).is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  const cats = rows(expCats);
  const parents = cats.filter((c) => !c.parent_id);
  return {
    clients: rows(clients),
    serviceCategories: rows(serviceCats),
    services: rows(services),
    suppliers: rows(suppliers),
    people: rows(people),
    partners: rows(people).filter((p) => p.is_partner && p.active),
    cashAccounts: rows(cash),
    expenseCategories: cats,
    expenseCategoryOptions: parents.flatMap((p) => [
      { id: p.id, label: p.name, group: p.name, isParent: true, scope: p.scope, active: p.active },
      ...cats.filter((c) => c.parent_id === p.id).map((c) => ({ id: c.id, label: c.name, group: p.name, isParent: false, scope: c.scope, active: c.active })),
    ]),
    technologyCategories: rows(techCats),
    assetCategories: rows(assetCats),
    technologies: rows(techs),
    projects: rows(projects),
  };
});
export type Lookups = Awaited<ReturnType<typeof getLookups>>;

// ---------------------------------------------------------------------------
// Company-level
// ---------------------------------------------------------------------------
export async function getCompanyPosition(orgId: string) {
  const s = await db();
  const { data } = await s.from("v_company_position").select("*").eq("organization_id", orgId).maybeSingle();
  return (data ?? {}) as Row;
}

export async function getCashAccounts(orgId: string) {
  const s = await db();
  return rows(await s.from("v_cash_account_balances").select("*").eq("organization_id", orgId).order("account_type").order("name"));
}

export async function getPersonBalances(orgId: string) {
  const s = await db();
  return rows(await s.from("v_person_balances").select("*").eq("organization_id", orgId).order("full_name"));
}

export async function getPnlMonthly(orgId: string) {
  const s = await db();
  return rows(await s.from("v_company_pnl_monthly").select("*").eq("organization_id", orgId).order("month"));
}

export async function getAlerts(orgId: string, limit = 50) {
  const s = await db();
  return rows(await s.from("v_my_alerts").select("*").eq("organization_id", orgId).order("priority_rank").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(limit));
}

export async function refreshAlertsFor(orgId: string) {
  const s = await db();
  await s.rpc("mb_refresh_alerts", { p_org: orgId });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export async function getProjectsFinancials(orgId: string) {
  const s = await db();
  const data = rows(await s.from("v_project_financials").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }));
  return data.map((r) => ({ ...(r as Row), metrics: computeProjectMetrics(r as unknown as ProjectAggregates) }) as Row & { metrics: ReturnType<typeof computeProjectMetrics> });
}

export async function getProject(projectId: string) {
  const s = await db();
  const [{ data: project }, { data: fin }, services, members, contract] = await Promise.all([
    s.from("projects").select("*, clients(id, name)").eq("id", projectId).maybeSingle(),
    s.from("v_project_financials").select("*").eq("project_id", projectId).maybeSingle(),
    s.from("project_services").select("service_id, services(name, service_categories(name))").eq("project_id", projectId),
    s.from("project_members").select("person_id, project_role, people(full_name, is_partner)").eq("project_id", projectId),
    s.from("contracts").select("*").eq("project_id", projectId).maybeSingle(),
  ]);
  if (!project) return null;
  return {
    project: project as Row,
    fin: (fin ?? null) as Row | null,
    metrics: fin ? computeProjectMetrics(fin as unknown as ProjectAggregates) : null,
    services: rows(services),
    members: rows(members),
    contract: (contract.data ?? null) as Row | null,
  };
}

export async function getProjectRevenue(projectId: string) {
  const s = await db();
  const [milestones, collections, adjustments] = await Promise.all([
    s.from("v_receivables").select("*").eq("project_id", projectId).order("due_date", { nullsFirst: false }),
    s.from("collections").select("*, cash_accounts(name, account_type)").eq("project_id", projectId).is("deleted_at", null).order("collection_date", { ascending: false }),
    s.from("contract_adjustments").select("*").eq("project_id", projectId).is("deleted_at", null).order("version_no"),
  ]);
  return { milestones: rows(milestones), collections: rows(collections), adjustments: rows(adjustments) };
}

export async function getExpenses(orgId: string, filter: { projectId?: string; overheadOnly?: boolean; outstandingOnly?: boolean; supplierId?: string } = {}) {
  const s = await db();
  let q = s.from("v_expense_balances").select("*").eq("organization_id", orgId);
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  if (filter.overheadOnly) q = q.is("project_id", null);
  if (filter.outstandingOnly) q = q.gt("outstanding_egp", 0);
  if (filter.supplierId) q = q.eq("supplier_id", filter.supplierId);
  const list = rows(await q.order("created_at", { ascending: false }));
  const ids = list.map((e) => e.expense_id);
  const [payments, lk] = await Promise.all([
    ids.length ? s.from("expense_payments").select("*, people(full_name), cash_accounts(name)").in("expense_id", ids).is("deleted_at", null).order("payment_date") : Promise.resolve({ data: [], error: null }),
    getLookups(orgId),
  ]);
  const pay = rows(payments);
  const cat = new Map(lk.expenseCategories.map((c) => [c.id, c]));
  const sup = new Map(lk.suppliers.map((c) => [c.id, c.name]));
  const prj = new Map(lk.projects.map((p) => [p.id, p]));
  return list.map((e) => {
    const c = cat.get(e.category_id);
    const parent = c?.parent_id ? cat.get(c.parent_id) : null;
    return {
      ...e,
      category_label: c ? (parent ? `${parent.name} › ${c.name}` : c.name) : null,
      supplier_name: e.supplier_id ? sup.get(e.supplier_id) ?? null : null,
      project_code: e.project_id ? prj.get(e.project_id)?.code ?? null : null,
      project_name: e.project_id ? prj.get(e.project_id)?.name ?? null : null,
      payments: pay.filter((p) => p.expense_id === e.expense_id),
    };
  });
}

export async function getProjectFunding(projectId: string) {
  const s = await db();
  const [byFunder, records, dues, payouts] = await Promise.all([
    s.from("v_project_funding_by_funder").select("*").eq("project_id", projectId),
    s.from("project_funding").select("*, funders(name, funder_type)").eq("project_id", projectId).is("deleted_at", null).order("funding_date"),
    s.from("v_person_project_dues").select("*, people(full_name, is_partner, kind)").eq("project_id", projectId),
    s.from("payouts").select("*, people(full_name), cash_accounts(name)").eq("project_id", projectId).is("deleted_at", null).order("payout_date", { ascending: false }),
  ]);
  return { byFunder: rows(byFunder), records: rows(records), dues: rows(dues), payouts: rows(payouts) };
}

export async function getProjectFees(projectId: string) {
  const s = await db();
  return rows(await s.from("partner_fees").select("*, people(full_name)").eq("project_id", projectId).order("created_at"));
}

export async function getProjectTechnology(projectId: string) {
  const s = await db();
  const [usage, allocations] = await Promise.all([
    s.from("project_technology_usage").select("*").eq("project_id", projectId),
    s.from("cto_recovery_allocations").select("*, technology_developments(name), people:beneficiary_person_id(full_name)").eq("project_id", projectId).order("created_at"),
  ]);
  const u = rows(usage);
  const techIds = u.map((x) => x.technology_id);
  const tech = techIds.length ? rows(await s.from("v_technology_recovery").select("*").in("technology_id", techIds)) : [];
  return { usage: u.map((x) => ({ ...x, tech: tech.find((t) => t.technology_id === x.technology_id) })), allocations: rows(allocations) };
}

export async function getProjectDistributions(projectId: string) {
  const s = await db();
  const [dist, losses, settlements, byPerson] = await Promise.all([
    s.from("profit_distributions").select("*, profit_distribution_lines(*, people(full_name))").eq("project_id", projectId).is("deleted_at", null).order("created_at"),
    s.from("loss_allocations").select("*, loss_allocation_lines(*, people(full_name))").eq("project_id", projectId).is("deleted_at", null),
    s.from("settlements").select("*, settlement_lines(*)").eq("project_id", projectId).order("created_at", { ascending: false }),
    s.from("journal_lines").select("person_id, amount").eq("project_id", projectId).eq("account_code", "DISTRIBUTIONS"),
  ]);
  const already: Record<string, number> = {};
  for (const l of rows(byPerson)) if (l.person_id) already[l.person_id] = (already[l.person_id] ?? 0) + toNum(l.amount);
  return { distributions: rows(dist), losses: rows(losses), settlements: rows(settlements), alreadyByPerson: already };
}

export async function getProjectAssets(projectId: string) {
  const s = await db();
  const [bought, assigned] = await Promise.all([
    s.from("assets").select("*").eq("source_project_id", projectId).is("deleted_at", null),
    s.from("asset_assignments").select("*, assets(name)").eq("project_id", projectId).order("created_at"),
  ]);
  return { bought: rows(bought), assigned: rows(assigned) };
}

export async function getDocuments(entityType: string, entityId: string) {
  const s = await db();
  return rows(await s.from("documents").select("*").eq("entity_type", entityType).eq("entity_id", entityId).is("deleted_at", null).order("created_at", { ascending: false }));
}

export async function getActivity(orgId: string, filter: { projectId?: string; recordIds?: string[]; limit?: number } = {}) {
  const s = await db();
  let q = s.from("audit_logs").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(filter.limit ?? 100);
  if (filter.projectId) q = q.or(`record_id.eq.${filter.projectId},new_data->>project_id.eq.${filter.projectId},old_data->>project_id.eq.${filter.projectId}`);
  const data = rows(await q);
  const userIds = Array.from(new Set(data.map((d) => d.user_id).filter(Boolean)));
  const names = userIds.length ? rows(await s.from("profiles").select("user_id, full_name, email").in("user_id", userIds)) : [];
  const nm = new Map(names.map((n) => [n.user_id, n.full_name || n.email]));
  return data.map((d) => ({ ...d, user_name: d.user_id ? nm.get(d.user_id) ?? "User" : "System" }));
}

// ---------------------------------------------------------------------------
// Receivables, subscriptions, technology, suppliers, assets
// ---------------------------------------------------------------------------
export async function getReceivables(orgId: string) {
  const s = await db();
  return rows(await s.from("v_receivables").select("*").eq("organization_id", orgId).gt("outstanding", 0).order("due_date", { nullsFirst: false }));
}

export async function getCollections(orgId: string) {
  const s = await db();
  return rows(await s.from("collections").select("*, projects(code, name), clients(name), cash_accounts(name, account_type)").eq("organization_id", orgId).is("deleted_at", null).order("collection_date", { ascending: false }).limit(1000));
}

export async function getSubscriptions(orgId: string) {
  const s = await db();
  return rows(await s.from("v_subscription_metrics").select("*").eq("organization_id", orgId).order("next_billing_date", { nullsFirst: false }));
}

export async function getTechnologies(orgId: string) {
  const s = await db();
  return rows(await s.from("v_technology_recovery").select("*").eq("organization_id", orgId).order("created_at"));
}

export async function getTechnology(techId: string) {
  const s = await db();
  const [{ data: t }, { data: rec }, adj, alloc, usage, services] = await Promise.all([
    s.from("technology_developments").select("*").eq("id", techId).maybeSingle(),
    s.from("v_technology_recovery").select("*").eq("technology_id", techId).maybeSingle(),
    s.from("technology_development_adjustments").select("*").eq("technology_id", techId).order("created_at"),
    s.from("cto_recovery_allocations").select("*, projects(code, name)").eq("technology_id", techId).order("allocation_date"),
    s.from("project_technology_usage").select("*, projects(id, code, name, financial_status, operational_status)").eq("technology_id", techId),
    s.from("technology_services").select("service_id, services(name)").eq("technology_id", techId),
  ]);
  if (!t) return null;
  return { tech: t as Row, rec: (rec ?? {}) as Row, adjustments: rows(adj), allocations: rows(alloc), usage: rows(usage), services: rows(services) };
}

export async function getSuppliers(orgId: string) {
  const s = await db();
  return rows(await s.from("v_supplier_balances").select("*").eq("organization_id", orgId).order("name"));
}

export async function getClientsOverview(orgId: string) {
  const s = await db();
  const [clients, fin, subs] = await Promise.all([
    s.from("clients").select("*").eq("organization_id", orgId).is("deleted_at", null).order("name"),
    s.from("v_project_financials").select("client_id, collected, receivable_outstanding, contract_value").eq("organization_id", orgId),
    s.from("subscriptions").select("client_id").eq("organization_id", orgId).is("deleted_at", null),
  ]);
  const f = rows(fin);
  const sub = rows(subs);
  return rows(clients).map((c) => {
    const mine = f.filter((p) => p.client_id === c.id);
    return {
      ...c,
      projects_count: mine.length,
      subscriptions_count: sub.filter((x) => x.client_id === c.id).length,
      total_revenue: mine.reduce((a, p) => a + toNum(p.collected), 0),
      outstanding: mine.reduce((a, p) => a + toNum(p.receivable_outstanding), 0),
      contract_value: mine.reduce((a, p) => a + toNum(p.contract_value), 0),
    };
  });
}

export async function getAssets(orgId: string) {
  const s = await db();
  const [assets, assignments] = await Promise.all([
    s.from("assets").select("*, asset_categories(name), suppliers(name), people:custodian_person_id(full_name)").eq("organization_id", orgId).is("deleted_at", null).order("name"),
    s.from("asset_assignments").select("*, projects(code, name)").eq("organization_id", orgId).order("created_at", { ascending: false }),
  ]);
  const asg = rows(assignments);
  return rows(assets).map((a) => {
    const active = asg.filter((x) => x.asset_id === a.id && !x.returned_at);
    const inEvent = active.reduce((acc, x) => acc + toNum(x.quantity), 0);
    const maint = a.condition === "needs_repair" ? toNum(a.quantity_owned) - inEvent : 0;
    return { ...a, in_event: inEvent, maintenance: Math.max(maint, 0), available: Math.max(toNum(a.quantity_owned) - inEvent - Math.max(maint, 0), 0), assignments: asg.filter((x) => x.asset_id === a.id) };
  });
}

// ---------------------------------------------------------------------------
// Cash forecast (spec §95–96)
// ---------------------------------------------------------------------------
export async function getCashForecast(orgId: string) {
  const s = await db();
  const today = todayIso();
  const [pos, receivables, expenses, dues, subs] = await Promise.all([
    getCompanyPosition(orgId),
    getReceivables(orgId),
    s.from("v_expense_balances").select("expense_id, description, outstanding_egp, due_date, project_id").eq("organization_id", orgId).gt("outstanding_egp", 0),
    s.from("v_person_project_dues").select("person_id, category, due, people(full_name)").eq("organization_id", orgId).gt("due", 0),
    getSubscriptions(orgId),
  ]);
  const inflows: CashItem[] = [
    ...receivables.map((r) => ({ amount: toNum(r.outstanding) * toNum(r.fx_rate || 1), date: r.due_date && r.due_date < today ? today : r.due_date, label: `${r.project_code} · ${r.label}`, kind: "collection" as const })),
    // Upcoming subscription periods not yet invoiced
    ...subs.filter((x) => x.status === "active" && x.next_billing_date).flatMap((x) => {
      const out: CashItem[] = [];
      const d = new Date(`${x.next_billing_date}T12:00:00Z`);
      for (let i = 0; i < 6; i++) {
        const iso = d.toISOString().slice(0, 10);
        out.push({ amount: toNum(x.cycle_total) * toNum(x.fx_rate || 1), date: iso, label: `${x.client_name} · ${x.plan_name}`, kind: "subscription" });
        d.setUTCMonth(d.getUTCMonth() + toNum(x.cycle_months || 1));
      }
      return out;
    }),
  ];
  const outflows: CashItem[] = [
    ...rows(expenses).map((e) => ({ amount: toNum(e.outstanding_egp), date: e.due_date, label: e.description, kind: "supplier" as const })),
    ...rows(dues).filter((d) => d.category !== "profit").map((d) => ({ amount: toNum(d.due), date: null, label: `${d.people?.full_name ?? ""} · ${d.category}`, kind: (d.category === "employee_reimbursement" ? "employee" : d.category === "cto" ? "cto" : "partner") as CashItem["kind"] })),
  ];
  const windows = forecastCash(toNum(pos.company_cash), inflows, outflows, today);
  return { windows, inflows, outflows, currentCash: toNum(pos.company_cash), overdueIn: toNum(pos.overdue_receivables) };
}
