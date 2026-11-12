# Leanward app (`app/`)

The production web app (PRD §12): plain HTML, CSS and JavaScript with no build step, hosted on GitHub Pages, backed by Supabase, installed to the iPhone Home Screen. Built the same way as PR Forge.

> Status: **M0 — Foundations** (docs/development-plan.md). The shell installs, opens offline and checks its database connection. Real screens arrive in M3 onward; the clickable prototype shows where it's going.

## Run it on your PC

Needs Node 20 or newer.

```bash
cd app
node tools/serve.js
```

Open http://localhost:8001/ (PR Forge uses 8000, so both can run at once). The prototype is at http://localhost:8001/prototype/.

The offline cache (service worker) is off on localhost so a refresh always shows your edits. To test offline mode locally, open http://localhost:8001/?sw=1.

## Tests

```bash
cd app
node --test
```

The tests cover the calculation engine (hand-worked examples), the sync rules, error-report masking and queueing, the offline cache list and version, namespacing of storage and caches, and a check that no secret keys are committed. `tests/rls.test.js` starts a throwaway PostgreSQL, applies `supabase/schema.sql` twice and checks every row level security rule; it's skipped if PostgreSQL isn't installed (GitHub's runners have it). GitHub Actions runs everything on every push and pull request.

## Deploy

Merging to `main` runs the tests, then publishes to GitHub Pages. Leanward has **its own origin** (decisions 2026-11-02): the repo is `Leanward/leanward.github.io`, so the app is at **https://leanward.github.io/** (prototype at `/prototype/`). The app only uses relative paths, so the move needs no code change.

**If a custom domain is added later:** no code change is needed either. With an Actions-based deploy, GitHub ignores CNAME files; set the domain in repo Settings → Pages → Custom domain, add the DNS records GitHub shows, then tick **Enforce HTTPS**. At M3, add the new address to Supabase's redirect URLs and Google's authorized JavaScript origins.

**On every release:** bump `VERSION` in `js/config.js` and `CACHE` in `sw.js` to the same number (a test fails if they differ), so phones fetch the new files.

## One-time setup

1. **GitHub Pages:** repo Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. **Google sign-in** (once; same setup as PR Forge, in a separate Google Cloud project so the Google screen says "Leanward"):
   - Google Cloud project **Leanward** → Google Auth Platform. Branding: app name *Leanward*, home page `https://leanward.github.io/`, privacy policy `https://leanward.github.io/privacy.html`, authorized domain `leanward.github.io`. Audience: External, published ("In production").
   - Clients → Web application **Leanward web**: JavaScript origins `https://leanward.github.io` and `http://localhost:8001`; redirect URI `https://anxpwqbakjqnglqgccfo.supabase.co/auth/v1/callback`.
   - Supabase (Leanward project) → Authentication → Sign In / Providers → **Google**: on, with that client's ID and secret. The secret goes only into Supabase, never into this repo.
   - Supabase → Authentication → URL Configuration: Site URL `https://leanward.github.io/`; redirect URLs `https://leanward.github.io/` and `http://localhost:8001/`.
3. **Database:** open the **Leanward** project in Supabase → SQL Editor → New query, paste all of `supabase/schema.sql`, click **Run**. Safe to run again, and **run it again whenever the file changes** (M2 added the data tables).
4. **Food catalog** (M4), after step 3: add the database connection as a GitHub secret, then run the import.
   - Supabase → your project → **Connect** → **Session pooler** → copy the URI and put your database password in it. (GitHub's runners need the pooler; the direct connection is IPv6-only.)
   - GitHub → repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret**: name `SUPABASE_DB_URL`, value the URI.
   - **Actions** → **Food catalog import** → **Run workflow**. Try a dry run first; it reports what would be loaded. The workflow also runs on the 3rd of each month.
5. Open the app → Profile → **About this build**. "Database" should say **Connected**.

## Layout

```
app/
├── index.html, manifest.webmanifest, sw.js, privacy.html
├── css/app.css            Phase Light styles
├── fonts/                 Onest (SIL Open Font License, fonts/OFL.txt), bundled so nothing loads from outside
├── icons/                 app icons, favicon and the Leanward mark (sources in docs/brand/)
├── js/
│   ├── config.js          version, Supabase URL and publishable key, storage prefix
│   ├── errors.js          error reports: masking, de-duplication, offline queue (pure, tested)
│   ├── sync.js            sync rules: pull, merge, push, tombstones (pure, tested)
│   ├── db.js              the phone's copy in IndexedDB, one database per person
│   ├── gtin.js            barcodes: UPC-A/E, EAN-8/13 → GTIN-14 (pure, tested)
│   ├── foods.js           food catalog search, barcode lookup, Open Food Facts fallback
│   ├── foodui.js          Find a food, food detail and the barcode scanner
│   ├── diary.js           diary entries, units, totals with coverage, copying (pure, tested)
│   ├── library.js         custom foods, saved meals, meal names/order/visibility (pure, tested)
│   ├── review.js          the Nutrient review: groups, 7-day average, ratios, top foods (pure, tested)
│   ├── diaryui.js         the Diary tab, edit sheet, meals, Nutrients and the Home calories card
│   ├── measure.js         weigh-ins, circumferences, chart ranges and scales (pure, tested)
│   ├── progressui.js      the Progress tab: weight trend, waist, intake charts, log and edit sheets
│   ├── cloud.js           Google sign-in, connection check, error sending, Supabase pull/push and the Syncer
│   ├── app.js             the shell UI
│   ├── calc/              calculation engine (M1): pure, tested, every result with its working
│   └── vendor/            supabase-js 2.118.0 (MIT), the same build PR Forge uses; ZXing 0.21.3 (Apache-2.0) for scanning
├── supabase/schema.sql    Leanward's tables (lw_*), row level security, grants
├── tools/serve.js         local server
└── tests/                 node --test
```

## Rules that must hold

- **Own origin.** Leanward runs on its own domain so its storage, caches, permissions and session are separate from PR Forge's. Every storage key still starts with `leanward:v1:` and every cache with `leanward-`, and Leanward never reads, writes or deletes anything else.
- **Secrets.** The Supabase publishable key in `js/config.js` is public by design. Never commit a secret or service-role key, a database password or an OAuth client secret.
- **Error reports** hold technical details only. Messages are masked (quoted text and numbers removed) and app state is never sent. Read them in Supabase → Table Editor → `lw_errors`.
