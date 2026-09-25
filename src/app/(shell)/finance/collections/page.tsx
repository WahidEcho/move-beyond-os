import { requireSession } from "@/lib/session";
import { getLookups, getReceivables } from "@/services/queries";
import { summarizeCollections, AGEING_BUCKETS, DUE_WINDOWS, type ReceivableRow } from "@/engines/collections";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { todayIso } from "@/lib/format";
import { ReceivablesTable } from "./ReceivablesTable";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const session = await requireSession("finance.view");
  const [rows, lookups] = await Promise.all([getReceivables(session.orgId), getLookups(session.orgId)]);
  const s = summarizeCollections(rows as ReceivableRow[], todayIso());
  return (
    <>
      <PageHeader title="Collections" subtitle="What clients owe, when it is due, and how late it is. Reminders go out 14, 7 and 3 days before, on the due date, and when overdue." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Total outstanding" value={s.total} />
        {AGEING_BUCKETS.map((b) => <Kpi key={b.key} label={b.label} value={s.ageing[b.key]} tone={b.key !== "current" && s.ageing[b.key] > 0 ? (b.key === "1_30" ? "warn" : "neg") : undefined} />)}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        {DUE_WINDOWS.map((w) => <Kpi key={w.key} label={w.label} value={s.windows[w.key]} />)}
      </div>
      <Card className="mt-6">
        <CardHeader title="Open receivables" subtitle="By milestone" />
        <ReceivablesTable rows={rows} lookups={lookups} />
      </Card>
    </>
  );
}
