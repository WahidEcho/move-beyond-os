import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";

export const metadata = { title: "Reports" };

const REPORTS: [string, string, string][] = [
  ["Project P&L", "Profitability tab of any project", "/finance/projects"],
  ["Project Settlement", "Settlement tab + history", "/finance/settlements"],
  ["Partner Statement", "Every movement per partner", "/finance/partners"],
  ["Wahid CTO Recovery Statement", "Per-system recovery history", "/finance/cto"],
  ["Technology Development Recovery", "All systems, value vs recovered", "/finance/cto"],
  ["Supplier Statement", "Spend, paid and outstanding per supplier", "/finance/suppliers"],
  ["Client Statement", "Projects, revenue and outstanding per client", "/finance/clients"],
  ["Revenue Report", "Collections log + monthly P&L", "/finance/revenue"],
  ["Expense Report", "All expenses with payer and status", "/finance/expenses"],
  ["Cash Flow", "7 / 30 / 90-day forecast and funding gap", "/finance/forecast"],
  ["Accounts Receivable Aging", "Ageing buckets by milestone", "/finance/collections"],
  ["Subscription Report", "MRR, ARR, renewals, collections", "/finance/subscriptions"],
  ["Asset Register", "Owned assets and availability", "/finance/assets"],
  ["Company Financial Summary", "Finance Home", "/finance"],
];

export default async function ReportsPage() {
  await requireSession("finance.view");
  return (
    <>
      <PageHeader title="Reports" subtitle="Every table exports to CSV today. Branded PDF versions (logo + letterhead) are scheduled after go-live." />
      <Callout tone="info" className="mb-6">Budget vs Actual and Partner Fee Statement become available with the Budgets module after go-live.</Callout>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map(([t, d, href]) => (
          <Link key={t} href={href}><Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-line-strong">
            <FileBarChart className="mt-0.5 size-4 text-ink-3" /><div><p className="text-sm font-medium">{t}</p><p className="mt-0.5 text-[12.5px] text-ink-3">{d}</p></div>
          </Card></Link>
        ))}
      </div>
    </>
  );
}
