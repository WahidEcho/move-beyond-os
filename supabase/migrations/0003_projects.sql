-- 0003_projects.sql
-- One project record shared by Finance now and Operations/CRM/Tasks later.

create table public.project_code_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year_2d int not null,
  last_number int not null default 0,
  primary key (organization_id, year_2d)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  client_id uuid references public.clients(id),
  project_type text not null default 'event'
    check (project_type in ('event','one_time_service','subscription','recurring_contract','product_sale',
                            'sponsorship','internal','other')),
  operational_status text not null default 'confirmed'
    check (operational_status in ('lead','confirmed','preparation','live','completed','cancelled')),
  financial_status text not null default 'draft'
    check (financial_status in ('draft','funding_required','active','awaiting_collection','settlement_required',
                                'partially_settled','financially_closed')),
  start_date date,
  end_date date,
  currency char(3) not null default 'EGP',
  payment_structure text not null default 'custom'
    check (payment_structure in ('upfront','downpayment_final','milestones','after_completion','custom','subscription','none')),
  budget_amount numeric(14,2),
  -- Sponsorship/marketing investments may intentionally have zero revenue (spec §16).
  is_marketing_investment boolean not null default false,
  description text,
  location text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text,
  unique (organization_id, code)
);
create index on public.projects (organization_id, created_at desc) where deleted_at is null;
create index on public.projects (client_id);
create index projects_name_trgm on public.projects using gin (name gin_trgm_ops);

create table public.project_services (
  project_id uuid not null references public.projects(id) on delete cascade,
  service_id uuid not null references public.services(id),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  notes text,
  primary key (project_id, service_id)
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null references public.people(id),
  project_role text not null default 'project_manager'
    check (project_role in ('project_manager','event_manager','lead_generator','operations','staff','other')),
  created_at timestamptz not null default now(),
  primary key (project_id, person_id, project_role)
);

create table public.project_status_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status_kind text not null check (status_kind in ('operational','financial')),
  from_status text,
  to_status text not null,
  reason text,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index on public.project_status_history (project_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Project code: MB-YYNNN (e.g. MB-26001). Year from start date, else today.
-- ---------------------------------------------------------------------------
create or replace function public.mb_next_project_code(p_org uuid, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_yy int := (extract(year from coalesce(p_date, (now() at time zone 'Africa/Cairo')::date))::int % 100);
  v_n int;
  v_prefix text;
begin
  select project_code_prefix into v_prefix from organization_settings where organization_id = p_org;
  insert into project_code_counters (organization_id, year_2d, last_number)
  values (p_org, v_yy, 1)
  on conflict (organization_id, year_2d) do update set last_number = project_code_counters.last_number + 1
  returning last_number into v_n;
  return coalesce(v_prefix,'MB') || '-' || lpad(v_yy::text, 2, '0') || lpad(v_n::text, 3, '0');
end $$;

create or replace function public.mb_projects_before_insert()
returns trigger language plpgsql as $$
begin
  if new.code is null or new.code = '' then
    new.code := public.mb_next_project_code(new.organization_id, new.start_date);
  end if;
  return new;
end $$;
create trigger trg_projects_code before insert on public.projects
  for each row execute function public.mb_projects_before_insert();

create or replace function public.mb_projects_status_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into project_status_history (organization_id, project_id, status_kind, from_status, to_status)
    values (new.organization_id, new.id, 'operational', null, new.operational_status),
           (new.organization_id, new.id, 'financial', null, new.financial_status);
  else
    if new.operational_status is distinct from old.operational_status then
      insert into project_status_history (organization_id, project_id, status_kind, from_status, to_status, reason)
      values (new.organization_id, new.id, 'operational', old.operational_status, new.operational_status,
              nullif(current_setting('mb.audit_reason', true), ''));
    end if;
    if new.financial_status is distinct from old.financial_status then
      insert into project_status_history (organization_id, project_id, status_kind, from_status, to_status, reason)
      values (new.organization_id, new.id, 'financial', old.financial_status, new.financial_status,
              nullif(current_setting('mb.audit_reason', true), ''));
    end if;
  end if;
  return new;
end $$;
create trigger trg_projects_status_history after insert or update on public.projects
  for each row execute function public.mb_projects_status_history();

-- A closed project cannot be edited except by the reopen RPC.
create or replace function public.mb_projects_guard_closed()
returns trigger language plpgsql as $$
begin
  if old.financial_status = 'financially_closed'
     and coalesce(current_setting('mb.allow_closed_edit', true), '') <> 'on' then
    raise exception 'Project % is financially closed. Reopen it first.', old.code using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_projects_guard_closed before update on public.projects
  for each row execute function public.mb_projects_guard_closed();

create trigger trg_projects_touch before update on public.projects
  for each row execute function public.mb_touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['projects','project_services','project_members'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.mb_audit_trigger()', t);
    execute format('alter table public.%1$s enable row level security', t);
  end loop;
end $$;
alter table public.project_status_history enable row level security;
alter table public.project_code_counters enable row level security;

-- Is the current user assigned to this project? (project managers, spec §89)
create or replace function public.mb_is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members pm
    join organization_members om on om.person_id = pm.person_id and om.organization_id = pm.organization_id
    where pm.project_id = p_project and om.user_id = auth.uid() and om.status = 'active');
$$;

create or replace function public.mb_can_view_project(p_org uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select mb_has_permission(p_org, 'projects.view_all')
      or (mb_has_permission(p_org, 'projects.view_assigned') and mb_is_project_member(p_project));
$$;

create policy projects_read on public.projects for select using (mb_can_view_project(organization_id, id));
create policy projects_insert on public.projects for insert with check (mb_has_permission(organization_id, 'projects.manage'));
create policy projects_update on public.projects for update
  using (mb_has_permission(organization_id, 'projects.manage'))
  with check (mb_has_permission(organization_id, 'projects.manage'));

create policy project_services_read on public.project_services for select using (mb_can_view_project(organization_id, project_id));
create policy project_services_write on public.project_services for all
  using (mb_has_permission(organization_id, 'projects.manage'))
  with check (mb_has_permission(organization_id, 'projects.manage'));
create policy project_members_read on public.project_members for select using (mb_can_view_project(organization_id, project_id));
create policy project_members_write on public.project_members for all
  using (mb_has_permission(organization_id, 'projects.manage'))
  with check (mb_has_permission(organization_id, 'projects.manage'));
create policy project_status_history_read on public.project_status_history for select
  using (mb_can_view_project(organization_id, project_id));
