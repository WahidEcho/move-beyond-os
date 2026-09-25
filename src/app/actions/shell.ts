"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSession, ORG_COOKIE } from "@/lib/session";
import { callRpc } from "@/lib/actions";

export interface SearchHit { kind: string; id: string; title: string; subtitle: string; href: string }

export async function globalSearch(query: string): Promise<SearchHit[]> {
  const session = await getSession();
  if (!session?.orgId || query.trim().length < 2) return [];
  const supabase = await createSupabaseServer();
  const { data } = await supabase.rpc("mb_search", { p_org: session.orgId, p_query: query, p_limit: 20 });
  return (data ?? []) as SearchHit[];
}

export async function switchOrganization(orgId: string) {
  const session = await getSession();
  if (!session?.orgs.some((o) => o.id === orgId)) return;
  (await cookies()).set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/finance");
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function dismissAlert(id: string, readOnly = false) {
  return callRpc("mb_dismiss_alert", { p_notification: id, p_read_only: readOnly }, ["/finance"]);
}

export async function refreshAlerts() {
  const session = await getSession();
  if (!session?.orgId) return { ok: false as const, kind: "permission" as const, error: "Not signed in" };
  return callRpc("mb_refresh_alerts", { p_org: session.orgId }, ["/finance"]);
}
