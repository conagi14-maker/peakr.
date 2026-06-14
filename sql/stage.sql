-- ═══════════════════════════════════════════════════════════════
-- ステージ（リアルタイム活動アピール）— activities テーブル
-- Supabase Dashboard → SQL Editor で実行してください。
--
-- 認証アカウントが「今/これからの活動」（配信・ライブ・TV出演・
-- イベント・サイン会など）を登録し、ライブ中は注目度ランキング、
-- これからはタイムラインで表示する。終了時刻で自動失効。
-- ブーストは既存のブーストチケットを流用（boost_score）。
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activities (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id  TEXT NOT NULL,                 -- 出演者（認証アカウント）
  type        TEXT NOT NULL DEFAULT 'stream',-- stream/live/tv/event/signing/other
  title       TEXT NOT NULL,
  cat_id      TEXT,                           -- カテゴリー（CATS_DATA の id）
  url         TEXT,                           -- 視聴/詳細リンク（任意）
  location    TEXT,                           -- オフライン会場（任意）
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ,                    -- 終了で自動失効（NULL は開始+既定時間で失効）
  boost_score INT DEFAULT 0,                  -- ブースト合計（既存ロジック流用・上限あり）
  click_count INT DEFAULT 0,                  -- 注目度の流入シグナル
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 取得クエリ用インデックス（開始時刻で絞り込み・並べ替え）
CREATE INDEX IF NOT EXISTS idx_activities_starts ON activities (starts_at);
CREATE INDEX IF NOT EXISTS idx_activities_ends   ON activities (ends_at);

-- RLS（プロトタイプ運用：匿名キーから全操作可。出演登録の認証チェックはアプリ側で実施）
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activities public all" ON activities;
CREATE POLICY "activities public all" ON activities
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON activities TO anon, authenticated;
