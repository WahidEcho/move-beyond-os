"use server";
/** Master data writes (clients, suppliers, people, services, categories, settings) under RLS. */
import { revalidatePath } from "next/cache";
import { writeTable, mapError, type ActionResult } from "@/lib/actions";
import { getSession } from "@/lib/session";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

type J = Record<string, unknown>;
const clean = (o: J) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));

async function orgId() {
  const s = await getSession();
  if (!s?.orgId) throw new Error("Not signed in");
  return s.orgId;
}

export async function saveClient(id: string | null, values: J, _key: string) {
  const v = clean(values);
  return id ? writeTable("clients", "update", v, { id }, ["/finance/clients", "/finance"])
            : writeTable("clients", "insert", { ...v, organization_id: await orgId() }, undefined, ["/finance/clients", "/finance"]);
}
export async function saveContact(id: string | null, values: J, _key: string) {
  const v = clean(values);
  return id ? writeTable("contacts", "update", v, { id }, ["/finance/clients"])
            : writeTable("contacts", "insert", { ...v, organization_id: await orgId() }, undefined, ["/finance/clients"]);
}
export async function saveSupplier(id: string | null, values: J, _key: string) {
  const v = clean(values);
  return id ? writeTable("suppliers", "update", v, { id }, ["/finance/suppliers"])
            : writeTable("suppliers", "insert", { ...v, organization_id: await orgId() }, undefined, ["/finance/suppliers"]);
}
export async function savePerson(id: string | null, values: J, _key: string) {
  const v = clean(values);
  return id ? writeTable("people", "update", v, { id }, ["/settings", "/finance"])
            : writeTable("people", "insert", { ...v, organization_id: await orgId() }, undefined, ["/settings", "/finance"]);
}
export async function saveService(id: string | null, values: J, _key: string) {
  const v = clean(values);
  return id ? writeTable("services", "update", v, { id }, ["/settings"])
            : writeTable("services", "insert", { ...v, organization_id: await orgId() }, undefined, ["/settings"]);
}
export async function saveServiceCategory(id: string | null, values: J, _key: string) {
  const v = clean(values);
  return id ? writeTable("service_categories", "update", v, { id }, ["/settings"])
            : writeTable("service_categories", "insert", { ...v, organization_id: await orgId() }, undefined, ["/settings"]);
}
export async function saveExpenseCategory(id: string | null, values: J, _key: string) {
  const v = clean(values);
  return id ? writeTable("expense_categories", "update", v, { id }, ["/settings"])
            : writeTable("expense_categories", "insert", { ...v, organization_id: await orgId() }, undefined, ["/settings"]);
}
export async function saveSimpleCategory(table: "technology_categories" | "asset_categories", id: string | null, values: J, _key: string) {
  const v = clean(values);
  return id ? writeTable(table, "update", v, { id }, ["/settings"])
            : writeTable(table, "insert", { ...v, organization_id: await orgId() }, undefined, ["/settings"]);
}
export async function saveFeePreset(id: string | null, values: J, _key: string) {
  const v = clean(values);
  return id ? writeTable("fee_presets", "update", v, { id }, ["/settings"])
            : writeTable("fee_presets", "insert", { ...v, organization_id: await orgId() }, undefined, ["/settings"]);
}
export async function saveAsset(id: string, values: J, _key: string) {
  return writeTable("assets", "update", clean(values), { id }, ["/finance/assets"]);
}
export async function saveTechnology(id: string, values: J, _key: string) {
  return writeTable("technology_developments", "update", clean(values), { id }, ["/finance/cto"]);
}
export async function archiveRecord(table: "clients" | "suppliers", id: string, reason: string, _key: string) {
  return writeTable(table, "update", { deleted_at: new Date().toISOString(), deleted_reason: reason }, { id }, ["/finance"]);
}

export async function saveSettings(values: J, _key: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("organization_settings").update(clean(values)).eq("organization_id", await orgId()).select("organization_id").maybeSingle();
    if (error) return mapError(error);
    if (!data) return { ok: false, kind: "permission", error: "You don't have permission to change settings." };
    revalidatePath("/", "layout");
    return { ok: true, data: {} };
  } catch (e) {
    return mapError({ message: e instanceof Error ? e.message : String(e) });
  }
}

/** Invite a user by email and link them to a person with roles (partners only). */
export async function inviteUser(email: string, personId: string | null, roles: string[], _key: string): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.orgId || !(s.permissions.includes("*") || s.permissions.includes("users.manage"))) {
    return { ok: false, kind: "permission", error: "Only partners/admins can invite users." };
  }
  try {
    const admin = createSupabaseAdmin();
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    let userId: string | undefined;
    const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/auth/callback?next=/auth/update-password` });
    if (invited.error) {
      // Already registered: look the user up instead.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
      if (!userId) return { ok: false, kind: "validation", error: invited.error.message };
    } else {
      userId = invited.data.user?.id;
    }
    const { error } = await admin.rpc("mb_grant_membership", { p_org: s.orgId, p_user: userId, p_person: personId, p_roles: roles });
    if (error) return mapError(error);
    revalidatePath("/settings", "layout");
    return { ok: true, data: { user_id: userId } };
  } catch (e) {
    return mapError({ message: e instanceof Error ? e.message : String(e) });
  }
}

export async function setUserRoles(userId: string, roles: string[], _key: string): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.orgId) return { ok: false, kind: "permission", error: "Not signed in" };
  const supabase = await createSupabaseServer();
  const { error: delErr } = await supabase.from("user_roles").delete().eq("organization_id", s.orgId).eq("user_id", userId);
  if (delErr) return mapError(delErr);
  if (roles.length) {
    const { error } = await supabase.from("user_roles").insert(roles.map((r) => ({ organization_id: s.orgId, user_id: userId, role_key: r })));
    if (error) return mapError(error);
  }
  revalidatePath("/settings", "layout");
  return { ok: true, data: {} };
}

/** Upload an attachment to Storage and register it (documents table). */
export async function uploadDocument(form: FormData): Promise<ActionResult> {
  const s = await getSession();
  if (!s?.orgId) return { ok: false, kind: "permission", error: "Not signed in" };
  const file = form.get("file");
  const entityType = String(form.get("entity_type") ?? "");
  const entityId = String(form.get("entity_id") ?? "");
  const docType = String(form.get("doc_type") ?? "other");
  if (!(file instanceof File) || !entityType || !entityId) return { ok: false, kind: "validation", error: "Choose a file" };
  if (file.size > 20 * 1024 * 1024) return { ok: false, kind: "validation", error: "Files must be under 20 MB" };
  const supabase = await createSupabaseServer();
  const path = `${s.orgId}/${entityType}/${entityId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || undefined });
  if (up.error) return { ok: false, kind: "database", error: up.error.message };
  const { error } = await supabase.from("documents").insert({
    organization_id: s.orgId, entity_type: entityType, entity_id: entityId, doc_type: docType, file_name: file.name,
    storage_path: path, mime_type: file.type, size_bytes: file.size, uploaded_by: s.userId });
  if (error) return mapError(error);
  revalidatePath("/finance", "layout");
  return { ok: true, data: {} };
}

export async function documentUrl(path: string): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 5);
  return data?.signedUrl ?? null;
}
