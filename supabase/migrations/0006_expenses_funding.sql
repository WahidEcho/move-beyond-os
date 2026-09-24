-- 0006_expenses_funding.sql
-- Expenses & commitments, payments (who paid), project funding, payouts to
-- people, cash transfers, bank adjustments, and the asset register foundation.

-- ---------------------------------------------------------------------------
-- Assets (created from owned-asset expenses; reused by Inventory later, §119)
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category_id uuid references public.asset_categories(id),
  quantity_owned int not null default 1 check (quantity_owned >= 0),
  purchase_value numeric(14,2) not null default 0,     -- total EGP
  purchase_date date,
  supplier_id uuid references public.suppliers(id),
  source_expense_id uuid,                               -- FK added below
  source_project_id uuid references public.projects(id),
  serial_number text,
  location text,
  condition text default 'good' check (condition in ('new','good','fair','needs_repair','retired')),
  warranty_until date,
  custodian_person_id uuid references public.people(id),
  photo_document_id uuid references public.documents(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);
create index on public.assets (organization_id) where deleted_at is null;
create index assets_name_trgm on public.assets using gin (name gin_trgm_ops);

create table public.asset_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  quantity int not null default 1 check (quantity > 0),
  assigned_from date,
  assigned_to date,
  returned_at date,
  internal_cost numeric(14,2) not null default 0 check (internal_cost >= 0),   -- spec §72, default 0
  notes text,
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  movement_type text not null check (movement_type in ('purchase','assign','return','maintenance_out','maintenance_in','retire','adjust')),
  quantity int not null,
  project_id uuid references public.projects(id),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Expenses = cost lines / commitments (spec §37–41)
-- ---------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id),            -- null = company overhead (D4)
  category_id uuid references public.expense_categories(id),
  supplier_id uuid references public.suppliers(id),
  description text not null,
  expense_type text not null default 'normal' check (expense_type in ('normal','rental','owned_asset')),
  estimated_amount numeric(14,2) check (estimated_amount >= 0),
  committed_amount numeric(14,2) check (committed_amount >= 0),  -- null = estimate only
  currency char(3) not null default 'EGP',
  fx_rate numeric(14,6) not null default 1 check (fx_rate > 0),
  quantity numeric(12,2),
  unit_cost numeric(14,2),
  committed_date date,
  due_date date,                          -- when the supplier expects payment
  capitalize boolean not null default false,
  related_expense_id uuid references public.expenses(id),        -- landed-cost charge (spec §41)
  allocation_basis text check (allocation_basis in ('per_unit','per_bundle','per_supplier_order','per_project')),
  status text not null default 'committed'
    check (status in ('estimated','committed','partially_paid','paid','cancelled')),
  cancelled_at timestamptz,
  cancel_reason text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);
create index on public.expenses (project_id) where deleted_at is null;
create index on public.expenses (organization_id, created_at desc) where deleted_at is null;
create index on public.expenses (supplier_id) where deleted_at is null;
alter table public.assets add constraint assets_source_expense_fk foreign key (source_expense_id) references public.expenses(id);

create table public.expense_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  expense_id uuid not null references public.expenses(id),
  project_id uuid references public.projects(id),
  payment_date date not null,
  amount numeric(14,2) not null check (amount > 0),     -- expense currency
  fx_rate numeric(14,6) not null default 1 check (fx_rate > 0),
  amount_egp numeric(14,2) generated always as (round(amount * fx_rate, 2)) stored,
  payer_type text not null check (payer_type in ('company','partner','employee','other_person')),
  cash_account_id uuid references public.cash_accounts(id),      -- company payments
  person_id uuid references public.people(id),                   -- partner/employee/other
  reimbursable boolean not null default true,                    -- spec §28
  reference text,
  notes text,
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text,
  check ((payer_type = 'company' and cash_account_id is not null and person_id is null)
      or (payer_type <> 'company' and person_id is not null))
);
create index on public.expense_payments (expense_id) where deleted_at is null;
create index on public.expense_payments (project_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Project funding (spec §24–26)
-- ---------------------------------------------------------------------------
create table public.project_funding (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id),
  funder_id uuid not null references public.funders(id),
  funding_date date not null,
  amount_egp numeric(14,2) not null check (amount_egp > 0),
  kind text not null check (kind in ('cash_contribution','expense_paid','company_paid')),
  expense_payment_id uuid references public.expense_payments(id),
  cash_account_id uuid references public.cash_accounts(id),
  journal_entry_id uuid references public.journal_entries(id),
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);
create index on public.project_funding (project_id) where deleted_at is null;
create index on public.project_funding (funder_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Payouts: money paid to a person against what is due, by category.
-- 'company_recovery' is a memo (no cash) marking Move Beyond funding as recovered.
-- ---------------------------------------------------------------------------
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid references public.people(id),
  category text not null check (category in ('funding','employee_reimbursement','fee','cto','profit','carry_forward','company_recovery')),
  project_id uuid references public.projects(id),
  payout_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  cash_account_id uuid references public.cash_accounts(id),
  settlement_id uuid,                      -- FK added in 0007
  reference text,
  notes text,
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text,
  check ((category = 'company_recovery') = (person_id is null)),
  check (category = 'company_recovery' or cash_account_id is not null)
);
create index on public.payouts (person_id, category) where deleted_at is null;
create index on public.payouts (project_id) where deleted_at is null;

-- Cash movements between cash accounts (e.g. partner deposits held money) and
-- bank corrections.
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  movement_type text not null check (movement_type in ('transfer','bank_adjustment','opening_balance')),
  movement_date date not null,
  from_cash_account_id uuid references public.cash_accounts(id),
  to_cash_account_id uuid references public.cash_accounts(id),
  amount numeric(14,2) not null check (amount <> 0),
  reason text,
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);

-- ---------------------------------------------------------------------------
-- Ledger mapping constants
-- ---------------------------------------------------------------------------
create or replace function public.mb_due_account(p_category text)
returns text language sql immutable as $$
  select case p_category
    when 'funding' then 'DUE_FUNDING'
    when 'employee_reimbursement' then 'DUE_EMPLOYEE'
    when 'fee' then 'DUE_FEE'
    when 'cto' then 'DUE_CTO'
    when 'profit' then 'DUE_PROFIT'
    when 'carry_forward' then 'DUE_CARRY'
  end;
$$;

-- Current amount due to a person in a category (+ = company owes the person).
create or replace function public.mb_person_due(p_org uuid, p_person uuid, p_category text, p_project uuid default null, p_any_project boolean default false)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(-sum(amount), 0) from journal_lines
  where organization_id = p_org and person_id = p_person and account_code = mb_due_account(p_category)
    and (p_any_project or project_id is not distinct from p_project);
$$;

create or replace function public.mb_company_funder(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from funders where organization_id = p_org and funder_type = 'company' limit 1;
$$;

create or replace function public.mb_person_funder(p_org uuid, p_person uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  select id into v_id from funders where organization_id = p_org and person_id = p_person;
  if v_id is null then
    select full_name into v_name from people where id = p_person;
    insert into funders (organization_id, name, funder_type, person_id) values (p_org, v_name, 'person', p_person)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Re-derive the expense status from its commitment and live payments.
create or replace function public.mb_refresh_expense_status(p_expense uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e expenses; v_paid numeric;
begin
  select * into e from expenses where id = p_expense;
  if e.status = 'cancelled' then return; end if;
  select coalesce(sum(amount),0) into v_paid from expense_payments where expense_id = p_expense and deleted_at is null;
  update expenses set status = case
      when e.committed_amount is null and v_paid = 0 then 'estimated'
      when v_paid = 0 then 'committed'
      when v_paid >= coalesce(e.committed_amount, 0) then 'paid'
      else 'partially_paid' end
  where id = p_expense;
end $$;

-- ---------------------------------------------------------------------------
-- Pay (part of) an expense. Creates the ledger entry and, for project costs,
-- the matching funding record (spec §25–27, §101 automation).
-- p_payment: {amount, date, payer_type, cash_account_id, person_id, reimbursable, reference, notes, fx_rate}
-- ---------------------------------------------------------------------------
create or replace function public.mb_pay_expense_internal(p_expense uuid, p_payment jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  e expenses;
  v_pid uuid;
  v_entry uuid;
  v_amount numeric := (p_payment->>'amount')::numeric;
  v_payer text := coalesce(p_payment->>'payer_type', 'company');
  v_person uuid := nullif(p_payment->>'person_id','')::uuid;
  v_cash uuid := nullif(p_payment->>'cash_account_id','')::uuid;
  v_reimb boolean := coalesce((p_payment->>'reimbursable')::boolean, true);
  v_date date := coalesce(nullif(p_payment->>'date','')::date, current_date);
  v_paid numeric;
  v_egp numeric;
  v_cost_account text;
  v_credit jsonb;
  v_is_partner boolean;
  v_funding_kind text;
  v_funder uuid;
begin
  select * into e from expenses where id = p_expense for update;
  if not found or e.deleted_at is not null then raise exception 'Expense not found'; end if;
  if e.status = 'cancelled' then raise exception 'Expense is cancelled'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Payment amount must be positive' using errcode = '22023'; end if;

  select coalesce(sum(amount),0) into v_paid from expense_payments where expense_id = e.id and deleted_at is null;
  if e.committed_amount is null then
    update expenses set committed_amount = v_paid + v_amount, committed_date = coalesce(committed_date, v_date) where id = e.id;
  elsif v_paid + v_amount > e.committed_amount then
    raise exception 'Payment of % exceeds the remaining commitment of %. Update the committed amount first (with a reason).',
      v_amount, e.committed_amount - v_paid using errcode = '22023';
  end if;

  if v_payer = 'company' then
    v_cash := coalesce(v_cash, mb_default_cash_account(e.organization_id));
    v_person := null;
  end if;

  insert into expense_payments (organization_id, expense_id, project_id, payment_date, amount, fx_rate, payer_type,
                                cash_account_id, person_id, reimbursable, reference, notes)
  values (e.organization_id, e.id, e.project_id, v_date, v_amount,
          coalesce(nullif(p_payment->>'fx_rate','')::numeric, e.fx_rate), v_payer,
          case when v_payer = 'company' then v_cash end, v_person, v_reimb,
          p_payment->>'reference', p_payment->>'notes')
  returning id, amount_egp into v_pid, v_egp;

  v_cost_account := case when e.capitalize then 'FIXED_ASSETS'
                         when e.project_id is null then 'OVERHEAD'
                         else 'DIRECT_COST' end;

  if v_payer = 'company' then
    v_credit := jsonb_build_object('account','CASH','amount', -v_egp, 'cash_account_id', v_cash);
    v_funding_kind := 'company_paid';
    v_funder := mb_company_funder(e.organization_id);
  else
    select is_partner into v_is_partner from people where id = v_person;
    if v_payer = 'partner' and not coalesce(v_is_partner, false) then
      raise exception 'Selected person is not a partner';
    end if;
    if v_payer = 'partner' and not v_reimb then
      v_credit := jsonb_build_object('account','PARTNER_CAPITAL','amount', -v_egp, 'person_id', v_person);   -- E2
    elsif v_payer = 'partner' or v_payer = 'other_person' then
      v_credit := jsonb_build_object('account','DUE_FUNDING','amount', -v_egp, 'person_id', v_person);      -- E1
      v_funding_kind := 'expense_paid';
      v_funder := mb_person_funder(e.organization_id, v_person);
    else
      v_credit := jsonb_build_object('account','DUE_EMPLOYEE','amount', -v_egp, 'person_id', v_person);     -- §27
    end if;
  end if;

  v_entry := mb_post_entry(e.organization_id, v_date, 'expense_payment', v_pid, e.project_id,
    e.description, jsonb_build_array(
      jsonb_build_object('account', v_cost_account, 'amount', v_egp, 'category_id', e.category_id),
      v_credit));
  update expense_payments set journal_entry_id = v_entry where id = v_pid;

  if v_funding_kind is not null and e.project_id is not null then
    insert into project_funding (organization_id, project_id, funder_id, funding_date, amount_egp, kind, expense_payment_id, cash_account_id, journal_entry_id)
    values (e.organization_id, e.project_id, v_funder, v_date, v_egp, v_funding_kind, v_pid,
            case when v_payer = 'company' then v_cash end, v_entry);
  end if;

  perform mb_refresh_expense_status(e.id);
  return v_pid;
end $$;

-- ---------------------------------------------------------------------------
-- Add expense (spec §106 "Expense: 70,000 / Paid by: Wahid").
-- p_payload: {project_id, category_id, supplier_id, description, expense_type, estimated_amount,
--   committed_amount, currency, fx_rate, quantity, unit_cost, committed_date, due_date, capitalize,
--   related_expense_id, allocation_basis, notes,
--   payment?: {...see above}, asset?: {name, quantity, category_id, serial_number, location, condition,
--   warranty_until, custodian_person_id, notes}}
-- ---------------------------------------------------------------------------
create or replace function public.mb_add_expense(p_org uuid, p_payload jsonb, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prev jsonb;
  v_id uuid;
  v_payment uuid;
  v_asset uuid;
  v_project uuid := nullif(p_payload->>'project_id','')::uuid;
  v_type text := coalesce(nullif(p_payload->>'expense_type',''), 'normal');
  v_committed numeric := nullif(p_payload->>'committed_amount','')::numeric;
  v_status text;
  v_asset_qty int;
begin
  if v_project is not null then
    if not (mb_has_permission(p_org, 'finance.manage')
            or (mb_has_permission(p_org, 'expenses.create_assigned') and mb_is_project_member(v_project))) then
      perform mb_require_permission(p_org, 'finance.manage');
    end if;
  else
    perform mb_require_permission(p_org, 'finance.manage');
  end if;
  perform mb_assert_project_open(v_project);
  v_prev := mb_idem_claim(p_org, p_idempotency_key, 'add_expense');
  if v_prev is not null then return v_prev; end if;

  if coalesce(trim(p_payload->>'description'),'') = '' then
    raise exception 'Description is required' using errcode = '22023';
  end if;
  v_status := case when v_committed is null then 'estimated' else 'committed' end;

  insert into expenses (organization_id, project_id, category_id, supplier_id, description, expense_type,
                        estimated_amount, committed_amount, currency, fx_rate, quantity, unit_cost, committed_date,
                        due_date, capitalize, related_expense_id, allocation_basis, notes, status)
  values (p_org, v_project, nullif(p_payload->>'category_id','')::uuid, nullif(p_payload->>'supplier_id','')::uuid,
          trim(p_payload->>'description'), v_type,
          nullif(p_payload->>'estimated_amount','')::numeric, v_committed,
          coalesce(nullif(p_payload->>'currency',''),'EGP'), coalesce(nullif(p_payload->>'fx_rate','')::numeric, 1),
          nullif(p_payload->>'quantity','')::numeric, nullif(p_payload->>'unit_cost','')::numeric,
          coalesce(nullif(p_payload->>'committed_date','')::date, case when v_committed is not null then current_date end),
          nullif(p_payload->>'due_date','')::date,
          coalesce((p_payload->>'capitalize')::boolean, false),
          nullif(p_payload->>'related_expense_id','')::uuid, nullif(p_payload->>'allocation_basis',''),
          p_payload->>'notes', v_status)
  returning id into v_id;

  if p_payload ? 'payment' and jsonb_typeof(p_payload->'payment') = 'object'
     and coalesce((p_payload->'payment'->>'amount')::numeric, 0) > 0 then
    v_payment := mb_pay_expense_internal(v_id, p_payload->'payment');
  end if;

  -- Owned asset → register automatically (spec §70–71)
  if v_type = 'owned_asset' then
    v_asset_qty := coalesce(nullif(p_payload->'asset'->>'quantity','')::int, nullif(p_payload->>'quantity','')::numeric::int, 1);
    insert into assets (organization_id, name, category_id, quantity_owned, purchase_value, purchase_date, supplier_id,
                        source_expense_id, source_project_id, serial_number, location, condition, warranty_until,
                        custodian_person_id, notes)
    values (p_org, coalesce(nullif(p_payload->'asset'->>'name',''), trim(p_payload->>'description')),
            nullif(p_payload->'asset'->>'category_id','')::uuid, v_asset_qty,
            round(coalesce(v_committed, nullif(p_payload->>'estimated_amount','')::numeric, 0)
                  * coalesce(nullif(p_payload->>'fx_rate','')::numeric, 1), 2),
            coalesce(nullif(p_payload->'payment'->>'date','')::date, current_date),
            nullif(p_payload->>'supplier_id','')::uuid, v_id, v_project,
            p_payload->'asset'->>'serial_number', p_payload->'asset'->>'location',
            coalesce(nullif(p_payload->'asset'->>'condition',''), 'new'),
            nullif(p_payload->'asset'->>'warranty_until','')::date,
            nullif(p_payload->'asset'->>'custodian_person_id','')::uuid, p_payload->'asset'->>'notes')
    returning id into v_asset;
    insert into inventory_movements (organization_id, asset_id, movement_type, quantity, project_id)
    values (p_org, v_asset, 'purchase', v_asset_qty, v_project);
  end if;

  return mb_idem_store(p_org, p_idempotency_key,
    jsonb_build_object('expense_id', v_id, 'payment_id', v_payment, 'asset_id', v_asset));
end $$;

create or replace function public.mb_record_expense_payment(p_expense uuid, p_payment jsonb, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e expenses; v_prev jsonb; v_pid uuid;
begin
  select * into e from expenses where id = p_expense;
  if not found then raise exception 'Expense not found'; end if;
  perform mb_require_permission(e.organization_id, 'finance.manage');
  perform mb_assert_project_open(e.project_id);
  v_prev := mb_idem_claim(e.organization_id, p_idempotency_key, 'expense_payment');
  if v_prev is not null then return v_prev; end if;
  v_pid := mb_pay_expense_internal(p_expense, p_payment);
  return mb_idem_store(e.organization_id, p_idempotency_key, jsonb_build_object('payment_id', v_pid));
end $$;

-- Edit an expense's non-ledger fields; amount changes need a reason (spec §86).
create or replace function public.mb_update_expense(p_expense uuid, p_payload jsonb, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare e expenses; v_paid numeric; v_new_committed numeric;
begin
  select * into e from expenses where id = p_expense for update;
  if not found or e.deleted_at is not null then raise exception 'Expense not found'; end if;
  perform mb_require_permission(e.organization_id, 'finance.manage');
  perform mb_assert_project_open(e.project_id);
  select coalesce(sum(amount),0) into v_paid from expense_payments where expense_id = e.id and deleted_at is null;

  v_new_committed := case when p_payload ? 'committed_amount' then nullif(p_payload->>'committed_amount','')::numeric
                          else e.committed_amount end;
  if v_new_committed is distinct from e.committed_amount
     or (p_payload ? 'estimated_amount' and nullif(p_payload->>'estimated_amount','')::numeric is distinct from e.estimated_amount) then
    perform mb_require_reason(p_reason);
  end if;
  if v_paid > 0 and coalesce(v_new_committed, 0) < v_paid then
    raise exception 'Committed amount cannot be lower than the % already paid', v_paid using errcode = '22023';
  end if;
  perform mb_set_audit_context(case when v_new_committed is distinct from e.committed_amount then 'amount_change' else 'edited' end, p_reason);

  update expenses set
    description = coalesce(nullif(trim(p_payload->>'description'),''), description),
    category_id = case when p_payload ? 'category_id' then nullif(p_payload->>'category_id','')::uuid else category_id end,
    supplier_id = case when p_payload ? 'supplier_id' then nullif(p_payload->>'supplier_id','')::uuid else supplier_id end,
    estimated_amount = case when p_payload ? 'estimated_amount' then nullif(p_payload->>'estimated_amount','')::numeric else estimated_amount end,
    committed_amount = v_new_committed,
    due_date = case when p_payload ? 'due_date' then nullif(p_payload->>'due_date','')::date else due_date end,
    notes = case when p_payload ? 'notes' then p_payload->>'notes' else notes end,
    committed_date = coalesce(committed_date, case when v_new_committed is not null then current_date end)
  where id = e.id;
  perform mb_refresh_expense_status(e.id);
end $$;

create or replace function public.mb_delete_expense_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare p expense_payments;
begin
  select * into p from expense_payments where id = p_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  perform mb_require_permission(p.organization_id, 'finance.manage');
  perform mb_assert_project_open(p.project_id);
  perform mb_require_reason(p_reason);
  if p.deleted_at is not null then return; end if;
  perform mb_set_audit_context('deleted', p_reason);
  if p.journal_entry_id is not null then perform mb_reverse_entry(p.journal_entry_id, p_reason); end if;
  update expense_payments set deleted_at = now(), deleted_reason = p_reason where id = p_payment;
  update project_funding set deleted_at = now(), deleted_reason = p_reason where expense_payment_id = p_payment and deleted_at is null;
  perform mb_refresh_expense_status(p.expense_id);
end $$;

-- Cancel the unpaid part of a commitment (spec §38). Paid amounts stay as cost.
create or replace function public.mb_cancel_expense(p_expense uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e expenses;
begin
  select * into e from expenses where id = p_expense for update;
  if not found then raise exception 'Expense not found'; end if;
  perform mb_require_permission(e.organization_id, 'finance.manage');
  perform mb_assert_project_open(e.project_id);
  perform mb_require_reason(p_reason);
  perform mb_set_audit_context('status_change', p_reason);
  update expenses set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason where id = p_expense;
end $$;

-- Soft delete (spec §85): reverse every live payment, stop affecting totals.
create or replace function public.mb_delete_expense(p_expense uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e expenses; r record;
begin
  select * into e from expenses where id = p_expense for update;
  if not found then raise exception 'Expense not found'; end if;
  perform mb_require_permission(e.organization_id, 'finance.manage');
  perform mb_assert_project_open(e.project_id);
  perform mb_require_reason(p_reason);
  if e.deleted_at is not null then return; end if;
  for r in select id from expense_payments where expense_id = e.id and deleted_at is null loop
    perform mb_delete_expense_payment(r.id, p_reason);
  end loop;
  perform mb_set_audit_context('deleted', p_reason);
  update expenses set deleted_at = now(), deleted_reason = p_reason where id = e.id;
  update assets set deleted_at = now(), deleted_reason = p_reason where source_expense_id = e.id and deleted_at is null;
end $$;

-- ---------------------------------------------------------------------------
-- Cash funding contribution (a partner transfers money into the company for a project)
-- ---------------------------------------------------------------------------
create or replace function public.mb_add_funding(
  p_project uuid, p_person uuid, p_amount numeric, p_date date, p_cash_account uuid default null,
  p_notes text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := mb_project_org(p_project);
  v_prev jsonb; v_id uuid; v_entry uuid; v_cash uuid; v_funder uuid;
begin
  perform mb_require_permission(v_org, 'finance.manage');
  perform mb_assert_project_open(p_project);
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive' using errcode = '22023'; end if;
  v_prev := mb_idem_claim(v_org, p_idempotency_key, 'add_funding');
  if v_prev is not null then return v_prev; end if;
  v_cash := coalesce(p_cash_account, mb_default_cash_account(v_org));
  v_funder := mb_person_funder(v_org, p_person);

  insert into project_funding (organization_id, project_id, funder_id, funding_date, amount_egp, kind, cash_account_id, notes)
  values (v_org, p_project, v_funder, coalesce(p_date, current_date), p_amount, 'cash_contribution', v_cash, p_notes)
  returning id into v_id;
  v_entry := mb_post_entry(v_org, coalesce(p_date, current_date), 'funding', v_id, p_project, 'Project funding received',
    jsonb_build_array(
      jsonb_build_object('account','CASH','amount', p_amount, 'cash_account_id', v_cash),
      jsonb_build_object('account','DUE_FUNDING','amount', -p_amount, 'person_id', p_person)));
  update project_funding set journal_entry_id = v_entry where id = v_id;

  update projects set financial_status = 'active' where id = p_project and financial_status in ('draft','funding_required');
  return mb_idem_store(v_org, p_idempotency_key, jsonb_build_object('funding_id', v_id, 'journal_entry_id', v_entry));
end $$;

create or replace function public.mb_delete_funding(p_funding uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare f project_funding;
begin
  select * into f from project_funding where id = p_funding for update;
  if not found then raise exception 'Funding not found'; end if;
  if f.kind <> 'cash_contribution' then
    raise exception 'This funding came from an expense payment; delete that payment instead';
  end if;
  perform mb_require_permission(f.organization_id, 'finance.manage');
  perform mb_assert_project_open(f.project_id);
  perform mb_require_reason(p_reason);
  if f.deleted_at is not null then return; end if;
  perform mb_set_audit_context('deleted', p_reason);
  if f.journal_entry_id is not null then perform mb_reverse_entry(f.journal_entry_id, p_reason); end if;
  update project_funding set deleted_at = now(), deleted_reason = p_reason where id = p_funding;
end $$;

-- ---------------------------------------------------------------------------
-- Pay a person what is due (funding repayment, employee reimbursement, fee,
-- CTO recovery, profit, carry-forward). Partial payments allowed (spec §76).
-- Paying from a partner_holding account = partner-to-partner / netting (D2).
-- ---------------------------------------------------------------------------
create or replace function public.mb_pay_person_internal(
  p_org uuid, p_person uuid, p_category text, p_project uuid, p_amount numeric, p_date date,
  p_cash_account uuid, p_reference text, p_notes text, p_settlement uuid, p_allow_over boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_entry uuid; v_due numeric; v_cash uuid;
  v_account text := mb_due_account(p_category);
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive' using errcode = '22023'; end if;
  if v_account is null then raise exception 'Unknown payout category %', p_category; end if;
  v_due := mb_person_due(p_org, p_person, p_category, p_project);
  if p_amount > v_due and not p_allow_over then
    raise exception 'Maximum payable is % EGP', mb_fmt(greatest(v_due, 0)) using errcode = '22023';
  end if;
  v_cash := coalesce(p_cash_account, mb_default_cash_account(p_org));

  insert into payouts (organization_id, person_id, category, project_id, payout_date, amount, cash_account_id, settlement_id, reference, notes)
  values (p_org, p_person, p_category, p_project, coalesce(p_date, current_date), p_amount, v_cash, p_settlement, p_reference, p_notes)
  returning id into v_id;
  v_entry := mb_post_entry(p_org, coalesce(p_date, current_date), 'payout_' || p_category, v_id, p_project,
    'Payment to ' || (select full_name from people where id = p_person),
    jsonb_build_array(
      jsonb_build_object('account', v_account, 'amount', p_amount, 'person_id', p_person),
      jsonb_build_object('account','CASH','amount', -p_amount, 'cash_account_id', v_cash)));
  update payouts set journal_entry_id = v_entry where id = v_id;
  return v_id;
end $$;

create or replace function public.mb_pay_person(
  p_org uuid, p_person uuid, p_category text, p_project uuid, p_amount numeric, p_date date default null,
  p_cash_account uuid default null, p_reference text default null, p_notes text default null,
  p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_id uuid;
begin
  perform mb_require_permission(p_org, 'finance.manage');
  perform mb_assert_project_open(p_project);
  v_prev := mb_idem_claim(p_org, p_idempotency_key, 'pay_person');
  if v_prev is not null then return v_prev; end if;
  v_id := mb_pay_person_internal(p_org, p_person, p_category, p_project, p_amount, p_date, p_cash_account,
                                 p_reference, p_notes, null);
  return mb_idem_store(p_org, p_idempotency_key, jsonb_build_object('payout_id', v_id));
end $$;

create or replace function public.mb_delete_payout(p_payout uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare p payouts;
begin
  select * into p from payouts where id = p_payout for update;
  if not found then raise exception 'Payout not found'; end if;
  perform mb_require_permission(p.organization_id, 'finance.manage');
  perform mb_assert_project_open(p.project_id);
  perform mb_require_reason(p_reason);
  if p.deleted_at is not null then return; end if;
  perform mb_set_audit_context('reversed', p_reason);
  if p.journal_entry_id is not null then perform mb_reverse_entry(p.journal_entry_id, p_reason); end if;
  update payouts set deleted_at = now(), deleted_reason = p_reason where id = p_payout;
end $$;

-- Mark Move Beyond's own funding of a project as recovered (memo, E3).
create or replace function public.mb_company_funding_outstanding(p_project uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(amount_egp) from project_funding f join funders fu on fu.id = f.funder_id
                   where f.project_id = p_project and f.deleted_at is null and fu.funder_type = 'company'), 0)
       - coalesce((select sum(amount) from payouts where project_id = p_project and category = 'company_recovery'
                   and deleted_at is null), 0);
$$;

create or replace function public.mb_recover_company_funding_internal(p_org uuid, p_project uuid, p_amount numeric, p_date date, p_settlement uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_out numeric := mb_company_funding_outstanding(p_project);
begin
  if p_amount > v_out then raise exception 'Maximum Move Beyond funding to recover is % EGP', mb_fmt(v_out) using errcode = '22023'; end if;
  insert into payouts (organization_id, person_id, category, project_id, payout_date, amount, settlement_id, notes)
  values (p_org, null, 'company_recovery', p_project, coalesce(p_date, current_date), p_amount, p_settlement,
          'Move Beyond funding recovered from project cash')
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Cash transfer between cash accounts, and bank adjustment (E8)
-- ---------------------------------------------------------------------------
create or replace function public.mb_cash_transfer(p_org uuid, p_from uuid, p_to uuid, p_amount numeric, p_date date, p_reason text default null,
                                                   p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_id uuid; v_entry uuid;
begin
  perform mb_require_permission(p_org, 'finance.manage');
  if p_from = p_to then raise exception 'Choose two different accounts'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  v_prev := mb_idem_claim(p_org, p_idempotency_key, 'cash_transfer');
  if v_prev is not null then return v_prev; end if;
  insert into cash_movements (organization_id, movement_type, movement_date, from_cash_account_id, to_cash_account_id, amount, reason)
  values (p_org, 'transfer', coalesce(p_date, current_date), p_from, p_to, p_amount, p_reason) returning id into v_id;
  v_entry := mb_post_entry(p_org, coalesce(p_date, current_date), 'cash_transfer', v_id, null, coalesce(p_reason, 'Transfer'),
    jsonb_build_array(
      jsonb_build_object('account','CASH','amount', p_amount, 'cash_account_id', p_to),
      jsonb_build_object('account','CASH','amount', -p_amount, 'cash_account_id', p_from)));
  update cash_movements set journal_entry_id = v_entry where id = v_id;
  return mb_idem_store(p_org, p_idempotency_key, jsonb_build_object('movement_id', v_id));
end $$;

create or replace function public.mb_bank_adjustment(p_org uuid, p_cash_account uuid, p_amount numeric, p_date date, p_reason text,
                                                     p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_id uuid; v_entry uuid;
begin
  perform mb_require_permission(p_org, 'finance.manage');
  perform mb_require_reason(p_reason);
  v_prev := mb_idem_claim(p_org, p_idempotency_key, 'bank_adjustment');
  if v_prev is not null then return v_prev; end if;
  insert into cash_movements (organization_id, movement_type, movement_date, to_cash_account_id, amount, reason)
  values (p_org, 'bank_adjustment', coalesce(p_date, current_date), p_cash_account, p_amount, p_reason) returning id into v_id;
  v_entry := mb_post_entry(p_org, coalesce(p_date, current_date), 'bank_adjustment', v_id, null, p_reason,
    jsonb_build_array(
      jsonb_build_object('account','CASH','amount', p_amount, 'cash_account_id', p_cash_account),
      jsonb_build_object('account','OVERHEAD','amount', -p_amount, 'memo', 'Bank adjustment')), p_reason);
  update cash_movements set journal_entry_id = v_entry where id = v_id;
  return mb_idem_store(p_org, p_idempotency_key, jsonb_build_object('movement_id', v_id));
end $$;

-- ---------------------------------------------------------------------------
-- Asset assignment (reuse on another project, spec §72–73)
-- ---------------------------------------------------------------------------
create or replace function public.mb_assign_asset(p_asset uuid, p_project uuid, p_quantity int, p_from date, p_to date,
                                                  p_internal_cost numeric default 0, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare a assets; v_in_use int; v_id uuid;
begin
  select * into a from assets where id = p_asset for update;
  if not found then raise exception 'Asset not found'; end if;
  perform mb_require_permission(a.organization_id, 'assets.manage');
  select coalesce(sum(quantity),0) into v_in_use from asset_assignments where asset_id = p_asset and returned_at is null;
  if v_in_use + p_quantity > a.quantity_owned then
    raise exception 'Only % unit(s) available', a.quantity_owned - v_in_use;
  end if;
  insert into asset_assignments (organization_id, asset_id, project_id, quantity, assigned_from, assigned_to, internal_cost, notes)
  values (a.organization_id, p_asset, p_project, p_quantity, p_from, p_to, coalesce(p_internal_cost,0), p_notes)
  returning id into v_id;
  insert into inventory_movements (organization_id, asset_id, movement_type, quantity, project_id)
  values (a.organization_id, p_asset, 'assign', p_quantity, p_project);
  -- Optional internal charge: project cost, offset against company overhead so
  -- project profit reflects it and the company total is unchanged.
  if coalesce(p_internal_cost, 0) > 0 then
    perform mb_assert_project_open(p_project);
    perform mb_post_entry(a.organization_id, coalesce(p_from, current_date), 'asset_internal_charge', v_id, p_project,
      'Internal use of ' || a.name, jsonb_build_array(
        jsonb_build_object('account','DIRECT_COST','amount', p_internal_cost),
        jsonb_build_object('account','OVERHEAD','amount', -p_internal_cost, 'project_id', null, 'memo', 'Internal asset charge')));
  end if;
  return v_id;
end $$;

create or replace function public.mb_return_asset(p_assignment uuid, p_date date default null)
returns void language plpgsql security definer set search_path = public as $$
declare x asset_assignments;
begin
  select * into x from asset_assignments where id = p_assignment for update;
  perform mb_require_permission(x.organization_id, 'assets.manage');
  update asset_assignments set returned_at = coalesce(p_date, current_date) where id = p_assignment and returned_at is null;
  insert into inventory_movements (organization_id, asset_id, movement_type, quantity, project_id)
  values (x.organization_id, x.asset_id, 'return', x.quantity, x.project_id);
end $$;

-- ---------------------------------------------------------------------------
-- Triggers, RLS
-- ---------------------------------------------------------------------------
create trigger trg_expenses_touch before update on public.expenses for each row execute function public.mb_touch_updated_at();
create trigger trg_assets_touch before update on public.assets for each row execute function public.mb_touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['expenses','expense_payments','project_funding','payouts','cash_movements','assets','asset_assignments'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.mb_audit_trigger()', t);
  end loop;
  foreach t in array array['expenses','expense_payments','project_funding','payouts','cash_movements','assets','asset_assignments','inventory_movements'] loop
    execute format('alter table public.%1$s enable row level security', t);
  end loop;
end $$;

-- Finance sees all; project managers see expenses of their assigned projects (spec §89).
create policy expenses_read on public.expenses for select using (
  mb_has_permission(organization_id, 'finance.view')
  or (project_id is not null and mb_has_permission(organization_id, 'expenses.create_assigned') and mb_is_project_member(project_id)));
create policy expense_payments_read on public.expense_payments for select using (
  mb_has_permission(organization_id, 'finance.view')
  or (project_id is not null and mb_has_permission(organization_id, 'expenses.create_assigned') and mb_is_project_member(project_id)));
create policy project_funding_read on public.project_funding for select using (mb_has_permission(organization_id, 'finance.view'));
create policy payouts_read on public.payouts for select using (mb_has_permission(organization_id, 'finance.view'));
create policy cash_movements_read on public.cash_movements for select using (mb_has_permission(organization_id, 'finance.view'));
create policy assets_read on public.assets for select using (mb_has_permission(organization_id, 'assets.view'));
create policy assets_write on public.assets for update using (mb_has_permission(organization_id, 'assets.manage'))
  with check (mb_has_permission(organization_id, 'assets.manage'));
create policy assets_insert on public.assets for insert with check (mb_has_permission(organization_id, 'assets.manage'));
create policy asset_assignments_read on public.asset_assignments for select using (mb_has_permission(organization_id, 'assets.view'));
create policy inventory_movements_read on public.inventory_movements for select using (mb_has_permission(organization_id, 'assets.view'));
