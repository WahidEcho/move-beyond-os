#!/usr/bin/env node
/**
 * Provision a platform user (invite-only system, no public sign-up).
 *
 *   npm run user:create -- --email you@example.com --person Wahid --roles partner,cto
 *   npm run user:create -- --email belal@example.com --person Belal --roles partner --invite
 *
 * --person   name of the existing person record to link (e.g. Wahid, Belal)
 * --roles    comma-separated role keys (partner, cto, admin, finance, project_manager)
 * --orgs     comma-separated organization slugs (default: move-beyond,move-beyond-demo)
 * --invite   send an invitation email instead of setting a password now
 *
 * Without --invite you are prompted for a password in this terminal (not echoed).
 */
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const env = {};
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const get = (k) => process.env[k] ?? env[k];
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));

if (!args.email || !args.person || !args.roles) {
  console.error("Usage: npm run user:create -- --email <email> --person <Name> --roles partner,cto [--orgs move-beyond,move-beyond-demo] [--invite]");
  process.exit(1);
}
const admin = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, (v) => { rl.close(); process.stdout.write("\n"); resolve(v); });
  });
}

const email = String(args.email).toLowerCase();
let userId;
const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;

if (!userId) {
  if (args.invite) {
    const site = get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000";
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/auth/callback?next=/auth/update-password`, data: { full_name: args.person } });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Invitation sent to ${email}.`);
  } else {
    const pw = await askHidden("Password (min 10 chars): ");
    if (!pw || pw.length < 10) { console.error("Password too short."); process.exit(1); }
    const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: args.person } });
    if (error) throw error;
    userId = data.user.id;
    console.log(`User ${email} created.`);
  }
} else {
  console.log(`User ${email} already exists — updating memberships.`);
}

const roles = String(args.roles).split(",").map((r) => r.trim()).filter(Boolean);
const slugs = String(args.orgs ?? "move-beyond,move-beyond-demo").split(",");
for (const slug of slugs) {
  const { data: org } = await admin.from("organizations").select("id, name").eq("slug", slug.trim()).maybeSingle();
  if (!org) { console.warn(`  ! organization ${slug} not found`); continue; }
  const { data: person } = await admin.from("people").select("id").eq("organization_id", org.id).ilike("full_name", String(args.person)).maybeSingle();
  const { error } = await admin.rpc("mb_grant_membership", { p_org: org.id, p_user: userId, p_person: person?.id ?? null, p_roles: roles });
  if (error) throw error;
  console.log(`  ✓ ${org.name}: ${roles.join(", ")}${person ? ` (linked to ${args.person})` : " (no matching person)"}`);
}
