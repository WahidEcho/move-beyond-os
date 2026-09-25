import "server-only";

/**
 * Email channel adapter (D9). Uses the Resend HTTP API directly. Returns
 * { skipped } when email is not configured, so the rest of the notification
 * engine keeps working in-app only.
 */
export async function sendEmail(to: string[], subject: string, html: string): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || to.length === 0) return { ok: false, skipped: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
  return { ok: true };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function alertDigestHtml(orgName: string, site: string, alerts: { title: string; body: string | null; link: string | null; priority: string }[]) {
  const rows = alerts.map((a) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid #eee">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:${a.priority === "critical" ? "#b42318" : "#a15c07"}">${esc(a.priority)}</div>
      <a href="${site}${a.link ?? "/finance/alerts"}" style="color:#0e0e11;font-weight:600;text-decoration:none">${esc(a.title)}</a>
      ${a.body ? `<div style="color:#7c7c88;font-size:13px">${esc(a.body)}</div>` : ""}
    </td></tr>`).join("");
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#0e0e11">
    <p style="font-size:13px;color:#7c7c88">Move Beyond OS · ${esc(orgName)}</p>
    <h2 style="font-size:18px;margin:4px 0 12px">${alerts.length} item${alerts.length > 1 ? "s" : ""} need attention</h2>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="margin-top:16px"><a href="${site}/finance/alerts" style="color:#2b4bb7">Open the alert center</a></p></div>`;
}
