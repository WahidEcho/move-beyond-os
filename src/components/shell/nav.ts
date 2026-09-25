import {
  LayoutDashboard, Home, FolderKanban, HandCoins, TrendingUp, Receipt, FileClock, Scale, Users, Cpu, Repeat, Truck, Package,
  Landmark, ShieldCheck, Target, LineChart, FileBarChart, Trash2, Settings, Building2, Contact, BriefcaseBusiness, Workflow,
  UserCog, ListChecks, Megaphone, Boxes, Globe, BellRing,
} from "lucide-react";

export interface NavItem { label: string; href: string; icon: React.ComponentType<{ className?: string }>; permission?: string; soon?: boolean }
export interface NavGroup { title?: string; items: NavItem[] }

/** Platform navigation (spec §81). Future modules are listed now so the shell never needs a redesign. */
export const NAV: NavGroup[] = [
  { items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  {
    title: "Finance",
    items: [
      { label: "Finance Home", href: "/finance", icon: Home, permission: "finance.view" },
      { label: "Projects", href: "/finance/projects", icon: FolderKanban },
      { label: "Clients", href: "/finance/clients", icon: Building2, permission: "masterdata.view" },
      { label: "Collections", href: "/finance/collections", icon: HandCoins, permission: "finance.view" },
      { label: "Revenue", href: "/finance/revenue", icon: TrendingUp, permission: "finance.view" },
      { label: "Expenses", href: "/finance/expenses", icon: Receipt },
      { label: "Commitments", href: "/finance/commitments", icon: FileClock, permission: "finance.view" },
      { label: "Settlements", href: "/finance/settlements", icon: Scale, permission: "settlements.manage" },
      { label: "Partners", href: "/finance/partners", icon: Users, permission: "partners.view" },
      { label: "CTO Development", href: "/finance/cto", icon: Cpu, permission: "technology.view" },
      { label: "Subscriptions", href: "/finance/subscriptions", icon: Repeat, permission: "finance.view" },
      { label: "Suppliers", href: "/finance/suppliers", icon: Truck, permission: "masterdata.view" },
      { label: "Assets & Inventory", href: "/finance/assets", icon: Package, permission: "assets.view" },
      { label: "Bank", href: "/finance/bank", icon: Landmark, permission: "finance.view" },
      { label: "Company Reserve", href: "/finance/reserve", icon: ShieldCheck, permission: "finance.view" },
      { label: "Budgets", href: "/finance/budgets", icon: Target, permission: "finance.view" },
      { label: "Forecasting", href: "/finance/forecast", icon: LineChart, permission: "finance.view" },
      { label: "Reports", href: "/finance/reports", icon: FileBarChart, permission: "finance.view" },
      { label: "Alerts", href: "/finance/alerts", icon: BellRing, permission: "finance.view" },
      { label: "Deleted Records", href: "/finance/deleted", icon: Trash2, permission: "finance.view" },
    ],
  },
  {
    title: "Coming next",
    items: [
      { label: "CRM", href: "#", icon: Contact, soon: true },
      { label: "Sales", href: "#", icon: BriefcaseBusiness, soon: true },
      { label: "Operations", href: "#", icon: Workflow, soon: true },
      { label: "HR", href: "#", icon: UserCog, soon: true },
      { label: "Tasks", href: "#", icon: ListChecks, soon: true },
      { label: "Marketing", href: "#", icon: Megaphone, soon: true },
      { label: "Inventory", href: "#", icon: Boxes, soon: true },
      { label: "Client Portal", href: "#", icon: Globe, soon: true },
    ],
  },
  { items: [{ label: "Settings", href: "/settings", icon: Settings, permission: "settings.manage" }] },
];
