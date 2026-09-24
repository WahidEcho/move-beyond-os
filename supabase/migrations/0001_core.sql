-- 0001_core.sql
-- Core platform: organizations, users, roles, permissions, people, settings,
-- audit, notifications, documents. Shared by every future module.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.mb_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  slug text not null unique,
  base_currency char(3) not null default 'EGP',
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_organizations_touch before update on public.organizations
  for each row execute function public.mb_touch_updated_at();

create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  company_name text not null default 'Move Beyond',
  logo_path text,
  letterhead_path text,
  reserve_target numeric(14,2) not null default 100000,
  approval_workflow_enabled boolean not null default false,
  tax_enabled boolean not null default false,
  cto_recovery_enabled boolean not null default true,
  collection_reminder_days int[] not null default '{14,7,3,0}',
  overdue_reminder_every_days int not null default 7,
  email_notifications_enabled boolean not null default true,
  project_code_prefix text not null default 'MB',
  updated_at timestamptz not null default now()
);
create trigger trg_org_settings_touch before update on public.organization_settings
  for each row execute function public.mb_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Users (auth.users mirror), roles, permissions
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.mb_touch_updated_at();

create table public.roles (
  key text primary key,
  name text not null,
  description text
);

create table public.permissions (
  key text primary key,
  description text not null
);

create table public.role_permissions (
  role_key text not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

-- A person (partner, employee, freelancer, external funder). Not every person
-- is a platform user; a user may be linked to one person.
create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  kind text not null default 'employee'
    check (kind in ('partner','employee','freelancer','external','other')),
  job_title text,
  is_partner boolean not null default false,
  profit_share_pct numeric(6,3) not null default 0 check (profit_share_pct between 0 and 100),
  technology_recovery_eligible boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, user_id)
);
create index on public.people (organization_id) where deleted_at is null;
create trigger trg_people_touch before update on public.people
  for each row execute function public.mb_touch_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.user_roles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null references public.roles(key),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, role_key)
);

-- ---------------------------------------------------------------------------
-- Permission helpers (used by RLS and by every mb_* RPC)
-- ---------------------------------------------------------------------------
create or replace function public.mb_is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function public.mb_has_permission(p_org uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from organization_members m
    join user_roles ur on ur.organization_id = m.organization_id and ur.user_id = m.user_id
    join role_permissions rp on rp.role_key = ur.role_key
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (rp.permission_key = p_permission or rp.permission_key = '*')
  );
$$;

create or replace function public.mb_require_permission(p_org uuid, p_permission text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  -- Bypass only for trusted callers: the service_role key via the API, or a
  -- direct database session (migrations, seeds, SQL tests). Every API request
  -- arrives through the 'authenticator' login role, so anon/authenticated
  -- callers can never reach this branch.
  if auth.role() = 'service_role' or session_user <> 'authenticator' then
    return;
  end if;
  if not mb_has_permission(p_org, p_permission) then
    raise exception 'permission denied: % required', p_permission using errcode = '42501';
  end if;
end $$;

create or replace function public.mb_current_person(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select person_id from organization_members
  where organization_id = p_org and user_id = auth.uid();
$$;

-- Default organization for the current user (single-org V1).
create or replace function public.mb_current_org()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from organization_members
  where user_id = auth.uid() and status = 'active'
  order by created_at limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid,
  table_name text not null,
  record_id text not null,
  action text not null,           -- created, edited, deleted, restored, reversed, paid, settled, reopened, override, status_change, ...
  user_id uuid,
  reason text,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  created_at timestamptz not null default now()
);
create index on public.audit_logs (organization_id, created_at desc);
create index on public.audit_logs (table_name, record_id);

-- RPCs set these per transaction so the generic trigger can pick them up.
create or replace function public.mb_set_audit_context(p_action text, p_reason text)
returns void language sql as $$
  select set_config('mb.audit_action', coalesce(p_action,''), true),
         set_config('mb.audit_reason', coalesce(p_reason,''), true);
$$;

create or replace function public.mb_audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_action text := nullif(current_setting('mb.audit_action', true), '');
  v_reason text := nullif(current_setting('mb.audit_reason', true), '');
  v_changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into v_changed
    from jsonb_each(v_new) n
    where n.key not in ('updated_at')
      and (v_old -> n.key) is distinct from n.value;
    if v_changed is null then
      return new;  -- nothing meaningful changed
    end if;
    if v_action is null then
      v_action := case
        when (v_old->>'deleted_at') is null and (v_new->>'deleted_at') is not null then 'deleted'
        when (v_old->>'deleted_at') is not null and (v_new->>'deleted_at') is null then 'restored'
        else 'edited' end;
    end if;
  end if;

  insert into audit_logs (organization_id, table_name, record_id, action, user_id, reason, old_data, new_data, changed_fields)
  values (
    nullif(v_row->>'organization_id','')::uuid,
    tg_table_name,
    coalesce(v_row->>'id', v_row->>'organization_id', ''),
    coalesce(case when tg_op = 'INSERT' then coalesce(v_action,'created')
                  when tg_op = 'DELETE' then 'purged'
                  else v_action end, 'edited'),
    auth.uid(),
    v_reason,
    v_old,
    v_new,
    v_changed
  );
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- Notifications (general engine; finance is the first producer)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,   -- null = everyone with the permission
  audience_permission text not null default 'finance.view',
  module text not null default 'finance',
  type text not null,
  priority text not null default 'normal' check (priority in ('critical','high','normal','low')),
  title text not null,
  body text,
  link text,
  entity_type text,
  entity_id uuid,
  dedupe_key text,
  due_date date,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  emailed_at timestamptz
);
create unique index notifications_dedupe on public.notifications (organization_id, dedupe_key)
  where dedupe_key is not null and resolved_at is null;
create index on public.notifications (organization_id, created_at desc);

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  primary key (notification_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Documents (attachments for any entity)
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,     -- project, expense, collection, technology_development, supplier, asset, ...
  entity_id uuid not null,
  doc_type text not null default 'other'
    check (doc_type in ('invoice','receipt','quotation','contract','bank_transfer_proof','purchase_order',
                        'development_scope','technical_proposal','signed_agreement','photo','other')),
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.documents (organization_id, entity_type, entity_id) where deleted_at is null;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Profile bootstrap on sign-up (invite-only; membership is granted separately)
-- ---------------------------------------------------------------------------
create or replace function public.mb_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.mb_handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.people enable row level security;
alter table public.organization_members enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.documents enable row level security;

create policy org_read on public.organizations for select using (mb_is_member(id));
create policy settings_read on public.organization_settings for select using (mb_is_member(organization_id));
create policy settings_write on public.organization_settings for update
  using (mb_has_permission(organization_id, 'settings.manage'))
  with check (mb_has_permission(organization_id, 'settings.manage'));

create policy profiles_self on public.profiles for select using (
  user_id = auth.uid() or exists (
    select 1 from organization_members a join organization_members b on a.organization_id = b.organization_id
    where a.user_id = auth.uid() and b.user_id = profiles.user_id));
create policy profiles_self_update on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy roles_read on public.roles for select using (auth.uid() is not null);
create policy permissions_read on public.permissions for select using (auth.uid() is not null);
create policy role_permissions_read on public.role_permissions for select using (auth.uid() is not null);

create policy people_read on public.people for select using (mb_is_member(organization_id));
create policy people_write on public.people for all
  using (mb_has_permission(organization_id, 'people.manage'))
  with check (mb_has_permission(organization_id, 'people.manage'));

create policy members_read on public.organization_members for select using (mb_is_member(organization_id));
create policy members_manage on public.organization_members for all
  using (mb_has_permission(organization_id, 'users.manage'))
  with check (mb_has_permission(organization_id, 'users.manage'));
create policy user_roles_read on public.user_roles for select using (mb_is_member(organization_id));
create policy user_roles_manage on public.user_roles for all
  using (mb_has_permission(organization_id, 'users.manage'))
  with check (mb_has_permission(organization_id, 'users.manage'));

create policy audit_read on public.audit_logs for select using (mb_has_permission(organization_id, 'audit.view'));

create policy notifications_read on public.notifications for select using (
  mb_is_member(organization_id)
  and (user_id = auth.uid() or (user_id is null and mb_has_permission(organization_id, audience_permission))));
create policy notification_reads_own on public.notification_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy documents_read on public.documents for select using (mb_has_permission(organization_id, 'documents.view'));
create policy documents_insert on public.documents for insert with check (mb_has_permission(organization_id, 'documents.manage'));
create policy documents_update on public.documents for update
  using (mb_has_permission(organization_id, 'documents.manage'))
  with check (mb_has_permission(organization_id, 'documents.manage'));

-- Storage: path convention "<organization_id>/<entity_type>/<entity_id>/<file>"
create policy documents_bucket_read on storage.objects for select using (
  bucket_id = 'documents' and mb_has_permission(((storage.foldername(name))[1])::uuid, 'documents.view'));
create policy documents_bucket_insert on storage.objects for insert with check (
  bucket_id = 'documents' and mb_has_permission(((storage.foldername(name))[1])::uuid, 'documents.manage'));

-- ---------------------------------------------------------------------------
-- Audit triggers on core tables
-- ---------------------------------------------------------------------------
create trigger trg_audit_org_settings after insert or update or delete on public.organization_settings
  for each row execute function public.mb_audit_trigger();
create trigger trg_audit_people after insert or update or delete on public.people
  for each row execute function public.mb_audit_trigger();
create trigger trg_audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.mb_audit_trigger();
create trigger trg_audit_documents after insert or update or delete on public.documents
  for each row execute function public.mb_audit_trigger();
