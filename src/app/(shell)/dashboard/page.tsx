import { redirect } from "next/navigation";
import { requireSession, can } from "@/lib/session";

/** Executive Dashboard placeholder: Finance is module #1, so it is the home for now (spec §123). */
export default async function Dashboard() {
  const s = await requireSession();
  redirect(can(s, "finance.view") ? "/finance" : "/finance/projects");
}
