-- ============================================
-- Trendy SNS — Supabase テーブル定義
-- SQL Editor で実行してください
-- ============================================

-- ① 投稿テーブル
CREATE TABLE IF NOT EXISTS posts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_handle  TEXT NOT NULL DEFAULT '@you',
  user_name    TEXT NOT NULL DEFAULT 'あなた',
  is_sub       BOOLEAN DEFAULT false,
  content      TEXT NOT NULL,
  ai_type      TEXT DEFAULT 'none' CHECK (ai_type IN ('none','part','full')),
  likes_count  INT DEFAULT 0,
  rt_count     INT DEFAULT 0,
  views_count  INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ② 広告テーブル
CREATE TABLE IF NOT EXISTS ads (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  advertiser   TEXT NOT NULL,
  text         TEXT NOT NULL,
  budget       INT NOT NULL,
  max_per_user INT DEFAULT 5,
  bg           TEXT DEFAULT '#dbeafe',
  tc           TEXT DEFAULT '#1e40af',
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ③ 広告・ユーザー別表示回数
CREATE TABLE IF NOT EXISTS ad_impressions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_id        UUID REFERENCES ads(id) ON DELETE CASCADE,
  session_key  TEXT NOT NULL,
  count        INT DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ad_id, session_key)
);

-- ④ 通知テーブル
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_type   TEXT DEFAULT 'main',
  icon           TEXT,
  bg             TEXT DEFAULT '#dbeafe',
  tc             TEXT DEFAULT '#1e40af',
  text           TEXT NOT NULL,
  hint           TEXT,
  notif_type     TEXT,
  rank           INT,
  cat            TEXT,
  follower_count INT,
  followers      JSONB,
  unread         BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- RLS（Row Level Security）有効化
-- ============================================
ALTER TABLE posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- プロトタイプ用：全操作を許可
CREATE POLICY "public_all" ON posts          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON ads            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON ad_impressions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON notifications  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- サンプル広告データを挿入
-- ============================================
INSERT INTO ads (advertiser, text, budget, max_per_user, bg, tc) VALUES
  ('株式会社トレンド',    '新春セール開催中！最大50%OFF',     50000, 6, '#dbeafe', '#1e40af'),
  ('ゲームスタジオXY',    '新作RPGリリース！今すぐDL♟',       38000, 4, '#ede9fe', '#5b21b6'),
  ('@fashion_mika',       '私のハンドメイドショップ見てね♥', 12000, 8, '#fce7f3', '#be185d'),
  ('フードデリバリーABC', '初回注文500円引き！今すぐ注文',    8500,  5, '#d1fae5', '#065f46'),
  ('@tech_blog_k',        'プログラミング講座を無料公開中📚', 5000,  3, '#fef3c7', '#92400e')
ON CONFLICT DO NOTHING;
