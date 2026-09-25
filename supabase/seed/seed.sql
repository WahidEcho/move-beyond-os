-- seed.sql — idempotent.
-- 1. Real organization "Move Beyond": catalogs + partners only (no demo data).
-- 2. Demo organization "Move Beyond (Demo)": every scenario from spec §112–113,
--    created through the same RPCs the app uses, so the ledger is real.

do $$
declare
  v_org uuid;
begin
  v_org := mb_bootstrap_organization('Move Beyond', 'move-beyond');
  perform mb_upsert_partner(v_org, 'Belal', null, 50, false);
  perform mb_upsert_partner(v_org, 'Wahid', 'mohamed.wahid.gm@gmail.com', 50, true);
end $$;

do $$
declare
  o uuid; w uuid; b uuid; omar uuid; nour uuid; bank uuid; bhold uuid;
  c_levels uuid; c_katameya uuid; c_brandx uuid; c_academy uuid; c_techno uuid;
  s_abc uuid; s_screens uuid; s_vr uuid; s_transport uuid; s_print uuid; s_cloud uuid;
  svc_event uuid; svc_tick uuid; svc_evtech uuid; svc_padel uuid; svc_sponsor uuid; svc_scoring uuid; svc_registration uuid; svc_movevr uuid;
  cat_screens uuid; cat_branding uuid; cat_meals uuid; cat_sound uuid; cat_photo uuid; cat_dev uuid; cat_hosting uuid; cat_vr uuid;
  cat_office uuid; cat_software uuid; cat_transport uuid; cat_ushers uuid; cat_courts uuid; cat_marketing uuid;
  p_katameya uuid; p_padel1 uuid; p_padel2 uuid; p_padel3 uuid; p_brandx uuid; p_scoring uuid; p_academy uuid; p_sportsday uuid;
  t_padel uuid; t_draw uuid; r jsonb; e uuid; fee uuid; quest uuid; d date := current_date;
begin
  if exists (select 1 from organizations where slug = 'move-beyond-demo') then
    raise notice 'Demo organization already seeded — skipping';
    return;
  end if;
  o := mb_bootstrap_organization('Move Beyond (Demo)', 'move-beyond-demo');
  b := mb_upsert_partner(o, 'Belal', null, 50, false);
  w := mb_upsert_partner(o, 'Wahid', null, 50, true);
  bank := mb_default_cash_account(o);
  select id into bhold from cash_accounts where organization_id = o and person_id = b;
  insert into people (organization_id, full_name, kind, job_title) values (o, 'Omar Adel', 'employee', 'Event Coordinator') returning id into omar;
  insert into people (organization_id, full_name, kind, job_title) values (o, 'Nour Hassan', 'freelancer', 'Photographer') returning id into nour;

  insert into clients (organization_id, name, client_type, company_name, email) values
    (o, 'Levels FC', 'club', 'Levels Football Club', 'finance@levelsfc.example') returning id into c_levels;
  insert into clients (organization_id, name, client_type, company_name) values (o, 'Katameya Heights', 'company', 'Katameya Heights Golf & Tennis Resort') returning id into c_katameya;
  insert into clients (organization_id, name, client_type) values (o, 'Brand X', 'brand') returning id into c_brandx;
  insert into clients (organization_id, name, client_type) values (o, 'Cairo Sports Academy', 'academy') returning id into c_academy;
  insert into clients (organization_id, name, client_type) values (o, 'Techno Corp', 'company') returning id into c_techno;

  insert into suppliers (organization_id, name, category) values (o, 'Supplier ABC', 'Production') returning id into s_abc;
  insert into suppliers (organization_id, name, category) values (o, 'Screens Pro', 'Screens') returning id into s_screens;
  insert into suppliers (organization_id, name, category) values (o, 'VR Rentals Co', 'Rentals') returning id into s_vr;
  insert into suppliers (organization_id, name, category) values (o, 'Cairo Transport', 'Logistics') returning id into s_transport;
  insert into suppliers (organization_id, name, category) values (o, 'Print Hub', 'Printing') returning id into s_print;
  insert into suppliers (organization_id, name, category) values (o, 'Cloud Host', 'Hosting') returning id into s_cloud;

  select id into svc_event from services where organization_id = o and name = 'Sports Tournament';
  select id into svc_padel from services where organization_id = o and name = 'Padel Tournament';
  select id into svc_tick from services where organization_id = o and name = 'Tournament Registration';
  select id into svc_evtech from services where organization_id = o and name = 'Live Scoring';
  select id into svc_sponsor from services where organization_id = o and name = 'Event Sponsorship';
  select id into svc_scoring from services where organization_id = o and name = 'Scoring System';
  select id into svc_registration from services where organization_id = o and name = 'Online Registration';
  select id into svc_movevr from services where organization_id = o and name = 'VR Stations';

  select id into cat_screens from expense_categories where organization_id = o and name = 'Screens';
  select id into cat_branding from expense_categories where organization_id = o and name = 'Branding';
  select id into cat_meals from expense_categories where organization_id = o and name = 'Meals';
  select id into cat_sound from expense_categories where organization_id = o and name = 'Sound';
  select id into cat_photo from expense_categories where organization_id = o and name = 'Photography';
  select id into cat_dev from expense_categories where organization_id = o and name = 'Developers';
  select id into cat_hosting from expense_categories where organization_id = o and name = 'Hosting' and scope = 'both';
  select id into cat_vr from expense_categories where organization_id = o and name = 'VR Equipment';
  select id into cat_office from expense_categories where organization_id = o and name = 'Office';
  select id into cat_software from expense_categories where organization_id = o and name = 'Software';
  select id into cat_transport from expense_categories where organization_id = o and name = 'Transportation' and scope = 'project';
  select id into cat_ushers from expense_categories where organization_id = o and name = 'Ushers';
  select id into cat_courts from expense_categories where organization_id = o and name = 'Structures';
  select id into cat_marketing from expense_categories where organization_id = o and name = 'Sponsorship' and scope = 'both';

  -- Opening bank balance
  perform mb_post_opening_balance(o, jsonb_build_object('category','cash','cash_account_id', bank, 'amount', 250000, 'date', d - 120,
          'reason', 'Opening balance — Move Beyond company bank'));

  -- Levels FC — Move IT annual subscription (spec §8, §112)
  r := mb_create_subscription(o, jsonb_build_object('client_id', c_levels,
         'service_id', (select id from services where organization_id = o and name = 'Move IT Platform Subscription'),
         'plan_name', 'Move IT Academy — Annual', 'project_name', 'Levels FC — Move IT Annual Subscription', 'billing_cycle', 'annual',
         'cycle_amount', 120000, 'setup_fee', 15000, 'start_date', d - 60,
         'items', jsonb_build_array(jsonb_build_object('item_type','branch_addon','description','Second branch (Sheikh Zayed)','quantity',1,'amount_per_cycle',20000))));
  perform mb_record_collection((r->>'project_id')::uuid, 15000, d - 58, bank, 'EGP', 1, 'Setup fee');
  perform mb_record_collection((r->>'project_id')::uuid, 70000, d - 30, bank, 'EGP', 1, 'Annual — first instalment');

  -- Monthly MRR subscription with trial ending soon
  perform mb_create_subscription(o, jsonb_build_object('client_id', c_academy,
         'service_id', (select id from services where organization_id = o and name = 'Move IT Platform Subscription'),
         'plan_name', 'Move IT Starter — Monthly', 'billing_cycle', 'monthly', 'cycle_amount', 6000, 'start_date', d - 25, 'trial_end_date', d + 5));

  -- Padel Tournament #1 — where the Padel Platform was built (spec §45)
  r := mb_create_project(o, jsonb_build_object('name','Padel Tournament #1','client_id', c_katameya,'project_type','event','contract_value', 80000,
         'service_ids', jsonb_build_array(svc_padel, svc_evtech), 'start_date', d - 150, 'end_date', d - 148, 'operational_status','completed',
         'milestones', jsonb_build_array(jsonb_build_object('label','Full payment','due_date', d - 150,'amount', 80000))));
  p_padel1 := (r->>'project_id')::uuid;
  perform mb_record_collection(p_padel1, 80000, d - 145, bank);
  perform mb_add_expense(o, jsonb_build_object('project_id', p_padel1, 'description','Courts, balls & referees','category_id', cat_courts,'committed_amount', 62000,
          'payment', jsonb_build_object('amount', 62000,'payer_type','company','date', d - 149)));
  perform mb_add_expense(o, jsonb_build_object('project_id', p_padel1, 'description','Platform hosting (first year)','category_id', cat_hosting,'supplier_id', s_cloud,'committed_amount', 5000,
          'payment', jsonb_build_object('amount', 5000,'payer_type','company','date', d - 152)));

  r := mb_create_technology(o, jsonb_build_object('name','Move Beyond Padel Tournament Platform','developer_person_id', w,
         'category_id', (select id from technology_categories where organization_id = o and name = 'Tournament Platform'),
         'original_project_id', p_padel1, 'agreed_value', 50000, 'reusable', true, 'ownership','Move Beyond','lifecycle_status','completed',
         'development_start_date', d - 200, 'completion_date', d - 152, 'current_version', '1.2',
         'description', 'Registration, draws, live scoring and leaderboards for padel tournaments.',
         'service_ids', jsonb_build_array(svc_evtech, (select id from services where organization_id = o and name = 'Tournament Management Platform'))));
  t_padel := (r->>'technology_id')::uuid;
  update project_technology_usage set recovery_decision = 'no_recovery', notes = 'Original event could not cover development' where project_id = p_padel1;
  -- Settle and close #1: Move Beyond funding recovered, profit (13,000) split 50/50
  perform mb_confirm_settlement(p_padel1, jsonb_build_object('date', d - 140, 'lines', jsonb_build_array(jsonb_build_object('line_type','company_funding','amount', 67000))));
  perform mb_distribute_profit(p_padel1, jsonb_build_object('date', d - 140, 'pay_now', true, 'lines', jsonb_build_array(
          jsonb_build_object('person_id', w, 'share_pct', 50, 'amount', 6500), jsonb_build_object('person_id', b, 'share_pct', 50, 'amount', 6500))));
  perform mb_close_project(p_padel1);

  -- Draw System — fully recovered before go-live (spec §57 table)
  perform mb_create_technology(o, jsonb_build_object('name','Draw System','developer_person_id', w,
         'category_id', (select id from technology_categories where organization_id = o and name = 'Draw System'),
         'agreed_value', 70000, 'already_recovered', 70000, 'lifecycle_status','completed', 'completion_date', d - 400));

  -- Padel Tournament #2 — reuses the platform; settlement recovers 10,000 (spec §113)
  r := mb_create_project(o, jsonb_build_object('name','Padel Tournament #2','client_id', c_katameya,'project_type','event','contract_value', 200000,
         'service_ids', jsonb_build_array(svc_padel, svc_tick, svc_evtech), 'start_date', d - 45, 'end_date', d - 43, 'operational_status','completed',
         'milestones', jsonb_build_array(jsonb_build_object('label','Signing','due_date', d - 70,'amount', 100000), jsonb_build_object('label','Completion','due_date', d - 40,'amount', 100000)),
         'members', jsonb_build_array(jsonb_build_object('person_id', w, 'project_role','project_manager'))));
  p_padel2 := (r->>'project_id')::uuid;
  perform mb_set_project_technology(p_padel2, t_padel, 'decide_at_settlement', 10000);
  perform mb_record_collection(p_padel2, 100000, d - 68, bank);
  perform mb_record_collection(p_padel2, 100000, d - 38, bank);
  perform mb_add_expense(o, jsonb_build_object('project_id', p_padel2, 'description','Court rental & balls','category_id', cat_courts,'supplier_id', s_abc,'committed_amount', 70000,
          'payment', jsonb_build_object('amount', 70000,'payer_type','company','date', d - 46)));
  perform mb_add_expense(o, jsonb_build_object('project_id', p_padel2, 'description','Branding & printing','category_id', cat_branding,'supplier_id', s_print,'committed_amount', 40000,
          'payment', jsonb_build_object('amount', 40000,'payer_type','partner','person_id', b,'date', d - 50)));
  perform mb_confirm_settlement(p_padel2, jsonb_build_object('date', d - 35, 'lines', jsonb_build_array(
          jsonb_build_object('line_type','partner_funding','person_id', b, 'amount', 40000, 'label', 'Belal funding'),
          jsonb_build_object('line_type','company_funding','amount', 70000),
          jsonb_build_object('line_type','cto','technology_id', t_padel, 'amount', 10000, 'suggested_amount', 50000, 'label', 'Wahid CTO recovery — Padel Platform'))));

  -- Padel Tournament #3 — upcoming, uses the platform: recovery decided at settlement
  r := mb_create_project(o, jsonb_build_object('name','Katameya Padel Tournament #3','client_id', c_katameya,'project_type','event','contract_value', 240000,
         'service_ids', jsonb_build_array(svc_padel, svc_tick, svc_evtech), 'start_date', d + 18, 'end_date', d + 19, 'operational_status','preparation',
         'budget_amount', 140000,
         'milestones', jsonb_build_array(jsonb_build_object('label','Downpayment','due_date', d - 3,'amount', 120000), jsonb_build_object('label','Final','due_date', d + 21,'amount', 120000)),
         'members', jsonb_build_array(jsonb_build_object('person_id', w, 'project_role','project_manager'), jsonb_build_object('person_id', b, 'project_role','lead_generator'))));
  p_padel3 := (r->>'project_id')::uuid;
  perform mb_set_project_technology(p_padel3, t_padel, 'decide_at_settlement', 15000);
  perform mb_record_collection(p_padel3, 120000, d - 2, bank);
  perform mb_add_expense(o, jsonb_build_object('project_id', p_padel3, 'description','Courts & referees','category_id', cat_courts,'supplier_id', s_abc,
          'estimated_amount', 80000, 'committed_amount', 85000, 'due_date', d + 14));
  perform mb_add_expense(o, jsonb_build_object('project_id', p_padel3, 'description','Live scoring screens','category_id', cat_screens,'estimated_amount', 30000));

  -- Katameya Heights Padel Open — the big live event (spec §30–39 scenarios)
  r := mb_create_project(o, jsonb_build_object('name','Katameya Heights Padel Open','client_id', c_katameya,'project_type','event','contract_value', 500000,
         'service_ids', jsonb_build_array(svc_event, svc_tick, svc_evtech, svc_movevr), 'start_date', d + 4, 'end_date', d + 6, 'operational_status','preparation',
         'budget_amount', 330000, 'payment_structure','milestones',
         'milestones', jsonb_build_array(
            jsonb_build_object('label','Signing','trigger_kind','signing','due_date', d - 40,'amount', 150000),
            jsonb_build_object('label','Before event','trigger_kind','before_event','due_date', d - 5,'amount', 150000),
            jsonb_build_object('label','Completion','trigger_kind','completion','due_date', d + 20,'amount', 200000)),
         'members', jsonb_build_array(jsonb_build_object('person_id', w, 'project_role','project_manager'), jsonb_build_object('person_id', b, 'project_role','lead_generator'))));
  p_katameya := (r->>'project_id')::uuid;
  perform mb_record_collection(p_katameya, 150000, d - 38, bank, 'EGP', 1, 'Signing payment');
  perform mb_record_collection(p_katameya, 60000, d - 3, bank, 'EGP', 1, 'Partial before-event payment');
  perform mb_add_contract_adjustment(p_katameya, 'change_order', 40000, 'Extra LED screens for the centre court', d - 10);
  perform mb_add_expense(o, jsonb_build_object('project_id', p_katameya, 'description','LED screens','category_id', cat_screens,'supplier_id', s_screens,'committed_amount', 70000,
          'payment', jsonb_build_object('amount', 70000,'payer_type','partner','person_id', w,'date', d - 12)));
  perform mb_add_expense(o, jsonb_build_object('project_id', p_katameya, 'description','Venue branding','category_id', cat_branding,'supplier_id', s_print,'committed_amount', 100000,
          'payment', jsonb_build_object('amount', 100000,'payer_type','company','date', d - 9)));
  perform mb_add_expense(o, jsonb_build_object('project_id', p_katameya, 'description','Water & snacks for ushers','category_id', cat_meals,'committed_amount', 2000,
          'payment', jsonb_build_object('amount', 2000,'payer_type','employee','person_id', omar,'date', d - 2)));
  perform mb_add_expense(o, jsonb_build_object('project_id', p_katameya, 'description','Stage & sound','category_id', cat_sound,'supplier_id', s_abc,
          'estimated_amount', 140000, 'committed_amount', 150000, 'due_date', d + 3,
          'payment', jsonb_build_object('amount', 75000,'payer_type','company','date', d - 7)));
  perform mb_add_expense(o, jsonb_build_object('project_id', p_katameya, 'description','Event photography','category_id', cat_photo,'committed_amount', 8000, 'due_date', d - 1));
  perform mb_add_expense(o, jsonb_build_object('project_id', p_katameya, 'description','Ushers (12 × 2 days)','category_id', cat_ushers,'estimated_amount', 18000));
  -- VR rental with landed cost (spec §41)
  r := mb_add_expense(o, jsonb_build_object('project_id', p_katameya, 'description','TV rental (4 units)','expense_type','rental','category_id', cat_screens,'supplier_id', s_vr,
          'quantity', 4, 'unit_cost', 1500, 'committed_amount', 6000));
  perform mb_add_expense(o, jsonb_build_object('project_id', p_katameya, 'description','TV delivery','category_id', cat_transport,'supplier_id', s_transport,'committed_amount', 1500,
          'related_expense_id', r->>'expense_id', 'allocation_basis','per_supplier_order'));
  -- Owned asset purchase: 5 × Quest 3 (spec §70–73)
  r := mb_add_expense(o, jsonb_build_object('project_id', p_katameya, 'description','Meta Quest 3 headsets','expense_type','owned_asset','category_id', cat_vr,'committed_amount', 125000,
          'asset', jsonb_build_object('name','Meta Quest 3','quantity', 5, 'category_id', (select id from asset_categories where organization_id = o and name = 'VR Equipment')),
          'payment', jsonb_build_object('amount', 125000,'payer_type','company','date', d - 6)));
  quest := (r->>'asset_id')::uuid;
  perform mb_suggest_fees(p_katameya);

  -- Brand X Fan Zone — sponsorship / marketing investment with zero revenue (spec §16)
  r := mb_create_project(o, jsonb_build_object('name','Brand X Fan Zone Sponsorship','client_id', c_brandx,'project_type','sponsorship','contract_value', 0,
         'service_ids', jsonb_build_array(svc_sponsor), 'start_date', d - 20, 'end_date', d - 19, 'operational_status','completed',
         'description','Marketing investment in exchange for branding and content rights.'));
  p_brandx := (r->>'project_id')::uuid;
  perform mb_add_expense(o, jsonb_build_object('project_id', p_brandx, 'description','Sponsorship package','category_id', cat_marketing,'committed_amount', 45000,
          'payment', jsonb_build_object('amount', 45000,'payer_type','company','date', d - 25)));

  -- Techno Corp — one-time custom software (Move Pro)
  r := mb_create_project(o, jsonb_build_object('name','Techno Corp — Custom Scoring System','client_id', c_techno,'project_type','one_time_service','contract_value', 180000,
         'service_ids', jsonb_build_array(svc_scoring), 'start_date', d - 50, 'end_date', d + 30, 'operational_status','live',
         'milestones', jsonb_build_array(jsonb_build_object('label','Kick-off (50%)','trigger_kind','signing','due_date', d - 50,'amount', 90000),
                                         jsonb_build_object('label','Delivery (50%)','trigger_kind','completion','due_date', d + 30,'amount', 90000))));
  p_scoring := (r->>'project_id')::uuid;
  perform mb_record_collection(p_scoring, 90000, d - 48, bank, 'EGP', 1, 'Kick-off');
  perform mb_add_expense(o, jsonb_build_object('project_id', p_scoring, 'description','Front-end developer (freelance)','category_id', cat_dev,'committed_amount', 25000,
          'payment', jsonb_build_object('amount', 25000,'payer_type','partner','person_id', w,'date', d - 30)));
  perform mb_add_expense(o, jsonb_build_object('project_id', p_scoring, 'description','Cloud hosting','category_id', cat_hosting,'supplier_id', s_cloud,'committed_amount', 5000,
          'payment', jsonb_build_object('amount', 5000,'payer_type','company','date', d - 29)));

  -- Cairo Sports Academy — recurring Move Tick contract; client paid Belal personally (D2)
  r := mb_create_project(o, jsonb_build_object('name','Cairo Sports Academy — Registration Operations','client_id', c_academy,'project_type','recurring_contract',
         'contract_value', 75000, 'service_ids', jsonb_build_array(svc_registration), 'start_date', d - 60, 'end_date', d + 30, 'operational_status','live',
         'milestones', jsonb_build_array(jsonb_build_object('label','Month 1','due_date', d - 55,'amount', 25000), jsonb_build_object('label','Month 2','due_date', d - 25,'amount', 25000),
                                         jsonb_build_object('label','Month 3','due_date', d + 5,'amount', 25000))));
  p_academy := (r->>'project_id')::uuid;
  perform mb_record_collection(p_academy, 25000, d - 50, bhold, 'EGP', 1, 'Paid to Belal in cash');
  perform mb_add_expense(o, jsonb_build_object('project_id', p_academy, 'description','Registration desk staff','category_id', cat_ushers,'committed_amount', 9000,
          'payment', jsonb_build_object('amount', 9000,'payer_type','company','cash_account_id', bhold,'date', d - 45)));

  -- Corporate Sports Day — completed, settled, profit partially distributed (spec §67)
  r := mb_create_project(o, jsonb_build_object('name','Techno Corp Corporate Sports Day','client_id', c_techno,'project_type','event','contract_value', 300000,
         'service_ids', jsonb_build_array(svc_event), 'start_date', d - 35, 'end_date', d - 35, 'operational_status','completed',
         'milestones', jsonb_build_array(jsonb_build_object('label','Full','due_date', d - 30,'amount', 300000)),
         'members', jsonb_build_array(jsonb_build_object('person_id', w, 'project_role','project_manager'))));
  p_sportsday := (r->>'project_id')::uuid;
  perform mb_record_collection(p_sportsday, 300000, d - 28, bank);
  perform mb_add_expense(o, jsonb_build_object('project_id', p_sportsday, 'description','Production & logistics','category_id', cat_courts,'supplier_id', s_abc,'committed_amount', 125000,
          'payment', jsonb_build_object('amount', 125000,'payer_type','company','date', d - 36)));
  perform mb_add_expense(o, jsonb_build_object('project_id', p_sportsday, 'description','TV purchase','expense_type','owned_asset','committed_amount', 25000,
          'asset', jsonb_build_object('name','Samsung 65" TV','quantity',1,'category_id',(select id from asset_categories where organization_id = o and name = 'TVs & Screens')),
          'payment', jsonb_build_object('amount', 25000,'payer_type','company','date', d - 36)));
  perform mb_suggest_fees(p_sportsday);
  select id into fee from partner_fees where project_id = p_sportsday and person_id = w;
  perform mb_confirm_settlement(p_sportsday, jsonb_build_object('date', d - 20, 'lines', jsonb_build_array(
          jsonb_build_object('line_type','fee','fee_id', fee, 'amount', 30000),
          jsonb_build_object('line_type','company_funding','amount', 150000))));
  perform mb_distribute_profit(p_sportsday, jsonb_build_object('date', d - 20, 'lines', jsonb_build_array(
          jsonb_build_object('person_id', w, 'share_pct', 50, 'amount', 60000, 'reinvested', 12000),
          jsonb_build_object('person_id', b, 'share_pct', 50, 'amount', 60000, 'reinvested', 12000))));
  perform mb_pay_person(o, w, 'profit', p_sportsday, 48000, d - 18);
  perform mb_pay_person(o, b, 'profit', p_sportsday, 20000, d - 18);

  -- Asset reuse: 2 Quest 3 headsets assigned to Padel #3 at no internal cost (spec §72–73)
  perform mb_assign_asset(quest, p_padel3, 2, d + 18, d + 19, 0, 'VR corner');

  -- Company overhead
  perform mb_add_expense(o, jsonb_build_object('description','Office rent — August','category_id', cat_office,'committed_amount', 15000,
          'payment', jsonb_build_object('amount', 15000,'payer_type','company','date', d - 55)));
  perform mb_add_expense(o, jsonb_build_object('description','Office rent — September','category_id', cat_office,'committed_amount', 15000,
          'payment', jsonb_build_object('amount', 15000,'payer_type','company','date', d - 25)));
  perform mb_add_expense(o, jsonb_build_object('description','Software subscriptions','category_id', cat_software,'committed_amount', 3200,
          'payment', jsonb_build_object('amount', 3200,'payer_type','partner','person_id', w,'date', d - 15)));

  perform mb_refresh_alerts(o);
end $$;
