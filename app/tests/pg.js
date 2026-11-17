/* A throwaway PostgreSQL for tests, with a small stand-in for Supabase's auth (auth.users,
 * auth.uid() from request.jwt.claim.sub, the anon and authenticated roles).
 * Used by rls.test.js and food-search.test.js. Tests skip when PostgreSQL isn't installed.
 * Not a test file itself (no .test.js), so node --test doesn't run it on its own.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

function findBin() {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  try { fs.readdirSync('/usr/lib/postgresql').sort((a, b) => Number(b) - Number(a)).forEach((v) => dirs.push(`/usr/lib/postgresql/${v}/bin`)); } catch (e) { /* none */ }
  return dirs.find((d) => fs.existsSync(path.join(d, 'initdb')) && fs.existsSync(path.join(d, 'pg_ctl')));
}
const BIN = findBin();

const PRELUDE = (users) => `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Like Supabase: new tables, views, sequences and functions in public start with full access for the
-- API roles, so schema.sql must take away whatever it doesn't mean to give (found by the live check).
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
${users.length ? `insert into auth.users values ${users.map((u) => `('${u}')`).join(', ')};` : ''}
`;

/**
 * Starts a cluster, runs fn(db) and always stops and deletes it.
 * db.file(name, sql) writes a SQL file; db.run(name) runs it with ON_ERROR_STOP and returns { status, stdout, stderr }.
 */
function withPostgres(opts, fn) {
  const root = process.getuid && process.getuid() === 0;   // initdb refuses root: run as the postgres user
  const wrap = (cmd, args) => (root ? ['runuser', ['-u', 'postgres', '--', path.join(BIN, cmd)].concat(args)] : [path.join(BIN, cmd), args]);
  const exec = (cmd, args) => { const [c, a] = wrap(cmd, args); return execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-pg-'));
  const port = String(54000 + Math.floor(Math.random() * 900));
  const data = path.join(dir, 'data');
  if (root) execFileSync('chown', ['-R', 'postgres', dir]);
  let started = false;
  const db = {
    dir, port,
    file: (name, sql) => { fs.writeFileSync(path.join(dir, name), sql); if (root) execFileSync('chown', ['postgres', path.join(dir, name)]); },
    run: (name, cwd) => {
      const [c, a] = wrap('psql', ['-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-X', '-A', '-t', '-f', path.join(dir, name)]);
      return spawnSync(c, a, { encoding: 'utf8', cwd: cwd || dir });
    }
  };
  try {
    exec('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-sync', '--no-instructions']);
    exec('pg_ctl', ['-D', data, '-o', `-k ${dir} -c listen_addresses= -p ${port} -c fsync=off`, '-w', '-s', 'start', '-l', path.join(dir, 'log')]);
    started = true;
    db.file('prelude.sql', PRELUDE(opts.users || []));
    const p = db.run('prelude.sql');
    if (p.status !== 0) throw new Error(p.stderr);
    return fn(db);
  } finally {
    if (started) try { exec('pg_ctl', ['-D', data, '-w', '-s', '-m', 'immediate', 'stop']); } catch (e) { /* already stopped */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { BIN, withPostgres, SCHEMA: path.resolve(__dirname, '..', 'supabase', 'schema.sql') };
