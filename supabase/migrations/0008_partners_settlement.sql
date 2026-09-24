-- 0008_partners_settlement.sql
-- Partner fees, profit distribution (+ reinvestment), loss allocation,
-- carry-forwards, opening balances, settlement execution, closure/reopen.

-- ---------------------------------------------------------------------------
-- Partner / commercial fees (spec §42–43)
-- ---------------------------------------------------------------------------
create table public.fee_presets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  fee_type text not null check (fee_type in ('management','lead_generation','sales_commission','project','consulting','custom')),
  basis text not null check (basis in ('pct_contract','pct_revenue','pct_gross_profit','pct_net_profit','fixed')),
  rate numeric(8,4),                -- percent for pct_* bases
  fixed_amount numeric(14,2),
  trigger_project_role text check (trigger_project_role in ('project_manager','event_manager','lead_generator','operations','staff','other')),
  default_treatment text not null default 'project_cost' check (default_treatment in ('project_cost','from_share')),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.partner_fees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  person_id uuid not null references public.people(id),
  preset_id uuid references public.fee_presets(id),
  fee_type text not null check (fee_type in ('management','lead_generation','sales_commission','project','consulting','custom')),
  basis text not null check (basis in ('pct_contract','pct_revenue','pct_gross_profit','pct_net_profit','fixed')),
  rate numeric(8,4),
  base_amount numeric(14,2),
  amount numeric(14,2) not null check (amount >= 0),
  treatment text not null default 'project_cost' check (treatment in ('project_cost','from_share')),
  status text not null default 'suggested' check (status in ('suggested','accepted','ignored','reversed')),
  description text,
  journal_entry_id uuid references public.journal_entries(id),
  accepted_at timestamptz,
  reversed_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.partner_fees (project_id);
create unique index partner_fees_one_suggestion on public.partner_fees (project_id, person_id, preset_id)
  where status in ('suggested','accepted') and preset_id is not null;

-- ---------------------------------------------------------------------------
-- Profit distribution (spec §65, §67) and loss allocation (§68, D5)
-- ---------------------------------------------------------------------------
create table public.profit_distributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  distribution_date date not null,
  distributable_snapshot numeric(14,2),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  retained_by_company numeric(14,2) not null default 0,     -- reserve recommendation accepted (not distributed)
  obligations_unpaid_snapshot numeric(14,2),                -- for the §77 warning audit
  settlement_id uuid,
  notes text,
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);

create table public.profit_distribution_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  distribution_id uuid not null references public.profit_distributions(id) on delete cascade,
  person_id uuid not null references public.people(id),
  share_pct numeric(6,3),
  amount numeric(14,2) not null check (amount >= 0),          -- entitlement from this distribution
  reinvested numeric(14,2) not null default 0 check (reinvested >= 0),   -- partner reinvestment / reserve contribution
  check (reinvested <= amount)
);

create table public.loss_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  allocation_date date not null,
  loss_amount numeric(14,2) not null check (loss_amount > 0),
  notes text,
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);

create table public.loss_allocation_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  loss_allocation_id uuid not null references public.loss_allocations(id) on delete cascade,
  person_id uuid references public.people(id),   -- null = Move Beyond absorbs
  amount numeric(14,2) not null check (amount > 0)
);

-- Carry-forward / historical adjustments and opening balances (spec §69, E9)
create table public.recovery_carryforwards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid references public.people(id),
  cash_account_id uuid references public.cash_accounts(id),
  category text not null check (category in ('funding','employee_reimbursement','fee','cto','profit','carry_forward','cash')),
  project_id uuid references public.projects(id),
  amount numeric(14,2) not null check (amount <> 0),     -- + = company owes the person / cash held
  effective_date date not null,
  reason text not null,
  is_opening boolean not null default false,
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);

-- ---------------------------------------------------------------------------
-- Settlements (spec §74–77)
-- ---------------------------------------------------------------------------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  settlement_date date not null,
  available_cash_snapshot numeric(14,2),
  total_paid numeric(14,2) not null default 0,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.settlement_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  sort_order int not null,
  line_type text not null check (line_type in ('supplier','employee','partner_funding','company_funding','fee','cto','carry_forward')),
  label text,
  suggested_amount numeric(14,2),
  amount numeric(14,2) not null check (amount > 0),
  person_id uuid references public.people(id),
  expense_id uuid references public.expenses(id),
  fee_id uuid references public.partner_fees(id),
  technology_id uuid references public.technology_developments(id),
  treatment text,
  cash_account_id uuid references public.cash_accounts(id),
  result_ref uuid,                    -- payout / payment / allocation id
  created_at timestamptz not null default now()
);

alter table public.payouts add constraint payouts_settlement_fk foreign key (settlement_id) references public.settlements(id);
alter table public.cto_recovery_allocations add constraint cto_alloc_settlement_fk foreign key (settlement_id) references public.settlements(id);
alter table public.profit_distributions add constraint distributions_settlement_fk foreign key (settlement_id) references public.settlements(id);

-- ---------------------------------------------------------------------------
-- Ledger-derived project figures used by fee bases and checks
-- ---------------------------------------------------------------------------
create or replace function public.mb_project_ledger_sum(p_project uuid, p_account text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from journal_lines where project_id = p_project and account_code = p_account;
$$;

create or replace function public.mb_project_contract_value(p_project uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(c.original_value * c.fx_rate, 0)
       + coalesce((select sum(a.amount) * c.fx_rate from contract_adjustments a where a.contract_id = c.id and a.deleted_at is null), 0)
  from contracts c where c.project_id = p_project;
$$;

-- revenue, direct cost, fees, cto, distributions → profit figures
create or replace function public.mb_project_profit(p_project uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (
    select
      -mb_project_ledger_sum(p_project, 'REVENUE') as revenue,
      mb_project_ledger_sum(p_project, 'DIRECT_COST') as direct_cost,
      mb_project_ledger_sum(p_project, 'PARTNER_FEE_COST') as fee_cost,
      mb_project_ledger_sum(p_project, 'CTO_RECOVERY_COST') as cto_cost,
      mb_project_ledger_sum(p_project, 'DISTRIBUTIONS') as distributed)
  select jsonb_build_object(
    'revenue', revenue, 'direct_cost', direct_cost, 'fee_cost', fee_cost, 'cto_cost', cto_cost,
    'gross_profit', revenue - direct_cost,
    'distributable_profit', revenue - direct_cost - fee_cost - cto_cost,
    'distributed', distributed,
    'undistributed', revenue - direct_cost - fee_cost - cto_cost - distributed)
  from s;
$$;

create or replace function public.mb_fee_base(p_project uuid, p_basis text)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v jsonb := mb_project_profit(p_project);
begin
  return case p_basis
    when 'pct_contract' then mb_project_contract_value(p_project)
    when 'pct_revenue' then (v->>'revenue')::numeric
    when 'pct_gross_profit' then greatest((v->>'gross_profit')::numeric, 0)
    when 'pct_net_profit' then greatest((v->>'gross_profit')::numeric - (v->>'cto_cost')::numeric, 0)
    else null end;
end $$;

-- ---------------------------------------------------------------------------
-- Fee RPCs
-- ---------------------------------------------------------------------------
create or replace function public.mb_post_fee(p_fee uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f partner_fees; v_entry uuid;
begin
  select * into f from partner_fees where id = p_fee for update;
  if f.amount <= 0 then raise exception 'Fee amount must be positive'; end if;
  v_entry := mb_post_entry(f.organization_id, current_date, 'partner_fee', f.id, f.project_id,
    initcap(replace(f.fee_type, '_', ' ')) || ' fee',
    jsonb_build_array(
      jsonb_build_object('account', case when f.treatment = 'project_cost' then 'PARTNER_FEE_COST' else 'DISTRIBUTIONS' end,
                         'amount', f.amount, 'person_id', case when f.treatment = 'from_share' then f.person_id end),
      jsonb_build_object('account','DUE_FEE','amount', -f.amount, 'person_id', f.person_id)));
  update partner_fees set status = 'accepted', accepted_at = now(), journal_entry_id = v_entry where id = p_fee;
end $$;

-- Generate suggestions from presets + project roles. Never auto-applies (§43).
create or replace function public.mb_suggest_fees(p_project uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_org uuid := mb_project_org(p_project); r record; v_base numeric; v_n int := 0;
begin
  perform mb_require_permission(v_org, 'finance.manage');
  for r in
    select fp.*, pm.person_id from fee_presets fp
    join project_members pm on pm.project_role = fp.trigger_project_role and pm.project_id = p_project
    join people pe on pe.id = pm.person_id and pe.is_partner
    where fp.organization_id = v_org and fp.active
      and not exists (select 1 from partner_fees x where x.project_id = p_project and x.person_id = pm.person_id
                      and x.preset_id = fp.id and x.status in ('suggested','accepted','ignored'))
  loop
    v_base := mb_fee_base(p_project, r.basis);
    insert into partner_fees (organization_id, project_id, person_id, preset_id, fee_type, basis, rate, base_amount, amount, treatment, status, description)
    values (v_org, p_project, r.person_id, r.id, r.fee_type, r.basis, r.rate, v_base,
            round(case when r.basis = 'fixed' then coalesce(r.fixed_amount,0) else coalesce(v_base,0) * coalesce(r.rate,0) / 100 end, 2),
            r.default_treatment, 'suggested', r.name);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Add a fee directly (accepted) — p_payload {person_id, fee_type, basis, rate, amount, treatment, description}
create or replace function public.mb_add_partner_fee(p_project uuid, p_payload jsonb, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := mb_project_org(p_project);
  v_prev jsonb; v_id uuid; v_base numeric; v_amount numeric;
  v_basis text := coalesce(nullif(p_payload->>'basis',''), 'fixed');
begin
  perform mb_require_permission(v_org, 'finance.manage');
  perform mb_assert_project_open(p_project);
  v_prev := mb_idem_claim(v_org, p_idempotency_key, 'add_fee');
  if v_prev is not null then return v_prev; end if;
  if not exists (select 1 from people where id = (p_payload->>'person_id')::uuid and organization_id = v_org and is_partner) then
    raise exception 'Partner fees can only be assigned to partners' using errcode = '22023';
  end if;
  v_base := mb_fee_base(p_project, v_basis);
  v_amount := coalesce(nullif(p_payload->>'amount','')::numeric,
                       round(coalesce(v_base,0) * coalesce(nullif(p_payload->>'rate','')::numeric,0) / 100, 2));
  insert into partner_fees (organization_id, project_id, person_id, fee_type, basis, rate, base_amount, amount, treatment, status, description)
  values (v_org, p_project, (p_payload->>'person_id')::uuid, coalesce(nullif(p_payload->>'fee_type',''),'custom'), v_basis,
          nullif(p_payload->>'rate','')::numeric, v_base, v_amount,
          coalesce(nullif(p_payload->>'treatment',''),'project_cost'), 'suggested', p_payload->>'description')
  returning id into v_id;
  perform mb_post_fee(v_id);
  return mb_idem_store(v_org, p_idempotency_key, jsonb_build_object('fee_id', v_id));
end $$;

-- Accept (optionally edited) or ignore a suggestion (§43 Accept / Edit / Ignore)
create or replace function public.mb_decide_fee(p_fee uuid, p_decision text, p_amount numeric default null, p_treatment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare f partner_fees;
begin
  select * into f from partner_fees where id = p_fee for update;
  if not found then raise exception 'Fee not found'; end if;
  perform mb_require_permission(f.organization_id, 'finance.manage');
  perform mb_assert_project_open(f.project_id);
  if f.status not in ('suggested','ignored') then raise exception 'Fee already %', f.status; end if;
  if p_decision = 'ignore' then
    update partner_fees set status = 'ignored' where id = p_fee;
  elsif p_decision = 'accept' then
    update partner_fees set amount = coalesce(p_amount, amount), treatment = coalesce(p_treatment, treatment) where id = p_fee;
    perform mb_post_fee(p_fee);
  else
    raise exception 'Decision must be accept or ignore';
  end if;
end $$;

create or replace function public.mb_reverse_fee(p_fee uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare f partner_fees; v_due numeric;
begin
  select * into f from partner_fees where id = p_fee for update;
  if not found then raise exception 'Fee not found'; end if;
  perform mb_require_permission(f.organization_id, 'finance.manage');
  perform mb_assert_project_open(f.project_id);
  perform mb_require_reason(p_reason);
  if f.status <> 'accepted' then
    update partner_fees set status = 'reversed', reversed_reason = p_reason where id = p_fee;
    return;
  end if;
  v_due := mb_person_due(f.organization_id, f.person_id, 'fee', f.project_id);
  if v_due < f.amount then
    raise exception 'Part of this fee has already been paid. Reverse the payment first.' using errcode = '22023';
  end if;
  perform mb_set_audit_context('reversed', p_reason);
  perform mb_reverse_entry(f.journal_entry_id, p_reason);
  update partner_fees set status = 'reversed', reversed_reason = p_reason where id = p_fee;
end $$;

-- ---------------------------------------------------------------------------
-- Unpaid project obligations (used for the §77 warning and closure checks)
-- ---------------------------------------------------------------------------
create or replace function public.mb_project_unpaid_obligations(p_project uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select
    coalesce((select sum(greatest(coalesce(e.committed_amount,0) * e.fx_rate
                - coalesce((select sum(amount_egp) from expense_payments p where p.expense_id = e.id and p.deleted_at is null),0), 0))
              from expenses e where e.project_id = p_project and e.deleted_at is null and e.status <> 'cancelled'), 0)
  + coalesce((select -sum(amount) from journal_lines where project_id = p_project
              and account_code in ('DUE_EMPLOYEE','DUE_FUNDING','DUE_FEE','DUE_CTO')), 0)
  + mb_company_funding_outstanding(p_project);
$$;

-- ---------------------------------------------------------------------------
-- Profit distribution. Lines are computed by the settlement engine (TS) and
-- validated here. p_payload: {date, lines:[{person_id, share_pct, amount, reinvested}],
--   retained_by_company, notes, pay_now, cash_account_id, settlement_id, acknowledge_unpaid}
-- ---------------------------------------------------------------------------
create or replace function public.mb_distribute_profit(p_project uuid, p_payload jsonb, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := mb_project_org(p_project);
  v_prev jsonb; v_id uuid; v_entry uuid;
  v_profit jsonb; v_total numeric; v_unpaid numeric;
  v_lines jsonb := coalesce(p_payload->'lines', '[]'::jsonb);
  v_je jsonb := '[]'::jsonb;
  v_date date := coalesce(nullif(p_payload->>'date','')::date, current_date);
  l jsonb;
begin
  perform mb_require_permission(v_org, 'partners.distribute');
  perform mb_assert_project_open(p_project);
  v_prev := mb_idem_claim(v_org, p_idempotency_key, 'distribute_profit');
  if v_prev is not null then return v_prev; end if;

  perform 1 from projects where id = p_project for update;    -- serialise distributions per project
  v_profit := mb_project_profit(p_project);
  select coalesce(sum((x->>'amount')::numeric), 0) into v_total from jsonb_array_elements(v_lines) x;
  if v_total <= 0 then raise exception 'Nothing to distribute' using errcode = '22023'; end if;
  if v_total > (v_profit->>'undistributed')::numeric + 0.005 then
    raise exception 'Distribution of % exceeds undistributed project profit of % EGP', mb_fmt(v_total),
      mb_fmt((v_profit->>'undistributed')::numeric) using errcode = '22023';
  end if;

  v_unpaid := mb_project_unpaid_obligations(p_project);
  if v_unpaid > 0 and not coalesce((p_payload->>'acknowledge_unpaid')::boolean, false) then
    raise exception 'UNPAID_OBLIGATIONS:% EGP of project obligations remain unpaid.', mb_fmt(v_unpaid) using errcode = 'P0002';
  end if;

  insert into profit_distributions (organization_id, project_id, distribution_date, distributable_snapshot, total_amount,
                                    retained_by_company, obligations_unpaid_snapshot, settlement_id, notes)
  values (v_org, p_project, v_date, (v_profit->>'distributable_profit')::numeric, v_total,
          coalesce(nullif(p_payload->>'retained_by_company','')::numeric, 0), v_unpaid,
          nullif(p_payload->>'settlement_id','')::uuid, p_payload->>'notes')
  returning id into v_id;

  for l in select * from jsonb_array_elements(v_lines) loop
    continue when coalesce((l->>'amount')::numeric, 0) = 0;
    if not exists (select 1 from people where id = (l->>'person_id')::uuid and organization_id = v_org and is_partner) then
      raise exception 'Profit can only be distributed to partners';
    end if;
    insert into profit_distribution_lines (organization_id, distribution_id, person_id, share_pct, amount, reinvested)
    values (v_org, v_id, (l->>'person_id')::uuid, nullif(l->>'share_pct','')::numeric, (l->>'amount')::numeric,
            coalesce(nullif(l->>'reinvested','')::numeric, 0));
    v_je := v_je
      || jsonb_build_array(jsonb_build_object('account','DISTRIBUTIONS','amount', (l->>'amount')::numeric, 'person_id', l->>'person_id'))
      || jsonb_build_array(jsonb_build_object('account','DUE_PROFIT',
             'amount', -((l->>'amount')::numeric - coalesce(nullif(l->>'reinvested','')::numeric, 0)), 'person_id', l->>'person_id'))
      || jsonb_build_array(jsonb_build_object('account','PARTNER_CAPITAL',
             'amount', -coalesce(nullif(l->>'reinvested','')::numeric, 0), 'person_id', l->>'person_id', 'project_id', null));
  end loop;

  perform mb_set_audit_context('profit_distribution', case when v_unpaid > 0 then 'Distributed with ' || mb_fmt(v_unpaid) || ' EGP obligations unpaid' end);
  v_entry := mb_post_entry(v_org, v_date, 'profit_distribution', v_id, p_project, 'Profit distribution', v_je);
  update profit_distributions set journal_entry_id = v_entry where id = v_id;

  if coalesce((p_payload->>'pay_now')::boolean, false) then
    for l in select * from jsonb_array_elements(v_lines) loop
      if (l->>'amount')::numeric - coalesce(nullif(l->>'reinvested','')::numeric, 0) > 0 then
        perform mb_pay_person_internal(v_org, (l->>'person_id')::uuid, 'profit', p_project,
          (l->>'amount')::numeric - coalesce(nullif(l->>'reinvested','')::numeric, 0), v_date,
          nullif(p_payload->>'cash_account_id','')::uuid, null, 'Profit payout', nullif(p_payload->>'settlement_id','')::uuid);
      end if;
    end loop;
  end if;

  update projects set financial_status = 'partially_settled'
  where id = p_project and financial_status not in ('financially_closed');
  return mb_idem_store(v_org, p_idempotency_key, jsonb_build_object('distribution_id', v_id, 'journal_entry_id', v_entry));
end $$;

create or replace function public.mb_reverse_distribution(p_distribution uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare d profit_distributions; r record;
begin
  select * into d from profit_distributions where id = p_distribution for update;
  if not found then raise exception 'Distribution not found'; end if;
  perform mb_require_permission(d.organization_id, 'partners.distribute');
  perform mb_assert_project_open(d.project_id);
  perform mb_require_reason(p_reason);
  if d.deleted_at is not null then return; end if;
  for r in select person_id, amount - reinvested as due from profit_distribution_lines where distribution_id = d.id loop
    if mb_person_due(d.organization_id, r.person_id, 'profit', d.project_id) < r.due then
      raise exception 'Profit from this distribution was already paid out. Reverse those payouts first.' using errcode = '22023';
    end if;
  end loop;
  perform mb_set_audit_context('reversed', p_reason);
  perform mb_reverse_entry(d.journal_entry_id, p_reason);
  update profit_distributions set deleted_at = now(), deleted_reason = p_reason where id = d.id;
end $$;

-- Loss allocation (netted, D5). p_lines: [{person_id|null, amount}]
create or replace function public.mb_allocate_loss(p_project uuid, p_lines jsonb, p_date date default null, p_notes text default null,
                                                   p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := mb_project_org(p_project);
  v_prev jsonb; v_id uuid; v_entry uuid; v_loss numeric; v_total numeric; l jsonb;
  v_je jsonb := '[]'::jsonb;
begin
  perform mb_require_permission(v_org, 'partners.distribute');
  perform mb_assert_project_open(p_project);
  v_prev := mb_idem_claim(v_org, p_idempotency_key, 'allocate_loss');
  if v_prev is not null then return v_prev; end if;
  perform 1 from projects where id = p_project for update;

  v_loss := -((mb_project_profit(p_project))->>'undistributed')::numeric
            - coalesce((select sum(ll.amount) from loss_allocation_lines ll join loss_allocations la on la.id = ll.loss_allocation_id
                        where la.project_id = p_project and la.deleted_at is null and ll.person_id is null), 0);
  select coalesce(sum((x->>'amount')::numeric),0) into v_total from jsonb_array_elements(p_lines) x;
  if v_loss <= 0 then raise exception 'This project has no unallocated loss' using errcode = '22023'; end if;
  if v_total > v_loss + 0.005 then
    raise exception 'Allocation of % exceeds the unallocated loss of % EGP', mb_fmt(v_total), mb_fmt(v_loss) using errcode = '22023';
  end if;

  insert into loss_allocations (organization_id, project_id, allocation_date, loss_amount, notes)
  values (v_org, p_project, coalesce(p_date, current_date), v_total, p_notes) returning id into v_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    continue when coalesce((l->>'amount')::numeric, 0) <= 0;
    insert into loss_allocation_lines (organization_id, loss_allocation_id, person_id, amount)
    values (v_org, v_id, nullif(l->>'person_id','')::uuid, (l->>'amount')::numeric);
    if nullif(l->>'person_id','') is not null then
      v_je := v_je
        || jsonb_build_array(jsonb_build_object('account','DUE_CARRY','amount', (l->>'amount')::numeric, 'person_id', l->>'person_id'))
        || jsonb_build_array(jsonb_build_object('account','DISTRIBUTIONS','amount', -(l->>'amount')::numeric, 'person_id', l->>'person_id'));
    end if;
  end loop;
  if jsonb_array_length(v_je) > 0 then
    v_entry := mb_post_entry(v_org, coalesce(p_date, current_date), 'loss_allocation', v_id, p_project, 'Loss allocation', v_je);
    update loss_allocations set journal_entry_id = v_entry where id = v_id;
  end if;
  return mb_idem_store(v_org, p_idempotency_key, jsonb_build_object('loss_allocation_id', v_id));
end $$;

-- ---------------------------------------------------------------------------
-- Carry-forward & opening balances (spec §69, E9)
--   category cash         → cash held in a cash account (bank/partner holding)
--   other categories      → amount due to a person (+ owed to person, − person owes)
-- ---------------------------------------------------------------------------
create or replace function public.mb_post_opening_balance(p_org uuid, p_payload jsonb, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prev jsonb; v_id uuid; v_entry uuid;
  v_cat text := p_payload->>'category';
  v_amount numeric := (p_payload->>'amount')::numeric;
  v_person uuid := nullif(p_payload->>'person_id','')::uuid;
  v_cash uuid := nullif(p_payload->>'cash_account_id','')::uuid;
  v_project uuid := nullif(p_payload->>'project_id','')::uuid;
  v_date date := coalesce(nullif(p_payload->>'date','')::date, current_date);
  v_reason text := coalesce(nullif(p_payload->>'reason',''), 'Opening balance');
  v_opening boolean := coalesce((p_payload->>'is_opening')::boolean, true);
  v_lines jsonb;
begin
  perform mb_require_permission(p_org, 'finance.manage');
  v_prev := mb_idem_claim(p_org, p_idempotency_key, 'opening_balance');
  if v_prev is not null then return v_prev; end if;
  if v_amount is null or v_amount = 0 then raise exception 'Amount is required' using errcode = '22023'; end if;

  if v_cat = 'cash' then
    if v_cash is null then raise exception 'Choose a cash account'; end if;
    v_lines := jsonb_build_array(
      jsonb_build_object('account','CASH','amount', v_amount, 'cash_account_id', v_cash),
      jsonb_build_object('account','OPENING_EQUITY','amount', -v_amount));
  else
    if v_person is null then raise exception 'Choose a person'; end if;
    v_lines := jsonb_build_array(
      jsonb_build_object('account', mb_due_account(v_cat), 'amount', -v_amount, 'person_id', v_person),
      jsonb_build_object('account','OPENING_EQUITY','amount', v_amount, 'project_id', null));
  end if;

  insert into recovery_carryforwards (organization_id, person_id, cash_account_id, category, project_id, amount, effective_date, reason, is_opening)
  values (p_org, v_person, v_cash, v_cat, v_project, v_amount, v_date, v_reason, v_opening) returning id into v_id;
  v_entry := mb_post_entry(p_org, v_date, case when v_opening then 'opening_balance' else 'carry_forward' end, v_id, v_project, v_reason, v_lines, v_reason);
  update recovery_carryforwards set journal_entry_id = v_entry where id = v_id;
  return mb_idem_store(p_org, p_idempotency_key, jsonb_build_object('carryforward_id', v_id));
end $$;

create or replace function public.mb_delete_opening_balance(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r recovery_carryforwards;
begin
  select * into r from recovery_carryforwards where id = p_id for update;
  perform mb_require_permission(r.organization_id, 'finance.manage');
  perform mb_require_reason(p_reason);
  if r.deleted_at is not null then return; end if;
  perform mb_set_audit_context('deleted', p_reason);
  perform mb_reverse_entry(r.journal_entry_id, p_reason);
  update recovery_carryforwards set deleted_at = now(), deleted_reason = p_reason where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Settlement execution: everything selected succeeds or nothing does (§102).
-- p_payload: {date, notes, available_cash, cash_account_id,
--   lines:[{line_type, amount, suggested_amount, label, person_id, expense_id, fee_id, technology_id, treatment, cash_account_id}]}
-- ---------------------------------------------------------------------------
create or replace function public.mb_confirm_settlement(p_project uuid, p_payload jsonb, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := mb_project_org(p_project);
  v_prev jsonb; v_id uuid; v_ref uuid; l jsonb; v_i int := 0; v_total numeric := 0;
  v_date date := coalesce(nullif(p_payload->>'date','')::date, current_date);
  v_default_cash uuid := nullif(p_payload->>'cash_account_id','')::uuid;
  v_cash uuid; v_amount numeric; v_type text; f partner_fees;
begin
  perform mb_require_permission(v_org, 'settlements.manage');
  perform mb_assert_project_open(p_project);
  v_prev := mb_idem_claim(v_org, p_idempotency_key, 'settlement');
  if v_prev is not null then return v_prev; end if;
  perform 1 from projects where id = p_project for update;

  insert into settlements (organization_id, project_id, settlement_date, available_cash_snapshot, notes)
  values (v_org, p_project, v_date, nullif(p_payload->>'available_cash','')::numeric, p_payload->>'notes')
  returning id into v_id;

  for l in select * from jsonb_array_elements(coalesce(p_payload->'lines','[]'::jsonb)) loop
    v_amount := coalesce(nullif(l->>'amount','')::numeric, 0);
    continue when v_amount <= 0;
    v_i := v_i + 1;
    v_type := l->>'line_type';
    v_cash := coalesce(nullif(l->>'cash_account_id','')::uuid, v_default_cash, mb_default_cash_account(v_org));

    if v_type = 'supplier' then
      v_ref := mb_pay_expense_internal((l->>'expense_id')::uuid,
        jsonb_build_object('amount', v_amount, 'date', v_date, 'payer_type', 'company', 'cash_account_id', v_cash,
                           'notes', 'Settlement'));
    elsif v_type = 'employee' then
      v_ref := mb_pay_person_internal(v_org, (l->>'person_id')::uuid, 'employee_reimbursement', p_project, v_amount, v_date, v_cash, null, 'Settlement', v_id);
    elsif v_type = 'partner_funding' then
      v_ref := mb_pay_person_internal(v_org, (l->>'person_id')::uuid, 'funding', p_project, v_amount, v_date, v_cash, null, 'Settlement', v_id);
    elsif v_type = 'company_funding' then
      v_ref := mb_recover_company_funding_internal(v_org, p_project, v_amount, v_date, v_id);
    elsif v_type = 'fee' then
      select * into f from partner_fees where id = (l->>'fee_id')::uuid for update;
      if not found or f.project_id <> p_project then raise exception 'Fee not found on this project'; end if;
      if f.status in ('suggested','ignored') then
        update partner_fees set amount = greatest(v_amount, amount), treatment = coalesce(nullif(l->>'treatment',''), treatment)
        where id = f.id;
        perform mb_post_fee(f.id);
      end if;
      v_ref := mb_pay_person_internal(v_org, f.person_id, 'fee', p_project, v_amount, v_date, v_cash, null, 'Settlement', v_id);
    elsif v_type = 'cto' then
      if nullif(l->>'technology_id','') is not null then
        perform mb_allocate_cto_recovery_internal((l->>'technology_id')::uuid, p_project, v_amount,
                  coalesce(nullif(l->>'treatment',''), 'project_cost'), v_date, v_id, 'Settlement');
        v_ref := mb_pay_person_internal(v_org,
                  (select developer_person_id from technology_developments where id = (l->>'technology_id')::uuid),
                  'cto', p_project, v_amount, v_date, v_cash, null, 'Settlement', v_id);
      else
        v_ref := mb_pay_person_internal(v_org, (l->>'person_id')::uuid, 'cto', p_project, v_amount, v_date, v_cash, null, 'Settlement', v_id);
      end if;
    elsif v_type = 'carry_forward' then
      v_ref := mb_pay_person_internal(v_org, (l->>'person_id')::uuid, 'carry_forward', null, v_amount, v_date, v_cash, null, 'Settlement', v_id);
    else
      raise exception 'Unknown settlement line type %', v_type;
    end if;

    insert into settlement_lines (organization_id, settlement_id, sort_order, line_type, label, suggested_amount, amount,
                                  person_id, expense_id, fee_id, technology_id, treatment, cash_account_id, result_ref)
    values (v_org, v_id, v_i, v_type, l->>'label', nullif(l->>'suggested_amount','')::numeric, v_amount,
            nullif(l->>'person_id','')::uuid, nullif(l->>'expense_id','')::uuid, nullif(l->>'fee_id','')::uuid,
            nullif(l->>'technology_id','')::uuid, nullif(l->>'treatment',''), v_cash, v_ref);
    v_total := v_total + v_amount;
  end loop;

  if v_i = 0 then raise exception 'Select at least one item to settle' using errcode = '22023'; end if;
  update settlements set total_paid = v_total where id = v_id;
  perform mb_set_audit_context('settled', null);
  update projects set financial_status = 'partially_settled' where id = p_project;
  return mb_idem_store(v_org, p_idempotency_key, jsonb_build_object('settlement_id', v_id, 'total_paid', v_total));
end $$;

-- ---------------------------------------------------------------------------
-- Financial closure (spec §83) and reopen (§84)
-- ---------------------------------------------------------------------------
create or replace function public.mb_close_project(p_project uuid, p_checklist jsonb default '{}'::jsonb, p_override_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := mb_project_org(p_project);
  v_unpaid numeric := mb_project_unpaid_obligations(p_project);
  v_profit jsonb := mb_project_profit(p_project);
  v_pending_tech int;
  v_receivable numeric;
  v_issues text[] := '{}';
  v_loss_unallocated numeric;
begin
  perform mb_require_permission(v_org, 'projects.close');
  select count(*) into v_pending_tech from project_technology_usage u
  where u.project_id = p_project and u.recovery_decision in ('pending','decide_at_settlement')
    and mb_technology_outstanding(u.technology_id) > 0;
  select coalesce(sum(mb_milestone_outstanding(id)), 0) into v_receivable from billing_milestones
  where project_id = p_project and deleted_at is null;

  v_loss_unallocated := greatest(-((v_profit->>'undistributed')::numeric)
     - coalesce((select sum(ll.amount) from loss_allocation_lines ll join loss_allocations la on la.id = ll.loss_allocation_id
                 where la.project_id = p_project and la.deleted_at is null and ll.person_id is null), 0), 0);

  if v_receivable > 0 then v_issues := v_issues || ('Client still owes ' || mb_fmt(v_receivable) || ' EGP'); end if;
  if v_unpaid > 0 then v_issues := v_issues || (mb_fmt(v_unpaid) || ' EGP of obligations unpaid'); end if;
  if v_pending_tech > 0 then v_issues := v_issues || 'CTO recovery decision pending'; end if;
  if (v_profit->>'undistributed')::numeric > 0 then
    v_issues := v_issues || (mb_fmt((v_profit->>'undistributed')::numeric) || ' EGP profit not distributed');
  end if;
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

create or replace function public.mb_reopen_project(p_project uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := mb_project_org(p_project);
begin
  perform mb_require_permission(v_org, 'projects.reopen');
  perform mb_require_reason(p_reason);
  perform set_config('mb.allow_closed_edit', 'on', true);
  perform mb_set_audit_context('reopened', p_reason);
  update projects set financial_status = 'settlement_required', closed_at = null, closed_by = null where id = p_project;
  perform set_config('mb.allow_closed_edit', '', true);
end $$;

-- Status changes (operational) with optional reason
create or replace function public.mb_set_project_status(p_project uuid, p_operational text default null, p_financial text default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := mb_project_org(p_project);
begin
  perform mb_require_permission(v_org, 'projects.manage');
  if p_financial = 'financially_closed' then raise exception 'Use the financial closure checklist to close a project'; end if;
  perform mb_set_audit_context('status_change', p_reason);
  update projects set
    operational_status = coalesce(p_operational, operational_status),
    financial_status = coalesce(p_financial,
      case when p_operational = 'completed' and financial_status in ('active','draft','funding_required')
           then 'awaiting_collection' else financial_status end)
  where id = p_project;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers, RLS
-- ---------------------------------------------------------------------------
create trigger trg_partner_fees_touch before update on public.partner_fees for each row execute function public.mb_touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['fee_presets','partner_fees','profit_distributions','profit_distribution_lines','loss_allocations',
                           'loss_allocation_lines','recovery_carryforwards','settlements','settlement_lines'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.mb_audit_trigger()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy %1$s_read on public.%1$s for select using (public.mb_has_permission(organization_id, ''partners.view''))', t);
  end loop;
end $$;
create policy fee_presets_write on public.fee_presets for all
  using (mb_has_permission(organization_id, 'settings.manage'))
  with check (mb_has_permission(organization_id, 'settings.manage'));
