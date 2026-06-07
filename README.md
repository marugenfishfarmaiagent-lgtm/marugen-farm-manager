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

1. Create a Supabase project.
2. Run migrations from `supabase/migrations/` in order (or use Supabase CLI `supabase db push`).
3. Deploy edge functions:

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

## Monitoring

### Health check (UptimeRobot — Phase 2)

Static endpoint for uptime monitors:

```
GET https://your-domain/health.json
```

Expected: HTTP `200` and JSON `"status":"ok"`.

**UptimeRobot setup**

1. Sign up at [uptimerobot.com](https://uptimerobot.com).
2. Add monitor → **HTTP(s)**.
3. URL: `https://marugen-farm-manager.vercel.app/health.json` (or your custom domain).
4. Optional keyword: `ok`.

### Vercel Analytics (Phase 2)

Code includes `@vercel/analytics`. Enable in **Vercel → Project → Analytics** (dashboard toggle). No extra env vars.

### Sentry (Phase 2)

1. Create a project at [sentry.io](https://sentry.io).
2. Copy the **DSN**.
3. Add `VITE_SENTRY_DSN` in Vercel environment variables.
4. Redeploy.

If `VITE_SENTRY_DSN` is unset, Sentry does not initialize (no errors, no overhead).

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

Receipt photos are stored in Supabase Storage bucket `expense-receipts` (not as base64 in Postgres).

**One-time setup**

1. Run `supabase/migrations/20250615000000_expense_storage.sql` in Supabase SQL Editor (creates the bucket).
2. Redeploy the edge function: `supabase functions deploy farm-api`.

**Behaviour**

- New uploads go to Storage; `expenses.image_url` holds the public URL; `image_data` stays empty.
- Legacy rows with base64 `image_data` migrate automatically on the next expense sync.
- Deleted or expired expenses remove their storage files.

---

## Roadmap

| Phase | Status |
|-------|--------|
| Phase 1 — README, Analytics, Sentry scaffold, `/health.json` | Done in repo |
| Phase 2 — UptimeRobot monitor, Sentry DSN, enable Vercel Analytics | Manual (your accounts) |
| Phase 3 — Expense receipts → Supabase Storage (replace base64 in DB) | Done in repo — run migration + redeploy `farm-api` |

---

## License

Private — Marugen Koi Farm internal use.
