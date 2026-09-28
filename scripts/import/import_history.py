"""
Historical import into the REAL "Move Beyond" organization.

  python3 scripts/import/import_history.py <workbook.xlsx>            # dry run: executes, validates, ROLLS BACK
  python3 scripts/import/import_history.py <workbook.xlsx> --commit   # same, but commits

Everything runs in ONE transaction through the same mb_* functions the app uses,
so funding, reimbursements, partner balances, CTO outstanding and project P&L
are derived exactly like live entries. Validation tests from the implementation
prompt (§15) run inside the transaction; any failure aborts the whole import.

Glory in Giza is imported as a settled historical snapshot through a
"Pre-opening historical ledger" account: its revenue, costs, partner payouts and
the 108,588 retained share flow through that account, and the retained share is
transferred into the company bank on the opening date (2026-05-23). The bank
therefore opens at exactly 108,588 and nothing pre-opening is replayed against it.
"""
import json
import os
import subprocess
import sys
from datetime import date

import openpyxl

ORG_SLUG = "move-beyond"
OPENING_DATE = "2026-05-23"
IMPORT_DATE = "2026-09-28"               # accounting date for rows with no date (flagged in notes)
PLACEHOLDER_DATES = {                    # best-evidence accounting dates for undated rows (flagged in notes)
    "P-2026-KH-MS": "2026-09-20",        # "expense set supplied on 20-Sep-2026"
}
GLORY = {                                # confirmed historical snapshot (prompt §3)
    "ref": "P-2026-GIG", "revenue": 399000, "cost_total": 200412, "maya_bonus": 4000,
    "wahid": 45000, "belal": 45000, "retained": 108588, "date": "2026-05-22",
}
EXPECTED_BANK_TODAY = 29000


def env(key):
    for line in open(".env.local"):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"{key} missing in .env.local")


DB = env("DATABASE_URL")


def psql(sql, *, single=True):
    args = ["psql", DB, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-tA"]
    if single:
        args.append("-1")
    r = subprocess.run(args, input=sql, capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr


def q_json(sql):
    code, out, err = psql(f"select coalesce(json_agg(t), '[]') from ({sql}) t;")
    if code:
        raise SystemExit(err)
    return json.loads(out.strip() or "[]")


def lit(v):
    """SQL literal for a JSON payload."""
    return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def s(v):
    return "null" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"


# ---------------------------------------------------------------------------
# Read workbook
# ---------------------------------------------------------------------------
def read(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    out = {}
    for ws in wb.worksheets:
        if ws.title in ("READ ME", "Lists"):
            continue
        rows = list(ws.iter_rows(values_only=True))
        header = [str(h).strip() if h else "" for h in rows[1]]
        data = []
        for r in rows[2:]:
            rec = {header[i]: (r[i] if i < len(r) else None) for i in range(len(header)) if header[i]}
            if any(v not in (None, "") for v in rec.values()):
                for k, v in rec.items():
                    if isinstance(v, (date,)):
                        rec[k] = v.isoformat()[:10]
                    elif isinstance(v, str):
                        rec[k] = v.strip()
                data.append(rec)
        out[ws.title] = data
    return out


def num(v):
    return float(v) if v not in (None, "") else 0.0


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    commit = "--commit" in sys.argv
    wb = read(sys.argv[1])
    issues, notes = [], []

    org = q_json(f"select id from organizations where slug = '{ORG_SLUG}'")[0]["id"]
    existing = q_json(f"select count(*) n from projects where organization_id = '{org}'")[0]["n"]
    if existing:
        raise SystemExit(f"Organization already has {existing} project(s). Import runs once into an empty organization.")

    cats = q_json(f"select c.id, c.name, p.name parent from expense_categories c left join expense_categories p on p.id = c.parent_id where c.organization_id = '{org}'")
    svcs = q_json(f"select s.id, s.name, c.name cat from services s join service_categories c on c.id = s.category_id where s.organization_id = '{org}'")
    techcats = {r["name"]: r["id"] for r in q_json(f"select id, name from technology_categories where organization_id = '{org}'")}
    assetcats = {r["name"]: r["id"] for r in q_json(f"select id, name from asset_categories where organization_id = '{org}'")}

    def cat_id(parent, sub, ref):
        for c in cats:
            if c["parent"] == parent and c["name"] == sub:
                return c["id"]
        for c in cats:
            if c["parent"] is None and c["name"] == parent:
                if sub:
                    notes.append(f"{ref}: sub-category '{sub}' not under '{parent}' — filed under '{parent}'")
                return c["id"]
        issues.append(f"{ref}: unknown category '{parent} › {sub}'")
        return None

    def svc_ids(text, ref):
        ids = []
        for name in [x.strip() for x in (text or "").split(";") if x.strip()]:
            m = [x for x in svcs if x["name"] == name]
            if not m:
                issues.append(f"{ref}: unknown service '{name}'")
                continue
            pref = [x for x in m if x["cat"] == "Event Technology"] or m
            ids.append(pref[0]["id"])
        return ids

    clients = {c["client_name"] for c in wb["01_clients"]}
    projects = {p["project_ref"]: p for p in wb["04_projects"]}
    people_new = {p["full_name"]: p for p in wb["03_people"]}

    def pdate(ref, given):
        if given:
            return given, False
        d = PLACEHOLDER_DATES.get(ref, IMPORT_DATE)
        return d, True

    L = []  # PL/pgSQL body lines
    add = L.append
    add(f"o := '{org}';")
    add("bank := mb_default_cash_account(o);")
    add("select id into w from people where organization_id = o and full_name = 'Wahid' and is_partner;")
    add("select id into b from people where organization_id = o and full_name = 'Belal' and is_partner;")
    add("insert into cash_accounts (organization_id, name, account_type) values (o, 'Pre-opening historical ledger (Glory settlement)', 'cash') returning id into hist;")

    # Master data -----------------------------------------------------------
    for c in wb["01_clients"]:
        add(f"insert into clients (organization_id, name, company_name, client_type, notes) values (o, {s(c['client_name'])}, {s(c.get('company_name'))}, {s(c.get('client_type') or 'company')}, {s(c.get('notes'))});")
    for x in wb["02_suppliers"]:
        add(f"insert into suppliers (organization_id, name, category, notes) values (o, {s(x['supplier_name'])}, {s(x.get('category'))}, {s(x.get('notes'))});")
    for p in wb["03_people"]:
        add(f"insert into people (organization_id, full_name, kind, job_title) values (o, {s(p['full_name'])}, {s(p['kind'])}, {s(p.get('job_title'))});")

    def person_expr(name):
        if name == "Wahid":
            return "w"
        if name == "Belal":
            return "b"
        if name in people_new:
            return f"(select id from people where organization_id = o and full_name = {s(name)})"
        issues.append(f"unknown person '{name}'")
        return "null"

    # Projects ------------------------------------------------------------------
    for ref, p in projects.items():
        if p.get("client_name") and p["client_name"] not in clients:
            issues.append(f"{ref}: client '{p['client_name']}' not in 01_clients")
        ptype = p["project_type"]
        text = (p.get("notes") or "").lower()
        marketing = num(p["contract_value"]) == 0 and "sponsorship" in text
        if marketing:
            ptype = "sponsorship"
        if ptype not in ("event", "one_time_service", "subscription", "recurring_contract", "product_sale", "sponsorship", "internal", "other"):
            notes.append(f"{ref}: project type '{ptype}' mapped to 'one_time_service'")
            ptype = "one_time_service"
        end = p.get("end_date") or p.get("start_date")
        due, flagged = pdate(ref, end)
        milestones = [{"label": "Contract", "trigger_kind": "completion", "due_date": due, "amount": num(p["contract_value"])}] if num(p["contract_value"]) > 0 else []
        if not p.get("start_date"):
            notes.append(f"{ref}: no start/end date in the sheet — project saved without dates")
        payload = {
            "name": p["project_name"], "project_type": ptype, "contract_value": num(p["contract_value"]),
            "currency": p.get("currency") or "EGP", "start_date": p.get("start_date"), "end_date": p.get("end_date"),
            "operational_status": p.get("operational_status") or "completed", "budget_amount": num(p.get("budget")) or None,
            "description": p.get("notes"), "is_marketing_investment": marketing, "service_ids": svc_ids(p.get("services"), ref),
            "milestones": milestones, "payment_structure": "none" if not milestones else "after_completion",
        }
        add(f"r := mb_create_project(o, {lit(payload)} || jsonb_build_object('client_id', (select id from clients where organization_id = o and name = {s(p.get('client_name'))})));")
        add(f"ids := ids || jsonb_build_object({s(ref)}, r->>'project_id');")
        if ref == GLORY["ref"]:
            add(f"update projects set is_historical_snapshot = true, historical_note = 'Settled before the 2026-05-23 opening balance. Confirmed profit 198,588: Wahid 45,000, Belal 45,000, Move Beyond retained 108,588 (opening bank). Legacy sheet items pending clarification: 3% withholding 11,970; taxes 49,000; 175,000 line labelled investment.' where id = (ids->>{s(ref)})::uuid;")

    P = lambda ref: f"(ids->>{s(ref)})::uuid"

    # Glory historical snapshot ----------------------------------------------------
    g = GLORY
    gd = g["date"]
    add(f"perform mb_record_collection({P(g['ref'])}, {g['revenue']}, '{gd}', hist, 'EGP', 1, 'Historical snapshot — Glory settlement', 'Pre-opening revenue; not replayed against the company bank');")
    add(f"perform mb_add_expense(o, {lit({'description': 'Maya attendance bonus — Glory in Giza', 'committed_amount': g['maya_bonus'], 'notes': 'Historical snapshot cost (pre-opening). Not a post-opening bank movement.', 'payment': {'amount': g['maya_bonus'], 'payer_type': 'company', 'date': gd}})} || jsonb_build_object('project_id', {P(g['ref'])}, 'category_id', {s(cat_id('Staffing', 'Freelancers', 'GIG'))}, 'payment', jsonb_build_object('amount', {g['maya_bonus']}, 'payer_type', 'company', 'cash_account_id', hist, 'date', '{gd}')));")
    other = g["cost_total"] - g["maya_bonus"]
    add(f"perform mb_add_expense(o, {lit({'description': 'Glory settled operating costs (historical snapshot)', 'committed_amount': other, 'notes': 'Confirmed historical cost basis 200,412 incl. Maya bonus. Legacy sheet lines (withholding, taxes, investment, salaries, partner withdrawals) are not replayed.'})} || jsonb_build_object('project_id', {P(g['ref'])}, 'category_id', {s(cat_id('Production', 'Event Production', 'GIG'))}, 'payment', jsonb_build_object('amount', {other}, 'payer_type', 'company', 'cash_account_id', hist, 'date', '{gd}')));")
    add(f"perform mb_confirm_settlement({P(g['ref'])}, jsonb_build_object('date', '{gd}', 'notes', 'Historical settlement', 'lines', jsonb_build_array(jsonb_build_object('line_type', 'company_funding', 'amount', {g['cost_total']}, 'label', 'Move Beyond funding recovered'))));")
    add(f"perform mb_distribute_profit({P(g['ref'])}, jsonb_build_object('date', '{gd}', 'pay_now', true, 'cash_account_id', hist, 'notes', 'Final Glory allocation (paid before opening)', 'lines', jsonb_build_array(jsonb_build_object('person_id', w, 'share_pct', 50, 'amount', {g['wahid']}), jsonb_build_object('person_id', b, 'share_pct', 50, 'amount', {g['belal']}))));")
    add(f"perform mb_record_company_retained({P(g['ref'])}, {g['retained']}, '{gd}', 'Retained by Move Beyond — becomes the post-Glory opening bank balance');")
    add(f"perform mb_cash_transfer(o, hist, bank, {g['retained']}, '{OPENING_DATE}', 'Opening balance: Glory retained share banked to Move Beyond');")

    # Technology ---------------------------------------------------------------------
    for t in wb["11_technology"]:
        cat = t.get("category")
        if cat not in techcats:
            notes.append(f"technology '{t['technology_name']}': category '{cat}' mapped to 'Registration System'")
            cat = "Registration System"
        payload = {"name": t["technology_name"], "agreed_value": num(t["agreed_value"]), "category_id": techcats[cat], "reusable": True,
                   "lifecycle_status": "completed", "description": t.get("description"), "completion_date": t.get("completion_date"),
                   "service_ids": svc_ids(t.get("services"), t["technology_name"])}
        add(f"r := mb_create_technology(o, {lit(payload)} || jsonb_build_object('developer_person_id', {person_expr(t.get('developer') or 'Wahid')}, 'original_project_id', {P(t['original_project_ref']) if t.get('original_project_ref') else 'null'}));")
        add(f"ids := ids || jsonb_build_object({s('tech:' + t['technology_name'])}, r->>'technology_id');")

    # Client payments -------------------------------------------------------------------
    for c in wb["07_client_payments"]:
        ref = c["project_ref"]
        d, flagged = pdate(ref, c.get("date"))
        who = c.get("received_by") or "Company Bank"
        acct = "bank" if who in ("Company Bank", "Move Beyond") else f"(select id from cash_accounts where person_id = {person_expr(who)})"
        note = (c.get("reference") or "") + (f" [Date not provided — accounting date {d} used; update when known]" if flagged else "")
        fn = "mb_record_refund" if (c.get("is_refund") or "N") == "Y" else "mb_record_collection"
        if fn == "mb_record_refund":
            add(f"perform mb_record_refund({P(ref)}, {num(c['amount'])}, '{d}', {acct}, {s(note)});")
        else:
            add(f"perform mb_record_collection({P(ref)}, {num(c['amount'])}, '{d}', {acct}, {s(c.get('currency') or 'EGP')}, {num(c.get('fx_rate')) or 1}, {s((c.get('reference') or '')[:120])}, {s(note)});")
        if flagged:
            notes.append(f"{ref}: client payment {num(c['amount']):,.0f} has no date — accounting date {d}")

    # Expenses (grouped by expense_ref) ----------------------------------------------------
    groups = {}
    for e in wb["08_expenses"]:
        groups.setdefault(e.get("expense_ref") or f"row{len(groups)}", []).append(e)
    for eref, rows in groups.items():
        first = rows[0]
        ref = first.get("project_ref") or None
        cid = cat_id(first.get("category"), first.get("subcategory"), eref)
        sup = first.get("supplier_name")
        etype = first.get("expense_type") or "normal"
        total = num(first["total_cost"])
        payload = {"description": first["description"], "committed_amount": total, "expense_type": etype, "currency": first.get("currency") or "EGP",
                   "category_id": cid, "notes": first.get("notes")}
        if etype == "owned_asset":
            ac = "Technical Equipment" if "Technical Equipment" in assetcats else None
            payload["asset"] = {"name": first.get("asset_name") or first["description"], "quantity": int(num(first.get("asset_quantity")) or 1),
                                "category_id": assetcats.get(ac)}
        add(f"r := mb_add_expense(o, {lit(payload)} || jsonb_build_object('project_id', {P(ref) if ref else 'null'}, 'supplier_id', (select id from suppliers where organization_id = o and name = {s(sup)})));")
        add("eid := (r->>'expense_id')::uuid;")
        for e in rows:
            amt = num(e["paid_amount"])
            if amt <= 0:
                continue
            d, flagged = pdate(ref or "", e.get("paid_date"))
            if flagged:
                notes.append(f"{eref}: no paid date — accounting date {d}")
                add(f"update expenses set notes = coalesce(notes || ' ', '') || '[Date not provided — accounting date {d} used; update from bank statement]' where id = eid;")
            payer = (e.get("paid_by") or "Move Beyond").strip()
            if payer in ("Move Beyond", "Company"):
                pay = f"jsonb_build_object('amount', {amt}, 'date', '{d}', 'payer_type', 'company', 'cash_account_id', bank)"
            elif payer in ("Wahid", "Belal"):
                reimb = "true" if (e.get("reimbursable") or "Y") == "Y" else "false"
                pay = f"jsonb_build_object('amount', {amt}, 'date', '{d}', 'payer_type', 'partner', 'person_id', {person_expr(payer)}, 'reimbursable', {reimb})"
            else:
                kind = people_new.get(payer, {}).get("kind", "employee")
                pt = "employee" if kind in ("employee", "freelancer") else "other_person"
                pay = f"jsonb_build_object('amount', {amt}, 'date', '{d}', 'payer_type', '{pt}', 'person_id', {person_expr(payer)})"
            add(f"perform mb_record_expense_payment(eid, {pay});")

    # CTO recoveries ---------------------------------------------------------------------------
    for c in wb["12_cto_recoveries"]:
        ref = c.get("project_ref")
        d, flagged = pdate(ref, c.get("date"))
        treat = "from_share" if (c.get("treatment") or "").strip() == "from_share" else "project_cost"
        add(f"perform mb_allocate_cto_recovery((ids->>{s('tech:' + c['technology_name'])})::uuid, {P(ref)}, {num(c['amount'])}, '{treat}', '{d}', {s(c.get('notes'))});")
        if flagged:
            notes.append(f"{ref}: CTO recovery {num(c['amount']):,.0f} has no date — accounting date {d}")

    # Payments to people ------------------------------------------------------------------------
    for pmt in wb["14_payments_to_people"]:
        ref = pmt.get("project_ref")
        d, flagged = pdate(ref or "", pmt.get("date"))
        who = pmt["person"]
        cat = (pmt.get("category") or "").lower().strip()
        is_partner = who in ("Wahid", "Belal")
        cat = {"reimbursement": "funding" if is_partner else "employee_reimbursement", "technology recovery": "cto", "cto": "cto",
               "fee": "fee", "profit": "profit", "funding": "funding", "carry_forward": "carry_forward"}.get(cat)
        if not cat:
            issues.append(f"payment to {who}: unknown category '{pmt.get('category')}'")
            continue
        src = pmt.get("paid_from") or "Company Bank"
        acct = "bank" if ("Move Beyond" in src or "Company" in src) else f"(select id from cash_accounts where person_id = {person_expr(src.replace('Held by', '').strip())})"
        ref_note = (pmt.get("reference") or "") + (f" [Date not provided — accounting date {d}]" if flagged else "")
        add(f"perform mb_pay_person(o, {person_expr(who)}, '{cat}', {P(ref) if ref else 'null'}, {num(pmt['amount'])}, '{d}', {acct}, null, {s(ref_note)});")
        if flagged:
            notes.append(f"payment {num(pmt['amount']):,.0f} to {who} ({ref}) has no date — accounting date {d}")

    # Close projects flagged Y ----------------------------------------------------------------------
    for ref, p in projects.items():
        if (p.get("financially_closed") or "N") == "Y":
            if ref != GLORY["ref"]:
                # Record that Move Beyond's own funding was recovered from project cash (memo, no bank movement)
                add(f"v := mb_company_funding_outstanding({P(ref)}); if v > 0 and not (select is_marketing_investment from projects where id = {P(ref)}) then "
                    f"perform mb_confirm_settlement({P(ref)}, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('line_type','company_funding','amount', v, 'label', 'Move Beyond funding recovered')))); end if;")
            add(f"r := mb_close_project({P(ref)}, '{{}}'::jsonb, null);")
            add(f"if not (r->>'closed')::boolean then raise exception 'Could not close {ref}: %', r->'issues'; end if;")

    # Deactivate the historical account and record today's statement
    add("update cash_accounts set active = false where id = hist;")
    add(f"perform mb_record_bank_statement(o, bank, '{IMPORT_DATE}', {EXPECTED_BANK_TODAY}, 'Confirmed actual bank balance at historical import');")

    # Validation tests (prompt §15) --------------------------------------------------------------------
    checks = [
        ("Badya final project profit = 0", "(mb_project_profit((ids->>'P-2026-BADYA')::uuid)->>'distributable_profit')::numeric", 0),
        ("Moharram final project profit = 0", "(mb_project_profit((ids->>'P-2026-MOH-TICK')::uuid)->>'distributable_profit')::numeric", 0),
        ("Katameya sponsorship cost = 21,600", "(mb_project_profit((ids->>'P-2026-KH-MS')::uuid)->>'direct_cost')::numeric", 21600),
        ("Sahel sponsorship cost = 14,000", "(select sum((mb_project_profit(x::uuid)->>'direct_cost')::numeric) from unnest(array[ids->>'P-2026-SWAN', ids->>'P-2026-BADM', ids->>'P-2026-PEPSI']) x)", 14000),
        ("Maya salary May–Aug = 28,000", "(select coalesce(sum(committed_egp),0) from v_expense_balances where organization_id = o and description like 'Maya — Media Designer salary%')", 28000),
        ("Software subscriptions = 7,988", "(select coalesce(sum(committed_egp),0) from v_expense_balances where organization_id = o and supplier_id in (select id from suppliers where organization_id = o and name in ('OpenAI','Anthropic')))", 7988),
        ("Opening bank on 2026-05-23 = 108,588", f"(select coalesce(sum(l.amount),0) from journal_lines l join journal_entries e on e.id = l.entry_id where l.cash_account_id = bank and l.account_code = 'CASH' and e.entry_date <= '{OPENING_DATE}')", 108588),
        ("Post-opening company-funded spending = 79,588", f"(select coalesce(-sum(l.amount),0) from journal_lines l join journal_entries e on e.id = l.entry_id where l.cash_account_id = bank and l.account_code = 'CASH' and e.entry_date > '{OPENING_DATE}' and e.source_type = 'expense_payment' and (l.project_id is null or l.project_id not in ((ids->>'P-2026-BADYA')::uuid)))", 79588),
        ("Current bank = 29,000", "(select balance from v_cash_account_balances where id = bank)", 29000),
        ("Reconciliation difference = 0", "(select difference from v_bank_reconciliation where cash_account_id = bank)", 0),
        ("Glory historical profit = 198,588", "(mb_project_profit((ids->>'P-2026-GIG')::uuid)->>'distributable_profit')::numeric", 198588),
        ("Glory: Wahid 45,000 + Belal 45,000 distributed", "(mb_project_profit((ids->>'P-2026-GIG')::uuid)->>'distributed')::numeric", 90000),
        ("Glory: 108,588 retained by Move Beyond", "(select sum(retained_by_company) from profit_distributions where project_id = (ids->>'P-2026-GIG')::uuid and deleted_at is null)", 108588),
        ("Historical ledger nets to zero", "(select balance from v_cash_account_balances where id = hist)", 0),
        ("Nothing owed to Wahid", "(select funding_due + fee_due + cto_due + profit_due + carry_due from v_person_balances where person_id = w)", 0),
        ("Nothing owed to Belal", "(select funding_due + fee_due + cto_due + profit_due + carry_due from v_person_balances where person_id = b)", 0),
        ("Move Tick QR App fully recovered (9,000)", "(select recovered from v_technology_recovery where organization_id = o and name = 'Move Tick Free QR App')", 9000),
        ("Power banks registered once as an asset", "(select count(*) from assets where organization_id = o and deleted_at is null)", 1),
        ("No partner loss allocations", "(select count(*) from loss_allocations where organization_id = o)", 0),
        ("Glory Maya bonus recorded once (4,000)", "(select count(*) from expenses where organization_id = o and description like 'Maya attendance bonus — Glory%')", 1),
        ("All 7 projects financially closed", "(select count(*) from projects where organization_id = o and financial_status = 'financially_closed')", 7),
    ]
    add("-- validation")
    for label, expr, expected in checks:
        add(f"v := {expr}; if coalesce(v, -999999) <> {expected} then raise exception 'VALIDATION FAILED: {label} — got %', v; end if; raise notice 'PASS  {label}';")
    add("perform mb_refresh_alerts(o);")

    if issues:
        print("Blocking issues:\n  - " + "\n  - ".join(issues))
        raise SystemExit(1)

    body = "\n  ".join(L)
    sql = f"""
begin;
set client_min_messages = notice;
do $$
declare o uuid; bank uuid; hist uuid; w uuid; b uuid; r jsonb; eid uuid; v numeric; ids jsonb := '{{}}'::jsonb;
begin
  {body}
end $$;
{'commit;' if commit else 'rollback;'}
"""
    os.makedirs("import/data", exist_ok=True)
    with open("import/data/last_import.sql", "w") as fh:
        fh.write(sql)
    code, out, err = psql(sql, single=False)
    passes = [l.split("NOTICE:  ")[-1] for l in err.splitlines() if "PASS" in l]
    for line in passes:
        print("  ✓", line.replace("PASS  ", ""))
    if code:
        print("\nIMPORT FAILED — nothing was written:\n", "\n".join(l for l in err.splitlines() if "PASS" not in l)[-3000:])
        raise SystemExit(1)
    print(f"\n{len(passes)} validation checks passed.")
    if notes:
        print("\nNotes / assumptions:\n  - " + "\n  - ".join(dict.fromkeys(notes)))
    print("\nCOMMITTED to the live organization." if commit else "\nDRY RUN — rolled back, nothing written. Re-run with --commit.")


if __name__ == "__main__":
    main()
