-- Schema for the "Living OS" Evolution Engine
-- This table tracks every time a human edits an AI-generated strategy output.
-- Over time, this becomes our proprietary synthetic dataset for fine-tuning our own models.

CREATE TABLE strategy_deltas (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- The specific field being modified (e.g., 'coreNarratives', 'targetAudience', 'tone')
  field_name text NOT NULL,
  
  -- What the AI originally generated
  original_ai_text text NOT NULL,
  
  -- What the human expert changed it to
  human_edited_text text NOT NULL,
  
  -- Context at the time of generation (to feed into the fine-tuning prompt)
  context_snapshot jsonb, 
  
  -- Track the quality of the edit (can be upvoted by admins later for high-quality training pairs)
  quality_score integer DEFAULT 0,
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast analytics and dataset exporting
CREATE INDEX idx_strategy_deltas_field ON strategy_deltas(field_name);
CREATE INDEX idx_strategy_deltas_created ON strategy_deltas(created_at);

-- RLS Policies
ALTER TABLE strategy_deltas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own deltas" 
ON strategy_deltas FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own deltas" 
ON strategy_deltas FOR SELECT 
USING (auth.uid() = user_id);

-- Admins would need a policy to read all deltas for dataset training.
