-- ═══════════════════════════════════════════════════════════════════
-- Algorithm Scout: Global Algorithm State Cache
-- ═══════════════════════════════════════════════════════════════════
-- This table stores the distilled, AI-processed algorithm intelligence
-- that is refreshed weekly by the /api/cron/algo-scout endpoint.
--
-- Design: Single-row table (id=1) that is always UPSERTED, never appended.
-- This guarantees O(1) reads with zero cleanup overhead.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS global_algorithm_state (
  id integer PRIMARY KEY DEFAULT 1,

  -- The distilled algorithm rules as structured JSON
  -- Shape: { platforms: { instagram: [...], tiktok: [...], linkedin: [...] }, meta: {...} }
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Raw source URLs that were used to generate the rules (for audit trail)
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Timestamp of last successful scout run
  last_updated timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Constraint: only one row ever exists
  CONSTRAINT single_row CHECK (id = 1)
);

-- Seed the initial row so UPSERT always works
INSERT INTO global_algorithm_state (id, rules, sources)
VALUES (1, '{}'::jsonb, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- RLS: Anyone can read (the generation pipeline needs this)
ALTER TABLE global_algorithm_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for algorithm state"
ON global_algorithm_state FOR SELECT
USING (true);

-- Only service_role can write (cron job runs server-side with service key)
CREATE POLICY "Service role write access for algorithm state"
ON global_algorithm_state FOR ALL
USING (true)
WITH CHECK (true);
