-- ═══════════════════════════════════════════════════════════════
-- ステージ：実況コメントの Realtime 有効化
-- Supabase Dashboard → SQL Editor で実行してください。
--
-- activity_comments を supabase_realtime publication に追加し、
-- 没入ビューの実況コメントをポーリングではなく即時配信で受け取る。
-- これにより従来の定期ポーリング(負荷)を大幅に削減する。
-- 既に追加済みでもエラーにならない(冪等)。
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE activity_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- 既に追加済み
  WHEN undefined_object THEN NULL;  -- publication 未作成の環境は無視
END $$;
