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

## Supabase setup

**Marugen production project:** `https://iqwypobdqnrpdkgebkds.supabase.co`

1. **SQL Editor** → run `supabase/setup_marugen_project.sql` (one-shot patch for this project).
2. **CLI** (logged in as project owner): `bash scripts/deploy-marugen-supabase.sh`
3. Or manually: run migrations from `supabase/migrations/` in order, then deploy edge functions:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy auth-login
supabase functions deploy farm-api
supabase functions deploy gemini-chat
```

4. Set `GEMINI_API_KEY` in Edge Function secrets.
5. First app login: complete owner PIN setup in the app.

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

## Monitoring (Phase 2)

Code is ready in the repo (`public/health.json`, `@vercel/analytics`, `src/lib/monitoring.js`). Finish setup in your dashboards:

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

## Production smoke test

After deploy, verify:

- [ ] PIN login / logout (browser + PWA)
- [ ] Cloud sync between two devices
- [ ] Invoice create, PDF, PayNow QR
- [ ] Delivery → Google / Apple Maps
- [ ] Expense receipt upload, date edit, date filter
- [ ] AI Chat (text + photo)
- [ ] Staff permissions hide restricted modules

---

## Expense receipt storage (Phase 3)

Receipt photos live in Supabase Storage bucket `expense-receipts` (private — not world-readable).

**One-time setup**

1. Run migrations in order (SQL Editor or CLI), including:
   - `supabase/migrations/20250615000000_expense_storage.sql`
   - `supabase/migrations/20250616000000_expense_storage_private.sql`
2. Redeploy: `supabase functions deploy farm-api`

**Behaviour**

- Postgres stores the object path (`receipts/{id}.jpg`) in `expenses.image_url`.
- `farm-api` returns **signed URLs** (4-hour TTL) to logged-in users with the Expenses permission.
- Opening a receipt view refreshes the signed URL; expired links auto-retry via `refresh_expense_receipt`.
- Legacy public URLs and base64 `image_data` still migrate on the next expense sync.
- Deleted or retention-purged expenses remove their storage files.

---

## Roadmap

| Phase | Status |
|-------|--------|
| Phase 1 — README, Analytics, Sentry scaffold, `/health.json` | Done in repo |
| Phase 2 — UptimeRobot monitor, Sentry DSN, enable Vercel Analytics | Code ready — enable in UptimeRobot / Vercel / Sentry dashboards (see above) |
| Phase 3 — Expense receipts → private Storage + signed URLs | Done in repo — run migrations + redeploy `farm-api` |

---

## License

Private — Marugen Koi Farm internal use.
