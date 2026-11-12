# Leanward — Development Plan (app build-out)

> **Version:** 0.2 (draft, for review) · **Date:** 2026-11-02 · **Owner:** Kevin Chavez
> **Based on:** [`PRD.md`](PRD.md) v1.0 (signed off). Requirement IDs (ONB-1, LOG-4 …) refer to PRD §6–§10.
> **Status:** draft. The stack is decided (PRD §12: a GitHub Pages + Supabase web app built like PR Forge). All PRD §15 questions are answered (see §2).

**Naming.** "Phase" already means two things in this project: a product release (PRD §5: Phase 1 MVP, Phase 2, Phase 3) and a diet phase (cut, recomp …). To avoid a third meaning, the build is split into **milestones M0–M9**. Everything in M0–M9 is product Phase 1 (MVP). Phase 2 and 3 work is outlined in §7.

---

## 1. Overview

| # | Milestone | Delivers | Main PRD refs | Size* |
|---|---|---|---|---|
| M0 | Foundations | Repo layout, local server, tests in CI, Supabase project, GitHub Pages deploy, installable app shell | §10, §12 | S |
| M1 | Calculation engine | Pure, versioned, unit-tested JavaScript for all of §8 | §8, §10 Correctness | M |
| M2 | Data model, security and sync | Postgres schema + RLS, on-phone IndexedDB store, sync engine | §11, §10 Offline/Security, LOG-12 | L |
| M3 | Sign-in, onboarding and phases | Google sign-in, profile, goal → phase → targets with the working shown, phase management | ONB-*, PHS-* | M |
| M4 | Food catalog and search | USDA + Open Food Facts import, search, barcode lookup, source badges | §7 FDB-*, LOG-3/4 | L |
| M5 | Food logging and nutrition | Diary, add sheet, camera barcode scanning, quick add, custom foods, saved meals, copy, nutrient views | LOG-*, NUT-* | L |
| M6 | Measurements, progress and PR Forge | Weight + trend, waist, lifts (manual + from PR Forge), charts, phase progress read | MEA-*, PRG-*, PHS-4 | M |
| M7 | Home, account and data | Home screen, settings, units, export, account deletion, reminders | HOM-*, ACC-*, §6.9 | M |
| M8 | Hardening and beta | Performance, accessibility, error reporting, privacy/legal, beta with a small group | §9, §10, §13, §14 | M |
| M9 | Launch | Beta fixes, P1 fast-follows, public release | §13 | S |

\*Relative size only (S / M / L). Calendar estimates come after M0 and the M2 sync work, when there's real velocity to estimate from.

**Order and overlap**

```
PRD sign-off
   │
   ├── Prototype (prototype/) ───────────────┐   UI flows agreed here before M3/M5/M6/M7 screen work
   │                                          │
   ├── M0 Foundations                         │
   │     ├── M1 Calc engine ──────────────────┼──► M3 Onboarding ──► M5 Logging ──► M6 Progress ──► M7 Home/Account ──► M8 Beta ──► M9 Launch
   │     ├── M2 Data + sync ──────────────────┘          ▲
   │     └── M4 Food catalog (backend) ──────────────────┘
```

- **M1, M2 and M4 have no screens**, so they can run alongside the prototype once the PRD is signed off. That shortens the path without breaking the PRD → prototype → build rule for anything users see.
- **Critical path:** M2 (sync) → M5 (logging). The sync rules are copied from PR Forge, which lowers the risk, but Leanward syncs many more kinds of data.
- **Bonus of the web stack:** the prototype and the real app are both web pages, so screens from the prototype can be carried into `app/` instead of rebuilt.
- **Screen work (M3, M5–M7) starts only after the prototype has settled the matching flow.**

## 2. Assumptions this plan depends on

**Decided** (PRD v0.2): GitHub Pages + Supabase web app like PR Forge (Q2) · public repo, free Pages hosting (R) · sign-in required (Q3) · USDA + Open Food Facts (Q4) · US-only (Q5) · §8 defaults (Q7) · scope changes S1–S6 (Q1) · PR Forge connection wanted (Q6).

**Also decided** (PRD v0.3), and where each lands in this plan:

| Question | Answer | Effect on the plan |
|---|---|---|
| 6a PR Forge connection: when | In the MVP | Built in M6 |
| 6b PR Forge connection: how | Separate Supabase projects; one-time "Connect PR Forge" sign-in; read-only (revised 2026-11-03) | M0 uses Leanward's own project; M6 adds the connection |
| 8 Exercise calories | Not added back | No workout-calorie entry in M1/M5 |
| 9 Age gate | 18+ | Date-of-birth gate in M3 |
| 10 Monetization | Free MVP; web payments later | Entitlement switch only, in M7 |
| 13 Error reporting | Leanward's own Supabase table | `errors` table and handler in M0 |

**Other assumptions**
- **Solo build, AI-assisted.** Milestones are ordered so there's always a working app on `main`.
- **You develop on Windows.** Nothing needs a Mac: run `node tools/serve.js` on your PC to work locally, and open the deployed address on your iPhone to test, as with PR Forge. No Apple developer account is needed.
- **Target:** iPhone Safari on iOS 17+, from the home-screen icon (PRD §10). Other browsers may work but aren't tested.
- **Same habits as PR Forge:** plain HTML/CSS/JS, no build step, logic separate from UI, `node --test` for tests, a version bump in the service worker on every release.

## 3. Proposed repository layout (under `app/`)

CLAUDE.md puts production code in `app/`. It follows PR Forge's layout:

```
app/
├── index.html           # The app shell (five tabs + global +)
├── manifest.webmanifest # Home-screen name, icons, colors
├── sw.js                # Service worker: offline caching, versioned per release
├── css/
├── fonts/               # Bundled, so nothing loads from outside at runtime
├── icons/
├── js/
│   ├── calc/            # M1 — calculation engine (pure, no DOM or network)
│   ├── db.js            # M2 — IndexedDB store on the phone
│   ├── sync.js          # M2 — sync rules (pure)
│   ├── cloud.js         # Sign-in and Supabase calls
│   ├── units.js, nutrients.js …  # Other pure logic
│   ├── app.js           # UI
│   └── vendor/          # Bundled libraries (supabase-js, barcode decoder, charts if used)
├── supabase/            # schema.sql, RLS policies, edge functions, test SQL
├── tools/
│   ├── serve.js         # Local server, as in PR Forge
│   └── food-import/     # M4 — USDA / Open Food Facts import (Node scripts)
└── tests/               # node --test
```

GitHub Pages serves the `app/` folder through a GitHub Actions workflow, since Pages can only serve a repo's root or `/docs` folder directly. That workflow also runs the tests first.

## 4. Milestones in detail

Each milestone has an **exit criteria** list. A milestone is done when every item is met and verified, not just written.

### M0 — Foundations
**Goal:** an empty app shell that installs on your iPhone, works offline and talks to Supabase, with tests guarding `main`.

- Layout per §3; `tools/serve.js` for local work; `.editorconfig` and LF line endings kept.
- App shell: five tabs (Home · Diary · Progress · Phase · Profile) + global **+** (§6.9) as placeholders; web manifest and icons; service worker caching with a version constant.
- Supabase: Leanward has its own project (Q6b, revised 2026-11-03). Tables keep the `lw_` prefix. Schema kept in `supabase/schema.sql`, safe to run more than once (as in PR Forge).
- GitHub Actions: run `node --test` on every push and PR; deploy `app/` to GitHub Pages from `main` when tests pass.
- Make the repo public (decision R), then turn on Pages with source = GitHub Actions. Before it goes public and on every PR after: no keys other than Supabase's public "anon" key, no backups or exports with personal data (`.gitignore` blocks them, as in PR Forge).
- Error reporting (Q13): an `errors` table that accepts error reports from the app (message, file and line, app version, browser), and a small global handler that never includes food or body data.

**Status (2026-11-02):** built — shell, offline cache, `lw_ping` / `lw_errors` schema, error reporter, CI and Pages deploy, 18 tests. Done since: the repo moved to `Leanward/leanward.github.io` and deploys to https://leanward.github.io/ from GitHub Actions (2026-11-02). Leanward moved to its own Supabase project (2026-11-03). `app/supabase/schema.sql` was run in the Leanward project and the live site shows version 0.1.1 with **Database: Connected** (2026-11-03, checked by the owner on PC). Still to check: the iPhone install and opening it in airplane mode.

**Exit criteria:** the deployed address opens on your iPhone and installs to the home screen; the shell opens in airplane mode after the first visit; the app reads a test row from Supabase; tests run green in Actions; run and deploy instructions are in `README.md`.

### M1 — Calculation engine (`js/calc/`)
**Goal:** every number Leanward shows comes from one pure, tested, explainable module.

- BMR (Mifflin-St Jeor incl. the "prefer not to say" midpoint; Katch-McArdle), TDEE by activity level (§8.1).
- Safety floors and caps: calorie floor, deficit cap, rate caps, underweight guard, pregnancy/breastfeeding rule, floors on manual edits (§8.2).
- Phase calorie targets for every phase type and rate option (§8.3).
- Macros and fiber: protein by reference weight (incl. the BMI > 30 rule), fat default and floor, carb remainder with the < 50 g handling, fiber 14 g/1,000 kcal, warnings for manual splits (§8.4).
- DRI tables (RDA/AI/UL) by age and sex for every NUT-2 nutrient (NUT-3), plus the limits, guidelines and ratios in PRD §8.8 (saturated fat and added sugar % kcal, sodium CDRR, EPA + DHA guideline, Na:K ratio, fiber per 1,000 kcal).
- Weight trend (EWMA α = 0.1, first weigh-in of the day, carry-forward), weekly average, 14-day rate (§8.5).
- Epley e1RM (≤ 12 reps) (§8.7). PR Forge already computes estimated 1RMs (`js/metrics.js`), so reuse or match its formula so the two apps agree.
- Phase progress read: signals, thresholds and the "collecting data" rule (PRG-2, PRG-3), returning on track / watch / off track **plus the numbers behind it**.
- **Explanations as data:** every function returns its result *and* a breakdown ("BMR 1,780 × 1.55 = 2,760 …") that the UI shows (ONB-7; CLAUDE.md "no opaque scores").
- A `CALC_VERSION` constant stored on each phase and target set (§11).
- Unit conversion helpers (lb/kg, in/cm) with a fixed rounding policy.
- Optional early start: the adaptive TDEE function (§8.6), to prove the data shapes support it.

**Testing:** `node --test` files per section with **hand-worked examples** (inputs, expected output, the arithmetic in a comment), covering every phase × rate, every floor and cap, and boundaries (BMI 18.5/30, age 18, 12 vs 13 reps, < 14 days of data).

**Status (2026-11-03):** M1a built in `app/js/calc/` — `core` (units, rounding, dates), `energy` (§8.1), `targets` (§8.2–8.3), `macros` (§8.4), `trend` (§8.5), `strength` (§8.7), `alcohol` (§8.9) and `plan` (the whole working for ONB-7), with 44 hand-worked tests. Decisions on details §8 left open are in PRD §8.10. **M1b built (2026-11-03):** `dri` (RDA/AI and ULs for every NUT-2 nutrient by life stage, incl. pregnancy and lactation), `nutrients` (limits, guidelines, ratios, furthest-from-target), `progress` (PRG-2/3/4) and `adaptive` (§8.6), with 20 more tests. **Open before M5 shows nutrients:** the DRI values were entered from the standard NASEM tables but not yet checked line by line against the source (NAP and NCBI were blocked from the build environment); `dri.VERIFIED` stays false until they are.

**Exit criteria:** all of §8 implemented; tests pass in CI; each formula's source is cited in comments matching PRD Appendix A; you've checked a sample of worked examples by hand.

### M2 — Data model, security and sync
**Goal:** data lives on the phone first, syncs safely, and no user can ever read another user's rows.

- **Phone storage: IndexedDB**, not `localStorage`. A food diary with nutrient snapshots and cached foods will outgrow `localStorage`'s few megabytes. A small wrapper (`js/db.js`) keeps the rest of the code simple.
- **Sync: reuse PR Forge's rules** (`js/sync.js` there): client-made IDs, server-stamped `updated_at` (so wrong phone clocks don't matter), last-write-wins per row, tombstones for deletes, replays don't duplicate. Leanward adds more tables and a per-table "changed since" pull.
- Postgres schema for every §11 entity, using real columns instead of one JSON blob per row. Leanward needs to search, chart and export these, which PR Forge doesn't. Includes `Recommendation` (unused until Phase 2).
- DiaryEntry **nutrient snapshot** at log time (§4 Intake).
- Row-level security on every user-owned table; the shared food catalog is read-only to the app.
- PR Forge (Q6b): its data stays in PR Forge's own project. Leanward never writes there; the read-only connection is built in M6.
- Hard delete only in account deletion (ACC-1).

**Testing:** pure sync-rule tests with `node --test` (as PR Forge's `tests/sync.test.js`); RLS tests in SQL (user A can't read, write or delete user B's rows on any table); a manual offline test on the iPhone.

**Status (2026-11-03):** built — `supabase/schema.sql` has 13 synced tables (every §11 MVP entity plus Recommendation) with real columns and checks; `js/sync.js` (per-table pull/merge/push, tombstones, 5-minute pull overlap); `js/db.js` (one IndexedDB database per signed-in person); a Syncer in `js/cloud.js` and a **Backup** row in Profile. Tests: 12 sync-rule tests, and `tests/rls.test.js` runs the schema twice on a throwaway PostgreSQL and checks 82 rules (it fails when a policy is loosened). Checked in Chromium with real IndexedDB. Not done yet: the labs tables (Phase 2, with LAB-8's stricter handling), the shared food catalog (M4), and the iPhone airplane-mode test, which needs screens that create data (M3/M5).

**Exit criteria:** `schema.sql` applies cleanly to an empty project and re-runs safely; RLS tests pass; an entry made in airplane mode on the iPhone shows up in Supabase once back online, exactly once.

### M3 — Sign-in, onboarding and phases
**Goal:** a new user gets from first open to a confirmed phase with explained targets in ≤ 2 minutes.
**Needs first:** prototype onboarding flow agreed; M1, M2.

- Google sign-in (as PR Forge) (ONB-1), built early (2026-11-03, v0.2.0). Email/password is deferred (decisions 2026-11-03).
- Profile capture incl. 18+ gate, sex-for-calculation, height, weight, activity level with descriptions, training/week (ONB-2); optional BF% + source, waist (ONB-3); optional pregnancy/breastfeeding question (§8.2).
- A short "add to home screen" step, as PR Forge's welcome screen has. iOS keeps a home-screen app's data, but can clear a Safari tab's.
- Goal → suggested phase → confirm (ONB-4); rate picker showing expected weekly change in the user's units (ONB-5).
- Targets screen with the working and editable targets, floors enforced (ONB-7). Units at onboarding, changeable later (ONB-9).
- Phase management: one active phase, start a new phase (closes the old one), change goal without losing history, mid-phase edits create a new target-set version (PHS-1, -2, -3, -5, -7).
- P1: dietary preferences (ONB-6), planned-end prompt (PHS-6).

**Status (2026-11-03, in progress):** onboarding (about you → activity → goal → phase and rate → targets with the working and edits held at the floor → food preferences → Home Screen), saved to the M2 tables; Phase tab (goal, phase, day count, progress read, targets with working, edit targets as a new version, start a new phase, history); Home targets card; Profile details and units. `js/model.js` (11 tests) and `js/screens.js`. Clicked through in Chromium. Owner test on the iPhone (2026-11-03): setup took about 2 minutes (ONB-8 met); the targets were confusing and the formula overestimated their maintenance, which led to ONB-10 ("I know my numbers", v0.5.0). Owner check of v0.5.0 passed (2026-11-03): backup up to date, targets with a known maintenance look right. **M3 done.** Still worth doing once: sign in on a second device to see the account restore without onboarding again.

**Exit criteria:** onboarding finished in ≤ 2 minutes on the iPhone with optional steps skipped (ONB-8, timed); targets match M1 for a set of test profiles; underweight and pregnancy guards checked by hand.

### M4 — Food catalog and search
**Goal:** fast, honest food search and barcode lookup over our own database.
**Can start:** in parallel with M1/M2 after M0.

- Import scripts (`tools/food-import`, Node) for USDA FoodData Central **bulk downloads**: Foundation, SR Legacy, FNDDS, Branded (FDB-2). Repeatable and safe to re-run; branded data refreshed monthly.
- **Check database size early.** The Branded Foods set is large, and Supabase's free plan has a database size limit. Measure the imported size; if it doesn't fit, choose between a paid plan, trimming fields, or importing a subset first. Record the choice in `decisions.md`.
- Name cleanup for generic foods (readable names, raw/cooked in the name, LOG-6).
- Open Food Facts barcode fallback in **its own table**, with attribution and corrections kept separable (FDB-3); records missing calories or any macro hidden (FDB-6).
- Source and verification badges on every food (FDB-1); one record per barcode, near-duplicate names collapsed (FDB-4).
- Search as a Postgres function (full-text + trigram) called through Supabase; ranking = user's history → verified → community (FDB-4).
- Barcode lookup (UPC-A/E, EAN-8/13 normalized to GTIN-14).
- **Barcode scanning test:** try a JavaScript barcode library through the iPhone camera in Safari, from the home-screen app, early. Measure the time to a result against the 1.5 s target (§10).
- Food reports table (FDB-5). Draft the Open Food Facts attribution and legal page; re-check USDA/OFF terms (PRD §7).

**Status (2026-11-03, M4a built):** catalog table `lw_foods` (shared, read-only to the app) with full-text + word-level trigram search `lw_search_foods` (raw/cooked ranking, generic before branded, duplicates collapsed) and `lw_food_by_barcode`; `js/gtin.js` (UPC-A/E, EAN-8/13 → GTIN-14); `tools/food-import` (streaming CSV, nutrient-id safety check, energy fallback, FDB-6 filter, one record per barcode) and `load.sql`; the GitHub workflow (manual + monthly, dry run reports sizes). Tests on hand-made samples in USDA's layout, including a real-PostgreSQL load and search. Dry and measure runs on GitHub (2026-11-03): SR Legacy 7,793 and FNDDS 5,431 foods convert cleanly; Branded keeps 466,145 of 2,010,212 rows; measured size 31.5 MB generic, 389 MB with Branded (decisions). **Loaded into Supabase (2026-11-03):** 479,369 foods, database 392.7 MB. Not done yet: the app's search and barcode screens, Open Food Facts lookup, the search-quality set and latency checks.

**M4b (2026-11-03):** Find a food (search with source badges, LOG-3), food detail (per 100 g / per serving, nutrients, source and attribution, NUT-5, FDB-1/3), Report a problem (FDB-5, saved to `lw_food_reports`), barcode scanning (ZXing) with USDA then Open Food Facts (LOG-4), privacy page updated. Checked in Chromium with a fake camera playing a real EAN-13: read in 0.2 s. Owner check on the iPhone (2026-11-04): search and barcode scanning work on the live catalog. Still to measure for M4's exit criteria: the search-quality set (~100 queries) and p95 latency, and the barcode hit rate and scan time on ~50 pantry items.

**Testing:** import tests on a small fixture of real records; a search-quality set of ~100 common queries with expected top-5 results (§13 "search success ≥ 80%"); latency against §10 (< 800 ms p95 server search).

**Exit criteria:** the USDA catalog is imported (or the size decision is made and recorded); the search-quality set passes its agreed threshold; p95 search latency meets §10; barcode hit rate measured on ~50 US packaged foods from your pantry (target ≥ 85%, §13); scan speed measured on the iPhone.

### M5 — Food logging and nutrition display
**Goal:** daily logging that's fast, works offline, and shows trustworthy nutrient totals.
**Needs first:** prototype diary + add flow agreed; M2, M3, M4.

- Diary by day with configurable slots (LOG-1); global **+** opening on Recent/Frequent with search focused (LOG-2).
- Search results and food detail with the full panel per serving and per 100 g, plus source and verification (LOG-3, NUT-5).
- Camera barcode scanning; not found → create food with the barcode prefilled (LOG-4).
- Serving units and free quantities (LOG-5); quick add (LOG-7); custom foods (LOG-8).
- Saved meals with one-tap logging and scaling (LOG-9); copy meal or day, "repeat yesterday's breakfast" (LOG-10); edit, delete, move (LOG-11).
- Offline: recents, frequents, custom foods, saved meals and previously scanned foods kept on the phone (§10 Offline, LOG-12). Search of foods never seen before needs a connection; the app says so.
- Day totals vs targets incl. fiber (NUT-1); the **Diary nutrient review** (NUT-6): every NUT-2 nutrient in sections with DRI targets, neutral "above UL" (NUT-3), **data coverage** below 100% (NUT-4, S5), Day / 7-day average, and a "furthest from target" summary. P1: top contributing foods, ratios and quality card, per-meal macros (NUT-7).
- Neutral over-target styling and copy (LOG-13). Food reports and "make a private copy" (FDB-5).

**Status (2026-11-04, M5a built):** Diary tab (day navigation, totals vs that day's targets with fiber and a coverage note, six slots with per-slot macros), the add sheet opening on Recent/Frequent with search focused (LOG-2), amount + unit + meal on the food detail (LOG-5), Quick add (LOG-7), edit/move/delete (LOG-11), Copy yesterday and Repeat yesterday's breakfast (LOG-10), Home calories left/eaten, neutral over-target copy (LOG-13). Entries snapshot their nutrients and per-100 values (`js/diary.js`), so they can be edited and re-logged offline. Checked in Chromium incl. logging offline then syncing with no duplicates.

**Status (2026-11-04, M5b built):** custom foods typed from the label per serving and stored per 100 g, with a 4/4/9 "do the calories add up?" check and plain-language limits (LOG-8); **Create this food** from a missed scan with the barcode filled in, and your own foods found first by search and scan, offline too (LOG-4); **Make my own copy** of any food (FDB-5); saved meals from any Diary slot, logged at ½, ×1, ×1.5 or ×2 (LOG-9); copy one meal to another day or slot (LOG-10); rename, reorder and hide meals, stored in `lw_profiles.preferences.slots` (LOG-1); **Diary › Nutrients** with Day / 7-day average (logged days only), grouped amounts, data coverage, top contributing foods, and Ratios and quality (NUT-6, NUT-7). Logic in `js/library.js` and `js/review.js` (pure, tested). "Foods high in" a nutrient (NUT-7) still needs a catalog query.

**2026-11-06:** DRI values verified against NASEM Appendix J; micronutrient targets, % of target and "Furthest from target" are on. Catalog search reworked after a read-only check on the real catalog (decisions, 2026-11-06); the M4 exit metric for search latency now has a tool (`search_check`).

**Testing:** `node --test` for nutrient totals, snapshots and coverage; a written manual test script on the iPhone for search-log, barcode-log, saved-meal-log, copy-day and offline-log-then-sync. Browser automation (Playwright) on a PC can cover the same flows later, but it isn't iPhone Safari.

**Exit criteria:** a saved meal logs in ≤ 3 taps and a frequent item in ≤ 5 s (G1, §13); a full day can be logged in airplane mode and syncs with no duplicates; coverage shows correctly for a branded-only day.

### M6 — Measurements, progress and PR Forge
**Goal:** the core differentiator. The app can tell Alex his recomp is working.
**Needs first:** prototype progress + phase screens agreed; M1, M2, M3.

- Weight logging, multiple a day, first-of-day for the trend (MEA-1); trend and weekly average labelled "derived" (MEA-2).
- Waist with how-to-measure guidance (MEA-3); other circumferences (P1); body-fat entries labelled "estimate" (MEA-4, P1).
- Key lifts: pick up to 5; e1RM over time (MEA-5).
  - **From PR Forge** (Q6): a one-time **Connect PR Forge** step signs the user in to PR Forge's Supabase project with Google, using a second, read-only client in Leanward. Leanward never writes to PR Forge, and the PR Forge session can be disconnected in Profile. Then read the user's finished PR Forge workouts and take each key lift's best working set per session. Warm-ups and edited or imported workouts follow PR Forge's own rules. Then match PR Forge exercise names to the chosen key lifts.
  - **Manual entry** for people without PR Forge, or for lifts it doesn't have.
- Edit/delete for every measurement (MEA-6).
- Charts: weight dots + trend, waist, e1RM per lift, average calories and protein vs target; 4w / 12w / 6m / all; phase boundaries on every chart (PRG-1). Each chart has a spoken summary for VoiceOver (§9). Hand-drawn SVG, or a small bundled chart library if that proves too slow to build.
- Phase progress read per phase type, with "collecting data" state and plain copy (PRG-2, -3, -4).
- **Maintenance check (PRG-5, P1):** run `calc/adaptive` weekly on the diary (M5) and weigh-ins; show what's still needed until 21 good days exist; then offer a Recommendation (`lw_recommendations`) with the working, which becomes a new target version only when accepted. Moved into the MVP 2026-11-03.
- Phase tab: goal, phase + day count, targets, progress read, phase history (PHS-4).

**Status (2026-11-12, M6a built):** Progress tab with weigh-ins (several a day, the trend uses the first; MEA-1), trend and weekly averages labelled derived (MEA-2), waist plus hips, chest, arm, thigh and neck with how-to-measure guidance (MEA-3), edit and delete (MEA-6), and hand-drawn SVG charts for weight (dots + trend), waist, calories and protein vs target over 4 weeks / 12 weeks / 6 months / all, with phase starts marked and a spoken summary each (PRG-1). Home has a weight card. The Phase tab's "Is it working?" now reads real weigh-ins and waist, in the user's units (PRG-2/3/4). Logic in `js/measure.js` (pure, tested). Checked in Chromium with 70 days of seeded data. **M6b:** key lifts (manual and from PR Forge), body-fat entries (MEA-4), the maintenance check (PRG-5), persona seeds.

**Testing:** progress-read logic is tested in M1; here, seeded data for each persona (Alex recomp, Maya cut, Sam nutrition-only), plus your real PR Forge history, checked on screen against the expected read.

**Exit criteria:** each persona's data produces the expected read and copy; your PR Forge lifts appear with the same e1RMs PR Forge shows; charts draw 6 months of daily data smoothly on the iPhone.

### M7 — Home, account and data
**Goal:** the app is complete enough to hand to beta testers.
**Needs first:** prototype home screen agreed; M3, M5, M6.

- Home: calories remaining + P/C/F (HOM-1), phase card with headline signal (HOM-2), ≤ 4 cards (HOM-5); P1: quick log by time slot (HOM-3), one daily insight (HOM-4).
- Profile/settings: units, slots, targets, phase links, PR Forge connection status.
- Export all data as CSV and JSON (ACC-2).
- In-app account deletion removing all Leanward server data (ACC-1), through a server-side function. PR Forge data lives in its own project and isn't touched, and the screen says so; deleting also disconnects PR Forge.
- Eating-disorder resources link (ACC-4).
- Entitlement switch so premium can be turned on later (S4); no paywall.
- P1: reminders (ACC-5), off by default and never shaming. iOS allows web push only for home-screen apps; test it on the iPhone.

**Exit criteria:** export round-trips (every entity present in the files); deleting an account removes every Leanward row for that user (verified by query); all P0 requirements in PRD §6 are implemented.

### M8 — Hardening and beta
**Goal:** meet the non-functional bar and learn from real users.

- Performance against §10 on the iPhone: cold start < 2 s, cached search < 300 ms, server search < 800 ms p95, barcode < 1.5 s.
- Reliability: review the error table; sync stress test (long offline period, many edits).
- Accessibility pass: text scaling, VoiceOver labels, 4.5:1 contrast, color never the only signal (§9).
- Instrumentation: first-party event counts only, no food names or body data (ACC-3, §13); a simple Supabase view or page for the §13 metrics.
- Privacy policy and terms pages (as PR Forge has `privacy.html`); OFF attribution live; licensing re-check (§7, §14).
- Copy review for neutral tone on every screen (§9, LOG-13, PRG-4).
- Name checks: domain, USPTO (§14, decisions log). Optional custom domain on GitHub Pages.
- Beta: send the link to a small group; feedback channel.

**Exit criteria:** every §10 target measured and met (or a logged decision to accept the gap); beta has run long enough to read day-7 retention; no open data-loss bugs.

### M9 — Launch
- Fix beta findings; ship any P1 items that slipped (PRD §6).
- Production checks: Supabase backups and usage alerts (§14 cost risk); service-worker version bump and update flow tested.
- Public release: share the address; a short "install on iPhone" page.
- Post-launch: watch the §13 metrics, error table and food reports; start the Phase 2 backlog.

## 5. Cross-cutting practices

- **Branches and PRs:** `feat/…`, `fix/…`, `docs/…` branches with a PR for every change (CLAUDE.md); tests must pass before merge, and merging to `main` deploys.
- **Definition of done** for any requirement: implemented, tests written where logic is involved, checked on the iPhone from the home-screen icon for UI, offline behavior checked where relevant, PRD ID cited in the PR.
- **Testing layers:** `node --test` for pure logic (calc, sync, units, nutrients) → SQL tests for schema and RLS → manual iPhone test scripts for flows. Anything untested is called out in the PR, never implied.
- **Releases:** bump the service-worker version on every release so phones fetch the new files (as with PR Forge).
- **Decisions:** anything that changes scope or architecture (database size plan, barcode library, chart approach) goes in `decisions.md`.
- **Scope control:** cut or defer P1s before slipping P0s (PRD §14). New ideas go into the PRD first.
- **Health-content rule:** any change to a target, floor or progress rule goes through M1 with tests and a PRD §8 update. No inline math in UI code.

## 6. Build risks

| Risk | Milestone | Mitigation |
|---|---|---|
| Sync across many tables is harder than PR Forge's | M2, M5 | Reuse PR Forge's rules and tests; per-table pull; idempotency tests in CI |
| iOS clears data for web apps | M2, M3 | Home-screen install step in onboarding; cloud copy is the backup; IndexedDB for storage |
| Barcode scanning in Safari is slow or unreliable | M4, M5 | Test a library on the iPhone in M4, before building M5 around it |
| USDA catalog doesn't fit the free database | M4 | Measure in M4; decide plan, trimming or subset early |
| Public repo exposes something private | M0 onward | Only the public anon key in code; secrets live in Supabase and GitHub Actions secrets; personal exports blocked by `.gitignore` |
| Reading PR Forge's data from another Supabase project | M6 | Read-only client that uses PR Forge's existing row-level security; nothing written to PR Forge; matching tests against your real PR Forge history |
| USDA data needs more cleanup than expected | M4 | Start M4 alongside the prototype; fixed query set to measure quality |
| MVP too large for one person | All | Strict P0/P1; each milestone ends with a usable app; cut P1s first |
| Formula or threshold errors reach users | M1, M6 | Hand-worked tests, explanations shown to users, `CALC_VERSION` on stored targets |

## 7. After the MVP (outline)

Planned in detail when the MVP ships; listed so M1/M2 choices leave room for them.

**Product Phase 2 — Advanced nutrition** (PRD §5.3)
- Adaptive TDEE + Recommendations with accept/decline (§8.6). The data model is ready from M2, and the function can be written early in M1.
- Weekly check-ins, reverse diet, phase comparisons.
- **Lab results (PRD §6.10):** "Import labs" with on-phone PDF reading (pdf.js, bundled like supabase-js) and parsers for common US lab report layouts, optional manual entry, review-before-save screen, Labs screen with history against the lab's ranges, links to nutrients, suggestions that create target versions when accepted, and the LAB-7 safety rules. Needs redacted sample reports (from several labs if possible), kept out of the repo. The M2 schema reserves `lab_reports` and `lab_results`.
- **Apple Health / Apple Watch:** not available to a web app. Needs the app wrapped for the App Store (e.g. Capacitor) or a third-party bridge. Decide when Phase 2 is planned.
- Recipe builder, advanced micronutrient reports, pattern insights, advanced search.
- Progress photos (private Supabase storage, privacy review).
- Premium through web payments (e.g. Stripe) behind the M7 entitlement switch.
- AI photo and voice logging, always badged "AI-estimate" (FDB-1).

**Product Phase 3 — Body composition platform** (PRD §5.4)
- Advanced adaptive model, Garmin, body-composition analytics, deeper training-performance integration with PR Forge, meal planning, coach/dietitian sharing.

## 8. Immediate next steps

1. ~~Sign off the PRD~~ — done 2026-11-02 (v1.0).
2. Review this plan.
3. On PRD sign-off: start the **prototype** and **M0** together.
4. Then M1, M2 and M4 (including the database-size and barcode checks), all while the prototype iterates.
