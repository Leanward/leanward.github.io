/* Leanward — M3 screens: onboarding (ONB-2…9), starting a new phase (PHS-2/3), the Phase tab (PHS-4),
 * editing targets (PHS-5), and the Home and Profile cards that show them.
 * Flows and wording follow the prototype (prototype/app/index.html). Numbers come from js/calc via
 * js/model.js; saving goes through ctx.save (the phone's database, then sync).
 */
(function (root) {
  'use strict';

  var C = root.LW.calc, M = root.LW.model, core = C.core, fmt = core.fmt;

  var FIRST = ['about', 'activity', 'goal', 'phase', 'targets', 'prefs', 'install'];
  var NEW = ['goal', 'phase', 'targets'];
  var PHASE_ORDER = ['cut', 'recomp', 'bulk', 'maintenance', 'nutrition'];
  var PHASE_LABEL = { cut: 'Cut', recomp: 'Recomp', bulk: 'Lean bulk', maintenance: 'Maintenance', nutrition: 'Nutrition' };
  var PHASE_NAME = { cut: 'Cut', recomp: 'Recomp', bulk: 'Lean bulk', maintenance: 'Maintenance', nutrition: 'Nutrition optimization' };
  var PREFS = ['Vegetarian', 'Vegan', 'Pescatarian', 'Dairy-free', 'Gluten-free', 'Nut-free', 'Halal', 'Kosher'];
  var BF_SOURCES = [['guess', 'Guess'], ['scale', 'Smart scale'], ['calipers', 'Calipers'], ['dexa', 'DEXA'], ['other', 'Other']];
  var SIGNAL = { 'on-track': ['', 'On track'], watch: ['watch', 'Watch'], 'off-track': ['watch', 'Off track'], collecting: ['wait', 'Collecting data'] };

  function create(ctx) {
    var S = ctx.state, esc = ctx.esc;

    /* ---------- units ---------- */
    function metric(u) { return (u || (S.rows.profile && S.rows.profile.units) || 'us') === 'metric'; }
    function wt(kg, u, dp) { return metric(u) ? fmt(kg, dp == null ? 1 : dp) + ' kg' : fmt(core.kgToLb(kg), dp == null ? 1 : dp) + ' lb'; }
    function ht(cm, u) { if (metric(u)) return fmt(cm) + ' cm'; var f = core.cmToFtIn(cm); return f.ft + '′' + f.in + '″'; }
    function weekly(kg, u) { var v = metric(u) ? kg : core.kgToLb(kg); return core.fmtSigned(v, 2) + (metric(u) ? ' kg' : ' lb') + '/week'; }
    function rateLabel(type, rate) { return type === 'recomp' ? (rate ? '−' + rate + '% vs maintenance' : 'at maintenance') : rate + '% a week'; }

    /* ---------- onboarding state ---------- */
    function startOnboarding() {
      S.ob = { mode: 'first', step: 0, err: '', manual: {}, a: { units: 'us', dob: '', sex: null, cm: null, kg: null, ft: '', inch: '', lb: '', activity: null, trainingPerWeek: null, pregnantOrBreastfeeding: false, bodyFatPct: null, bodyFatSource: 'guess', useBodyFat: false, waistCm: null, goal: null, phase: null, rate: null, foodPrefs: [], knownMode: 'none', knownBmr: null, knownBmrSource: 'scan', knownTdee: null, knownTdeeSource: 'tracking' } };
    }
    function startNewPhase() {
      var r = S.rows, p = M.profileFromRows(r.profile, r.weights), g = currentGoal();
      S.ob = { mode: 'new', step: 0, err: '', manual: {}, a: Object.assign({ units: r.profile.units, cm: p.cm, kg: p.kg, bodyFatSource: r.profile.body_fat_source, foodPrefs: [] }, p, { goal: g ? g.type : null, phase: null, rate: null, trainingPerWeek: r.profile.training_per_week }, knownFromProfile(r.profile)) };
    }
    function steps() { return S.ob.mode === 'new' ? NEW : FIRST; }
    function stepName() { return steps()[S.ob.step]; }
    function today() { return ctx.today(); }
    function ageOf(a) { return a.dob ? core.ageOn(a.dob, today()) : null; }
    function calcProfile(a) { return M.profileOf(knownApplied(a)); }

    /* ---------- "I know my numbers" (ONB-10) ---------- */
    // o is the onboarding answers or the maintenance sheet: { knownMode, knownBmr, knownBmrSource, knownTdee, knownTdeeSource }
    function knownApplied(a) {
      var o = Object.assign({}, a);
      if (o.knownMode !== 'bmr') o.knownBmr = null;
      if (o.knownMode !== 'tdee') o.knownTdee = null;
      return o;
    }
    function knownFromProfile(p) {
      if (p.known_tdee_kcal != null) return { knownMode: 'tdee', knownTdee: Number(p.known_tdee_kcal), knownTdeeSource: p.known_tdee_source || 'other', knownBmr: null, knownBmrSource: 'scan' };
      if (p.known_bmr_kcal != null) return { knownMode: 'bmr', knownBmr: Number(p.known_bmr_kcal), knownBmrSource: p.known_bmr_source || 'other', knownTdee: null, knownTdeeSource: 'tracking' };
      return { knownMode: 'none', knownBmr: null, knownBmrSource: 'scan', knownTdee: null, knownTdeeSource: 'tracking' };
    }
    var KNOWN_SRC = { bmr: [['scan', 'Body composition scan'], ['calorimetry', 'Metabolic test (RMR)'], ['other', 'Other']], tdee: [['tracking', 'Tracking my intake and weight'], ['coach', 'Coach or dietitian'], ['other', 'Other']] };
    function knownBlock(o, plan) {
      var mode = o.knownMode || 'none', isB = mode === 'bmr', val = isB ? o.knownBmr : o.knownTdee;
      var warns = plan ? plan.energyWarnings : [];
      return '<details class="card"' + (mode !== 'none' ? ' open' : '') + '><summary>I know my numbers</summary>' +
        '<p class="small muted">If you\'ve measured your resting BMR (most body composition scans report this) or know your real maintenance from weeks of tracking, Leanward can use it instead of the formula. Safety limits still apply.</p>' +
        '<div class="seg" style="margin-top:8px">' + [['none', 'Use the estimate'], ['bmr', 'Measured BMR'], ['tdee', 'Known maintenance']].map(function (m) { return '<button type="button" data-a="knownmode" data-v="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>' +
        (mode === 'none' ? '' :
          '<div class="grid2" style="margin-top:10px"><div class="field"><label for="kn-v">' + (isB ? 'BMR / RMR (kcal a day)' : 'Maintenance (kcal a day)') + '</label><input type="number" id="kn-v" inputmode="numeric" data-f="knownVal" data-redraw="1" value="' + (val == null ? '' : val) + '" placeholder="' + (isB ? 'e.g. 1,650' : 'e.g. 2,200') + '"></div>' +
          '<div class="field"><label for="kn-s">Where it\'s from</label><select id="kn-s" data-f="knownSrc">' + KNOWN_SRC[isB ? 'bmr' : 'tdee'].map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === (isB ? o.knownBmrSource : o.knownTdeeSource) ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></div></div>' +
          (isB ? '<p class="small muted">Leanward multiplies a measured BMR by your activity level to get maintenance.</p>' : '<p class="small muted">Use the calories that kept your weight steady for a few weeks, not a resting (BMR) number.</p>')) +
        (o.knownErr ? '<div class="warnbox">' + esc(o.knownErr) + '</div>' : '') +
        warns.map(function (w) { return '<div class="warnbox">' + esc(w.message) + '</div>'; }).join('') +
        '</details>';
    }
    /** Maintenance, where it came from, and how far the target is from it. */
    function maintLine(tdee, source, formulaTdee, kcal, phase) {
      var src = source === 'known-tdee' ? 'entered by you' : source === 'known-bmr' ? 'from your measured BMR' : 'estimated by formula';
      var diff = kcal - tdee, pct = diff / tdee * 100;
      var rel = phase === 'nutrition' || Math.abs(diff) < 15 ? 'about the same as maintenance' : fmt(Math.abs(diff)) + ' kcal ' + (diff < 0 ? 'below' : 'above') + ' maintenance (' + core.fmtSigned(pct, 0) + '%)';
      return '<div class="row"><span class="small muted">Maintenance</span><b>≈ ' + fmt(tdee) + ' kcal</b></div>' +
        '<p class="small muted" style="margin:2px 0 0">' + src + (source !== 'formula' && formulaTdee ? ' · formula estimate ' + fmt(formulaTdee) : '') + ' · your target is ' + rel + '</p>';
    }
    function knownInput(o, el) {
      var f = el.dataset.f, v = el.value, isB = o.knownMode === 'bmr';
      if (f === 'knownSrc') { if (isB) o.knownBmrSource = v; else o.knownTdeeSource = v; return true; }
      if (f !== 'knownVal') return false;
      var n = num(v), r = C.energy.KNOWN_RANGE[isB ? 'bmr' : 'tdee'];
      o.knownErr = '';
      if (n != null && !(n >= r[0] && n <= r[1])) { o.knownErr = (isB ? 'A BMR' : 'Maintenance') + ' should be between ' + fmt(r[0]) + ' and ' + fmt(r[1]) + ' kcal.'; n = null; }
      if (isB) o.knownBmr = n; else o.knownTdee = n;
      return true;
    }
    function energy(a) {
      var cp = calcProfile(a);
      return C.energy.estimate({ kg: a.kg, cm: a.cm, age: ageOf(a), sex: a.sex, activity: a.activity, bodyFatPct: a.bodyFatPct == null ? undefined : a.bodyFatPct, useBodyFat: cp.useBodyFat,
        knownBmr: cp.knownBmr, knownBmrSource: cp.knownBmrSource, knownTdee: cp.knownTdee, knownTdeeSource: cp.knownTdeeSource });
    }
    function phaseOpts(a) { var e = energy(a); return C.targets.phaseOptions({ kg: a.kg, cm: a.cm, sex: a.sex, bmr: e.bmr, tdee: e.tdee, pregnantOrBreastfeeding: a.pregnantOrBreastfeeding }); }

    function validate() {
      var a = S.ob.a, n = stepName();
      if (n === 'about') {
        if (!a.dob) return 'Enter your date of birth.';
        var age = ageOf(a);
        if (age < 18) return 'Leanward is for adults 18 and over, so we can\'t set up calorie targets for you.';
        if (age > 110) return 'Check your date of birth.';
        if (!a.sex) return 'Choose the sex used for the calorie formula.';
        if (!(a.cm >= 120 && a.cm <= 230)) return 'Enter your height.';
        if (!(a.kg >= 30 && a.kg <= 300)) return 'Enter your weight.';
        if (a.bodyFatPct != null && !(a.bodyFatPct >= 3 && a.bodyFatPct <= 60)) return 'Body fat should be between 3% and 60%, or leave it empty.';
        if (a.waistCm != null && !(a.waistCm >= 40 && a.waistCm <= 200)) return 'Check your waist measurement, or leave it empty.';
      }
      if (n === 'activity' && !a.activity) return 'Choose how active you are.';
      if (n === 'goal') {
        if (!a.goal) return 'Choose a goal.';
        var g = M.goalOptions(calcProfile(a), energy(a)).filter(function (x) { return x.id === a.goal; })[0];
        if (!g.available) return g.message;
      }
      if (n === 'phase') {
        if (!a.phase) return 'Choose a phase.';
        var o = phaseOpts(a)[a.phase];
        if (!o.available) return o.message;
      }
      return '';
    }

    /* ---------- onboarding views ---------- */
    function dots() {
      var st = steps(), k = S.ob.step;
      return '<div class="ob-top">' + (k > 0 || S.ob.mode === 'new' ? '<button class="iconbtn" data-a="obback" aria-label="Back">‹</button>' : '') +
        '<div class="dots">' + st.map(function (_, i) { return '<i class="' + (i <= k ? 'on' : '') + '"></i>'; }).join('') + '</div></div>';
    }
    function foot(label, skip) {
      return (S.ob.err ? '<div class="warnbox" role="alert">' + esc(S.ob.err) + '</div>' : '') +
        '<button type="button" class="btn block" data-a="obnext">' + label + '</button>' + (skip ? '<button type="button" class="link" data-a="obnext" style="justify-self:center">Skip</button>' : '');
    }
    function seg(key, options, cur) {
      return '<div class="seg">' + options.map(function (o) { return '<button type="button" data-a="obset" data-k="' + key + '" data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    }

    function vAbout() {
      var a = S.ob.a, m = a.units === 'metric', age = ageOf(a);
      return '<div class="ob"><h2>About you</h2><p class="lede">Used to estimate how much energy you burn.</p></div>' +
        '<div class="field"><span class="lab">Units</span>' + seg('units', [['us', 'lb, ft/in'], ['metric', 'kg, cm']], a.units) + '</div>' +
        '<div class="field"><label for="ob-dob">Date of birth</label><input type="date" id="ob-dob" data-f="dob" value="' + esc(a.dob) + '" max="' + today() + '"></div>' +
        '<div id="ob-minor">' + minorNote(age) + '</div>' +
        '<div class="field"><span class="lab">Sex for the calorie formula</span>' + seg('sex', [['male', 'Male'], ['female', 'Female'], ['unspecified', 'Prefer not to say']], a.sex) +
          '<span class="small muted">Only used in the BMR formula. "Prefer not to say" uses the midpoint.</span></div>' +
        (m ? '<div class="grid2"><div class="field"><label for="ob-cm">Height (cm)</label><input type="number" id="ob-cm" inputmode="decimal" data-f="cm" value="' + (a.cm ? core.round(a.cm) : '') + '"></div>' +
              '<div class="field"><label for="ob-kg">Weight (kg)</label><input type="number" id="ob-kg" inputmode="decimal" step="0.1" data-f="kg" value="' + (a.kg ? core.round(a.kg, 0.1) : '') + '"></div></div>'
           : '<div class="grid2"><div class="field"><label for="ob-ft">Height (ft)</label><input type="number" id="ob-ft" inputmode="numeric" data-f="ft" value="' + esc(a.ft) + '"></div>' +
              '<div class="field"><label for="ob-in">(in)</label><input type="number" id="ob-in" inputmode="numeric" data-f="inch" value="' + esc(a.inch) + '"></div></div>' +
             '<div class="field"><label for="ob-lb">Weight (lb)</label><input type="number" id="ob-lb" inputmode="decimal" step="0.1" data-f="lb" value="' + esc(a.lb) + '"></div>') +
        (a.sex && a.sex !== 'male' ? '<label class="check"><input type="checkbox" data-f="preg"' + (a.pregnantOrBreastfeeding ? ' checked' : '') + '> I\'m pregnant or breastfeeding (optional)</label>' : '') +
        '<details class="card"' + (a.bodyFatPct != null || a.waistCm != null ? ' open' : '') + '><summary>Optional: body fat and waist</summary>' +
          '<div class="grid2" style="margin-top:10px"><div class="field"><label for="ob-bf">Body fat %</label><input type="number" id="ob-bf" inputmode="decimal" data-f="bf" value="' + (a.bodyFatPct == null ? '' : a.bodyFatPct) + '" placeholder="e.g. 18"></div>' +
          '<div class="field"><label for="ob-bfs">Source</label><select id="ob-bfs" data-f="bfSrc">' + BF_SOURCES.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === a.bodyFatSource ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></div></div>' +
          '<div class="field" style="margin-top:10px"><label for="ob-wa">Waist (' + (m ? 'cm' : 'in') + ')</label><input type="number" id="ob-wa" inputmode="decimal" data-f="waist" value="' + (a.waistCm == null ? '' : core.round(m ? a.waistCm : core.cmToIn(a.waistCm), 0.1)) + '" placeholder="' + (m ? 'e.g. 88' : 'e.g. 34.5') + '"></div>' +
          '<p class="small muted">At your navel, relaxed, after breathing out. Tape level all the way round.</p></details>' +
        foot('Continue');
    }

    function minorNote(age) { return age != null && age < 18 ? '<div class="warnbox">Leanward is for adults 18 and over, so we can\'t set up calorie targets for you.</div>' : ''; }

    function vActivity() {
      var a = S.ob.a;
      return '<div class="ob"><h2>How active are you?</h2><p class="lede">Count your workouts here. Leanward doesn\'t add exercise calories on top, so nothing is counted twice.</p></div>' +
        '<div class="opts" role="radiogroup">' + C.energy.ACTIVITY.map(function (x) {
          return '<button type="button" class="opt" role="radio" aria-checked="' + (a.activity === x.id) + '" data-a="obset" data-k="activity" data-v="' + x.id + '"><b>' + x.label + '</b><span>' + esc(x.description) + '</span></button>';
        }).join('') + '</div>' +
        '<div class="field"><span class="lab">Training sessions per week</span>' + seg('training', [0, 1, 2, 3, 4, 5, 6].map(function (v) { return [v, v === 6 ? '6+' : String(v)]; }), a.trainingPerWeek) + '</div>' +
        foot('Continue');
    }

    function vGoal() {
      var a = S.ob.a, opts = M.goalOptions(calcProfile(a), energy(a)), b = core.bmi(a.kg, a.cm);
      var blocked = opts.filter(function (g) { return !g.available; })[0];
      return '<div class="ob"><h2>' + (S.ob.mode === 'new' ? 'What\'s next?' : 'What\'s your goal?') + '</h2><p class="lede">You can change it any time. Your history is kept.</p></div>' +
        '<div class="opts" role="radiogroup">' + opts.map(function (g) {
          return '<button type="button" class="opt" role="radio" aria-checked="' + (a.goal === g.id) + '" data-a="obgoal" data-v="' + g.id + '"' + (g.available ? '' : ' disabled') + '><b>' + g.label + '</b><span>' + esc(g.desc) + '</span></button>';
        }).join('') + '</div>' +
        (blocked ? '<div class="note">' + esc(blocked.message || ('Your BMI is ' + fmt(b, 1) + '.')) + '</div>' : '') +
        foot('Continue');
    }

    function vPhase() {
      var a = S.ob.a, g = M.goalById(a.goal), opts = phaseOpts(a), ty = a.phase, ph = ty ? C.targets.PHASES[ty] : null, m = a.units === 'metric';
      var out = '<div class="ob"><h2>Your phase</h2><p class="lede">For "' + g.label + '" we suggest <b>' + PHASE_NAME[g.phase] + '</b>. You can pick another.</p></div>' +
        '<div class="seg rows">' + PHASE_ORDER.map(function (k) { return '<button type="button" data-a="obtype" data-v="' + k + '" aria-pressed="' + (ty === k) + '"' + (opts[k].available ? '' : ' disabled') + '>' + PHASE_LABEL[k] + '</button>'; }).join('') + '</div>';
      if (ph && ph.rates.length) {
        out += '<div class="field"><span class="lab">' + (ty === 'recomp' ? 'How far below maintenance' : 'How fast') + ' (' + ph.rateUnit + ')</span><div class="opts">' + ph.rates.map(function (r) {
          var pv = M.preview(calcProfile(a), { phase: ty, rate: r }, today()), cal = pv.plan.calories;
          var desc = ty === 'recomp' ? (r ? '≈ ' + weekly(cal.expectedWeeklyKg, a.units) + ' · ' + fmt(cal.kcal) + ' kcal/day' : 'Weight stays about flat · ' + fmt(cal.kcal) + ' kcal/day')
            : '≈ ' + weekly(cal.expectedWeeklyKg, a.units) + ' · ' + fmt(cal.kcal) + ' kcal/day' + (cal.limitedBy.indexOf('floor') >= 0 ? ' · held at your safety floor' : cal.limitedBy.indexOf('deficit-cap') >= 0 ? ' · capped at 25% below maintenance' : cal.limitedBy.indexOf('surplus-cap') >= 0 ? ' · capped at 15% above maintenance' : '');
          return '<button type="button" class="opt" role="radio" aria-checked="' + (a.rate === r) + '" data-a="obrate" data-v="' + r + '"><b>' + (ty === 'recomp' ? (r ? '−' + r + '%' : 'Maintenance') : r + '%') + (r === ph.defaultRate ? ' · suggested' : '') + '</b><span>' + desc + '</span></button>';
        }).join('') + '</div></div>' +
        (ty !== 'recomp' ? '<p class="small muted">Faster rates aren\'t offered. Losing more than 1% or gaining more than 0.5% of body weight a week tends to cost muscle or add fat.</p>' : '');
      } else if (ty) {
        out += '<div class="note">' + (ty === 'nutrition' ? 'No weight-change target. Leanward focuses on fiber, vitamins and minerals.' : 'Calories stay at maintenance, shown as a ±100 kcal band.') + '</div>';
      }
      if (!m) { /* weekly changes above are already in lb */ }
      return out + foot('See my targets');
    }

    function summary(pv) {
      var f = pv.final, c = pv.plan;
      return '<div class="targets"><div><b>' + fmt(f.kcal) + '</b><span>kcal</span></div><div><b>' + f.proteinG + '</b><span>protein g</span></div><div><b>' + f.carbsG + '</b><span>carbs g</span></div><div><b>' + f.fatG + '</b><span>fat g</span></div></div>' +
        '<p class="small muted">Fiber ' + f.fiberG + ' g' + (pv.origin === 'manual' ? ' · Changed by you. Calculated: ' + fmt(c.calories.kcal) + ' kcal · P ' + c.macros.proteinG + ' · C ' + c.macros.carbsG + ' · F ' + c.macros.fatG : '') + '</p>' +
        pv.warnings.map(function (w) { return '<div class="warnbox">' + esc(w.message) + '</div>'; }).join('');
    }
    function obPreview() { var a = S.ob.a; return M.preview(calcProfile(a), { phase: a.phase, rate: a.rate == null ? undefined : a.rate }, today(), S.ob.manual); }

    function vTargets() {
      var a = S.ob.a, pv = obPreview(), mm = S.ob.manual, trusted = a.bodyFatPct != null && a.bodyFatSource && a.bodyFatSource !== 'guess';
      return '<div class="ob"><h2>Your daily targets</h2><p class="lede">Here\'s the working. Everything is an estimate; change any number below.</p></div>' +
        '<div class="card">' + maintLine(pv.plan.tdee, pv.plan.energySource, pv.plan.formulaTdee, pv.final.kcal, a.phase) + '</div>' +
        '<div id="ob-sum" class="card">' + summary(pv) + '</div>' +
        knownBlock(a, pv.plan) +
        '<p class="small muted">These are estimates. Formulas are within about 10% for most people but can be further off for some. After 2–3 weeks of logging and weighing in, check your weight trend: if it isn\'t moving as planned, adjust your targets or enter your real maintenance.</p>' +
        (trusted ? '<label class="check card"><input type="checkbox" data-f="useKatch"' + (a.useBodyFat ? ' checked' : '') + '> Use my body fat (' + a.bodyFatPct + '%) for BMR</label>' : '') +
        '<div class="card" style="display:grid;gap:10px"><b>Change your targets</b>' +
          '<div class="grid3"><div class="field"><label for="ob-k">Calories</label><input type="number" id="ob-k" inputmode="numeric" data-m="kcal" value="' + (mm.kcal != null ? mm.kcal : pv.plan.calories.kcal) + '"></div>' +
          '<div class="field"><label for="ob-p">Protein g</label><input type="number" id="ob-p" inputmode="numeric" data-m="proteinG" value="' + (mm.proteinG != null ? mm.proteinG : pv.plan.macros.proteinG) + '"></div>' +
          '<div class="field"><label for="ob-f">Fat g</label><input type="number" id="ob-f" inputmode="numeric" data-m="fatG" value="' + (mm.fatG != null ? mm.fatG : pv.plan.macros.fatG) + '"></div></div>' +
          '<span class="small muted">Carbs fill the rest. ' + (pv.origin === 'manual' ? '<button type="button" class="link" data-a="obtreset">Use the calculated numbers</button>' : '') + '</span></div>' +
        '<span class="sec">How these are worked out</span>' +
        '<div class="card working">' + pv.plan.steps.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>' +
        foot(S.ob.mode === 'new' ? 'Start this phase' : 'Looks good');
    }

    function vPrefs() {
      var a = S.ob.a;
      return '<div class="ob"><h2>Any food preferences?</h2><p class="lede">Optional. Saved for filtering later; Leanward doesn\'t give diet plans.</p></div>' +
        '<div class="chips2">' + PREFS.map(function (p) { return '<button type="button" data-a="obpref" data-v="' + p + '" aria-pressed="' + (a.foodPrefs.indexOf(p) >= 0) + '">' + p + '</button>'; }).join('') + '</div>' +
        foot('Continue', !a.foodPrefs.length);
    }

    function vInstall() {
      return '<div class="ob"><h2>Add Leanward to your Home Screen</h2><p class="lede">Your diary is saved on your iPhone and backed up to your account. iOS keeps a home-screen app\'s data, but can clear a Safari tab\'s.</p></div>' +
        '<div class="card" style="display:grid;gap:10px;font-size:14px"><div>1. In Safari, tap <b>Share</b> (the square with an arrow).</div><div>2. Tap <b>Add to Home Screen</b>.</div><div>3. Always open Leanward from the icon.</div></div>' +
        foot(S.ob.saving ? 'Saving…' : 'Open Leanward');
    }

    function onboardingView() {
      var n = stepName();
      var body = n === 'about' ? vAbout() : n === 'activity' ? vActivity() : n === 'goal' ? vGoal() : n === 'phase' ? vPhase() : n === 'targets' ? vTargets() : n === 'prefs' ? vPrefs() : vInstall();
      return '<main class="view">' + dots() + body + '</main>';
    }

    /* ---------- onboarding input and actions ---------- */
    function num(v) { var x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; }
    function onInput(el) {
      if (!S.ob) return onSheetInput(el);
      var a = S.ob.a, f = el.dataset.f, mk = el.dataset.m, v = el.type === 'checkbox' ? el.checked : el.value;
      if (knownInput(a, el)) { S.ob.manual = {}; if (f === 'knownSrc' || el.dataset.redrawNow) ctx.render(); return; }
      if (mk) {
        var n = num(v);
        if (n == null) delete S.ob.manual[mk]; else S.ob.manual[mk] = n;
        var box = root.document.getElementById('ob-sum');
        if (box) box.innerHTML = summary(obPreview());
        return;
      }
      if (f === 'dob') a.dob = v;
      if (f === 'cm') a.cm = num(v);
      if (f === 'kg') a.kg = num(v);
      if (f === 'ft' || f === 'inch') { a[f] = v; var ft = num(a.ft), inch = num(a.inch) || 0; a.cm = ft ? core.ftInToCm(ft, inch) : null; }
      if (f === 'lb') { a.lb = v; var lb = num(v); a.kg = lb ? core.lbToKg(lb) : null; }
      if (f === 'preg') a.pregnantOrBreastfeeding = v;
      if (f === 'bf') a.bodyFatPct = num(v);
      if (f === 'bfSrc') a.bodyFatSource = v;
      if (f === 'waist') { var w = num(v); a.waistCm = w == null ? null : (a.units === 'metric' ? w : core.inToCm(w)); }
      if (f === 'useKatch') { a.useBodyFat = v; S.ob.manual = {}; ctx.render(); }
      // Never redraw while the date picker is open: on iPhone, redrawing closes it mid-scroll.
      if (f === 'dob') { var box = root.document.getElementById('ob-minor'); if (box) box.innerHTML = minorNote(ageOf(a)); }
      if (f === 'preg') ctx.render();
    }

    function save() {
      var a = S.ob.a;
      S.ob.saving = true; ctx.render();
      var res = S.ob.mode === 'new'
        ? M.startPhase({ now: new Date().toISOString(), today: today(), profile: calcProfile(a), currentPhase: M.currentPhase(S.rows.phases), currentGoal: currentGoal(), goal: a.goal, phase: a.phase, rate: a.rate == null ? undefined : a.rate, manual: S.ob.manual })
        : M.setup(Object.assign({}, a, { rate: a.rate == null ? undefined : a.rate, manual: S.ob.manual }), today(), new Date().toISOString());
      return ctx.save(res.rows).then(function () {
        var newPhase = S.ob.mode === 'new';
        S.ob = null;
        S.tab = newPhase ? 'phase' : 'home';
        ctx.toast(newPhase ? 'New phase started' : 'You\'re all set');
        ctx.render();
      }, function (e) { S.ob.saving = false; S.ob.err = 'Couldn\'t save on this phone: ' + (e && e.message); ctx.render(); });
    }

    var actions = {
      obnext: function () {
        if (S.ob.saving) return;
        S.ob.err = validate();
        if (S.ob.err) { ctx.render(); return; }
        var n = stepName(), last = S.ob.step === steps().length - 1;
        if (n === 'goal' && !S.ob.a.phase) { var g = M.goalById(S.ob.a.goal); if (phaseOpts(S.ob.a)[g.phase].available) { S.ob.a.phase = g.phase; S.ob.a.rate = C.targets.PHASES[g.phase].defaultRate; } }
        if (last) { save(); return; }
        S.ob.step++; ctx.render(); root.scrollTo(0, 0);
      },
      obback: function () {
        if (S.ob.step === 0 && S.ob.mode === 'new') { S.ob = null; ctx.render(); return; }
        S.ob.err = ''; S.ob.step = Math.max(0, S.ob.step - 1); ctx.render();
      },
      obset: function (v, el) {
        var a = S.ob.a, k = el.dataset.k;
        if (k === 'units') {
          if (a.units === v) return;
          a.units = v;
          if (a.cm) { var f = core.cmToFtIn(a.cm); a.ft = String(f.ft); a.inch = String(f.in); }
          if (a.kg) a.lb = String(core.round(core.kgToLb(a.kg), 0.1));
        }
        if (k === 'sex') { a.sex = v; if (v === 'male') a.pregnantOrBreastfeeding = false; }
        if (k === 'activity') a.activity = v;
        if (k === 'training') a.trainingPerWeek = Number(v);
        S.ob.err = ''; ctx.render();
      },
      obgoal: function (v) {
        var a = S.ob.a;
        if (a.goal !== v) { a.goal = v; a.phase = null; a.rate = null; S.ob.manual = {}; }
        S.ob.err = ''; ctx.render();
      },
      obtype: function (v) { var a = S.ob.a; a.phase = v; a.rate = C.targets.PHASES[v].defaultRate; S.ob.manual = {}; S.ob.err = ''; ctx.render(); },
      obrate: function (v) { S.ob.a.rate = Number(v); S.ob.manual = {}; ctx.render(); },
      obpref: function (v) { var l = S.ob.a.foodPrefs, i = l.indexOf(v); if (i >= 0) l.splice(i, 1); else l.push(v); ctx.render(); },
      obtreset: function () { S.ob.manual = {}; ctx.render(); },
      knownmode: function (v) { var o = S.ob ? S.ob.a : S.sheet; o.knownMode = v; o.knownErr = ''; if (S.ob) S.ob.manual = {}; ctx.render(); },
      editmaint: function () { S.sheet = Object.assign({ kind: 'maint' }, knownFromProfile(S.rows.profile)); ctx.render(); },
      savemaint: function () { saveMaint(); },
      newphase: function () { startNewPhase(); ctx.render(); root.scrollTo(0, 0); },
      edittargets: function () { var t = currentTargets(); S.sheet = { kind: 'targets', when: '0', kcal: t.kcal, proteinG: t.protein_g, fatG: t.fat_g }; ctx.render(); },
      etwhen: function (v) { S.sheet.when = v; ctx.render(); },
      savetargets: function () { saveTargets(false); },
      resettargets: function () { saveTargets(true); },
      units: function (v) {
        var p = S.rows.profile;
        if (!p || p.units === v) return;
        ctx.save([['lw_profiles', { id: 'me', units: v }]]).then(ctx.render);
      }
    };

    /* ---------- the current phase ---------- */
    function currentGoal() {
      var ph = M.currentPhase(S.rows.phases);
      var g = (S.rows.goals || []).filter(function (x) { return ph && x.id === ph.goal_id; })[0];
      return g || (S.rows.goals || []).filter(function (x) { return !x.ended_on; }).sort(function (x, y) { return x.started_on < y.started_on ? 1 : -1; })[0] || null;
    }
    function currentTargets() {
      var ph = M.currentPhase(S.rows.phases);
      if (!ph) return null;
      return M.targetsOn(S.rows.sets, ph.id, today()) ||
        (S.rows.sets || []).filter(function (s) { return s.phase_id === ph.id && !s.deleted; }).sort(function (x, y) { return x.effective_from < y.effective_from ? -1 : 1; })[0] || null;
    }
    function profileNow() { return M.profileFromRows(S.rows.profile, S.rows.weights); }
    function hasSetup() { return !!(S.rows.profile && M.currentPhase(S.rows.phases) && currentTargets()); }

    function targetRow(t) {
      return '<div class="targets"><div><b>' + fmt(t.kcal) + '</b><span>kcal</span></div><div><b>' + t.protein_g + '</b><span>protein g</span></div><div><b>' + t.carbs_g + '</b><span>carbs g</span></div><div><b>' + t.fat_g + '</b><span>fat g</span></div></div>';
    }

    function progressCard(ph, t) {
      var weights = (S.rows.weights || []).filter(function (w) { return !w.deleted; }).map(function (w) { return { date: w.date, kg: Number(w.kg), at: w.measured_at }; });
      var waist = (S.rows.waist || []).map(function (w) { return { date: w.date, cm: Number(w.cm) }; });
      var r;
      try {
        r = C.progress.read({ phase: { type: ph.type, startDate: ph.start_date, expectedWeeklyPct: t && t.calc_inputs ? t.calc_inputs.expectedWeeklyPct : null }, today: today(), weights: weights, waist: waist, lifts: {} }, { units: (S.rows.profile && S.rows.profile.units) || 'us' });
      } catch (e) { return ''; }
      return '<section class="card"><h2>Is it working?</h2><p class="small">' + esc(r.summary) + '</p>' +
        r.signals.map(function (s) {
          var p = SIGNAL[s.status] || SIGNAL.collecting;
          return '<div class="sig"><div class="row"><b style="font-size:13.5px">' + esc(s.label) + '</b><span class="pill ' + p[0] + '">' + p[1] + '</span></div><span style="font-size:13px">' + esc(s.value) + '</span><p>' + esc(s.rule) + '</p></div>';
        }).join('') +
        '<p class="small muted">A read needs at least 14 days of the phase and 8 weigh-ins (2 for waist). Log them on the Progress tab.</p></section>';
    }

    function phaseView() {
      var ph = M.currentPhase(S.rows.phases), t = currentTargets(), g = currentGoal();
      if (!ph || !t) return '';
      var d = M.dayOf(ph, today()), pos = d.total ? Math.min(100, d.day / d.total * 100) : 100;
      var sets = (S.rows.sets || []).filter(function (s) { return s.phase_id === ph.id && !s.deleted; }).sort(function (x, y) { return x.effective_from < y.effective_from ? 1 : -1; });
      var past = (S.rows.phases || []).filter(function (p) { return p.end_date && !p.deleted; }).sort(function (x, y) { return x.start_date < y.start_date ? 1 : -1; });
      var steps = (t.calc_inputs && t.calc_inputs.steps) || [];
      return '<header class="top row"><h1>Phase</h1><button type="button" class="btn ghost sm" data-a="newphase">Start a new phase</button></header>' +
        '<section class="card"><span class="small muted">Goal: ' + (g ? esc(M.goalById(g.type).label) : '—') + '</span>' +
          '<div style="font-size:22px;font-weight:700;margin-top:2px">' + PHASE_NAME[ph.type] + '</div>' +
          '<span class="small muted">' + d.label + (C.targets.PHASES[ph.type].rates.length ? ' · ' + rateLabel(ph.type, Number(ph.rate)) : '') + '</span>' +
          '<div class="route"><i style="width:' + pos + '%"></i></div>' +
          '<div class="row small muted"><span>Started ' + ph.start_date + '</span><span>' + (ph.planned_end ? 'Planned end ~' + ph.planned_end : 'Open-ended') + '</span></div></section>' +
        progressCard(ph, t) +
        '<section class="card"><div class="row"><h2 style="margin:0">Targets</h2><button type="button" class="btn sm" data-a="edittargets">Edit targets</button></div>' +
          '<div style="margin-top:10px">' + targetRow(t) + '</div>' +
          (t.calc_inputs && t.calc_inputs.tdee ? '<div style="margin-top:10px">' + maintLine(t.calc_inputs.tdee, t.calc_inputs.energySource || 'formula', t.calc_inputs.formulaTdee, t.kcal, ph.type) + '</div>' : '') +
          '<button type="button" class="link" data-a="editmaint" style="margin-top:6px">Know your real maintenance or BMR?</button>' +
          '<p class="small muted">Fiber ' + t.fiber_g + ' g · ' + (t.origin === 'manual' ? 'set by you' : 'calculated') + ' from ' + t.effective_from + '</p>' +
          '<details><summary>How these are worked out</summary><div class="working">' + steps.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') +
            (t.origin === 'manual' && t.calc_inputs && t.calc_inputs.calculated ? '<div>Changed by you. Calculated: ' + fmt(t.calc_inputs.calculated.kcal) + ' kcal · P ' + t.calc_inputs.calculated.proteinG + ' · C ' + t.calc_inputs.calculated.carbsG + ' · F ' + t.calc_inputs.calculated.fatG + '</div>' : '') +
            '</div><p class="small muted">All estimates. From Phase 2, Leanward checks maintenance against your real intake and weight trend and suggests changes. Targets never change without your OK.</p></details>' +
          (sets.length > 1 ? '<details style="margin-top:8px"><summary>Target history (' + sets.length + ' versions)</summary><div class="list">' + sets.map(function (s) {
            return '<div class="item"><span><span class="t">' + fmt(s.kcal) + ' kcal · P ' + s.protein_g + ' · C ' + s.carbs_g + ' · F ' + s.fat_g + '</span><span class="s">From ' + s.effective_from + ' · ' + (s.origin === 'manual' ? 'set by you' : 'calculated') + '</span></span></div>';
          }).join('') + '</div></details>' : '') + '</section>' +
        '<section class="card"><h2>Phase history</h2><div class="list">' +
          '<div class="item"><span><span class="t">' + PHASE_NAME[ph.type] + ' · current</span><span class="s">Since ' + ph.start_date + '</span></span><span class="small">Day ' + d.day + '</span></div>' +
          past.map(function (p) { return '<div class="item"><span><span class="t">' + PHASE_NAME[p.type] + '</span><span class="s">' + p.start_date + ' – ' + p.end_date + '</span></span></div>'; }).join('') +
        '</div></section>';
    }

    function homeCard() {
      var ph = M.currentPhase(S.rows.phases), t = currentTargets();
      if (!ph || !t) return '';
      return '<section class="card"><div class="row"><h2 style="margin:0">Today\'s targets</h2><span class="small muted">' + PHASE_NAME[ph.type] + ' · ' + M.dayOf(ph, today()).label.toLowerCase() + '</span></div>' +
        '<div style="margin-top:10px">' + targetRow(t) + '</div><p class="small muted">Fiber ' + t.fiber_g + ' g. Logging food arrives in M5; until then this shows what you\'ll aim for.</p></section>';
    }

    function profileCard() {
      var p = S.rows.profile;
      if (!p) return '';
      var cp = profileNow(), age = cp.dob ? core.ageOn(cp.dob, today()) : null;
      return '<section class="card"><h2>Your details</h2><p class="small muted">' + [age != null ? age + ' years' : null, cp.cm ? ht(cp.cm, p.units) : null, cp.kg ? wt(cp.kg, p.units) : null, activityLabel(p.activity)].filter(Boolean).join(' · ') + '</p>' +
        '<div class="row" style="margin-top:8px"><span class="small">Units</span><div class="seg" style="width:170px">' + [['us', 'US'], ['metric', 'Metric']].map(function (u) { return '<button type="button" data-a="units" data-v="' + u[0] + '" aria-pressed="' + (p.units === u[0]) + '">' + u[1] + '</button>'; }).join('') + '</div></div>' +
        '<p class="small muted">Editing these details arrives in M7. To change your goal or phase, use Phase → Start a new phase.</p></section>';
    }
    function activityLabel(id) { try { return C.energy.activityById(id).label.toLowerCase(); } catch (e) { return null; } }

    /* ---------- edit targets sheet (PHS-5) ---------- */
    function sheetPreview() {
      var ph = M.currentPhase(S.rows.phases), sh = S.sheet;
      return M.preview(profileNow(), { phase: ph.type, rate: ph.rate == null ? undefined : Number(ph.rate) }, today(), { kcal: sh.kcal, proteinG: sh.proteinG, fatG: sh.fatG });
    }
    function sheetOut(pv) {
      return '<div class="row"><span class="small muted">Carbs (the rest)</span><b>' + pv.final.carbsG + ' g</b></div><div class="row"><span class="small muted">Fiber</span><b>' + pv.final.fiberG + ' g</b></div>' +
        pv.warnings.map(function (w) { return '<div class="warnbox" style="margin-top:8px">' + esc(w.message) + '</div>'; }).join('');
    }
    function maintSheetPlan() {
      var ph = M.currentPhase(S.rows.phases);
      var prof = M.profileOf(knownApplied(Object.assign({}, profileNowRaw(), S.sheet)));
      return M.preview(prof, { phase: ph.type, rate: ph.rate == null ? undefined : Number(ph.rate) }, today(), null);
    }
    function maintSheet() {
      var sh = S.sheet, pv = maintSheetPlan(), ph = M.currentPhase(S.rows.phases);
      return '<div class="scrim" data-a="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mt-h"><div class="grab"></div><h2 id="mt-h">Your maintenance</h2>' +
        '<div class="card">' + maintLine(pv.plan.tdee, pv.plan.energySource, pv.plan.formulaTdee, pv.final.kcal, ph.type) + '</div>' +
        knownBlock(sh, pv.plan) +
        '<div class="card"><b>New targets from today</b><div style="margin-top:8px">' + targetRow({ kcal: pv.final.kcal, protein_g: pv.final.proteinG, carbs_g: pv.final.carbsG, fat_g: pv.final.fatG }) + '</div>' +
        '<p class="small muted">Recalculated for your current phase. Past days keep their targets.</p></div>' +
        '<button type="button" class="btn block" data-a="savemaint">Save</button><button type="button" class="btn ghost block" data-a="close">Cancel</button></div>';
    }
    function saveMaint() {
      var sh = S.sheet;
      if (sh.knownMode !== 'none' && (sh.knownMode === 'bmr' ? sh.knownBmr : sh.knownTdee) == null) { ctx.toast('Enter the number, or choose "Use the estimate"'); return; }
      var prof = M.profileOf(knownApplied(Object.assign({}, profileNowRaw(), sh)));
      var r = M.editTargets({ now: new Date().toISOString(), phase: M.currentPhase(S.rows.phases), profile: prof, from: today(), manual: null });
      ctx.save([['lw_profiles', Object.assign({ id: 'me' }, M.knownColumns(prof))]].concat(r.rows)).then(function () { S.sheet = false; ctx.toast('Maintenance updated'); ctx.render(); });
    }
    /** The saved profile as onboarding-style answers (for recalculating with changed known numbers). */
    function profileNowRaw() { var p = profileNow(); return Object.assign({}, p, { bodyFatSource: S.rows.profile.body_fat_source }); }

    function sheetView() {
      var sh = S.sheet;
      if (sh && sh.kind === 'maint') return maintSheet();
      if (!sh || sh.kind !== 'targets') return '';
      var pv = sheetPreview();
      return '<div class="scrim" data-a="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="et-h"><div class="grab"></div><h2 id="et-h">Edit targets</h2>' +
        '<p class="small muted">Your change starts a new version of your targets. Past days keep the targets they had.</p>' +
        '<div class="grid3"><div class="field"><label for="et-k">Calories</label><input type="number" id="et-k" inputmode="numeric" data-e="kcal" value="' + sh.kcal + '"></div>' +
        '<div class="field"><label for="et-p">Protein g</label><input type="number" id="et-p" inputmode="numeric" data-e="proteinG" value="' + sh.proteinG + '"></div>' +
        '<div class="field"><label for="et-f">Fat g</label><input type="number" id="et-f" inputmode="numeric" data-e="fatG" value="' + sh.fatG + '"></div></div>' +
        '<div class="card" id="et-out">' + sheetOut(pv) + '</div>' +
        '<div class="field"><span class="lab">Starts</span><div class="seg">' + [['0', 'Today'], ['1', 'Tomorrow']].map(function (w) { return '<button type="button" data-a="etwhen" data-v="' + w[0] + '" aria-pressed="' + (sh.when === w[0]) + '">' + w[1] + '</button>'; }).join('') + '</div></div>' +
        '<button type="button" class="btn block" data-a="savetargets">Save new targets</button>' +
        '<button type="button" class="btn ghost block" data-a="resettargets">Go back to calculated (' + fmt(pv.plan.calories.kcal) + ' kcal)</button></div>';
    }
    function onSheetInput(el) {
      if (S.sheet && S.sheet.kind === 'maint') { if (knownInput(S.sheet, el) && el.dataset.f === 'knownSrc') ctx.render(); return; }
      var k = el.dataset.e;
      if (!k || !S.sheet) return;
      var n = num(el.value);
      S.sheet[k] = n == null ? null : n;
      var box = root.document.getElementById('et-out');
      if (box && S.sheet.kcal != null && S.sheet.proteinG != null && S.sheet.fatG != null) box.innerHTML = sheetOut(sheetPreview());
    }
    function saveTargets(reset) {
      var sh = S.sheet, ph = M.currentPhase(S.rows.phases);
      if (!reset && (sh.kcal == null || sh.proteinG == null || sh.fatG == null)) { ctx.toast('Fill in calories, protein and fat'); return; }
      var from = core.addDays(today(), sh.when === '1' ? 1 : 0);
      var r = M.editTargets({ now: new Date().toISOString(), phase: ph, profile: profileNow(), from: from, manual: reset ? null : { kcal: sh.kcal, proteinG: sh.proteinG, fatG: sh.fatG } });
      ctx.save(r.rows).then(function () { S.sheet = false; ctx.toast(reset ? 'Back to the calculated targets' : 'New targets saved'); ctx.render(); });
    }

    return {
      startOnboarding: startOnboarding, onboardingView: onboardingView, onInput: onInput, actions: actions,
      hasSetup: hasSetup, phaseView: phaseView, homeCard: homeCard, profileCard: profileCard, sheetView: sheetView
    };
  }

  root.LW.screens = { create: create };
})(this);
