-- ═══════════════════════════════════════════════════════════════
-- PEAKR セットアップ & セキュリティ強化 SQL
-- Supabase Dashboard → SQL Editor で実行してください。
-- ステージごとに分かれています。上から順に実行できます。
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- ステージ1【今すぐ実行】バッジ強化データの DB 同期用カラム
-- 機種変・ブラウザ変更でも強化レベルが消えなくなります
-- ───────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badge_levels   JSONB DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badge_rarities JSONB DEFAULT '{}'::jsonb;

-- 告知画像カラム（未作成の場合）
ALTER TABLE user_announcements ADD COLUMN IF NOT EXISTS image_data TEXT;

-- ───────────────────────────────────────────────
-- ステージ2【今すぐ実行】画像用 Storage バケット
-- base64 を DB に入れる代わりに Storage（無料1GB）へ保存します
-- ───────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true)
ON CONFLICT (id) DO NOTHING;

-- 誰でも閲覧可・アップロード可（匿名キー運用のため）
DROP POLICY IF EXISTS "post-media public read"  ON storage.objects;
DROP POLICY IF EXISTS "post-media anon upload"  ON storage.objects;
CREATE POLICY "post-media public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-media');
CREATE POLICY "post-media anon upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'post-media');

-- ───────────────────────────────────────────────
-- ステージ3【今すぐ実行】コインログテーブル
-- coin-api（Netlify Function）の日次上限チェックに使用します
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coin_logs (
  id         BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  reason     TEXT DEFAULT 'other',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coin_logs_account_date ON coin_logs (account_id, created_at);
ALTER TABLE coin_logs DISABLE ROW LEVEL SECURITY;
GRANT ALL ON coin_logs TO anon, authenticated;
GRANT USAGE ON SEQUENCE coin_logs_id_seq TO anon, authenticated;

-- ───────────────────────────────────────────────
-- ステージ3.5【今すぐ実行】user_activity の権限エラー修正
-- コンソールに「permission denied for table user_activity」が
-- 大量に出ている問題の解消
-- ───────────────────────────────────────────────
ALTER TABLE user_activity DISABLE ROW LEVEL SECURITY;
GRANT ALL ON user_activity TO anon, authenticated;

-- ───────────────────────────────────────────────
-- ステージ4【一般公開の直前に実行】コインテーブルのロックダウン
-- ※ 実行すると、クライアントから peak_points への直接書き込みが
--   できなくなります。Netlify に SUPABASE_SERVICE_KEY を設定し、
--   coin-api が動作していることを確認してから実行してください。
-- ───────────────────────────────────────────────
-- ALTER TABLE peak_points ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "coins read all"  ON peak_points;
-- CREATE POLICY "coins read all" ON peak_points FOR SELECT USING (true);
-- -- INSERT/UPDATE/DELETE のポリシーを作らない = anon からは読み取り専用
-- REVOKE INSERT, UPDATE, DELETE ON peak_points FROM anon;

-- ───────────────────────────────────────────────
-- ステージ5【一般公開の直前に実行】主要テーブルの基本保護
-- 読み取りは全許可、削除だけ禁止する例。
-- ※ アプリは匿名キー運用のため、行レベルの所有者判定はできません。
--   完全な保護には Supabase Auth への移行が必要です（将来課題）。
-- ───────────────────────────────────────────────
-- 投稿の削除をクライアントから直接できないようにする場合：
-- REVOKE DELETE ON posts FROM anon;
-- ※ アプリ内の「投稿削除」機能を使う場合は実行しないでください

-- プロフィールの password_hash を読めなくする（ビュー経由に移行するまで保留）
-- 注意: 現在ログイン処理が password_hash を直接参照しているため、
--       実行するとログインできなくなります。実行しないでください。

-- ───────────────────────────────────────────────
-- 参考【Netlify 環境変数の設定】
-- Netlify Dashboard → Site configuration → Environment variables
--   SUPABASE_URL         = https://（プロジェクトID）.supabase.co
--   SUPABASE_SERVICE_KEY = （Settings → API → service_role キー）
-- 設定後に再デプロイすると coin-api が有効になり、
-- コイン加算に日次上限（5,000/日）がかかります。
-- 未設定の間は従来どおりクライアント直接書き込みで動作します。
-- ───────────────────────────────────────────────
