// Netlify Function: 認証（サーバーサイドでパスワード照合）
// 目的: password_hash をクライアントに一切渡さず、サーバーだけで検証する。
//       旧 base64(=ほぼ平文) は照合できるが、成功時に scrypt へ自動アップグレードする。
//
// 必要な環境変数（Netlify → Site settings → Environment variables）:
//   SUPABASE_URL          : https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  : service_role キー
// 未設定なら 503 を返し、クライアントは従来の照合へフォールバックする。

const crypto = require('crypto');

function makeHash(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `scrypt$${salt}$${h}`;
}
function verifyPassword(pw, stored) {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const calc = crypto.scryptSync(pw, parts[1], 32).toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(parts[2], 'hex'));
    } catch (e) { return false; }
  }
  // 旧方式: btoa(unescape(encodeURIComponent(pw))) = UTF-8 の base64
  const legacy = Buffer.from(pw, 'utf8').toString('base64');
  return legacy === stored;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'server not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid json' }) };
  }
  const action = body.action;
  const accountId = (body.accountId || '').toString().trim();
  const password  = (body.password  || '').toString();
  if (!accountId || accountId.length > 64) return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid accountId' }) };
  if (!password) return { statusCode: 400, headers, body: JSON.stringify({ error: 'password required' }) };

  const enc = encodeURIComponent;
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
  const upsertCred = (hash) => sb('auth_credentials', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify({ account_id: accountId, password_hash: hash, updated_at: new Date().toISOString() }),
  });

  try {
    if (action === 'register') {
      await upsertCred(makeHash(password));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'login') {
      // 1) auth_credentials を最優先
      let stored = null, fromProfiles = false;
      const cred = await sb(`auth_credentials?account_id=eq.${enc(accountId)}&select=password_hash`);
      stored = cred && cred[0] ? cred[0].password_hash : null;
      // 2) 無ければ旧 profiles.password_hash から移行
      if (!stored) {
        const prof = await sb(`profiles?account_id=eq.${enc(accountId)}&select=password_hash`);
        stored = prof && prof[0] ? prof[0].password_hash : null;
        fromProfiles = true;
      }
      if (!stored) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'not_found' }) };

      if (!verifyPassword(password, stored)) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'mismatch' }) };
      }
      // 旧base64 or profiles由来なら scrypt で auth_credentials を作成/更新
      if (fromProfiles || !stored.startsWith('scrypt$')) {
        try { await upsertCred(makeHash(password)); } catch (e) { /* 失敗してもログインは通す */ }
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'unknown action' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
