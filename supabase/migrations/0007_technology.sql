-- 0007_technology.sql
-- CTO Development Recovery (spec §44–62, §99, §113, §131).
-- A technology record carries an agreed recoverable value (history of
-- adjustments). Projects that reuse it may allocate recovery amounts, capped at
-- the outstanding value. Allocation posts to the ledger (DUE_CTO); payment is a
-- normal payout (category 'cto').

create table public.technology_developments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  developer_person_id uuid not null references public.people(id),
  category_id uuid references public.technology_categories(id),
  original_project_id uuid references public.projects(id),
  development_start_date date,
  completion_date date,
  ownership text not null default 'Move Beyond',
  reusable boolean not null default true,
  lifecycle_status text not null default 'completed'
    check (lifecycle_status in ('planned','in_development','completed','cancelled','archived')),
  -- Future Technology Library fields (spec §120)
  current_version text,
  source_repository text,
  hosting text,
  commercial_potential text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);
create index on public.technology_developments (organization_id) where deleted_at is null;
create index technology_name_trgm on public.technology_developments using gin (name gin_trgm_ops);

create table public.technology_services (
  technology_id uuid not null references public.technology_developments(id) on delete cascade,
  service_id uuid not null references public.services(id),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (technology_id, service_id)
);

-- Value history: initial + extensions/reductions. Current value = sum.
create table public.technology_development_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  technology_id uuid not null references public.technology_developments(id) on delete cascade,
  kind text not null check (kind in ('initial','extension','reduction')),
  amount numeric(14,2) not null,        -- signed
  reason text not null,
  effective_date date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check ((kind = 'reduction' and amount < 0) or (kind <> 'reduction' and amount >= 0))
);
create index on public.technology_development_adjustments (technology_id);

create table public.project_technology_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  technology_id uuid not null references public.technology_developments(id),
  recovery_decision text not null default 'pending'
    check (recovery_decision in ('pending','add_recovery','decide_at_settlement','no_recovery')),
  planned_recovery numeric(14,2) check (planned_recovery >= 0),   -- used by forecasts
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, technology_id)
);

create table public.cto_recovery_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  technology_id uuid not null references public.technology_developments(id),
  project_id uuid references public.projects(id),     -- null only for opening (pre-system) recoveries
  beneficiary_person_id uuid not null references public.people(id),
  amount numeric(14,2) not null check (amount > 0),
  treatment text not null default 'project_cost' check (treatment in ('project_cost','from_share','opening')),
  allocation_date date not null default current_date,
  status text not null default 'allocated' check (status in ('allocated','reversed')),
  settlement_id uuid,
  notes text,
  journal_entry_id uuid references public.journal_entries(id),
  reversed_at timestamptz,
  reversal_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check ((treatment = 'opening') = (project_id is null))
);
create index on public.cto_recovery_allocations (technology_id) where status = 'allocated';
create index on public.cto_recovery_allocations (project_id) where status = 'allocated';

-- ---------------------------------------------------------------------------
-- Derived numbers (single source for UI, reports and RPC checks)
-- ---------------------------------------------------------------------------
create or replace function public.mb_technology_value(p_tech uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from technology_development_adjustments where technology_id = p_tech;
$$;

create or replace function public.mb_technology_recovered(p_tech uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from cto_recovery_allocations where technology_id = p_tech and status = 'allocated';
$$;

create or replace function public.mb_technology_outstanding(p_tech uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select mb_technology_value(p_tech) - mb_technology_recovered(p_tech);
$$;

-- ---------------------------------------------------------------------------
-- Create technology development (source: cto_development_created)
-- p_payload: {name, description, developer_person_id, category_id, original_project_id,
--   development_start_date, completion_date, ownership, reusable, lifecycle_status,
--   agreed_value, already_recovered, service_ids[], notes, current_version, source_repository, hosting}
-- ---------------------------------------------------------------------------
create or replace function public.mb_create_technology(p_org uuid, p_payload jsonb, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prev jsonb; v_id uuid;
  v_dev uuid := nullif(p_payload->>'developer_person_id','')::uuid;
  v_value numeric := coalesce(nullif(p_payload->>'agreed_value','')::numeric, 0);
  v_already numeric := coalesce(nullif(p_payload->>'already_recovered','')::numeric, 0);
  v_eligible boolean;
begin
  perform mb_require_permission(p_org, 'technology.manage');
  v_prev := mb_idem_claim(p_org, p_idempotency_key, 'create_technology');
  if v_prev is not null then return v_prev; end if;

  if v_dev is null then
    select id into v_dev from people where organization_id = p_org and technology_recovery_eligible and active
    order by created_at limit 1;
  end if;
  select technology_recovery_eligible into v_eligible from people where id = v_dev and organization_id = p_org;
  if not coalesce(v_eligible, false) then
    raise exception 'The selected developer is not eligible for technology development recovery' using errcode = '22023';
  end if;
  if v_value < 0 or v_already < 0 or v_already > v_value then
    raise exception 'Already-recovered amount cannot exceed the agreed value' using errcode = '22023';
  end if;

  insert into technology_developments (organization_id, name, description, developer_person_id, category_id, original_project_id,
    development_start_date, completion_date, ownership, reusable, lifecycle_status, notes, current_version, source_repository, hosting)
  values (p_org, trim(p_payload->>'name'), p_payload->>'description', v_dev, nullif(p_payload->>'category_id','')::uuid,
    nullif(p_payload->>'original_project_id','')::uuid, nullif(p_payload->>'development_start_date','')::date,
    nullif(p_payload->>'completion_date','')::date, coalesce(nullif(p_payload->>'ownership',''), 'Move Beyond'),
    coalesce((p_payload->>'reusable')::boolean, true), coalesce(nullif(p_payload->>'lifecycle_status',''), 'completed'),
    p_payload->>'notes', p_payload->>'current_version', p_payload->>'source_repository', p_payload->>'hosting')
  returning id into v_id;

  perform mb_set_audit_context('cto_development_created', null);
  insert into technology_development_adjustments (organization_id, technology_id, kind, amount, reason)
  values (p_org, v_id, 'initial', v_value, 'Agreed recoverable development value');

  if v_already > 0 then
    insert into cto_recovery_allocations (organization_id, technology_id, project_id, beneficiary_person_id, amount, treatment, notes)
    values (p_org, v_id, null, v_dev, v_already, 'opening', 'Recovered before the system went live');
  end if;

  insert into technology_services (technology_id, service_id, organization_id)
  select v_id, s::uuid, p_org from jsonb_array_elements_text(coalesce(p_payload->'service_ids','[]'::jsonb)) s
  on conflict do nothing;

  -- If created from a project, that project uses it.
  if nullif(p_payload->>'original_project_id','') is not null then
    insert into project_technology_usage (organization_id, project_id, technology_id, recovery_decision)
    values (p_org, (p_payload->>'original_project_id')::uuid, v_id, 'decide_at_settlement')
    on conflict do nothing;
  end if;

  return mb_idem_store(p_org, p_idempotency_key, jsonb_build_object('technology_id', v_id));
end $$;

-- Development change order (spec §55) — source: cto_development_adjusted
create or replace function public.mb_adjust_technology_value(p_tech uuid, p_kind text, p_amount numeric, p_reason text, p_date date default null)
returns void language plpgsql security definer set search_path = public as $$
declare t technology_developments; v_signed numeric;
begin
  select * into t from technology_developments where id = p_tech for update;
  if not found then raise exception 'Technology not found'; end if;
  perform mb_require_permission(t.organization_id, 'technology.manage');
  perform mb_require_reason(p_reason);
  if p_kind not in ('extension','reduction') then raise exception 'Kind must be extension or reduction'; end if;
  v_signed := case when p_kind = 'reduction' then -abs(p_amount) else abs(p_amount) end;
  if mb_technology_value(p_tech) + v_signed < mb_technology_recovered(p_tech) then
    raise exception 'Value cannot be reduced below the % already recovered', mb_technology_recovered(p_tech) using errcode = '22023';
  end if;
  perform mb_set_audit_context('cto_development_adjusted', p_reason);
  insert into technology_development_adjustments (organization_id, technology_id, kind, amount, reason, effective_date)
  values (t.organization_id, p_tech, p_kind, v_signed, p_reason, coalesce(p_date, current_date));
end $$;

-- Assign technology to a project (spec §51)
create or replace function public.mb_set_project_technology(p_project uuid, p_tech uuid, p_decision text default 'pending',
                                                           p_planned numeric default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := mb_project_org(p_project); v_id uuid;
begin
  perform mb_require_permission(v_org, 'projects.manage');
  insert into project_technology_usage (organization_id, project_id, technology_id, recovery_decision, planned_recovery, notes)
  values (v_org, p_project, p_tech, coalesce(p_decision,'pending'), p_planned, p_notes)
  on conflict (project_id, technology_id) do update
    set recovery_decision = excluded.recovery_decision, planned_recovery = excluded.planned_recovery,
        notes = coalesce(excluded.notes, project_technology_usage.notes), updated_at = now()
  returning id into v_id;
  return jsonb_build_object('usage_id', v_id, 'outstanding', mb_technology_outstanding(p_tech),
                            'developer', (select p.full_name from technology_developments t join people p on p.id = t.developer_person_id where t.id = p_tech));
end $$;

create or replace function public.mb_remove_project_technology(p_project uuid, p_tech uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := mb_project_org(p_project);
begin
  perform mb_require_permission(v_org, 'projects.manage');
  if exists (select 1 from cto_recovery_allocations where project_id = p_project and technology_id = p_tech and status = 'allocated') then
    raise exception 'This project already allocated recovery to the technology; reverse it first';
  end if;
  delete from project_technology_usage where project_id = p_project and technology_id = p_tech;
end $$;

-- ---------------------------------------------------------------------------
-- Allocate recovery from a project (source: cto_recovery_allocated). Hard cap (§54).
-- ---------------------------------------------------------------------------
create or replace function public.mb_allocate_cto_recovery_internal(
  p_tech uuid, p_project uuid, p_amount numeric, p_treatment text, p_date date, p_settlement uuid, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t technology_developments;
  v_out numeric; v_id uuid; v_entry uuid;
  v_treatment text := coalesce(p_treatment, 'project_cost');
  v_eligible boolean;
begin
  select * into t from technology_developments where id = p_tech and deleted_at is null for update;   -- serialises concurrent allocations
  if not found then raise exception 'Technology not found'; end if;
  if p_project is null then raise exception 'A project is required'; end if;
  if v_treatment not in ('project_cost','from_share') then raise exception 'Invalid treatment'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Recovery amount must be positive' using errcode = '22023'; end if;
  select technology_recovery_eligible into v_eligible from people where id = t.developer_person_id;
  if not coalesce(v_eligible, false) then
    raise exception 'Developer is not eligible for technology recovery';
  end if;

  v_out := mb_technology_outstanding(p_tech);
  if p_amount > v_out then
    raise exception 'Maximum remaining recovery is % EGP.', mb_fmt(v_out) using errcode = '22023';
  end if;

  insert into cto_recovery_allocations (organization_id, technology_id, project_id, beneficiary_person_id, amount, treatment,
                                        allocation_date, settlement_id, notes)
  values (t.organization_id, p_tech, p_project, t.developer_person_id, p_amount, v_treatment, coalesce(p_date, current_date),
          p_settlement, p_notes)
  returning id into v_id;

  v_entry := mb_post_entry(t.organization_id, coalesce(p_date, current_date), 'cto_recovery_allocated', v_id, p_project,
    'CTO development recovery — ' || t.name,
    jsonb_build_array(
      jsonb_build_object('account', case when v_treatment = 'project_cost' then 'CTO_RECOVERY_COST' else 'DISTRIBUTIONS' end,
                         'amount', p_amount, 'person_id', case when v_treatment = 'from_share' then t.developer_person_id end),
      jsonb_build_object('account','DUE_CTO','amount', -p_amount, 'person_id', t.developer_person_id)));
  update cto_recovery_allocations set journal_entry_id = v_entry where id = v_id;

  insert into project_technology_usage (organization_id, project_id, technology_id, recovery_decision)
  values (t.organization_id, p_project, p_tech, 'add_recovery')
  on conflict (project_id, technology_id) do update set recovery_decision = 'add_recovery', updated_at = now();
  return v_id;
end $$;

create or replace function public.mb_allocate_cto_recovery(
  p_tech uuid, p_project uuid, p_amount numeric, p_treatment text default 'project_cost', p_date date default null,
  p_notes text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_prev jsonb; v_id uuid;
begin
  select organization_id into v_org from technology_developments where id = p_tech;
  perform mb_require_permission(v_org, 'technology.recover');
  perform mb_assert_project_open(p_project);
  v_prev := mb_idem_claim(v_org, p_idempotency_key, 'cto_allocate');
  if v_prev is not null then return v_prev; end if;
  v_id := mb_allocate_cto_recovery_internal(p_tech, p_project, p_amount, p_treatment, p_date, null, p_notes);
  return mb_idem_store(v_org, p_idempotency_key,
    jsonb_build_object('allocation_id', v_id, 'outstanding', mb_technology_outstanding(p_tech)));
end $$;

-- Reverse an allocation (source: cto_recovery_reversed). Blocked if already paid out.
create or replace function public.mb_reverse_cto_recovery(p_allocation uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare a cto_recovery_allocations; v_due numeric;
begin
  select * into a from cto_recovery_allocations where id = p_allocation for update;
  if not found then raise exception 'Allocation not found'; end if;
  perform mb_require_permission(a.organization_id, 'technology.recover');
  perform mb_assert_project_open(a.project_id);
  perform mb_require_reason(p_reason);
  if a.status = 'reversed' then return; end if;
  perform 1 from technology_developments where id = a.technology_id for update;
  if a.treatment <> 'opening' then
    v_due := mb_person_due(a.organization_id, a.beneficiary_person_id, 'cto', a.project_id);
    if v_due < a.amount then
      raise exception 'Part of this recovery has already been paid (% still due). Reverse the CTO payment first.', v_due using errcode = '22023';
    end if;
  end if;
  perform mb_set_audit_context('cto_recovery_reversed', p_reason);
  if a.journal_entry_id is not null then perform mb_reverse_entry(a.journal_entry_id, p_reason); end if;
  update cto_recovery_allocations set status = 'reversed', reversed_at = now(), reversal_reason = p_reason where id = p_allocation;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers, RLS
-- ---------------------------------------------------------------------------
create trigger trg_technology_touch before update on public.technology_developments for each row execute function public.mb_touch_updated_at();
create trigger trg_ptu_touch before update on public.project_technology_usage for each row execute function public.mb_touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['technology_developments','technology_services','technology_development_adjustments',
                           'project_technology_usage','cto_recovery_allocations'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.mb_audit_trigger()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy %1$s_read on public.%1$s for select using (public.mb_has_permission(organization_id, ''technology.view''))', t);
  end loop;
end $$;

create policy technology_developments_update on public.technology_developments for update
  using (mb_has_permission(organization_id, 'technology.manage'))
  with check (mb_has_permission(organization_id, 'technology.manage'));
create policy technology_services_write on public.technology_services for all
  using (mb_has_permission(organization_id, 'technology.manage'))
  with check (mb_has_permission(organization_id, 'technology.manage'));
