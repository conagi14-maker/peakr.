// ══════════════════════════════════════════════════════════════
// 投稿管理ページ（自分の投稿の一覧・成績確認・削除）
//   ・成績: いいね / お気に入り / 閲覧 / ランキングスコア
//   ・並び替え: 新着・いいね・お気に入り・閲覧・スコア
//   ・絞り込み: カテゴリー / メディア種別
//   ・削除: 1件ずつ（確認ダイアログあり）
// 依存: db(supabase-client.js), _dbPostToTweet(app-core.js), CATS_DATA(data.js)
// ══════════════════════════════════════════════════════════════

let _myPostsCache = [];   // 取得済みの自分の投稿（tweet形式）
let _myPostsLoading = false;

function _mpEsc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** マイページの「投稿管理」から遷移したときに呼ぶ（一覧を取得して描画） */
async function loadMyPostsPage() {
  const listEl = document.getElementById('myposts-list');
  if (!listEl) return;
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) { listEl.innerHTML = '<div class="myposts-empty">ログインが必要です</div>'; return; }
  if (_myPostsLoading) return;
  _myPostsLoading = true;
  listEl.innerHTML = '<div class="myposts-empty"><i class="ti ti-loader-2"></i> 読み込み中…</div>';

  // カテゴリー絞り込みの選択肢を用意（初回のみ）
  const catSel = document.getElementById('myposts-cat');
  if (catSel && !catSel.options.length && typeof CATS_DATA !== 'undefined') {
    catSel.innerHTML = '<option value="all">全カテゴリー</option>' +
      CATS_DATA.filter(c => c.id !== 'all').map(c => `<option value="${c.id}">${_mpEsc(c.name)}</option>`).join('');
  }

  try {
    // 自分の投稿（メイン/サブ両方の handle を対象にする）
    const handles = ['@' + aid];
    if (typeof subAccountHandle !== 'undefined' && subAccountHandle) handles.push(subAccountHandle);
    const { data, error } = await db.from('posts')
      .select('*')
      .in('user_handle', handles)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    _myPostsCache = (data || []).map(p => {
      const t = (typeof _dbPostToTweet === 'function') ? _dbPostToTweet(p) : { db_id: p.id };
      // 生の値も保持（成績表示用）
      t._raw = p;
      return t;
    });
  } catch (e) {
    console.warn('[投稿管理] 取得エラー:', e && e.message);
    listEl.innerHTML = '<div class="myposts-empty">投稿の取得に失敗しました</div>';
    _myPostsLoading = false;
    return;
  }
  _myPostsLoading = false;
  renderMyPostsPage();
}

/** 現在の並び替え・絞り込みで一覧を描画 */
function renderMyPostsPage() {
  const listEl = document.getElementById('myposts-list');
  if (!listEl) return;
  const sort  = (document.getElementById('myposts-sort')  || {}).value || 'new';
  const cat   = (document.getElementById('myposts-cat')   || {}).value || 'all';
  const media = (document.getElementById('myposts-media') || {}).value || 'all';

  let rows = [..._myPostsCache];
  if (cat !== 'all')   rows = rows.filter(t => (t._raw.cat_id || '') === cat);
  if (media === 'image') rows = rows.filter(t => t._raw.media_type === 'image');
  if (media === 'video') rows = rows.filter(t => t._raw.media_type === 'video');
  if (media === 'text')  rows = rows.filter(t => t._raw.media_type !== 'image' && t._raw.media_type !== 'video');

  const num = (v) => Number(v || 0);
  if (sort === 'likes')  rows.sort((a, b) => num(b._raw.likes_count) - num(a._raw.likes_count));
  if (sort === 'saves')  rows.sort((a, b) => num(b._raw.saved_count) - num(a._raw.saved_count));
  if (sort === 'views')  rows.sort((a, b) => num(b._raw.views_count) - num(a._raw.views_count));
  if (sort === 'score')  rows.sort((a, b) => num(b.score) - num(a.score));
  if (sort === 'new')    rows.sort((a, b) => new Date(b._raw.created_at) - new Date(a._raw.created_at));

  // サマリー
  const sum = document.getElementById('myposts-summary');
  if (sum) {
    const tl = _myPostsCache.reduce((s, t) => s + num(t._raw.likes_count), 0);
    const ts = _myPostsCache.reduce((s, t) => s + num(t._raw.saved_count), 0);
    const tv = _myPostsCache.reduce((s, t) => s + num(t._raw.views_count), 0);
    sum.innerHTML =
      `<div class="mps-item"><span class="mps-n">${_myPostsCache.length}</span><span class="mps-l">投稿</span></div>` +
      `<div class="mps-item"><span class="mps-n">${tl.toLocaleString()}</span><span class="mps-l">いいね</span></div>` +
      `<div class="mps-item"><span class="mps-n">${ts.toLocaleString()}</span><span class="mps-l">お気に入り</span></div>` +
      `<div class="mps-item"><span class="mps-n">${tv.toLocaleString()}</span><span class="mps-l">閲覧</span></div>`;
  }

  if (!rows.length) {
    listEl.innerHTML = `<div class="myposts-empty"><i class="ti ti-mood-empty" style="font-size:32px;display:block;margin-bottom:8px"></i>${_myPostsCache.length ? '条件に一致する投稿がありません' : 'まだ投稿がありません'}</div>`;
    return;
  }
  listEl.innerHTML = rows.map(t => _myPostRow(t)).join('');
}

function _myPostRow(t) {
  const p = t._raw;
  const d = new Date(p.created_at);
  const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  const catName = (typeof CATS_DATA !== 'undefined' && (CATS_DATA.find(c => c.id === p.cat_id) || {}).name) || '未分類';
  // サムネ（複数画像はJSON配列で入るため先頭を使う）
  let thumb = '';
  const md = p.media_data;
  if (md && p.media_type === 'image') {
    let src = md;
    if (typeof md === 'string' && md.trim().startsWith('[')) {
      try { src = (JSON.parse(md) || [])[0] || ''; } catch (e) { src = ''; }
    }
    if (src) thumb = `<div class="mp-thumb"><img src="${src}" alt=""></div>`;
  } else if (p.media_type === 'video') {
    thumb = `<div class="mp-thumb mp-thumb-ph"><i class="ti ti-video"></i></div>`;
  }
  const text = _mpEsc((p.content || '').slice(0, 80)) || '<span style="color:var(--text3)">（本文なし）</span>';
  const isSub = p.is_sub ? '<span class="mp-sub">サブ</span>' : '';
  return `<div class="mp-row" data-post="${p.id}">
    ${thumb || '<div class="mp-thumb mp-thumb-ph"><i class="ti ti-align-left"></i></div>'}
    <div class="mp-main">
      <div class="mp-meta">${date} ・ ${_mpEsc(catName)} ${isSub}</div>
      <div class="mp-text">${text}</div>
      <div class="mp-stats">
        <span title="いいね"><i class="ti ti-heart"></i> ${Number(p.likes_count || 0).toLocaleString()}</span>
        <span title="お気に入り"><i class="ti ti-star"></i> ${Number(p.saved_count || 0).toLocaleString()}</span>
        <span title="閲覧"><i class="ti ti-eye"></i> ${Number(p.views_count || 0).toLocaleString()}</span>
        <span title="ランキングスコア" class="mp-score"><i class="ti ti-flame"></i> ${Number(t.score || 0).toLocaleString()}</span>
      </div>
    </div>
    <button class="mp-del" onclick="deleteMyPost('${p.id}')" title="この投稿を削除"><i class="ti ti-trash"></i></button>
  </div>`;
}

/** 1件削除（アプリ内の確認モーダル → 実削除）
 *  ※ ネイティブ confirm() は環境(iframe/サンドボックス/ブラウザ設定)で
 *    抑止され押せないことがあるため、自前のモーダルで確認する。 */
function deleteMyPost(postId) {
  if (!postId) return;
  const t = _myPostsCache.find(x => String(x._raw.id) === String(postId));
  const preview = t ? _mpEsc((t._raw.content || '').slice(0, 40)) : '';
  document.getElementById('mp-confirm')?.remove();
  const html = `
    <div id="mp-confirm" class="mp-confirm-overlay" onclick="if(event.target===this)closeMyPostConfirm()">
      <div class="mp-confirm-box" role="dialog" aria-modal="true">
        <div class="mp-confirm-title"><i class="ti ti-trash" style="color:#ef4444"></i> この投稿を削除しますか？</div>
        ${preview ? `<div class="mp-confirm-preview">「${preview}」</div>` : ''}
        <div class="mp-confirm-note">この操作は取り消せません。</div>
        <div class="mp-confirm-actions">
          <button class="mp-confirm-cancel" onclick="closeMyPostConfirm()">キャンセル</button>
          <button class="mp-confirm-ok" onclick="confirmDeleteMyPost('${postId}')">削除する</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeMyPostConfirm() {
  document.getElementById('mp-confirm')?.remove();
}

/** 確認モーダルで「削除する」を押したときの実処理 */
async function confirmDeleteMyPost(postId) {
  closeMyPostConfirm();
  if (!postId) return;
  const ok = (typeof dbDeletePost === 'function') ? await dbDeletePost(postId) : false;
  if (!ok) { if (typeof showToast === 'function') showToast('削除に失敗しました', 'error'); return; }
  _myPostsCache = _myPostsCache.filter(x => String(x._raw.id) !== String(postId));
  renderMyPostsPage();
  if (typeof showToast === 'function') showToast('投稿を削除しました', 'info');
}
