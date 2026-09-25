import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { alertDigestHtml, sendEmail } from "@/lib/notify/email";

/**
 * Daily job (Vercel Cron): refresh alerts for every organization, then email
 * new critical/high alerts to partners. Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdmin();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { data: orgs } = await admin.from("organizations").select("id, name, organization_settings(email_notifications_enabled)");
  const report: Record<string, unknown>[] = [];
  for (const org of orgs ?? []) {
    await admin.rpc("mb_refresh_alerts", { p_org: org.id });
    const enabled = (org.organization_settings as unknown as { email_notifications_enabled: boolean } | null)?.email_notifications_enabled;
    if (!enabled || /demo/i.test(org.name)) { report.push({ org: org.name, emailed: 0, reason: "email disabled" }); continue; }
    const { data: alerts } = await admin.from("notifications").select("id, title, body, link, priority")
      .eq("organization_id", org.id).is("resolved_at", null).is("emailed_at", null).in("priority", ["critical", "high"]).limit(50);
    if (!alerts?.length) { report.push({ org: org.name, emailed: 0 }); continue; }
    const { data: partners } = await admin.from("user_roles").select("user_id, profiles:user_id(email)").eq("organization_id", org.id).eq("role_key", "partner");
    const to = Array.from(new Set((partners ?? []).map((p) => (p.profiles as unknown as { email: string } | null)?.email).filter(Boolean))) as string[];
    const res = await sendEmail(to, `Move Beyond OS · ${alerts.length} alert${alerts.length > 1 ? "s" : ""} need attention`, alertDigestHtml(org.name, site, alerts));
    if (res.ok) await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", alerts.map((a) => a.id));
    report.push({ org: org.name, alerts: alerts.length, recipients: to.length, ...res });
  }
  return NextResponse.json({ ok: true, report });
}
