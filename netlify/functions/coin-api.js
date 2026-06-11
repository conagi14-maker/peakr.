// Netlify Function: コイン操作 API（サーバーサイド検証付き）
// クライアント直書きの dbAddPoints を段階的に置き換える。
//
// 必要な環境変数（Netlify ダッシュボード → Site settings → Environment variables）:
//   SUPABASE_URL          : https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  : service_role キー（Settings → API）
//
// 環境変数が未設定の場合は 503 を返し、クライアントは従来の直接書き込みにフォールバックする。

const DAILY_EARN_CAP = 5000; // 1日に獲得できるコインの上限（不正対策）

// 加算理由ごとの1回あたり上限（理由不明の大量加算を防ぐ）
const REASON_CAPS = {
  like:        15,    // いいね（バッジブースト込み）
  dive:        100,   // ダイブ閲覧まとめ加算
  post_gacha:  1300,  // 投稿ガチャ（最大1000×ブースト30%）
  rank_reward: 5000,  // ランキング報酬
  highlow:     24000, // ハイ&ロー払い戻し（最大24,000）
  refund:      24000,
  admin:       1000000, // 運営付与
  other:       100,
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'server not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid json' }) };
  }

  const { action, accountId, amount, reason } = body;
  if (!accountId || typeof accountId !== 'string' || accountId.length > 64) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid accountId' }) };
  }

  // Supabase REST ヘルパー（service_role で直接呼ぶ）
  const sb = async (path, opts = {}) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': opts.prefer || 'return=representation',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  try {
    if (action === 'get') {
      const rows = await sb(`peak_points?account_id=eq.${encodeURIComponent(accountId)}&select=points,total_earned`);
      const row = rows?.[0] || { points: 0, total_earned: 0 };
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...row }) };
    }

    if (action === 'add') {
      const amt = Math.floor(Number(amount));
      if (!Number.isFinite(amt) || amt <= 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid amount' }) };
      }
      const cap = REASON_CAPS[reason] ?? REASON_CAPS.other;
      if (amt > cap) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `amount exceeds cap for reason "${reason}"` }) };
      }

      // 日次獲得上限チェック（coin_logs を参照）
      const today = new Date().toISOString().slice(0, 10);
      let earnedToday = 0;
      try {
        const logs = await sb(`coin_logs?account_id=eq.${encodeURIComponent(accountId)}&created_at=gte.${today}T00:00:00Z&amount=gt.0&select=amount`);
        earnedToday = (logs || []).reduce((s, r) => s + (r.amount || 0), 0);
      } catch(e) { /* coin_logs 未作成なら上限チェックをスキップ */ }
      if (earnedToday + amt > DAILY_EARN_CAP && reason !== 'admin' && reason !== 'highlow' && reason !== 'refund') {
        return { statusCode: 429, headers, body: JSON.stringify({ error: 'daily earn cap reached', earnedToday }) };
      }

      // 残高更新
      const rows = await sb(`peak_points?account_id=eq.${encodeURIComponent(accountId)}&select=points,total_earned`);
      const cur = rows?.[0] || { points: 0, total_earned: 0 };
      const newPoints = (cur.points || 0) + amt;
      const newTotal  = (cur.total_earned || 0) + amt;
      await sb('peak_points', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify({ account_id: accountId, points: newPoints, total_earned: newTotal, updated_at: new Date().toISOString() }),
      });
      // ログ記録（テーブルがあれば）
      try {
        await sb('coin_logs', {
          method: 'POST', prefer: 'return=minimal',
          body: JSON.stringify({ account_id: accountId, amount: amt, reason: reason || 'other' }),
        });
      } catch(e) {}
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, points: newPoints }) };
    }

    if (action === 'use') {
      const amt = Math.floor(Number(amount));
      if (!Number.isFinite(amt) || amt <= 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid amount' }) };
      }
      const rows = await sb(`peak_points?account_id=eq.${encodeURIComponent(accountId)}&select=points,total_earned`);
      const cur = rows?.[0];
      if (!cur || (cur.points || 0) < amt) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'insufficient balance' }) };
      }
      await sb('peak_points', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify({ account_id: accountId, points: cur.points - amt, total_earned: cur.total_earned || 0, updated_at: new Date().toISOString() }),
      });
      try {
        await sb('coin_logs', {
          method: 'POST', prefer: 'return=minimal',
          body: JSON.stringify({ account_id: accountId, amount: -amt, reason: reason || 'spend' }),
        });
      } catch(e) {}
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, points: cur.points - amt }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'unknown action' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
