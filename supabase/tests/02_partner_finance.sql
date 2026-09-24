-- Partner finance (spec §127): fees, settlement, profit split, reinvestment,
-- distribution warning, closure/reopen, loss allocation, carry-forward.
do $$
declare
  s jsonb := pg_temp.setup();
  v_org uuid := (s->>'org')::uuid;
  v_w uuid := (s->>'wahid')::uuid;
  v_b uuid := (s->>'belal')::uuid;
  v_bank uuid := (s->>'bank')::uuid;
  p uuid; p2 uuid; p3 uuid; v_fee uuid; r jsonb; v_n int;
begin
  -- Project B: 300k contract, fully collected, 150k company-paid costs
  p := pg_temp.project(v_org, 'Corporate Sports Day', 300000, (s->>'client')::uuid,
        jsonb_build_array(jsonb_build_object('label','Full','due_date', current_date, 'amount', 300000)));
  insert into project_members (project_id, organization_id, person_id, project_role) values (p, v_org, v_w, 'project_manager');
  insert into project_members (project_id, organization_id, person_id, project_role) values (p, v_org, v_b, 'lead_generator');
  perform mb_add_expense(v_org, jsonb_build_object('project_id', p, 'description', 'Production', 'committed_amount', 150000,
          'payment', jsonb_build_object('amount', 150000, 'payer_type', 'company')));
  perform mb_record_collection(p, 300000, current_date, v_bank);

  -- Gross project profit (spec §63)
  perform pg_temp.eq('gross profit = revenue − direct costs', (mb_project_profit(p)->>'gross_profit')::numeric, 150000);

  -- Quick partner fee suggestions (spec §43): suggested, not applied
  v_n := mb_suggest_fees(p);
  perform pg_temp.eq('two fee suggestions generated', v_n, 2);
  perform pg_temp.eq('suggested management fee = 10% × 300,000', (select amount from partner_fees where project_id = p and person_id = v_w), 30000);
  perform pg_temp.eq('suggestions do not touch profit', (mb_project_profit(p)->>'distributable_profit')::numeric, 150000);
  perform pg_temp.eq('suggest again does not duplicate', mb_suggest_fees(p), 0);

  -- Accept Wahid's, ignore Belal's
  select id into v_fee from partner_fees where project_id = p and person_id = v_w;
  perform mb_decide_fee(v_fee, 'accept');
  perform mb_decide_fee((select id from partner_fees where project_id = p and person_id = v_b), 'ignore');
  perform pg_temp.eq('accepted fee due to Wahid', pg_temp.pb(v_w, 'fee_due'), 30000);
  perform pg_temp.eq('fee reduces distributable profit', (mb_project_profit(p)->>'distributable_profit')::numeric, 120000);

  -- Distribution warning (spec §77): obligations unpaid → warn, not hard block
  perform pg_temp.fails('distribution warns about unpaid obligations',
    format('select mb_distribute_profit(%L, %L::jsonb)', p, jsonb_build_object('lines', jsonb_build_array(
      jsonb_build_object('person_id', v_w, 'amount', 60000), jsonb_build_object('person_id', v_b, 'amount', 60000)))),
    'UNPAID_OBLIGATIONS:180,000 EGP');

  -- Settlement (spec §74–76): pay fee in full, recover company funding partially
  r := mb_confirm_settlement(p, jsonb_build_object('available_cash', 300000, 'lines', jsonb_build_array(
         jsonb_build_object('line_type','fee','fee_id', v_fee, 'amount', 30000, 'suggested_amount', 30000),
         jsonb_build_object('line_type','company_funding','amount', 100000, 'suggested_amount', 150000))));
  perform pg_temp.eq('settlement paid total', (r->>'total_paid')::numeric, 130000);
  perform pg_temp.eq('fee paid, nothing due', pg_temp.pb(v_w, 'fee_due'), 0);
  perform pg_temp.eq('company funding partially recovered', pg_temp.pf(p, 'company_funding_outstanding'), 50000);
  perform pg_temp.fails('cannot recover more company funding than outstanding',
    format('select mb_confirm_settlement(%L, %L::jsonb)', p, jsonb_build_object('lines', jsonb_build_array(
      jsonb_build_object('line_type','company_funding','amount', 60000)))), 'Maximum Move Beyond funding to recover is 50,000 EGP');
  perform pg_temp.eq('failed settlement leaves no trace', (select count(*) from settlements where project_id = p), 1);
  perform mb_confirm_settlement(p, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('line_type','company_funding','amount', 50000))));
  perform pg_temp.eq('no unpaid obligations', mb_project_unpaid_obligations(p), 0);

  -- 50/50 split with reinvestment (spec §65, §67)
  r := mb_distribute_profit(p, jsonb_build_object('lines', jsonb_build_array(
         jsonb_build_object('person_id', v_w, 'share_pct', 50, 'amount', 60000, 'reinvested', 12000),
         jsonb_build_object('person_id', v_b, 'share_pct', 50, 'amount', 60000, 'reinvested', 12000))));
  perform pg_temp.eq('Wahid profit due after reinvestment', pg_temp.pb(v_w, 'profit_due'), 48000);
  perform pg_temp.eq('Belal profit due after reinvestment', pg_temp.pb(v_b, 'profit_due'), 48000);
  perform pg_temp.eq('reinvestment is capital, not expense', pg_temp.pb(v_w, 'capital'), 12000);
  perform pg_temp.eq('reinvestment is not an expense', (select coalesce(sum(amount),0) from journal_lines where organization_id = v_org and account_code = 'OVERHEAD'), 0);
  perform pg_temp.eq('project fully distributed', (mb_project_profit(p)->>'undistributed')::numeric, 0);
  perform pg_temp.fails('cannot distribute beyond profit',
    format('select mb_distribute_profit(%L, %L::jsonb)', p, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('person_id', v_w, 'amount', 1)))),
    'exceeds undistributed project profit');

  -- Pay profit partially
  perform mb_pay_person(v_org, v_w, 'profit', p, 20000);
  perform pg_temp.eq('partial profit payout', pg_temp.pb(v_w, 'profit_due'), 28000);
  perform pg_temp.fails('reversing a paid distribution is blocked', format('select mb_reverse_distribution(%L, %L)', r->>'distribution_id', 'test'), 'already paid out');

  -- Financial closure (spec §83) and reopen (§84)
  r := mb_close_project(p);
  perform pg_temp.ok('closure succeeds when checklist is clean', (r->>'closed')::boolean);
  perform pg_temp.eq_text('status financially closed', (select financial_status from projects where id = p), 'financially_closed');
  perform pg_temp.fails('closed project rejects new postings', format('select mb_record_collection(%L, 100, current_date)', p), 'financially closed');
  perform pg_temp.fails('closed project rejects direct edits', format('update projects set name = %L where id = %L', 'x', p), 'financially closed');
  perform pg_temp.fails('reopen requires a reason', format('select mb_reopen_project(%L, %L)', p, ''), 'reason is required');
  perform mb_reopen_project(p, 'Client disputed final invoice');
  perform pg_temp.ok('reopen is audited', exists (select 1 from audit_logs where table_name = 'projects' and record_id = p::text and action = 'reopened'));
  perform pg_temp.ok('profit payout still possible after reopen', (mb_pay_person(v_org, v_w, 'profit', p, 1000)) ? 'payout_id');

  -- Closure checklist lists issues and needs an override reason
  p2 := pg_temp.project(v_org, 'Unfinished Event', 100000, null,
         jsonb_build_array(jsonb_build_object('label','Final','due_date', current_date + 10, 'amount', 100000)));
  r := mb_close_project(p2);
  perform pg_temp.ok('closure blocked by issues without override', not (r->>'closed')::boolean and jsonb_array_length(r->'issues') > 0);

  -- Loss allocation (spec §68, D5 netted)
  p3 := pg_temp.project(v_org, 'Loss-making Activation', 0);
  perform mb_add_expense(v_org, jsonb_build_object('project_id', p3, 'description', 'Activation costs', 'committed_amount', 90000,
          'payment', jsonb_build_object('amount', 90000, 'payer_type', 'company')));
  perform pg_temp.fails('loss allocation cannot exceed loss', format('select mb_allocate_loss(%L, %L::jsonb)', p3,
    jsonb_build_array(jsonb_build_object('person_id', v_w, 'amount', 100000))), 'exceeds the unallocated loss');
  perform mb_allocate_loss(p3, jsonb_build_array(
    jsonb_build_object('person_id', v_b, 'amount', 20000),
    jsonb_build_object('person_id', v_w, 'amount', 40000),
    jsonb_build_object('person_id', null, 'amount', 30000)));
  perform pg_temp.eq('Wahid carries −40,000 (netted)', pg_temp.pb(v_w, 'carry_due'), -40000);
  perform pg_temp.eq('Belal carries −20,000 (netted)', pg_temp.pb(v_b, 'carry_due'), -20000);
  perform pg_temp.fails('loss fully allocated', format('select mb_allocate_loss(%L, %L::jsonb)', p3,
    jsonb_build_array(jsonb_build_object('person_id', v_w, 'amount', 1))), 'no unallocated loss');

  -- Carry-forward (spec §69): previous recovery due 30,000
  perform mb_post_opening_balance(v_org, jsonb_build_object('category','carry_forward','person_id', v_w, 'amount', 30000,
          'reason', 'Historical recovery from 2025 projects', 'is_opening', false));
  perform pg_temp.eq('carry-forward nets against loss share', pg_temp.pb(v_w, 'carry_due'), -10000);

  -- Opening cash balance
  perform mb_post_opening_balance(v_org, jsonb_build_object('category','cash','cash_account_id', v_bank, 'amount', 250000));
  perform pg_temp.eq('opening balance shown separately', (select opening_balance from v_cash_account_balances where id = v_bank), 250000);

  -- Fee with from_share treatment (D3): not a project cost, part of the share
  p2 := pg_temp.project(v_org, 'Share-funded fee', 100000);
  perform mb_record_collection(p2, 100000, current_date, v_bank);
  perform mb_add_partner_fee(p2, jsonb_build_object('person_id', v_w, 'fee_type', 'management', 'amount', 10000, 'treatment', 'from_share'));
  perform pg_temp.eq('from_share fee: gross/distributable unchanged', (mb_project_profit(p2)->>'distributable_profit')::numeric, 100000);
  perform pg_temp.eq('from_share fee: counts as distributed to Wahid', (mb_project_profit(p2)->>'undistributed')::numeric, 90000);

  -- Reserve (D4) is computed in one place
  perform pg_temp.ok('available reserve = cash − suppliers − employee − net partner dues',
    (select available_reserve = company_cash - unpaid_suppliers - employee_dues - net_partner_dues from v_company_position where organization_id = v_org));

  perform pg_temp.ledger_balanced(v_org);
end $$;
