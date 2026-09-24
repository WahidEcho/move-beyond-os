-- CTO Development Recovery (spec §127 CTO tests, §113 mandatory sample, §131).
do $$
declare
  s jsonb := pg_temp.setup();
  v_org uuid := (s->>'org')::uuid;
  v_w uuid := (s->>'wahid')::uuid;
  v_b uuid := (s->>'belal')::uuid;
  v_bank uuid := (s->>'bank')::uuid;
  t uuid; t2 uuid; p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; r jsonb; a4 uuid; a2 uuid;
begin
  p1 := pg_temp.project(v_org, 'Padel Tournament #1', 80000);

  -- Create technology development: 50K recovery target
  r := mb_create_technology(v_org, jsonb_build_object('name', 'Move Beyond Padel Tournament Platform', 'developer_person_id', v_w,
         'category_id', (select id from technology_categories where organization_id = v_org and name = 'Tournament Platform'),
         'original_project_id', p1, 'agreed_value', 50000, 'reusable', true, 'ownership', 'Move Beyond'));
  t := (r->>'technology_id')::uuid;
  perform pg_temp.eq('agreed recoverable value', mb_technology_value(t), 50000);
  perform pg_temp.eq('outstanding 50K', mb_technology_outstanding(t), 50000);
  perform pg_temp.eq_text('status Recovery Pending', (select recovery_status from v_technology_recovery where technology_id = t), 'recovery_pending');
  perform pg_temp.ok('original project uses the technology', exists (select 1 from project_technology_usage where project_id = p1 and technology_id = t));
  perform pg_temp.eq('creation is not a cash expense', (select count(*) from journal_lines where organization_id = v_org), 0);

  -- Eligibility by flag, never by name (spec §90)
  perform pg_temp.fails('non-eligible developer rejected',
    format('select mb_create_technology(%L, %L::jsonb)', v_org, jsonb_build_object('name','X','developer_person_id', v_b, 'agreed_value', 1000)),
    'not eligible');

  -- Padel Tournament #2 reuses the platform and recovers 10K (spec §113)
  p2 := pg_temp.project(v_org, 'Padel Tournament #2', 200000);
  perform mb_record_collection(p2, 200000, current_date, v_bank);
  perform mb_add_expense(v_org, jsonb_build_object('project_id', p2, 'description', 'Courts & balls', 'committed_amount', 120000,
          'payment', jsonb_build_object('amount', 120000, 'payer_type', 'company')));
  r := mb_set_project_technology(p2, t, 'decide_at_settlement');
  perform pg_temp.eq('usage shows outstanding recovery', (r->>'outstanding')::numeric, 50000);
  perform pg_temp.eq_text('usage names the developer', r->>'developer', 'Wahid');

  r := mb_confirm_settlement(p2, jsonb_build_object('lines', jsonb_build_array(
         jsonb_build_object('line_type','cto','technology_id', t, 'amount', 10000, 'suggested_amount', 50000))));
  perform pg_temp.eq('recover 10K → remaining 40K', mb_technology_outstanding(t), 40000);
  perform pg_temp.eq('recovered 10K', mb_technology_recovered(t), 10000);
  perform pg_temp.eq_text('status Partially Recovered', (select recovery_status from v_technology_recovery where technology_id = t), 'partially_recovered');
  perform pg_temp.eq('settlement allocated + paid: nothing left due', pg_temp.pb(v_w, 'cto_due'), 0);
  perform pg_temp.eq('Wahid CTO paid 10K', pg_temp.pb(v_w, 'cto_paid'), 10000);

  -- CTO recovery visible separately in project profitability (spec §59)
  perform pg_temp.eq('gross margin before CTO recovery', (mb_project_profit(p2)->>'gross_profit')::numeric, 80000);
  perform pg_temp.eq('CTO recovery shown separately', (mb_project_profit(p2)->>'cto_cost')::numeric, 10000);
  perform pg_temp.eq('remaining project margin', (mb_project_profit(p2)->>'distributable_profit')::numeric, 70000);

  -- Cannot exceed outstanding (spec §54)
  p3 := pg_temp.project(v_org, 'Padel Tournament #3', 150000);
  perform pg_temp.fails('prevent recovery above outstanding',
    format('select mb_allocate_cto_recovery(%L, %L, 45000)', t, p3), 'Maximum remaining recovery is 40,000 EGP.');

  -- Multiple projects: 15K then 25K → fully recovered
  perform mb_allocate_cto_recovery(t, p3, 15000);
  perform pg_temp.eq('recover from another project → 25K', mb_technology_outstanding(t), 25000);
  p4 := pg_temp.project(v_org, 'Padel Tournament #4', 150000);
  r := mb_allocate_cto_recovery(t, p4, 25000);
  a4 := (r->>'allocation_id')::uuid;
  perform pg_temp.eq('multiple project recovery → 0', mb_technology_outstanding(t), 0);
  perform pg_temp.eq_text('status Fully Recovered', (select recovery_status from v_technology_recovery where technology_id = t), 'fully_recovered');
  perform pg_temp.eq('projects recovered from', (select projects_recovered_from from v_technology_recovery where technology_id = t), 3);
  perform pg_temp.fails('cannot claim again once fully recovered', format('select mb_allocate_cto_recovery(%L, %L, 1)', t, p4),
    'Maximum remaining recovery is 0 EGP.');
  perform pg_temp.eq('Wahid CTO due (allocated, unpaid)', pg_temp.pb(v_w, 'cto_due'), 40000);

  -- Development value increase (spec §55) with history
  perform mb_adjust_technology_value(t, 'extension', 20000, 'Live scoring module added');
  perform pg_temp.eq('value increase 50K + 20K', mb_technology_value(t), 70000);
  perform pg_temp.eq('outstanding after extension', mb_technology_outstanding(t), 20000);
  perform pg_temp.eq('value history kept', (select count(*) from technology_development_adjustments where technology_id = t), 2);
  perform pg_temp.fails('extension requires a reason', format('select mb_adjust_technology_value(%L, %L, 1000, %L)', t, 'extension', ''), 'reason is required');
  perform pg_temp.fails('cannot reduce below recovered', format('select mb_adjust_technology_value(%L, %L, 30000, %L)', t, 'reduction', 'scope cut'),
    'cannot be reduced below');

  -- Recovery reversal
  perform mb_reverse_cto_recovery(a4, 'Allocated to the wrong project');
  perform pg_temp.eq('reversal restores outstanding', mb_technology_outstanding(t), 45000);
  perform pg_temp.eq('reversal reduces Wahid due', pg_temp.pb(v_w, 'cto_due'), 15000);
  perform pg_temp.eq_text('allocation marked reversed', (select status from cto_recovery_allocations where id = a4), 'reversed');
  a2 := (select id from cto_recovery_allocations where project_id = p2 and technology_id = t);
  perform pg_temp.fails('reversal blocked when already paid', format('select mb_reverse_cto_recovery(%L, %L)', a2, 'test'), 'already been paid');

  -- from_share treatment: part of Wahid's own share, not a project cost (D3)
  p5 := pg_temp.project(v_org, 'Padel Tournament #5', 100000);
  perform mb_record_collection(p5, 100000, current_date, v_bank);
  perform mb_allocate_cto_recovery(t, p5, 5000, 'from_share');
  perform pg_temp.eq('from_share: distributable profit unchanged', (mb_project_profit(p5)->>'distributable_profit')::numeric, 100000);
  perform pg_temp.eq('from_share: counted as Wahid distribution', (mb_project_profit(p5)->>'undistributed')::numeric, 95000);

  -- Wahid total balance including CTO (spec §58)
  perform pg_temp.eq('Wahid CTO due (ledger)', pg_temp.pb(v_w, 'cto_due'), 20000);
  perform pg_temp.eq('Wahid unrecovered CTO claim', pg_temp.pb(v_w, 'cto_unrecovered'), 40000);
  perform pg_temp.eq('Wahid approved development value', pg_temp.pb(v_w, 'cto_approved_value'), 70000);

  -- Opening technology already partly recovered before go-live
  r := mb_create_technology(v_org, jsonb_build_object('name','Draw System','developer_person_id', v_w, 'agreed_value', 70000, 'already_recovered', 70000));
  t2 := (r->>'technology_id')::uuid;
  perform pg_temp.eq_text('opening fully recovered', (select recovery_status from v_technology_recovery where technology_id = t2), 'fully_recovered');

  -- Concurrency guard: the allocation locks the technology row (FOR UPDATE) — verified structurally
  perform pg_temp.ok('allocation function locks technology row',
    position('for update' in lower(pg_get_functiondef('public.mb_allocate_cto_recovery_internal(uuid,uuid,numeric,text,date,uuid,text)'::regprocedure))) > 0);

  perform pg_temp.ledger_balanced(v_org);
end $$;
