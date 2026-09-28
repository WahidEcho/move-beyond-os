-- 0015_history_reconciliation.sql
-- Support for the historical migration (Move Beyond Financial Platform prompt §2, §10, §11):
--   * projects can be flagged as a settled historical snapshot (pre-opening)
--   * closure accepts profit explicitly retained by the company
--   * sponsorship / marketing investments close without a loss allocation (§6, spec §16)
--   * bank statement checks: calculated vs actual bank and the difference (§10)

alter table public.projects
  add column if not exists is_historical_snapshot boolean not null default false,
  add column if not exists historical_note text;

-- ---------------------------------------------------------------------------
-- Closure: retained profit and marketing investments are not open issues
-- ---------------------------------------------------------------------------
create or replace function public.mb_close_project(p_project uuid, p_checklist jsonb default '{}'::jsonb, p_override_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := mb_project_org(p_project);
  v_unpaid numeric := mb_project_unpaid_obligations(p_project);
  v_profit jsonb := mb_project_profit(p_project);
  v_marketing boolean;
  v_pending_tech int;
  v_receivable numeric;
  v_retained numeric;
  v_open_profit numeric;
  v_issues text[] := '{}';
  v_loss_unallocated numeric;
begin
  perform mb_require_permission(v_org, 'projects.close');
  select is_marketing_investment into v_marketing from projects where id = p_project;
  -- For a sponsorship / marketing investment the company's spending IS the investment:
  -- there is no revenue to recover Move Beyond's funding from.
  if v_marketing then v_unpaid := v_unpaid - mb_company_funding_outstanding(p_project); end if;
  select count(*) into v_pending_tech from project_technology_usage u
  where u.project_id = p_project and u.recovery_decision in ('pending','decide_at_settlement')
    and mb_technology_outstanding(u.technology_id) > 0;
  select coalesce(sum(mb_milestone_outstanding(id)), 0) into v_receivable from billing_milestones
  where project_id = p_project and deleted_at is null;
  select coalesce(sum(retained_by_company), 0) into v_retained from profit_distributions
  where project_id = p_project and deleted_at is null;
  v_open_profit := (v_profit->>'undistributed')::numeric - v_retained;

  v_loss_unallocated := case when v_marketing then 0 else greatest(-((v_profit->>'undistributed')::numeric)
     - coalesce((select sum(ll.amount) from loss_allocation_lines ll join loss_allocations la on la.id = ll.loss_allocation_id
                 where la.project_id = p_project and la.deleted_at is null and ll.person_id is null), 0), 0) end;

  if v_receivable > 0 then v_issues := v_issues || ('Client still owes ' || mb_fmt(v_receivable) || ' EGP'); end if;
  if v_unpaid > 0 then v_issues := v_issues || (mb_fmt(v_unpaid) || ' EGP of obligations unpaid'); end if;
  if v_pending_tech > 0 then v_issues := v_issues || 'CTO recovery decision pending'; end if;
  if v_open_profit > 0.5 then v_issues := v_issues || (mb_fmt(v_open_profit) || ' EGP profit neither distributed nor retained'); end if;
  if v_loss_unallocated > 0 then v_issues := v_issues || (mb_fmt(v_loss_unallocated) || ' EGP loss not allocated'); end if;

  if array_length(v_issues, 1) > 0 and coalesce(length(trim(p_override_reason)), 0) < 3 then
    return jsonb_build_object('closed', false, 'issues', to_jsonb(v_issues));
  end if;

  perform mb_set_audit_context(case when array_length(v_issues,1) > 0 then 'override' else 'status_change' end,
                               coalesce(p_override_reason, 'Financially closed'));
  update projects set financial_status = 'financially_closed', closed_at = now(), closed_by = auth.uid()
  where id = p_project;
  return jsonb_build_object('closed', true, 'issues', to_jsonb(v_issues), 'checklist', p_checklist);
end $$;

-- Company retain without paying anyone (e.g. Glory's 108,588 kept by Move Beyond).
create or replace function public.mb_record_company_retained(p_project uuid, p_amount numeric, p_date date, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := mb_project_org(p_project); v_id uuid; v_open numeric;
begin
  perform mb_require_permission(v_org, 'partners.distribute');
  perform mb_assert_project_open(p_project);
  v_open := ((mb_project_profit(p_project))->>'undistributed')::numeric
            - coalesce((select sum(retained_by_company) from profit_distributions where project_id = p_project and deleted_at is null), 0);
  if p_amount > v_open + 0.005 then
    raise exception 'Only % EGP of profit is still unallocated', mb_fmt(v_open) using errcode = '22023';
  end if;
  insert into profit_distributions (organization_id, project_id, distribution_date, distributable_snapshot, total_amount, retained_by_company, notes)
  values (v_org, p_project, coalesce(p_date, current_date), ((mb_project_profit(p_project))->>'distributable_profit')::numeric, 0, p_amount,
          coalesce(p_notes, 'Retained by Move Beyond'))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Bank statement checks (calculated vs actual)
-- ---------------------------------------------------------------------------
create table if not exists public.bank_statement_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_account_id uuid not null references public.cash_accounts(id),
  statement_date date not null,
  statement_balance numeric(14,2) not null,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists bank_statement_checks_idx on public.bank_statement_checks (cash_account_id, statement_date desc);
alter table public.bank_statement_checks enable row level security;
drop policy if exists bank_statement_checks_read on public.bank_statement_checks;
create policy bank_statement_checks_read on public.bank_statement_checks for select using (mb_has_permission(organization_id, 'finance.view'));
drop trigger if exists trg_audit_bank_statement_checks on public.bank_statement_checks;
create trigger trg_audit_bank_statement_checks after insert or update or delete on public.bank_statement_checks
  for each row execute function public.mb_audit_trigger();

create or replace function public.mb_record_bank_statement(p_org uuid, p_cash_account uuid, p_date date, p_balance numeric, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform mb_require_permission(p_org, 'finance.manage');
  insert into bank_statement_checks (organization_id, cash_account_id, statement_date, statement_balance, notes)
  values (p_org, p_cash_account, coalesce(p_date, current_date), p_balance, p_notes)
  returning id into v_id;
  return v_id;
end $$;

-- Latest statement per account vs the system balance on that date.
create or replace view public.v_bank_reconciliation with (security_invoker = true) as
select distinct on (b.cash_account_id)
  b.id, b.organization_id, b.cash_account_id, ca.name as account_name, b.statement_date, b.statement_balance, b.notes, b.created_at,
  coalesce((select sum(l.amount) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
            where l.cash_account_id = b.cash_account_id and l.account_code = 'CASH' and e.entry_date <= b.statement_date), 0)::numeric(14,2) as system_balance,
  (b.statement_balance - coalesce((select sum(l.amount) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
            where l.cash_account_id = b.cash_account_id and l.account_code = 'CASH' and e.entry_date <= b.statement_date), 0))::numeric(14,2) as difference
from public.bank_statement_checks b
join public.cash_accounts ca on ca.id = b.cash_account_id
order by b.cash_account_id, b.statement_date desc, b.created_at desc;

grant execute on function public.mb_record_bank_statement(uuid, uuid, date, numeric, text) to authenticated;
grant execute on function public.mb_record_company_retained(uuid, numeric, date, text) to authenticated;
revoke execute on function public.mb_record_bank_statement(uuid, uuid, date, numeric, text) from anon, public;
revoke execute on function public.mb_record_company_retained(uuid, numeric, date, text) from anon, public;
