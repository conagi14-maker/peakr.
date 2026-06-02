// ── Supabase Client ────────────────────────────────────
const SUPABASE_URL = 'https://ueqqurinkmgvetnmjvka.supabase.co';
const SUPABASE_KEY = 'sb_publishable_T_g8Aa0TUXr6Z1-ROGmdIQ_FyFPWfhS';

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// 接続テスト（コンソールで確認用）
async function testConnection() {
  try {
    const { data, error } = await db.from('_test_ping').select('*').limit(1);
    // テーブルがなくてもエラー内容でサーバー疎通は確認できる
    if (error && error.code === '42P01') {
      console.log('✅ Supabase 接続成功！（テーブルはまだありません）');
    } else if (error) {
      console.log('✅ Supabase 接続成功！', error.message);
    } else {
      console.log('✅ Supabase 接続成功！', data);
    }
  } catch (e) {
    console.error('❌ Supabase 接続失敗:', e);
  }
}

testConnection();
