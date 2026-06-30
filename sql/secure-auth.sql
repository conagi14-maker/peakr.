-- ═══════════════════════════════════════════════════════════════
-- セキュリティ最優先: パスワードをクライアントから隔離する
--
-- 背景（重大）: 現在 profiles.password_hash は btoa()＝Base64（実質平文）で、
-- 匿名キーで誰でも読めるため、全ユーザーのパスワードが事実上公開状態。
--
-- 方針: ハッシュを匿名キーが触れない auth_credentials に分離し、
--       照合は Netlify Function（service_role）だけが行う。
--       関数側で旧Base64を照合 → 成功時に scrypt へ自動アップグレード。
--
-- 実行順は下部の【ロールアウト手順】を必ず守ること。
-- ═══════════════════════════════════════════════════════════════

-- ① 認証情報テーブル（匿名キーからは一切アクセス不可）
CREATE TABLE IF NOT EXISTS auth_credentials (
  account_id    TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE auth_credentials ENABLE ROW LEVEL SECURITY;
-- ポリシーを一切作らない＝anon/authenticated は RLS で全拒否。
-- さらに明示的に権限も剥奪（service_role は RLS/GRANT を超えてアクセス可）。
REVOKE ALL ON auth_credentials FROM anon, authenticated;

-- ② 既存ハッシュを移行（Base64のまま。関数が初回ログインで scrypt 化する）
INSERT INTO auth_credentials (account_id, password_hash)
SELECT account_id, password_hash
  FROM profiles
 WHERE password_hash IS NOT NULL AND password_hash <> ''
ON CONFLICT (account_id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- 【ロールアウト手順】
--   1. このファイルの ①② までを実行（テーブル作成＋移行）。
--   2. Netlify に SUPABASE_URL と SUPABASE_SERVICE_KEY を設定してデプロイ
--      （netlify/functions/auth.js が有効になる）。
--   3. 本番サイトでログイン／新規登録が通ることを確認
--      （クライアントは関数経由で auth_credentials を照合）。
--   4. 問題なければ下の【③ ロックダウン】を実行 → 漏洩値を消す。
--   5. 旧パスワードは流出済み前提。落ち着いたら全ユーザーにパスワード再設定を促す。
-- ═══════════════════════════════════════════════════════════════

-- ③ ロックダウン（手順3で確認できてから実行すること）
--    profiles 側の漏洩値を消す。列自体は残すので select('*') は壊れない。
--
-- UPDATE profiles SET password_hash = NULL;
