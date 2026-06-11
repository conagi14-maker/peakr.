-- ═══════════════════════════════════════════════════════════════
-- マイページ「アクセス解析ダッシュボード」用マイグレーション
-- Supabase Dashboard → SQL Editor で実行してください。
--
-- 内容:
--  ① post_views に created_at（いつ見られたか）と source（どこで見られたか）を追加
--  ② 重複行を掃除して (post_id, account_id) のユニーク制約を保証
--  ③ increment_views_once RPC を source 対応版に置き換え
--     （旧2引数の呼び出しもそのまま動きます = 互換あり）
-- ═══════════════════════════════════════════════════════════════

-- ① カラム追加（既存行の created_at は実行時刻で埋まる = 「移行前」として扱われます）
ALTER TABLE post_views ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE post_views ADD COLUMN IF NOT EXISTS source TEXT;
UPDATE post_views SET created_at = now() WHERE created_at IS NULL;

-- ② 重複を除去してユニークインデックスを作成（ON CONFLICT の前提）
DELETE FROM post_views a
USING post_views b
WHERE a.ctid < b.ctid
  AND a.post_id = b.post_id
  AND a.account_id = b.account_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_post_views_post_account
  ON post_views (post_id, account_id);

-- 集計クエリ用インデックス
CREATE INDEX IF NOT EXISTS idx_post_views_post_created
  ON post_views (post_id, created_at);

-- ③ RPC を post_id の型（uuid / text）に合わせて作り直す
DO $mig$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_name = 'post_views' AND column_name = 'post_id';

  EXECUTE 'DROP FUNCTION IF EXISTS increment_views_once(text, text)';
  EXECUTE 'DROP FUNCTION IF EXISTS increment_views_once(text, text, text)';

  IF v_type = 'uuid' THEN
    EXECUTE $f$
      CREATE FUNCTION increment_views_once(p_post_id TEXT, p_account_id TEXT, p_source TEXT DEFAULT NULL)
      RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $fn$
      BEGIN
        INSERT INTO post_views (post_id, account_id, source)
        VALUES (p_post_id::uuid, p_account_id, p_source)
        ON CONFLICT (post_id, account_id) DO NOTHING;
        IF FOUND THEN
          UPDATE posts SET views_count = COALESCE(views_count, 0) + 1
           WHERE id = p_post_id::uuid;
        END IF;
      END;
      $fn$;
    $f$;
  ELSE
    EXECUTE $f$
      CREATE FUNCTION increment_views_once(p_post_id TEXT, p_account_id TEXT, p_source TEXT DEFAULT NULL)
      RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $fn$
      BEGIN
        INSERT INTO post_views (post_id, account_id, source)
        VALUES (p_post_id, p_account_id, p_source)
        ON CONFLICT (post_id, account_id) DO NOTHING;
        IF FOUND THEN
          UPDATE posts SET views_count = COALESCE(views_count, 0) + 1
           WHERE id::text = p_post_id;
        END IF;
      END;
      $fn$;
    $f$;
  END IF;
END;
$mig$;

-- anon キーから呼べるように
GRANT EXECUTE ON FUNCTION increment_views_once(TEXT, TEXT, TEXT) TO anon, authenticated;
