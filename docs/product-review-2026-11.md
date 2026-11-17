# Product review and technical audit — 2026-11-17

Response to an outside product review (ChatGPT, pasted by the owner). Each point was checked against the code before deciding anything. Scope still follows `docs/PRD.md`; items below that are outside the MVP are proposals until the PRD is updated.

## 1. What already exists (don't rebuild)

| Area | In the app today |
|---|---|
| App | Static PWA (HTML/CSS/JS, no build step), offline-first IndexedDB per user, sync to Supabase with tombstones. Works on iPhone and Android browsers. |
| Accounts and data protection | Google sign-in (Supabase Auth). Row Level Security on every synced table (each person reads and writes only their own rows; tested against real Postgres in `tests/rls.test.js`). The app holds only the publishable key. The database URL lives only in a GitHub secret for the food import. Export (JSON/CSV) and delete account (`lw_delete_account`). |
| Targets | BMR by Mifflin-St Jeor (Katch-McArdle with a trusted body-fat %), × activity factor 1.2–1.9 = maintenance. Cut/bulk rate in % of body weight a week × 7,700 kcal/kg. Safety floor (higher of BMR and 1,200/1,500), deficit cap 25%, surplus cap 15%, loss ≤ 1%/wk, gain ≤ 0.5%/wk. Every number shows its working ("How these are worked out"). |
| Sources of maintenance | Formula, measured BMR, maintenance entered by the user, and the maintenance check (from logging) — each labelled on the Plan tab. |
| Target history | Each change is a new version with a start date and origin (calculated / set by you / from the maintenance check). Past days keep their targets. Weight changes never change targets without your OK. |
| Maintenance check | 21-day window; needs 17 days logged (≥ 50% of target) and ≥ 4 weigh-ins in each week. Blends 70% new estimate, moves at most 150 kcal per check, then waits 7 days. Only suggests; you accept or decline. |
| Phases | Cut, Recomp, Lean bulk, Maintenance, Nutrition optimization. Start/planned end, history, goal weight. Not weight-loss-only. |
| Logging | Search (catalog of USDA + branded), barcode, Search online (Open Food Facts), quick add, your own foods, saved meals, recents, frequents, copy meal/day, amount-first logging. |
| Progress | Weight trend with weekly averages, waist and other sites, body-fat estimates, key lifts from PR Forge, intake vs target, phase progress read (fat loss / recomp signals with honest uncertainty). |
| Nutrients | Micronutrients with coverage ("known for X% of calories"), DRI targets checked against the National Academies tables, % daily value bars. |
| Tests | 185 Node tests on the calculation engine, diary, sync, search, import, RLS and more. Browser checks with Playwright by hand. |

## 2. The two numbers in the review

### Plan screen: 2,854 maintenance, 1,900 target, "0.5% a week"
**Confirmed display bug, not a formula bug.** The engine gives 0.5% × 88.2 kg × 7,700 ÷ 7 = 485 kcal a day → 2,370 kcal (tested). 1,900 kcal is a target typed in with **Edit targets**, which the PRD allows (above the floor). But the phase header kept saying "0.5% a week", and nothing warned that 1,900 is 33% below maintenance (≈ 1.0% of body weight a week).

**Fixed (v0.18.4):**
- The Plan header now says "planned 0.5% a week", then "Your current target (1,900 kcal, set by you) works out to about 1.0% loss a week."
- Typing a target past the caps (> 25% below or > 15% above maintenance, or faster than 1%/0.5% a week) shows a warning with the expected pace. As the PRD says: warn, don't block.

### Diary: 22 P / 46 C / 7 F shown as 310 kcal, not 335
**Expected, not a bug.** Calories come from the food's own data, not from 4/4/9:
- USDA foods use USDA's *Atwater specific* factors (different for grains, legumes, dairy...); 4/4/9 is the general rule.
- Labels can subtract fiber, use sugar alcohols, and round each line.

Recomputing from macros would make most foods *less* accurate.

**To do:**
- Show "Calories from the label/USDA; 4/4/9 gives X" in a food's Nutrition facts when the two differ by more than 10%.
- Warn when you create a food whose calories don't fit its macros. That check already exists for created foods (`library.energyCheck`).

## 3. Confirmed issues

| # | Issue | Status |
|---|---|---|
| C1 | Plan header showed the planned rate while a typed-in target implied another | Fixed (v0.18.4) |
| C2 | No warning for typed-in targets past the deficit/surplus caps | Fixed (v0.18.4) |
| C3 | Search didn't favour foods you've logged before | Fixed (v0.18.4): "Logged before" now comes first |
| C4 | USDA survey-food serving names showed portion codes | Fixed (v0.18.2); the catalog itself cleans on the next import |
| C5 | Nutrient sheet jumped to the top on tap | Fixed (v0.18.3) |

## 4. To investigate (not confirmed)

- **Planned end date with a typed-in target.** The planned end uses the phase's chosen rate, not the target in use. It's a minor mismatch: the end is an estimate, and the goal-weight line uses the trend.
- **Targets after big weight change.** Targets don't follow weight on their own, which is by design. A prompt like "you've lost 5% since these targets; recalculate?" would help. It needs a PRD line.
- **Duplicate foods in search** (same product from USDA branded and Open Food Facts). Needs a sample from real searches.
- **Weight-unit rounding.** Stored in kg to 0.01 and shown in lb to 0.1. Fine so far; keep an eye on it.
- **Default serving for some survey foods** (e.g. "1 oz dry, yield after cooking" listed first).

## 5. Recommendations on the review's priorities

| Review says | Recommendation | Why | Size |
|---|---|---|---|
| Audit calculations (Critical) | Done above; keep the tests | Formulas were right; the display wasn't | — |
| Macro accuracy (Critical) | Add the "4/4/9 gives X" note | Explain, don't recompute | S |
| **Recipes with total cooked weight** (Critical) | **Do next.** Move "Recipe builder" from Phase 2 into the MVP (PRD change needed) | Real gap: saved meals can't do "1,500 g pot, I ate 250 g". Builds on custom foods; no new service. | M: one new synced table or a `recipe` kind of custom food, ingredient picker, cooked-weight field, tests |
| Search order (High) | Partly done (Logged before → Your foods → catalog). Branded-exact boost already in `lw_search_foods`. | — | — |
| Body-composition insights (High) | Next after recipes: one "Is it working?" card per phase on Progress, from the existing progress read (weight trend + waist + lifts), with plain uncertainty. Never claims body-fat %. | The engine exists (PRG-2/3); it needs a clearer card | M |
| Apple Health (High) | **Later.** A web app can't read Apple Health; needs an App Store wrapper (Capacitor), an Apple developer account ($99/yr) and review. | Cost and a new platform | L |
| Progress photos (Medium) | Phase 2 as planned; private storage bucket with RLS | Sensitive data; needs storage rules and a privacy update | M |
| AI coach (Medium) | Later, after the beta. It would explain the numbers the engine already shows | Paid API; must stay explainable | M–L |
| Wearables (Later) | Later | Same wrapper as Apple Health | L |
| PR Forge | Keep read-only (lifts only); shared sign-in already works through Google | Avoids a second workout log (decided v1.5) | — |
| Design | Keep; small passes only (text density, food names) | Owner likes the current look | S each |

**Maintenance-check threshold:** keep 3 weeks. Daily weight swings of 1–2 kg from water and salt make 1–2 weeks unreliable. Commercial apps use about the same window. The check already blends and caps each change.

## 6. Database changes

- **This release:** none.
- **Recipes:** a new synced table (or columns on custom foods) with RLS, added to `sync.TABLES`, the export and the delete cascade. Decide when the PRD is updated.

## 7. Proposed order

1. **This release (v0.18.4):** C1–C3.
2. **Next:** recipes, after the PRD update and owner OK.
3. "4/4/9" note on food details; recalculation prompt after big weight change.
4. "Is it working?" card on Progress.
5. Beta feedback, name checks, launch (M8 → M9).
6. Phase 2: photos, phase comparisons, App Store wrapper (Apple Health), AI explanations.
