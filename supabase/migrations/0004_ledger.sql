-- 0004_ledger.sql
-- Double-entry ledger (spec §98). Users never see debit/credit; every mb_* RPC
-- writes a balanced journal entry. Balances are always derived from lines.
--
-- Sign convention: journal_lines.amount > 0 = debit, < 0 = credit (EGP).
-- Dimensions on lines: project_id, person_id, cash_account_id, category_id.

create table public.accounts (
  code text primary key,
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense')),
  description text,
  sort_order int not null default 0
);

insert into public.accounts (code, name, account_type, sort_order, description) values
  ('CASH',              'Cash (bank and partner-held)',   'asset',     10, 'Dimension cash_account_id says where the money sits'),
  ('FIXED_ASSETS',      'Fixed assets (capitalised)',     'asset',     20, 'Only for purchases flagged capitalize'),
  ('DUE_FUNDING',       'Funding due to funder',          'liability', 30, 'Partner/person funding, incl. partner-paid project costs'),
  ('DUE_EMPLOYEE',      'Reimbursement due to employee',  'liability', 40, null),
  ('DUE_FEE',           'Partner fees due',               'liability', 50, null),
  ('DUE_CTO',           'CTO development recovery due',   'liability', 60, null),
  ('DUE_PROFIT',        'Profit distribution due',        'liability', 70, null),
  ('DUE_CARRY',         'Carry-forward balance',          'liability', 80, 'Historical adjustments and netted losses; may be negative'),
  ('PARTNER_CAPITAL',   'Partner capital / reinvestment', 'equity',    90, 'Reinvested profit, non-reimbursable contributions'),
  ('OPENING_EQUITY',    'Opening balance equity',         'equity',   100, null),
  ('DISTRIBUTIONS',     'Profit distributed / loss allocated', 'equity', 110, 'By project and person'),
  ('REVENUE',           'Revenue',                        'revenue',  200, 'Cash basis (D1)'),
  ('DIRECT_COST',       'Direct project costs',           'expense',  300, null),
  ('PARTNER_FEE_COST',  'Partner / commercial fees',      'expense',  310, 'Fees with treatment project_cost'),
  ('CTO_RECOVERY_COST', 'CTO development recovery',       'expense',  320, 'Recoveries with treatment project_cost'),
  ('OVERHEAD',          'Company overhead',               'expense',  400, 'Expenses without a project, bank adjustments');

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entry_date date not null,
  source_type text not null,     -- client_payment, expense_payment, funding, payout, partner_fee, cto_recovery_allocated, ...
  source_id uuid,
  project_id uuid references public.projects(id),
  description text,
  reason text,
  reversal_of uuid references public.journal_entries(id),
  reversed_by uuid references public.journal_entries(id),
  posted_by uuid default auth.uid(),
  posted_at timestamptz not null default now()
);
create index on public.journal_entries (organization_id, entry_date);
create index on public.journal_entries (source_type, source_id);
create index on public.journal_entries (project_id);
create unique index journal_entries_one_reversal on public.journal_entries (reversal_of) where reversal_of is not null;

create table public.journal_lines (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entry_id uuid not null references public.journal_entries(id) on delete restrict,
  account_code text not null references public.accounts(code),
  amount numeric(14,2) not null check (amount <> 0),
  project_id uuid references public.projects(id),
  person_id uuid references public.people(id),
  cash_account_id uuid references public.cash_accounts(id),
  category_id uuid references public.expense_categories(id),
  memo text
);
create index on public.journal_lines (entry_id);
create index on public.journal_lines (organization_id, account_code);
create index on public.journal_lines (project_id, account_code);
create index on public.journal_lines (person_id, account_code);
create index on public.journal_lines (cash_account_id);

-- Every entry must balance to zero and have at least two lines (checked at commit).
create or replace function public.mb_check_entry_balanced()
returns trigger language plpgsql as $$
declare v_sum numeric; v_count int;
begin
  select coalesce(sum(amount),0), count(*) into v_sum, v_count
  from public.journal_lines where entry_id = new.entry_id;
  if v_count < 2 or v_sum <> 0 then
    raise exception 'Unbalanced journal entry % (lines=%, sum=%)', new.entry_id, v_count, v_sum;
  end if;
  return null;
end $$;
create constraint trigger trg_journal_balanced after insert on public.journal_lines
  deferrable initially deferred for each row execute function public.mb_check_entry_balanced();

-- Posted history is immutable. Only journal_entries.reversed_by may be set once.
create or replace function public.mb_ledger_immutable()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'journal_entries' and tg_op = 'UPDATE'
     and old.reversed_by is null and new.reversed_by is not null
     and (to_jsonb(new) - 'reversed_by') = (to_jsonb(old) - 'reversed_by') then
    return new;
  end if;
  raise exception 'Posted ledger records cannot be modified or deleted; post a reversal instead.';
end $$;
create trigger trg_journal_entries_immutable before update or delete on public.journal_entries
  for each row execute function public.mb_ledger_immutable();
create trigger trg_journal_lines_immutable before update or delete on public.journal_lines
  for each row execute function public.mb_ledger_immutable();

-- Human-readable EGP amount for error messages: 20000 -> '20,000'
create or replace function public.mb_fmt(p numeric)
returns text language sql immutable as $$
  select case when p = trunc(p) then to_char(p, 'FM999,999,999,990') else to_char(p, 'FM999,999,999,990.00') end;
$$;

-- ---------------------------------------------------------------------------
-- Posting API (internal; called only by other mb_* functions)
-- p_lines: [{account, amount, project_id?, person_id?, cash_account_id?, category_id?, memo?}]
-- ---------------------------------------------------------------------------
create or replace function public.mb_post_entry(
  p_org uuid, p_date date, p_source_type text, p_source_id uuid, p_project uuid,
  p_description text, p_lines jsonb, p_reason text default null, p_reversal_of uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_entry uuid;
  v_line jsonb;
  v_closed text;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'A journal entry needs at least two lines';
  end if;

  -- No new postings into a financially closed project (spec §83–84).
  if coalesce(current_setting('mb.allow_closed_edit', true), '') <> 'on' then
    select p.code into v_closed from projects p
    where p.financial_status = 'financially_closed'
      and p.id in (select p_project union
                   select nullif(l->>'project_id','')::uuid from jsonb_array_elements(p_lines) l)
    limit 1;
    if v_closed is not null then
      raise exception 'Project % is financially closed. Reopen it before posting.', v_closed using errcode = 'P0001';
    end if;
  end if;

  insert into journal_entries (organization_id, entry_date, source_type, source_id, project_id, description, reason, reversal_of)
  values (p_org, coalesce(p_date, (now() at time zone 'Africa/Cairo')::date), p_source_type, p_source_id, p_project,
          p_description, p_reason, p_reversal_of)
  returning id into v_entry;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if coalesce((v_line->>'amount')::numeric, 0) = 0 then
      continue;  -- zero lines are skipped (e.g. optional splits)
    end if;
    insert into journal_lines (organization_id, entry_id, account_code, amount, project_id, person_id, cash_account_id, category_id, memo)
    values (p_org, v_entry, v_line->>'account', round((v_line->>'amount')::numeric, 2),
            -- a line may opt out of the entry's project by passing "project_id": null
            case when v_line ? 'project_id' then nullif(v_line->>'project_id','')::uuid else p_project end,
            nullif(v_line->>'person_id','')::uuid,
            nullif(v_line->>'cash_account_id','')::uuid,
            nullif(v_line->>'category_id','')::uuid,
            v_line->>'memo');
  end loop;
  return v_entry;
end $$;

create or replace function public.mb_reverse_entry(p_entry uuid, p_reason text, p_date date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  e journal_entries;
  v_new uuid;
begin
  select * into e from journal_entries where id = p_entry for update;
  if not found then raise exception 'Journal entry % not found', p_entry; end if;
  if e.reversed_by is not null then return e.reversed_by; end if;   -- idempotent
  if e.reversal_of is not null then raise exception 'Cannot reverse a reversal'; end if;

  insert into journal_entries (organization_id, entry_date, source_type, source_id, project_id, description, reason, reversal_of)
  values (e.organization_id, coalesce(p_date, (now() at time zone 'Africa/Cairo')::date), e.source_type, e.source_id,
          e.project_id, 'Reversal: ' || coalesce(e.description,''), p_reason, e.id)
  returning id into v_new;

  insert into journal_lines (organization_id, entry_id, account_code, amount, project_id, person_id, cash_account_id, category_id, memo)
  select organization_id, v_new, account_code, -amount, project_id, person_id, cash_account_id, category_id, memo
  from journal_lines where entry_id = e.id;

  update journal_entries set reversed_by = v_new where id = e.id;
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Idempotency (spec §103): the first call with a key wins; repeats return the
-- stored result. Concurrent duplicates block on the unique index, then read.
-- ---------------------------------------------------------------------------
create table public.idempotency_keys (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  operation text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (organization_id, key)
);

create or replace function public.mb_idem_claim(p_org uuid, p_key text, p_operation text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_inserted int;
begin
  if p_key is null or p_key = '' then return null; end if;
  insert into idempotency_keys (organization_id, key, operation) values (p_org, p_key, p_operation)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then return null; end if;
  select result into v_result from idempotency_keys where organization_id = p_org and key = p_key;
  return coalesce(v_result, jsonb_build_object('duplicate', true));
end $$;

create or replace function public.mb_idem_store(p_org uuid, p_key text, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_key is not null and p_key <> '' then
    update idempotency_keys set result = p_result where organization_id = p_org and key = p_key;
  end if;
  return p_result;
end $$;

alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.idempotency_keys enable row level security;

create policy accounts_read on public.accounts for select using (auth.uid() is not null);
create policy journal_entries_read on public.journal_entries for select using (mb_has_permission(organization_id, 'finance.view'));
create policy journal_lines_read on public.journal_lines for select using (mb_has_permission(organization_id, 'finance.view'));
