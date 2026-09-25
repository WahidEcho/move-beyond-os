import { requireSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DeletedTable } from "./DeletedTable";

export const metadata = { title: "Deleted Records" };

export default async function DeletedPage() {
  const session = await requireSession("finance.view");
  const s = await createSupabaseServer();
  const { data } = await s.from("v_deleted_records").select("*").eq("organization_id", session.orgId).order("deleted_at", { ascending: false });
  return (
    <>
      <PageHeader title="Deleted Records" subtitle="Deleted financial records stop affecting totals and balances but are never erased. Each one was reversed in the ledger." />
      <Card><DeletedTable rows={data ?? []} /></Card>
    </>
  );
}
