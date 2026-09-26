# Historical data import — template guide

Fill the sheets in `import/Move_Beyond_Historical_Import.xlsx` (dropdowns + comments) or the matching CSVs in `import/templates/`.

**HOW IT WORKS**
1. Fill one sheet per record type. Required sheets: 00, 01, 04, 07, 08. The rest only if you have that kind of data.
2. Every project gets a project_ref (your own short key, e.g. P-2025-01). All other sheets link to projects with it.
3. Names must match exactly across sheets (client_name, supplier_name, person names). Wahid and Belal already exist.
4. Dates are YYYY-MM-DD. Amounts are plain numbers: 150000 not 150,000 EGP. Default currency EGP.
5. Delete the grey example rows before sending. Export each sheet as CSV, or send this .xlsx as is.
6. Everything is replayed through the same rules as live entry, so funding, reimbursements, partner balances,
   CTO outstanding and project profit are calculated automatically — don't enter them twice.

**THE GOLDEN RULES (avoid double counting)**
• A partner paying a supplier = one row in 08_expenses with paid_by = Wahid/Belal. It automatically becomes funding owed to him.
• 09_funding is ONLY for cash a partner put into the company account — not for expenses he paid directly.
• 14_payments_to_people is money actually handed back / paid out. Anything owed but never paid stays outstanding.
• Client money received by a partner personally: 07_client_payments received_by = Wahid/Belal. It shows as money he holds.
• If a partner kept that money as his repayment/profit, record it in 14 with paid_from = Held by <him>.
• contract_value in 04 is the ORIGINAL contract; extras and discounts go in 06_contract_changes.
• 00_start_balances: bank_opening = bank balance the day BEFORE your first record. bank_today = real balance now (check only).
  owed_to_person / held_by_partner are only for old balances that the project sheets don't explain.

**WHAT HAPPENS AFTER YOU SEND IT**
1. A dry run checks every row (missing names, bad dates, overpayments, CTO above agreed value) and sends you a list of issues.
2. After fixes, the import runs once in a single transaction — all or nothing — into the real Move Beyond organization.
3. A reconciliation report compares the system bank balance to bank_today and shows each partner's balance for you to confirm.
4. Projects marked financially_closed = Y are locked at the end.

## Sheets and columns

### `00_start_balances.csv` — Start balances (required)

Where the books start. Only for balances NOT explained by the projects you import.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `item` | ✓ | What this row is Allowed: `bank_opening`, `bank_today`, `owed_to_person`, `owed_by_person`, `held_by_partner` |
| `person` |  | Wahid, Belal or a name from 03_people (blank for bank rows) |
| `amount` | ✓ | EGP, no commas |
| `date` | ✓ | YYYY-MM-DD |
| `notes` |  | Anything useful |

### `01_clients.csv` — Clients (required)

Every client that appears in a project.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `client_name` | ✓ | Unique name used in 04_projects |
| `company_name` |  | Legal / full name |
| `client_type` |  | Type Allowed: `company`, `club`, `academy`, `federation`, `brand`, `agency`, `government`, `individual`, `other` |
| `phone` |  |  |
| `email` |  |  |
| `notes` |  |  |

### `02_suppliers.csv` — Suppliers (optional)

Suppliers used in 08_expenses (optional — expenses can have no supplier).

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `supplier_name` | ✓ | Unique name used in 08_expenses |
| `category` |  | Free text e.g. Production, Rentals |
| `phone` |  |  |
| `email` |  |  |
| `bank_details` |  |  |
| `notes` |  |  |

### `03_people.csv` — People (optional)

Employees, freelancers and outside funders who paid or received money. Wahid and Belal already exist — do not add them.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `full_name` | ✓ | Unique name used in other sheets |
| `kind` | ✓ | Kind Allowed: `employee`, `freelancer`, `external`, `other` |
| `job_title` |  |  |
| `phone` |  |  |
| `email` |  |  |

### `04_projects.csv` — Projects (required)

One row per project. project_ref is your own short unique key (e.g. old code) used to link every other sheet.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `project_ref` | ✓ | Your unique key, e.g. P-2025-01 |
| `project_name` | ✓ |  |
| `client_name` |  | Must exist in 01_clients (blank = internal) |
| `project_type` | ✓ | Type Allowed: `event`, `one_time_service`, `subscription`, `recurring_contract`, `product_sale`, `sponsorship`, `internal`, `other` |
| `services` |  | One or more service names separated by ; |
| `start_date` | ✓ | YYYY-MM-DD |
| `end_date` |  | YYYY-MM-DD |
| `contract_value` | ✓ | ORIGINAL agreed value (changes go in 06). 0 for sponsorship |
| `currency` |  | Default EGP Allowed: `EGP`, `USD`, `EUR`, `AED`, `SAR` |
| `fx_rate` |  | Rate to EGP if not EGP |
| `operational_status` | ✓ | Status Allowed: `lead`, `confirmed`, `preparation`, `live`, `completed`, `cancelled` |
| `budget` |  | Expected total cost |
| `project_manager` |  | Wahid, Belal or a name from 03_people |
| `lead_generator` |  | Wahid or Belal |
| `financially_closed` | ✓ | Y = fully settled, lock it after import Allowed: `Y`, `N` |
| `notes` |  |  |

### `05_payment_schedule.csv` — Payment schedule (optional)

What the client had to pay and when. If a project has no rows here, one milestone = contract value due on end date.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `project_ref` | ✓ | From 04_projects |
| `label` | ✓ | e.g. Signing, Final |
| `due_date` | ✓ | YYYY-MM-DD |
| `amount` | ✓ | In the project currency |

### `06_contract_changes.csv` — Contract changes (optional)

Change orders, discounts, credit notes after the original contract.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `project_ref` | ✓ | From 04_projects |
| `date` | ✓ | YYYY-MM-DD |
| `change_type` | ✓ | Type Allowed: `change_order`, `increase`, `discount`, `tier_downgrade`, `credit_note`, `reduction`, `compensation`, `cancellation` |
| `amount` | ✓ | Positive number; the type decides + or − |
| `description` | ✓ |  |

### `07_client_payments.csv` — Client payments (required)

Every payment received from clients (and refunds).

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `project_ref` | ✓ | From 04_projects |
| `date` | ✓ | YYYY-MM-DD |
| `amount` | ✓ | Positive number |
| `currency` |  | Default EGP Allowed: `EGP`, `USD`, `EUR`, `AED`, `SAR` |
| `fx_rate` |  |  |
| `received_by` | ✓ | Where the money went Allowed: `Company Bank`, `Wahid`, `Belal` |
| `reference` |  | Transfer / cheque no. |
| `is_refund` |  | Y if money went back to the client Allowed: `Y`, `N` |

### `08_expenses.csv` — Expenses (required)

One row per PAYMENT. Rows with the same expense_ref are one expense paid in parts / by different people. Leave project_ref blank for company overhead. Unpaid commitments: paid_amount 0.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `expense_ref` |  | Group payments of the same cost (e.g. E-001) |
| `project_ref` |  | From 04_projects; blank = company overhead |
| `description` | ✓ |  |
| `category` |  | Main category Allowed: `Staffing`, `Creative`, `Development`, `Production`, `Rentals`, `Logistics`, `Assets`, `Marketing`, `Partner / Commercial Fees`, `Company Overhead` |
| `subcategory` |  | Sub-category (see guide) |
| `supplier_name` |  | From 02_suppliers |
| `expense_type` |  | Default normal Allowed: `normal`, `rental`, `owned_asset` |
| `total_cost` | ✓ | Full agreed cost (same on every row of one expense_ref) |
| `paid_amount` | ✓ | Paid in THIS row (0 if still unpaid) |
| `paid_by` |  | Company, Wahid, Belal, or a name from 03_people |
| `paid_from` |  | For Company payments only Allowed: `Company Bank`, `Held by Wahid`, `Held by Belal` |
| `reimbursable` |  | Partner payments: Y = company owes it back Allowed: `Y`, `N` |
| `paid_date` |  | YYYY-MM-DD (required if paid_amount > 0) |
| `supplier_due_date` |  | When unpaid balance is due |
| `currency` |  | Default EGP Allowed: `EGP`, `USD`, `EUR`, `AED`, `SAR` |
| `fx_rate` |  |  |
| `asset_name` |  | For owned_asset |
| `asset_quantity` |  | For owned_asset |
| `notes` |  |  |

### `09_funding.csv` — Cash funding (optional)

Cash a partner/funder PUT INTO the company for a project. (Partner-paid expenses already count as funding — don't repeat them here.)

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `project_ref` | ✓ | From 04_projects |
| `date` | ✓ | YYYY-MM-DD |
| `funded_by` | ✓ | Wahid, Belal or a name from 03_people |
| `amount` | ✓ |  |
| `received_into` |  | Default Company Bank Allowed: `Company Bank` |
| `notes` |  |  |

### `10_partner_fees.csv` — Partner fees (optional)

Management / lead / commission fees agreed on a project.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `project_ref` | ✓ | From 04_projects |
| `partner` | ✓ | Wahid or Belal Allowed: `Wahid`, `Belal` |
| `fee_type` | ✓ | Type Allowed: `management`, `lead_generation`, `sales_commission`, `project`, `consulting`, `custom` |
| `amount` | ✓ | EGP |
| `treatment` |  | Default project_cost Allowed: `project_cost`, `from_share` |
| `notes` |  |  |

### `11_technology.csv` — CTO technology (optional)

Reusable systems Wahid developed, with the agreed recoverable development value.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `technology_name` | ✓ | Unique name used in 12 |
| `developer` | ✓ | Default Wahid Allowed: `Wahid` |
| `category` |  | Category Allowed: `Tournament Platform`, `Scoring System`, `Registration System`, `Draw System`, `Dashboard`, `Mobile App`, `Web Application`, `Internal Tool`, `API`, `Automation`, `Other` |
| `original_project_ref` |  | Where it was built |
| `agreed_value` | ✓ | Agreed recoverable development value (EGP) |
| `completion_date` |  | YYYY-MM-DD |
| `services` |  | Service names separated by ; |
| `description` |  |  |

### `12_cto_recoveries.csv` — CTO recoveries (optional)

Amounts recovered toward a technology from projects that used it. Recovered before any project in these sheets? leave project_ref blank.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `technology_name` | ✓ | From 11_technology |
| `project_ref` |  | From 04_projects; blank = before this history |
| `date` | ✓ | YYYY-MM-DD |
| `amount` | ✓ | EGP |
| `treatment` |  | Default project_cost Allowed: `project_cost`, `from_share` |
| `notes` |  |  |

### `13_profit_distributions.csv` — Profit distributions (optional)

Profit declared per partner per project (the entitlement), incl. any part left in the company.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `project_ref` | ✓ | From 04_projects |
| `date` | ✓ | YYYY-MM-DD |
| `partner` | ✓ | Wahid or Belal Allowed: `Wahid`, `Belal` |
| `amount` | ✓ | Entitlement from this project |
| `reinvested` |  | Part left in the company (reserve contribution) |
| `notes` |  |  |

### `14_payments_to_people.csv` — Payments to people (optional)

Money actually handed to a person against what was owed (repayments, fees, CTO, profit, reimbursements).

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `date` | ✓ | YYYY-MM-DD |
| `person` | ✓ | Wahid, Belal or a name from 03_people |
| `category` | ✓ | What it pays off Allowed: `funding`, `reimbursement`, `fee`, `cto`, `profit`, `carry_forward` |
| `project_ref` |  | From 04_projects (blank if not project-specific) |
| `amount` | ✓ | EGP |
| `paid_from` |  | Default Company Bank Allowed: `Company Bank`, `Held by Wahid`, `Held by Belal` |
| `reference` |  |  |

### `15_assets.csv` — Assets owned (optional)

Equipment owned BEFORE this history, or not bought through 08_expenses (otherwise use expense_type owned_asset).

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `asset_name` | ✓ |  |
| `category` |  | Category Allowed: `VR Equipment`, `Gaming Consoles`, `TVs & Screens`, `Computers & Laptops`, `Tablets`, `Furniture`, `Technical Equipment`, `Office Equipment`, `Other` |
| `quantity` | ✓ |  |
| `purchase_value` | ✓ | Total EGP |
| `purchase_date` |  | YYYY-MM-DD |
| `supplier_name` |  |  |
| `serial_number` |  |  |
| `location` |  |  |
| `condition` |  | Default good Allowed: `new`, `good`, `fair`, `needs_repair`, `retired` |
| `notes` |  |  |

### `16_loss_allocations.csv` — Loss allocations (optional)

Only for projects that lost money: who absorbed how much. Partner shares are netted against future payouts.

| Column | Required | Meaning / allowed values |
|---|:-:|---|
| `project_ref` | ✓ | From 04_projects |
| `absorbed_by` | ✓ | Wahid, Belal or Move Beyond Allowed: `Wahid`, `Belal`, `Move Beyond` |
| `amount` | ✓ | EGP |
| `notes` |  |  |

## Expense categories (category › subcategory)

- **Staffing** › Ushers, Coordinators, Event Managers, Operations Supervisors, Operators, Freelancers, Temporary Staff
- **Creative** › Graphic Design, Photography, Videography, Animation, Content
- **Development** › Developers, Software Development, Hosting, Cloud, Technical Services
- **Production** › Printing, Branding, Structures, Screens, Sound, Lighting, Fabrication, Event Production
- **Rentals** › VR, PS5, TV, Gaming Laptop, Tablet, Furniture, Bean Bags, Other Equipment
- **Logistics** › Transportation, Delivery, Setup, Accommodation, Meals, Travel
- **Assets** › Computers, TVs, VR Equipment, Gaming Equipment, Office Equipment, Technical Equipment
- **Marketing** › Sponsorship, Advertising, Promotion, Campaigns
- **Partner / Commercial Fees** › Management Fee, Lead Generation, Sales Commission, Project Fee, Consulting Fee, Custom Fee
- **Company Overhead** › Office, Salaries, Software, Hosting, Marketing, Transportation, Legal, Accounting, Bank Fees, General Operations

## Services (use the service name in `04_projects.services`)

- **Move IT**: Move IT Platform Subscription, Setup Fee, Additional Branch, Add-on Module
- **Move Tick**: Online Registration, Tournament Registration, Digital Ticketing, QR Check-in & Validation, Accreditation & Access Management, Participant Database & Reporting
- **Move VR**: VR Stations, AR Activation, Camera Motion-Tracking Experience, Custom Branded VR/AR Game, Gaming Stations (PS5), Interactive Fan Engagement
- **Move Pro**: Custom Sports Software, Tournament Management Platform, Draw System, Scoring System, Live Scoreboard / Leaderboard, LED / TV Display System, Custom Event Website, Mobile Application, Web Application
- **Event Management**: Sports Tournament, Corporate Sports Day, Corporate Fun Day, Padel Tournament, Football Tournament, Tennis Tournament, Fan Zone, Brand Activation, Event Operations, Staffing & Logistics
- **Event Technology**: Live Scoring, LED Scoreboards, Competition Screens, Draw System, Tournament Website, Event Control Software, Real-time Competition Data
- **Interactive Entertainment**: PS5 Tournament, VR Tournament, Beat Saber, Gaming Zone, Chess, Family Entertainment
- **Rental**: VR Headset Rental, VR Station Rental, PS5 Rental, TV Rental, Gaming Laptop Rental, Tablet Rental, Bean Bag Rental, Technical Equipment Rental
- **Sponsorship**: Event Sponsorship, Marketing Investment, Activation Rights
- **Consulting**: Sports Consulting, Technical Consulting, Event Consulting, Project Management, Technology Advisory, Operations Consulting
- **Other / Custom**: Custom Service

New categories or services? Add them in Settings first, or just write them — the dry run will list unknown names.
