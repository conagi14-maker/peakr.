-- ═══════════════════════════════════════════════════════════════
-- ステージ：クリック連打対策 ＋ 実況コメント
-- Supabase Dashboard → SQL Editor で実行してください。
--
--  ① activity_clicks：1アカウント1活動につき1クリックまで（連打で注目度を盛れない）
--     increment_activity_click_once RPC で重複を弾きつつ click_count を加算
--  ② activity_comments：実況コメント。スコアは「ユニーク実況参加者数」で評価
-- ═══════════════════════════════════════════════════════════════

-- ① クリック（ユニーク）
CREATE TABLE IF NOT EXISTS activity_clicks (
  activity_id UUID NOT NULL,
  account_id  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (activity_id, account_id)
);
ALTER TABLE activity_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_clicks all" ON activity_clicks;
CREATE POLICY "activity_clicks all" ON activity_clicks FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON activity_clicks TO anon, authenticated;

CREATE OR REPLACE FUNCTION increment_activity_click_once(p_activity_id TEXT, p_account_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO activity_clicks (activity_id, account_id)
  VALUES (p_activity_id::uuid, p_account_id)
  ON CONFLICT (activity_id, account_id) DO NOTHING;
  IF FOUND THEN
    UPDATE activities SET click_count = COALESCE(click_count, 0) + 1
     WHERE id = p_activity_id::uuid;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION increment_activity_click_once(TEXT, TEXT) TO anon, authenticated;

-- ② 実況コメント
CREATE TABLE IF NOT EXISTS activity_comments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL,
  account_id  TEXT NOT NULL,
  user_name   TEXT,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_comments_act ON activity_comments (activity_id, created_at);
ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_comments all" ON activity_comments;
CREATE POLICY "activity_comments all" ON activity_comments FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON activity_comments TO anon, authenticated;
