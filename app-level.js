// ══════════════════════════════════════════════════════════════
// アカウントレベル / 経験値(XP) / プレステージ / 信頼度補正
//   ・見た目 … 宝石ドット(案3)。段=宝石の色、数字=レベル(1〜100)
//   ・BOT対策 … 信頼度補正(actorの信用度でランキング寄与を加重)
// 依存: グローバル db(supabase-client.js)
// ※ テスト段階のためXP付与・加重はクライアント read-modify-write。
//   公開前にサーバー権威(RLS本丸C)へ移す前提。
// ══════════════════════════════════════════════════════════════

const XP_PER_LEVEL   = 100;   // 1レベル = 100XP(一定)
const LEVEL_MAX      = 100;   // プレステージ内の最大レベル
const DAILY_XP_CAP   = 100;   // 1日に得られるXPの上限
const XP_VALUES      = { like: 1, liked: 2, post: 5, comment: 2, login: 3 };

// 信頼度補正(ランキングに効くactorの係数)
const TRUST_FLOOR    = 0.01;  // 新規の下限
const TRUST_CUTOFF   = 0.1;   // これ未満はランキング寄与ゼロ(BOTネットの合算対策)
const TRUST_CAP      = 1.5;   // 天井
const TRUST_TIER_CAP = { guest: 0, light: 0.5, general: 1.5, verified: 1.5, corporate: 1.5 };

// 段(プレステージ) → 宝石。序盤20=色石、終盤9=貴石。行を足せば無限拡張。
const LEVEL_GEMS = [
  { name:'スモーキークォーツ', gg:'linear-gradient(135deg,#b8bcc4,#7e838c)' },
  { name:'ローズクォーツ',     gg:'linear-gradient(135deg,#f0c9d0,#d68fa0)' },
  { name:'ペリドット',         gg:'linear-gradient(135deg,#cfe0a8,#9fbf5f)' },
  { name:'アクアマリン',       gg:'linear-gradient(135deg,#bfe6ec,#7fc4d0)' },
  { name:'シトリン',           gg:'linear-gradient(135deg,#f5dfa0,#d8b45e)' },
  { name:'アメトリン',         gg:'linear-gradient(135deg,#d9c2ea,#b090d0)' },
  { name:'翡翠',               gg:'linear-gradient(135deg,#8fc9a8,#4f9e78)' },
  { name:'ターコイズ',         gg:'linear-gradient(135deg,#6fd0cf,#2fa6a8)' },
  { name:'コーラル',           gg:'linear-gradient(135deg,#f2a98f,#d86f52)' },
  { name:'ラピスラズリ',       gg:'linear-gradient(135deg,#6f8fd0,#3a5ba8)' },
  { name:'タンザナイト',       gg:'linear-gradient(135deg,#7f8fd8,#4a56b0)' },
  { name:'トルマリン',         gg:'linear-gradient(135deg,#4fc0a0,#1f8f78)' },
  { name:'サファイア',         gg:'linear-gradient(135deg,#4f7fd0,#234f9e)' },
  { name:'スピネル',           gg:'linear-gradient(135deg,#e07fa0,#b83a66)' },
  { name:'ヘソナイト',         gg:'linear-gradient(135deg,#e08f5a,#b8552e)' },
  { name:'エメラルド',         gg:'linear-gradient(135deg,#2fb080,#0b6e4f)' },
  { name:'ルビー',             gg:'linear-gradient(135deg,#e05a6a,#b01330)' },
  { name:'サンストーン',       gg:'linear-gradient(135deg,#f0a860,#cf7020)' },
  { name:'アイオライト',       gg:'linear-gradient(135deg,#7f7fd0,#4a4aa8)' },
  { name:'ムーンストーン',     gg:'linear-gradient(135deg,#dfe6ee,#b8c4d4)', glow:'0 0 5px rgba(220,228,238,.5)' },
  // 貴石
  { name:'白 ダイヤ',    gg:'linear-gradient(135deg,#ffffff,#d3dae2)' },
  { name:'茶 ブロンズ',  gg:'linear-gradient(135deg,#e6a86a,#7a4318)' },
  { name:'銀 シルバー',  gg:'linear-gradient(135deg,#ffffff,#9aa6b2)' },
  { name:'金 ゴールド',  gg:'linear-gradient(135deg,#fff1a8,#b8860b)', glow:'0 0 7px rgba(230,181,36,.5)' },
  { name:'黒 オニキス',  gg:'linear-gradient(135deg,#3a3a3a,#0a0a0a)', rim:'#cbd3de' },
  { name:'紫 アメジスト', gg:'linear-gradient(135deg,#c79bef,#5b21b6)', glow:'0 0 7px rgba(124,58,237,.5)' },
  { name:'ワイン ガーネット', gg:'linear-gradient(135deg,#e0708c,#6e0f2a)', glow:'0 0 8px rgba(143,26,58,.55)' },
  { name:'漆黒×金',      gg:'linear-gradient(135deg,#2a2a2a,#0a0a0a)', rim:'#e6b524', glow:'0 0 8px rgba(230,181,36,.5)' },
  { name:'虹光 オパール', holo:true },
];

function _gemFor(prestige) {
  const idx = Math.min(Math.max(prestige || 1, 1), LEVEL_GEMS.length) - 1;
  return LEVEL_GEMS[idx];
}
function _levelFromXp(xp) {
  return Math.min(LEVEL_MAX, Math.floor((xp || 0) / XP_PER_LEVEL) + 1);
}
function _isMaxLevel(xp) {
  return _levelFromXp(xp) >= LEVEL_MAX;
}

// ── 信頼度補正 ────────────────────────────────────────────────
// trust = tierCap × min(年齢係数, 活動係数)。近道封じ(放置/連打の両方を弾く)。
function _accountTrust(o) {
  o = o || {};
  const cap = TRUST_TIER_CAP[o.tier] != null ? TRUST_TIER_CAP[o.tier] : TRUST_TIER_CAP.general;
  if (cap === 0) return 0; // ゲスト
  const ageDays = Math.max(0, o.ageDays || 0);
  const active  = Math.max(0, o.activeDays || 0);
  const raw = Math.min(ageDays, active);               // 年齢と活動の小さい方
  const f = raw <= 30 ? raw / 30                       // 30日で等倍1.0
                      : 1 + Math.min(0.5, (raw - 30) / 120); // 以降150日で1.5
  return Math.max(TRUST_FLOOR, Math.min(cap, f));
}
// ランキング加重(足切り: 補正がcutoff未満なら0 = BOTネットの合算対策)
function _trustWeight(trust) {
  return (trust >= TRUST_CUTOFF) ? trust : 0;
}
function _daysSince(iso) {
  if (!iso) return 0;
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 86400000);
}

// ── バッジ描画(宝石ドット) ────────────────────────────────────
// lvl: {prestige, xp} または {prestige, level}。size: アバター実寸(px)。
// 32px未満は非表示(空文字)。size>=64 は「Lv.NN」、それ未満は数字のみ。
function levelBadgeHtml(lvl, size) {
  size = size || 44;
  if (size < 44 || !lvl) return '';
  const prestige = lvl.prestige || 1;
  const level = (lvl.level != null) ? lvl.level : _levelFromXp(lvl.xp);
  const g = _gemFor(prestige);
  let cls = 'lvl-gem', style = '';
  if (g.holo) { cls += ' holo'; }
  else {
    style = '--gg:' + g.gg;
    if (g.rim)  { cls += ' rim'; style += ';--rim:' + g.rim; }
    if (g.glow) { style += ';--glow:' + g.glow; }
  }
  const num = size >= 64 ? ('Lv.' + level) : ('' + level);
  const lg = size >= 64 ? ' lg' : '';
  return `<span class="lvl-pill${lg}"><span class="${cls}"${style ? ' style="' + style + '"' : ''}></span><span class="lvl-n">${num}</span></span>`;
}

// ── レベルキャッシュ(複数アバターの一括描画用) ──────────────────
const _levelCache = {}; // { account_id: {prestige, xp, level} }

function levelBadgeCached(accountId, size) {
  const l = _levelCache[accountId];
  if (!l) return '';
  return levelBadgeHtml(l, size);
}

/** アバターの隅に置く「宝石ドット」だけ(数字なし)。認証バッジ等と衝突しない。 */
function levelDotHtml(lvl) {
  if (!lvl) return '';
  const g = _gemFor(lvl.prestige || 1);
  let cls = 'lvl-gem', style = '';
  if (g.holo) { cls += ' holo'; }
  else {
    style = '--gg:' + g.gg;
    if (g.rim)  { cls += ' rim'; style += ';--rim:' + g.rim; }
    if (g.glow) { style += ';--glow:' + g.glow; }
  }
  return `<span class="${cls}"${style ? ' style="' + style + '"' : ''}></span>`;
}

/** アバター要素の隅に宝石ドットを差し込む(単体)。container は position:relative 前提。
 *  size は実寸px(40未満は非表示)。既存は差し替え。 */
async function attachLevelBadge(container, accountId, size) {
  if (!container || !accountId) return;
  const old = container.querySelector(':scope > .lvl-on-av');
  if (old) old.remove();
  if ((size || 44) < 40) return;
  let lvl = _levelCache[accountId];
  if (!lvl) {
    const row = await dbFetchLevel(accountId);
    lvl = { prestige: row.prestige, xp: row.xp, level: _levelFromXp(row.xp) };
    _levelCache[accountId] = lvl;
  }
  const html = levelDotHtml(lvl);
  if (!html) return;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.insertAdjacentHTML('beforeend', `<span class="lvl-on-av">${html}</span>`);
}

/** 一覧描画後にまとめてバッジを差し込む。対象は [data-lvl-acct] を持つアバター要素。
 *  実寸は要素の描画幅を測って判定(40px未満は非表示)。data-lvl-size で上書き可。 */
async function decorateLevelBadges(root) {
  root = root || document;
  const raw = [...root.querySelectorAll('[data-lvl-acct]')].filter(el => !el.querySelector(':scope > .lvl-on-av'));
  if (!raw.length) return;
  const work = raw.map(el => {
    const acct = el.getAttribute('data-lvl-acct');
    const forced = parseInt(el.getAttribute('data-lvl-size') || '', 10);
    // 実寸は「中身アバター」の描画幅で判定(ラッパーは0幅になりがち)。非表示は除外。
    const inner = el.firstElementChild || el;
    const w = Math.round(inner.getBoundingClientRect().width);
    const size = forced || w;
    return { el, acct, size, visible: el.offsetParent !== null && w >= 40 };
  }).filter(w => w.acct && w.visible && w.size >= 40);
  if (!work.length) return;
  const missing = [...new Set(work.map(w => w.acct))].filter(a => !_levelCache[a]);
  if (missing.length) await dbFetchLevelsBatch(missing);
  work.forEach(w => {
    if (w.el.querySelector(':scope > .lvl-on-av')) return;
    const lvl = _levelCache[w.acct];
    const html = levelDotHtml(lvl);
    if (!html) return;
    if (getComputedStyle(w.el).position === 'static') w.el.style.position = 'relative';
    w.el.insertAdjacentHTML('beforeend', `<span class="lvl-on-av">${html}</span>`);
  });
}

// 描画後に自動でバッジを差し込む(デバウンス付き MutationObserver)。
// _tweetAvHtml 等が data-lvl-acct を付けたアバターを吐けば、どのフィードでも自動反映。
let _lvlDecorateTimer = null;
function _scheduleDecorate() {
  clearTimeout(_lvlDecorateTimer);
  _lvlDecorateTimer = setTimeout(() => { try { decorateLevelBadges(document.body); } catch (e) {} }, 300);
}
if (typeof window !== 'undefined') {
  window.addEventListener('load', function () {
    try {
      const mo = new MutationObserver(function (muts) {
        for (const m of muts) { if (m.addedNodes && m.addedNodes.length) { _scheduleDecorate(); break; } }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      _scheduleDecorate();
    } catch (e) {}
  });
}

// ── DB アクセス ───────────────────────────────────────────────
async function dbFetchLevel(accountId) {
  const empty = { account_id: accountId, xp: 0, prestige: 1, total_xp: 0, daily_xp: 0, daily_date: null, active_days: 0 };
  if (!accountId || typeof db === 'undefined') return empty;
  try {
    const { data, error } = await db.from('account_levels').select('*').eq('account_id', accountId).maybeSingle();
    if (error || !data) return empty;
    return data;
  } catch (e) { return empty; }
}

/** 表示中アカウントのレベルを一括取得してキャッシュ(未取得のみDBアクセス) */
async function dbFetchLevelsBatch(accountIds) {
  const ids = [...new Set((accountIds || []).filter(Boolean))].filter(id => !_levelCache[id]);
  if (!ids.length || typeof db === 'undefined') return _levelCache;
  try {
    const { data } = await db.from('account_levels').select('account_id,xp,prestige').in('account_id', ids);
    (data || []).forEach(r => { _levelCache[r.account_id] = { prestige: r.prestige, xp: r.xp, level: _levelFromXp(r.xp) }; });
  } catch (e) {}
  // 行が無いアカウントは Lv.1/段1 として扱う(再フェッチ防止でキャッシュに固定)
  ids.forEach(id => { if (!_levelCache[id]) _levelCache[id] = { prestige: 1, xp: 0, level: 1 }; });
  return _levelCache;
}

/** XP付与(1日上限つき)。reason は XP_VALUES のキー or 数値。 */
async function dbGrantXp(accountId, reasonOrAmount) {
  if (!accountId || typeof db === 'undefined') return null;
  const amount = (typeof reasonOrAmount === 'number') ? reasonOrAmount : (XP_VALUES[reasonOrAmount] || 0);
  if (amount <= 0) return null;
  const row = await dbFetchLevel(accountId);
  const today = new Date().toISOString().slice(0, 10);
  const sameDay = row.daily_date === today;
  const dailyBase = sameDay ? row.daily_xp : 0;
  const room = Math.max(0, DAILY_XP_CAP - dailyBase);
  const grant = Math.min(amount, room);
  if (grant <= 0) return { ...row, capped: true }; // 本日上限
  const maxXp = XP_PER_LEVEL * LEVEL_MAX - 1;        // 9999(Lv.100到達・自動プレステージはしない)
  const newXp = Math.min(maxXp, (row.xp || 0) + grant);
  const firstToday = !sameDay;                       // 本日初XP → 活動日+1
  const rec = {
    account_id : accountId,
    xp         : newXp,
    prestige   : row.prestige || 1,
    total_xp   : (row.total_xp || 0) + grant,
    daily_xp   : dailyBase + grant,
    daily_date : today,
    active_days: (row.active_days || 0) + (firstToday ? 1 : 0),
    updated_at : new Date().toISOString(),
  };
  try {
    await db.from('account_levels').upsert(rec, { onConflict: 'account_id' });
    _levelCache[accountId] = { prestige: rec.prestige, xp: rec.xp, level: _levelFromXp(rec.xp) };
  } catch (e) { return null; }
  return rec;
}

/** プレステージ(ユーザー選択)。Lv.100 のときのみ段+1・Lv.1へ。 */
async function dbPrestige(accountId) {
  if (!accountId || typeof db === 'undefined') return false;
  const row = await dbFetchLevel(accountId);
  if (!_isMaxLevel(row.xp)) return false;
  const rec = {
    account_id : accountId,
    xp         : 0,
    prestige   : (row.prestige || 1) + 1,
    total_xp   : row.total_xp || 0,
    daily_xp   : row.daily_xp || 0,
    daily_date : row.daily_date,
    active_days: row.active_days || 0,
    updated_at : new Date().toISOString(),
  };
  try {
    await db.from('account_levels').upsert(rec, { onConflict: 'account_id' });
    _levelCache[accountId] = { prestige: rec.prestige, xp: 0, level: 1 };
  } catch (e) { return false; }
  return true;
}

/** ランキング加重(信頼度補正済み)を投稿に加算/減算。kind: 'like' | 'save' */
async function dbAddWeighted(postId, kind, weight) {
  if (!postId || !weight || typeof db === 'undefined') return;
  const col = (kind === 'save') ? 'weighted_saves' : 'weighted_likes';
  try {
    const { data } = await db.from('posts').select(col).eq('id', postId).maybeSingle();
    const next = Math.max(0, (data && data[col] || 0) + weight);
    const upd = {}; upd[col] = next;
    await db.from('posts').update(upd).eq('id', postId);
  } catch (e) { /* 列未追加(sql未実行)等は静かに無視 */ }
}

/** マイページ: 自分のレベル(宝石＋Lv)＋プレステージ案内を描画。
 *  ※ マイページのアバターにはカメラ/バッジ申請ボタンがあるので、
 *    アバターに重ねず「名前の下」に表示する(ボタンを隠さない)。 */
async function renderMyLevelUI() {
  const aid = (typeof localStorage !== 'undefined') && localStorage.getItem('trendy_account_id');
  if (!aid) return;
  const row = await dbFetchLevel(aid);
  _levelCache[aid] = { prestige: row.prestige, xp: row.xp, level: _levelFromXp(row.xp) };
  // 名前の下のホスト
  const nameEl = document.getElementById('mypage-profile-name');
  let host = document.getElementById('mypage-prestige');
  if (!host && nameEl && nameEl.parentElement) {
    host = document.createElement('div');
    host.id = 'mypage-prestige';
    host.style.cssText = 'margin-top:8px;display:flex;flex-direction:column;gap:6px;align-items:flex-start';
    nameEl.parentElement.insertBefore(host, nameEl.nextSibling);
  }
  if (!host) return;
  const cur = _gemFor(row.prestige);
  const badge = levelBadgeHtml({ prestige: row.prestige, xp: row.xp }, 72); // lg 表示
  let html = `<div style="display:flex;align-items:center;gap:8px">${badge}<span style="font-size:12px;color:var(--text3);font-weight:700">${cur.name}</span></div>`;
  if (_isMaxLevel(row.xp)) {
    const nxt = _gemFor((row.prestige || 1) + 1);
    html += `<div><button class="btn-sm" onclick="promptPrestige()" style="border:1px solid var(--accent);color:var(--accent-text)"><i class="ti ti-diamond"></i> プレステージする</button>` +
            `<span style="font-size:11px;color:var(--text3);margin-left:6px">Lv.100到達！次は <b>${nxt.name || '—'}</b>。今のまま留まってもOK</span></div>`;
  }
  host.style.display = '';
  host.innerHTML = html;
}

/** プレステージ実行(確認つき)。 */
async function promptPrestige() {
  const aid = (typeof localStorage !== 'undefined') && localStorage.getItem('trendy_account_id');
  if (!aid) return;
  const row = await dbFetchLevel(aid);
  if (!_isMaxLevel(row.xp)) { if (typeof showToast === 'function') showToast('Lv.100でプレステージできます', 'warn'); return; }
  const nxt = _gemFor((row.prestige || 1) + 1);
  if (!confirm(`プレステージしますか？\n宝石が「${nxt.name}」に変わり、レベルは1に戻ります。\n(今の宝石のまま留まりたい場合はキャンセル)`)) return;
  const ok = await dbPrestige(aid);
  if (ok) { if (typeof showToast === 'function') showToast('プレステージ！宝石が次の段へ 💎', 'success'); renderMyLevelUI(); }
  else { if (typeof showToast === 'function') showToast('まだプレステージできません', 'warn'); }
}

/** ログインXP: 1日1回だけ付与(localStorageで当日判定)。 */
async function grantLoginXpOncePerDay() {
  const aid = (typeof localStorage !== 'undefined') && localStorage.getItem('trendy_account_id');
  if (!aid || !localStorage.getItem('trendy_logged_in')) return;
  const today = new Date().toISOString().slice(0, 10);
  const key = 'trendy_login_xp_date';
  if (localStorage.getItem(key) === today) return;
  localStorage.setItem(key, today);
  try { await dbGrantXp(aid, 'login'); } catch (e) {}
}
// ログイン済みなら読み込み後に1回だけ
if (typeof window !== 'undefined') {
  window.addEventListener('load', function () { setTimeout(function () { try { grantLoginXpOncePerDay(); } catch (e) {} }, 2500); });
}

/** actor(いいね/保存した人)の信頼度加重を返す。プロフィール(created_at,tier)＋活動日から算出。 */
async function actorTrustWeight(accountId) {
  if (!accountId || typeof db === 'undefined') return 0;
  try {
    const [{ data: prof }, lvl] = await Promise.all([
      db.from('profiles').select('created_at,account_tier').eq('account_id', accountId).maybeSingle(),
      dbFetchLevel(accountId),
    ]);
    const trust = _accountTrust({
      ageDays  : _daysSince(prof && prof.created_at),
      activeDays: lvl.active_days || 0,
      tier     : (prof && prof.account_tier) || 'general',
    });
    return _trustWeight(trust);
  } catch (e) { return 0; }
}
