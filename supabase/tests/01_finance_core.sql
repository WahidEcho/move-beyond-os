-- Finance core (spec §127): payments, expenses by payer, commitments,
-- cancellation, soft delete, change orders, funding, idempotency, ledger.
do $$
declare
  s jsonb := pg_temp.setup();
  v_org uuid := (s->>'org')::uuid;
  v_w uuid := (s->>'wahid')::uuid;
  v_b uuid := (s->>'belal')::uuid;
  v_emp uuid := (s->>'employee')::uuid;
  v_bank uuid := (s->>'bank')::uuid;
  v_bhold uuid := (s->>'belal_hold')::uuid;
  p uuid; e uuid; e2 uuid; r jsonb; v_n int;
begin
  p := pg_temp.project(v_org, 'Katameya Heights Padel Open', 500000, (s->>'client')::uuid, jsonb_build_array(
        jsonb_build_object('label','Signing','due_date', current_date - 10, 'amount', 150000),
        jsonb_build_object('label','Before event','due_date', current_date + 5, 'amount', 150000),
        jsonb_build_object('label','Completion','due_date', current_date + 30, 'amount', 200000)));
  perform pg_temp.ok('project code format MB-YYNNN', (select code ~ '^MB-\d{5}$' from projects where id = p));

  -- Full client payment of a milestone
  perform mb_record_collection(p, 150000, current_date, v_bank);
  perform pg_temp.eq('full payment: milestone 1 outstanding', (select outstanding from v_receivables where project_id = p and label = 'Signing'), 0);
  -- Partial payment (spec §31)
  perform mb_record_collection(p, 60000, current_date, v_bank);
  perform pg_temp.eq('partial payment: collected', pg_temp.pf(p, 'collected'), 210000);
  perform pg_temp.eq('partial payment: milestone 2 outstanding', (select outstanding from v_receivables where project_id = p and label = 'Before event'), 90000);
  perform pg_temp.eq('receivable outstanding', pg_temp.pf(p, 'receivable_outstanding'), 290000);
  perform pg_temp.eq('overdue (signing was paid, nothing overdue)', pg_temp.pf(p, 'overdue'), 0);

  -- Partner-funded expense (spec §25): one entry, reimbursement generated
  perform mb_add_expense(v_org, jsonb_build_object('project_id', p, 'description', 'LED screens', 'committed_amount', 70000,
          'payment', jsonb_build_object('amount', 70000, 'payer_type', 'partner', 'person_id', v_w)));
  perform pg_temp.eq('partner-paid: amount due to Wahid', pg_temp.pb(v_w, 'funding_due'), 70000);
  perform pg_temp.eq('partner-paid: funding record', (select sum(amount_egp) from project_funding where project_id = p and kind = 'expense_paid'), 70000);
  perform pg_temp.eq('partner-paid: bank untouched', pg_temp.cash(v_bank), 210000);

  -- Move Beyond-paid expense (spec §26): company funding, never "MB owes MB"
  perform mb_add_expense(v_org, jsonb_build_object('project_id', p, 'description', 'Venue branding', 'committed_amount', 100000,
          'payment', jsonb_build_object('amount', 100000, 'payer_type', 'company', 'cash_account_id', v_bank)));
  perform pg_temp.eq('company-paid: bank balance', pg_temp.cash(v_bank), 110000);
  perform pg_temp.eq('company-paid: Move Beyond funding', pg_temp.pf(p, 'company_funding_outstanding'), 100000);
  perform pg_temp.eq('company-paid: nothing due to anyone', (select coalesce(sum(due),0) from v_person_project_dues where project_id = p and category <> 'funding'), 0);

  -- Employee reimbursement (spec §27)
  perform mb_add_expense(v_org, jsonb_build_object('project_id', p, 'description', 'Water for ushers', 'committed_amount', 2000,
          'payment', jsonb_build_object('amount', 2000, 'payer_type', 'employee', 'person_id', v_emp)));
  perform pg_temp.eq('employee reimbursement due', pg_temp.pb(v_emp, 'employee_due'), 2000);
  perform pg_temp.ok('employee is not a partner or funder', not exists (select 1 from funders where person_id = v_emp));

  -- Commitment + supplier partial payment (spec §38–39)
  r := mb_add_expense(v_org, jsonb_build_object('project_id', p, 'supplier_id', s->>'supplier', 'description', 'Stage & sound',
         'estimated_amount', 140000, 'committed_amount', 150000, 'due_date', current_date + 3));
  e := (r->>'expense_id')::uuid;
  perform pg_temp.eq_text('commitment status', (select status from expenses where id = e), 'committed');
  perform mb_record_expense_payment(e, jsonb_build_object('amount', 75000, 'payer_type', 'company', 'cash_account_id', v_bank));
  perform pg_temp.eq_text('supplier partial: status', (select status from expenses where id = e), 'partially_paid');
  perform pg_temp.eq('supplier partial: outstanding', (select outstanding_egp from v_expense_balances where expense_id = e), 75000);
  perform pg_temp.eq('actual cost = paid by anyone', pg_temp.pf(p, 'actual_cost'), 70000 + 100000 + 2000 + 75000);
  perform pg_temp.eq('committed cost includes unpaid commitment', pg_temp.pf(p, 'committed_cost'), 70000 + 100000 + 2000 + 150000);
  perform pg_temp.eq('remaining commitments', pg_temp.pf(p, 'remaining_commitments'), 75000);
  perform pg_temp.fails('cannot overpay a commitment',
    format('select mb_record_expense_payment(%L, %L::jsonb)', e, jsonb_build_object('amount', 80000, 'payer_type','company')),
    'exceeds the remaining commitment');
  perform pg_temp.fails('raising a commitment requires a reason',
    format('select mb_update_expense(%L, %L::jsonb, null)', e, '{"committed_amount": 160000}'), 'reason is required');
  perform mb_update_expense(e, '{"committed_amount": 160000}', 'Final supplier invoice received');
  perform pg_temp.ok('amount change is audited with reason',
    exists (select 1 from audit_logs where table_name = 'expenses' and record_id = e::text and action = 'amount_change'
            and reason = 'Final supplier invoice received' and old_data->>'committed_amount' = '150000.00'));

  -- Expense cancellation
  r := mb_add_expense(v_org, jsonb_build_object('project_id', p, 'description', 'Extra photographer', 'committed_amount', 20000));
  e2 := (r->>'expense_id')::uuid;
  perform mb_cancel_expense(e2, 'Client dropped the request');
  perform pg_temp.eq('cancelled commitment has no outstanding', (select outstanding_egp from v_expense_balances where expense_id = e2), 0);
  perform pg_temp.eq('cancelled commitment leaves committed cost', pg_temp.pf(p, 'committed_cost'), 70000 + 100000 + 2000 + 160000);

  -- Soft delete (spec §85)
  r := mb_add_expense(v_org, jsonb_build_object('project_id', p, 'description', 'Duplicate entry', 'committed_amount', 5000,
         'payment', jsonb_build_object('amount', 5000, 'payer_type', 'company')));
  perform pg_temp.eq('before delete: bank', pg_temp.cash(v_bank), 110000 - 75000 - 5000);
  perform pg_temp.fails('delete requires a reason', format('select mb_delete_expense(%L, %L)', r->>'expense_id', ''), 'reason is required');
  perform mb_delete_expense((r->>'expense_id')::uuid, 'Entered twice');
  perform pg_temp.eq('after delete: bank restored', pg_temp.cash(v_bank), 110000 - 75000);
  perform pg_temp.eq('after delete: cost excluded', pg_temp.pf(p, 'actual_cost'), 247000);
  perform pg_temp.ok('deleted record still exists and is listed', exists (select 1 from v_deleted_records where id = (r->>'expense_id')::uuid));
  perform pg_temp.ok('ledger keeps original + reversal',
    (select count(*) from journal_entries where source_id = (r->>'payment_id')::uuid) = 2);

  -- Change orders & discounts (spec §32–33)
  perform mb_add_contract_adjustment(p, 'change_order', 40000, 'Extra screens');
  perform mb_add_contract_adjustment(p, 'change_order', 20000, 'Extra staff');
  perform pg_temp.eq('change orders: revised contract', pg_temp.pf(p, 'contract_value'), 560000);
  perform mb_add_contract_adjustment(p, 'discount', 10000, 'Loyalty discount');
  perform pg_temp.eq('discount reduces contract', pg_temp.pf(p, 'contract_value'), 550000);
  perform pg_temp.eq('revision history kept', (select count(*) from contract_adjustments where project_id = p), 3);

  -- Non-reimbursable partner payment (spec §28 OFF)
  perform mb_add_expense(v_org, jsonb_build_object('project_id', p, 'description', 'Snacks (Belal gift)', 'committed_amount', 3000,
          'payment', jsonb_build_object('amount', 3000, 'payer_type', 'partner', 'person_id', v_b, 'reimbursable', false)));
  perform pg_temp.eq('non-reimbursable: nothing due to Belal', pg_temp.pb(v_b, 'funding_due'), 0);
  perform pg_temp.eq('non-reimbursable: recorded as capital', pg_temp.pb(v_b, 'capital'), 3000);

  -- Funding repayment, partial (spec §76)
  perform mb_pay_person(v_org, v_w, 'funding', p, 30000);
  perform pg_temp.eq('partial funding repayment: remaining', pg_temp.pb(v_w, 'funding_due'), 40000);
  perform pg_temp.fails('cannot repay more than due', format('select mb_pay_person(%L, %L, %L, %L, 50000)', v_org, v_w, 'funding', p),
    'Maximum payable is 40,000 EGP');

  -- Cash funding contribution
  perform mb_add_funding(p, v_b, 40000, current_date, v_bank);
  perform pg_temp.eq('cash funding: due to Belal', pg_temp.pb(v_b, 'funding_due'), 40000);

  -- Client pays a partner personally (D2): partner holds company money
  perform mb_record_collection(p, 50000, current_date, v_bhold);
  perform pg_temp.eq('held by Belal', pg_temp.pb(v_b, 'held_for_company'), 50000);
  perform pg_temp.eq('revenue still recognised', pg_temp.pf(p, 'collected'), 260000);
  -- Partner-to-partner settlement: Belal pays Wahid 10,000 of his funding from the cash he holds
  perform mb_pay_person(v_org, v_w, 'funding', p, 10000, current_date, v_bhold);
  perform pg_temp.eq('partner-to-partner: Wahid due reduced', pg_temp.pb(v_w, 'funding_due'), 30000);
  perform pg_temp.eq('partner-to-partner: Belal holds less', pg_temp.pb(v_b, 'held_for_company'), 40000);
  -- Belal deposits 20,000 into the bank
  perform mb_cash_transfer(v_org, v_bhold, v_bank, 20000, current_date, 'Deposit');
  perform pg_temp.eq('transfer: Belal holds', pg_temp.pb(v_b, 'held_for_company'), 20000);

  -- Idempotency (spec §103)
  perform mb_record_collection(p, 1000, current_date, v_bank, 'EGP', 1, 'dup-test', null, null, 'idem-key-1');
  perform mb_record_collection(p, 1000, current_date, v_bank, 'EGP', 1, 'dup-test', null, null, 'idem-key-1');
  select count(*) into v_n from collections where project_id = p and reference = 'dup-test';
  perform pg_temp.eq('idempotent collection recorded once', v_n, 1);

  -- Foreign currency collection
  perform mb_record_collection(p, 1000, current_date, v_bank, 'USD', 48.5, 'usd');
  perform pg_temp.eq('USD converted to EGP in ledger', (select amount_egp from collections where reference = 'usd' and project_id = p), 48500);

  -- Bank adjustment
  perform mb_bank_adjustment(v_org, v_bank, -150, current_date, 'Bank charges on statement');
  perform pg_temp.ok('bank adjustment hits overhead', (select sum(amount) from journal_lines where organization_id = v_org and account_code = 'OVERHEAD') = 150);

  -- Owned asset purchase (spec §70–71)
  r := mb_add_expense(v_org, jsonb_build_object('project_id', p, 'description', 'TV purchase', 'expense_type', 'owned_asset',
         'committed_amount', 25000, 'asset', jsonb_build_object('name', 'Samsung 65" TV', 'quantity', 1),
         'payment', jsonb_build_object('amount', 25000, 'payer_type', 'company')));
  perform pg_temp.eq('asset created with value', (select purchase_value from assets where id = (r->>'asset_id')::uuid), 25000);
  perform pg_temp.ok('asset cost is a project cash outflow', exists (select 1 from expense_payments where expense_id = (r->>'expense_id')::uuid));

  -- Ledger integrity and immutability
  perform pg_temp.ledger_balanced(v_org);
  perform pg_temp.fails('posted journal lines are immutable', format('update journal_lines set amount = 1 where organization_id = %L', v_org), 'cannot be modified');
  perform pg_temp.fails('journal entries cannot be deleted', format('delete from journal_entries where organization_id = %L', v_org), 'cannot be modified');
end $$;
