-- Shared test helpers (session-temporary). Every test file runs in a
-- transaction that is rolled back, so the live database is never modified.
\set QUIET on
set client_min_messages = notice;

create function pg_temp.eq(p_label text, p_actual numeric, p_expected numeric) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % — expected %, got %', p_label, p_expected, p_actual;
  end if;
  raise notice 'PASS  %', p_label;
end $$;

create function pg_temp.eq_text(p_label text, p_actual text, p_expected text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % — expected "%", got "%"', p_label, p_expected, p_actual;
  end if;
  raise notice 'PASS  %', p_label;
end $$;

create function pg_temp.ok(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS  %', p_label;
end $$;

-- Runs p_sql and asserts it fails with a message containing p_pattern.
create function pg_temp.fails(p_label text, p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_pattern || '%' then
      raise notice 'PASS  % (rejected: %)', p_label, sqlerrm;
      return;
    end if;
    raise exception 'FAIL: % — wrong error: %', p_label, sqlerrm;
  end;
  raise exception 'FAIL: % — expected an error containing "%"', p_label, p_pattern;
end $$;

-- Fresh organization with the standard catalog, two partners and one employee.
create function pg_temp.setup() returns jsonb language plpgsql as $$
declare v_org uuid; v_w uuid; v_b uuid; v_emp uuid; v_client uuid; v_supplier uuid;
begin
  v_org := mb_bootstrap_organization('Test Org', 'test-' || gen_random_uuid());
  v_w := mb_upsert_partner(v_org, 'Wahid', null, 50, true);
  v_b := mb_upsert_partner(v_org, 'Belal', null, 50, false);
  insert into people (organization_id, full_name, kind) values (v_org, 'Omar (Coordinator)', 'employee') returning id into v_emp;
  insert into clients (organization_id, name) values (v_org, 'Brand X') returning id into v_client;
  insert into suppliers (organization_id, name, category) values (v_org, 'Supplier ABC', 'Production') returning id into v_supplier;
  return jsonb_build_object('org', v_org, 'wahid', v_w, 'belal', v_b, 'employee', v_emp, 'client', v_client,
    'supplier', v_supplier, 'bank', mb_default_cash_account(v_org),
    'belal_hold', (select id from cash_accounts where person_id = v_b),
    'wahid_hold', (select id from cash_accounts where person_id = v_w));
end $$;

create function pg_temp.project(p_org uuid, p_name text, p_value numeric, p_client uuid default null, p_milestones jsonb default '[]') returns uuid language plpgsql as $$
begin
  return (mb_create_project(p_org, jsonb_build_object('name', p_name, 'client_id', p_client, 'project_type', 'event',
          'contract_value', p_value, 'start_date', current_date, 'milestones', p_milestones))->>'project_id')::uuid;
end $$;

create function pg_temp.pf(p_project uuid, p_col text) returns numeric language plpgsql as $$
declare v numeric;
begin
  execute format('select %I from v_project_financials where project_id = $1', p_col) into v using p_project;
  return v;
end $$;

create function pg_temp.pb(p_person uuid, p_col text) returns numeric language plpgsql as $$
declare v numeric;
begin
  execute format('select %I from v_person_balances where person_id = $1', p_col) into v using p_person;
  return v;
end $$;

create function pg_temp.cash(p_account uuid) returns numeric language sql as $$
  select balance from v_cash_account_balances where id = p_account;
$$;

-- Every journal entry balances and the whole ledger nets to zero.
create function pg_temp.ledger_balanced(p_org uuid) returns void language plpgsql as $$
declare v_bad int; v_total numeric;
begin
  select count(*) into v_bad from (select entry_id from journal_lines where organization_id = p_org group by entry_id having sum(amount) <> 0) x;
  select coalesce(sum(amount),0) into v_total from journal_lines where organization_id = p_org;
  perform pg_temp.eq('ledger: every entry balances', v_bad, 0);
  perform pg_temp.eq('ledger: total nets to zero', v_total, 0);
end $$;
\set QUIET off
