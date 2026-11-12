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
    VERSION: '0.8.3',
    SUPABASE_URL: 'https://anxpwqbakjqnglqgccfo.supabase.co',
    SUPABASE_KEY: 'sb_publishable_CyK9gSeHLeQEYC89YZKt6Q_kTo1sfqw',
    // Leanward has its own origin, but every key and cache it creates still starts with these
    // prefixes, so it never touches anything it didn't create.
    STORAGE_PREFIX: 'leanward:v1:',
    CACHE_PREFIX: 'leanward-'
  };

  if (typeof module === 'object' && module.exports) module.exports = config;
  else { root.LW = root.LW || {}; root.LW.config = config; }
})(this);
