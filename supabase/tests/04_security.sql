-- Security (standards: RLS probes with explicit roles).
-- Simulates API callers by switching role and setting JWT claims.
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', p_user::text, true);
$$;

do $$
declare
  s jsonb := pg_temp.setup();
  v_org uuid := (s->>'org')::uuid;
  v_w uuid := (s->>'wahid')::uuid;
  v_pm_person uuid;
  u_partner uuid := gen_random_uuid();
  u_pm uuid := gen_random_uuid();
  u_stranger uuid := gen_random_uuid();
  p_assigned uuid; p_other uuid;
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    (u_partner, 'partner+' || u_partner || '@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_pm, 'pm+' || u_pm || '@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_stranger, 'x+' || u_stranger || '@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into people (organization_id, full_name, kind) values (v_org, 'PM Person', 'employee') returning id into v_pm_person;
  perform mb_grant_membership(v_org, u_partner, v_w, array['partner','cto']);
  perform mb_grant_membership(v_org, u_pm, v_pm_person, array['project_manager']);

  p_assigned := pg_temp.project(v_org, 'Assigned Project', 100000);
  p_other := pg_temp.project(v_org, 'Other Project', 900000);
  insert into project_members (project_id, organization_id, person_id) values (p_assigned, v_org, v_pm_person);
  perform mb_record_collection(p_other, 900000, current_date);
  perform mb_add_expense(v_org, jsonb_build_object('project_id', p_other, 'description', 'Secret cost', 'committed_amount', 1000,
          'payment', jsonb_build_object('amount', 1000, 'payer_type','partner','person_id', v_w)));
  perform set_config('mb.test_org', v_org::text, true);
  perform set_config('mb.test_p_assigned', p_assigned::text, true);
  perform set_config('mb.test_p_other', p_other::text, true);
  perform set_config('mb.test_u_partner', u_partner::text, true);
  perform set_config('mb.test_u_pm', u_pm::text, true);
  perform set_config('mb.test_u_stranger', u_stranger::text, true);
  perform set_config('mb.test_wahid', v_w::text, true);
end $$;

-- Anonymous visitor: no table access at all
set local role anon;
do $$
begin
  perform pg_temp.fails('anon cannot read projects', 'select count(*) from public.projects', 'permission denied');
  perform pg_temp.fails('anon cannot read ledger', 'select count(*) from public.journal_lines', 'permission denied');
  perform pg_temp.fails('anon cannot call RPCs', format('select public.mb_record_collection(%L, 1, current_date)', current_setting('mb.test_p_other')), 'permission denied');
end $$;
reset role;

-- Authenticated stranger (no membership)
set local role authenticated;
select pg_temp.as_user(current_setting('mb.test_u_stranger')::uuid);
do $$
begin
  perform pg_temp.eq('stranger sees no projects', (select count(*) from public.projects), 0);
  perform pg_temp.eq('stranger sees no journal lines', (select count(*) from public.journal_lines), 0);
  perform pg_temp.fails('stranger cannot post collections',
    format('select public.mb_record_collection(%L, 1, current_date)', current_setting('mb.test_p_other')), 'permission denied');
  perform pg_temp.fails('internal posting function not callable',
    format('select public.mb_post_entry(%L, current_date, %L, null, null, %L, %L::jsonb)', current_setting('mb.test_org'), 'x', 'x', '[]'),
    'permission denied for function');
  perform pg_temp.fails('internal allocation function not callable',
    'select public.mb_allocate_cto_recovery_internal(gen_random_uuid(), gen_random_uuid(), 1, null, null, null, null)',
    'permission denied for function');
  perform pg_temp.fails('stranger cannot insert ledger rows directly',
    format('insert into public.journal_entries (organization_id, entry_date, source_type) values (%L, current_date, %L)', current_setting('mb.test_org'), 'x'),
    'violates row-level security');
end $$;

-- Project manager: assigned project only, no company finance or partner data (spec §89)
select pg_temp.as_user(current_setting('mb.test_u_pm')::uuid);
do $$
declare r jsonb;
begin
  perform pg_temp.eq('PM sees only the assigned project', (select count(*) from public.projects), 1);
  perform pg_temp.ok('PM sees the assigned one', exists (select 1 from public.projects where id = current_setting('mb.test_p_assigned')::uuid));
  perform pg_temp.eq('PM cannot see company balance', (select count(*) from public.v_cash_account_balances where balance <> 0), 0);
  perform pg_temp.eq('PM cannot see partner balances', (select count(*) from public.v_person_balances where funding_due <> 0), 0);
  perform pg_temp.eq('PM cannot see other project expenses', (select count(*) from public.expenses where project_id = current_setting('mb.test_p_other')::uuid), 0);
  perform pg_temp.eq('PM cannot see profit distributions', (select count(*) from public.profit_distributions), 0);
  r := public.mb_add_expense(current_setting('mb.test_org')::uuid, jsonb_build_object('project_id', current_setting('mb.test_p_assigned'),
         'description', 'Receipt from PM', 'committed_amount', 500));
  perform pg_temp.ok('PM can add an expense on the assigned project', r ? 'expense_id');
  perform pg_temp.fails('PM cannot add expense to another project',
    format('select public.mb_add_expense(%L, %L::jsonb)', current_setting('mb.test_org'),
      jsonb_build_object('project_id', current_setting('mb.test_p_other'), 'description', 'x', 'committed_amount', 1)), 'permission denied');
  perform pg_temp.fails('PM cannot distribute profit',
    format('select public.mb_distribute_profit(%L, %L::jsonb)', current_setting('mb.test_p_assigned'), '{"lines":[]}'), 'permission denied');
  perform pg_temp.fails('PM cannot reopen projects',
    format('select public.mb_reopen_project(%L, %L)', current_setting('mb.test_p_assigned'), 'test reason'), 'permission denied');
end $$;

-- Partner: full access through RLS and RPCs
select pg_temp.as_user(current_setting('mb.test_u_partner')::uuid);
do $$
begin
  perform pg_temp.eq('partner sees all projects', (select count(*) from public.projects), 2);
  perform pg_temp.eq('partner sees Wahid funding due', (select funding_due from public.v_person_balances where person_id = current_setting('mb.test_wahid')::uuid), 1000);
  perform pg_temp.ok('partner can record collections',
    public.mb_record_collection(current_setting('mb.test_p_assigned')::uuid, 100, current_date) ? 'collection_id');
  perform pg_temp.ok('partner can read audit log', (select count(*) from public.audit_logs where organization_id = current_setting('mb.test_org')::uuid) > 0);
end $$;
reset role;
