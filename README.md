# Marugen Farm Manager

Web app for Marugen Koi & Arowana Farm — inventory, invoices, deliveries, expense receipts, pond management, and AI assistant. Built with React + Vite, hosted on Vercel, backed by Supabase.

**Production:** [marugen-farm-manager.vercel.app](https://marugen-farm-manager.vercel.app)

---

## Architecture

| Layer | Service | Role |
|-------|---------|------|
| Frontend | Vercel | Static SPA (`dist/`), HTTPS, custom domain |
| API / auth | Supabase Edge Functions | `auth-login`, `farm-api`, `gemini-chat` |
| Database | Supabase Postgres | Business data (RLS on; access via service role in functions) |
| AI | Gemini API | Called only from `gemini-chat` edge function |

GitHub stores source code only. Users reach the app through Vercel (or another static host), not GitHub directly.

---

## Local development

```bash
npm install
cp .env.example .env   # fill in Supabase URL + anon key
npm run dev
```

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build → `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |

---

## Environment variables

### Vercel (Production + Preview)

Set in **Vercel → Project → Settings → Environment Variables**, then redeploy.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon public key |
| `VITE_SENTRY_DSN` | No | Sentry DSN (errors only in production builds) |

### Supabase Edge Function secrets

**Supabase Dashboard → Edge Functions → Secrets**

| Secret | Required | Description |
|--------|----------|-------------|
| `GEMINI_API_KEY` | Yes (for AI Chat) | Google Gemini API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto on hosted Supabase | Used by edge functions |

---

## Supabase setup (Section 5.1)

**Marugen production project:** `https://iqwypobdqnrpdkgebkds.supabase.co`

### Recommended — Supabase CLI

```bash
supabase login
npm run supabase:deploy
```

This runs `supabase db push` (all files in `supabase/migrations/` in timestamp order) and deploys `auth-login`, `farm-api`, and `gemini-chat`.

### Manual — SQL Editor

1. List migrations: `npm run verify:migrations`
2. Run each file in `supabase/migrations/` **in filename order** (oldest first).
3. **Critical for photo upload** (run in this sequence if patching an old DB):
   - `20250615000000_expense_storage.sql`
   - `20250616000000_expense_storage_private.sql`
   - `20250617000000_koi_photos_storage.sql`
4. Verify buckets: run `scripts/verify-storage-buckets.sql` → expect `expense-receipts` and `koi-photos`, both `public = false`.
5. Deploy functions:

```bash
supabase functions deploy auth-login
supabase functions deploy farm-api
supabase functions deploy gemini-chat
```

### One-shot patch (legacy)

`supabase/setup_marugen_project.sql` — safe to re-run for quick patches; prefer `db push` for new environments.

### After setup

1. Set `GEMINI_API_KEY` in **Supabase → Edge Functions → Secrets**.
2. First app login: complete owner PIN setup in the app.

---

## Deploy to Vercel

1. Connect GitHub repo `marugenfishfarmaiagent-lgtm/marugen-farm-manager` to Vercel.
2. Framework preset: **Vite** (or use `vercel.json`).
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Push to `main` → automatic production deploy.

### Git author (Hobby plan + private repo)

Commits must be authored by the GitHub account linked to Vercel (`marugenfishfarmaiagent-lgtm`). This repo uses local git config:

```
user.name=marugenfishfarmaiagent-lgtm
user.email=291337295+marugenfishfarmaiagent-lgtm@users.noreply.github.com
```

Other GitHub users pushing to a private repo on the Hobby plan will block Vercel deploys unless you upgrade to Pro.

---

## Custom domain

1. **Vercel → Settings → Domains** → add e.g. `app.marugenfishfarm.com`.
2. At your DNS provider, add the records Vercel shows (usually `CNAME` to `cname.vercel-dns.com`).
3. Wait for SSL (automatic).
4. Re-add the PWA to Home Screen on phones after the domain change.

---

## Monitoring (Section 5.2)

Code is ready in the repo (`public/health.json`, `@vercel/analytics`, `src/lib/monitoring.js`). Verify automated checks:

```bash
npm run verify:monitoring
```

Finish dashboard setup:

### 1. UptimeRobot — `/health.json`

| Field | Value |
|-------|-------|
| Monitor type | HTTP(s) |
| URL | `https://marugen-farm-manager.vercel.app/health.json` |
| Interval | 5 minutes |
| Keyword (optional) | `ok` |

Expected response: HTTP `200`, body `{"status":"ok","service":"marugen-farm-manager"}`.

### 2. Vercel Analytics

1. [Vercel → marugen-farm-manager → Analytics](https://vercel.com/marugenfishfarmaiagent-4899s-projects/marugen-farm-manager/analytics)
2. Click **Enable** (no env vars; `@vercel/analytics` is already in `src/main.jsx`).

### 3. Sentry error tracking

1. Create a **React** project at [sentry.io](https://sentry.io).
2. Copy the **DSN**.
3. Vercel → **Settings → Environment Variables** → add `VITE_SENTRY_DSN` for **Production** (and Preview if desired).
4. Redeploy.

Sentry only runs in production builds when `VITE_SENTRY_DSN` is set; otherwise it stays disabled with zero overhead.

---

## Production smoke test (Section 7)

Run automated checks (health, edge functions, PWA assets, feature wiring):

```bash
npm run verify:smoke
```

Then complete the manual checklist (requires owner/staff PIN):

| # | Test | How to verify |
|---|------|----------------|
| 1 | PIN login — desktop | Open production URL → enter PIN → dashboard loads |
| 2 | PIN login — mobile PWA | Add to Home Screen → login → layout usable |
| 3 | Dashboard KPIs | 6 cards: revenue, outstanding invoices, low stock, deliveries today, active koi, monthly expenses |
| 4 | Invoice PDF | Create invoice → PDF → logo + customer name/phone/email/address visible |
| 5 | PayNow QR | PDF preview shows scannable QR + correct amount |
| 6 | Deliveries | Create → assign driver → mark delivered → maps link opens |
| 7 | Expense upload | Receipt photo saves (`expense-receipts` bucket in Supabase) |
| 8 | Signed URL refresh | Re-open expense/koi photo after 4+ hours — image still loads |
| 9 | Koi photo | Add koi with photo → appears in stock |
| 10 | Customer koi death | Mark deceased → death photo uploads |
| 11 | Pond chart | Add water parameters → history chart updates |
| 12 | AI Burmese | Ask in Myanmar → relevant farm answer |
| 13 | AI memory | Follow-up question references earlier message |
| 14 | Staff permissions | Staff PIN → restricted modules hidden |
| 15 | Cloud sync | Edit on device A → appears on device B within sync cycle |
| 16 | Health endpoint | `npm run verify:monitoring` or curl `/health.json` |
| 17 | UptimeRobot | Pause/resume monitor → email alert received |

---

## Private image storage

Farm photos use **private Supabase Storage buckets** with **signed URLs** (4-hour TTL). Postgres stores object paths only — not base64 blobs.

| Bucket | Used for | DB columns |
|--------|----------|------------|
| `expense-receipts` | Expense receipt photos | `expenses.image_url` |
| `koi-photos` | Koi + customer koi photos | `koi_fish.photo`, `koi_fish.death_photo`, `customer_koi.photo`, `customer_koi.death_photo` |

**Not stored in cloud** (by design): invoice PDFs (generated on demand in the browser), AI chat attachments (session only; sent to Gemini, not persisted).

**One-time setup**

1. `npm run supabase:deploy` (or run all migrations — see **Supabase setup** above).
2. Confirm buckets with `scripts/verify-storage-buckets.sql`.
3. `supabase functions deploy farm-api` (included in `supabase:deploy`).

**Behaviour**

- Legacy base64 in Postgres migrates to Storage on the next sync.
- `farm-api` signs URLs on fetch; the app refreshes via `refresh_signed_image` when a link expires.
- Deleted, synced-out, or retention-purged records remove their storage files.

---

## Roadmap

| Phase | Status |
|-------|--------|
| Phase 1 — README, Analytics, Sentry scaffold, `/health.json` | Done in repo |
| Phase 2 — UptimeRobot, Sentry DSN, Vercel Analytics | Code ready — `npm run verify:monitoring`; enable dashboards (see above) |
| Phase 3 — Private Storage + signed URLs | Done in repo — `npm run supabase:deploy` |
| Phase 4 — RLS verification, pagination, AI history | Done in repo — migration `20250623000000_rls_verification.sql` |
| Phase 5 — Quick wins (title, favicon, theme-color, auth spinner, last-sync) | Done in repo |

---

## License

Private — Marugen Koi Farm internal use.
