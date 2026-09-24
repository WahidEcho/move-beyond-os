# Locked Decisions — Move Beyond Company OS V1

These decisions were resolved with Wahid on 2026-09-25 before implementation.
They are **not re-opened** by downstream work. Changing one requires editing this
file with a dated entry explaining why.

## Business decisions (resolved with Wahid)

| # | Topic | Ruling |
|---|---|---|
| D1 | Revenue recognition | **Cash basis.** Recognized revenue = money collected. Forecast revenue = current contract value (original + change orders − discounts/credits). Invoiced / outstanding / overdue are tracked on billing milestones for collections, not in the ledger. |
| D2 | Cash routing | **Bidirectional partner ledger.** Every collection and company payment records where the money sits: Company Bank, or *Held by partner X*. Money a partner holds for the company = partner owes company. Partner pages show *Due to partner*, *Held by partner* and the net. Partner-to-partner settlements are first-class. |
| D3 | Fee & CTO economics | **Chosen per item at settlement.** Each partner fee and CTO recovery allocation has a `treatment`: `project_cost` (default — off the top before the profit split) or `from_share` (carved out of the beneficiary's own profit share at distribution). The settlement screen shows the effect on each partner before confirming. |
| D4 | Overhead & reserve | **Separate company P&L.** Expenses without a project are company overhead. Company Net Profit = Σ project results − overhead. **Available Reserve = company cash − unpaid supplier commitments − employee dues − net partner dues.** Target default 100,000 EGP. |
| D5 | Loss handling | **Netted.** A partner's allocated share of a project loss posts a negative carry-forward on their account, deducted from future payouts. No cash call. The company's share stays as a negative company result. |
| D6 | CTO value approval | **No second-partner gate.** Either partner can set/extend the Agreed Recoverable Development Value. The audit log records who did it. Approval engine stays OFF. |
| D7 | Database | Dedicated Supabase project `jawwzgjeroupovzskyrr` (eu-west-1), created by Wahid. |
| D8 | Move IT subscriptions | **Manual in V1.** `subscriptions.external_source` / `external_id` reserved for a later sync. |
| D9 | Notifications | **In-app + email (Resend).** Channel-adapter design. Email is inactive until a Resend key and a verified mbeg.org sender exist. |
| D10 | Timeline | ~4 weeks to live use (go-live week of 2026-10-19). Go-live scope: foundation, master data, projects, finance core, partner finance + settlement, CTO recovery, Finance Home + alerts. After go-live: subscription KPIs, asset & inventory UI, budgets, cash-flow forecast, PDFs, historical import. |
| D11 | Repo shape | Single Next.js app with modular folders under `src/`. No monorepo. |
| D12 | Visual identity | Light, neutral enterprise theme. **No brand colours in the UI.** Brand appears only as the logo and on PDF letterheads. |

## Engineering rulings (made during design, low risk, reversible)

| # | Topic | Ruling |
|---|---|---|
| E1 | Partner-paid expense | When a partner pays a project cost personally, it is recorded as **project funding by that partner** (category `funding`). "Expense reimbursement" is reserved for employees/non-partners. This matches spec §24–25 and §58, where partner-paid costs appear as funding due. |
| E2 | Non-reimbursable partner payment | Recorded as a partner capital contribution (equity). Nothing becomes due. |
| E3 | Move Beyond funding | Company-paid project costs are Move Beyond funding for that project. "Recovering" it is a settlement memo with no cash movement (same bank account), shown so the project picture is complete. |
| E4 | Actual cost | Actual cost = cost actually paid by anyone (company, partner or employee). Unpaid commitments are not actual cost; they feed forecasts, supplier outstanding and the reserve. |
| E5 | Owned assets | By default an asset purchase is a cost of the project that bought it, and the asset is registered. A per-expense `capitalize` flag instead books it as a company fixed asset outside project cost. Reuse on later projects costs 0 unless an internal cost is entered. |
| E6 | FX | Rate is locked at record time. No revaluation, no FX gain/loss in V1. Ledger amounts are EGP. |
| E7 | Payment allocation | Collections are allocated to milestones oldest-due first, with manual override. |
| E8 | Bank reconciliation | No bank feed. A **bank adjustment** entry corrects the system balance to the real statement. |
| E9 | Opening balances | Go-live starts from dated opening entries (bank, partner balances, CTO outstanding on existing platforms, open receivables/payables) posted against Opening Equity. Historical import builds on this later. |
| E10 | Posted records | Posted financial records are never edited in place. Edit = reverse + repost with a mandatory reason. Delete = reversal + soft delete with a mandatory reason. |
| E11 | Writes | Financial tables have no direct insert/update from the browser. All money mutations go through `SECURITY DEFINER` Postgres functions (`mb_*`) that check permissions, write domain rows and balanced journal entries atomically, and honour an idempotency key. |
| E12 | Table naming | Spec §126 names are kept except where merged: `change_orders` + `credit_notes` → `contract_adjustments` (typed); `funding_repayments` + partner/employee payouts → `payouts` (typed by category). |
| E13 | People | `people` holds partners, employees, freelancers and external funders. Partners are people with `is_partner = true` and a `profit_share_pct`. CTO eligibility is `technology_recovery_eligible = true`, never a name check. |
| E14 | Auth | Supabase email + password, invite-only. No public sign-up. |
| E15 | Scope | English only, Africa/Cairo timezone, calendar fiscal year, tax OFF. Out of V1: depreciation, bank feeds, multi-org UI, project-manager UI (policies exist), Arabic, mobile app, client-facing invoices. |
