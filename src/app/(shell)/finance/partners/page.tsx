import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getPersonBalances } from "@/services/queries";
import { buildPartnerAccount, type PersonBalanceRow } from "@/engines/partnerAccount";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/Card";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";
import { egp, toNum } from "@/lib/format";

export const metadata = { title: "Partners" };

export default async function PartnersPage() {
  const session = await requireSession("partners.view");
  const rows = await getPersonBalances(session.orgId);
  const partners = rows.filter((r) => r.is_partner);
  const others = rows.filter((r) => !r.is_partner && (toNum(r.employee_due) || toNum(r.funding_due)));
  return (
    <>
      <PageHeader title="Partners" subtitle="How much does Move Beyond currently owe each person? Categories never merge." />
      <div className="grid gap-6 lg:grid-cols-2">
        {partners.map((r) => {
          const a = buildPartnerAccount(r as unknown as PersonBalanceRow);
          return (
            <Link key={r.person_id} href={`/finance/partners/${r.person_id}`} className="block">
              <Card className="h-full transition-colors hover:border-line-strong">
                <CardHeader title={r.full_name} subtitle={`${toNum(r.profit_share_pct)}% profit share${r.technology_recovery_eligible ? " · CTO" : ""}`}
                  actions={r.technology_recovery_eligible && <Badge tone="info">CTO recovery eligible</Badge>} />
                <CardBody>
                  <p className="text-[12.5px] text-ink-3">Total currently due</p>
                  <p className="num mt-1 text-[28px] font-semibold tracking-[-0.02em]"><Money value={a.totalCurrentlyDue} /> <span className="text-sm font-medium text-ink-3">EGP</span></p>
                  <DefinitionList className="mt-3" items={[
                    ...a.sections.map((s) => ({ label: s.title, value: <Money value={s.due} signed={s.due < 0} /> })),
                    ...(a.heldForCompany ? [{ label: "Holds company money", value: <Money value={-a.heldForCompany} signed />, hint: "netted" }] : []),
                    ...(a.ctoUnrecoveredClaim ? [{ label: "CTO development not yet recovered", value: <Money value={a.ctoUnrecoveredClaim} />, hint: "claim" }] : []),
                  ]} />
                  {a.ctoUnrecoveredClaim > 0 && <p className="mt-3 text-[12.5px] text-ink-3">Including unrecovered CTO value: <b className="num text-ink">{egp(a.totalIncludingCtoClaim)}</b></p>}
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>
      {others.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Employees & other funders" subtitle="They receive what they paid — they are not partners or profit participants." />
          <CardBody className="py-2">
            <DefinitionList items={others.map((r) => ({ label: <Link className="hover:underline" href={`/finance/partners/${r.person_id}`}>{r.full_name}</Link>, value: <Money value={toNum(r.employee_due) + toNum(r.funding_due)} /> }))} />
          </CardBody>
        </Card>
      )}
    </>
  );
}
