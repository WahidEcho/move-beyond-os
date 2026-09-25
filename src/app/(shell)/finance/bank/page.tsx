import { requireSession, can } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getCashAccounts, getLookups } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";
import { BankActions, BankLedger, OpeningBalances } from "./BankClient";

export const metadata = { title: "Bank" };

export default async function BankPage() {
  const session = await requireSession("finance.view");
  const s = await createSupabaseServer();
  const [accounts, lookups, { data: lines }, { data: openings }] = await Promise.all([
    getCashAccounts(session.orgId), getLookups(session.orgId),
    s.from("v_effective_lines").select("id, entry_date, amount, source_type, cash_account_id, project_id, projects:project_id(code, name), journal_entries:entry_id(description)")
      .eq("organization_id", session.orgId).eq("account_code", "CASH").order("entry_date", { ascending: false }).limit(1000),
    s.from("recovery_carryforwards").select("*, people(full_name), cash_accounts(name)").eq("organization_id", session.orgId).is("deleted_at", null).order("effective_date", { ascending: false }),
  ]);
  const manage = can(session, "finance.manage");
  return (
    <>
      <PageHeader title="Bank" subtitle="Move Beyond Company Bank Account. Partner personal accounts are not company accounts — money they hold for the company is tracked separately."
        actions={manage && <BankActions lookups={lookups} />} />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id}>
            <CardHeader title={a.name} actions={a.account_type === "partner_holding" ? <Badge tone="warn">Held by partner</Badge> : a.is_default ? <Badge tone="info">Default</Badge> : null} />
            <CardBody className="py-2">
              <DefinitionList items={[
                { label: "Opening balance", value: <Money value={a.opening_balance} /> },
                { label: "Money in", value: <Money value={a.money_in} /> },
                { label: "Money out", value: <Money value={-a.money_out} signed /> },
                { label: "Current system balance", value: <Money value={a.balance} />, strong: true },
              ]} />
            </CardBody>
          </Card>
        ))}
      </div>
      <Card className="mt-6"><CardHeader title="Transactions" subtitle="Every cash movement from the ledger" /><BankLedger rows={lines ?? []} accounts={accounts} /></Card>
      <OpeningBalances rows={openings ?? []} lookups={lookups} canManage={manage} />
    </>
  );
}
