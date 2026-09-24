-- 0009_views.sql
-- Single source of aggregated numbers (spec §104). Views are security_invoker so
-- RLS of the underlying tables applies to the caller.

-- Lines that count toward "earned" / "paid" breakdowns: exclude reversed
-- entries and the reversals themselves (their net effect is zero anyway).
create or replace view public.v_effective_lines with (security_invoker = true) as
select l.*, e.entry_date, e.source_type, e.source_id
from public.journal_lines l
join public.journal_entries e on e.id = l.entry_id
where e.reversed_by is null and e.reversal_of is null;

-- ---------------------------------------------------------------------------
-- Cash accounts
-- ---------------------------------------------------------------------------
create or replace view public.v_cash_account_balances with (security_invoker = true) as
select ca.id, ca.organization_id, ca.name, ca.account_type, ca.person_id, ca.is_default, ca.active,
  coalesce(sum(l.amount), 0)::numeric(14,2) as balance,
  coalesce(sum(l.amount) filter (where l.amount > 0 and e.source_type not in ('opening_balance')), 0)::numeric(14,2) as money_in,
  coalesce(-sum(l.amount) filter (where l.amount < 0 and e.source_type not in ('opening_balance')), 0)::numeric(14,2) as money_out,
  coalesce(sum(l.amount) filter (where e.source_type = 'opening_balance'), 0)::numeric(14,2) as opening_balance
from public.cash_accounts ca
left join public.journal_lines l on l.cash_account_id = ca.id and l.account_code = 'CASH'
left join public.journal_entries e on e.id = l.entry_id
group by ca.id;

-- ---------------------------------------------------------------------------
-- Person balances (spec §58, §78): every category separate, then totals.
-- ---------------------------------------------------------------------------
create or replace view public.v_person_balances with (security_invoker = true) as
with dues as (
  select l.person_id,
    -sum(l.amount) filter (where account_code = 'DUE_FUNDING')  as funding_due,
    -sum(l.amount) filter (where account_code = 'DUE_EMPLOYEE') as employee_due,
    -sum(l.amount) filter (where account_code = 'DUE_FEE')      as fee_due,
    -sum(l.amount) filter (where account_code = 'DUE_CTO')      as cto_due,
    -sum(l.amount) filter (where account_code = 'DUE_PROFIT')   as profit_due,
    -sum(l.amount) filter (where account_code = 'DUE_CARRY')    as carry_due,
    -sum(l.amount) filter (where account_code = 'PARTNER_CAPITAL') as capital
  from public.journal_lines l where l.person_id is not null group by l.person_id
), eff as (
  select l.person_id,
    -sum(l.amount) filter (where account_code = 'DUE_FUNDING' and l.amount < 0) as funding_in,
     sum(l.amount) filter (where account_code = 'DUE_FUNDING' and l.amount > 0) as funding_repaid,
    -sum(l.amount) filter (where account_code = 'DUE_FEE' and l.amount < 0) as fee_earned,
     sum(l.amount) filter (where account_code = 'DUE_FEE' and l.amount > 0) as fee_paid,
    -sum(l.amount) filter (where account_code = 'DUE_CTO' and l.amount < 0) as cto_allocated,
     sum(l.amount) filter (where account_code = 'DUE_CTO' and l.amount > 0) as cto_paid,
    -sum(l.amount) filter (where account_code = 'DUE_PROFIT' and l.amount < 0) as profit_entitled,
     sum(l.amount) filter (where account_code = 'DUE_PROFIT' and l.amount > 0) as profit_paid,
    -sum(l.amount) filter (where account_code = 'DUE_EMPLOYEE' and l.amount < 0) as employee_paid_for_company,
     sum(l.amount) filter (where account_code = 'DUE_EMPLOYEE' and l.amount > 0) as employee_reimbursed
  from public.v_effective_lines l where l.person_id is not null group by l.person_id
), held as (
  select ca.person_id, sum(l.amount) as held
  from public.journal_lines l join public.cash_accounts ca on ca.id = l.cash_account_id
  where l.account_code = 'CASH' and ca.account_type = 'partner_holding'
  group by ca.person_id
), cto_claim as (
  select t.developer_person_id as person_id,
    sum(public.mb_technology_value(t.id)) as cto_approved_value,
    sum(public.mb_technology_recovered(t.id)) as cto_recovered,
    sum(public.mb_technology_outstanding(t.id)) as cto_unrecovered
  from public.technology_developments t where t.deleted_at is null and t.lifecycle_status <> 'cancelled'
  group by t.developer_person_id
)
select p.id as person_id, p.organization_id, p.full_name, p.kind, p.is_partner, p.profit_share_pct,
  p.technology_recovery_eligible,
  coalesce(d.funding_due,0)::numeric(14,2)  as funding_due,
  coalesce(d.employee_due,0)::numeric(14,2) as employee_due,
  coalesce(d.fee_due,0)::numeric(14,2)      as fee_due,
  coalesce(d.cto_due,0)::numeric(14,2)      as cto_due,
  coalesce(d.profit_due,0)::numeric(14,2)   as profit_due,
  coalesce(d.carry_due,0)::numeric(14,2)    as carry_due,
  coalesce(d.capital,0)::numeric(14,2)      as capital,
  coalesce(e.funding_in,0)::numeric(14,2)   as funding_in,
  coalesce(e.funding_repaid,0)::numeric(14,2) as funding_repaid,
  coalesce(e.fee_earned,0)::numeric(14,2)   as fee_earned,
  coalesce(e.fee_paid,0)::numeric(14,2)     as fee_paid,
  coalesce(e.cto_allocated,0)::numeric(14,2) as cto_allocated,
  coalesce(e.cto_paid,0)::numeric(14,2)     as cto_paid,
  coalesce(e.profit_entitled,0)::numeric(14,2) as profit_entitled,
  coalesce(e.profit_paid,0)::numeric(14,2)  as profit_paid,
  coalesce(e.employee_paid_for_company,0)::numeric(14,2) as employee_paid_for_company,
  coalesce(e.employee_reimbursed,0)::numeric(14,2) as employee_reimbursed,
  coalesce(h.held,0)::numeric(14,2)         as held_for_company,
  coalesce(c.cto_approved_value,0)::numeric(14,2) as cto_approved_value,
  coalesce(c.cto_recovered,0)::numeric(14,2) as cto_recovered,
  coalesce(c.cto_unrecovered,0)::numeric(14,2) as cto_unrecovered
from public.people p
left join dues d on d.person_id = p.id
left join eff e on e.person_id = p.id
left join held h on h.person_id = p.id
left join cto_claim c on c.person_id = p.id
where p.deleted_at is null;

-- Per person × project × category balance (drives "pay" actions and settlement)
create or replace view public.v_person_project_dues with (security_invoker = true) as
select l.organization_id, l.person_id, l.project_id,
  case l.account_code when 'DUE_FUNDING' then 'funding' when 'DUE_EMPLOYEE' then 'employee_reimbursement'
    when 'DUE_FEE' then 'fee' when 'DUE_CTO' then 'cto' when 'DUE_PROFIT' then 'profit' when 'DUE_CARRY' then 'carry_forward' end as category,
  (-sum(l.amount))::numeric(14,2) as due
from public.journal_lines l
where l.account_code in ('DUE_FUNDING','DUE_EMPLOYEE','DUE_FEE','DUE_CTO','DUE_PROFIT','DUE_CARRY') and l.person_id is not null
group by l.organization_id, l.person_id, l.project_id, l.account_code
having sum(l.amount) <> 0;

-- ---------------------------------------------------------------------------
-- Receivables (spec §30–34)
-- ---------------------------------------------------------------------------
create or replace view public.v_receivables with (security_invoker = true) as
select m.id as milestone_id, m.organization_id, m.project_id, p.code as project_code, p.name as project_name,
  p.client_id, cl.name as client_name, m.label, m.trigger_kind, m.due_date, m.invoiced_at, m.subscription_id,
  coalesce(c.currency, p.currency) as currency, coalesce(c.fx_rate, 1) as fx_rate,
  m.amount::numeric(14,2) as amount,
  coalesce(a.collected, 0)::numeric(14,2) as collected,
  (m.amount - coalesce(a.collected, 0))::numeric(14,2) as outstanding,
  case when m.due_date is not null and m.due_date < current_date and m.amount > coalesce(a.collected,0)
       then current_date - m.due_date else 0 end as days_overdue,
  case
    when m.amount <= coalesce(a.collected,0) then 'paid'
    when m.due_date is null or m.due_date >= current_date then 'current'
    when current_date - m.due_date <= 30 then '1_30'
    when current_date - m.due_date <= 60 then '31_60'
    when current_date - m.due_date <= 90 then '61_90'
    else '90_plus' end as ageing_bucket,
  coalesce(m.reminder_days, c.reminder_days) as reminder_days
from public.billing_milestones m
join public.projects p on p.id = m.project_id and p.deleted_at is null
left join public.contracts c on c.id = m.contract_id
left join public.clients cl on cl.id = p.client_id
left join lateral (
  select sum(ca.amount) as collected from public.collection_allocations ca
  join public.collections co on co.id = ca.collection_id and co.deleted_at is null
  where ca.milestone_id = m.id) a on true
where m.deleted_at is null;

-- ---------------------------------------------------------------------------
-- Expenses with paid / outstanding (spec §38–39)
-- ---------------------------------------------------------------------------
create or replace view public.v_expense_balances with (security_invoker = true) as
select e.id as expense_id, e.organization_id, e.project_id, e.category_id, e.supplier_id, e.description, e.expense_type,
  e.status, e.currency, e.fx_rate, e.due_date, e.created_at, e.related_expense_id, e.capitalize,
  round(coalesce(e.estimated_amount, 0) * e.fx_rate, 2)::numeric(14,2) as estimated_egp,
  round(coalesce(e.committed_amount, 0) * e.fx_rate, 2)::numeric(14,2) as committed_egp,
  coalesce(p.paid_egp, 0)::numeric(14,2) as paid_egp,
  case when e.status = 'cancelled' then 0
       else greatest(round(coalesce(e.committed_amount,0) * e.fx_rate, 2) - coalesce(p.paid_egp,0), 0) end::numeric(14,2) as outstanding_egp,
  -- committed cost used for forecasts: cancelled lines keep only what was paid
  case when e.status = 'cancelled' then coalesce(p.paid_egp,0)
       else greatest(round(coalesce(e.committed_amount,0) * e.fx_rate, 2), coalesce(p.paid_egp,0)) end::numeric(14,2) as committed_cost_egp,
  case when e.committed_amount is null and e.status <> 'cancelled' then round(coalesce(e.estimated_amount,0) * e.fx_rate, 2) else 0 end::numeric(14,2) as uncommitted_estimate_egp,
  p.payers
from public.expenses e
left join lateral (
  select sum(amount_egp) as paid_egp, array_agg(distinct payer_type) as payers
  from public.expense_payments ep where ep.expense_id = e.id and ep.deleted_at is null) p on true
where e.deleted_at is null;

create or replace view public.v_supplier_balances with (security_invoker = true) as
select s.id as supplier_id, s.organization_id, s.name, s.category, s.phone, s.email, s.active,
  coalesce(sum(b.committed_cost_egp), 0)::numeric(14,2) as total_committed,
  coalesce(sum(b.paid_egp), 0)::numeric(14,2) as total_paid,
  coalesce(sum(b.outstanding_egp), 0)::numeric(14,2) as outstanding,
  count(distinct b.project_id) as projects_count,
  min(b.due_date) filter (where b.outstanding_egp > 0) as next_due_date
from public.suppliers s
left join public.v_expense_balances b on b.supplier_id = s.id
where s.deleted_at is null
group by s.id;

-- ---------------------------------------------------------------------------
-- Project financial aggregates (spec §82 Overview, §63–64). The TS engine
-- derives margins and forecasts from these raw sums.
-- ---------------------------------------------------------------------------
create or replace view public.v_project_financials with (security_invoker = true) as
select p.id as project_id, p.organization_id, p.code, p.name, p.client_id, cl.name as client_name, p.project_type,
  p.operational_status, p.financial_status, p.start_date, p.end_date, p.budget_amount, p.is_marketing_investment, p.created_at,
  coalesce(public.mb_project_contract_value(p.id), 0)::numeric(14,2) as contract_value,
  coalesce(r.scheduled, 0)::numeric(14,2) as scheduled,
  coalesce(r.invoiced, 0)::numeric(14,2) as invoiced,
  coalesce(r.receivable, 0)::numeric(14,2) as receivable_outstanding,
  coalesce(r.overdue, 0)::numeric(14,2) as overdue,
  coalesce(lg.revenue, 0)::numeric(14,2) as collected,
  coalesce(lg.direct_cost, 0)::numeric(14,2) as actual_cost,
  coalesce(lg.fee_cost, 0)::numeric(14,2) as fee_cost,
  coalesce(lg.cto_cost, 0)::numeric(14,2) as cto_cost,
  coalesce(lg.distributed, 0)::numeric(14,2) as distributed,
  coalesce(lg.cash_position, 0)::numeric(14,2) as cash_position,
  coalesce(lg.funding_due, 0)::numeric(14,2) as partner_funding_due,
  coalesce(lg.employee_due, 0)::numeric(14,2) as employee_due,
  coalesce(lg.fee_due, 0)::numeric(14,2) as fee_due,
  coalesce(lg.cto_due, 0)::numeric(14,2) as cto_due,
  coalesce(lg.profit_due, 0)::numeric(14,2) as profit_due,
  coalesce(x.committed_cost, 0)::numeric(14,2) as committed_cost,
  coalesce(x.remaining_commitments, 0)::numeric(14,2) as remaining_commitments,
  coalesce(x.uncommitted_estimates, 0)::numeric(14,2) as uncommitted_estimates,
  coalesce(x.estimated_cost, 0)::numeric(14,2) as estimated_cost,
  coalesce(f.suggested_fees, 0)::numeric(14,2) as suggested_fees,
  coalesce(t.planned_cto, 0)::numeric(14,2) as planned_cto,
  coalesce(t.tech_count, 0) as technologies_used,
  public.mb_company_funding_outstanding(p.id)::numeric(14,2) as company_funding_outstanding,
  coalesce(cf.company_funded, 0)::numeric(14,2) as company_funded
from public.projects p
left join public.clients cl on cl.id = p.client_id
left join lateral (
  select sum(amount * fx_rate) as scheduled,
    sum(amount * fx_rate) filter (where invoiced_at is not null) as invoiced,
    sum(outstanding * fx_rate) as receivable,
    sum(outstanding * fx_rate) filter (where days_overdue > 0) as overdue
  from public.v_receivables vr where vr.project_id = p.id) r on true
left join lateral (
  select
    -sum(amount) filter (where account_code = 'REVENUE') as revenue,
     sum(amount) filter (where account_code = 'DIRECT_COST') as direct_cost,
     sum(amount) filter (where account_code = 'PARTNER_FEE_COST') as fee_cost,
     sum(amount) filter (where account_code = 'CTO_RECOVERY_COST') as cto_cost,
     sum(amount) filter (where account_code = 'DISTRIBUTIONS') as distributed,
     sum(amount) filter (where account_code = 'CASH') as cash_position,
    -sum(amount) filter (where account_code = 'DUE_FUNDING') as funding_due,
    -sum(amount) filter (where account_code = 'DUE_EMPLOYEE') as employee_due,
    -sum(amount) filter (where account_code = 'DUE_FEE') as fee_due,
    -sum(amount) filter (where account_code = 'DUE_CTO') as cto_due,
    -sum(amount) filter (where account_code = 'DUE_PROFIT') as profit_due
  from public.journal_lines jl where jl.project_id = p.id) lg on true
left join lateral (
  select sum(committed_cost_egp) as committed_cost, sum(outstanding_egp) as remaining_commitments,
         sum(uncommitted_estimate_egp) as uncommitted_estimates,
         sum(case when estimated_egp > 0 then estimated_egp else committed_cost_egp end) as estimated_cost
  from public.v_expense_balances b where b.project_id = p.id) x on true
left join lateral (
  select sum(amount) as suggested_fees from public.partner_fees pf where pf.project_id = p.id and pf.status = 'suggested') f on true
left join lateral (
  select count(*) as tech_count,
    sum(case when u.recovery_decision in ('add_recovery','decide_at_settlement')
             then greatest(coalesce(u.planned_recovery,0)
                  - coalesce((select sum(a.amount) from public.cto_recovery_allocations a
                              where a.project_id = p.id and a.technology_id = u.technology_id and a.status = 'allocated'),0), 0)
             else 0 end) as planned_cto
  from public.project_technology_usage u where u.project_id = p.id) t on true
left join lateral (
  select sum(pf.amount_egp) as company_funded from public.project_funding pf join public.funders fu on fu.id = pf.funder_id
  where pf.project_id = p.id and pf.deleted_at is null and fu.funder_type = 'company') cf on true
where p.deleted_at is null;

-- Funding by funder per project (spec §24, §82 Funding tab)
create or replace view public.v_project_funding_by_funder with (security_invoker = true) as
select pf.organization_id, pf.project_id, pf.funder_id, fu.name as funder_name, fu.funder_type, fu.person_id,
  sum(pf.amount_egp)::numeric(14,2) as funded,
  case when fu.funder_type = 'company' then
    coalesce((select sum(amount) from public.payouts po where po.project_id = pf.project_id and po.category = 'company_recovery' and po.deleted_at is null), 0)
  else
    coalesce((select sum(amount) from public.payouts po where po.project_id = pf.project_id and po.person_id = fu.person_id
              and po.category = 'funding' and po.deleted_at is null), 0)
  end::numeric(14,2) as repaid
from public.project_funding pf join public.funders fu on fu.id = pf.funder_id
where pf.deleted_at is null
group by pf.organization_id, pf.project_id, pf.funder_id, fu.name, fu.funder_type, fu.person_id;

-- ---------------------------------------------------------------------------
-- Technology recovery (spec §57, §62)
-- ---------------------------------------------------------------------------
create or replace view public.v_technology_recovery with (security_invoker = true) as
select t.id as technology_id, t.organization_id, t.name, t.description, t.developer_person_id, pe.full_name as developer_name,
  t.category_id, tc.name as category_name, t.original_project_id, op.code as original_project_code, op.name as original_project_name,
  t.lifecycle_status, t.reusable, t.ownership, t.completion_date, t.created_at,
  public.mb_technology_value(t.id)::numeric(14,2) as approved_value,
  public.mb_technology_recovered(t.id)::numeric(14,2) as recovered,
  public.mb_technology_outstanding(t.id)::numeric(14,2) as outstanding,
  (select count(*) from public.project_technology_usage u where u.technology_id = t.id) as projects_used,
  (select count(distinct a.project_id) from public.cto_recovery_allocations a where a.technology_id = t.id and a.status = 'allocated' and a.project_id is not null) as projects_recovered_from,
  coalesce((select -sum(jl.amount) from public.journal_lines jl
            where jl.account_code = 'REVENUE' and jl.project_id in (select u.project_id from public.project_technology_usage u where u.technology_id = t.id)), 0)::numeric(14,2) as revenue_influenced,
  case
    when t.lifecycle_status = 'cancelled' then 'cancelled'
    when t.lifecycle_status = 'archived' then 'archived'
    when public.mb_technology_value(t.id) = 0 then 'no_value'
    when public.mb_technology_outstanding(t.id) <= 0 then 'fully_recovered'
    when public.mb_technology_recovered(t.id) > 0 then 'partially_recovered'
    else 'recovery_pending' end as recovery_status
from public.technology_developments t
join public.people pe on pe.id = t.developer_person_id
left join public.technology_categories tc on tc.id = t.category_id
left join public.projects op on op.id = t.original_project_id
where t.deleted_at is null;

-- ---------------------------------------------------------------------------
-- Company position & reserve (D4)
-- ---------------------------------------------------------------------------
create or replace view public.v_company_position with (security_invoker = true) as
with base as (
  select o.id as organization_id,
    coalesce((select sum(balance) from public.v_cash_account_balances b where b.organization_id = o.id and b.account_type in ('company_bank','cash')), 0) as company_cash,
    coalesce((select sum(balance) from public.v_cash_account_balances b where b.organization_id = o.id and b.account_type = 'partner_holding'), 0) as held_by_partners,
    coalesce((select sum(outstanding_egp) from public.v_expense_balances e where e.organization_id = o.id), 0) as unpaid_suppliers,
    coalesce((select -sum(amount) from public.journal_lines l where l.organization_id = o.id and l.account_code = 'DUE_EMPLOYEE'), 0) as employee_dues,
    coalesce((select -sum(amount) from public.journal_lines l where l.organization_id = o.id
              and l.account_code in ('DUE_FUNDING','DUE_FEE','DUE_CTO','DUE_PROFIT','DUE_CARRY')), 0) as partner_dues,
    coalesce((select sum(outstanding * fx_rate) from public.v_receivables r where r.organization_id = o.id), 0) as receivables,
    coalesce((select sum(outstanding * fx_rate) from public.v_receivables r where r.organization_id = o.id and r.days_overdue > 0), 0) as overdue_receivables,
    coalesce(s.reserve_target, 100000) as reserve_target
  from public.organizations o
  left join public.organization_settings s on s.organization_id = o.id
)
select organization_id,
  company_cash::numeric(14,2), held_by_partners::numeric(14,2), unpaid_suppliers::numeric(14,2),
  employee_dues::numeric(14,2), partner_dues::numeric(14,2), receivables::numeric(14,2),
  overdue_receivables::numeric(14,2), reserve_target::numeric(14,2),
  -- D4: Available Reserve = company cash − unpaid suppliers − employee dues − net partner dues.
  -- Net partner dues = what partners are owed minus company money they already hold (never below 0).
  greatest(partner_dues - held_by_partners, 0)::numeric(14,2) as net_partner_dues,
  (company_cash - unpaid_suppliers - employee_dues - greatest(partner_dues - held_by_partners, 0))::numeric(14,2) as available_reserve
from base;

-- Monthly company P&L from the ledger (D4)
create or replace view public.v_company_pnl_monthly with (security_invoker = true) as
select l.organization_id, date_trunc('month', e.entry_date)::date as month,
  (-sum(l.amount) filter (where l.account_code = 'REVENUE'))::numeric(14,2) as revenue,
  (sum(l.amount) filter (where l.account_code = 'DIRECT_COST'))::numeric(14,2) as direct_cost,
  (sum(l.amount) filter (where l.account_code = 'PARTNER_FEE_COST'))::numeric(14,2) as fee_cost,
  (sum(l.amount) filter (where l.account_code = 'CTO_RECOVERY_COST'))::numeric(14,2) as cto_cost,
  (sum(l.amount) filter (where l.account_code = 'OVERHEAD'))::numeric(14,2) as overhead
from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
group by l.organization_id, date_trunc('month', e.entry_date);

-- ---------------------------------------------------------------------------
-- Deleted records (spec §85)
-- ---------------------------------------------------------------------------
create or replace view public.v_deleted_records with (security_invoker = true) as
select 'expense' as record_type, id, organization_id, project_id, description as label, committed_amount as amount, deleted_at, deleted_reason from public.expenses where deleted_at is not null
union all
select 'expense_payment', id, organization_id, project_id, coalesce(reference, 'Payment'), amount_egp, deleted_at, deleted_reason from public.expense_payments where deleted_at is not null
union all
select 'collection', id, organization_id, project_id, coalesce(reference, 'Client payment'), amount_egp, deleted_at, deleted_reason from public.collections where deleted_at is not null
union all
select 'funding', id, organization_id, project_id, coalesce(notes, 'Funding'), amount_egp, deleted_at, deleted_reason from public.project_funding where deleted_at is not null
union all
select 'payout', id, organization_id, project_id, category, amount, deleted_at, deleted_reason from public.payouts where deleted_at is not null
union all
select 'contract_adjustment', id, organization_id, project_id, description, amount, deleted_at, deleted_reason from public.contract_adjustments where deleted_at is not null
union all
select 'profit_distribution', id, organization_id, project_id, 'Profit distribution', total_amount, deleted_at, deleted_reason from public.profit_distributions where deleted_at is not null
union all
select 'project', id, organization_id, id, code || ' ' || name, null, deleted_at, deleted_reason from public.projects where deleted_at is not null
union all
select 'client', id, organization_id, null, name, null, deleted_at, deleted_reason from public.clients where deleted_at is not null
union all
select 'supplier', id, organization_id, null, name, null, deleted_at, deleted_reason from public.suppliers where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- Global search (spec §22, §108)
-- ---------------------------------------------------------------------------
create or replace function public.mb_search(p_org uuid, p_query text, p_limit int default 20)
returns table (kind text, id uuid, title text, subtitle text, href text, score real)
language sql stable security invoker set search_path = public as $$
  with q as (select lower(trim(p_query)) as q)
  select * from (
    select 'project'::text, p.id, p.code || ' · ' || p.name, coalesce(c.name, ''), '/finance/projects/' || p.id,
           greatest(similarity(lower(p.name), q.q), case when lower(p.code) like q.q || '%' then 1 else 0 end)::real
    from projects p left join clients c on c.id = p.client_id, q
    where p.organization_id = p_org and p.deleted_at is null
      and (lower(p.name) like '%' || q.q || '%' or lower(p.code) like '%' || q.q || '%' or lower(coalesce(c.name,'')) like '%' || q.q || '%')
    union all
    select 'client', c.id, c.name, coalesce(c.company_name, c.client_type), '/finance/clients/' || c.id, similarity(lower(c.name), q.q)
    from clients c, q where c.organization_id = p_org and c.deleted_at is null and lower(c.name) like '%' || q.q || '%'
    union all
    select 'supplier', s.id, s.name, coalesce(s.category, 'Supplier'), '/finance/suppliers/' || s.id, similarity(lower(s.name), q.q)
    from suppliers s, q where s.organization_id = p_org and s.deleted_at is null and lower(s.name) like '%' || q.q || '%'
    union all
    select 'service', sv.id, sv.name, sc.name, '/settings/services', similarity(lower(sv.name), q.q)
    from services sv join service_categories sc on sc.id = sv.category_id, q
    where sv.organization_id = p_org and lower(sv.name) like '%' || q.q || '%'
    union all
    select 'technology', t.id, t.name, 'Technology', '/finance/cto/' || t.id, similarity(lower(t.name), q.q)
    from technology_developments t, q where t.organization_id = p_org and t.deleted_at is null and lower(t.name) like '%' || q.q || '%'
    union all
    select 'asset', a.id, a.name, coalesce(a.serial_number, 'Asset'), '/finance/assets', similarity(lower(a.name), q.q)
    from assets a, q where a.organization_id = p_org and a.deleted_at is null and lower(a.name) like '%' || q.q || '%'
  ) r
  order by 6 desc, 3
  limit p_limit;
$$;
