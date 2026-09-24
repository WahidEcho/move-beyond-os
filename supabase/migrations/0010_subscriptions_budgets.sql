-- 0010_subscriptions_budgets.sql
-- Subscriptions (spec §36) and annual budgets (spec §94).
-- Each subscription belongs to a project of type 'subscription'; billing
-- periods become billing milestones on that project, so collections,
-- reminders and ageing work exactly like any other receivable.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  project_id uuid not null references public.projects(id),
  service_id uuid references public.services(id),
  plan_name text not null,
  billing_cycle text not null check (billing_cycle in ('monthly','quarterly','semiannual','annual','custom')),
  cycle_months int not null check (cycle_months between 1 and 60),
  cycle_amount numeric(14,2) not null check (cycle_amount >= 0),     -- base plan price per cycle
  discount_pct numeric(6,3) not null default 0 check (discount_pct between 0 and 100),
  currency char(3) not null default 'EGP',
  fx_rate numeric(14,6) not null default 1,
  setup_fee numeric(14,2) not null default 0,
  start_date date not null,
  trial_end_date date,
  next_billing_date date,
  end_date date,
  status text not null default 'active' check (status in ('trial','active','paused','cancelled','expired')),
  auto_renew boolean not null default true,
  external_source text,          -- D8: e.g. 'move_it'
  external_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);
create index on public.subscriptions (organization_id) where deleted_at is null;
alter table public.billing_milestones add constraint billing_milestones_subscription_fk
  foreign key (subscription_id) references public.subscriptions(id);

create table public.subscription_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  item_type text not null check (item_type in ('branch_addon','user_addon','module_addon','discount','other')),
  description text not null,
  quantity numeric(10,2) not null default 1,
  amount_per_cycle numeric(14,2) not null,     -- negative for discounts
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.mb_cycle_months(p_cycle text, p_custom int)
returns int language sql immutable as $$
  select case p_cycle when 'monthly' then 1 when 'quarterly' then 3 when 'semiannual' then 6 when 'annual' then 12 else coalesce(p_custom, 1) end;
$$;

-- Amount billed per cycle after add-ons and discount (EGP)
create or replace function public.mb_subscription_cycle_total(p_sub uuid)
returns numeric language sql stable security invoker set search_path = public as $$
  select round((s.cycle_amount + coalesce((select sum(i.quantity * i.amount_per_cycle) from subscription_items i
                                            where i.subscription_id = s.id and i.active), 0))
               * (1 - s.discount_pct / 100), 2)
  from subscriptions s where s.id = p_sub;
$$;

create or replace view public.v_subscription_metrics with (security_invoker = true) as
select s.id as subscription_id, s.organization_id, s.client_id, c.name as client_name, s.project_id, p.code as project_code,
  s.service_id, sv.name as service_name, s.plan_name, s.billing_cycle, s.cycle_months, s.status, s.start_date,
  s.trial_end_date, s.next_billing_date, s.end_date, s.currency, s.fx_rate,
  public.mb_subscription_cycle_total(s.id) as cycle_total,
  case when s.status = 'active' then round(public.mb_subscription_cycle_total(s.id) * s.fx_rate / s.cycle_months, 2) else 0 end::numeric(14,2) as mrr,
  case when s.status = 'active' then round(public.mb_subscription_cycle_total(s.id) * s.fx_rate / s.cycle_months * 12, 2) else 0 end::numeric(14,2) as arr,
  coalesce((select sum(r.amount * r.fx_rate) from public.v_receivables r where r.subscription_id = s.id), 0)::numeric(14,2) as invoiced,
  coalesce((select sum(r.collected * r.fx_rate) from public.v_receivables r where r.subscription_id = s.id), 0)::numeric(14,2) as collected,
  coalesce((select sum(r.outstanding * r.fx_rate) from public.v_receivables r where r.subscription_id = s.id and r.days_overdue > 0), 0)::numeric(14,2) as overdue
from public.subscriptions s
join public.clients c on c.id = s.client_id
join public.projects p on p.id = s.project_id
left join public.services sv on sv.id = s.service_id
where s.deleted_at is null;

-- Create subscription (and its project) in one call.
-- p_payload: {client_id, service_id, plan_name, billing_cycle, cycle_months, cycle_amount, discount_pct, currency, fx_rate,
--   setup_fee, start_date, trial_end_date, end_date, status, auto_renew, external_source, external_id, notes,
--   project_name, items:[{item_type, description, quantity, amount_per_cycle}], bill_first_period}
create or replace function public.mb_create_subscription(p_org uuid, p_payload jsonb, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prev jsonb; v_project jsonb; v_sub uuid; v_client_name text; v_service_name text;
  v_cycle text := coalesce(nullif(p_payload->>'billing_cycle',''), 'monthly');
  v_months int := mb_cycle_months(v_cycle, nullif(p_payload->>'cycle_months','')::int);
  v_start date := coalesce(nullif(p_payload->>'start_date','')::date, current_date);
  v_trial date := nullif(p_payload->>'trial_end_date','')::date;
  v_status text := coalesce(nullif(p_payload->>'status',''), case when nullif(p_payload->>'trial_end_date','') is not null then 'trial' else 'active' end);
begin
  perform mb_require_permission(p_org, 'subscriptions.manage');
  v_prev := mb_idem_claim(p_org, p_idempotency_key, 'create_subscription');
  if v_prev is not null then return v_prev; end if;
  select name into v_client_name from clients where id = (p_payload->>'client_id')::uuid;
  select name into v_service_name from services where id = nullif(p_payload->>'service_id','')::uuid;

  v_project := mb_create_project(p_org, jsonb_build_object(
    'name', coalesce(nullif(p_payload->>'project_name',''), v_client_name || ' — ' || coalesce(v_service_name, p_payload->>'plan_name')),
    'client_id', p_payload->>'client_id', 'project_type', 'subscription', 'payment_structure', 'subscription',
    'service_ids', case when nullif(p_payload->>'service_id','') is not null then jsonb_build_array(p_payload->>'service_id') else '[]'::jsonb end,
    'start_date', v_start, 'end_date', p_payload->>'end_date', 'currency', coalesce(nullif(p_payload->>'currency',''),'EGP'),
    'fx_rate', coalesce(nullif(p_payload->>'fx_rate',''),'1'), 'operational_status', 'live', 'contract_value', 0), null);

  insert into subscriptions (organization_id, client_id, project_id, service_id, plan_name, billing_cycle, cycle_months, cycle_amount,
    discount_pct, currency, fx_rate, setup_fee, start_date, trial_end_date, next_billing_date, end_date, status, auto_renew,
    external_source, external_id, notes)
  values (p_org, (p_payload->>'client_id')::uuid, (v_project->>'project_id')::uuid, nullif(p_payload->>'service_id','')::uuid,
    coalesce(nullif(p_payload->>'plan_name',''), v_cycle), v_cycle, v_months, coalesce(nullif(p_payload->>'cycle_amount','')::numeric, 0),
    coalesce(nullif(p_payload->>'discount_pct','')::numeric, 0), coalesce(nullif(p_payload->>'currency',''),'EGP'),
    coalesce(nullif(p_payload->>'fx_rate','')::numeric, 1), coalesce(nullif(p_payload->>'setup_fee','')::numeric, 0),
    v_start, v_trial, coalesce(v_trial, v_start), nullif(p_payload->>'end_date','')::date, v_status,
    coalesce((p_payload->>'auto_renew')::boolean, true), p_payload->>'external_source', p_payload->>'external_id', p_payload->>'notes')
  returning id into v_sub;

  insert into subscription_items (organization_id, subscription_id, item_type, description, quantity, amount_per_cycle)
  select p_org, v_sub, coalesce(i->>'item_type','other'), i->>'description', coalesce(nullif(i->>'quantity','')::numeric,1),
         (i->>'amount_per_cycle')::numeric
  from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) i;

  if coalesce((p_payload->>'setup_fee')::numeric, 0) > 0 then
    insert into billing_milestones (organization_id, project_id, contract_id, subscription_id, label, trigger_kind, due_date, amount)
    select p_org, (v_project->>'project_id')::uuid, (v_project->>'contract_id')::uuid, v_sub, 'Setup fee', 'signing', v_start,
           (p_payload->>'setup_fee')::numeric;
    update contracts set original_value = original_value + (p_payload->>'setup_fee')::numeric where id = (v_project->>'contract_id')::uuid;
  end if;

  if coalesce((p_payload->>'bill_first_period')::boolean, true) and v_status = 'active' then
    perform mb_bill_subscription_period(v_sub);
  end if;

  return mb_idem_store(p_org, p_idempotency_key,
    jsonb_build_object('subscription_id', v_sub, 'project_id', v_project->>'project_id', 'code', v_project->>'code'));
end $$;

-- Issue the next period as a receivable and advance next_billing_date.
create or replace function public.mb_bill_subscription_period(p_sub uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare s subscriptions; v_total numeric; v_id uuid; v_contract uuid; v_period_end date;
begin
  select * into s from subscriptions where id = p_sub for update;
  if not found then raise exception 'Subscription not found'; end if;
  perform mb_require_permission(s.organization_id, 'subscriptions.manage');
  if s.status not in ('active') then raise exception 'Only active subscriptions can be billed'; end if;
  if s.end_date is not null and s.next_billing_date > s.end_date then raise exception 'Subscription has ended'; end if;
  v_total := mb_subscription_cycle_total(p_sub);
  v_period_end := (s.next_billing_date + make_interval(months => s.cycle_months) - interval '1 day')::date;
  select id into v_contract from contracts where project_id = s.project_id;
  if v_total > 0 then
    insert into billing_milestones (organization_id, project_id, contract_id, subscription_id, label, trigger_kind, due_date, amount, invoiced_at)
    values (s.organization_id, s.project_id, v_contract, s.id,
            s.plan_name || ' · ' || to_char(s.next_billing_date, 'DD Mon YYYY') || ' – ' || to_char(v_period_end, 'DD Mon YYYY'),
            'subscription_period', s.next_billing_date, v_total, current_date)
    returning id into v_id;
    update contracts set original_value = original_value + v_total where id = v_contract;
  end if;
  update subscriptions set next_billing_date = (next_billing_date + make_interval(months => cycle_months))::date where id = p_sub;
  return v_id;
end $$;

create or replace function public.mb_set_subscription_status(p_sub uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s subscriptions;
begin
  select * into s from subscriptions where id = p_sub for update;
  perform mb_require_permission(s.organization_id, 'subscriptions.manage');
  perform mb_set_audit_context('status_change', p_reason);
  update subscriptions set status = p_status,
    end_date = case when p_status in ('cancelled','expired') then coalesce(end_date, current_date) else end_date end
  where id = p_sub;
end $$;

-- ---------------------------------------------------------------------------
-- Budgets (schema now; UI after go-live)
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fiscal_year int not null,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (organization_id, fiscal_year, name)
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  line_type text not null check (line_type in ('revenue_target','expense_budget','gross_profit_target','sponsorship_budget',
                                               'asset_investment','technology_development_budget','reserve_target','overhead_budget')),
  expense_category_id uuid references public.expense_categories(id),
  service_category_id uuid references public.service_categories(id),
  month int check (month between 1 and 12),      -- null = whole year
  amount numeric(14,2) not null,
  notes text
);

create trigger trg_subscriptions_touch before update on public.subscriptions for each row execute function public.mb_touch_updated_at();
do $$
declare t text;
begin
  foreach t in array array['subscriptions','subscription_items','budgets','budget_lines'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.mb_audit_trigger()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy %1$s_read on public.%1$s for select using (public.mb_has_permission(organization_id, ''finance.view''))', t);
  end loop;
end $$;
create policy subscriptions_update on public.subscriptions for update
  using (mb_has_permission(organization_id, 'subscriptions.manage')) with check (mb_has_permission(organization_id, 'subscriptions.manage'));
create policy subscription_items_write on public.subscription_items for all
  using (mb_has_permission(organization_id, 'subscriptions.manage')) with check (mb_has_permission(organization_id, 'subscriptions.manage'));
create policy budgets_write on public.budgets for all
  using (mb_has_permission(organization_id, 'finance.manage')) with check (mb_has_permission(organization_id, 'finance.manage'));
create policy budget_lines_write on public.budget_lines for all
  using (mb_has_permission(organization_id, 'finance.manage')) with check (mb_has_permission(organization_id, 'finance.manage'));
