-- ═══════════════════════════════════════════════════════════════
-- フォロー中ユーザーごとの「通知内容」設定
-- Supabase Dashboard → SQL Editor で実行してください。
--
-- 内容:
--  ① follows に notify_types(JSONB) を追加
--     { "text": true, "image": true, "video": true, "announce": true }
--     ＝ 文字のみ / 画像 / 動画 / 告知 の各通知を個別にON/OFF（既定は全ON）
--  ② 既存の notify_enabled(告知ON/OFF) を notify_types.announce にバックフィル
--     ※ notify_enabled は後方互換のため残し、announce と同期させて運用します
--  ③ follows テーブルの UPDATE を許可
--     ※ 現状 UPDATE ポリシーが無く、通知設定の保存が 0 行更新で握りつぶされていた
--       （＝これまで告知ON/OFFも実は保存されていなかった）。本SQLで解消します。
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE follows
  ADD COLUMN IF NOT EXISTS notify_types JSONB
  DEFAULT '{"text":true,"image":true,"video":true,"announce":true}'::jsonb;

-- ③ UPDATE 許可（プロトタイプ運用：匿名キーから更新可）
GRANT UPDATE ON follows TO anon, authenticated;
DROP POLICY IF EXISTS "follows update all" ON follows;
CREATE POLICY "follows update all" ON follows
  FOR UPDATE USING (true) WITH CHECK (true);

-- 既存行を現在の notify_enabled に合わせて初期化
--   notify_enabled = false（告知OFF）だった人は announce だけ false、他は true
UPDATE follows
SET notify_types = jsonb_build_object(
  'text',     true,
  'image',    true,
  'video',    true,
  'announce', COALESCE(notify_enabled, true)
)
WHERE notify_types IS NULL
   OR notify_types = '{}'::jsonb;
