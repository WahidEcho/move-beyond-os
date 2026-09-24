-- 0002_master_data.sql
-- Single master records shared by every module (spec §3):
-- clients, contacts, services, suppliers, funders, categories, cash accounts.

-- ---------------------------------------------------------------------------
-- Clients & contacts
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  company_name text,
  client_type text not null default 'company'
    check (client_type in ('company','club','academy','federation','brand','agency','government','individual','other')),
  phone text,
  email text,
  notes text,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);
create index on public.clients (organization_id) where deleted_at is null;
create index clients_name_trgm on public.clients using gin (name gin_trgm_ops);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  full_name text not null,
  role_title text,
  phone text,
  email text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.contacts (client_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Service master (spec §7–18)
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  tagline text,
  description text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null references public.service_categories(id),
  parent_service_id uuid references public.services(id),   -- sub-services
  name text not null,
  description text,
  billing_nature text not null default 'both' check (billing_nature in ('one_time','recurring','both')),
  default_billing_model text,         -- monthly, annual, one_time_event, custom_project, ...
  default_price numeric(14,2),        -- future pricing
  future_department text,
  sales_settings jsonb not null default '{}'::jsonb,
  notes text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, category_id, name)
);

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  company_name text,
  category text,
  phone text,
  email text,
  bank_details text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_reason text
);
create index on public.suppliers (organization_id) where deleted_at is null;
create index suppliers_name_trgm on public.suppliers using gin (name gin_trgm_ops);

create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Funders (spec §24): the company itself, partners, other people.
-- ---------------------------------------------------------------------------
create table public.funders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  funder_type text not null check (funder_type in ('company','person')),
  person_id uuid references public.people(id),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check ((funder_type = 'company') = (person_id is null)),
  unique (organization_id, person_id)
);
create unique index funders_one_company on public.funders (organization_id) where funder_type = 'company';

-- ---------------------------------------------------------------------------
-- Where money physically sits (spec §29 + D2).
--   company_bank     — Move Beyond Company Bank Account (more later)
--   partner_holding  — company money held by a partner personally
-- ---------------------------------------------------------------------------
create table public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('company_bank','partner_holding','cash')),
  person_id uuid references public.people(id),
  currency char(3) not null default 'EGP',
  bank_name text,
  account_number_last4 text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((account_type = 'partner_holding') = (person_id is not null))
);
create unique index cash_accounts_default on public.cash_accounts (organization_id) where is_default;
create unique index cash_accounts_holding on public.cash_accounts (organization_id, person_id) where account_type = 'partner_holding';

-- ---------------------------------------------------------------------------
-- Categories (hierarchical, admin-editable, spec §37)
-- ---------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.expense_categories(id),
  name text not null,
  code text,                 -- stable key for system categories, e.g. 'partner_fees', 'overhead'
  scope text not null default 'project' check (scope in ('project','overhead','both')),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, parent_id, name)
);

create table public.technology_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  unique (organization_id, name)
);

create table public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  unique (organization_id, name)
);

-- ---------------------------------------------------------------------------
-- Touch + audit triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients','contacts','service_categories','services','suppliers','expense_categories'] loop
    execute format('create trigger trg_%1$s_touch before update on public.%1$s for each row execute function public.mb_touch_updated_at()', t);
  end loop;
  foreach t in array array['clients','contacts','service_categories','services','suppliers','supplier_contacts',
                           'funders','cash_accounts','expense_categories','technology_categories','asset_categories'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.mb_audit_trigger()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy %1$s_read on public.%1$s for select using (public.mb_has_permission(organization_id, ''masterdata.view''))', t);
    execute format('create policy %1$s_write on public.%1$s for all using (public.mb_has_permission(organization_id, ''masterdata.manage'')) with check (public.mb_has_permission(organization_id, ''masterdata.manage''))', t);
  end loop;
end $$;

-- Suppliers may be added by project managers (spec §89).
create policy suppliers_pm_insert on public.suppliers for insert
  with check (public.mb_has_permission(organization_id, 'suppliers.create'));
