# Move Beyond Company OS

Internal operating system for Move Beyond. **Module #1: Finance** — project
finance, partner accounts, settlement, and CTO Development Recovery.

* Stack: Next.js 16 · React 19 · TypeScript (strict) · Tailwind v4 · Supabase (Postgres, Auth, Storage, RLS) · Resend
* Docs: [`docs/DECISIONS.md`](docs/DECISIONS.md) (locked rulings) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/FINANCE_RULES.md`](docs/FINANCE_RULES.md)

## Setup

```bash
npm install
cp .env.example .env.local        # fill in Supabase URL/keys, DATABASE_URL (session pooler), CRON_SECRET
npm run db:migrate                # applies supabase/migrations/*.sql once each
npm run db:seed                   # real org (catalogs + partners) + "Move Beyond (Demo)" with sample data
npm run user:create -- --email you@example.com --person Wahid --roles partner,cto
npm run dev                       # http://localhost:3000
```

`user:create` prompts for a password in your terminal (or pass `--invite` to
email an invitation). It links the user to the person record and grants roles in
both organizations. Switch between **Move Beyond** and **Move Beyond (Demo)**
from the user menu (top right).

## Quality gates

```bash
npm test          # engine unit tests + read-layer integration test (read-only)
npm run test:db   # SQL scenario tests — each file runs in a rolled-back transaction
npm run lint
npm run build
```

The SQL suite covers every scenario in spec §127, including the CTO tests
(50K → 10K → 40K, cap enforcement, multi-project recovery, extensions,
reversals, settlement with CTO) and RLS probes for anon, strangers and
project managers.

## Going live

1. Post real opening balances: **Bank → Opening balance** (bank balance, amounts
   owed to/from each partner) and existing platforms under **CTO Development → Add**
   (with “already recovered”).
2. Invite Belal: `npm run user:create -- --email <belal> --person Belal --roles partner --invite`
3. Deploy to Vercel with the same env vars; set `NEXT_PUBLIC_SITE_URL`
   (e.g. `https://os.mbeg.org`, CNAME in Zoho) and add that URL to Supabase
   **Auth → URL configuration → Redirect URLs** (`…/auth/callback`).
4. Email alerts: create a Resend key, verify an mbeg.org sender (DNS in Zoho),
   set `RESEND_API_KEY` and `EMAIL_FROM`. Until then alerts are in-app only.
5. Supabase **Auth → Providers → Email**: disable public sign-ups (invite-only).

## Project layout

```text
src/app/(shell)/finance/…   pages (server components) + page-local client components
src/app/actions/            server actions → Postgres RPCs (idempotency key last arg)
src/services/queries.ts     read layer (views only)
src/engines/                pure calculation engines (+ __tests__)
src/components/ui|finance|shell|shared
supabase/migrations/        numbered SQL (tables, RLS, RPCs, views, alerts, hardening)
supabase/tests/             SQL scenario tests
supabase/seed/seed.sql      idempotent seed
scripts/                    migrate, seed, test-db, create-user
```

## Rules of the codebase

* Money only moves through `mb_*` RPCs — atomic, balanced, idempotent, audited.
* Numbers only come from views + engines — no arithmetic in components.
* Posted records are never edited or erased — reverse and repost, with a reason.
* Permissions come from roles, never from names.
