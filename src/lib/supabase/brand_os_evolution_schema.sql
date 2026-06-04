-- ═══════════════════════════════════════════════════════════════════
-- Brand OS Evolution Engine — Self-Learning Knowledge Base
-- ═══════════════════════════════════════════════════════════════════
--
-- Three tables power the adaptive learning system:
--   1. brand_os_events    — Every signal the AI detects (edits, rejections, drift)
--   2. brand_os_snapshots — Full Brand OS state at key moments (enables rollback)
--   3. convergence_metrics — Daily composite scores tracking how fast AI is stabilizing
--
-- Model Hierarchy:
--   Claude 4.7 Opus — Brand OS mutations, research synthesis, Blanc diagnostics
--   GPT 5.5 Thinking + Claude 4.6 Opus — Everything else
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. EVENT LOG ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brand_os_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id text NOT NULL,              -- Zustand brand ID
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Signal Classification
  event_type text NOT NULL CHECK (event_type IN (
    'content_edit',             -- User edited AI-generated content
    'generation_rejection',     -- User regenerated content (hit "try again")
    'strategy_edit',            -- User modified strategy fields directly
    'copilot_instruction',      -- Repeated copilot chat instructions
    'profile_change',           -- Brand profile modifications (audiences, products, etc.)
    'visual_drift',             -- Visual reference selection diverges from AI suggestions
    'tone_drift'                -- Statistical tone fingerprint shifted
  )),

  -- Which Brand OS category this affects
  category text NOT NULL CHECK (category IN (
    'tone', 'visual', 'audience', 'platform', 'product',
    'format', 'cta', 'narrative', 'general'
  )),

  -- Optional: which platform/format this is specific to (null = cross-platform)
  platform text,
  format text,

  -- Raw signal data (the edit diff, fingerprint delta, rejection count, etc.)
  signal_data jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The AI-proposed change to the Brand OS (human-readable rule)
  proposed_change text,

  -- Review status
  status text NOT NULL DEFAULT 'detected' CHECK (status IN (
    'detected',      -- Signal captured, no proposal yet
    'pending',       -- AI generated a proposal, waiting for user review
    'accepted',      -- User accepted → written to knowledge base
    'rejected',      -- User rejected → never suggest again
    'edited',        -- User modified the proposal then accepted
    'auto_applied',  -- High-confidence change applied automatically (Stabilized phase only)
    'expired'        -- Superseded by a newer event in same category
  )),

  -- AI confidence in this proposal (0.0 to 1.0)
  confidence float DEFAULT 0.0,

  -- Evidence trail: human-readable descriptions of what led to this
  evidence text[] DEFAULT '{}',

  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  resolved_at timestamptz,
  resolved_by text CHECK (resolved_by IN ('user', 'auto', 'blanc', NULL))
);

-- Indexes for fast queries
CREATE INDEX idx_bos_events_brand ON brand_os_events(brand_id);
CREATE INDEX idx_bos_events_status ON brand_os_events(brand_id, status);
CREATE INDEX idx_bos_events_created ON brand_os_events(created_at DESC);
CREATE INDEX idx_bos_events_category ON brand_os_events(brand_id, category);

-- ─── 2. SNAPSHOTS (Version History / Rollback) ─────────────────

CREATE TABLE IF NOT EXISTS brand_os_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Full Brand OS state at this point in time
  snapshot_data jsonb NOT NULL,

  -- What triggered this snapshot
  trigger text NOT NULL CHECK (trigger IN (
    'onboarding',       -- Initial Brand OS creation
    'manual_save',      -- User explicitly saved
    'rule_batch',       -- Batch of rules accepted
    'daily_auto',       -- Automatic daily checkpoint
    'blanc_diagnostic', -- Blanc Mode intervention
    'rollback'          -- User rolled back to a previous version
  )),

  -- Metadata
  rule_count integer DEFAULT 0,
  phase text CHECK (phase IN ('calibration', 'active_learning', 'stabilized')),
  convergence_score float,

  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_bos_snapshots_brand ON brand_os_snapshots(brand_id);
CREATE INDEX idx_bos_snapshots_created ON brand_os_snapshots(brand_id, created_at DESC);

-- ─── 3. CONVERGENCE METRICS (Daily Stability Tracking) ─────────

CREATE TABLE IF NOT EXISTS convergence_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Day number since onboarding (day 1, 2, 3...)
  window_day integer NOT NULL,
  measured_at timestamptz DEFAULT now() NOT NULL,

  -- Sub-metrics (each 0.0 to 1.0, higher = more stable)
  edit_rate float NOT NULL DEFAULT 0.0,          -- 1 - (edits / generated) over 7-day rolling window
  rejection_rate float NOT NULL DEFAULT 0.0,     -- 1 - (regenerations / generated) over 7-day window
  rule_churn float NOT NULL DEFAULT 0.0,         -- 1 - normalized(rules added + modified + removed per day)
  tone_stability float NOT NULL DEFAULT 0.0,     -- cosine similarity of tone fingerprint vs 7-day-ago
  strategy_stability float NOT NULL DEFAULT 0.0, -- Jaccard similarity of strategy fields vs 7-day-ago

  -- Weighted composite (THE number that determines phase transitions)
  -- edit_rate*0.30 + rejection_rate*0.25 + rule_churn*0.20 + tone_stability*0.15 + strategy_stability*0.10
  composite_score float NOT NULL DEFAULT 0.0,

  -- Current phase at measurement time
  phase text NOT NULL DEFAULT 'calibration' CHECK (phase IN (
    'calibration', 'active_learning', 'stabilized'
  )),

  -- Was a Blanc diagnostic triggered on this day?
  blanc_triggered boolean DEFAULT false
);

CREATE INDEX idx_convergence_brand ON convergence_metrics(brand_id);
CREATE INDEX idx_convergence_day ON convergence_metrics(brand_id, window_day);
CREATE UNIQUE INDEX idx_convergence_unique ON convergence_metrics(brand_id, window_day);

-- ─── RLS POLICIES ──────────────────────────────────────────────

ALTER TABLE brand_os_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_os_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE convergence_metrics ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own data
CREATE POLICY "Users manage own events" ON brand_os_events
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own snapshots" ON brand_os_snapshots
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own metrics" ON convergence_metrics
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (cron jobs, server actions) can access everything
CREATE POLICY "Service role full access events" ON brand_os_events
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access snapshots" ON brand_os_snapshots
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access metrics" ON convergence_metrics
  FOR ALL USING (true) WITH CHECK (true);
