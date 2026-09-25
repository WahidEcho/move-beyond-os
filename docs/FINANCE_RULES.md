# Finance Rules, Formulas & Statuses

Every formula lives in exactly one place. The **Where** column says which.

## 1. Calculation formulas

| Figure | Formula | Where |
|---|---|---|
| Contract value | original × rate + Σ live adjustments × rate | `mb_project_contract_value` |
| Collected / recognised revenue | −Σ REVENUE lines (cash basis, D1) | `v_project_financials.collected` |
| Outstanding / overdue | Σ milestone (amount − allocated collections) | `v_receivables` |
| Actual cost | Σ DIRECT_COST lines (paid by anyone, E4) | view |
| Committed cost | Σ max(committed, paid); cancelled lines keep only paid | `v_expense_balances` |
| Remaining commitments | Σ max(committed − paid, 0), cancelled = 0 | `v_expense_balances` |
| Gross project profit | collected − actual cost | `computeProjectMetrics` |
| Remaining project margin | gross − fees (project cost) − CTO recovery (project cost) | `computeProjectMetrics` / `mb_project_profit` |
| Undistributed profit | remaining margin − Σ DISTRIBUTIONS | same |
| Forecast profit | max(contract, collected) − (actual + remaining commitments + uncommitted estimates) − fees (accepted + suggested) − CTO (allocated + planned) | `computeProjectMetrics` |
| Settlement cash | project cash position + Move Beyond funding outstanding | `computeProjectMetrics` |
| Move Beyond funding outstanding | Σ company-paid funding − Σ `company_recovery` memos | `mb_company_funding_outstanding` |
| Partner total currently due | funding + fees + CTO due + profit + carry (+ employee) | `buildPartnerAccount` |
| Total incl. CTO claim | total due + unrecovered CTO development value | `buildPartnerAccount` |
| Available reserve (D4) | company cash − unpaid suppliers − employee dues − max(partner dues − held by partners, 0) | `v_company_position.available_reserve` |
| MRR / ARR | active cycle total × rate ÷ cycle months (× 12) | `v_subscription_metrics` |
| Funding gap (§96) | max(required out − expected in, 0) per horizon | `forecastCash` |
| CTO outstanding | Σ value adjustments − Σ live allocations | `mb_technology_outstanding` |

## 2. Settlement rules (spec §60, §74–77)

Default order — the engine walks it and fills each line up to the cash left:

1. Supplier obligations
2. Employee reimbursements
3. Partner funding reimbursements
4. Recover Move Beyond funding (memo)
5. Partner / commercial fees (accepted dues, then suggestions)
6. CTO development recovery (existing dues, then technologies in use)
7. Remaining profit
8. Company reserve recommendation = min(reserve shortfall, remaining profit)
9. Profit distribution = min(remaining profit − reserve, cash left), split so each
   partner ends at their share % of everything distributed on the project

* Users can untick, edit, or pay partially. All selected lines are one
  transaction (`mb_confirm_settlement`) — all or nothing.
* CTO suggestion = min(outstanding, planned amount if set, profit headroom, cash).
* Distributing while obligations remain → warning *“X EGP of project
  obligations remain unpaid”* with **Review obligations / Continue anyway**.
  Never a hard block; the unpaid amount is stored on the distribution.
* Distribution cannot exceed undistributed profit (hard rule).
* A loss (negative remaining margin) is allocated instead: partner shares post
  as negative carry-forward (netted, D5); the rest is absorbed by Move Beyond.

## 3. CTO recovery rules (spec §52–56, §131)

* Recovery is an **exact amount**, never forced as a percentage.
* `amount ≤ outstanding` — enforced in the database under a row lock.
* Fully recovered systems cannot be claimed again.
* Additional scope = extension adjustment with a reason; history is kept.
  Reductions can't go below what was already recovered.
* Reversal restores the outstanding value; blocked if the recovery was paid
  (reverse the payment first).
* Treatment per allocation: `project_cost` (default, shown separately in project
  profitability) or `from_share` (part of the developer's own profit share).
* Opening recoveries (before go-live) are recorded on the technology with no project.

## 4. Status definitions

**Operational:** lead → confirmed → preparation → live → completed / cancelled.
**Financial:** draft · funding_required · active · awaiting_collection
(completed, money outstanding) · settlement_required (completed, money in) ·
partially_settled (a settlement or distribution happened) · financially_closed
(no postings allowed; reopen needs a reason).
**Expense:** estimated · committed · partially_paid · paid · cancelled (derived).
**Technology lifecycle:** planned · in_development · completed · cancelled · archived.
**Recovery:** recovery_pending · partially_recovered · fully_recovered (derived).
**Fee:** suggested · accepted · ignored · reversed.
**Subscription:** trial · active · paused · cancelled · expired.

## 5. Notification rules (spec §35, §80)

Daily (pg_cron 05:15 UTC + `/api/cron/alerts`) and on every Finance Home / Alerts load:

| Alert | Priority |
|---|---|
| Reserve below target | critical |
| Cash required in next 30 days exceeds company cash | critical |
| Collection overdue > 30 days | critical |
| Collection overdue / due ≤ 3 days | high |
| Collection due within reminder window (default 14/7/3/0 days, per-contract override) | normal |
| Project completed but financially unsettled | high |
| Supplier payment overdue | high |
| Forecast cost exceeds budget | high |
| Project using technology with unrecovered value is ready for settlement | high |
| Subscription renewal within 14 days / trial ending within 7 | normal |
| Partner reimbursement outstanding | normal |
| Technology has unrecovered CTO value | low |

Alerts are deduplicated, resolve automatically when the condition clears, and can
be dismissed per user. Critical/high alerts are emailed once to partners (Resend).

## 6. Seed catalogs

Service master (§8–18), expense categories (§37), technology categories (§46),
asset categories and fee presets are created by `mb_bootstrap_organization` —
see `supabase/migrations/0012_reference_security.sql`. All are editable in Settings.
