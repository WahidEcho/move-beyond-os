import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "./supabase/server";

export const ORG_COOKIE = "mb_org";

export interface Session {
  userId: string;
  email: string | null;
  orgId: string;
  orgName: string;
  orgs: { id: string; name: string }[];
  personId: string | null;
  personName: string | null;
  roles: string[];
  permissions: string[];
}

/** Everything the UI needs about the signed-in user, resolved once per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, person_id, status, organizations(name)")
    .eq("user_id", auth.user.id)
    .eq("status", "active");
  const orgs = (memberships ?? []).map((m) => ({
    id: m.organization_id as string,
    name: ((m.organizations as unknown as { name: string } | null)?.name ?? "Organization") as string,
    personId: m.person_id as string | null,
  }));
  if (orgs.length === 0) {
    return { userId: auth.user.id, email: auth.user.email ?? null, orgId: "", orgName: "", orgs: [], personId: null, personName: null, roles: [], permissions: [] };
  }
  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const current = orgs.find((o) => o.id === preferred) ?? orgs.find((o) => !/demo/i.test(o.name)) ?? orgs[0];

  const [{ data: roleRows }, { data: person }] = await Promise.all([
    supabase.from("user_roles").select("role_key").eq("organization_id", current.id).eq("user_id", auth.user.id),
    current.personId ? supabase.from("people").select("full_name").eq("id", current.personId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const roles = (roleRows ?? []).map((r) => r.role_key as string);
  const { data: permRows } = roles.length
    ? await supabase.from("role_permissions").select("permission_key").in("role_key", roles)
    : { data: [] as { permission_key: string }[] };

  return {
    userId: auth.user.id,
    email: auth.user.email ?? null,
    orgId: current.id,
    orgName: current.name,
    orgs: orgs.map(({ id, name }) => ({ id, name })),
    personId: current.personId,
    personName: (person as { full_name?: string } | null)?.full_name ?? null,
    roles,
    permissions: Array.from(new Set((permRows ?? []).map((p) => p.permission_key as string))),
  };
});

export function can(session: Pick<Session, "permissions">, permission: string): boolean {
  return session.permissions.includes("*") || session.permissions.includes(permission);
}

/** For pages: signed in, member of an organization, and (optionally) holding a permission. */
export async function requireSession(permission?: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.orgId) redirect("/no-access");
  if (permission && !can(session, permission)) redirect("/no-access");
  return session;
}
