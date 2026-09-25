import { requireSession } from "@/lib/session";
import { getLookups } from "@/services/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewProjectForm } from "./NewProjectForm";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  const session = await requireSession("projects.manage");
  const lookups = await getLookups(session.orgId);
  return (
    <>
      <PageHeader title="New project" subtitle="Code, ledger, revenue, expenses, funding, settlement and documents are created automatically."
        crumbs={[{ label: "Projects", href: "/finance/projects" }, { label: "New" }]} />
      <NewProjectForm lookups={lookups} />
    </>
  );
}
