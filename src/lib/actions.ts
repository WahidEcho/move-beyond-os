import "server-only";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "./supabase/server";

export type ActionResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: "validation" | "permission" | "warning" | "closed" | "conflict" | "network" | "database"; amount?: string };

interface PgError { message: string; code?: string; details?: string | null; hint?: string | null }

/** Turn a Postgres/PostgREST error into a message a partner can act on. */
export function mapError(err: PgError): Extract<ActionResult, { ok: false }> {
  const msg = err.message ?? "Something went wrong";
  if (msg.startsWith("UNPAID_OBLIGATIONS:")) {
    const rest = msg.slice("UNPAID_OBLIGATIONS:".length).trim();
    return { ok: false, kind: "warning", error: rest, amount: rest.split(" ")[0] };
  }
  switch (err.code) {
    case "42501":
      return { ok: false, kind: "permission", error: "You don't have permission to do this." };
    case "22023":
    case "23514":
    case "22P02":
      return { ok: false, kind: "validation", error: msg };
    case "P0001":
      return { ok: false, kind: "closed", error: msg };
    case "23505":
      return { ok: false, kind: "conflict", error: "This record already exists." };
    default:
      if (/fetch failed|network|ECONN/i.test(msg)) return { ok: false, kind: "network", error: "Network error — nothing was saved. Try again." };
      return { ok: false, kind: "database", error: msg };
  }
}

/**
 * Call a Postgres RPC as the signed-in user. Permission checks, atomicity and
 * idempotency all live in the database function; this only relays the result.
 */
export async function callRpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>, revalidate: string[] = []): Promise<ActionResult<T>> {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { ok: false, kind: "permission", error: "Your session expired. Sign in again." };
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return mapError(error);
    for (const p of revalidate) revalidatePath(p, "layout");
    return { ok: true, data: (data ?? {}) as T };
  } catch (e) {
    return mapError({ message: e instanceof Error ? e.message : String(e) });
  }
}

/** Direct table write under RLS (master data only — never money). */
export async function writeTable(
  table: string,
  op: "insert" | "update",
  values: Record<string, unknown>,
  match?: Record<string, unknown>,
  revalidate: string[] = [],
): Promise<ActionResult<{ id?: string }>> {
  try {
    const supabase = await createSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { ok: false, kind: "permission", error: "Your session expired. Sign in again." };
    const q = op === "insert" ? supabase.from(table).insert(values) : supabase.from(table).update(values).match(match ?? {});
    const { data, error } = await q.select("id").maybeSingle();
    if (error) return mapError(error);
    if (op === "update" && !data) return { ok: false, kind: "permission", error: "Nothing was updated — you may not have permission." };
    for (const p of revalidate) revalidatePath(p, "layout");
    return { ok: true, data: { id: (data as { id?: string } | null)?.id } };
  } catch (e) {
    return mapError({ message: e instanceof Error ? e.message : String(e) });
  }
}
