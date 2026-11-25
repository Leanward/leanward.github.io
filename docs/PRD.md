# Leanward — Product Requirements Document

> **Version:** 1.4 (signed off 2026-11-02; v1.1 adds the visual identity and ACC-6; v1.2 adds the full nutrient review and Phase 2 lab results; v1.3 gives Leanward its own Supabase project; v1.4 adds Search online, FDB-3a; v1.5 makes key lifts PR Forge-only for now; v1.6 sets the appearance default to Match iPhone and moves reminders to after the beta; v1.7 is the four-tab layout; v1.8 moves recipes into the MVP, LOG-11; v1.9 adds the "Next week" step and maintenance-check confidence; v1.10 adds NUT-8; v1.11 refines the coaching rules; v1.12 adds the audit's safety fixes; v1.13 softens the wording and steadies the waist read; v1.14 tunes the coaching on simulated users; v1.15 adds training days, NUT-9; v1.16 adopts the approved visual design; v1.17 adds NUT-9b and closest-match search; v1.18 runs Search online by itself when there's no exact match; v1.19 extends Same as yesterday to every meal; v1.20 adds swipe to delete; v1.21 renumbers recipes LOG-15; v1.22 adds the weekly check-in, PRG-6; v1.23 specifies the planned-end hand-off, PHS-6; v1.24 adds the goal date range, PRG-7; v1.25 adds "Your usual" meals, HOM-3; v1.26 specifies reminders, ACC-5) · **Date:** 2026-11-18 · **Owner:** Kevin Chavez
> **Source:** [`blueprint-v2.md`](blueprint-v2.md) (Product Vision v2.0). Where this PRD adds detail, changes scope, or makes a call the blueprint left open, it is marked **[Proposed]** so you can accept or reject it; calls you've confirmed are marked **[Decided]** and logged in [`decisions.md`](decisions.md).
> **How to review:** react to anything, but the fastest path to sign-off is answering the numbered questions in §15.

---

## 1. Summary

Leanward is an iPhone-first nutrition tracker, delivered as a web app that installs to the home screen (like PR Forge), organized around the user's **goal** (what they want) and **phase** (the nutritional strategy they're running now). It combines Cronometer-level nutrient depth, MacroFactor-style adaptive targets (from Phase 2), and progress assessments that judge each phase by the right signals — not just the scale.

**Tagline:** Move toward better.
**Principle:** Your nutrition should support your goals, not dictate them.

## 2. Problem and goals

**Problem.** Most trackers treat every user as someone trying to lose weight, judge success by the scale alone, and either hide nutrient depth (MyFitnessPal, Lose It!) or bury users in it (Cronometer). Lifters doing a recomp or lean bulk get almost no useful feedback: maintaining weight while losing waist and gaining strength looks like "no progress."

**Product goals**
| # | Goal | How we'll know (see §13) |
|---|---|---|
| G1 | Logging is fast enough to do every day | A saved meal logs in ≤ 3 taps; median meal log < 30 s |
| G2 | Users understand whether their current phase is working | Every phase shows a phase-specific progress read, with the reasoning |
| G3 | Numbers are trustworthy | Every food shows its source; every derived number says it's an estimate |
| G4 | Useful for free | All core logging, targets and weight tracking are free forever |

**Non-goals** — carried over from blueprint §12: no social feed or influencer content, no heavy gamification, no shame messaging, no crash diets or aggressive default deficits, no silent target changes, no AI estimates shown as verified data, no workout programming, no paywall on basic logging.

## 3. Users

**Primary:** strength-training adults who care about body composition — cutting, recomping, or lean bulking — and want real nutrient data.
**Secondary:** everyday calorie/macro trackers and people who just want to eat better, with no weight goal.

**Personas (for design decisions)**
- **Alex, 31, recomping.** Lifts 4×/week, weight flat for 6 weeks, assumes it isn't working. Needs Leanward to show waist down 2 cm and bench up 5 kg.
- **Maya, 27, first cut.** New to tracking. Needs a safe, sensible target and a diary that isn't a spreadsheet.
- **Sam, 45, nutrition-only.** No weight goal; wants to know if they get enough fiber, potassium and vitamin D.

**Eligibility [Decided 2026-11-02 — §15 Q9]:** 18+ only at launch (age confirmed at onboarding). This keeps calorie-deficit features away from minors and avoids extra privacy obligations.

## 4. Core concepts

These are the backbone of the data model (§11) and the UI. They come straight from blueprint §4.

| Concept | Meaning | Examples |
|---|---|---|
| **Goal** | What the user wants. Changes rarely. | Lose fat · Build muscle · Recomp · Maintain · Improve nutrition |
| **Phase** | The strategy being run *now*, with a start date, an optional planned end, and its own targets. A goal can span several phases. | Cut · Recomp · Lean bulk · Maintenance · Reverse diet · Nutrition optimization |
| **Target set** | A versioned set of daily targets (calories, macros, fiber, micronutrients) with an effective-from date. Each phase has one or more over time. | 2,160 kcal / 180 P / 60 F / 225 C from Nov 3 |
| **Intake** | What was actually logged. Nutrient values are snapshotted at log time, so later corrections to a food don't rewrite history (the user can choose to re-apply them). | — |
| **Measurement** | Weight, body-fat estimate, circumferences, strength entries. Each is tagged **measured**, **estimated**, or **derived**. | Scale weight = measured · smart-scale BF% = estimated · trend weight = derived |
| **Recommendation** | A suggested change (target or phase) with reasoning. Only takes effect after the user accepts it. | "Your loss rate is 0.2%/wk vs planned 0.5% — lower calories by 120?" |

**Goal → default phase mapping [Proposed]:** Lose fat → Cut · Build muscle → Lean bulk · Recomp → Recomp · Maintain → Maintenance · Improve nutrition → Nutrition optimization. The user can pick any phase for any goal (e.g. goal "Build muscle", current phase "Cut" before a bulk).

## 5. Release plan and scope

The blueprint's three-stage roadmap stays. This PRD fully specifies **Phase 1 (MVP)**; Phases 2–3 are listed so the architecture leaves room for them.

### 5.1 Changes to the blueprint's MVP [Decided 2026-11-02]

| # | Change | Why |
|---|---|---|
| S1 | **Move waist measurement + simple strength entries into the MVP** (blueprint had measurements in Phase 2). | Recomp and lean bulk are MVP phases, but their success signals (blueprint §8) are waist and strength. Without them the app can't tell Alex his recomp is working — the core differentiator. |
| S2 | **MVP gets a basic phase progress read** (actual vs planned rate of weight change, waist and strength deltas), without adaptive TDEE. | Home must show "phase progress" (blueprint §11), and weekly check-ins / adaptive targets are Phase 2 (since moved into the MVP: PRG-5 maintenance check, and PRG-6 weekly check-in, v1.22). |
| S3 | **Reverse diet moves to Phase 2.** | It depends on a credible maintenance estimate, which comes from the adaptive engine. |
| S4 | **No payments in the MVP.** Everything is free; the code has an entitlement check so premium can be switched on later. | Payments add a payment provider, paywall UI and testing while there's nothing premium to sell yet. |
| S5 | **Micronutrients in the MVP show data coverage** ("vitamin D: data for 58% of today's calories"). | Branded foods often list only label nutrients. Showing coverage keeps the numbers honest (G3). |
| S6 | **Offline-first logging.** The diary works with no connection and syncs later. | Speed (G1) and the gym/kitchen reality. |

### 5.2 MVP (Phase 1) — in scope
Accounts and onboarding · goals and phases (Cut, Recomp, Lean bulk, Maintenance, Nutrition optimization) · target calculation (§8) with manual override · food search (generic + branded) · barcode scanning · quick add · custom foods · saved meals · copy meal/day · daily diary with meal slots · macros, fiber and micronutrients with coverage · weight logging with trend · waist + optional other circumferences · manual strength entries · basic progress charts · phase history · lb/kg and cm/in · cloud sync · data export and account deletion.

### 5.3 Phase 2 — Advanced nutrition
Advanced micronutrient reports · nutrition pattern insights (low protein/fiber/potassium, high sodium, intake consistency, planned vs actual) · advanced adaptive model and broader target recommendations (the basic maintenance check is in the MVP as PRG-5) · reverse diet · phase comparisons · progress photos · **lab results (import a lab report PDF, or enter results by hand), tied to nutrition — specified in §6.10** · Apple Health incl. Apple Watch data (weight, active energy, workouts) — **a web app can't read Apple Health, so this needs the app wrapped for the App Store (e.g. Capacitor); decide when Phase 2 is planned** · AI photo logging · voice logging · subscription/premium (web payments, e.g. Stripe) · advanced search (filters, "foods high in X").

### 5.4 Phase 3 — Body composition platform
Advanced adaptive model · Garmin · advanced body-composition analytics · training-performance integration · personalized insights · meal planning and grocery lists · advanced reporting · coach/dietitian sharing.

### 5.5 Out of scope (all phases)
See §2 non-goals. Also: supporting Android or desktop browsers at launch (the web app may run there, but only iPhone Safari is designed for and tested), an App Store listing in the MVP, wearables beyond Apple Health/Garmin, medical or clinical use.

## 6. Feature requirements — MVP

Priority: **P0** = MVP can't ship without it · **P1** = MVP, can slip to a fast follow.

### 6.1 Onboarding and profile (ONB)
| ID | Requirement | Pri |
|---|---|---|
| ONB-1 | Sign-in is required (§15 Q3, decided). Sign up with **Google** (as PR Forge does). **Email + password (with verification and password reset) is deferred** until Leanward has its own domain or users ask for it [Decided 2026-11-03]. Sign in with Apple is only needed if the app later ships through the App Store. | P0 |
| ONB-2 | Collect: date of birth (18+ gate), sex used for calculation (male / female / prefer not to say — see §8.1), height, current weight, optional goal weight, activity level (5 described levels), training sessions/week. | P0 |
| ONB-3 | Optional: body-fat % estimate (with source: guess / smart scale / DEXA / calipers), waist circumference. | P0 |
| ONB-4 | Choose goal → app suggests a phase → user confirms or picks another. | P0 |
| ONB-5 | Choose rate of change where it applies (§8.3), defaulting to the moderate option, with the expected weekly change shown in the user's units. | P0 |
| ONB-6 | Optional dietary preferences/restrictions (vegetarian, vegan, dairy-free, etc.) stored for later filtering; no diet plans in MVP. | P1 |
| ONB-7 | Show the calculated targets **with the working** ("BMR 1,780 × activity 1.55 = 2,760 maintenance − 550 deficit = 2,210") and let the user edit any target before finishing. | P0 |
| ONB-8 | Onboarding takes ≤ 2 minutes with all optional steps skipped. | P0 |
| ONB-9 | Units: lb/kg, in/cm, kcal (kJ in Phase 2), chosen at onboarding and changeable later. | P0 |
| ONB-10 | **"I know my numbers"** (optional, on the targets step) [Decided 2026-11-03, owner request]: enter a **measured BMR/RMR** (body composition scan, metabolic test) or a **known maintenance** (from tracking intake and weight, or a coach), with its source. Leanward uses it instead of the formula (§8.1), says so in the working, and still applies every floor and cap (§8.2). Entries far from the estimate are questioned, not refused (§8.1). The targets step and Phase tab show maintenance prominently, with where it came from and how far the target is from it, plus a note that estimates can be off for some people. | P0 |

### 6.2 Goals and phases (PHS)
| ID | Requirement | Pri |
|---|---|---|
| PHS-1 | Exactly one active phase at a time. Each phase stores type, start date, optional planned end date or target weight, rate setting, and its target-set history. | P0 |
| PHS-2 | Start a new phase at any time; the old phase is closed with an end date and kept in full (targets, dates, measurements). | P0 |
| PHS-3 | Changing the goal never deletes phases or history. | P0 |
| PHS-4 | Phase screen shows: current goal, current phase and day count (e.g. "Cut · day 23 of ~84"), current targets, phase progress read (§6.6), and phase history list. | P0 |
| PHS-5 | Edit targets mid-phase → creates a new target-set version effective today (or a chosen date); past days keep their old targets. | P0 |
| PHS-6 | **Planned-end hand-off [Decided v1.23, owner approved 2026-11-24].** When a phase is within 7 days of its planned end, or the weight **trend** (not one weigh-in) reaches its goal weight (cut: at or below; bulk: at or above), Leanward offers what to do next. Shown as a card at the top of Plan and on Today's Intelligence card (after care steps and the weekly check-in). Choices, each with a one-line reason: **After a cut:** (1) *Maintenance*, suggested: "Hold your new weight for at least 2–4 weeks; it makes the result easier to keep"; (2) *Diet break*: 2 weeks at maintenance, then Leanward offers to resume the cut; (3) *Keep cutting* 4 more weeks, offered only when there's no care step and the cut has run under 16 weeks; (4) *Something else*: the normal New phase flow. **After a lean bulk:** maintenance (suggested), keep going 4 weeks, a cut, or something else. **After maintenance, a diet break, recomp or nutrition** with a planned end: keep going, or the next phase; after a diet break, "Back to your cut" comes first. **Maintenance number:** the one in use, named by its source ("from your maintenance check" or "estimated by formula, at your current weight"), recalculated at the current weight unless it came from the check or was entered by the user. **Rules:** nothing switches automatically: if nothing is chosen, the phase simply continues with the same targets and the card stays on Plan. "Not now" hides it from Today for 7 days. Every choice goes through the existing new-phase rules (PHS-2/3: the old phase is closed and kept, the new targets are a new version, the floor and caps apply). A diet break is a maintenance phase with a 14-day planned end under the same fat-loss goal, so no schema change. | P1 |
| PHS-7 | Nutrition-optimization phase has no weight-change target and never shows deficit or surplus language. | P0 |

### 6.3 Food logging (LOG)
| ID | Requirement | Pri |
|---|---|---|
| LOG-1 | Diary by day with slots: Breakfast, Lunch, Dinner, Snacks, Beverages, Supplements. Slots can be renamed, hidden or reordered. | P0 |
| LOG-2 | Global **+** button reachable from every tab; the add sheet opens on **Recent / Frequent** with search focused. | P0 |
| LOG-3 | Search across generic, branded, custom foods and saved meals; results show name, brand, serving, calories, protein and a source badge (§7). | P0 |
| LOG-4 | Barcode scanning (UPC-A/E, EAN-8/13). Not found → offer "Create this food" with the barcode prefilled. | P0 |
| LOG-5 | Serving units: g, oz, ml, fl oz, cup, tbsp, tsp, item/piece, and the food's labelled servings; free numeric quantity (e.g. 1.5 cups). | P0 |
| LOG-6 | Raw vs cooked: generic foods show the preparation state in the name; search ranks the matching state first when the query says "cooked" or "raw". | P1 |
| LOG-7 | Quick add: calories only, or calories + P/C/F, with an optional label. | P0 |
| LOG-8 | Custom foods: name, brand, serving(s), calories, macros and any micronutrients from the label; optional barcode; private to the user. | P0 |
| LOG-9 | Saved meals: save any group of entries; log the whole meal in one tap; scale it (×0.5, ×2). | P0 |
| LOG-10 | Copy a meal or a whole day to another date; "Same as yesterday" on any empty meal that had food the day before, and "Add yesterday's …" in each meal's ⋯ menu (v1.19, beta feedback; was breakfast only). | P0 |
| LOG-15 | **Recipes [Decided v1.8; numbered LOG-11 until v1.21, which clashed with edit/delete]:** build a dish from ingredients (any food: catalog, online, your own; raw or as-bought amounts), enter the finished weight (blank = the ingredients' weight) and, optionally, the number of servings. Leanward works out the dish per 100 g = ingredient totals ÷ finished weight, so logging "250 g of a 1,500 g pot" is right. Log by grams, oz, a serving or the whole recipe. A vitamin or mineral is listed only when ingredients that list it make up ≥ 90% of the calories. A finished weight under 20% or over 5× the ingredients' weight is questioned. Recipes are private (saved with your own foods); editing one changes future logs only. No recipe inside a recipe for now. | P0 |
| LOG-11 | Edit and delete entries; move an entry to another slot or day. Swipe a food (or a whole meal) left to delete: a short swipe shows Delete, a long one deletes; the message offers Undo for 5 seconds. The meal's ⋯ menu also has "Delete everything in …" (v1.20, owner). | P0 |
| LOG-12 | Logging works offline; entries sync when back online, with no duplicates. | P0 |
| LOG-13 | Over-target days show neutral colors and copy (no red alarms, no "you failed"). | P0 |
| LOG-14 | **Alcohol tracking** (owner request), a toggle in Profile. When on: one-tap Beer / Wine / Spirits buttons in Beverages plus any drink from search; each drink converts to US standard drinks and alcohol calories (§8.9); the day shows drinks, grams and kcal from alcohol; the Nutrients view shows the day or 7-day total, alcohol-free days and alcohol's share of calories. Days above the user's limit get the same neutral amber "Above your limit" marker and a plain line with the numbers ("1.0 drink over your limit of 2"), never red, streaks or guilt (LOG-13, §2 non-goals). Labs "Between reports" shows drinks per week for triglycerides and glucose markers. | P1 |

### 6.4 Nutrition display (NUT)
| ID | Requirement | Pri |
|---|---|---|
| NUT-1 | Day view: calories consumed / remaining, protein, carbs, fat (consumed vs target), fiber. | P0 |
| NUT-2 | Detail view tracks: saturated, mono and poly fat, trans fat, cholesterol, sugar, added sugar, fiber, omega-3 (ALA, and EPA + DHA), sodium, potassium, calcium, magnesium, phosphorus, iron, zinc, copper, selenium, vitamins A, C, D, E, K, B1, B2, B3, B6, B12, folate, choline, plus any other nutrient the source provides. | P0 |
| NUT-3 | Micronutrient targets default to the DRIs (RDA, or AI where no RDA exists) for the user's age and sex; values above the Tolerable Upper Intake Level are shown neutrally as "above UL". | P0 |
| NUT-4 | Every nutrient total shows data coverage when it's below 100% (S5). | P0 |
| NUT-5 | Food detail page shows the full nutrient panel per serving and per 100 g, plus source and verification status. | P0 |
| NUT-6 | **Nutrient review in the Diary** (Diary › Nutrients): every NUT-2 nutrient grouped as Energy and macros · Fats · Carbohydrates · Minerals · Vitamins. Each row shows amount / target with units, % of target, the type of target (RDA, AI, limit, guideline), "above UL" where relevant, and data coverage. A **Day / 7-day average** switch; the 7-day average counts only logged days and says how many. A "Furthest from target" summary at the top lists the few nutrients most below target or over a limit, so the high-yield items are seen first. | P0 |
| NUT-7 | Nutrient depth (owner request): tap any nutrient for its top contributing foods (day or 7 days) and foods high in it; a **Ratios and quality** card with protein g/kg, macro split (% of kcal), saturated fat % kcal, added sugar % kcal, fiber g per 1,000 kcal, sodium-to-potassium ratio, and EPA + DHA vs guideline; a sort option by "furthest from target". Per-meal protein, carbs and fat shown under each Diary slot. | P1 |
| NUT-8 | **Coaching details [v1.10]:** protein shows ✓ from "enough", 1.6 g per kg of reference weight (never above the target, which stays the aim), with a tick on the bar; each meal shows its share of the protein target and its fiber; a food's Nutrition facts explain when its calories differ from 4/4/9 by more than 8% and 15 kcal per 100 g (USDA's food-specific factors, or label fiber and sugar-alcohol rules). Leanward always uses the source's calories. | P1 |
| NUT-9 | **Training days [Decided v1.15]:** with PR Forge connected, Leanward works out training days from the workout dates it already reads: a day with a finished workout, or a weekday trained on 2+ times in the last 4 weeks. On a training day Today shows one line: put about half of the day's carbs in the meals before and after training; the day's targets don't change (guidance only, no carb cycling yet). Rest days show nothing. A strength dip after fewer sessions than usual (under 60% of the usual count in 14 days) is described as that, not as muscle loss. People training 4+ times a week see their carbs in g/kg on Plan, with the 3–5 g/kg context for hard training (Thomas, Erdman & Burke 2016). | P1 |
| NUT-9b | **Training days you set [Decided v1.17]:** for sport PR Forge doesn't see (hockey, runs, classes). Profile › Settings › Training days: the weekdays you usually train and an optional label ("Hockey"). Today's ⋯ menu: mark the day shown as a training day, or as a rest day on a usual day. Saved with the profile (preferences, last 60 days of marks), so they sync; they work without PR Forge and merge with its days. A marked day counts as a session. Same guidance-only rule as NUT-9. | P1 |

### 6.5 Measurements (MEA)
| ID | Requirement | Pri |
|---|---|---|
| MEA-1 | Log weight (date/time, value, optional note); multiple weigh-ins a day allowed — the trend uses the first of the day by default. | P0 |
| MEA-2 | Trend weight and weekly average (§8.5) shown alongside the raw weigh-ins, labelled "trend (derived)". | P0 |
| MEA-3 | Circumferences: waist (P0); hips, chest, arm, thigh, neck (P1). The how-to-measure guidance is shown inline. | P0 |
| MEA-4 | Body-fat % entries with method (guess, smart scale, calipers, DEXA, other), always shown as "estimate". | P1 |
| MEA-5 | Strength entries **[Proposed]**: the user picks up to 5 "key lifts" and logs top set weight × reps; the app shows estimated 1RM (Epley) over time. No workouts, programs or set logging. **Connection to PR Forge wanted** (§15 Q6): Leanward reads lift results from PR Forge read-only; manual entry stays for people who don't use PR Forge. **In the MVP**: Leanward has its own Supabase project; the user connects PR Forge once by signing in to it with Google from Leanward, and Leanward then reads the user's own PR Forge workouts read-only through PR Forge's existing row-level security. Nothing is copied into PR Forge or changed there (§15 Q6a/6b, decided; revised in v1.3). **v1.5 (owner decision 2026-11-16):** lifts come from PR Forge only for now; typing lifts into Leanward is deferred until someone without PR Forge needs it, so Leanward doesn't become a second workout log. The lift summary read from PR Forge is kept on the phone only; the chosen key lifts are saved with the profile. | P0 |
| MEA-6 | All measurements can be edited and deleted, and are exportable. | P0 |

### 6.6 Progress (PRG)
| ID | Requirement | Pri |
|---|---|---|
| PRG-1 | Charts: weight (raw dots + trend line), waist, each key lift's estimated 1RM, average daily calories and protein vs target. Ranges: 4 weeks, 12 weeks, 6 months, all; phase boundaries drawn on every chart. | P0 |
| PRG-2 | **Phase progress read** — phase-specific signals, each shown as on track / watch / off track, with the numbers behind it. | P0 |
| | Cut: trend weight falling within ±50% of the planned rate; waist falling; key lifts within 5% of their phase-start estimated 1RM. | |
| | Recomp: trend weight within ±0.25%/wk of flat; waist flat or falling; key lifts rising. | |
| | Lean bulk: trend gain within ±50% of the planned rate; waist growth no faster than the user's limit (proposed default: 1 cm per kg gained); key lifts rising. | |
| | Maintenance: trend weight within ±1.5% of the phase-start weight; waist stable. | |
| | Nutrition optimization: logging consistency and nutrients meeting DRI (no weight signals). | |
| PRG-3 | A signal needs ≥ 14 days of phase data and ≥ 8 weigh-ins (or 2 waist / 2 lift entries); before that it shows "collecting data — x more days". | P0 |
| PRG-4 | Progress copy is plain and non-judgmental: "Weight flat, waist −1.8 cm, squat e1RM +4% — consistent with a successful recomp." **Next week [v1.9]:** the card adds one step with its reasons (keep / eat 100–250 kcal more or less / look after recovery / log more first / wait / let the maintenance check update). Data quality comes first: fewer than 10 of the last 14 days logged to half the target means "log more", and fewer than 8 weigh-ins in 14 days means "weigh in more" — never "eat less". The weight trend decides; the waist only supports and never changes calories on its own. A slow cut with a falling waist is held; with a flat waist it's "tracking first" at 10–11 of 14 days logged, and "consider 100–150 kcal less, or accept the maintenance check (not both)" at 12+. Routine changes are 100–150 kcal; 200–250 only when the weight signal is off track with 12+ of 14 days logged (v1.11). **Safety [v1.12, audit]:** a "care" step comes before any other advice when 5+ of the last 7 days were logged under the safety floor, or the weight trend fell more than 1.5% a week over 21 days: no deficit advice, a suggestion to see a registered dietitian or doctor, and the support link. Advice never suggests eating less when the target is within 100 kcal of the floor ("hold steady" instead). A lift is judged on the best of up to 3 sessions at each end and needs 4 sessions. **v1.14 (simulated users):** before day 28 of a phase a slower-than-planned pace is not judged (the trend lags); "eat less" on a cut needs a clear stall (off track), a mildly slow read gets "hold steady". | P0 |
| PRG-5 | **Maintenance check** (moved into the MVP from Phase 2 [Decided 2026-11-03, owner request]): once there are 21 days with enough logging and weigh-ins (§8.6), Leanward compares what was eaten with the weight trend and, if maintenance looks different from the one in use, suggests a corrected maintenance and the new targets as a Recommendation, with the working. Targets change only if the user accepts; declining keeps them. Until there's enough data it says what's still needed. **Confidence [v1.11]:** High needs 18+ of 21 days logged, 5+ weigh-ins every week, steady logging (daily intake varying under 35%) and steady weigh-ins (scatter around the trend under 1 kg); otherwise Moderate, with the reasons shown. The check still needs 17 of 21 days and 4 weigh-ins a week to run at all; an estimate more than 20% below the previous maintenance carries a caution about unlogged food. **v1.12 (audit):** the window starts no earlier than 14 days into the current phase; a difference under 100 kcal counts as a match. **v1.14 (simulated users):** the check also waits until the weight trend has 4 weeks of weigh-ins before the window (removes a ~200 kcal low bias for new users), and a difference under 150 kcal counts as a match (false suggestions 3% vs 16% at 100, with noisy weigh-ins). | P1 |
| PRG-6 | **Weekly check-in [Decided v1.22, owner approved 2026-11-23]** (moved into the MVP from Phase 2; master audit and competitive analysis, 2026-11-23). Once a week, on a day the user picks (Profile › Settings, default the weekday the phase started), from day 7 of a phase. One short screen, opened from the Intelligence card on Today (and from Plan) on check-in day and for 3 days after: **(1)** "How was your logging this week?" All of it / Most days / Only some. **(2)** The week in numbers: days logged, weigh-ins, average calories and protein vs target, trend change vs the planned rate (the PRG-2/3 read, so no slow verdict before day 28), and waist and key lifts when there are entries. **(3)** One outcome in plain words, from the existing "Next week" step rules (PRG-4): "No change needed", a care step, or a suggestion. **(4)** If the maintenance check (PRG-5) has a suggestion, it's accepted or declined here instead of separately. **Rules:** the check-in never changes targets by itself; only the user's accept does, within PRG-5's limits (≤ 150 kcal a check). "Only some" logging, or under 4 logged days, means no calorie change is suggested that week, with the reason shown. Care steps (under the floor, losing too fast) come first. Missing a check-in is fine: no streaks, no guilt, and the next one works as normal. Works with targets the user set themselves. Each completed check-in is kept (Plan › history) as a Recommendation record (`type` = weekly-checkin), so no schema change. Optional reminders are separate (ACC-5). | P1 |
| PRG-7 | **Goal date as a range [Decided v1.24, owner approved 2026-11-24]** (master audit change #6). With a goal weight set, Plan's goal line shows *when*, not only how far: "At your current pace: about Feb 10 – Mar 3", next to the phase's planned end. **Method:** the weight trend's rate over the last 21 days; the range is the date at that pace ±25% (faster pace = earlier date), rounded to whole days and shown as month and day. **Shown only when:** the phase is at least 21 days old with 10+ weigh-ins in those 21 days, and the trend is moving toward the goal at 0.1% of body weight a week or more. Otherwise it says why in one line ("A date appears after 3 weeks of weigh-ins" / "Your trend isn't moving toward your goal yet"). Hidden beyond 2 years. **Wording:** an estimate from the trend, never a promise; no countdowns. Replaces today's single "about N weeks at your current trend". It doesn't change targets or the planned end. | P1 |

### 6.7 Home (HOM)
| ID | Requirement | Pri |
|---|---|---|
| HOM-1 | Top of Home: calories remaining (ring or bar) with consumed/target, then P/C/F progress. | P0 |
| HOM-2 | Phase card: phase name, day count, single headline progress signal; tap → Phase tab. | P0 |
| HOM-3 | Quick log: the 5 most likely items for the current time slot (from history), each one tap to log, shown first in the add sheet as "Often at <meal>". **[v1.25, owner go-ahead 2026-11-24]** Plus **"Your usual <meal>"**: when the same set of foods was logged in a meal on at least 3 of the last 28 days, and on at least 40% of the days that meal was logged, one tap logs the whole set at the latest amounts (with Undo). Shown at the top of the add sheet and as a "Your usual" link on that meal's empty row on Today, unless it's the same as yesterday's meal (then "Same as yesterday" covers it). | P1 |
| HOM-4 | At most one daily insight card. MVP insight set: protein running low for the day, fiber below 50% of target by evening, no weigh-in for 7 days (gentle). | P1 |
| HOM-5 | Above the meals, Today shows no more than: the hero, one row of two tiles, one tip and quick log (v1.7; was "no more than 4 cards" when Home was its own tab). Customization is Phase 2. | P0 |

### 6.8 Account, privacy and data (ACC)
| ID | Requirement | Pri |
|---|---|---|
| ACC-1 | In-app account deletion that removes all of the user's Leanward server data (required by privacy law in many places, and by the App Store if Leanward ever ships there). | P0 |
| ACC-2 | Export all data (diary, foods, measurements, phases, targets) as CSV and JSON. | P0 |
| ACC-3 | No ads. No sale or sharing of health or nutrition data with third parties; analytics are first-party and contain no food or body data. | P0 |
| ACC-4 | A support link to eating-disorder resources is available in Settings (National Alliance for Eating Disorders). | P0 |
| ACC-5 | **Reminders [Decided v1.26, owner approved 2026-11-25]** (back into the MVP from after the beta; master audit change #5). Three optional reminders in Profile › Settings › Reminders, **each off by default**: **(1) Log meals** at a time the user picks (default 8:00 pm), skipped when anything was logged in the 3 hours before. **(2) Weigh-in** at a morning time (default 7:30 am) on every day or on days the user picks, skipped when there's already a weigh-in that day; the setting says "Weekly is fine too, if daily weighing doesn't suit you." **(3) Check-in day** at 9:00 am on the check-in day (PRG-6), only while the check-in is due and not done. Times are in 15-minute steps, in the phone's time zone. **Wording:** the lock screen never shows a number, food or weight, and never shames, counts streaks or says "you missed": exactly "Time to log today's meals?", "Morning weigh-in? Before breakfast is best." and "Your weekly check-in is ready." Tapping one opens Today, Log weight or the check-in. **Limits:** at most one of each a day; nothing sent if Leanward hasn't been opened for 14 days — reminders pause, and the next open says "Reminders paused" with one tap to resume. **Setup:** turning the first one on asks iOS for permission (only then, never at launch); web push on iPhone needs Leanward on the home screen (iOS 16.4+), so in Safari the setting explains how to add it; if permission is denied it says where to allow it in iOS Settings. Reminders go to each device where they were turned on. **No other notifications, ever** (no marketing, tips or motivational messages). How it's sent: §12. | P1 |
| ACC-6 | **Appearance settings** (Profile › Settings › Appearance): choose a color palette (Aurora, Ocean, Sunset, Moss, Mono at launch); "Change color with my phase" on/off (off = the palette's one signature color everywhere); mode Dark / Light / Match iPhone. Default: Aurora, follow phase on, Match iPhone (v1.6: the app has followed the phone's light or dark setting since M0, so that stays the default; Dark and Light are choices). Every palette gives each phase a distinct color, and text meets 4.5:1 contrast in both modes. See `prototype/appearance/`. | P1 |

### 6.10 Lab results (LAB) — Phase 2, specified early [Decided 2026-11-02]
Owner request: let users bring in their lab results, from any lab, and connect them to nutrition. The feature is called **Labs** and the action **Import labs**; no lab company is named in the product. Leanward is not a medical device: it shows how nutrition relates to a result and never diagnoses or treats.

| ID | Requirement |
|---|---|
| LAB-1 | **Import labs:** the user picks a lab report PDF from any lab. The text is read **on the phone** (no third-party service); Leanward extracts each marker's name, value, unit, the reference range printed on the report and the collection date. The reader supports common US lab report layouts and grows over time; anything it can't read is left for the user to fill in. |
| LAB-1b | **Add by hand (optional):** the user can instead, or as well, type results in: date, marker, value, unit, and the range printed on their report. If no range is entered, the value is shown without a flag, **except eGFR**, which uses the standard cutoff of < 60 mL/min/1.73m² (KDIGO definition of reduced kidney function) so the LAB-7 protein-safety rule still works. Creatinine has no single standard range (it depends on sex, muscle mass and lab method), so it stays unflagged without one. |
| LAB-1c | **History is append-only.** Every import or hand entry adds a new report to the user's history; nothing is overwritten or merged away. A report with the same collection date as an existing one is saved alongside it, with a warning. Reports are deleted only one at a time, by the user, with confirmation. |
| LAB-2 | **Review before saving:** every extracted value is shown for the user to confirm or correct, with low-confidence reads highlighted. Nothing is saved without confirmation. |
| LAB-3 | Labs screen: each marker's history over time, flagged against **the reference range from the user's own report** ("below range", "in range", "above range"). Leanward doesn't invent its own ranges; a result with no range is shown unflagged. |
| LAB-4 | Nutrition-linked markers connect to the relevant nutrients: vitamin D, B12, folate, ferritin/iron, magnesium, zinc, omega-3 index → that nutrient's intake, coverage and food sources; LDL-C, ApoB, triglycerides, HDL → saturated fat, fiber, added sugar; HbA1c, fasting glucose, insulin → carbohydrate, added sugar, fiber. Markers that don't reflect intake are shown but not linked: e.g. serum sodium and potassium (fluid balance and kidney handling, not diet), hormones, thyroid, hs-CRP. Links say how closely a marker reflects intake (e.g. serum zinc and magnesium only loosely). |
| LAB-5 | **Suggestions, never automatic changes:** a flagged marker can produce a Recommendation (§4) with its reasoning, e.g. "LDL above the lab's range: set saturated fat limit to 7% of calories?" The user accepts or declines; accepted suggestions create a new target version (PHS-5). A marker can also be set as a "focus", which highlights its nutrients in the Nutrient review. |
| LAB-6 | **Trends between reports:** each marker shows its full history chart, and a "Between reports" view lists, for each period leading up to a result (from the previous report, or the 90 days before the first): the change in the marker, average daily intake of its linked nutrients (from the diary), weight change, and the phase(s) run. Periods with fewer than 14 logged days are labelled as too few to rely on. Descriptive only: no claim of cause, and a note that weight change, medications, supplements, exercise, illness, sleep and lab variation also move results. |
| LAB-7 | **Safety:** no diagnosis, no supplement dosing, no interpretation of unlinked markers. A result far outside the lab's range shows only "talk to your clinician". If eGFR or another kidney marker is flagged low, high-protein suggestions and phases show a clinician note and protein suggestions pause. |
| LAB-8 | **Privacy:** lab data is stored only in the user's own rows (row-level security), is never used in analytics, is included in export (ACC-2) and account deletion (ACC-1), and the original PDF is not kept unless the user chooses to. Sample or real lab PDFs are never committed to the public repo. |

### 6.9 Navigation
**Four tabs (v1.7, owner-approved design pass):** **Today · Progress · Plan · Profile**, with the global **+** in the middle of the tab bar (LOG-2). *Today* is Home and Diary merged: the day's hero (a calorie ring in the phase color with protein, carbs, fat and fiber), then, for today only, a phase tile and a weight tile, at most one tip and quick log, then the meals; ‹ › moves between days. *Progress* opens with "Is it working?" and then the charts. *Plan* holds the phase, goal weight, maintenance check, targets and history. Advanced nutrient detail lives one tap deeper (Today → Nutrients). (v1.0–1.6 had five tabs: Home · Diary · Progress · Phase · Profile.)

## 7. Food data strategy [Decided 2026-11-02 — §15 Q4]

Blueprint §7 leaves sourcing open. Recommendation: a **hybrid stored in our own database**, rather than calling a third-party API on every search.

| Layer | Source | Why | Constraints |
|---|---|---|---|
| Generic foods (P0) | **USDA FoodData Central** — Foundation + SR Legacy (+ FNDDS for mixed dishes) | Deepest free micronutrient data; raw/cooked entries; public domain, CC0 | US-centric; names need cleanup for search |
| Branded + barcodes (P0) | **USDA Branded Foods** (has GTIN/UPC) | Same license; updated monthly | Label nutrients only — few micronutrients |
| Barcode fallback (P0) | **Open Food Facts** | Large crowd-sourced barcode coverage, commercial use allowed | ODbL: attribution required, and a public adapted database must be shared back; quality varies → badge "community" |
| User foods | Custom foods (private) | — | Never mixed into the shared catalog in MVP |
| Later option | Commercial API (e.g. fatsecret Premier, Nutritionix) | Wider brand/restaurant coverage | Paid; fatsecret's barcode lookup is a Premier-only method |

**Requirements**
- **FDB-1** Every food carries `source`, `source_id`, `verification` (verified / community / user / AI-estimate) and `last_updated`, shown as a badge.
- **FDB-2** Import USDA data via its bulk downloads on a schedule (monthly for branded), not through the live API, which defaults to 1,000 requests/hour.
- **FDB-3a** **Search online** (owner request, v1.4): when the catalog doesn't have a food, the search screen offers a "Search online (Open Food Facts)" button (shown first when the catalog finds nothing). It searches Open Food Facts by name, US products first, then worldwide; results carry the Community badge and attribution, and FDB-6 rules hide products without calories or a macro. Only the typed words are sent. Since v1.18 (owner) it also runs by itself when the catalog has no exact match (no food has every typed word, 3+ letters), once typing pauses for a second, once per query; otherwise only when the user taps (Open Food Facts allows about 10 searches a minute). The privacy page says so.
- **FDB-3** Open Food Facts records live in their own table with attribution on every screen that shows them and in the legal page; any corrections we make to them are kept separable so share-alike obligations are easy to meet.
- **FDB-4** Duplicate handling: one canonical record per barcode; search collapses near-identical names; ranking puts verified before community and the user's own history first.
- **FDB-5** "Report a problem" on every food (wrong nutrients, wrong serving, duplicate). Reports are queued for review; the user can also fix it immediately by making a private copy.
- **FDB-6** Quality before quantity: community records missing calories or any macro are hidden from search.

Licensing basis: [FoodData Central API Guide](https://fdc.nal.usda.gov/api-guide) · [Open Food Facts ODbL summary](https://wiki.openfoodfacts.org/ODBL_License) · [fatsecret Platform editions](https://platform.fatsecret.com/api-editions). Re-check all terms before launch.

## 8. Calculations and logic

All numbers are estimates and the UI says so. Every formula below must be shown to the user in plain language somewhere (CLAUDE.md rule: no opaque scores). Values are working defaults to be confirmed during the prototype.

### 8.1 Energy expenditure (initial estimate)
- **BMR — Mifflin-St Jeor** (default): `10·kg + 6.25·cm − 5·age + 5` (male) / `− 161` (female). "Prefer not to say" uses the midpoint constant (−78).
- **BMR — Katch-McArdle** (offered when the user enters a body-fat % they trust): `370 + 21.6 · lean mass kg`.
- **Maintenance (TDEE)** = BMR × activity factor: Sedentary 1.2 · Lightly active 1.375 · Moderately active 1.55 · Very active 1.725 · Extremely active 1.9. Each level has a description that **includes** training ("desk job + 3–4 lifting sessions/week ≈ Moderately active") so training isn't double-counted.
- Training sessions/week is stored for protein defaults and the progress reads, not added on top of TDEE.
- **User-entered numbers (ONB-10):** a measured BMR/RMR replaces the formula BMR (maintenance = measured BMR × activity factor); a known maintenance replaces the TDEE directly. The safety floor uses the measured BMR when there is one, otherwise the formula BMR.
- **Checks on entered numbers:** a "maintenance" within 15% of the formula BMR, or below it, asks whether it's actually a BMR (scans usually report resting BMR, and using it as maintenance would under-feed); any entry more than 25% from the formula estimate asks the user to double-check. These are warnings, never blocks.
- **Accuracy, said plainly:** prediction equations are typically within about 10% of measured resting energy for most adults, and further off for some (Frankenfield et al. 2005). The app says so on the targets step and suggests checking the weight trend after 2–3 weeks; the Phase 2 adaptive estimate (§8.6) does this from real data.

### 8.2 Safety floors and caps (apply to every phase)
- **Calorie floor:** target never below `max(BMR, 1,200 kcal female / 1,500 kcal male or unspecified)`. If the chosen rate would need less, the target is set at the floor and the app shows the slower expected rate.
- **Deficit cap:** ≤ 25% below maintenance.
- **Rate cap:** loss ≤ 1.0% of bodyweight/week; gain ≤ 0.5%/week. Faster options aren't offered.
- **No safe deficit:** if the floor is at or above maintenance, Cut isn't offered (there's no room for a deficit); Maintenance or Recomp is suggested. [Decided 2026-11-03, M1]
- **Underweight guard:** if BMI < 18.5, Cut isn't offered, and a goal weight implying BMI < 18.5 isn't accepted; the copy suggests talking to a clinician.
- **Pregnancy/breastfeeding** (optional onboarding question): no deficit phases; nutrition-optimization or maintenance only, with a clinician note.
- Manual target edits **can** go below the calculated value but **not** below the floor. A typed-in target past the deficit/surplus or rate caps shows a warning with the pace it implies (warn, don't block), and the Plan tab shows that pace next to the planned rate (v1.8).

### 8.3 Phase calorie targets
Energy-density assumption: **7,700 kcal per kg** (≈ 3,500 kcal per lb) of bodyweight change — a known simplification that the Phase 2 adaptive model corrects from real data.

| Phase | Rate options | Default | Daily target |
|---|---|---|---|
| Cut | 0.25 / 0.5 / 0.75 / 1.0 % BW per week | 0.5% | TDEE − (rate × kg × 7,700 ÷ 7), then floors/caps |
| Recomp | Maintenance, −5%, −10% | Maintenance | TDEE × (1 − x) |
| Lean bulk | 0.1 / 0.25 / 0.5 % BW per week | 0.25% | TDEE + (rate × kg × 7,700 ÷ 7), capped at +15% of TDEE |
| Maintenance | — | — | TDEE (shown as a ±100 kcal band) |
| Nutrition optimization | — | — | TDEE, labelled "estimated energy needs" |

### 8.4 Macro and fiber targets
- **Protein** (g per kg of *reference weight*; reference = current weight, or for BMI > 30 the weight at BMI 27.5 for the user's height, to avoid inflated targets):
  Cut 2.2 · Recomp 2.0 · Lean bulk 1.8 · Maintenance 1.6 · Nutrition optimization 1.2 — always ≥ 0.8 g/kg (RDA). Basis: Morton et al. 2018 (benefit plateaus near 1.6 g/kg, upper CI ≈ 2.2 g/kg) and Helms et al. 2014 (higher protein in a deficit for lean trained people).
- **Fat:** default 27% of calories; floor `max(20% of calories, 0.5 g/kg)`.
- **Carbohydrate:** the remainder after protein and fat; if this goes below 50 g, fat drops toward its floor first, then the user is told the protein target is crowding carbs.
- **Fiber:** 14 g per 1,000 kcal of target (Dietary Guidelines for Americans / IOM).
- Users may enter any macro split manually; the app warns (doesn't block) if protein < 0.8 g/kg or fat < 20%.

### 8.5 Weight trend
- **Trend weight:** exponentially weighted moving average of daily weights, α = 0.1 (the Hacker's Diet method); missing days are carried forward, not interpolated.
- **Weekly average:** mean of that calendar week's weigh-ins.
- **Rate of change:** slope of trend weight over the last 14 days, shown in units/week and %BW/week.

### 8.6 Adaptive expenditure (MVP as PRG-5, P1, from v1.3; the advanced model stays in Phase 2)
- `TDEE_est = mean(daily intake) − (Δ trend kg × 7,700) ÷ days`, over a 21-day window, recomputed weekly.
- Only uses windows with ≥ 80% of days fully logged and ≥ 4 weigh-ins per week; otherwise it says "not enough data" and keeps the previous estimate.
- Blended with the previous estimate (e.g. 70/30) to damp noise; the change applied to targets is capped at ±150 kcal per week.
- Output is a **Recommendation** (§4) with the reasoning; targets change only when the user accepts it.

### 8.8 Micronutrient targets and limits
- **Targets:** DRIs for age and sex: RDA where one exists, otherwise AI (e.g. potassium, vitamin K, choline, ALA). Adults 19–50 examples: magnesium 400–420 mg (men) / 310–320 mg (women); iron 8 mg (men) / 18 mg (women); vitamin D 15 µg; B12 2.4 µg; folate 400 µg DFE.
- **Upper limits (UL)** shown as "above UL". Where the UL applies only to supplements or fortified foods (magnesium, niacin, folic acid, vitamin E), the app says so rather than flagging food intake.
- **Limits:** saturated fat < 10% of calories and added sugar < 10% of calories (Dietary Guidelines for Americans 2020–2025); sodium: AI 1,500 mg with the 2,300 mg Chronic Disease Risk Reduction level.
- **Guidelines without a DRI:** EPA + DHA 250–500 mg/day (shown as a guideline, labelled as such). Cholesterol and trans fat are shown without a numeric target ("as low as reasonably possible").
- **Ratios (NUT-7):** sodium-to-potassium ratio by weight (lower is better); fiber per 1,000 kcal (target 14 g); macro split as % of calories.
- Sources to add to Appendix A and re-verify when the calculation engine is built: NASEM DRI tables; Dietary Guidelines for Americans 2020–2025.

### 8.9 Alcohol
- **Standard drink:** 14 g of alcohol (US). Examples: 12 oz beer at 5%, 5 oz wine at 12%, 1.5 oz spirits at 40%. Standard drinks = grams of alcohol ÷ 14.
- **Energy:** 7 kcal per gram of alcohol. Alcohol calories count toward the daily total but are not counted as protein, carbohydrate or fat.
- **Default daily limit:** Dietary Guidelines for Americans 2020–2025: up to 2 drinks a day for men and 1 for women, with "less is better". "Prefer not to say" defaults to 1. The user can set 0–3. If pregnant or breastfeeding is set, the limit is 0 ("no amount is known to be safe").

### 8.7 Strength
- Estimated 1RM (Epley): `weight × (1 + reps ÷ 30)`, only for sets of ≤ 12 reps; shown as "estimated".

### 8.10 Engine conventions [Decided 2026-11-03, M1]
Where §8 leaves a detail open, the calculation engine (`app/js/calc/`) does this:
- **Rounding:** BMR and maintenance to whole kcal, before anything else uses them, so the working on screen adds up; calorie targets to the nearest 10 kcal, rounded **up** when the floor applies, so a target is never below the floor; grams to whole grams. Halves round away from zero.
- **Floors apply to every phase**, including Maintenance and Nutrition optimization. The maintenance band never dips below the floor.
- **Fat floor** uses current body weight (0.5 g/kg); **protein** uses the reference weight (§8.4).
- **Carbs under 50 g:** fat comes down only as far as needed (in whole grams), not straight to its floor.
- **Weight trend:** each day's first weigh-in (earliest time if times are known); the trend starts at the first weigh-in. **Weeks** run Monday to Sunday by default (Sunday-first is an option). **14-day rate** is the least-squares slope of the trend's last 15 daily points (14 days), as kg/week and % of the latest trend weight.
- **Alcohol grams** = volume (ml) × ABV × 0.789 g/ml (ethanol density).
- **Ages** come from date of birth and the day being calculated; under 18 is refused (ONB-2).
- Every result carries `CALC_VERSION` (now 1.0.0) and its working as plain-language steps.
- **Home insight (HOM-4), decided while building M7a:** one card at most, the first that applies of: protein under 60% of target from 6 pm with food logged; fiber under 50% of target from 6 pm when fiber is known for at least half the day's calories; no weigh-in for 7 days (or none yet from the third day of use). **Quick log (HOM-3):** the foods most often logged in the current time slot over the last 30 days, each with its most recent amount, leaving out ones already logged in that slot today.
- **Maintenance check (PRG-5), decided while building M6b:** a day is "fully logged" when its logged calories reach at least half of that day's calorie target (800 kcal with no target); the 21-day window ends yesterday; a difference under 50 kcal counts as a match; after a decision the next suggestion waits 7 days; accepting saves the new maintenance as a known maintenance (source "tracking") and a new calculated target version with origin "recommendation"; the decision (accepted or declined) is recorded with its working.
- **Progress read bands** (PRG-2 gives only "on track"): cut/bulk weight rate — watch up to ±100% of the planned rate, off track beyond; recomp — watch up to ±0.5 %BW/wk; maintenance — watch up to ±3%; waist changes under 0.5 cm count as flat (tape noise), cut waist flat = watch, recomp waist rising 0.5–1 cm = watch, maintenance waist watch to ±2 cm, bulk waist watch up to 1.5× the allowed growth; cut lifts watch to −10%; recomp/bulk lifts "rising" = any gain, watch to −2.5%. Nutrition optimization: logging on track at ≥ 80% of the last 14 days (watch ≥ 50%); nutrients on track when ≥ 80% meet target (watch ≥ 60%). Phase-start weight is the trend on the start day.
- **Adaptive maintenance:** the blend is 70% new estimate, 30% previous; Δ trend is measured between the window's first and last day (20 days of change); "≥ 4 weigh-ins per week" is checked for each of the three weeks.
- **DRIs:** an 18-year-old uses the 14–18 group; "prefer not to say" takes the higher of the male and female targets; pregnancy/lactation values apply to ages 14–50. "Furthest from target" lists over-limit items first, then the lowest % of target, skipping nutrients with under 50% data coverage.

## 9. UX principles

- **Premium and calm** — Oura / Whoop / Levels feel: dark-first, generous spacing, one accent color, numbers big and labels small.
- **Visual identity: Phase Light [Decided 2026-11-02].** Deep night background with a soft glow at the top whose color shows the current phase (default Aurora palette: cut glacier blue, recomp iris, lean bulk ember, maintenance sage, nutrition coral). The glow stays at the top; text sits on solid surfaces. Typeface: Onest. Macros are shown as steps of the phase color, always labelled. Users can change palette and mode (ACC-6). Prototype: `prototype/directions/` (option 04) and `prototype/appearance/`.
- **Brand mark [Decided 2026-11-03]:** two leaves forming an L, in brand green (Leaf `#A3C28E` on Forest `#0B1B14`), wordmark in Onest. The mark and app icon stay green whatever phase or palette is active; only the in-app glow follows the phase. Rules and files: [`brand/README.md`](brand/README.md).
- **Fast paths first:** recent/frequent foods before search; one-tap saved meals; the keyboard opens on search.
- **Depth on demand:** micronutrients, formulas and data sources are one tap away, never on the default view.
- **Honest labels:** measured / estimated / derived; verified / community / user / AI-estimate.
- **Neutral tone:** no red "over" states, no streak shaming, no moralizing about foods.
- **Accessibility:** text scales with the iPhone's text-size setting, VoiceOver labels on charts (spoken summaries), 4.5:1 contrast, color never the only signal.

## 10. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Cold start to Home < 2 s; search results < 300 ms for cached/recent and < 800 ms p95 from the server; barcode result < 1.5 s on scan |
| Offline | Diary, quick add, custom foods, recents and saved meals work offline; conflicts resolved last-write-wins per entry, with no data loss |
| Reliability | No logged entry is ever lost; sync is idempotent; crash-free sessions ≥ 99.5%. Errors are reported to Leanward's own Supabase table (no third party), and reports never contain food, weight or measurement data (§15 Q13) |
| Security | TLS everywhere; row-level access control so users can only read their own rows; secrets never shipped in the app bundle |
| Privacy | Health data minimized and encrypted at rest; lab results (Phase 2) get the strictest handling in LAB-8; a plain-language privacy policy that matches what the app does; any Apple Health data (if ever added) never used for ads or sold |
| Platform | iPhone Safari on iOS 17+, installed to the home screen; works offline once loaded. Other browsers aren't tested at launch |
| Correctness | Calculation module is pure, versioned and unit-tested against hand-worked examples for every phase, floor and cap |

## 11. Data model (conceptual)

Goals and phases are separate entities (blueprint §16). Everything is history-preserving.

| Entity | Key fields |
|---|---|
| User / Profile | id, auth ids, DOB, sex-for-calc, height, units, activity level, training/week, preferences |
| Goal | id, user, type, created_at, ended_at |
| Phase | id, user, goal, type, start_date, end_date, planned_end / target_weight, rate setting, calc_version |
| TargetSet | id, phase, effective_from, kcal, protein, carbs, fat, fiber, micronutrient targets, origin (calculated / manual / recommendation), calc inputs snapshot |
| Food | id, source, source_id, verification, name, brand, barcode(s), nutrients per 100 g, servings[], last_updated |
| CustomFood | Food fields + owner |
| SavedMeal | id, owner, name, items[] (food, qty, unit) |
| DiaryEntry | id, user, date, slot, food ref, qty, unit, **nutrient snapshot**, logged_via (search / barcode / quick / meal / copy / AI), created/updated |
| WeightEntry | id, user, timestamp, value, source (manual / Health), note |
| MeasurementEntry | id, user, date, site (waist, hip…), value, method |
| BodyFatEntry | id, user, date, value, method |
| LabReport (P2) | id, user, collected_on, lab name (as printed, optional), source (pdf / manual), imported_at |
| LabResult (P2) | id, report, marker, value, unit, reference range (low / high / text, as printed), flag, confirmed_by_user |
| LiftEntry | id, user, date, lift, weight, reps, e1RM (derived) |
| Recommendation (P2) | id, user, phase, type, proposed change, reasoning, status (pending / accepted / declined), created/decided |
| FoodReport | id, food, user, issue type, note, status |
| PushSubscription (v1.26) | id, user, endpoint, keys, time zone, created, last_seen |
| ReminderSend (v1.26) | user, type (log / weigh-in / check-in), local date, sent_at |

## 12. Technical approach [Decided 2026-11-02 — §15 Q2]

Leanward is built the same way as PR Forge, so the setup and update routine you already use carries over.

- **App:** a web app in plain HTML, CSS and JavaScript, with no build step. Pure logic (calculations, units, sync rules) lives in separate files with no UI code, and is tested with `node --test`.
- **Hosting:** GitHub Pages, free because the repo is public (as PR Forge's is). No secrets go in the repo; user data is protected by Supabase's row-level security, not by hiding the code. Users open the address in Safari and tap **Share → Add to Home Screen**.
- **Offline:** a service worker caches the app's files. The diary, foods and measurements are kept on the phone in IndexedDB, which holds far more than the `localStorage` PR Forge uses. Changes sync to Supabase when online.
- **Sync:** follows PR Forge's proven rules: client-made IDs, server-stamped `updated_at`, last-write-wins per entry, and deletion markers ("tombstones") so deletes reach other devices.
- **Backend:** Supabase (Postgres, auth incl. Google sign-in, row-level security, edge functions). The supabase-js library is bundled with the app, as PR Forge does, so it works offline. The free tier covers development. The full USDA catalog may outgrow the free database size, so check this during the build (development plan M4).
- **Food search:** Postgres full-text + trigram search over the imported catalog; move to a dedicated search service only if needed.
- **Calculation engine:** standalone JavaScript files with no UI code, heavily unit-tested.
- **Barcode:** the phone camera through the browser, decoded by a JavaScript barcode library. Safari doesn't support the browser's built-in barcode API.
- **Reminders (ACC-5) [Decided v1.26]:** standard Web Push, no third-party push service. The phone's subscription (endpoint, keys, time zone) is saved in `lw_push_subscriptions` (own rows only; deleted with the account). A Supabase Edge Function runs every 15 minutes (`pg_cron` + `pg_net`), finds reminders due in each user's local time, applies ACC-5's skip rules from the user's own synced rows, records each send in `lw_reminder_sends` so none goes twice, and sends it signed with Leanward's VAPID key (kept in Supabase secrets, never in the repo). Push payloads are encrypted to the phone; they hold only the fixed text and the screen to open. Subscriptions Apple reports as gone (404/410) are deleted.
- **Path to the App Store (not planned):** if Apple Health or an App Store listing is ever needed, the same web code can be wrapped with Capacitor instead of rewritten.

## 13. Success metrics

| Metric | MVP target |
|---|---|
| Time to log a saved/frequent meal (returning user) | ≤ 3 taps, median ≤ 5 s |
| Median time to log any meal | < 30 s |
| Search success (a result chosen within the first 5) | ≥ 80% |
| Barcode hit rate (US packaged foods) | ≥ 85% |
| Day-7 / day-30 retention | ≥ 40% / ≥ 20% (beta cohort) |
| Days with ≥ 2 meals logged, among active users | ≥ 70% |
| Weekly weigh-ins among users with a weight-change phase | ≥ 3 |
| Food reports per 1,000 logged entries | tracked, falling over time |

Instrumentation counts events only (e.g. "entry logged via barcode") — never food names or body data (ACC-3).

## 14. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Food data quality / coverage (esp. restaurants, non-US) | Users leave if search fails | Hybrid sources, verification badges, fast custom-food path, track search success; a commercial API is the fallback |
| Scope — the MVP is large for a solo build | Delays | Strict P0/P1; prototype first; cut P1s before slipping P0s |
| Health/safety misuse (very low intake) | User harm, reputational risk | §8.2 floors and caps, 18+, neutral tone, ED resource link |
| Open Food Facts share-alike | License non-compliance | Separate tables, attribution, keep corrections separable; legal review before launch |
| Backend cost and maintenance | Ongoing cost | Managed Supabase, monitor usage, no expensive per-search third-party calls |
| Name / trademark | Rename late | Run domain, USPTO and App Store name checks before brand work |
| Web-app limits on iPhone | No Apple Health; iOS can clear a website's data | Use it from the home-screen icon (iOS keeps home-screen app data); the cloud copy is the backup; a Capacitor wrapper is the path if Apple Health or the App Store becomes necessary |
| Barcode scanning in Safari | Slower or less reliable scans | Use a proven JavaScript barcode library; measure against the 1.5 s target early (development plan M4/M5) |

## 15. Open questions

**Answered 2026-11-02** (logged in `decisions.md`)
| # | Question | Answer |
|---|---|---|
| 1 | MVP scope changes S1–S6 (§5.1) | Accepted |
| 2 | Tech stack (§12) | Web app like PR Forge: GitHub Pages + Supabase |
| 3 | Accounts | Sign-in required from day one |
| 4 | Food data (§7) | USDA + Open Food Facts hybrid; commercial API evaluated later |
| 5 | Region | US-only at launch |
| 6 | Strength tracking | Connect to PR Forge (manual entry stays as a fallback) |
| 6a | PR Forge connection: when | In the MVP |
| 6b | PR Forge connection: how | Separate Supabase projects (revised in v1.3); a one-time "Connect PR Forge" Google sign-in, then Leanward reads the user's own PR Forge workouts read-only |
| 7 | Defaults in §8 | Accepted as written |
| 8 | Exercise calories | Not added back to the food budget in the MVP (activity level already counts training) |
| 9 | Age gate | 18+ only |
| 10 | Monetization | Free MVP with no paywall; blueprint §14 free/premium split later, paid through web payments (e.g. Stripe) |
| 11 | Progress photos | Phase 2 |
| 12 | Visual identity | Prototype proposes 2–3 directions |
| 13 | Error reporting | Logged to Leanward's own Supabase table; never includes food or body data |
| R | Hosting | Make the repo public and use free GitHub Pages |

No questions are open. Signed off 2026-11-02. Changes from here go through the feedback log below and `decisions.md`.

## 16. Feedback log

| Date | Version | Change |
|---|---|---|
| 2026-11-02 | 0.1 | First draft from Blueprint v2.0 |
| 2026-11-02 | 0.2 | §15 answers 1–7, 11, 12 applied. Stack changed to a GitHub Pages + Supabase web app like PR Forge (§12 rewritten; corrects v0.1's claim that PR Forge uses Expo). Google sign-in replaces Sign in with Apple. PR Forge lift connection added to MEA-5. Web-app risks added to §14. Open questions narrowed to R, 6a, 6b, 8, 9, 10, 13. |
| 2026-11-02 | 0.2 | R answered: repo goes public, hosted free on GitHub Pages. |
| 2026-11-02 | 0.3 | Remaining answers applied: PR Forge connection in the MVP via shared Supabase project and Google sign-in (6a/6b); exercise calories not added back (8); 18+ (9); free MVP, web payments later (10); first-party error reporting (13). All §15 questions answered. |
| 2026-11-02 | 1.0 | Signed off by the owner. Next: prototype (`prototype/`) and development plan M0. |
| 2026-11-02 | 1.1 | Visual identity chosen: Phase Light (§9). New requirement ACC-6, appearance settings with color palettes, follow-phase color and Dark/Light mode (owner request). |
| 2026-11-02 | 1.2 | LOG-14 alcohol tracking (P1) and §8.9; over-limit days use the neutral amber marker, not red (owner decision).
| 2026-11-02 | 1.2 | Lab history is append-only (LAB-1c); LAB-6 expanded into a "Between reports" trend view with diet, weight and phase per period.
| 2026-11-02 | 1.2 | eGFR without a printed range uses the standard < 60 cutoff (owner decision).
| 2026-11-02 | 1.2 | Labs wording made lab-neutral ("Import labs"); manual entry added as an optional path (LAB-1b). |
| 2026-11-03 | 1.3 | Leanward gets its own Supabase project instead of sharing PR Forge's (Q6b, MEA-5); the PR Forge connection becomes a one-time "Connect PR Forge" sign-in, still read-only (owner decision). |
| 2026-11-03 | 1.3 | PRG-5 maintenance check moved into the MVP (P1), built after food logging (owner decision). |
| 2026-11-03 | 1.3 | ONB-10 "I know my numbers" (measured BMR/RMR or known maintenance), checks on entered numbers and the accuracy note in §8.1 (owner request after testing: the formula overestimated their maintenance). |
| 2026-11-03 | 1.3 | ONB-1: Google sign-in only for now; email + password deferred (owner decision). |
| 2026-11-03 | 1.3 | §8.10 extended for M1b: progress-read bands, adaptive blend, DRI life stages. |
| 2026-11-25 | 1.26 | ACC-5 reminders specified (owner approved): log, weigh-in and check-in day, off by default, skip rules, fixed lock-screen wording, 14-day pause; §12 Web Push through a Supabase Edge Function. |
| 2026-11-24 | 1.25 | HOM-3: "Often at <meal>" in the add sheet (the quick picks had no place on screen since v0.22) and "Your usual <meal>" one-tap sets. |
| 2026-11-24 | 1.24 | PRG-7 goal date as a range (owner approved). |
| 2026-11-24 | 1.23 | PHS-6 planned-end hand-off specified (maintenance, diet break, keep going, next phase); owner approved. |
| 2026-11-23 | 1.22 | PRG-6 weekly check-in moved into the MVP (owner approved). |
| 2026-11-23 | 1.21 | Recipes renumbered LOG-15 (two rows were both LOG-11). Audit fixes in v0.27: one weight vocabulary ("Weight trend" vs "last weigh-in"), offline/backup sign on Today, lean mass no longer offers "Add". |
| 2026-11-23 | 1.20 | LOG-11: swipe left to delete a food or a whole meal, with Undo. |
| 2026-11-18 | 1.19 | LOG-10: "Same as yesterday" for every meal, not just breakfast (beta feedback). |
| 2026-11-18 | 1.18 | Owner: Search online (FDB-3a) runs automatically when the catalog has no exact match; privacy page updated. |
| 2026-11-18 | 1.17 | NUT-9b training days you set yourself; food search shows closest matches (all but one word) when no food has every word, with Search online first. |
| 2026-11-18 | 1.16 | §9 visual standard: the owner's approved Today and Progress mockups (design handoff v2) are the reference; coral palette is the default; Progress gains sub-tabs (Overview, Weight, Strength, Nutrition, Body Comp). No calculation changes. |
| 2026-11-18 | 1.15 | NUT-9 training days from PR Forge (guidance only), strength-dip context, carbs per kg on Plan for frequent trainers. |
| 2026-11-17 | 1.14 | Simulated-user harness: maintenance check waits for a 4-week trend and uses a 150 kcal minimum; no slow verdict before day 28; eat-less only on a clear stall. |
| 2026-11-17 | 1.13 | Audit follow-up: "Needs a look" replaces "Off track"; welcome back after 5+ days without logging; context when over calories; gentler log-more and weigh-more wording; waist read averages 2 readings at each end with a 1 cm tape-noise band. |
| 2026-11-17 | 1.12 | Audit PR A: care steps (below floor, fast loss), floor-aware advice, multi-session lifts, phase-aware maintenance window, 100 kcal minimum, protein tip on adequacy. |
| 2026-11-17 | 1.11 | Coaching review follow-up: PRG-4 rules (8 weigh-ins, waist supports only, small change with good adherence, 100–150 / 200–250 kcal steps), PRG-5 confidence factors, adequate vs target protein wording. |
| 2026-11-17 | 1.10 | NUT-8: protein "enough" from 1.6 g/kg, meal line, 4/4/9 note (coaching review). |
| 2026-11-17 | 1.9 | PRG-4 "Next week" step and PRG-5 confidence level (after the coaching review). |
| 2026-11-17 | 1.8 | LOG-11 recipes moved from Phase 2 into the MVP (owner decision, after the outside product review); typed-in targets show the pace they imply (§8.2). |
| 2026-11-16 | 1.7 | §9 navigation: four tabs (Today · Progress · Plan · Profile) with the + in the tab bar; Home and Diary merge into Today; "Is it working?" moves to Progress. HOM-5 reworded. From the design audit the owner asked for. |
| 2026-11-16 | 1.6 | ACC-6 default mode is Match iPhone. ACC-5 reminders (P1) move to after the beta: web push on iPhone needs a push server and only works for home-screen apps. |
| 2026-11-16 | 1.5 | §8.10: maintenance check rules (what counts as a logged day, window, 50 kcal threshold, weekly wait). |
| 2026-11-16 | 1.5 | MEA-5: key lifts are read from PR Forge only for now; manual lift entry deferred (owner decision). |
| 2026-11-06 | 1.4 | Owner request: FDB-3a Search online (Open Food Facts text search) when the catalog doesn't have a food; branded coverage gaps seen on the real catalog (e.g. Quest Overload bars, most Transparent Labs products). |
| 2026-11-03 | 1.3 | §8.10 engine conventions and the "no safe deficit" rule in §8.2, from building the M1 calculation engine. |
| 2026-11-03 | 1.3 | Brand mark added to §9: leaf L logo, fixed brand green, Onest wordmark, no ® until the trademark is registered (owner asked for a designer's call). |
| 2026-11-02 | 1.2 | Owner requests: NUT-2 extended (omega-3s, phosphorus, copper, selenium, choline); new NUT-6 (Diary nutrient review, P0) and NUT-7 (nutrient depth, P1); §8.8 micronutrient targets and limits; §6.10 lab results import (Phase 2) with on-phone reading, review before saving, suggestions the user accepts, and safety/privacy rules; LabReport and LabResult entities. |

## Appendix A — Calculation sources

- KDIGO 2012 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease (GFR < 60 mL/min/1.73m² threshold).
- Mifflin MD, St Jeor ST, et al. *A new predictive equation for resting energy expenditure in healthy individuals.* Am J Clin Nutr. 1990.
- Katch-McArdle lean-mass BMR equation (McArdle, Katch & Katch, *Exercise Physiology*).
- Morton RW, et al. *A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength.* Br J Sports Med. 2018.
- Helms ER, Aragon AA, Fitschen PJ. *Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation.* J Int Soc Sports Nutr. 2014.
- Institute of Medicine / National Academies — Dietary Reference Intakes (RDA, AI, UL); Dietary Guidelines for Americans (fiber 14 g/1,000 kcal).
- Walker J. *The Hacker's Diet* (exponentially smoothed trend weight).
- Epley B. *Poundage Chart* (1985) — estimated 1RM.
- Frankenfield D, Roth-Yousey L, Compher C. *Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review.* J Am Diet Assoc. 2005 — Mifflin-St Jeor is the most accurate common equation, but individual errors beyond ±10% are common.
- Hall KD, et al. *Quantification of the effect of energy imbalance on bodyweight.* Lancet. 2011 — why 7,700 kcal/kg is only a starting approximation.
- National Academies of Sciences, Engineering, and Medicine. *Dietary Reference Intakes for Sodium and Potassium.* 2019 (potassium AIs, sodium AI and CDRR; Appendix J reprints the DRI summary tables used for all other targets and ULs).
- U.S. Department of Agriculture and U.S. Department of Health and Human Services. *Dietary Guidelines for Americans, 2020–2025* — alcohol limits (up to 2 drinks/day men, 1 women), saturated fat and added sugar < 10% of calories, the 14 g standard drink.

These citations are from established literature and are to be re-verified when the calculation engine is built.
