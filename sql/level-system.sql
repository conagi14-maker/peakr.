-- ═══════════════════════════════════════════════════════════════
-- アカウントレベル / 経験値 / プレステージ / 信頼度補正
-- Supabase Dashboard → SQL Editor で実行してください。
--
-- ・account_levels … XP と段(プレステージ=宝石段)を保持
-- ・posts.weighted_* … 信頼度補正済みの加重和（ランキング採点に使用）
-- ・profiles の階層列 … アカウント階層(guest/light/general/…)の下準備
--
-- ※ テスト段階のため RLS は public_all（既存方針）。公開前に
--   サーバー権威（RLS本丸C）で XP 改ざん防止を入れる前提。
-- ═══════════════════════════════════════════════════════════════

-- レベル/XP/段
CREATE TABLE IF NOT EXISTS account_levels (
  account_id  TEXT PRIMARY KEY,
  xp          INT  NOT NULL DEFAULT 0,   -- 現プレステージ内のXP（0〜9999 = Lv.1〜100）
  prestige    INT  NOT NULL DEFAULT 1,   -- 宝石の段（1=最初の宝石。1〜29+）
  total_xp    BIGINT NOT NULL DEFAULT 0, -- 生涯XP（統計・信頼度用）
  daily_xp    INT  NOT NULL DEFAULT 0,   -- 本日獲得したXP（1日上限100の判定）
  daily_date  DATE,                      -- daily_xp の対象日
  active_days INT  NOT NULL DEFAULT 0,   -- XPを得た延べ日数（信頼度の活動係数）
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE account_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_levels public all" ON account_levels;
CREATE POLICY "account_levels public all" ON account_levels
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON account_levels TO anon, authenticated;

-- ランキング採点用：信頼度補正済みの加重和（社会的表示の likes_count/saved_count は別途維持）
ALTER TABLE posts ADD COLUMN IF NOT EXISTS weighted_likes REAL NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS weighted_saves REAL NOT NULL DEFAULT 0;

-- アカウント階層の下準備（本実装は後日。既定は general）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_tier   TEXT    DEFAULT 'general';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;
