-- One-off migration for databases created from the old schema files.
-- Run in Supabase → SQL Editor AFTER the app version that uses session-scoped
-- server actions is deployed (commit "Scope Brand OS data to the signed-in user").
--
-- The old "service role" policies had no TO clause, so they applied to every role:
-- anyone holding the public anon key could read and write all users' rows.
-- The service role key bypasses RLS anyway, so scoping them changes nothing for the cron.
-- Safe to run more than once. Changes policies only, never data.

DROP POLICY IF EXISTS "Service role write access for algorithm state" ON global_algorithm_state;
CREATE POLICY "Service role write access for algorithm state"
  ON global_algorithm_state FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access events" ON brand_os_events;
CREATE POLICY "Service role full access events" ON brand_os_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access snapshots" ON brand_os_snapshots;
CREATE POLICY "Service role full access snapshots" ON brand_os_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access metrics" ON convergence_metrics;
CREATE POLICY "Service role full access metrics" ON convergence_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);
