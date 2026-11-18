/* Leanward — app settings shared by every other file.
 *
 * The Supabase URL and publishable key are public by design: row level security means each
 * signed-in person can only reach their own rows (see supabase/schema.sql). This is Leanward's own
 * project, separate from PR Forge's (PRD §15 Q6b). Never put a secret key, service-role key or password here.
 */
(function (root) {
  'use strict';

  var config = {
    // Bump on every release, together with CACHE in sw.js (a test checks they match).
    VERSION: '0.24.0',
    SUPABASE_URL: 'https://anxpwqbakjqnglqgccfo.supabase.co',
    SUPABASE_KEY: 'sb_publishable_CyK9gSeHLeQEYC89YZKt6Q_kTo1sfqw',
    // PR Forge's Supabase project, for the optional read-only "Connect PR Forge" (js/prforge.js).
    // Its publishable key is public too (it is in PR Forge's own code); Leanward only ever reads with it.
    PRFORGE_URL: 'https://pvtcqdtqycihlontmirl.supabase.co',
    PRFORGE_KEY: 'sb_publishable_00yYlGDJceDwbjp_B25oLg_FOEW6ZwE',
    // Leanward has its own origin, but every key and cache it creates still starts with these
    // prefixes, so it never touches anything it didn't create.
    STORAGE_PREFIX: 'leanward:v1:',
    CACHE_PREFIX: 'leanward-',
    // S4: everything is free in the MVP. Features ask can('name') so premium can be switched on later
    // without hunting through the code; today every answer is yes.
    PREMIUM_FEATURES: [],
    can: function (feature) { return config.PREMIUM_FEATURES.indexOf(feature) < 0; }
  };

  if (typeof module === 'object' && module.exports) module.exports = config;
  else { root.LW = root.LW || {}; root.LW.config = config; }
})(this);
