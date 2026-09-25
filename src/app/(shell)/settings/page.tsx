import { requireSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getLookups } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { CategoriesPanel, CompanyPanel, FeePresetsPanel, PeoplePanel, ServicesPanel, UsersPanel } from "./SettingsClient";

export const metadata = { title: "Settings" };
const TABS = [
  { key: "company", label: "Company & finance" }, { key: "people", label: "People & profit share" }, { key: "users", label: "Users & roles" },
  { key: "services", label: "Services" }, { key: "categories", label: "Categories" }, { key: "fees", label: "Fee presets" },
];

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const session = await requireSession("settings.manage");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : "company";
  const s = await createSupabaseServer();
  const [lookups, { data: settings }, { data: members }, { data: roles }, { data: presets }] = await Promise.all([
    getLookups(session.orgId),
    s.from("organization_settings").select("*").eq("organization_id", session.orgId).single(),
    s.from("organization_members").select("user_id, person_id, status, profiles:user_id(full_name, email)").eq("organization_id", session.orgId),
    s.from("user_roles").select("user_id, role_key").eq("organization_id", session.orgId),
    s.from("fee_presets").select("*").eq("organization_id", session.orgId).order("sort_order"),
  ]);
  return (
    <>
      <PageHeader title="Settings" subtitle="Everything here is configurable without code. Historical records are never changed by settings." />
      <Tabs tabs={TABS} active={tab} baseHref="/settings" />
      {tab === "company" && <CompanyPanel settings={settings} />}
      {tab === "people" && <PeoplePanel people={lookups.people} />}
      {tab === "users" && <UsersPanel members={members ?? []} roles={roles ?? []} people={lookups.people} selfId={session.userId} />}
      {tab === "services" && <ServicesPanel categories={lookups.serviceCategories} services={lookups.services} />}
      {tab === "categories" && <CategoriesPanel expense={lookups.expenseCategories} technology={lookups.technologyCategories} asset={lookups.assetCategories} />}
      {tab === "fees" && <FeePresetsPanel presets={presets ?? []} />}
    </>
  );
}
