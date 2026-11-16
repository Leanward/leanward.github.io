# Requirements audit (M8)

Date: 2026-11-16 · App version 0.14.0 · Against `docs/PRD.md` v1.6.

Every must-have (P0) requirement, where it lives, and how far it has been checked. "Tests" means the automated suite (`node --test`, 178 tests, some on a real PostgreSQL). "Browser" means a scripted run in Chromium at phone width with stand-in servers. "Owner" means Kevin has used it on his iPhone. Nothing here claims more than that.

## Status of every P0

| ID | Requirement (short) | Status | Where | Checked by |
|---|---|---|---|---|
| ONB-1 | Google sign-in required | Done | `cloud.js`, `app.js` | Owner |
| ONB-2 | Date of birth (18+), sex, height, weight, activity, training; optional goal weight | Done. Goal weight is on the Phase tab, not in setup (keeps setup under 2 minutes) | `screens.js`, `model.js` | Tests, Browser, Owner (setup) |
| ONB-3 | Optional body fat with source, waist | Done | `screens.js` | Browser |
| ONB-4 | Goal → suggested phase → confirm | Done | `screens.js` | Owner |
| ONB-5 | Rate of change with expected weekly change | Done | `calc/targets.js` | Tests, Owner |
| ONB-7 | Targets with the working; editable | Done | `calc/plan.js`, `screens.js` | Tests, Owner |
| ONB-8 | Setup ≤ 2 minutes | Done (owner timed about 2 minutes) | | Owner |
| ONB-9 | Units chosen and changeable | Done | Profile | Browser |
| ONB-10 | "I know my numbers" | Done | `calc/energy.js`, `screens.js` | Tests, Owner |
| PHS-1 | One active phase; type, dates, rate, optional target weight, target history | Done | `model.js` | Tests, Browser |
| PHS-2 | Start a new phase; the old one is kept | Done | `model.startPhase` | Tests |
| PHS-3 | Changing the goal deletes nothing | Done | `model.js` | Tests |
| PHS-4 | Phase screen: goal, phase and day, targets, progress read, history | Done | `screens.phaseView` | Browser, Owner |
| PHS-5 | Editing targets creates a new version; past days keep theirs | Done | `model.editTargets`, `model.targetsFor` | Tests |
| PHS-7 | Nutrition phase: no weight target, no deficit language | Done (no goal weight offered; "about the same as maintenance") | `screens.js`, `calc/progress.js` | Tests |
| LOG-1 | Diary by day, six slots, rename / hide / reorder | Done | `diaryui.js`, `library.js` | Tests, Browser |
| LOG-2 | + from every tab; opens on Recent / Frequent, search focused | Done | `foodui.js` | Browser, Owner |
| LOG-3 | Search generic, branded, custom foods and saved meals | Done (saved meals added in 0.14.0) | `foodui.js`, `schema.sql` | Tests, Browser, Owner (catalog) |
| LOG-4 | Barcode scan; not found → Create this food | Done | `foodui.js`, vendored ZXing | Browser (fake camera), Owner |
| LOG-5 | Units: g, oz, ml, fl oz, cup, tbsp, tsp, labelled servings; free quantity | Done, with one decision: cup/tbsp/tsp only for foods measured in ml, because a solid needs its own density (its labelled servings give that) | `diary.unitsFor` | Tests |
| LOG-7 | Quick add | Done | `diary.quickAdd` | Tests, Browser |
| LOG-8 | Custom foods, private | Done | `library.js` | Tests, Browser |
| LOG-9 | Saved meals, one tap, scaling | Done | `library.js` | Tests, Browser |
| LOG-10 | Copy a meal or day; repeat yesterday's breakfast | Done | `diaryui.js` | Tests, Owner |
| LOG-11 | Edit, delete, move entries | Done | `diary.updateEntry` | Tests, Browser |
| LOG-12 | Offline logging, sync without duplicates | Done | `sync.js`, `db.js` | Tests, Browser, Owner (airplane mode on the iPhone, 2026-11-16: logged food and a weigh-in offline; both backed up after reconnecting) |
| LOG-13 | Over target shown neutrally | Done | `diary.versusTarget` | Tests |
| NUT-1 | Day totals vs target, fiber | Done | `diaryui.js` | Browser |
| NUT-2 | Detail nutrients | Done for every nutrient the source provides | `diary.NUTRIENTS` | Tests |
| NUT-3 | DRI targets; "above UL" | Done; values verified against NASEM Appendix J | `calc/dri.js` | Tests, source check |
| NUT-4 | Data coverage shown | Done | `diary.totals`, `review.js` | Tests |
| NUT-5 | Food detail: per serving and per 100 g, source | Done | `foodui.js` | Browser |
| NUT-6 | Nutrient review, day / 7-day, furthest from target | Done | `review.js`, `diaryui.js` | Tests, Browser |
| MEA-1 | Weigh-ins, several a day | Done | `measure.js` | Tests, Browser |
| MEA-2 | Trend and weekly average, labelled derived | Done | `calc/trend.js`, `progressui.js` | Tests, Browser |
| MEA-3 | Waist (and other sites) with guidance | Done | `measure.js` | Tests, Browser |
| MEA-5 | Key lifts, estimated 1RM | Done from PR Forge, read-only. Manual lift entry deferred (PRD v1.5) | `prforge.js` | Tests, Browser (stand-in PR Forge), Owner said it looks good |
| MEA-6 | Edit, delete, export measurements | Done | `progressui.js`, `home.js` | Browser |
| PRG-1 | Charts with ranges and phase boundaries | Done | `progressui.js` | Browser |
| PRG-2/3/4 | Progress read, collecting state, plain copy | Done | `calc/progress.js` | Tests, Browser |
| HOM-1/2/5 | Home: calories and macros, phase card, ≤ 4 cards | Done | `diaryui.js`, `screens.js` | Browser |
| ACC-1 | Delete account | Done | `schema.sql`, `app.js` | Tests on real PostgreSQL, Browser. **Not run against the live project** |
| ACC-2 | Export CSV and JSON | Done | `home.js` | Tests, Browser. **iPhone share sheet not checked** |
| ACC-3 | No ads, no sharing; first-party analytics only | Done by absence: there is no analytics code at all yet | | Code review |
| ACC-4 | Eating-disorder resources link | Done | Profile → Support | Browser |

## Should-haves (P1) built
HOM-3 quick log · HOM-4 daily insight · NUT-7 (top contributors, ratios; "foods high in" not built) · MEA-3 other sites · MEA-4 body fat · PRG-5 maintenance check · ACC-6 appearance · FDB-3a search online.

## Not built, by decision
- ACC-5 reminders: after the beta (PRD v1.6).
- Manual lift entry: until someone without PR Forge needs it (PRD v1.5).
- Email + password sign-in: deferred (ONB-1).
- NUT-7 "foods high in a nutrient": needs a catalog query.

## Still to check for M8 (PRD §10)
| Target | State |
|---|---|
| Cold start to Home < 2 s | Not measured on the iPhone |
| Search: cached < 300 ms, server < 800 ms p95 | Server function measured at 0.09–0.5 s on the real catalog (Actions, 2026-11-06); not measured from the phone |
| Barcode result < 1.5 s | Owner reported scans work; the app shows the read time; no set of 50 items measured |
| Offline: diary, quick add, custom foods, recents, saved meals | Owner confirmed logging food and a weigh-in in airplane mode on the iPhone, with backup after reconnecting (2026-11-16) |
| Crash-free ≥ 99.5% | `lw_errors` not reviewed yet |
| Accessibility: text scaling, VoiceOver, contrast | Charts have spoken summaries; button text contrast tested for every palette; a Text size setting (Default, Large, Larger) scales the whole app with nothing cut off in Chromium at phone width; the focus stays on the pressed button across redraws and moves into a sheet when it opens. **No VoiceOver run on the iPhone yet** |
| Privacy policy matches the app | Updated with every data change; plain-language terms page added (`terms.html`), not reviewed by a lawyer |
| Beta metrics (§13) | `lw_metrics` view: counts only, from existing rows; the app's roles can't read it. Time-to-log, search success and barcode hit rate aren't measured (they would need events from the app) |
