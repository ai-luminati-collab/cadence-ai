const _die = e => { console.log('ERR', e.message, e.detail || '', 'pos', e.position || '', e.where || ''); process.exit(1) }
process.on('uncaughtException', _die); process.on('unhandledRejection', _die)
// Validates the slice-1 migration on a real Postgres (PGlite) with a stubbed
// Supabase auth schema, acting as different users through RLS.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const migration = readFileSync(process.argv[2] || new URL('../migrations/20261123_slice1_foundation.sql', import.meta.url), 'utf8')
const db = new PGlite()
let pass = 0, fail = 0
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`) }

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
`)

const U = {
  admin:    ['11111111-1111-1111-1111-111111111111', 'admin@test.dev'],
  marketer: ['22222222-2222-2222-2222-222222222222', 'marketer@test.dev'],
  reader:   ['33333333-3333-3333-3333-333333333333', 'reader@test.dev'],
  stranger: ['44444444-4444-4444-4444-444444444444', 'stranger@test.dev'],
}
for (const [id, email] of Object.values(U)) await db.query('insert into auth.users values ($1, $2)', [id, email])

await db.exec(migration)
// Run the migration twice: it must be safe to re-run.
await db.exec(migration)
ok(true, 'migration applies cleanly, twice')

async function as(who, fn) {
  const [id, email] = U[who]
  await db.exec(`set role authenticated`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
    [id, JSON.stringify({ sub: id, email })])
  try { return await fn() } finally { await db.exec('reset role') }
}
async function fails(fn) { try { await fn(); return false } catch { return true } }

// 1. Admin bootstraps a workspace, a brand and its state.
const ws = await as('admin', async () => (await db.query(`select public.create_workspace('Acme') as id`)).rows[0].id)
ok(!!ws, 'admin creates a workspace')
await as('admin', () => db.query(`insert into brands (id, workspace_id, name, created_by) values ('brand_1', $1, 'Cafe', $2)`, [ws, U.admin[0]]))
await as('admin', () => db.query(`insert into brand_documents (brand_id, data, updated_by) values ('brand_1', '{"a":1}', $1)`, [U.admin[0]]))
ok((await as('admin', () => db.query(`select * from brands`))).rows.length === 1, 'admin sees own brand')
ok(!(await fails(() => as('admin', () => db.query(
  `insert into change_log (workspace_id, brand_id, actor_user_id, entity_type, entity_id, action) values ($1,'brand_1',$2,'brand','brand_1','create')`,
  [ws, U.admin[0]])))), 'admin writes a change-log entry as self')
ok(await fails(() => as('admin', () => db.query(
  `insert into change_log (workspace_id, brand_id, actor_user_id, entity_type, entity_id, action) values ($1,'brand_1',$2,'brand','brand_1','create')`,
  [ws, U.marketer[0]]))), 'nobody can log a change as someone else')

// 2. A stranger sees and changes nothing.
ok((await as('stranger', () => db.query(`select * from brands`))).rows.length === 0, 'stranger cannot see the brand')
ok((await as('stranger', () => db.query(`select * from brand_documents`))).rows.length === 0, 'stranger cannot see brand state')
ok(await fails(() => as('stranger', () => db.query(`insert into brands (id, workspace_id) values ('evil', $1)`, [ws]))), 'stranger cannot add a brand to the workspace')
ok((await as('stranger', () => db.query(`update brand_documents set data = '{"hacked":true}'`))).affectedRows === 0, 'stranger cannot overwrite brand state')

// 3. Invites: marketer (no brain switch) and read-only.
await as('admin', () => db.query(`insert into workspace_invites (workspace_id, email, role, invited_by) values ($1, 'marketer@test.dev', 'marketer', $2), ($1, 'READER@test.dev', 'read_only', $2)`, [ws, U.admin[0]]))
ok((await as('marketer', () => db.query(`select public.accept_my_invites() n`))).rows[0].n === 1, 'marketer accepts invite')
ok((await as('reader', () => db.query(`select public.accept_my_invites() n`))).rows[0].n === 1, 'reader accepts invite (email case-insensitive)')
ok((await as('stranger', () => db.query(`select public.accept_my_invites() n`))).rows[0].n === 0, 'stranger has no invites')
ok(await fails(() => as('marketer', () => db.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'admin')`, [ws, U.stranger[0]]))), 'marketer cannot add members')
ok(await fails(() => as('marketer', () => db.query(`update workspace_members set role = 'admin' where user_id = $1 returning 1`, [U.marketer[0]]).then(r => { if (!r.rows.length) throw new Error('no rows') }))), 'marketer cannot promote self to admin')

// 4. Marketer edits state; reader only reads.
ok((await as('marketer', () => db.query(`update brand_documents set data = '{"a":2}', version = version + 1 where brand_id = 'brand_1'`))).affectedRows === 1, 'marketer edits brand state')
ok((await as('reader', () => db.query(`select data from brand_documents`))).rows[0]?.data?.a === 2, 'reader reads brand state')
ok((await as('reader', () => db.query(`update brand_documents set data = '{}'`))).affectedRows === 0, 'reader cannot edit brand state')
ok(await fails(() => as('reader', () => db.query(`insert into change_log (workspace_id, actor_user_id, entity_type, entity_id, action) values ($1,$2,'x','x','update')`, [ws, U.reader[0]]))), 'reader cannot write the change log')

// 5. Brain permissions.
ok(await fails(() => as('marketer', () => db.query(`insert into beliefs (brand_id, kind, statement) values ('brand_1', 'lesson', 'x')`))), 'marketer without brain switch cannot write lessons')
ok(!(await fails(() => as('marketer', () => db.query(`insert into beliefs (brand_id, kind, statement, subject_user_id) values ('brand_1', 'user_preference', 'prefers short captions', $1)`, [U.marketer[0]])))), 'marketer can hold preferences about self')
ok(await fails(() => as('marketer', () => db.query(`insert into beliefs (brand_id, kind, statement, subject_user_id) values ('brand_1', 'user_preference', 'x', $1)`, [U.reader[0]]))), 'marketer cannot write preferences about others')
await as('admin', () => db.query(`update workspace_members set can_edit_brain = true where user_id = $1`, [U.marketer[0]]))
ok(!(await fails(() => as('marketer', () => db.query(`insert into beliefs (brand_id, kind, statement) values ('brand_1', 'lesson', 'y')`)))), 'admin turns on brain switch → marketer writes lessons')
ok(await fails(() => as('reader', () => db.query(`insert into beliefs (brand_id, kind, statement) values ('brand_1', 'fact', 'z')`))), 'reader cannot write beliefs')

// 6. Reasons Graph: chained revision, cycles, links, cross-brand guard.
const ids = await as('admin', async () => {
  const ins = async (s) => (await db.query(`insert into beliefs (brand_id, kind, statement) values ('brand_1','fact',$1) returning id`, [s])).rows[0].id
  const fact = await ins('hero product is cold brew')
  const lesson = await ins('cold brew reels win on weekends')
  const plan = await ins('april plan leans on weekend reels')
  const idea = await ins('christmas idea builds on april results')
  const other = await ins('unrelated belief')
  await db.query(`insert into belief_dependencies values ($1,$2), ($3,$1), ($4,$3), ($2,$4)`, [lesson, fact, plan, idea]) // includes a cycle back to lesson? (fact depends on idea)
  await db.query(`insert into belief_links (brand_id, entity_type, entity_id, belief_id) values ('brand_1','post','post_9',$1)`, [idea])
  return { fact, lesson, plan, idea, other }
})
const n = await as('admin', () => db.query(`select public.mark_belief_dependents($1, 'hero product changed to matcha') n`, [ids.fact]))
const flagged = (await as('admin', () => db.query(`select statement from beliefs where needs_review order by statement`))).rows.map(r => r.statement)
ok(n.rows[0].n >= 3 && flagged.includes('cold brew reels win on weekends') && flagged.includes('april plan leans on weekend reels') && flagged.includes('christmas idea builds on april results'), `chain flagged through 3 hops (${flagged.length} beliefs), cycle terminates`)
ok(!flagged.includes('unrelated belief'), 'unrelated belief untouched')
ok((await as('admin', () => db.query(`select needs_review from belief_links where entity_id = 'post_9'`))).rows[0].needs_review === true, 'post resting on the chain is flagged')
ok((await as('reader', () => db.query(`select public.mark_belief_dependents($1, 'x') n`, [ids.fact]))).rows[0].n === 0, 'reader cannot trigger flags (RLS limits the update)')

const ws2 = await as('stranger', async () => (await db.query(`select public.create_workspace('Other') as id`)).rows[0].id)
await as('stranger', () => db.query(`insert into brands (id, workspace_id) values ('brand_2', $1)`, [ws2]))
const foreign = await as('stranger', async () => (await db.query(`insert into beliefs (brand_id, kind, statement) values ('brand_2','fact','theirs') returning id`)).rows[0].id)
ok(await fails(() => as('stranger', () => db.query(`insert into belief_dependencies values ($1, $2)`, [foreign, ids.fact]))), 'cannot link a belief to another workspace\'s belief')
ok((await as('admin', () => db.query(`select * from brands`))).rows.length === 1, 'workspaces stay isolated both ways')

// 7. Logged-out visitors get nothing.
await db.exec('set role anon')
ok(await fails(() => db.query('select * from brands')), 'logged-out visitor is refused')
await db.exec('reset role')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
