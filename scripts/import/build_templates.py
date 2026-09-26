"""
Builds the historical-data import templates:
  import/templates/*.csv                      one file per record type
  import/Move_Beyond_Historical_Import.xlsx   same sheets, with dropdowns + a guide sheet

Run:  python3 scripts/import/build_templates.py
The example rows tell one small consistent story so the links between files are clear.
Delete the example rows before filling in real data.
"""
import csv
import os
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "import")
CSV_DIR = os.path.join(ROOT, "templates")

# ---------------------------------------------------------------------------
# Allowed values (must match the database catalogs; editable later in Settings)
# ---------------------------------------------------------------------------
YN = ["Y", "N"]
PROJECT_TYPES = ["event", "one_time_service", "subscription", "recurring_contract", "product_sale", "sponsorship", "internal", "other"]
OP_STATUS = ["lead", "confirmed", "preparation", "live", "completed", "cancelled"]
CLIENT_TYPES = ["company", "club", "academy", "federation", "brand", "agency", "government", "individual", "other"]
PEOPLE_KINDS = ["employee", "freelancer", "external", "other"]
CURRENCIES = ["EGP", "USD", "EUR", "AED", "SAR"]
EXPENSE_TYPES = ["normal", "rental", "owned_asset"]
RECEIVED_BY = ["Company Bank", "Wahid", "Belal"]
CHANGE_TYPES = ["change_order", "increase", "discount", "tier_downgrade", "credit_note", "reduction", "compensation", "cancellation"]
FEE_TYPES = ["management", "lead_generation", "sales_commission", "project", "consulting", "custom"]
TREATMENTS = ["project_cost", "from_share"]
PAYOUT_CATS = ["funding", "reimbursement", "fee", "cto", "profit", "carry_forward"]
PAID_FROM = ["Company Bank", "Held by Wahid", "Held by Belal"]
START_ITEMS = ["bank_opening", "bank_today", "owed_to_person", "owed_by_person", "held_by_partner"]
CONDITIONS = ["new", "good", "fair", "needs_repair", "retired"]
TECH_CATEGORIES = ["Tournament Platform", "Scoring System", "Registration System", "Draw System", "Dashboard", "Mobile App",
                   "Web Application", "Internal Tool", "API", "Automation", "Other"]
ASSET_CATEGORIES = ["VR Equipment", "Gaming Consoles", "TVs & Screens", "Computers & Laptops", "Tablets", "Furniture",
                    "Technical Equipment", "Office Equipment", "Other"]
EXPENSE_CATEGORIES = {
    "Staffing": ["Ushers", "Coordinators", "Event Managers", "Operations Supervisors", "Operators", "Freelancers", "Temporary Staff"],
    "Creative": ["Graphic Design", "Photography", "Videography", "Animation", "Content"],
    "Development": ["Developers", "Software Development", "Hosting", "Cloud", "Technical Services"],
    "Production": ["Printing", "Branding", "Structures", "Screens", "Sound", "Lighting", "Fabrication", "Event Production"],
    "Rentals": ["VR", "PS5", "TV", "Gaming Laptop", "Tablet", "Furniture", "Bean Bags", "Other Equipment"],
    "Logistics": ["Transportation", "Delivery", "Setup", "Accommodation", "Meals", "Travel"],
    "Assets": ["Computers", "TVs", "VR Equipment", "Gaming Equipment", "Office Equipment", "Technical Equipment"],
    "Marketing": ["Sponsorship", "Advertising", "Promotion", "Campaigns"],
    "Partner / Commercial Fees": ["Management Fee", "Lead Generation", "Sales Commission", "Project Fee", "Consulting Fee", "Custom Fee"],
    "Company Overhead": ["Office", "Salaries", "Software", "Hosting", "Marketing", "Transportation", "Legal", "Accounting", "Bank Fees", "General Operations"],
}
SERVICES = {
    "Move IT": ["Move IT Platform Subscription", "Setup Fee", "Additional Branch", "Add-on Module"],
    "Move Tick": ["Online Registration", "Tournament Registration", "Digital Ticketing", "QR Check-in & Validation", "Accreditation & Access Management", "Participant Database & Reporting"],
    "Move VR": ["VR Stations", "AR Activation", "Camera Motion-Tracking Experience", "Custom Branded VR/AR Game", "Gaming Stations (PS5)", "Interactive Fan Engagement"],
    "Move Pro": ["Custom Sports Software", "Tournament Management Platform", "Draw System", "Scoring System", "Live Scoreboard / Leaderboard", "LED / TV Display System", "Custom Event Website", "Mobile Application", "Web Application"],
    "Event Management": ["Sports Tournament", "Corporate Sports Day", "Corporate Fun Day", "Padel Tournament", "Football Tournament", "Tennis Tournament", "Fan Zone", "Brand Activation", "Event Operations", "Staffing & Logistics"],
    "Event Technology": ["Live Scoring", "LED Scoreboards", "Competition Screens", "Draw System", "Tournament Website", "Event Control Software", "Real-time Competition Data"],
    "Interactive Entertainment": ["PS5 Tournament", "VR Tournament", "Beat Saber", "Gaming Zone", "Chess", "Family Entertainment"],
    "Rental": ["VR Headset Rental", "VR Station Rental", "PS5 Rental", "TV Rental", "Gaming Laptop Rental", "Tablet Rental", "Bean Bag Rental", "Technical Equipment Rental"],
    "Sponsorship": ["Event Sponsorship", "Marketing Investment", "Activation Rights"],
    "Consulting": ["Sports Consulting", "Technical Consulting", "Event Consulting", "Project Management", "Technology Advisory", "Operations Consulting"],
    "Other / Custom": ["Custom Service"],
}

# ---------------------------------------------------------------------------
# Sheet definitions: (file, title, required?, purpose, columns, example rows)
# column = (name, required, description, allowed values or None)
# ---------------------------------------------------------------------------
SHEETS = [
    ("00_start_balances", "Start balances", True,
     "Where the books start. Only for balances NOT explained by the projects you import.",
     [("item", True, "What this row is", START_ITEMS),
      ("person", False, "Wahid, Belal or a name from 03_people (blank for bank rows)", None),
      ("amount", True, "EGP, no commas", None),
      ("date", True, "YYYY-MM-DD", None),
      ("notes", False, "Anything useful", None)],
     [["bank_opening", "", "150000", "2025-01-01", "Bank balance the day before the first record in these sheets"],
      ["bank_today", "", "412350", "2026-09-26", "Real bank balance today — used only to check the import reconciles"],
      ["owed_to_person", "Wahid", "30000", "2025-01-01", "Old recovery due from 2024 work not in these sheets"],
      ["held_by_partner", "Belal", "5000", "2025-01-01", "Company cash Belal was holding"]]),

    ("01_clients", "Clients", True,
     "Every client that appears in a project.",
     [("client_name", True, "Unique name used in 04_projects", None),
      ("company_name", False, "Legal / full name", None),
      ("client_type", False, "Type", CLIENT_TYPES),
      ("phone", False, "", None), ("email", False, "", None), ("notes", False, "", None)],
     [["Levels FC", "Levels Football Club", "club", "", "finance@levelsfc.example", ""],
      ["Katameya Heights", "Katameya Heights Golf & Tennis Resort", "company", "", "", ""]]),

    ("02_suppliers", "Suppliers", False,
     "Suppliers used in 08_expenses (optional — expenses can have no supplier).",
     [("supplier_name", True, "Unique name used in 08_expenses", None),
      ("category", False, "Free text e.g. Production, Rentals", None),
      ("phone", False, "", None), ("email", False, "", None), ("bank_details", False, "", None), ("notes", False, "", None)],
     [["Screens Pro", "Screens", "", "", "", ""], ["Supplier ABC", "Production", "", "", "", ""]]),

    ("03_people", "People", False,
     "Employees, freelancers and outside funders who paid or received money. Wahid and Belal already exist — do not add them.",
     [("full_name", True, "Unique name used in other sheets", None),
      ("kind", True, "Kind", PEOPLE_KINDS),
      ("job_title", False, "", None), ("phone", False, "", None), ("email", False, "", None)],
     [["Omar Adel", "employee", "Event Coordinator", "", ""]]),

    ("04_projects", "Projects", True,
     "One row per project. project_ref is your own short unique key (e.g. old code) used to link every other sheet.",
     [("project_ref", True, "Your unique key, e.g. P-2025-01", None),
      ("project_name", True, "", None),
      ("client_name", False, "Must exist in 01_clients (blank = internal)", None),
      ("project_type", True, "Type", PROJECT_TYPES),
      ("services", False, "One or more service names separated by ;", None),
      ("start_date", True, "YYYY-MM-DD", None),
      ("end_date", False, "YYYY-MM-DD", None),
      ("contract_value", True, "ORIGINAL agreed value (changes go in 06). 0 for sponsorship", None),
      ("currency", False, "Default EGP", CURRENCIES),
      ("fx_rate", False, "Rate to EGP if not EGP", None),
      ("operational_status", True, "Status", OP_STATUS),
      ("budget", False, "Expected total cost", None),
      ("project_manager", False, "Wahid, Belal or a name from 03_people", None),
      ("lead_generator", False, "Wahid or Belal", None),
      ("financially_closed", True, "Y = fully settled, lock it after import", YN),
      ("notes", False, "", None)],
     [["P-2025-01", "Katameya Padel Open 2025", "Katameya Heights", "event", "Padel Tournament; Tournament Registration; Live Scoring",
       "2025-03-10", "2025-03-12", "500000", "EGP", "", "completed", "320000", "Wahid", "Belal", "Y", ""],
      ["P-2025-02", "Levels FC — Move IT Annual 2025", "Levels FC", "subscription", "Move IT Platform Subscription",
       "2025-02-01", "2026-01-31", "120000", "EGP", "", "completed", "", "", "", "Y", "Annual subscription"]]),

    ("05_payment_schedule", "Payment schedule", False,
     "What the client had to pay and when. If a project has no rows here, one milestone = contract value due on end date.",
     [("project_ref", True, "From 04_projects", None), ("label", True, "e.g. Signing, Final", None),
      ("due_date", True, "YYYY-MM-DD", None), ("amount", True, "In the project currency", None)],
     [["P-2025-01", "Signing", "2025-02-15", "250000"], ["P-2025-01", "Completion", "2025-03-20", "290000"]]),

    ("06_contract_changes", "Contract changes", False,
     "Change orders, discounts, credit notes after the original contract.",
     [("project_ref", True, "From 04_projects", None), ("date", True, "YYYY-MM-DD", None),
      ("change_type", True, "Type", CHANGE_TYPES), ("amount", True, "Positive number; the type decides + or −", None),
      ("description", True, "", None)],
     [["P-2025-01", "2025-03-01", "change_order", "40000", "Extra LED screens"]]),

    ("07_client_payments", "Client payments", True,
     "Every payment received from clients (and refunds).",
     [("project_ref", True, "From 04_projects", None), ("date", True, "YYYY-MM-DD", None),
      ("amount", True, "Positive number", None), ("currency", False, "Default EGP", CURRENCIES), ("fx_rate", False, "", None),
      ("received_by", True, "Where the money went", RECEIVED_BY), ("reference", False, "Transfer / cheque no.", None),
      ("is_refund", False, "Y if money went back to the client", YN)],
     [["P-2025-01", "2025-02-16", "250000", "EGP", "", "Company Bank", "TRX-1182", "N"],
      ["P-2025-01", "2025-03-22", "290000", "EGP", "", "Belal", "Cash to Belal", "N"],
      ["P-2025-02", "2025-02-05", "120000", "EGP", "", "Company Bank", "", "N"]]),

    ("08_expenses", "Expenses", True,
     "One row per PAYMENT. Rows with the same expense_ref are one expense paid in parts / by different people. Leave project_ref blank for company overhead. Unpaid commitments: paid_amount 0.",
     [("expense_ref", False, "Group payments of the same cost (e.g. E-001)", None),
      ("project_ref", False, "From 04_projects; blank = company overhead", None),
      ("description", True, "", None),
      ("category", False, "Main category", list(EXPENSE_CATEGORIES)),
      ("subcategory", False, "Sub-category (see guide)", None),
      ("supplier_name", False, "From 02_suppliers", None),
      ("expense_type", False, "Default normal", EXPENSE_TYPES),
      ("total_cost", True, "Full agreed cost (same on every row of one expense_ref)", None),
      ("paid_amount", True, "Paid in THIS row (0 if still unpaid)", None),
      ("paid_by", False, "Company, Wahid, Belal, or a name from 03_people", None),
      ("paid_from", False, "For Company payments only", PAID_FROM),
      ("reimbursable", False, "Partner payments: Y = company owes it back", YN),
      ("paid_date", False, "YYYY-MM-DD (required if paid_amount > 0)", None),
      ("supplier_due_date", False, "When unpaid balance is due", None),
      ("currency", False, "Default EGP", CURRENCIES), ("fx_rate", False, "", None),
      ("asset_name", False, "For owned_asset", None), ("asset_quantity", False, "For owned_asset", None),
      ("notes", False, "", None)],
     [["E-001", "P-2025-01", "LED screens", "Production", "Screens", "Screens Pro", "normal", "70000", "70000", "Wahid", "", "Y", "2025-03-05", "", "EGP", "", "", "", ""],
      ["E-002", "P-2025-01", "Stage & sound", "Production", "Sound", "Supplier ABC", "normal", "150000", "100000", "Company", "Company Bank", "", "2025-03-08", "", "EGP", "", "", "", ""],
      ["E-002", "P-2025-01", "Stage & sound", "Production", "Sound", "Supplier ABC", "normal", "150000", "50000", "Belal", "", "Y", "2025-03-20", "", "EGP", "", "", "", "Belal paid the balance"],
      ["E-003", "P-2025-01", "Water for ushers", "Logistics", "Meals", "", "normal", "2000", "2000", "Omar Adel", "", "", "2025-03-10", "", "EGP", "", "", "", ""],
      ["E-004", "P-2025-01", "Meta Quest 3 headsets", "Assets", "VR Equipment", "", "owned_asset", "125000", "125000", "Company", "Company Bank", "", "2025-03-01", "", "EGP", "", "Meta Quest 3", "5", ""],
      ["E-005", "", "Office rent — March", "Company Overhead", "Office", "", "normal", "15000", "15000", "Company", "Company Bank", "", "2025-03-01", "", "EGP", "", "", "", ""]]),

    ("09_funding", "Cash funding", False,
     "Cash a partner/funder PUT INTO the company for a project. (Partner-paid expenses already count as funding — don't repeat them here.)",
     [("project_ref", True, "From 04_projects", None), ("date", True, "YYYY-MM-DD", None),
      ("funded_by", True, "Wahid, Belal or a name from 03_people", None), ("amount", True, "", None),
      ("received_into", False, "Default Company Bank", ["Company Bank"]), ("notes", False, "", None)],
     [["P-2025-01", "2025-02-20", "Wahid", "30000", "Company Bank", "Cash advance before signing payment"]]),

    ("10_partner_fees", "Partner fees", False,
     "Management / lead / commission fees agreed on a project.",
     [("project_ref", True, "From 04_projects", None), ("partner", True, "Wahid or Belal", ["Wahid", "Belal"]),
      ("fee_type", True, "Type", FEE_TYPES), ("amount", True, "EGP", None),
      ("treatment", False, "Default project_cost", TREATMENTS), ("notes", False, "", None)],
     [["P-2025-01", "Wahid", "management", "50000", "project_cost", "10% of contract"],
      ["P-2025-01", "Belal", "lead_generation", "50000", "project_cost", "10% of contract"]]),

    ("11_technology", "CTO technology", False,
     "Reusable systems Wahid developed, with the agreed recoverable development value.",
     [("technology_name", True, "Unique name used in 12", None), ("developer", True, "Default Wahid", ["Wahid"]),
      ("category", False, "Category", TECH_CATEGORIES), ("original_project_ref", False, "Where it was built", None),
      ("agreed_value", True, "Agreed recoverable development value (EGP)", None),
      ("completion_date", False, "YYYY-MM-DD", None), ("services", False, "Service names separated by ;", None),
      ("description", False, "", None)],
     [["Move Beyond Padel Tournament Platform", "Wahid", "Tournament Platform", "P-2025-01", "50000", "2025-03-01",
       "Tournament Management Platform; Live Scoring", "Registration, draws, live scoring"]]),

    ("12_cto_recoveries", "CTO recoveries", False,
     "Amounts recovered toward a technology from projects that used it. Recovered before any project in these sheets? leave project_ref blank.",
     [("technology_name", True, "From 11_technology", None), ("project_ref", False, "From 04_projects; blank = before this history", None),
      ("date", True, "YYYY-MM-DD", None), ("amount", True, "EGP", None),
      ("treatment", False, "Default project_cost", TREATMENTS), ("notes", False, "", None)],
     [["Move Beyond Padel Tournament Platform", "P-2025-01", "2025-04-01", "10000", "project_cost", ""]]),

    ("13_profit_distributions", "Profit distributions", False,
     "Profit declared per partner per project (the entitlement), incl. any part left in the company.",
     [("project_ref", True, "From 04_projects", None), ("date", True, "YYYY-MM-DD", None),
      ("partner", True, "Wahid or Belal", ["Wahid", "Belal"]), ("amount", True, "Entitlement from this project", None),
      ("reinvested", False, "Part left in the company (reserve contribution)", None), ("notes", False, "", None)],
     [["P-2025-01", "2025-04-01", "Wahid", "40000", "0", ""], ["P-2025-01", "2025-04-01", "Belal", "40000", "10000", "Left 10K in company"]]),

    ("14_payments_to_people", "Payments to people", False,
     "Money actually handed to a person against what was owed (repayments, fees, CTO, profit, reimbursements).",
     [("date", True, "YYYY-MM-DD", None), ("person", True, "Wahid, Belal or a name from 03_people", None),
      ("category", True, "What it pays off", PAYOUT_CATS), ("project_ref", False, "From 04_projects (blank if not project-specific)", None),
      ("amount", True, "EGP", None), ("paid_from", False, "Default Company Bank", PAID_FROM), ("reference", False, "", None)],
     [["2025-04-02", "Wahid", "funding", "P-2025-01", "100000", "Company Bank", "LED + cash advance repaid"],
      ["2025-04-02", "Wahid", "fee", "P-2025-01", "50000", "Company Bank", ""],
      ["2025-04-02", "Belal", "profit", "P-2025-01", "30000", "Held by Belal", "Kept from the cash he collected"],
      ["2025-03-11", "Omar Adel", "reimbursement", "P-2025-01", "2000", "Company Bank", ""]]),

    ("15_assets", "Assets owned", False,
     "Equipment owned BEFORE this history, or not bought through 08_expenses (otherwise use expense_type owned_asset).",
     [("asset_name", True, "", None), ("category", False, "Category", ASSET_CATEGORIES), ("quantity", True, "", None),
      ("purchase_value", True, "Total EGP", None), ("purchase_date", False, "YYYY-MM-DD", None),
      ("supplier_name", False, "", None), ("serial_number", False, "", None), ("location", False, "", None),
      ("condition", False, "Default good", CONDITIONS), ("notes", False, "", None)],
     [["PS5 Console", "Gaming Consoles", "4", "80000", "2024-06-01", "", "", "Office store room", "good", ""]]),

    ("16_loss_allocations", "Loss allocations", False,
     "Only for projects that lost money: who absorbed how much. Partner shares are netted against future payouts.",
     [("project_ref", True, "From 04_projects", None), ("absorbed_by", True, "Wahid, Belal or Move Beyond", ["Wahid", "Belal", "Move Beyond"]),
      ("amount", True, "EGP", None), ("notes", False, "", None)],
     [["P-2024-07", "Wahid", "20000", ""], ["P-2024-07", "Move Beyond", "10000", ""]]),
]

GUIDE = [
    ("Move Beyond OS — historical data import", True),
    ("", False),
    ("HOW IT WORKS", True),
    ("1. Fill one sheet per record type. Required sheets: 00, 01, 04, 07, 08. The rest only if you have that kind of data.", False),
    ("2. Every project gets a project_ref (your own short key, e.g. P-2025-01). All other sheets link to projects with it.", False),
    ("3. Names must match exactly across sheets (client_name, supplier_name, person names). Wahid and Belal already exist.", False),
    ("4. Dates are YYYY-MM-DD. Amounts are plain numbers: 150000 not 150,000 EGP. Default currency EGP.", False),
    ("5. Delete the grey example rows before sending. Export each sheet as CSV, or send this .xlsx as is.", False),
    ("6. Everything is replayed through the same rules as live entry, so funding, reimbursements, partner balances,", False),
    ("   CTO outstanding and project profit are calculated automatically — don't enter them twice.", False),
    ("", False),
    ("THE GOLDEN RULES (avoid double counting)", True),
    ("• A partner paying a supplier = one row in 08_expenses with paid_by = Wahid/Belal. It automatically becomes funding owed to him.", False),
    ("• 09_funding is ONLY for cash a partner put into the company account — not for expenses he paid directly.", False),
    ("• 14_payments_to_people is money actually handed back / paid out. Anything owed but never paid stays outstanding.", False),
    ("• Client money received by a partner personally: 07_client_payments received_by = Wahid/Belal. It shows as money he holds.", False),
    ("• If a partner kept that money as his repayment/profit, record it in 14 with paid_from = Held by <him>.", False),
    ("• contract_value in 04 is the ORIGINAL contract; extras and discounts go in 06_contract_changes.", False),
    ("• 00_start_balances: bank_opening = bank balance the day BEFORE your first record. bank_today = real balance now (check only).", False),
    ("  owed_to_person / held_by_partner are only for old balances that the project sheets don't explain.", False),
    ("", False),
    ("WHAT HAPPENS AFTER YOU SEND IT", True),
    ("1. A dry run checks every row (missing names, bad dates, overpayments, CTO above agreed value) and sends you a list of issues.", False),
    ("2. After fixes, the import runs once in a single transaction — all or nothing — into the real Move Beyond organization.", False),
    ("3. A reconciliation report compares the system bank balance to bank_today and shows each partner's balance for you to confirm.", False),
    ("4. Projects marked financially_closed = Y are locked at the end.", False),
]


def write_csvs():
    os.makedirs(CSV_DIR, exist_ok=True)
    for f in os.listdir(CSV_DIR):
        if f.endswith(".csv"):
            os.remove(os.path.join(CSV_DIR, f))
    for file, _title, _req, _purpose, cols, rows in SHEETS:
        with open(os.path.join(CSV_DIR, f"{file}.csv"), "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.writer(fh)
            w.writerow([c[0] for c in cols])
            w.writerows(rows)


def write_xlsx():
    wb = Workbook()
    head_fill = PatternFill("solid", fgColor="16161A")
    req_fill = PatternFill("solid", fgColor="2B2B33")
    ex_fill = PatternFill("solid", fgColor="EFEFF2")
    white = Font(color="FFFFFF", bold=True)

    # Guide sheet
    g = wb.active
    g.title = "READ ME"
    g.column_dimensions["A"].width = 130
    for i, (text, bold) in enumerate(GUIDE, start=1):
        c = g.cell(row=i, column=1, value=text)
        c.font = Font(bold=bold, size=14 if i == 1 else 11)
    r = len(GUIDE) + 2
    g.cell(row=r, column=1, value="SHEETS").font = Font(bold=True)
    for file, title, req, purpose, _c, _r in SHEETS:
        r += 1
        g.cell(row=r, column=1, value=f"{file}  {'(REQUIRED)' if req else '(optional)'} — {purpose}")

    # Lists sheet for long dropdowns + reference
    lists = wb.create_sheet("Lists")
    col = 1
    ref_ranges = {}

    def put(title, values):
        nonlocal col
        lists.cell(row=1, column=col, value=title).font = Font(bold=True)
        for i, v in enumerate(values, start=2):
            lists.cell(row=i, column=col, value=v)
        letter = get_column_letter(col)
        lists.column_dimensions[letter].width = max(18, max(len(str(v)) for v in values + [title]) + 2)
        ref_ranges[title] = f"Lists!${letter}$2:${letter}${len(values) + 1}"
        col += 1

    put("Expense categories", list(EXPENSE_CATEGORIES))
    for k, v in EXPENSE_CATEGORIES.items():
        put(f"{k} ›", v)
    for k, v in SERVICES.items():
        put(f"Service: {k}", v)

    for file, title, _req, purpose, cols, rows in SHEETS:
        ws = wb.create_sheet(file[:31])
        ws.freeze_panes = "A3"
        ws.cell(row=1, column=1, value=purpose).font = Font(italic=True, color="555560")
        for j, (name, req, desc, allowed) in enumerate(cols, start=1):
            c = ws.cell(row=2, column=j, value=name)
            c.font = white
            c.fill = req_fill if req else head_fill
            c.alignment = Alignment(horizontal="left")
            from openpyxl.comments import Comment
            c.comment = Comment(f"{'REQUIRED. ' if req else ''}{desc}" + (f"\nAllowed: {', '.join(allowed)}" if allowed else ""), "Move Beyond OS")
            ws.column_dimensions[get_column_letter(j)].width = max(14, min(42, len(name) + 6))
            letter = get_column_letter(j)
            if allowed:
                if name == "category" and file == "08_expenses":
                    formula = ref_ranges["Expense categories"]
                else:
                    formula = '"' + ",".join(allowed) + '"'
                dv = DataValidation(type="list", formula1=formula, allow_blank=True, showErrorMessage=True,
                                    errorTitle="Not an allowed value", error="Pick a value from the list (see READ ME / Lists).")
                ws.add_data_validation(dv)
                dv.add(f"{letter}3:{letter}2000")
        for i, row in enumerate(rows, start=3):
            for j, v in enumerate(row, start=1):
                c = ws.cell(row=i, column=j, value=v)
                c.fill = ex_fill
                c.font = Font(color="7C7C88", italic=True)
        ws.cell(row=1, column=len(cols) + 2, value="Grey rows are EXAMPLES — delete them.").font = Font(bold=True, color="B42318")

    wb.save(os.path.join(ROOT, "Move_Beyond_Historical_Import.xlsx"))


def write_guide_md():
    lines = ["# Historical data import — template guide", "",
             "Fill the sheets in `import/Move_Beyond_Historical_Import.xlsx` (dropdowns + comments) or the matching CSVs in `import/templates/`.", ""]
    lines += [t if not b else f"**{t}**" for t, b in GUIDE[2:]]
    lines += ["", "## Sheets and columns", ""]
    for file, title, req, purpose, cols, _rows in SHEETS:
        lines += [f"### `{file}.csv` — {title} {'(required)' if req else '(optional)'}", "", purpose, "",
                  "| Column | Required | Meaning / allowed values |", "|---|:-:|---|"]
        for name, r, desc, allowed in cols:
            allowed_txt = f" Allowed: `{'`, `'.join(allowed)}`" if allowed and len(allowed) <= 12 else (" See category list below." if allowed else "")
            lines.append(f"| `{name}` | {'✓' if r else ''} | {desc}{allowed_txt} |")
        lines.append("")
    lines += ["## Expense categories (category › subcategory)", ""]
    lines += [f"- **{k}** › {', '.join(v)}" for k, v in EXPENSE_CATEGORIES.items()]
    lines += ["", "## Services (use the service name in `04_projects.services`)", ""]
    lines += [f"- **{k}**: {', '.join(v)}" for k, v in SERVICES.items()]
    lines += ["", "New categories or services? Add them in Settings first, or just write them — the dry run will list unknown names.", ""]
    with open(os.path.join(ROOT, "IMPORT_GUIDE.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


if __name__ == "__main__":
    write_csvs()
    write_xlsx()
    write_guide_md()
    print("Templates written to", os.path.abspath(ROOT))
