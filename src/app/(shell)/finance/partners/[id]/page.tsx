import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getLookups, getPersonBalances, getTechnologies } from "@/services/queries";
import { buildPartnerAccount, type PersonBalanceRow } from "@/engines/partnerAccount";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { Kpi, KpiGrid } from "@/components/ui/Kpi";
import { toNum } from "@/lib/format";
import { PartnerDues, PartnerStatement } from "./PartnerDetail";

export default async function PartnerPage({ params }: PageProps<"/finance/partners/[id]">) {
  const session = await requireSession("partners.view");
  const { id } = await params;
  const s = await createSupabaseServer();
  const [rows, lookups, techs, { data: dues }, { data: lines }] = await Promise.all([
    getPersonBalances(session.orgId), getLookups(session.orgId), getTechnologies(session.orgId),
    s.from("v_person_project_dues").select("*, projects(code, name)").eq("person_id", id),
    s.from("v_effective_lines").select("entry_date, account_code, amount, source_type, project_id, projects:project_id(code, name)")
      .eq("person_id", id).in("account_code", ["DUE_FUNDING", "DUE_EMPLOYEE", "DUE_FEE", "DUE_CTO", "DUE_PROFIT", "DUE_CARRY", "PARTNER_CAPITAL"]).order("entry_date", { ascending: false }).limit(500),
  ]);
  const r = rows.find((x) => x.person_id === id);
  if (!r) notFound();
  const a = buildPartnerAccount(r as unknown as PersonBalanceRow);
  const myTech = techs.filter((t) => t.developer_person_id === id);
  return (
    <>
      <PageHeader title={r.full_name} crumbs={[{ label: "Partners", href: "/finance/partners" }, { label: r.full_name }]}
        subtitle={r.is_partner ? `Partner · ${toNum(r.profit_share_pct)}% profit share${r.technology_recovery_eligible ? " · CTO of Move Beyond" : ""}` : "Not a partner — reimbursed for what they paid"} />
      <KpiGrid>
        <Kpi label={`Total currently due to ${r.full_name}`} value={a.totalCurrentlyDue} />
        {a.heldForCompany !== 0 && <Kpi label="Company money they hold" value={a.heldForCompany} hint="Client paid them / not yet deposited" />}
        {a.heldForCompany !== 0 && <Kpi label="Net payable" value={a.netPayable} tone={a.netPayable < 0 ? "warn" : undefined} hint={a.netPayable < 0 ? "They owe Move Beyond" : undefined} />}
        {a.ctoUnrecoveredClaim > 0 && <Kpi label="Incl. unrecovered CTO value" value={a.totalIncludingCtoClaim} hint="Recoverable from future projects" />}
      </KpiGrid>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {a.sections.map((sec) => (
          <Card key={sec.key}>
            <CardHeader title={sec.title} />
            <CardBody className="py-2"><DefinitionList items={sec.rows.map((x, i) => ({ label: x.label, value: <Money value={x.value} signed={x.value < 0} />, strong: i === sec.rows.length - 1 && sec.key !== "cto" }))} /></CardBody>
          </Card>
        ))}
      </div>
      {myTech.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="CTO development recovery by system" />
          <CardBody className="py-2">
            <DefinitionList items={myTech.map((t) => ({ label: t.name, value: <span><Money value={t.recovered} /> / <Money value={t.approved_value} /> · <b><Money value={t.outstanding} /></b> open</span> }))} />
          </CardBody>
        </Card>
      )}
      <PartnerDues personId={id} personName={r.full_name} dues={dues ?? []} lookups={lookups} />
      <PartnerStatement lines={lines ?? []} />
    </>
  );
}
