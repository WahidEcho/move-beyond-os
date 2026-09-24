-- 0012_reference_security.sql
-- Roles & permissions, organization bootstrap (catalog seeds), partner setup,
-- and privilege hardening.

-- ---------------------------------------------------------------------------
-- Permissions and roles (spec §5, §89–90). Never keyed on names.
-- ---------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('*', 'Everything'),
  ('finance.view', 'See company finance, balances and reports'),
  ('finance.manage', 'Record revenue, expenses, funding and payments'),
  ('partners.view', 'See partner accounts, fees and profit'),
  ('partners.distribute', 'Distribute profit and allocate losses'),
  ('settlements.manage', 'Run project settlements'),
  ('technology.view', 'See CTO development recovery'),
  ('technology.manage', 'Create and adjust technology developments'),
  ('technology.recover', 'Allocate and reverse CTO recovery'),
  ('projects.view_all', 'See all projects'),
  ('projects.view_assigned', 'See assigned projects only'),
  ('projects.manage', 'Create and edit projects'),
  ('projects.close', 'Financially close projects'),
  ('projects.reopen', 'Reopen financially closed projects'),
  ('masterdata.view', 'See clients, suppliers, services and categories'),
  ('masterdata.manage', 'Edit clients, suppliers, services and categories'),
  ('suppliers.create', 'Add suppliers'),
  ('expenses.create_assigned', 'Add expenses and receipts on assigned projects'),
  ('assets.view', 'See assets and inventory'),
  ('assets.manage', 'Manage assets and assignments'),
  ('subscriptions.manage', 'Manage subscriptions'),
  ('documents.view', 'See attachments'),
  ('documents.manage', 'Upload attachments'),
  ('settings.manage', 'Change organization settings'),
  ('users.manage', 'Invite users and assign roles'),
  ('people.manage', 'Manage people (partners, employees)'),
  ('audit.view', 'See the audit log')
on conflict (key) do nothing;

insert into public.roles (key, name, description) values
  ('partner', 'Partner', 'Full platform and financial access'),
  ('cto', 'CTO', 'Technology development recovery (additive to partner)'),
  ('admin', 'Admin', 'Authorized administrator'),
  ('finance', 'Finance', 'Operational finance access'),
  ('project_manager', 'Project Manager', 'Assigned projects: expenses, suppliers, receipts'),
  ('event_manager', 'Event Manager', 'Assigned projects: expenses, suppliers, receipts'),
  ('operations', 'Operations', 'Future module'),
  ('staff', 'Staff', 'Future module'),
  ('hr', 'HR', 'Future module'),
  ('sales', 'Sales', 'Future module'),
  ('crm_user', 'CRM User', 'Future module')
on conflict (key) do nothing;

insert into public.role_permissions (role_key, permission_key) values
  ('partner', '*'),
  ('admin', '*'),
  ('cto', 'technology.view'), ('cto', 'technology.manage'), ('cto', 'technology.recover'),
  ('finance', 'finance.view'), ('finance', 'finance.manage'), ('finance', 'partners.view'), ('finance', 'settlements.manage'),
  ('finance', 'technology.view'), ('finance', 'technology.recover'), ('finance', 'projects.view_all'), ('finance', 'projects.manage'),
  ('finance', 'projects.close'), ('finance', 'masterdata.view'), ('finance', 'masterdata.manage'), ('finance', 'suppliers.create'),
  ('finance', 'assets.view'), ('finance', 'assets.manage'), ('finance', 'subscriptions.manage'), ('finance', 'documents.view'),
  ('finance', 'documents.manage'), ('finance', 'audit.view'),
  ('project_manager', 'projects.view_assigned'), ('project_manager', 'expenses.create_assigned'), ('project_manager', 'suppliers.create'),
  ('project_manager', 'masterdata.view'), ('project_manager', 'documents.view'), ('project_manager', 'documents.manage'),
  ('event_manager', 'projects.view_assigned'), ('event_manager', 'expenses.create_assigned'), ('event_manager', 'suppliers.create'),
  ('event_manager', 'masterdata.view'), ('event_manager', 'documents.view'), ('event_manager', 'documents.manage')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Bootstrap an organization with all catalogs from the spec (idempotent).
-- ---------------------------------------------------------------------------
create or replace function public.mb_bootstrap_organization(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_cat uuid; v_parent uuid; r record; s text; i int;
begin
  select id into v_org from organizations where slug = p_slug;
  if v_org is null then
    insert into organizations (name, slug) values (p_name, p_slug) returning id into v_org;
  end if;
  insert into organization_settings (organization_id, company_name) values (v_org, p_name) on conflict do nothing;

  insert into funders (organization_id, name, funder_type, sort_order) values (v_org, 'Move Beyond', 'company', 0)
  on conflict do nothing;
  if not exists (select 1 from cash_accounts where organization_id = v_org and account_type = 'company_bank') then
    insert into cash_accounts (organization_id, name, account_type, is_default)
    values (v_org, 'Move Beyond Company Bank Account', 'company_bank', true);
  end if;

  -- Service master (spec §8–18)
  for r in select * from (values
    (1, 'Move IT', 'Sports Organization, Academy & Membership Management Platform',
       array['Move IT Platform Subscription','Setup Fee','Additional Branch','Add-on Module']),
    (2, 'Move Tick', 'Registration, Ticketing, Participant & Access Management',
       array['Online Registration','Tournament Registration','Digital Ticketing','QR Check-in & Validation','Accreditation & Access Management','Participant Database & Reporting']),
    (3, 'Move VR', 'Immersive, Interactive & Gaming Experiences',
       array['VR Stations','AR Activation','Camera Motion-Tracking Experience','Custom Branded VR/AR Game','Gaming Stations (PS5)','Interactive Fan Engagement']),
    (4, 'Move Pro', 'Custom Sports Technology & Software Solutions',
       array['Custom Sports Software','Tournament Management Platform','Draw System','Scoring System','Live Scoreboard / Leaderboard','LED / TV Display System','Custom Event Website','Mobile Application','Web Application']),
    (5, 'Event Management', 'Sports Events & Event Management',
       array['Sports Tournament','Corporate Sports Day','Corporate Fun Day','Padel Tournament','Football Tournament','Tennis Tournament','Fan Zone','Brand Activation','Event Operations','Staffing & Logistics']),
    (6, 'Event Technology', 'Technology as a standalone event deliverable',
       array['Live Scoring','LED Scoreboards','Competition Screens','Draw System','Tournament Website','Event Control Software','Real-time Competition Data']),
    (7, 'Interactive Entertainment', 'Gaming & Interactive Entertainment',
       array['PS5 Tournament','VR Tournament','Beat Saber','Gaming Zone','Chess','Family Entertainment']),
    (8, 'Rental', 'Equipment & Experience Rental',
       array['VR Headset Rental','VR Station Rental','PS5 Rental','TV Rental','Gaming Laptop Rental','Tablet Rental','Bean Bag Rental','Technical Equipment Rental']),
    (9, 'Sponsorship', 'Sponsorship & Marketing Investment',
       array['Event Sponsorship','Marketing Investment','Activation Rights']),
    (10, 'Consulting', 'Sports, technical and event consulting',
       array['Sports Consulting','Technical Consulting','Event Consulting','Project Management','Technology Advisory','Operations Consulting']),
    (11, 'Other / Custom', 'Anything else',
       array['Custom Service'])
  ) as t(ord, name, tagline, subs) loop
    insert into service_categories (organization_id, name, tagline, sort_order) values (v_org, r.name, r.tagline, r.ord)
    on conflict (organization_id, name) do update set tagline = excluded.tagline
    returning id into v_cat;
    i := 0;
    foreach s in array r.subs loop
      i := i + 1;
      insert into services (organization_id, category_id, name, sort_order, billing_nature, default_billing_model)
      values (v_org, v_cat, s, i,
              case when r.name = 'Move IT' then 'recurring' when r.name in ('Move Tick','Move Pro') then 'both' else 'one_time' end,
              case when r.name = 'Move IT' then 'annual' when r.name = 'Rental' then 'one_time_rental' else 'custom_project' end)
      on conflict do nothing;
    end loop;
  end loop;

  -- Expense categories (spec §37)
  for r in select * from (values
    (1, 'Staffing', 'staffing', 'project', array['Ushers','Coordinators','Event Managers','Operations Supervisors','Operators','Freelancers','Temporary Staff']),
    (2, 'Creative', 'creative', 'project', array['Graphic Design','Photography','Videography','Animation','Content']),
    (3, 'Development', 'development', 'both', array['Developers','Software Development','Hosting','Cloud','Technical Services']),
    (4, 'Production', 'production', 'project', array['Printing','Branding','Structures','Screens','Sound','Lighting','Fabrication','Event Production']),
    (5, 'Rentals', 'rentals', 'project', array['VR','PS5','TV','Gaming Laptop','Tablet','Furniture','Bean Bags','Other Equipment']),
    (6, 'Logistics', 'logistics', 'project', array['Transportation','Delivery','Setup','Accommodation','Meals','Travel']),
    (7, 'Assets', 'assets', 'both', array['Computers','TVs','VR Equipment','Gaming Equipment','Office Equipment','Technical Equipment']),
    (8, 'Marketing', 'marketing', 'both', array['Sponsorship','Advertising','Promotion','Campaigns']),
    (9, 'Partner / Commercial Fees', 'partner_fees', 'project', array['Management Fee','Lead Generation','Sales Commission','Project Fee','Consulting Fee','Custom Fee']),
    (10, 'Company Overhead', 'overhead', 'overhead', array['Office','Salaries','Software','Hosting','Marketing','Transportation','Legal','Accounting','Bank Fees','General Operations'])
  ) as t(ord, name, code, scope, subs) loop
    select id into v_parent from expense_categories where organization_id = v_org and parent_id is null and name = r.name;
    if v_parent is null then
      insert into expense_categories (organization_id, name, code, scope, sort_order) values (v_org, r.name, r.code, r.scope, r.ord)
      returning id into v_parent;
    end if;
    i := 0;
    foreach s in array r.subs loop
      i := i + 1;
      insert into expense_categories (organization_id, parent_id, name, scope, sort_order) values (v_org, v_parent, s, r.scope, i)
      on conflict do nothing;
    end loop;
  end loop;

  -- Technology categories (spec §46)
  i := 0;
  foreach s in array array['Tournament Platform','Scoring System','Registration System','Draw System','Dashboard','Mobile App',
                           'Web Application','Internal Tool','API','Automation','Other'] loop
    i := i + 1;
    insert into technology_categories (organization_id, name, sort_order) values (v_org, s, i) on conflict do nothing;
  end loop;

  -- Asset categories
  i := 0;
  foreach s in array array['VR Equipment','Gaming Consoles','TVs & Screens','Computers & Laptops','Tablets','Furniture','Technical Equipment','Office Equipment','Other'] loop
    i := i + 1;
    insert into asset_categories (organization_id, name, sort_order) values (v_org, s, i) on conflict do nothing;
  end loop;

  -- Fee presets (spec §43) — suggestions only, never auto-applied
  if not exists (select 1 from fee_presets where organization_id = v_org) then
    insert into fee_presets (organization_id, name, fee_type, basis, rate, trigger_project_role, sort_order) values
      (v_org, 'Management Fee 10% of contract', 'management', 'pct_contract', 10, 'project_manager', 1),
      (v_org, 'Lead Generation Fee 10% of contract', 'lead_generation', 'pct_contract', 10, 'lead_generator', 2);
  end if;

  return v_org;
end $$;

-- Add (or update) a partner: person + funder + holding account.
create or replace function public.mb_upsert_partner(p_org uuid, p_name text, p_email text, p_share numeric, p_cto boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_person uuid;
begin
  select id into v_person from people where organization_id = p_org and lower(full_name) = lower(p_name) and is_partner;
  if v_person is null then
    insert into people (organization_id, full_name, email, kind, is_partner, profit_share_pct, technology_recovery_eligible, job_title)
    values (p_org, p_name, p_email, 'partner', true, p_share, p_cto, case when p_cto then 'Partner & CTO' else 'Partner' end)
    returning id into v_person;
  else
    update people set email = coalesce(p_email, email), profit_share_pct = p_share, technology_recovery_eligible = p_cto where id = v_person;
  end if;
  perform mb_person_funder(p_org, v_person);
  if not exists (select 1 from cash_accounts where organization_id = p_org and person_id = v_person) then
    insert into cash_accounts (organization_id, name, account_type, person_id)
    values (p_org, 'Held by ' || p_name, 'partner_holding', v_person);
  end if;
  return v_person;
end $$;

-- Link an auth user to an organization + person with roles (used by scripts/create-user).
create or replace function public.mb_grant_membership(p_org uuid, p_user uuid, p_person uuid, p_roles text[])
returns void language plpgsql security definer set search_path = public as $$
declare r text;
begin
  insert into organization_members (organization_id, user_id, person_id) values (p_org, p_user, p_person)
  on conflict (organization_id, user_id) do update set person_id = excluded.person_id, status = 'active';
  if p_person is not null then update people set user_id = p_user where id = p_person; end if;
  foreach r in array p_roles loop
    insert into user_roles (organization_id, user_id, role_key) values (p_org, p_user, r) on conflict do nothing;
  end loop;
end $$;

-- Profit shares of active partners must total 100% (spec §65)
create or replace function public.mb_partner_shares_total(p_org uuid)
returns numeric language sql stable security invoker set search_path = public as $$
  select coalesce(sum(profit_share_pct), 0) from people where organization_id = p_org and is_partner and active and deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Hardening
-- ---------------------------------------------------------------------------
-- Read helpers run with the caller's rights, so RLS limits what they can sum.
alter function public.mb_person_due(uuid, uuid, text, uuid, boolean) security invoker;
alter function public.mb_milestone_outstanding(uuid) security invoker;
alter function public.mb_company_funding_outstanding(uuid) security invoker;
alter function public.mb_technology_value(uuid) security invoker;
alter function public.mb_technology_recovered(uuid) security invoker;
alter function public.mb_technology_outstanding(uuid) security invoker;
alter function public.mb_project_ledger_sum(uuid, text) security invoker;
alter function public.mb_project_contract_value(uuid) security invoker;
alter function public.mb_project_profit(uuid) security invoker;
alter function public.mb_fee_base(uuid, text) security invoker;
alter function public.mb_project_unpaid_obligations(uuid) security invoker;

-- Nothing is callable by anonymous visitors.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

grant execute on all functions in schema public to authenticated, service_role;

-- Internal building blocks must never be called directly by users: they skip
-- permission checks and would allow arbitrary ledger postings.
revoke execute on function public.mb_post_entry(uuid, date, text, uuid, uuid, text, jsonb, text, uuid) from authenticated;
revoke execute on function public.mb_reverse_entry(uuid, text, date) from authenticated;
revoke execute on function public.mb_idem_claim(uuid, text, text) from authenticated;
revoke execute on function public.mb_idem_store(uuid, text, jsonb) from authenticated;
revoke execute on function public.mb_pay_expense_internal(uuid, jsonb) from authenticated;
revoke execute on function public.mb_pay_person_internal(uuid, uuid, text, uuid, numeric, date, uuid, text, text, uuid, boolean) from authenticated;
revoke execute on function public.mb_recover_company_funding_internal(uuid, uuid, numeric, date, uuid) from authenticated;
revoke execute on function public.mb_allocate_cto_recovery_internal(uuid, uuid, numeric, text, date, uuid, text) from authenticated;
revoke execute on function public.mb_post_fee(uuid) from authenticated;
revoke execute on function public.mb_refresh_expense_status(uuid) from authenticated;
revoke execute on function public.mb_person_funder(uuid, uuid) from authenticated;
revoke execute on function public.mb_bootstrap_organization(text, text) from authenticated;
revoke execute on function public.mb_upsert_partner(uuid, text, text, numeric, boolean) from authenticated;
revoke execute on function public.mb_grant_membership(uuid, uuid, uuid, text[]) from authenticated;
revoke execute on function public.mb_next_project_code(uuid, date) from authenticated;
revoke execute on function public.mb_set_audit_context(text, text) from authenticated;
revoke execute on function public.mb_handle_new_user() from authenticated;
revoke execute on function public.mb_audit_trigger() from authenticated;
