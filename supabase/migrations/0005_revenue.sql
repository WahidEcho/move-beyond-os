-- 0005_revenue.sql
-- Contracts, contract adjustments (change orders, discounts, credit notes...),
-- billing milestones (receivables), collections and refunds. Cash basis (D1).

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  currency char(3) not null default 'EGP',
  fx_rate numeric(14,6) not null default 1 check (fx_rate > 0),
  original_value numeric(14,2) not null default 0 check (original_value >= 0),
  signed_date date,
  reminder_days int[],          -- null = organization default
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contract_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_no int not null,
  adjustment_type text not null check (adjustment_type in
    ('change_order','increase','discount','tier_downgrade','credit_note','reduction','cancellation','compensation')),
  amount numeric(14,2) not null check (amount <> 0),   -- signed delta in contract currency
  description text not null,
  adjustment_date date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text,
  unique (contract_id, version_no),
  check ((adjustment_type in ('change_order','increase') and amount > 0)
      or (adjustment_type not in ('change_order','increase') and amount < 0))
);
create index on public.contract_adjustments (project_id) where deleted_at is null;

create table public.billing_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  subscription_id uuid,                 -- FK added in 0010
  label text not null,
  trigger_kind text not null default 'date'
    check (trigger_kind in ('signing','before_event','completion','date','subscription_period','custom')),
  due_date date,
  amount numeric(14,2) not null check (amount > 0),
  invoiced_at date,
  reminder_days int[],
  sort_order int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);
create index on public.billing_milestones (project_id) where deleted_at is null;
create index on public.billing_milestones (organization_id, due_date) where deleted_at is null;

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  client_id uuid references public.clients(id),
  collection_date date not null,
  amount numeric(14,2) not null check (amount > 0),          -- original currency
  currency char(3) not null default 'EGP',
  fx_rate numeric(14,6) not null default 1 check (fx_rate > 0),
  amount_egp numeric(14,2) generated always as (round(amount * fx_rate, 2)) stored,
  cash_account_id uuid not null references public.cash_accounts(id),   -- bank or held by partner (D2)
  kind text not null default 'payment' check (kind in ('payment','refund')),
  reference text,
  notes text,
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);
create index on public.collections (project_id) where deleted_at is null;
create index on public.collections (organization_id, collection_date) where deleted_at is null;

create table public.collection_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  milestone_id uuid not null references public.billing_milestones(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index on public.collection_allocations (milestone_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.mb_project_org(p_project uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from projects where id = p_project and deleted_at is null;
$$;

create or replace function public.mb_assert_project_open(p_project uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_status text; v_code text;
begin
  if p_project is null then return; end if;
  select financial_status, code into v_status, v_code from projects where id = p_project;
  if not found then raise exception 'Project not found'; end if;
  if v_status = 'financially_closed' and coalesce(current_setting('mb.allow_closed_edit', true), '') <> 'on' then
    raise exception 'Project % is financially closed. Reopen it first.', v_code using errcode = 'P0001';
  end if;
end $$;

create or replace function public.mb_require_reason(p_reason text)
returns void language plpgsql immutable as $$
begin
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason is required for this change' using errcode = '22023';
  end if;
end $$;

create or replace function public.mb_default_cash_account(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from cash_accounts where organization_id = p_org and is_default and active limit 1;
$$;

-- Unallocated receivable per milestone
create or replace function public.mb_milestone_outstanding(p_milestone uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select m.amount - coalesce((
    select sum(a.amount) from collection_allocations a
    join collections c on c.id = a.collection_id and c.deleted_at is null
    where a.milestone_id = m.id), 0)
  from billing_milestones m where m.id = p_milestone;
$$;

-- ---------------------------------------------------------------------------
-- Create project (spec §21): project + services + contract + milestones +
-- members + technology usage in one atomic call.
-- p_payload: {name, client_id, project_type, service_ids[], start_date, end_date,
--   contract_value, currency, fx_rate, payment_structure, budget_amount, description,
--   location, is_marketing_investment, operational_status,
--   milestones:[{label, trigger_kind, due_date, amount}], members:[{person_id, project_role}],
--   technology_ids:[]}
-- ---------------------------------------------------------------------------
create or replace function public.mb_create_project(p_org uuid, p_payload jsonb, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prev jsonb;
  v_project uuid;
  v_contract uuid;
  v_code text;
  v_m jsonb;
  v_i int := 0;
  v_value numeric := coalesce((p_payload->>'contract_value')::numeric, 0);
  v_type text := coalesce(p_payload->>'project_type', 'event');
begin
  perform mb_require_permission(p_org, 'projects.manage');
  v_prev := mb_idem_claim(p_org, p_idempotency_key, 'create_project');
  if v_prev is not null then return v_prev; end if;

  if coalesce(trim(p_payload->>'name'), '') = '' then
    raise exception 'Project name is required' using errcode = '22023';
  end if;

  insert into projects (organization_id, name, client_id, project_type, operational_status, financial_status,
                        start_date, end_date, currency, payment_structure, budget_amount, description, location,
                        is_marketing_investment)
  values (p_org, trim(p_payload->>'name'), nullif(p_payload->>'client_id','')::uuid, v_type,
          coalesce(p_payload->>'operational_status', 'confirmed'), 'active',
          nullif(p_payload->>'start_date','')::date, nullif(p_payload->>'end_date','')::date,
          coalesce(nullif(p_payload->>'currency',''), 'EGP'),
          coalesce(nullif(p_payload->>'payment_structure',''), 'custom'),
          nullif(p_payload->>'budget_amount','')::numeric, p_payload->>'description', p_payload->>'location',
          coalesce((p_payload->>'is_marketing_investment')::boolean, v_type = 'sponsorship'))
  returning id, code into v_project, v_code;

  insert into project_services (project_id, service_id, organization_id)
  select v_project, s::uuid, p_org
  from jsonb_array_elements_text(coalesce(p_payload->'service_ids', '[]'::jsonb)) s
  on conflict do nothing;

  insert into contracts (organization_id, project_id, currency, fx_rate, original_value, signed_date)
  values (p_org, v_project, coalesce(nullif(p_payload->>'currency',''), 'EGP'),
          coalesce(nullif(p_payload->>'fx_rate','')::numeric, 1), v_value,
          nullif(p_payload->>'signed_date','')::date)
  returning id into v_contract;

  for v_m in select * from jsonb_array_elements(coalesce(p_payload->'milestones', '[]'::jsonb)) loop
    v_i := v_i + 1;
    insert into billing_milestones (organization_id, project_id, contract_id, label, trigger_kind, due_date, amount, sort_order)
    values (p_org, v_project, v_contract, coalesce(v_m->>'label', 'Payment ' || v_i),
            coalesce(v_m->>'trigger_kind', 'date'), nullif(v_m->>'due_date','')::date,
            (v_m->>'amount')::numeric, v_i);
  end loop;

  insert into project_members (project_id, organization_id, person_id, project_role)
  select v_project, p_org, (m->>'person_id')::uuid, coalesce(m->>'project_role', 'project_manager')
  from jsonb_array_elements(coalesce(p_payload->'members', '[]'::jsonb)) m
  on conflict do nothing;

  return mb_idem_store(p_org, p_idempotency_key,
    jsonb_build_object('project_id', v_project, 'code', v_code, 'contract_id', v_contract));
end $$;

-- ---------------------------------------------------------------------------
-- Replace the unpaid part of the payment schedule.
-- Milestones that already received money are kept (their amount may be raised
-- but never set below what was collected).
-- ---------------------------------------------------------------------------
create or replace function public.mb_save_milestones(p_project uuid, p_milestones jsonb, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := mb_project_org(p_project);
  v_contract uuid;
  v_m jsonb;
  v_i int := 0;
  v_collected numeric;
begin
  perform mb_require_permission(v_org, 'finance.manage');
  perform mb_assert_project_open(p_project);
  perform mb_set_audit_context('edited', p_reason);
  select id into v_contract from contracts where project_id = p_project;

  -- Soft-delete milestones not present in payload that have no allocations
  update billing_milestones b set deleted_at = now(), deleted_reason = coalesce(p_reason, 'Schedule updated')
  where b.project_id = p_project and b.deleted_at is null
    and not exists (select 1 from jsonb_array_elements(p_milestones) x where nullif(x->>'id','')::uuid = b.id)
    and not exists (select 1 from collection_allocations a join collections c on c.id = a.collection_id and c.deleted_at is null
                    where a.milestone_id = b.id);

  for v_m in select * from jsonb_array_elements(p_milestones) loop
    v_i := v_i + 1;
    if nullif(v_m->>'id','') is not null then
      select coalesce(sum(a.amount),0) into v_collected from collection_allocations a
      join collections c on c.id = a.collection_id and c.deleted_at is null
      where a.milestone_id = (v_m->>'id')::uuid;
      if (v_m->>'amount')::numeric < v_collected then
        raise exception 'Milestone "%" already has % collected; amount cannot be lower', v_m->>'label', v_collected;
      end if;
      update billing_milestones set label = v_m->>'label', trigger_kind = coalesce(v_m->>'trigger_kind','date'),
        due_date = nullif(v_m->>'due_date','')::date, amount = (v_m->>'amount')::numeric, sort_order = v_i,
        invoiced_at = nullif(v_m->>'invoiced_at','')::date
      where id = (v_m->>'id')::uuid and project_id = p_project;
    else
      insert into billing_milestones (organization_id, project_id, contract_id, label, trigger_kind, due_date, amount, sort_order, invoiced_at)
      values (v_org, p_project, v_contract, v_m->>'label', coalesce(v_m->>'trigger_kind','date'),
              nullif(v_m->>'due_date','')::date, (v_m->>'amount')::numeric, v_i, nullif(v_m->>'invoiced_at','')::date);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Contract adjustments (spec §32–33). Revision history = rows by version_no.
-- ---------------------------------------------------------------------------
create or replace function public.mb_add_contract_adjustment(
  p_project uuid, p_type text, p_amount numeric, p_description text, p_date date default null,
  p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := mb_project_org(p_project);
  v_prev jsonb;
  c contracts;
  v_version int;
  v_signed numeric;
  v_id uuid;
begin
  perform mb_require_permission(v_org, 'finance.manage');
  perform mb_assert_project_open(p_project);
  v_prev := mb_idem_claim(v_org, p_idempotency_key, 'contract_adjustment');
  if v_prev is not null then return v_prev; end if;

  select * into c from contracts where project_id = p_project for update;
  if not found then raise exception 'Project has no contract'; end if;
  v_signed := case when p_type in ('change_order','increase') then abs(p_amount) else -abs(p_amount) end;

  if c.original_value + coalesce((select sum(amount) from contract_adjustments
                                  where contract_id = c.id and deleted_at is null), 0) + v_signed < 0 then
    raise exception 'Adjustment would make the contract value negative';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_version from contract_adjustments where contract_id = c.id;
  insert into contract_adjustments (organization_id, contract_id, project_id, version_no, adjustment_type, amount, description, adjustment_date)
  values (v_org, c.id, p_project, v_version, p_type, v_signed, p_description, coalesce(p_date, current_date))
  returning id into v_id;

  return mb_idem_store(v_org, p_idempotency_key, jsonb_build_object('adjustment_id', v_id, 'version_no', v_version));
end $$;

-- ---------------------------------------------------------------------------
-- Record a client payment (spec §31, §101 "Client Payment").
-- p_allocations: [{milestone_id, amount}] or null for oldest-due-first.
-- ---------------------------------------------------------------------------
create or replace function public.mb_record_collection(
  p_project uuid, p_amount numeric, p_date date, p_cash_account uuid default null,
  p_currency text default 'EGP', p_fx_rate numeric default 1, p_reference text default null,
  p_notes text default null, p_allocations jsonb default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := mb_project_org(p_project);
  v_prev jsonb;
  v_id uuid;
  v_entry uuid;
  v_cash uuid;
  v_left numeric := p_amount;
  v_alloc numeric;
  r record;
  v_egp numeric;
  v_client uuid;
begin
  perform mb_require_permission(v_org, 'finance.manage');
  perform mb_assert_project_open(p_project);
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive' using errcode = '22023'; end if;
  v_prev := mb_idem_claim(v_org, p_idempotency_key, 'collection');
  if v_prev is not null then return v_prev; end if;

  v_cash := coalesce(p_cash_account, mb_default_cash_account(v_org));
  if v_cash is null then raise exception 'No cash account configured'; end if;
  select client_id into v_client from projects where id = p_project;

  insert into collections (organization_id, project_id, client_id, collection_date, amount, currency, fx_rate,
                           cash_account_id, reference, notes)
  values (v_org, p_project, v_client, coalesce(p_date, current_date), p_amount, coalesce(p_currency,'EGP'),
          coalesce(p_fx_rate, 1), v_cash, p_reference, p_notes)
  returning id, amount_egp into v_id, v_egp;

  -- Allocate to milestones
  if p_allocations is not null and jsonb_array_length(p_allocations) > 0 then
    for r in select (x->>'milestone_id')::uuid as milestone_id, (x->>'amount')::numeric as amount
             from jsonb_array_elements(p_allocations) x loop
      if r.amount > mb_milestone_outstanding(r.milestone_id) then
        raise exception 'Allocation exceeds milestone outstanding';
      end if;
      insert into collection_allocations (organization_id, collection_id, milestone_id, amount)
      values (v_org, v_id, r.milestone_id, r.amount);
      v_left := v_left - r.amount;
    end loop;
    if v_left < 0 then raise exception 'Allocations exceed the payment amount'; end if;
  else
    for r in select id, mb_milestone_outstanding(id) as outstanding from billing_milestones
             where project_id = p_project and deleted_at is null
             order by due_date nulls last, sort_order, created_at loop
      exit when v_left <= 0;
      continue when r.outstanding <= 0;
      v_alloc := least(v_left, r.outstanding);
      insert into collection_allocations (organization_id, collection_id, milestone_id, amount)
      values (v_org, v_id, r.id, v_alloc);
      v_left := v_left - v_alloc;
    end loop;
  end if;

  v_entry := mb_post_entry(v_org, coalesce(p_date, current_date), 'client_payment', v_id, p_project,
    'Client payment' || coalesce(' — ' || p_reference, ''),
    jsonb_build_array(
      jsonb_build_object('account','CASH','amount', v_egp, 'cash_account_id', v_cash),
      jsonb_build_object('account','REVENUE','amount', -v_egp)));
  update collections set journal_entry_id = v_entry where id = v_id;

  -- Advance financial status once money arrives on a completed project
  update projects set financial_status = 'settlement_required'
  where id = p_project and operational_status = 'completed'
    and financial_status in ('active','awaiting_collection','funding_required');

  return mb_idem_store(v_org, p_idempotency_key,
    jsonb_build_object('collection_id', v_id, 'journal_entry_id', v_entry, 'unallocated', greatest(v_left, 0)));
end $$;

create or replace function public.mb_record_refund(
  p_project uuid, p_amount numeric, p_date date, p_cash_account uuid, p_reason text,
  p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := mb_project_org(p_project);
  v_prev jsonb; v_id uuid; v_entry uuid; v_cash uuid;
begin
  perform mb_require_permission(v_org, 'finance.manage');
  perform mb_assert_project_open(p_project);
  perform mb_require_reason(p_reason);
  v_prev := mb_idem_claim(v_org, p_idempotency_key, 'refund');
  if v_prev is not null then return v_prev; end if;
  v_cash := coalesce(p_cash_account, mb_default_cash_account(v_org));

  insert into collections (organization_id, project_id, client_id, collection_date, amount, cash_account_id, kind, notes)
  select v_org, p_project, client_id, coalesce(p_date, current_date), p_amount, v_cash, 'refund', p_reason
  from projects where id = p_project
  returning id into v_id;

  v_entry := mb_post_entry(v_org, coalesce(p_date, current_date), 'client_refund', v_id, p_project,
    'Refund to client', jsonb_build_array(
      jsonb_build_object('account','REVENUE','amount', p_amount),
      jsonb_build_object('account','CASH','amount', -p_amount, 'cash_account_id', v_cash)), p_reason);
  update collections set journal_entry_id = v_entry where id = v_id;
  return mb_idem_store(v_org, p_idempotency_key, jsonb_build_object('collection_id', v_id, 'journal_entry_id', v_entry));
end $$;

create or replace function public.mb_delete_collection(p_collection uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c collections;
begin
  select * into c from collections where id = p_collection for update;
  if not found then raise exception 'Collection not found'; end if;
  perform mb_require_permission(c.organization_id, 'finance.manage');
  perform mb_assert_project_open(c.project_id);
  perform mb_require_reason(p_reason);
  if c.deleted_at is not null then return; end if;
  perform mb_set_audit_context('deleted', p_reason);
  if c.journal_entry_id is not null then perform mb_reverse_entry(c.journal_entry_id, p_reason); end if;
  update collections set deleted_at = now(), deleted_reason = p_reason where id = p_collection;
end $$;

create or replace function public.mb_delete_contract_adjustment(p_adjustment uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare a contract_adjustments;
begin
  select * into a from contract_adjustments where id = p_adjustment for update;
  if not found then raise exception 'Adjustment not found'; end if;
  perform mb_require_permission(a.organization_id, 'finance.manage');
  perform mb_assert_project_open(a.project_id);
  perform mb_require_reason(p_reason);
  perform mb_set_audit_context('deleted', p_reason);
  update contract_adjustments set deleted_at = now(), deleted_reason = p_reason where id = p_adjustment and deleted_at is null;
end $$;

-- Editing the original contract value (with reason, audited)
create or replace function public.mb_update_contract_value(p_project uuid, p_value numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := mb_project_org(p_project);
begin
  perform mb_require_permission(v_org, 'finance.manage');
  perform mb_assert_project_open(p_project);
  perform mb_require_reason(p_reason);
  perform mb_set_audit_context('amount_change', p_reason);
  update contracts set original_value = p_value where project_id = p_project;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers, RLS
-- ---------------------------------------------------------------------------
create trigger trg_contracts_touch before update on public.contracts for each row execute function public.mb_touch_updated_at();
create trigger trg_billing_milestones_touch before update on public.billing_milestones for each row execute function public.mb_touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['contracts','contract_adjustments','billing_milestones','collections','collection_allocations'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.mb_audit_trigger()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy %1$s_read on public.%1$s for select using (public.mb_has_permission(organization_id, ''finance.view''))', t);
  end loop;
end $$;
