// ── State ──────────────────────────────────────────────
let catVisible = {};
let catOrder = CATS_DATA.filter(c => c.id !== 'all').map(c => c.id);
let catColWidth = 200;
let catSelSubs = {};
let catGridMode = 'main';   // 'main' | 'sub'
let catGridParent = null;   // cat object when in sub mode
let bookmarks = [];

let rankPeriod = 'daily';
let rankCat = 'all';
let rankTweets = [];
let rankOffset = 0;

// ── おすすめページ状態 ──
const homeMediaFilters = new Set(); // 選択中のコンテンツタイプ（空 = すべて）
let RECOMMEND_TWEETS = [];        // おすすめフィード用バッファ
let recommendLoaded = 0;
let recommendLoading = false;

let fsCat = null;
let fsSub = '全体';
let fsMode = 'ranking';
let fsOffset = 0;
let fsTweets = [];

let pendingAi = 'none';
let pendingAdImg = null;   // 広告作成時の一時画像データ
let pendingMedia = null;   // 投稿添付メディア { data: base64url, type: 'image'|'video' }
let pendingCatId = null;   // 選択中のメインカテゴリーID
let pendingTags  = [];     // 入力済みタグ配列（例: ['#イラスト', '#ファンアート']）
const catSubStats = {};    // { [catId]: { [tagName]: { count, likes, score } } }
let adAccountType = 'main'; // 広告出稿に使うアカウント 'main' | 'sub'
let myAccountType = 'main'; // 'main' | 'sub'
let hasSubAccount = false;
let subAccountName = '匿名ユーザー';
let subAccountHandle = '@anon_you';
let currentUserHandle = null;
let userPostFilter = 'all';
let prevPageId = 'home';
let replyTargetIdx = null;
const tweetReplies = {};
let myBio = '';
let myNickname = localStorage.getItem('trendy_myName') || 'あなた'; // ニックネーム
let myHandle   = '@' + (localStorage.getItem('trendy_account_id') || 'you'); // メインハンドル
let myNameTag = ''; // 名前タグ（例: ＠6/12新曲リリース）
let isDeveloper = localStorage.getItem('trendy_isDev') === 'true'; // 開発者アカウント
let myUserId = localStorage.getItem('trendy_userId') || _genUserId();
function _genUserId() {
  const rand = crypto.randomUUID ? crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase()
    : Math.random().toString(36).slice(2,10).toUpperCase();
  const id = 'TRD-' + rand;
  localStorage.setItem('trendy_userId', id);
  return id;
}
// ── App Brand ──────────────────────────────────────────
let appName = localStorage.getItem('trendy_app_name') || 'Trendy';
let appIcon = localStorage.getItem('trendy_app_icon') || null; // base64 data URL

function _applyAppBrand() {
  const name  = appName || 'Trendy';
  const first = name[0].toUpperCase();
  // サービス名テキスト
  document.querySelectorAll('.logo-text').forEach(el => el.textContent = name);
  document.querySelectorAll('.welcome-title-text').forEach(el => el.textContent = name);
  const heroName = document.getElementById('reg-hero-app-name');
  if (heroName) heroName.textContent = name + 'へようこそ';
  document.title = name + ' — カテゴリートレンドSNS';
  // アイコン（ロゴマーク／ヒーローアイコン）
  const iconSelectors = ['.logo-mark','#reg-hero-icon','#login-hero-icon','.welcome-logo-wrap'];
  iconSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (appIcon) {
        el.innerHTML = `<img src="${appIcon}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block">`;
      } else {
        el.innerHTML = first;
      }
    });
  });
}

let favorites = new Set();
const likedTweets = new Set();     // 表示中ツイートのidx単位
const likedDbIds  = new Set();     // Supabase db_id単位（永続化）
const viewedPostIds = new Set();   // セッション内閲覧済み（重複カウント防止）

// ── 閲覧数カウント：画面に表示されたら自動カウント ────────────
let _viewObserver = null;
let _viewMutObs   = null;
let _viewObsTimer = null;

/** data-db-id 付きの未観測カードを IntersectionObserver に登録 */
function _observeCards() {
  if (!_viewObserver) return;
  document.querySelectorAll('[data-db-id]:not([data-vo])').forEach(el => {
    const dbId = el.dataset.dbId;
    if (!dbId) return;
    el.dataset.vo = '1';                    // 登録済みマーク
    if (!viewedPostIds.has(dbId)) _viewObserver.observe(el);
  });
}

/** IntersectionObserver 初期化（DOMContentLoaded 後に1回だけ実行） */
function _initViewObserver() {
  if (_viewObserver) return;

  // 50% 以上表示されたらカウント（アカウントごとに1回のみ）
  _viewObserver = new IntersectionObserver(entries => {
    const aid = localStorage.getItem('trendy_account_id');
    if (!aid) return; // 未ログインはカウントしない
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const dbId = el.dataset.dbId;
      if (!dbId) return;
      _viewObserver.unobserve(el);
      if (viewedPostIds.has(dbId)) return;   // このアカウントで既閲覧
      viewedPostIds.add(dbId);
      // ローカル _tc の views を +1
      const t = _tc.find(x => String(x.db_id) === dbId);
      if (t) t.views = (t.views || 0) + 1;
      // Supabase へ送信（DB側でも重複防止）
      if (typeof dbIncrementView === 'function') dbIncrementView(dbId, aid);
      // 推しレベル更新（投稿者が判明していれば）
      if (t && t.user && t.user.h && typeof dbUpdateFanLevel === 'function') {
        const authorId = t.user.h.startsWith('@') ? t.user.h.slice(1) : t.user.h;
        dbUpdateFanLevel(aid, authorId, 'view', 1);
      }
    });
  }, { threshold: 0.5 });

  // DOM に新カードが追加されたら自動的に observe
  _viewMutObs = new MutationObserver(() => {
    clearTimeout(_viewObsTimer);
    _viewObsTimer = setTimeout(_observeCards, 60);
  });
  _viewMutObs.observe(document.body, { childList: true, subtree: true });
  _observeCards(); // 初期ページのカードをすぐに登録
}
const retweetedTweets = new Set();
const followingSet = new Set(FOLLOWS.map(u => u.h));
let myFollowingHandles = []; // Supabase から読み込んだフォロー中ハンドル（'@id' 形式）
const _tc = []; // tweet cache for detail modal
function _reg(t) {
  _tc.push(t);
  const idx = _tc.length - 1;
  // Supabase から読み込んだいいね済み状態を復元
  if (t.db_id && likedDbIds.has(String(t.db_id))) likedTweets.add(idx);
  return idx;
}
let homeLoaded = 0;
const HOME_TWEETS = [];
const myPosts = []; // 自分の投稿を保存する配列

// ── Test Mode State ────────────────────────────────────
let testDummyUsers = [];   // ダミーユーザーリスト
let testActiveUser = null; // 現在操作中のダミーユーザー（nullなら自分）
let testDummyCounter = 0;
let useDummyData = localStorage.getItem('trendy_dummy_mode') === 'true'; // デフォルトOFF
const TEST_COLORS = [
  {bg:'#dbeafe',tc:'#1e40af'},{bg:'#d1fae5',tc:'#065f46'},{bg:'#ede9fe',tc:'#5b21b6'},
  {bg:'#fce7f3',tc:'#be185d'},{bg:'#fef3c7',tc:'#92400e'},{bg:'#fee2e2',tc:'#991b1b'},
  {bg:'#e0f2fe',tc:'#0369a1'},{bg:'#f0fdf4',tc:'#166534'},
];

CATS_DATA.forEach(c => { catVisible[c.id] = true; catSelSubs[c.id] = '全体'; });

// ── Helpers ────────────────────────────────────────────
const fmt = n => Number(n).toLocaleString();
const rc = r => r===1?'r1':r===2?'r2':r===3?'r3':'rn';
const aiLabel = {'none':'AI未使用','part':'AI補助','full':'AIのみ'};
const aiCls   = {'none':'ai-none','part':'ai-part','full':'ai-full'};

function aiBadge(ai) {
  return `<span class="ai-badge ${aiCls[ai]}">${aiLabel[ai]}</span>`;
}
function subBadge() {
  return `<span class="badge-sub"><i class="ti ti-user-question" style="font-size:9px;vertical-align:-1px"></i> サブ</span>`;
}
function prevBadge(p) {
  if (p === '初登場') return `<span class="prev-new">初登場</span>`;
  if (p.startsWith('↑')) return `<span class="prev-up">${p}</span>`;
  if (p.startsWith('↓')) return `<span class="prev-down">${p}</span>`;
  return `<span class="prev-same">${p}</span>`;
}
function favStar(rank) {
  const on = favorites.has(rank);
  return `<button class="action-btn${on?' faved':''}" onclick="toggleFav(${rank},this)"><i class="ti ti-star"></i>${on?'登録済み':'お気に入り'}</button>`;
}
function fsFavBtn(rank) {
  const on = favorites.has(rank);
  return `<button class="fs-fav-btn${on?' on':''}" onclick="fsFavToggle(${rank},this)" title="お気に入り"><i class="ti ti-star"></i></button>`;
}

// ── Page Navigation ────────────────────────────────────
function goPage(id, btn) {
  const noTrack = ['user','acct-switch','register','sub-create','ads','test','profile-edit','welcome','login'];
  if (!noTrack.includes(id)) prevPageId = id;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const pg = document.getElementById('page-'+id);
  if (pg) pg.classList.add('active');
  if (btn) btn.classList.add('active');
  else {
    const nb = document.querySelector(`[data-page="${id}"]`);
    if (nb) nb.classList.add('active');
  }
  if (id === 'test')         renderTestPage();
  if (id === 'dev') renderDevPage();
  if (id === 'profile-edit') openProfileEdit();
  if (id === 'home')      _refreshHomeFeedFromDB();
  if (id === 'mypage')    { _refreshMypageStats(); loadUserFavorites(); _loadMypageSocialLinks(); }
  if (id === 'ranking')   { _loadRankData().then(() => { renderCatGrid(); renderAdStrip(); }); }
  if (id === 'recommend') _initRecommendPage();
  if (id === 'ads') renderAdsPage();
  if (id === 'feedback') renderFeedbackPage();
  if (id === 'follows') renderFollows();
  if (id === 'settings') renderCatSettings();
  if (id === 'acct-switch') renderAcctSwitch();
  if (id === 'notif') renderNotifs();
  if (id === 'register') { registerStep(1); }
  if (id === 'login')    { /* single-screen */ }
  if (id === 'sub-create') subCreateStep(1);
}

function pillActive(btn, groupId) {
  const parent = btn.closest('.header-pills') || document.getElementById(groupId);
  if (parent) parent.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ── Home Feed ──────────────────────────────────────────
function initHomeTweets() {
  for (let i = 0; i < 80; i++) {
    const cat = CATS_DATA[i % CATS_DATA.length];
    const t = genTweet(i+1, cat.id, 10);
    t.user = FOLLOWS[i % FOLLOWS.length];
    t.isDummy = true; // ダミーツイートの識別フラグ
    HOME_TWEETS.push(t);
  }
}

function homeTweetHTML(t) {
  const u = t.user;
  const idx = _reg(t);
  const replyCount = (tweetReplies[idx] || []).length;
  const isOwn = (u.h === myHandle || u.h === '@anon_you');
  const deleteBtn = isOwn && t.db_id
    ? `<button class="tweet-delete-btn" onclick="event.stopPropagation();deletePost('${t.db_id}')" title="削除"><i class="ti ti-trash"></i></button>`
    : '';
  return `<div class="tweet-card" data-db-id="${t.db_id||''}" data-local-id="${t._localId||''}">
    <div class="tweet-av clickable" style="background:${u.bg};color:${u.tc};overflow:hidden" onclick="openUserPage('${u.h}')">${u.av}</div>
    <div class="tweet-body">
      <div class="tweet-top">
        <span class="tweet-name clickable" onclick="openUserPage('${u.h}')">${u.sub ? '匿名ユーザー' : u.n}</span>
        ${u.nameTag ? `<span class="tweet-name-tag">＠${u.nameTag}</span>` : ''}
        <span class="tweet-handle">${u.h}</span>
        ${u.sub ? subBadge() : ''}
        ${aiBadge(t.ai)}
        <span class="tweet-time">${t.time}</span>
        ${deleteBtn}
      </div>
      <div class="tweet-clickable-body" onclick="openTweetDetail(${idx})">
        ${t.text ? `<div class="tweet-text">${t.text}</div>` : ''}
        ${t.mediaData ? (
          t.mediaType === 'image'
            ? `<div class="tweet-media"><img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" onclick="event.stopPropagation();openImageViewer(this.src)"></div>`
            : `<div class="tweet-media"><video src="${t.mediaData}" controls class="tweet-media-vid" preload="metadata"></video></div>`
        ) : ''}
      </div>
      <div class="tweet-actions">
        <button class="action-btn reply-btn" onclick="openTweetDetail(${idx})"><i class="ti ti-message-circle"></i><span id="reply-count-${idx}">${replyCount || ''}</span></button>
        <button class="action-btn like-btn${likedTweets.has(idx)?' liked':''}" onclick="toggleLike(${idx},this)"><i class="ti ti-heart"></i><span class="like-count">${fmt(t.likes)}</span></button>
        <button class="action-btn"><i class="ti ti-eye"></i>${fmt(t.views)}</button>
        ${favStar(t.rank)}
      </div>
    </div>
  </div>`;
}

function loadHomeMore() {
  const feed = document.getElementById('home-feed');
  // 空フィードの表示
  if (HOME_TWEETS.length === 0 && homeLoaded === 0) {
    feed.innerHTML = `<div class="feed-empty">
      <i class="ti ti-writing"></i>
      <p>まだ投稿がありません</p>
      <span>最初の投稿をしてみましょう！</span>
    </div>`;
    return;
  }
  // 空フィード表示を除去
  const emptyEl = feed.querySelector('.feed-empty');
  if (emptyEl) emptyEl.remove();

  const slice = HOME_TWEETS.slice(homeLoaded, homeLoaded + 12);
  slice.forEach(t => feed.insertAdjacentHTML('beforeend', homeTweetHTML(t)));
  homeLoaded += slice.length;
}

// ── おすすめページ初期化 ────────────────────────────────
function _initRecommendPage() {
  // ページを開くたびにリセットして読み込む
  RECOMMEND_TWEETS = [];
  recommendLoaded  = 0;
  homeMediaFilters.clear();
  document.querySelectorAll('.home-mf-pill').forEach(p => p.classList.remove('active'));
  const reel = document.getElementById('recommend-reel');
  if (reel) reel.innerHTML = '';
  requestAnimationFrame(() => {
    _fitReelHeight();
    _loadRecommendFeed(true);
  });
}

// リールの高さをページヘッダー＋フィルターバーの実測値に合わせる
function _fitReelHeight() {
  const reel   = document.getElementById('recommend-reel');
  if (!reel) return;
  const header = document.querySelector('#page-recommend .page-header');
  const filter = document.getElementById('home-media-filter');
  let offset = 0;
  if (header) offset += header.offsetHeight;
  if (filter) offset += filter.offsetHeight;
  reel.style.height = `calc(100svh - ${offset}px)`;
}

// おすすめフィードのコンテンツタイプ複数選択トグル
function toggleHomeMediaFilter(type, btn) {
  if (homeMediaFilters.has(type)) {
    homeMediaFilters.delete(type);
    if (btn) btn.classList.remove('active');
  } else {
    homeMediaFilters.add(type);
    if (btn) btn.classList.add('active');
  }
  // フィルターを変えたら再取得
  RECOMMEND_TWEETS = [];
  recommendLoaded = 0;
  const reel = document.getElementById('recommend-reel');
  if (reel) reel.innerHTML = '';
  _loadRecommendFeed(true);
}

// フィルターを全解除
function resetHomeMediaFilter() {
  homeMediaFilters.clear();
  document.querySelectorAll('.home-mf-pill').forEach(p => p.classList.remove('active'));
  RECOMMEND_TWEETS = [];
  recommendLoaded = 0;
  const reel = document.getElementById('recommend-reel');
  if (reel) reel.innerHTML = '';
  _loadRecommendFeed(true);
}

// おすすめフィードを Supabase から取得して表示
async function _loadRecommendFeed(reset = false) {
  if (recommendLoading) return;
  recommendLoading = true;
  const reel = document.getElementById('recommend-reel');
  if (!reel) { recommendLoading = false; return; }

  if (reset) {
    reel.innerHTML = `<div class="reel-empty"><i class="ti ti-loader" style="animation:spin 1s linear infinite;display:inline-block"></i><p>読み込み中...</p></div>`;
  }

  try {
    // Supabase から人気投稿を取得（フォロー関係なく全ユーザー）
    let query = db.from('posts').select('*').order('likes_count', { ascending: false }).limit(200);
    // コンテンツタイプ複数選択フィルター（空 = すべて表示）
    if (homeMediaFilters.size > 0) {
      const orParts = [];
      if (homeMediaFilters.has('text'))  orParts.push('media_type.eq.,media_type.is.null');
      if (homeMediaFilters.has('image')) orParts.push('media_type.eq.image');
      if (homeMediaFilters.has('video')) orParts.push('media_type.eq.video');
      if (orParts.length > 0) query = query.or(orParts.join(','));
    }

    const { data, error } = await query;
    if (error || !data) { recommendLoading = false; return; }

    // アバターを一括取得
    const accountIds = [...new Set(data.filter(p => p.user_handle?.startsWith('@') && !p.is_sub).map(p => p.user_handle.slice(1)))];
    const avatarMap = {};
    if (accountIds.length > 0) {
      const { data: profiles } = await db.from('profiles').select('account_id, avatar_data, name_tag').in('account_id', accountIds);
      (profiles || []).forEach(pr => {
        avatarMap['@' + pr.account_id] = {
          av     : pr.avatar_data ? `<img src="${pr.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : null,
          nameTag: pr.name_tag || null,
        };
      });
    }

    // ローカル形式に変換してシャッフル（人気上位に重みを持たせた準ランダム）
    const converted = data.map(p => {
      const prof    = avatarMap[p.user_handle] || {};
      const avImg   = p.is_sub ? null : prof.av;
      return {
        db_id    : p.id,
        catId    : p.cat_id    || null,
        text     : p.content,
        likes    : p.likes_count  || 0,
        rt       : p.rt_count     || 0,
        views    : p.views_count  || 0,
        time     : _relativeTime(p.created_at),
        ai       : p.ai_type      || 'none',
        mediaData: p.media_data   || null,
        mediaType: p.media_type   || null,
        tags     : Array.isArray(p.tags) ? p.tags : [],
        rank     : 0, isDummy: false,
        user: {
          h      : p.user_handle,
          n      : p.user_name,
          av     : avImg || (p.user_name || '?')[0].toUpperCase(),
          bg     : avImg ? 'transparent' : '#3b82f6',
          tc     : avImg ? 'transparent' : '#ffffff',
          sub    : p.is_sub,
          nameTag: p.name_tag || prof.nameTag || null,
        },
      };
    });

    // 上位50件を準ランダムシャッフル（Fisher-Yates の前半だけ）
    const pool = converted.slice(0, Math.min(150, converted.length));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    RECOMMEND_TWEETS = pool;
    recommendLoaded  = 0;

    const reel = document.getElementById('recommend-reel');
    if (reel) reel.innerHTML = '';
    _renderRecommendSlice();
    _initReelVideoObserver();
    _initReelInfiniteScroll();
  } catch(e) {
    console.error('[おすすめ] 取得エラー:', e);
  }
  recommendLoading = false;
}

// ── Reel helpers ───────────────────────────────────────

let _reelVideoObserver = null;

function _initReelVideoObserver() {
  if (_reelVideoObserver) _reelVideoObserver.disconnect();
  const reel = document.getElementById('recommend-reel');
  if (!reel) return;
  _reelVideoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target.querySelector('video');
      if (!video) return;
      if (entry.isIntersecting) {
        video.play().catch(() => {});
        entry.target.classList.remove('reel-paused');
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, { root: reel, threshold: 0.6 });
  reel.querySelectorAll('.reel-card--video').forEach(c => _reelVideoObserver.observe(c));
}

function _initReelInfiniteScroll() {
  const reel = document.getElementById('recommend-reel');
  if (!reel) return;
  reel.onscroll = () => {
    if (recommendLoaded >= RECOMMEND_TWEETS.length) return;
    const last = reel.querySelector('.reel-card:last-child');
    if (!last) return;
    const bottom = reel.getBoundingClientRect().bottom;
    const lastTop = last.getBoundingClientRect().top;
    if (lastTop < bottom + 400) _renderRecommendSlice();
  };
}

// ツイート配列をリールカードにグループ化
// 画像・動画 → 1枚ずつ、文字 → 5件ひとまとめ
function _groupReelCards(tweets) {
  const groups = [];
  let textBatch = [];
  for (const t of tweets) {
    const isImg   = t.mediaType === 'image';
    const isVideo = t.mediaType === 'video';
    if (isImg || isVideo) {
      if (textBatch.length) { groups.push({ type: 'text', items: textBatch }); textBatch = []; }
      groups.push({ type: t.mediaType, item: t });
    } else {
      textBatch.push(t);
      if (textBatch.length >= 5) { groups.push({ type: 'text', items: textBatch }); textBatch = []; }
    }
  }
  if (textBatch.length) groups.push({ type: 'text', items: textBatch });
  return groups;
}

function _reelAvWrap(u) {
  const avIsImg = typeof u.av === 'string' && u.av.startsWith('<img');
  if (avIsImg) return u.av;
  return `<div style="width:100%;height:100%;background:${u.bg||'#3b82f6'};color:${u.tc||'#fff'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;border-radius:50%">${u.av||'?'}</div>`;
}

function _reelMediaOverlay(t, idx) {
  const u = t.user || {};
  const liked = likedTweets.has(idx);
  return `
    <div class="reel-overlay">
      <div class="reel-overlay-author" onclick="event.stopPropagation();openUserPage('${u.h||''}')">
        <div class="reel-av">${_reelAvWrap(u)}</div>
        <div class="reel-author-info">
          <div class="reel-name">${u.n||''}</div>
          <div class="reel-handle">${u.nameTag ? '＠'+u.nameTag : (u.h||'')}</div>
        </div>
      </div>
      ${t.text ? `<div class="reel-caption">${t.text}</div>` : ''}
      <div class="reel-actions">
        <button class="reel-action-btn" onclick="event.stopPropagation();openTweetDetail(${idx})">
          <i class="ti ti-message-circle"></i>
          <span id="reel-rc-${idx}">${(tweetReplies[idx]||[]).length||0}</span>
        </button>
        <button class="reel-action-btn${liked?' reel-liked':''}" id="reel-like-${idx}" onclick="event.stopPropagation();_reelToggleLike(${idx})">
          <i class="ti ti-heart${liked?'-filled':''}"></i> <span id="reel-lc-${idx}">${fmt(t.likes)}</span>
        </button>
        <span class="reel-action-btn reel-stat">
          <i class="ti ti-eye"></i> ${fmt(t.views)}
        </span>
      </div>
    </div>`;
}

function _reelCardHTML(group) {
  if (group.type === 'image') {
    const t = group.item;
    const idx = _reg(t);
    return `<div class="reel-card reel-card--image" data-idx="${idx}" data-db-id="${t.db_id||''}">
      <img class="reel-bg-blur" src="${t.mediaData}" aria-hidden="true">
      <img class="reel-main-img" src="${t.mediaData}" onclick="event.stopPropagation();openImageViewer(this.src)">
      ${_reelMediaOverlay(t, idx)}
    </div>`;
  }
  if (group.type === 'video') {
    const t = group.item;
    const idx = _reg(t);
    return `<div class="reel-card reel-card--video" data-idx="${idx}" data-db-id="${t.db_id||''}">
      <video class="reel-video" muted playsinline loop src="${t.mediaData}"></video>
      <div class="reel-video-tap" onclick="_reelVideoTap(this)"></div>
      <div class="reel-pause-icon"><i class="ti ti-player-pause-filled"></i></div>
      ${_reelMediaOverlay(t, idx)}
    </div>`;
  }
  if (group.type === 'text') {
    const html = group.items.map(t => {
      const u   = t.user || {};
      const idx = _reg(t);
      const avIsImg = typeof u.av === 'string' && u.av.startsWith('<img');
      const avStyle = avIsImg
        ? `width:32px;height:32px;border-radius:50%;overflow:hidden;flex-shrink:0`
        : `width:32px;height:32px;border-radius:50%;background:${u.bg||'#3b82f6'};color:${u.tc||'#fff'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0`;
      return `<div class="reel-text-item" data-db-id="${t.db_id||''}" onclick="openTweetDetail(${idx})">
        <div class="reel-text-author">
          <div style="${avStyle}">${u.av||'?'}</div>
          <div style="min-width:0">
            <span class="reel-text-name">${u.n||''}</span>
            <span class="reel-text-handle">${u.nameTag?'＠'+u.nameTag:(u.h||'')}</span>
          </div>
        </div>
        <div class="reel-text-content">${t.text||''}</div>
        <div class="reel-text-stats">
          <span><i class="ti ti-heart"></i> ${fmt(t.likes)}</span>
          <span><i class="ti ti-eye"></i> ${fmt(t.views)}</span>
        </div>
      </div>`;
    }).join('');
    return `<div class="reel-card reel-card--text"><div class="reel-text-list">${html}</div></div>`;
  }
  return '';
}

// 動画タップで一時停止／再生
function _reelVideoTap(tapDiv) {
  const card  = tapDiv.closest('.reel-card--video');
  if (!card) return;
  const video = card.querySelector('video');
  if (!video) return;
  if (video.paused) { video.play().catch(()=>{}); card.classList.remove('reel-paused'); }
  else              { video.pause(); card.classList.add('reel-paused'); }
}

// リール内いいねトグル
function _reelToggleLike(idx) {
  const t = _tc[idx];
  if (!t) return;
  const btn = document.getElementById(`reel-like-${idx}`);
  const lc  = document.getElementById(`reel-lc-${idx}`);
  const icon = btn?.querySelector('i');
  if (likedTweets.has(idx)) {
    likedTweets.delete(idx);
    t.likes = Math.max(0, (t.likes||0) - 1);
    if (btn) btn.classList.remove('reel-liked');
    if (icon) { icon.className = 'ti ti-heart'; }
  } else {
    likedTweets.add(idx);
    t.likes = (t.likes||0) + 1;
    if (btn) btn.classList.add('reel-liked');
    if (icon) { icon.className = 'ti ti-heart-filled'; icon.style.color = '#ef4444'; }
  }
  if (lc) lc.textContent = fmt(t.likes);
  // ホームフィードのカウントも更新
  const homeIcon = document.getElementById(`like-icon-${idx}`);
  const homeLc   = document.getElementById(`like-count-${idx}`);
  if (homeIcon) homeIcon.className = likedTweets.has(idx) ? 'ti ti-heart-filled' : 'ti ti-heart';
  if (homeLc)   homeLc.textContent = fmt(t.likes);
}

function _renderRecommendSlice() {
  const reel = document.getElementById('recommend-reel');
  if (!reel) return;
  if (RECOMMEND_TWEETS.length === 0) {
    reel.innerHTML = `<div class="reel-empty"><i class="ti ti-sparkles"></i><p>ダイブできる投稿がありません</p></div>`;
    return;
  }
  // 次の20件をカードに変換して追記
  const slice  = RECOMMEND_TWEETS.slice(recommendLoaded, recommendLoaded + 20);
  if (!slice.length) return;
  const groups = _groupReelCards(slice);
  const html   = groups.map(g => _reelCardHTML(g)).join('');
  reel.insertAdjacentHTML('beforeend', html);
  recommendLoaded += slice.length;
  // 新しく追加した動画カードも監視
  if (_reelVideoObserver) {
    reel.querySelectorAll('.reel-card--video').forEach(c => {
      if (!c.dataset.observed) { _reelVideoObserver.observe(c); c.dataset.observed = '1'; }
    });
  }
}

// ── Compose ────────────────────────────────────────────
function updateCompose() {
  const v = document.getElementById('compose-input').value;
  const cc = document.getElementById('char-count');
  cc.textContent = v.length + '/140';
  cc.className = 'char-count' + (v.length > 130 ? ' warn':'') + (v.length > 140 ? ' over':'');
  // テキストが空でもメディアがあれば投稿可能
  document.getElementById('post-btn').disabled = (v.length === 0 && !pendingMedia) || v.length > 140;
}
function doPost() {
  const v = document.getElementById('compose-input').value.trim();
  if (!v) return;
  pendingAi = 'none';
  document.querySelectorAll('.ai-choice-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.ai === 'none');
  });
  document.getElementById('confirm-tweet-preview').textContent = v;
  document.getElementById('post-confirm-overlay').classList.add('show');
  document.getElementById('post-confirm-modal').classList.add('show');
}

function selectAiChoice(btn) {
  pendingAi = btn.dataset.ai;
  confirmPost();
}

function confirmPost() {
  const v = document.getElementById('compose-input').value.trim();
  cancelPost();
  if (!v && !pendingMedia) return;
  const isSub = myAccountType === 'sub';
  // テストモード：ダミーユーザーとして投稿
  const postUser = testActiveUser
    ? { n: testActiveUser.n, h: testActiveUser.h, av: testActiveUser.av, bg: testActiveUser.bg, tc: testActiveUser.tc, sub: false, nameTag: null }
    : { n: isSub ? '匿名ユーザー' : (myNickname || 'あなた'), h: isSub ? '@anon_you' : myHandle, av: isSub ? '匿' : _myAvContent(), bg:'#dbeafe', tc:'#1e40af', sub: isSub, nameTag: isSub ? null : myNameTag || null };
  const t = {
    rank: 0,
    user: postUser,
    time: '今', text: v, likes: 0, rt: 0, views: 0, ai: pendingAi, prev:'初登場', score: 0,
    catId    : pendingCatId,
    tags     : [...pendingTags],
    // 添付メディア
    mediaData: pendingMedia ? pendingMedia.data : null,
    mediaType: pendingMedia ? pendingMedia.type : null,
  };
  // サブカテゴリー統計を記録（ランキング更新）
  if (pendingCatId && pendingTags.length) {
    recordCatSubStats(pendingCatId, pendingTags);
  }
  t._localId = `local_${Date.now()}`; // DOM追跡用の一時ID
  myPosts.unshift(t);       // 自分の投稿配列に追加（最新が先頭）
  HOME_TWEETS.unshift(t);   // ホームフィードにも追加
  document.getElementById('home-feed').insertAdjacentHTML('afterbegin', homeTweetHTML(t));
  // マイページ・ランキングに即反映
  renderMyPosts();
  renderMyRank();
  // ── リセット前に必要な値をキャプチャ ──────────────────────────────
  // ※ pendingMedia / pendingCatId / pendingTags はリセットブロックで
  //   null / [] になるため、DB保存に使う値を先に変数へ退避する
  const _mediaData  = pendingMedia ? pendingMedia.data : null;
  const _mediaType  = pendingMedia ? pendingMedia.type : null;
  const _catId      = pendingCatId || '';
  const _tags       = [...pendingTags];

  // ランキング入り通知（カテゴリー設定済み・自分アカウントのみ）
  if (_catId && !testActiveUser && !isSub) {
    setTimeout(() => checkRankingAndNotify(_catId), 1800);
  }
  // リセット
  document.getElementById('compose-input').value = '';
  pendingMedia = null;
  document.getElementById('compose-img-input').value = '';
  document.getElementById('compose-vid-input').value = '';
  document.getElementById('compose-media-preview').style.display = 'none';
  document.getElementById('compose-media-inner').innerHTML = '';
  resetComposeCat(); // カテゴリー・タグもリセット
  updateCompose();
  // Supabase に保存 → db_id が確定したら DOM と配列に反映
  dbSavePost({
    handle    : isSub ? '@anon_you' : myHandle,
    name      : isSub ? '匿名ユーザー' : (myNickname || 'あなた'),
    isSub,
    content   : v,
    aiType    : pendingAi,
    mediaData : _mediaData,
    mediaType : _mediaType,
    nameTag   : isSub ? '' : (myNameTag || ''),
    catId     : _catId,
    tags      : _tags,
  }).then(savedPost => {
    if (savedPost?.id) {
      t.db_id = savedPost.id;
      // DOM の data-db-id を更新（ホームフィード等）
      document.querySelectorAll(`[data-local-id="${t._localId}"]`).forEach(el => {
        el.setAttribute('data-db-id', savedPost.id);
        // 削除ボタンを注入
        const topEl = el.querySelector('.tweet-top');
        if (topEl && !topEl.querySelector('.tweet-delete-btn')) {
          topEl.insertAdjacentHTML('beforeend',
            `<button class="tweet-delete-btn" onclick="event.stopPropagation();deletePost('${savedPost.id}')" title="削除"><i class="ti ti-trash"></i></button>`
          );
        }
      });
      renderMyPosts();
    }
  });
}

function cancelPost() {
  document.getElementById('post-confirm-overlay').classList.remove('show');
  document.getElementById('post-confirm-modal').classList.remove('show');
}

// ── 投稿削除 ────────────────────────────────────────────────
async function deletePost(dbId) {
  if (!dbId) { showToast('投稿を保存中です。少し待ってからお試しください', 'info'); return; }
  if (!confirm('この投稿を削除しますか？\nこの操作は取り消せません。')) return;

  const ok = await dbDeletePost(dbId);
  if (!ok) { showToast('削除に失敗しました', 'error'); return; }

  // メモリ配列から除去
  const hIdx = HOME_TWEETS.findIndex(t => String(t.db_id) === String(dbId));
  if (hIdx !== -1) HOME_TWEETS.splice(hIdx, 1);
  const mIdx = myPosts.findIndex(t => String(t.db_id) === String(dbId));
  if (mIdx !== -1) myPosts.splice(mIdx, 1);

  // DOM から除去（ホーム・マイページ・ユーザーページ等すべて）
  document.querySelectorAll(`[data-db-id="${dbId}"]`).forEach(el => el.remove());

  // 関連ページを再描画
  renderMyPosts();
  renderMyRank();

  showToast('投稿を削除しました', 'success');
}

// ── Compose Media ──────────────────────────────────────
function handleComposeMedia(input, type) {
  const file = input.files && input.files[0];
  if (!file) return;

  // 動画は50MB、画像は10MBまで（デモ用の簡易チェック）
  const maxMB = type === 'video' ? 50 : 10;
  if (file.size > maxMB * 1024 * 1024) {
    showToast(`ファイルサイズが大きすぎます（最大${maxMB}MB）`, 'warn');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    pendingMedia = { data: e.target.result, type };
    const inner = document.getElementById('compose-media-inner');
    const preview = document.getElementById('compose-media-preview');
    if (type === 'image') {
      inner.innerHTML = `<img src="${pendingMedia.data}" alt="添付画像" class="compose-media-img">`;
    } else {
      inner.innerHTML = `<video src="${pendingMedia.data}" class="compose-media-vid" controls preload="metadata"></video>`;
    }
    preview.style.display = '';
    updateCompose();
  };
  reader.readAsDataURL(file);
}

function removeComposeMedia() {
  pendingMedia = null;
  document.getElementById('compose-img-input').value = '';
  document.getElementById('compose-vid-input').value = '';
  document.getElementById('compose-media-inner').innerHTML = '';
  document.getElementById('compose-media-preview').style.display = 'none';
  updateCompose();
}

// ── Ranking / Category Grid ────────────────────────────
// ランキングデータキャッシュ { period, data:[], fetchedAt }
let _rankCache = { period: null, data: [], fetchedAt: 0 };
const RANK_CACHE_TTL = 60000; // 1分キャッシュ

/** DB投稿をランキング用ツイートオブジェクトに変換 */
function _dbPostToTweet(p, avatarMap = {}, nameTagMap = {}) {
  const avImg   = avatarMap[p.user_handle];
  const nameTag = p.name_tag || nameTagMap[p.user_handle] || null;
  const score   = (p.likes_count || 0) * 10 + (p.rt_count || 0) * 5 + (p.views_count || 0);
  return {
    db_id    : p.id,
    catId    : p.cat_id   || null,
    text     : p.content,
    likes    : p.likes_count  || 0,
    rt       : p.rt_count     || 0,
    views    : p.views_count  || 0,
    time     : _relativeTime(p.created_at),
    ai       : p.ai_type      || 'none',
    mediaData: p.media_data   || null,
    mediaType: p.media_type   || null,
    tags     : Array.isArray(p.tags) ? p.tags : [],
    score,
    rank     : 0,
    prev     : '初登場',
    isDummy  : false,
    user     : {
      h      : p.user_handle,
      n      : p.user_name,
      av     : avImg || (p.user_name || p.user_handle?.slice(1) || '?')[0].toUpperCase(),
      bg     : '#3b82f6',
      tc     : '#ffffff',
      sub    : p.is_sub,
      nameTag,
    },
  };
}

/** ランキングデータをSupabaseから取得してキャッシュ */
async function _loadRankData(force = false) {
  const now = Date.now();
  if (!force && _rankCache.period === rankPeriod && (now - _rankCache.fetchedAt) < RANK_CACHE_TTL) return;

  const raw = await dbFetchRankedPosts({ period: rankPeriod, limit: 500 });

  // 登場するユーザーのアバター・名前タグを一括取得
  const accountIds = [...new Set(raw.filter(p => p.user_handle?.startsWith('@') && !p.is_sub).map(p => p.user_handle.slice(1)))];
  const avatarMap  = {};
  const nameTagMap = {};
  if (accountIds.length > 0) {
    const { data: profiles } = await db.from('profiles').select('account_id, avatar_data, name_tag').in('account_id', accountIds);
    (profiles || []).forEach(pr => {
      avatarMap['@' + pr.account_id] = pr.avatar_data
        ? `<img src="${pr.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : null;
      if (pr.name_tag) nameTagMap['@' + pr.account_id] = pr.name_tag;
    });
  }

  _rankCache = { period: rankPeriod, data: raw.map(p => _dbPostToTweet(p, avatarMap, nameTagMap)), fetchedAt: now };
}

/** （後方互換）同期呼び出し用スタブ → 非同期ロード後に再描画 */
function genRankTweets() {
  _loadRankData().then(() => { renderCatGrid(); });
}

function _catMiniTweets(tweets, bar, maxScore) {
  return tweets.map((t, i) => {
    const pct = Math.min(100, Math.round(t.score / maxScore * 100));
    const idx = _reg(t);
    // 実画像があればそれを表示、なければダミーのアイコンプレースホルダー
    const mediaThumb = t.mediaData
      ? (t.mediaType === 'image'
          ? `<div class="ctm-media-actual"><img src="${t.mediaData}" class="ctm-media-img" alt="画像"></div>`
          : `<div class="ctm-media-thumb ctm-thumb-video"><i class="ti ti-video"></i><span class="ctm-thumb-label">動画</span></div>`)
      : (t.media === 'image'
          ? `<div class="ctm-media-thumb ctm-thumb-image"><i class="ti ti-photo"></i></div>`
          : t.media === 'video'
          ? `<div class="ctm-media-thumb ctm-thumb-video"><i class="ti ti-video"></i><span class="ctm-thumb-label">動画</span></div>`
          : '');
    const u = t.user || {};
    const authorName = u.sub ? '匿名ユーザー' : (u.n || '');
    // アバター（画像 or 頭文字）
    const avIsImg = typeof u.av === 'string' && u.av.startsWith('<img');
    const avWrapStyle = avIsImg
      ? 'width:22px;height:22px;border-radius:50%;overflow:hidden;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;'
      : `width:22px;height:22px;border-radius:50%;overflow:hidden;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:${u.bg||'#3b82f6'};color:${u.tc||'#fff'};font-size:10px;font-weight:700;`;
    const avHtml = `<div style="${avWrapStyle}">${u.av || '?'}</div>`;
    return `<div class="cat-tweet-mini" data-db-id="${t.db_id||''}" onclick="openTweetDetail(${idx})">
      <div class="ctm-top">
        <span class="rank-badge-card ${rc(i+1)}">#${i+1}</span>
        ${prevBadge(t.prev)}
      </div>
      <div class="ctm-author" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
        <span onclick="event.stopPropagation();openUserPage('${u.h||''}')" style="cursor:pointer;display:inline-flex;align-items:center;gap:5px">
          ${avHtml}
          <span class="ctm-author-name">${authorName}</span>
        </span>
        ${u.nameTag ? `<span class="ctm-author-tag">＠${u.nameTag}</span>` : ''}
      </div>
      ${t.text ? `<div class="ctm-text">${t.text}</div>` : ''}
      ${mediaThumb}
      <div class="ctm-stats">
        <button class="ctm-comment-btn" onclick="event.stopPropagation();openTweetDetail(${idx})" title="コメント">
          <i class="ti ti-message-circle"></i><span id="reply-count-${idx}">${(tweetReplies[idx]||[]).length||''}</span>
        </button>
        <button class="ctm-like-btn${likedTweets.has(idx)?' liked':''}" onclick="event.stopPropagation();toggleLike(${idx},this)" title="いいね">
          <i class="ti ti-heart${likedTweets.has(idx)?'-filled':''}" style="${likedTweets.has(idx)?'color:#e11d48':''}"></i><span class="like-count">${fmt(t.likes)}</span>
        </button>
        <span class="ctm-stat"><i class="ti ti-eye"></i>${fmt(t.views)}</span>
      </div>
      <div class="score-bar"><div class="score-fill" style="width:${pct}%;background:${bar}"></div></div>
    </div>`;
  }).join('');
}

function renderCatGrid() {
  const grid = document.getElementById('cat-grid');
  const drillBar = document.getElementById('cat-drill-bar');

  if (catGridMode === 'sub' && catGridParent) {
    // ── サブカテゴリーモード ──
    drillBar.style.display = 'flex';
    document.getElementById('drill-title').innerHTML =
      `<i class="ti ${catGridParent.icon}" style="color:${catGridParent.color};font-size:13px;margin-right:4px"></i>${catGridParent.name} のサブカテゴリー`;

    // 表示するサブカテゴリー：定義済み ＋ 実投稿の上位タグをマージ
    const topRealTags = getTopSubTags(catGridParent.id, 8);
    const baseSubs = catGridParent.subs; // 定義済み（'全体'含む）
    const extraTags = topRealTags.filter(t => !baseSubs.includes(t.replace(/^#/, '')));
    const allSubs = [...baseSubs, ...extraTags.map(t => t.replace(/^#/, ''))];

    grid.style.gridTemplateColumns = `repeat(${allSubs.length}, ${catColWidth}px)`;
    grid.innerHTML = allSubs.map(subName => {
      const isAll = subName === '全体';
      const tag = '#' + subName;

      // ランキングキャッシュ or HOME_TWEETS からサブカテゴリー別に抽出
      const allPosts = _rankCache.data.length > 0 ? _rankCache.data
        : HOME_TWEETS.filter(t => !t.isDummy).map(t => ({ ...t, score: (t.likes||0)*10 + (t.rt||0)*5 + (t.views||0) }));

      const subFiltered = allPosts.filter(t =>
        t.catId === catGridParent.id &&
        (isAll ? true : (t.tags || []).includes(tag))
      );
      const tweets = subFiltered
        .sort((a, b) => (b.score - a.score) || (b.db_id > a.db_id ? -1 : 1))
        .slice(0, 10)
        .map((t, i) => ({ ...t, rank: i + 1, prev: '初登場' }));

      // 投稿がなければカード自体を非表示
      if (!tweets.length) return '';

      const maxScore = Math.max(...tweets.map(t=>t.score), 1);
      return `<div class="cat-card">
        <div class="cat-card-head" style="border-top:3px solid ${catGridParent.color};" onclick="openFS('${catGridParent.id}','${subName}')">
          <i class="ti ${catGridParent.icon}" style="color:${catGridParent.color};font-size:14px;flex-shrink:0"></i>
          <span class="cat-card-name">${subName}</span>
          <i class="ti ti-arrows-maximize cat-card-expand"></i>
        </div>
        ${_catMiniTweets(tweets, catGridParent.bar, maxScore)}
        <button class="cat-more-btn" onclick="openFS('${catGridParent.id}','${subName}')">もっと見る <i class="ti ti-arrows-maximize" style="font-size:11px;vertical-align:-1px"></i></button>
      </div>`;
    }).filter(Boolean).join('') || `<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;width:100%">
      <i class="ti ti-mood-empty" style="font-size:32px;display:block;margin-bottom:10px"></i>
      このカテゴリーにはまだ投稿がありません
    </div>`;

  } else {
    // ── メインカテゴリーモード ──
    drillBar.style.display = 'none';
    const allCat = CATS_DATA.find(c => c.id === 'all');
    const visibleCats = [
      ...(allCat ? [allCat] : []),
      ...catOrder.filter(id => catVisible[id]).map(id => CATS_DATA.find(c => c.id === id)).filter(Boolean)
    ];

    grid.style.gridTemplateColumns = `repeat(${visibleCats.length}, ${catColWidth}px)`;
    grid.innerHTML = visibleCats.map(cat => {
      const isAll = cat.id === 'all';
      const sub = catSelSubs[cat.id] || '全体';

        // ランキングキャッシュ or HOME_TWEETS からカテゴリー別に抽出
      const allPosts = _rankCache.data.length > 0 ? _rankCache.data
        : HOME_TWEETS.filter(t => !t.isDummy).map(t => ({ ...t, score: (t.likes||0)*10 + (t.rt||0)*5 + (t.views||0) }));

      const filtered = allPosts.filter(t => isAll ? true : t.catId === cat.id);
      const tweets = filtered
        .sort((a, b) => (b.score - a.score) || (b.db_id > a.db_id ? -1 : 1))
        .slice(0, 10)
        .map((t, i) => ({ ...t, rank: i + 1, prev: '初登場' }));

      if (!tweets.length) {
        return `<div class="cat-card" id="catcard-${cat.id}">
          <div class="cat-card-head" style="border-top:3px solid ${cat.color};">
            <i class="ti ${cat.icon}" style="color:${cat.color};font-size:14px;flex-shrink:0"></i>
            <span class="cat-card-name">${cat.name}</span>
          </div>
          <div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">
            <i class="ti ti-mood-empty" style="font-size:24px;display:block;margin-bottom:6px"></i>
            まだ投稿がありません
          </div>
        </div>`;
      }

      const maxScore = Math.max(...tweets.map(t=>t.score), 1);

      return `<div class="cat-card" id="catcard-${cat.id}">
        <div class="cat-card-head" style="border-top:3px solid ${cat.color};" onclick="${isAll ? `openFS('all','全体')` : `drillCat('${cat.id}')`}">
          <i class="ti ${cat.icon}" style="color:${cat.color};font-size:14px;flex-shrink:0"></i>
          <span class="cat-card-name">${cat.name}</span>
          <i class="ti ${isAll ? 'ti-arrows-maximize' : 'ti-chevron-right'} cat-card-expand"></i>
        </div>
        ${_catMiniTweets(tweets, cat.bar, maxScore)}
        <button class="cat-more-btn" onclick="${isAll ? `openFS('all','全体')` : `drillCat('${cat.id}')`}">
          ${isAll ? 'もっと見る <i class="ti ti-arrows-maximize" style="font-size:11px;vertical-align:-1px"></i>' : 'サブカテゴリーへ <i class="ti ti-chevron-right" style="font-size:11px;vertical-align:-1px"></i>'}
        </button>
      </div>`;
    }).join('');
  }

  renderBookmarkPanel();
}

function drillCat(catId) {
  const cat = CATS_DATA.find(c => c.id === catId);
  if (!cat) return;
  catGridMode = 'sub';
  catGridParent = cat;
  const sx = document.querySelector('.cat-grid-wrap .scroll-x');
  if (sx) sx.scrollLeft = 0;
  renderCatGrid();
  renderAdStrip(catId); // カテゴリー別広告に切り替え
}

function drillBack() {
  catGridMode = 'main';
  catGridParent = null;
  renderCatGrid();
  renderAdStrip('all'); // 全体広告に戻す
}

function setCatSub(e, catId, sub) {
  e.stopPropagation();
  catSelSubs[catId] = sub;
  renderCatGrid();
}

function updateCatWidth(v) {
  catColWidth = parseInt(v);
  const slider = document.getElementById('settings-width-slider');
  if (slider) slider.value = v;
  const val = document.getElementById('settings-width-val');
  if (val) val.textContent = v;
  renderCatGrid();
}

// ── Fullscreen Panel ───────────────────────────────────
async function openFS(catId, sub) {
  fsCat = CATS_DATA.find(c=>c.id===catId);
  fsSub = sub || '全体';
  fsMode = 'ranking';
  fsOffset = 0;
  document.getElementById('fs-overlay').classList.add('show');
  document.getElementById('fs-panel').classList.add('show');
  // ローディング表示
  const fsBody = document.getElementById('fs-body');
  if (fsBody) fsBody.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2)"><i class="ti ti-loader-2" style="font-size:28px"></i></div>';
  await genFsTweets();
  renderFS();
  const fsSubForAd = (fsSub && fsSub !== '全体') ? fsSub : null;
  renderFsAdStrip(fsCat ? fsCat.id : 'all', fsSubForAd);
}

function closeFS() {
  document.getElementById('fs-overlay').classList.remove('show');
  document.getElementById('fs-panel').classList.remove('show');
}

async function genFsTweets() {
  if (!fsCat) return;
  const isAll = fsSub === '全体';
  const tag   = '#' + fsSub;

  // Supabase から該当期間・カテゴリーの投稿を取得
  const raw = await dbFetchRankedPosts({
    period : rankPeriod,
    catId  : fsCat.id,
    subTag : isAll ? null : fsSub,
    mode   : fsMode,
    limit  : 500,
  });

  // アバター・名前タグを一括取得
  const accountIds = [...new Set(raw.filter(p => p.user_handle?.startsWith('@') && !p.is_sub).map(p => p.user_handle.slice(1)))];
  const avatarMap  = {};
  const nameTagMap = {};
  if (accountIds.length > 0) {
    const { data: profiles } = await db.from('profiles').select('account_id, avatar_data, name_tag').in('account_id', accountIds);
    (profiles || []).forEach(pr => {
      avatarMap['@' + pr.account_id] = pr.avatar_data
        ? `<img src="${pr.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : null;
      if (pr.name_tag) nameTagMap['@' + pr.account_id] = pr.name_tag;
    });
  }

  let tweets = raw.map(p => _dbPostToTweet(p, avatarMap, nameTagMap));

  // モード別ソート
  if (fsMode === 'new') {
    // already sorted by created_at desc from DB
  } else if (fsMode === 'rec') {
    tweets = tweets.map(t => ({ ...t, _rec: (t.score || 0) * (0.5 + Math.random()) }))
      .sort((a, b) => b._rec - a._rec);
  } else {
    tweets = tweets.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  fsTweets = tweets.map((t, i) => ({ ...t, rank: i + 1 }));
}

function renderFS() {
  if (!fsCat) return;

  document.getElementById('fs-icon').className = 'ti '+fsCat.icon;
  document.getElementById('fs-icon').style.color = fsCat.color;
  document.getElementById('fs-title').textContent = fsCat.name;
  document.getElementById('fs-region-label').textContent = '全国';

  // Bookmark button
  const isBm = bookmarks.includes(_bmKey());
  const bmLabel = (fsSub && fsSub !== '全体') ? `「${fsSub}」を登録` : 'お気に入り登録';
  const bmBtn = document.getElementById('fs-bm-btn');
  bmBtn.innerHTML = `<i class="ti ${isBm?'ti-bookmark-filled':'ti-bookmark'}"></i> ${isBm?'登録済み':bmLabel}`;
  bmBtn.className = 'bm-toggle-btn' + (isBm ? ' active' : '');

  // Mode bar
  document.querySelectorAll('.fs-mode-btn').forEach(b => {
    b.classList.remove('active');
    b.style.borderBottomColor = 'transparent';
    b.style.color = '';
  });
  const modeMap = {ranking:0, new:1, rec:2};
  const activeModeBtn = document.querySelectorAll('.fs-mode-btn')[modeMap[fsMode]];
  if (activeModeBtn) {
    activeModeBtn.classList.add('active');
    activeModeBtn.style.borderBottomColor = fsCat.color;
    activeModeBtn.style.color = fsCat.color;
  }

  // Sub bar：実ランキング上位タグ＋定義済みsubs をマージ
  const topRealTags = getTopSubTags(fsCat.id, 5).map(t => t.replace(/^#/, ''));
  const baseSubs    = fsCat.subs.filter(s => s !== '全体');
  const mergedSubs  = ['全体', ...new Set([...topRealTags, ...baseSubs])];
  document.getElementById('fs-sub-bar').innerHTML = mergedSubs.map(s =>
    `<button class="pill${s===fsSub?' active':''}" style="${s===fsSub?'background:'+fsCat.color+';border-color:'+fsCat.color+';':''}" onclick="setFsSub('${s}')">${s}</button>`
  ).join('');

  // Body
  fsOffset = 0;
  document.getElementById('fs-body').innerHTML = '';

  // Setup IntersectionObserver for auto-load
  if (window._fsObserver) window._fsObserver.disconnect();
  const fsBodyEl = document.getElementById('fs-body');
  window._fsObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && fsOffset < 3000 && !window._fsLoading) {
      window._fsLoading = true;
      loadFsMore();
      window._fsLoading = false;
    }
  }, { root: fsBodyEl, rootMargin: '120px' });

  renderFsChunk();

  // All subs
  document.getElementById('fs-allsubs-grid').innerHTML = fsCat.allSubs.map((s,i) => {
    const arrow = s.trend==='up' ? `<span class="prev-up"><i class="ti ti-arrow-up" style="font-size:11px"></i></span>` :
                  s.trend==='down' ? `<span class="prev-down"><i class="ti ti-arrow-down" style="font-size:11px"></i></span>` :
                  `<span class="prev-same"><i class="ti ti-minus" style="font-size:11px"></i></span>`;
    return `<button class="fs-sub-item" onclick="setFsSub('${s.name}')">
      <span class="fs-sub-rank">${i+1}</span>${s.name}${arrow}
    </button>`;
  }).join('');
}

function renderFsChunk(from) {
  if (from !== undefined) fsOffset = from;
  const body = document.getElementById('fs-body');
  if (fsOffset === 0) body.innerHTML = '';
  const slice = fsTweets.slice(fsOffset, fsOffset+20);
  const maxS = slice.length ? Math.max(...slice.map(t=>t.score)) : 1;
  slice.forEach(t => {
    const pct = Math.min(100, Math.round(t.score/maxS*100));
    const idx = _reg(t);
    // 実画像があれば表示、なければプレースホルダー
    const fsMediaThumb = t.mediaData
      ? (t.mediaType === 'image'
          ? `<div class="ctm-media-actual"><img src="${t.mediaData}" class="ctm-media-img" alt="画像"></div>`
          : `<div class="fs-media-thumb fs-thumb-video"><i class="ti ti-video"></i> 動画</div>`)
      : (t.media === 'image'
          ? `<div class="fs-media-thumb fs-thumb-image"><i class="ti ti-photo"></i> 画像</div>`
          : t.media === 'video'
          ? `<div class="fs-media-thumb fs-thumb-video"><i class="ti ti-video"></i> 動画</div>`
          : '');
    const u = t.user || {};
    body.insertAdjacentHTML('beforeend', `<div class="fs-tweet clickable" onclick="openUserPage('${u.h || ''}')">
      <div class="fs-tweet-top">
        <span class="rank-badge-card ${rc(t.rank)}">#${t.rank}</span>
        ${prevBadge(t.prev)}
        <span class="fs-tweet-user">${u.n ? (u.sub ? '匿名' : u.n) : u.h || ''}</span>
        <span class="fs-tweet-handle" style="font-size:10px;color:var(--text3)">${u.h || ''}</span>
        ${u.sub ? subBadge() : ''}
        <span class="fs-tweet-time">${t.time}</span>
      </div>
      ${t.text ? `<div class="fs-tweet-text">${t.text}</div>` : ''}
      ${fsMediaThumb}
      <div class="fs-tweet-stats" onclick="event.stopPropagation()">
        <span class="fs-stat"><i class="ti ti-heart"></i>${fmt(t.likes)}</span>
        <span class="fs-stat"><i class="ti ti-eye"></i>${fmt(t.views)}</span>
        ${fsFavBtn(t.rank)}
      </div>
      <div class="score-bar"><div class="score-fill" style="width:${pct}%;background:${fsCat.bar}"></div></div>
    </div>`);
  });
  fsOffset += slice.length;

  // Remove old sentinel then add new one
  const oldSentinel = document.getElementById('fs-sentinel');
  if (oldSentinel) oldSentinel.remove();
  if (fsOffset < 3000) {
    const sentinel = document.createElement('div');
    sentinel.id = 'fs-sentinel';
    sentinel.style.height = '1px';
    body.appendChild(sentinel);
    if (window._fsObserver) window._fsObserver.observe(sentinel);
  }

  const lm = document.getElementById('fs-load-more');
  if (fsOffset >= 3000) {
    lm.innerHTML = '<i class="ti ti-check"></i> 3,000位まで表示しました';
    lm.style.pointerEvents = 'none';
    lm.style.color = 'var(--text3)';
    lm.onclick = null;
  } else {
    lm.innerHTML = `<i class="ti ti-loader"></i> ${fsOffset}件 / 3,000件`;
    lm.style.pointerEvents = 'none';
    lm.style.color = 'var(--text3)';
    lm.onclick = null;
  }
}

function loadFsMore() { renderFsChunk(); }

function doFsJump() {
  const v = parseInt(document.getElementById('fs-jump-input').value);
  if (!v || v < 1 || v > 3000) return;
  const from = Math.max(0, v - 1);
  document.getElementById('fs-body').innerHTML = '';
  fsOffset = 0;
  renderFsChunk(from);
  document.getElementById('fs-jump-info').textContent = v + '位付近を表示中';
  document.getElementById('fs-body').scrollTop = 0;
}

async function setFsMode(mode, btn) {
  fsMode = mode;
  const fsBody = document.getElementById('fs-body');
  if (fsBody) fsBody.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2)"><i class="ti ti-loader-2" style="font-size:28px"></i></div>';
  await genFsTweets();
  renderFS();
}

async function setFsSub(sub) {
  fsSub = sub;
  const fsBody = document.getElementById('fs-body');
  if (fsBody) fsBody.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2)"><i class="ti ti-loader-2" style="font-size:28px"></i></div>';
  await genFsTweets();
  renderFS();
  renderFsAdStrip(fsCat ? fsCat.id : 'all', fsSub !== '全体' ? fsSub : null);
}

function _bmKey() {
  return (fsSub && fsSub !== '全体') ? `${fsCat.id}:${fsSub}` : fsCat.id;
}
function toggleFsCatBm() {
  const key = _bmKey();
  if (bookmarks.includes(key)) {
    bookmarks = bookmarks.filter(b => b !== key);
  } else {
    bookmarks.push(key);
  }
  renderFS();
  renderBookmarkPanel();
}

// ── Bookmark Panel ─────────────────────────────────────
function renderBookmarkPanel() {
  const list = document.getElementById('bm-list');
  list.innerHTML = bookmarks.map(key => {
    const [catId, subName] = key.split(':');
    const cat = CATS_DATA.find(c => c.id === catId);
    if (!cat) return '';
    const label = subName || cat.name;
    const short = label.length > 4 ? label.slice(0,4)+'…' : label;
    const clickFn = subName ? `openFS('${catId}','${subName}')` : `openFS('${catId}','全体')`;
    return `<div class="bm-icon" onclick="${clickFn}" title="${label}" style="border-color:${cat.color}40">
      <i class="ti ${cat.icon}" style="color:${cat.color}"></i>
      <span>${short}</span>
    </div>`;
  }).join('');
}

function openBmPicker() {
  const rem = CATS_DATA.filter(c => !bookmarks.includes(c.id));
  if (!rem.length) { alert('全カテゴリー登録済みです'); return; }
  if (confirm(`「${rem[0].name}」をお気に入りに追加しますか？`)) {
    bookmarks.push(rem[0].id);
    renderBookmarkPanel();
  }
}

// ── Ranking Period/Category ────────────────────────────
async function setRankPeriod(p, btn) {
  rankPeriod = p;
  pillActive(btn, 'rank-period-pills');
  _rankCache = { period: null, data: [], fetchedAt: 0 }; // キャッシュクリア
  await _loadRankData(true);
  renderCatGrid();
}

// ── Favorites ──────────────────────────────────────────
function toggleFav(rank, btn) {
  if (favorites.has(rank)) { favorites.delete(rank); btn.classList.remove('faved'); btn.innerHTML='<i class="ti ti-star"></i>お気に入り'; }
  else { favorites.add(rank); btn.classList.add('faved'); btn.innerHTML='<i class="ti ti-star"></i>登録済み'; }
  renderMyFavs();
}
function fsFavToggle(rank, btn) {
  if (favorites.has(rank)) { favorites.delete(rank); btn.classList.remove('on'); }
  else { favorites.add(rank); btn.classList.add('on'); }
  renderMyFavs();
}

// ── Notifications ──────────────────────────────────────
let notifActiveAcct = 'main'; // 'main' | 'sub'

// ── ランキング入り通知チェック（Supabase 実投稿数を使用）──
async function checkRankingAndNotify(catId) {
  if (!catId || catId === 'all') return;

  const cat = CATS_DATA.find(c => c.id === catId);
  if (!cat) return;

  try {
    // Supabase からそのカテゴリーの実際の投稿総数を取得
    const { count, error } = await db
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('cat_id', catId);

    if (error) { console.warn('[通知] カテゴリー投稿数取得エラー:', error.message); return; }

    // 新規投稿はいいね0なので一番下 → 順位 = 総投稿数（最低1位）
    const entryRank = Math.max(1, count || 1);

    // 1万位を超えていたら通知なし
    if (entryRank > 10000) return;

    // 通知オブジェクトを生成してNOTIFSの先頭に追加
    const notif = {
      icon  : 'ti-trophy',
      bg    : '#fef3c7',
      tc    : '#92400e',
      text  : `あなたの投稿が<b>${cat.name}</b>カテゴリーランキング<b>${entryRank.toLocaleString()}位</b>にランクインしました！`,
      hint  : 'タップして順位を確認 👆',
      time  : 'たった今',
      type  : 'rank',
      rank  : entryRank,
      cat   : cat.name,
      unread: true,
    };
    pushNotif(notif, 'main');
    showToast(`🏆 ${cat.name}ランキング ${entryRank.toLocaleString()}位にランクイン！`, 'success');

    // Supabaseにも保存して次回ロード時に残るようにする（非同期）
    const _aidForNotif = localStorage.getItem('trendy_account_id');
    dbSaveRankNotif(notif, _aidForNotif);
  } catch(e) {
    console.warn('[通知] ランキングチェックエラー:', e);
  }
}

// 通知をNOTIFS配列の先頭に追加してUI更新
function pushNotif(notif, acct = 'main') {
  const arr = acct === 'sub' ? NOTIFS_SUB : NOTIFS;
  arr.unshift(notif);
  renderNotifs();
}

// ランキング通知をSupabaseに保存（ユーザーごとに分離）
async function dbSaveRankNotif(notif, accountId = null) {
  if (!accountId) return; // ログインしていない場合は保存しない
  try {
    await db.from('notifications').insert({
      account_id   : accountId,
      account_type : 'main',
      icon         : notif.icon,
      bg           : notif.bg,
      tc           : notif.tc,
      text         : notif.text,
      hint         : notif.hint,
      notif_type   : 'rank',
      rank         : notif.rank,
      cat          : notif.cat,
      unread       : true,
    });
  } catch(e) {
    console.warn('[DB] 通知保存エラー:', e);
  }
}

function _notifArray(acct) {
  return acct === 'sub' ? NOTIFS_SUB : NOTIFS;
}

function renderNotifTabs() {
  const el = document.getElementById('notif-acct-tabs');
  if (!el) return;

  // サブアカがなければタブ非表示
  if (!hasSubAccount) { el.innerHTML = ''; return; }

  const mainUnread = NOTIFS.filter(n => n.unread).length;
  const subUnread  = NOTIFS_SUB.filter(n => n.unread).length;
  const subN  = subAccountName || '匿名ユーザー';
  const subAv = subN !== '匿名ユーザー' ? subN[0] : '匿';

  el.innerHTML = `
    <div class="notif-acct-tabs">
      <button class="notif-acct-tab${notifActiveAcct === 'main' ? ' active' : ''}" onclick="switchNotifAcct('main')">
        <div class="notif-tab-av" style="background:#dbeafe;color:#1e40af">あ</div>
        <div class="notif-tab-info">
          <span class="notif-tab-name">メインアカウント</span>
          <span class="notif-tab-handle">${myHandle}</span>
        </div>
        ${mainUnread ? `<span class="notif-tab-badge">${mainUnread}</span>` : ''}
      </button>
      <button class="notif-acct-tab${notifActiveAcct === 'sub' ? ' active' : ''}" onclick="switchNotifAcct('sub')">
        <div class="notif-tab-av" style="background:#ede9fe;color:#5b21b6">${subAv}</div>
        <div class="notif-tab-info">
          <span class="notif-tab-name">${subN}</span>
          <span class="notif-tab-handle">${subAccountHandle || '@anon_you'} <span class="badge-sub" style="font-size:9px;padding:1px 5px;vertical-align:1px"><i class="ti ti-user-question" style="font-size:8px"></i> サブ</span></span>
        </div>
        ${subUnread ? `<span class="notif-tab-badge">${subUnread}</span>` : ''}
      </button>
    </div>`;
}

function switchNotifAcct(acct) {
  notifActiveAcct = acct;
  renderNotifTabs();
  renderNotifList();
}

function renderNotifList() {
  const arr = _notifArray(notifActiveAcct);
  const el = document.getElementById('notif-list');
  if (!el) return;

  if (arr.length === 0) {
    el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text3);font-size:13px"><i class="ti ti-bell-off" style="font-size:28px;display:block;margin-bottom:8px"></i>通知はありません</div>';
    return;
  }

  el.innerHTML = arr.map((n, i) => {
    let extra = '';

    // フォロー通知：フォロワーリストを表示
    if (n.type === 'follow' && n.followers && n.followers.length > 0) {
      const preview = n.followers.slice(0, 4);
      const more = (n.followerCount || n.followers.length) - preview.length;
      extra = `<div class="notif-follower-preview">
        ${preview.map(name => `<span class="notif-fname">${name}</span>`).join('')}
        ${more > 0 ? `<span class="notif-fname-more">ほか${more}人</span>` : ''}
      </div>`;
    }

    // ランキング通知：順位バッジを表示
    if (n.type === 'rank' && n.rank) {
      const medal = n.rank === 1 ? '🥇' : n.rank === 2 ? '🥈' : n.rank === 3 ? '🥉' : '';
      const rankColor = n.rank <= 10 ? '#b45309' : n.rank <= 100 ? '#6d28d9' : '#1e40af';
      extra += `<div class="notif-rank-badge" style="color:${rankColor}">
        ${medal} <b>${n.rank.toLocaleString()}位</b>${n.cat ? ` / ${n.cat}` : ''}
      </div>`;
    }

    const hintHTML = (n.hint && n.unread)
      ? `<div class="notif-hint">${n.hint}</div>` : '';

    return `<div class="notif-item${n.unread ? ' unread' : ''} clickable" data-type="${n.type || ''}" onclick="markNotifRead('${notifActiveAcct}',${i})">
      <div class="notif-icon-wrap" style="background:${n.bg};color:${n.tc}"><i class="ti ${n.icon}"></i></div>
      <div class="notif-body">
        <div class="notif-text">${n.text}</div>
        ${extra}
        ${hintHTML}
        <div class="notif-time">${n.time}</div>
      </div>
      ${n.unread ? '<span class="notif-unread-dot"></span>' : ''}
    </div>`;
  }).join('');
}

function renderNotifs() {
  renderNotifTabs();
  renderNotifList();
  updateNotifBadge();
}

function markNotifRead(acct, i) {
  const arr = _notifArray(acct);
  const n = arr[i];
  const wasUnread = n.unread;
  n.unread = false;
  if (n.db_id) dbMarkNotifRead(n.db_id); // DBに既読を反映
  renderNotifs();
  if (!wasUnread) return;
  if (n.type === 'rank') {
    setTimeout(() => showRankingEffect(n.rank, n.cat), 200);
  } else if (n.type === 'follow') {
    setTimeout(() => showFollowerNotifEffect(n.followerCount, n.followers), 200);
  }
}

function updateNotifBadge() {
  const mainCount = NOTIFS.filter(n => n.unread).length;
  const subCount  = NOTIFS_SUB.filter(n => n.unread).length;
  const count = mainCount + subCount;
  const badge = document.querySelector('.nav-badge');
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : count;
  badge.style.display = count ? '' : 'none';
}

// 全て既読にする
function markAllNotifsRead() {
  const arr = _notifArray(notifActiveAcct);
  arr.forEach((n, i) => {
    if (n.unread) {
      n.unread = false;
      if (n.db_id) dbMarkNotifRead(n.db_id);
    }
  });
  renderNotifs();
  showToast('全ての通知を既読にしました', 'success');
}

// ── My Page ────────────────────────────────────────────
function setMyTab(tabId, btn) {
  btn.closest('.tab-bar').querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  ['my-posts','my-favs','my-rank','my-stats'].forEach(id => {
    document.getElementById(id).style.display = id===tabId ? 'block' : 'none';
  });
  if (tabId==='my-posts') renderMyPosts();
  if (tabId==='my-favs')  renderMyFavs();
  if (tabId==='my-rank')  renderMyRank();
  if (tabId==='my-stats') renderMyStats();
}

// ── My Stats ───────────────────────────────────────────
async function renderMyStats() {
  const body = document.getElementById('mystats-body');
  if (!body) return;

  body.innerHTML = '<div style="text-align:center;padding:40px 0;color:#94a3b8"><i class="ti ti-loader-2" style="font-size:28px"></i><div style="margin-top:8px;font-size:13px">読み込み中...</div></div>';

  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || typeof db === 'undefined') {
    body.innerHTML = '<div style="text-align:center;padding:40px 0;color:#94a3b8;font-size:14px">ログインが必要です</div>';
    return;
  }

  try {
    await _renderMyStatsInner(aid, body);
  } catch(e) {
    console.error('[Stats] エラー:', e);
    body.innerHTML = '<div style="text-align:center;padding:40px 0;color:#f87171;font-size:14px"><i class="ti ti-alert-circle"></i> データ取得に失敗しました<br><small style="color:#94a3b8">' + (e.message || '') + '</small></div>';
  }
}

async function _renderMyStatsInner(aid, body) {
  const handle = '@' + aid;

  // ① 全投稿取得（いいね降順）— is_sub フィルターは使わず取得後に除外
  const { data: allPosts, error: postsError } = await db.from('posts')
    .select('id, content, likes_count, views_count, cat_id, created_at, is_sub')
    .eq('user_handle', handle)
    .order('likes_count', { ascending: false });
  if (postsError) console.warn('[Stats] 投稿取得エラー:', postsError.message);
  // is_sub が true のもの（AIサブ投稿）は除外
  const posts = (allPosts || []).filter(p => !p.is_sub);

  // ② 今月の投稿数
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonthCount = posts.filter(p => p.created_at >= monthStart).length;

  // ③ 累計いいね・閲覧数
  const totalLikes = posts.reduce((s, p) => s + (p.likes_count || 0), 0);
  const totalViews = posts.reduce((s, p) => s + (p.views_count || 0), 0);

  // ④ フォロー数・フォロワー数
  const counts = typeof dbFetchFollowCounts === 'function'
    ? await dbFetchFollowCounts(aid)
    : { following: 0, followers: 0 };

  // ⑤ 最高ランク（いいね最多投稿の同カテゴリー内順位）
  let bestRankText = '-';
  if (posts.length > 0 && posts[0].cat_id) {
    const best = posts[0];
    const { count: aboveCount } = await db.from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('cat_id', best.cat_id)
      .gt('likes_count', best.likes_count || 0);
    bestRankText = ((aboveCount || 0) + 1).toLocaleString() + '位';
  }

  // ⑥ いいね率
  const likeRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(1) : '0.0';

  // ⑦ カテゴリー名マップ
  const catMap = {};
  if (typeof CATS_DATA !== 'undefined') CATS_DATA.forEach(c => { catMap[c.id] = c.name || c.id; });

  // ⑧ TOP3投稿HTML
  const topPosts = posts.slice(0, 3);
  const topPostsHTML = topPosts.length === 0
    ? '<div style="text-align:center;padding:20px 0;color:#94a3b8;font-size:13px">投稿がありません</div>'
    : topPosts.map((p, i) => `
      <div class="stats-top-post">
        <span class="stats-rank-num">#${i + 1}</span>
        <div class="stats-top-post-body">
          <div class="stats-top-post-text">${(p.content || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
          <div class="stats-top-post-meta">
            <span class="stats-cat-badge">${catMap[p.cat_id] || p.cat_id || '-'}</span>
            <span><i class="ti ti-heart"></i> ${(p.likes_count || 0).toLocaleString()}</span>
            <span><i class="ti ti-eye"></i> ${(p.views_count || 0).toLocaleString()}</span>
          </div>
        </div>
      </div>`).join('');

  // ⑨ 閲覧数の表示文字列
  const viewsLabel = totalViews >= 10000
    ? (totalViews / 10000).toFixed(1) + '万'
    : totalViews >= 1000
      ? (totalViews / 1000).toFixed(1) + 'k'
      : totalViews.toLocaleString();

  body.innerHTML = `
  <div class="stats-wrap">

    <div class="stats-period-note"><i class="ti ti-database"></i> リアルタイムデータ</div>

    <!-- サマリーカード -->
    <div class="stats-cards">
      <div class="stats-card">
        <div class="stats-card-icon" style="background:#ede9fe;color:#7c3aed"><i class="ti ti-users"></i></div>
        <div class="stats-card-body">
          <div class="stats-card-label">フォロワー数</div>
          <div class="stats-card-val">${counts.followers.toLocaleString()} <span class="stats-card-sub">人</span></div>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-card-icon" style="background:#dbeafe;color:#1d4ed8"><i class="ti ti-eye"></i></div>
        <div class="stats-card-body">
          <div class="stats-card-label">累計閲覧数</div>
          <div class="stats-card-val">${viewsLabel} <span class="stats-card-sub">回</span></div>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-card-icon" style="background:#dcfce7;color:#16a34a"><i class="ti ti-pencil"></i></div>
        <div class="stats-card-body">
          <div class="stats-card-label">今月の投稿数</div>
          <div class="stats-card-val">${thisMonthCount.toLocaleString()} <span class="stats-card-sub">件</span></div>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-card-icon" style="background:#fce7f3;color:#be185d"><i class="ti ti-heart"></i></div>
        <div class="stats-card-body">
          <div class="stats-card-label">累計いいね数</div>
          <div class="stats-card-val">${totalLikes.toLocaleString()} <span class="stats-card-sub">件</span></div>
        </div>
      </div>
    </div>

    <!-- 投稿パフォーマンス -->
    <div class="stats-section">
      <div class="stats-section-title"><i class="ti ti-trophy"></i> 投稿パフォーマンス TOP3</div>
      <div class="stats-top-posts">${topPostsHTML}</div>
    </div>

    <!-- エンゲージメント -->
    <div class="stats-section">
      <div class="stats-section-title"><i class="ti ti-activity"></i> エンゲージメント</div>
      <div class="stats-engagement-row">
        <div class="stats-eng-item">
          <div class="stats-eng-val">${likeRate}%</div>
          <div class="stats-eng-label">いいね率</div>
        </div>
        <div class="stats-eng-item">
          <div class="stats-eng-val">${posts.length.toLocaleString()}</div>
          <div class="stats-eng-label">総投稿数</div>
        </div>
        <div class="stats-eng-item">
          <div class="stats-eng-val">${bestRankText}</div>
          <div class="stats-eng-label">最高ランキング</div>
        </div>
        <div class="stats-eng-item">
          <div class="stats-eng-val">${counts.following.toLocaleString()}</div>
          <div class="stats-eng-label">フォロー中</div>
        </div>
      </div>
    </div>

  </div>`;
}

function renderMyPosts() {
  const feed = document.getElementById('mypost-feed');
  // ダミーユーザー操作中はそのユーザーの投稿、自分の時は@you/@anon_you
  const activeHandle = testActiveUser ? testActiveUser.h : null;
  const posts = myPosts.filter(t =>
    activeHandle
      ? t.user.h === activeHandle
      : (t.user.h === myHandle || t.user.h === '@anon_you')
  );
  if (!posts.length) {
    feed.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3)">
      <i class="ti ti-edit" style="font-size:32px;display:block;margin-bottom:10px"></i>
      まだ投稿がありません
    </div>`;
    return;
  }
  feed.innerHTML = posts.map(t => homeTweetHTML(t)).join('');
}

function renderMyFavs() {
  const feed = document.getElementById('myfav-feed');
  if (!favorites.size) {
    feed.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text3)">
      <i class="ti ti-star" style="font-size:28px;display:block;margin-bottom:10px"></i>
      お気に入りはまだありません<br><span style="font-size:12px">ランキングの☆ボタンで登録できます</span></div>`;
    return;
  }
  feed.innerHTML = Array.from(favorites).sort((a,b)=>a-b).map(rank => {
    const t = genTweet(rank,'game',0);
    return homeTweetHTML(t);
  }).join('');
}

function renderMyRank() {
  const feed = document.getElementById('myrank-feed');
  if (!myPosts.length) {
    feed.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3)">
      <i class="ti ti-trophy" style="font-size:32px;display:block;margin-bottom:10px"></i>
      ランキングに入った投稿がありません
    </div>`;
    return;
  }
  // いいね数順にソートして表示
  const sorted = [...myPosts].sort((a, b) => (b.likes || 0) - (a.likes || 0));
  feed.innerHTML = sorted.map((t, i) => {
    const idx = _reg(t);
    const u = t.user;
    return `<div class="tweet-card" data-db-id="${t.db_id||''}">
      <div class="tweet-av" style="background:${u.bg};color:${u.tc};overflow:hidden">${u.av}</div>
      <div class="tweet-body">
        <div class="tweet-top">
          <span class="rank-badge-card ${rc(i+1)}">#${i+1}</span>
          <span class="tweet-name">${u.n}</span>
          ${u.nameTag ? `<span class="tweet-name-tag">＠${u.nameTag}</span>` : ''}
          <span class="tweet-handle">${u.h}</span>
          <span class="tweet-time">${t.time}</span>
        </div>
        ${t.text ? `<div class="tweet-text">${t.text}</div>` : ''}
        ${t.mediaData ? (t.mediaType === 'image'
          ? `<div class="tweet-media"><img src="${t.mediaData}" class="tweet-media-img" onclick="event.stopPropagation();openImageViewer(this.src)"></div>`
          : `<div class="tweet-media"><video src="${t.mediaData}" controls class="tweet-media-vid" preload="metadata"></video></div>`)
          : ''}
        <div class="tweet-actions">
          <span><i class="ti ti-heart"></i> ${fmt(t.likes||0)}</span>
          <span><i class="ti ti-eye"></i> ${fmt(t.views||0)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Oshi Level ─────────────────────────────────────────
function oshiLevel(xp) { return Math.floor(xp / 100) + 1; }
function oshiProgress(xp) { return xp % 100; }
function oshiTier(lv) {
  if (lv >= 100) return { name:'レジェンド', color:'#dc2626', bg:'#fee2e2' };
  if (lv >= 50)  return { name:'プラチナ',   color:'#7c3aed', bg:'#ede9fe' };
  if (lv >= 30)  return { name:'ゴールド',   color:'#b45309', bg:'#fef3c7' };
  if (lv >= 15)  return { name:'シルバー',   color:'#4b5563', bg:'#f3f4f6' };
  if (lv >= 5)   return { name:'ブロンズ',   color:'#7c3c1a', bg:'#fde8d8' };
  return                 { name:'ノーマル',   color:'#9a9994', bg:'var(--surface2)' };
}
function oshiBadge(xp) {
  const lv = oshiLevel(xp); const prog = oshiProgress(xp); const t = oshiTier(lv);
  return `<div class="oshi-info">
    <div class="oshi-lv" style="color:${t.color};background:${t.bg}">Lv.${lv}</div>
    <div class="oshi-bar-wrap"><div class="oshi-bar-fill" style="width:${prog}%;background:${t.color}"></div></div>
    <div class="oshi-tier-name" style="color:${t.color}">${t.name}</div>
  </div>`;
}

// ── Follows ────────────────────────────────────────────
function setFollowsTab(tabId, btn) {
  ['tab-following','tab-followers','tab-oshi'].forEach(id => {
    document.getElementById(id).style.display = id === tabId ? 'block' : 'none';
  });
  document.getElementById('follows-tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (tabId === 'tab-oshi') renderOshiRank();
}

function renderFollows() {
  // Reset to first tab
  setFollowsTab('tab-following', document.querySelector('#follows-tabs .tab-btn'));

  const mkFollowItem = (u, showFollowBtn = false) => {
    const avContent = u.avImg
      ? `<img src="${u.avImg}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : (u.av || (u.n || '?')[0]);
    const avBg    = u.avImg ? 'transparent' : (u.bg || '#3b82f6');
    const avTc    = u.avImg ? 'transparent' : (u.tc || '#fff');
    const nameTag = u.nameTag ? `<span class="tweet-name-tag" style="font-size:11px">＠${u.nameTag}</span>` : '';
    return `<div class="follow-item clickable" onclick="openUserPage('${u.h}')">
      <div class="av-sm" style="background:${avBg};color:${avTc};overflow:hidden">${avContent}</div>
      <div class="follow-item-info">
        <div class="follow-item-name">${u.n || u.h} ${nameTag}</div>
        <div class="follow-item-handle">${u.h}</div>
      </div>
      ${showFollowBtn ? `<button class="btn-sm" style="margin-left:8px;flex-shrink:0" onclick="event.stopPropagation();toggleFollow('${u.h}')">フォロー</button>` : ''}
    </div>`;
  };

  // ── フォロー中（Supabase 実データ優先） ──
  const followListEl   = document.getElementById('follow-list');
  const followerListEl = document.getElementById('follower-list');

  // すぐにリストを描画（ダミーデータ or 既知のフォロー）
  if (myFollowingHandles.length > 0) {
    followListEl.innerHTML = myFollowingHandles.map(h => mkFollowItem({ h, n: h, av: h[1] || '?', bg: '#3b82f6', tc: '#fff' })).join('');
    // Supabase からプロフィールを非同期で取得してリッチ表示に更新
    const accountIds = myFollowingHandles.map(h => h.startsWith('@') ? h.slice(1) : h);
    if (accountIds.length > 0 && typeof db !== 'undefined') {
      db.from('profiles').select('account_id, avatar_data, nickname, name_tag').in('account_id', accountIds).then(({ data }) => {
        if (!data) return;
        const profileMap = {};
        data.forEach(p => { profileMap['@' + p.account_id] = p; });
        followListEl.innerHTML = myFollowingHandles.map(h => {
          const p = profileMap[h];
          return mkFollowItem({
            h,
            n      : p ? (p.nickname || h) : h,
            av     : p ? (p.nickname || h)[0] : h[1] || '?',
            avImg  : p ? p.avatar_data : null,
            bg     : '#3b82f6',
            tc     : '#fff',
            nameTag: p ? p.name_tag : null,
          });
        }).join('');
      });
    }
  } else {
    followListEl.innerHTML = '<div class="feed-empty" style="padding:24px 0"><i class="ti ti-user-plus"></i><p>フォロー中のユーザーはいません</p></div>';
  }

  // ── フォロワー（静的ダミーデータ） ──
  followerListEl.innerHTML = FOLLOWERS.map(u => mkFollowItem(u, !followingSet.has(u.h))).join('');
}

function renderOshiRank() {
  const sorted = [...FOLLOWERS].sort((a, b) => b.xp - a.xp);
  document.getElementById('oshi-rank-list').innerHTML = sorted.map((u, i) => {
    const lv = oshiLevel(u.xp); const t = oshiTier(lv); const r = i + 1;
    const rCls = r===1?'r1':r===2?'r2':r===3?'r3':'rn';
    return `<div class="follow-item">
      <span class="rank-badge-card ${rCls}" style="flex-shrink:0">#${r}</span>
      <div class="av-sm" style="background:${u.bg};color:${u.tc}">${u.av}</div>
      <div class="follow-item-info">
        <div class="follow-item-name">${u.n}</div>
        <div class="follow-item-handle">${u.h}</div>
      </div>
      <div class="oshi-info">
        <div class="oshi-lv" style="color:${t.color};background:${t.bg}">Lv.${lv}</div>
        <div class="oshi-tier-name" style="color:${t.color}">${t.name}</div>
        <div class="oshi-xp">${u.xp.toLocaleString()} XP</div>
      </div>
    </div>`;
  }).join('');
}

// ── Like / RT / Follow ─────────────────────────────────
function toggleLike(idx, btn) {
  const t = _tc[idx];
  if (!t) return;
  const nowLiked = !likedTweets.has(idx);
  if (nowLiked) {
    likedTweets.add(idx);
    if (t.db_id) likedDbIds.add(String(t.db_id));
    t.likes++;
    btn.classList.add('liked');
  } else {
    likedTweets.delete(idx);
    if (t.db_id) likedDbIds.delete(String(t.db_id));
    t.likes = Math.max(0, t.likes - 1);
    btn.classList.remove('liked');
  }
  // アイコンをハート塗りつぶし ↔ アウトラインに切替
  const icon = btn.querySelector('i');
  if (icon) { icon.className = nowLiked ? 'ti ti-heart-filled' : 'ti ti-heart'; icon.style.color = nowLiked ? '#e11d48' : ''; }
  // カウント表示更新
  const countEl = btn.querySelector('.like-count');
  if (countEl) countEl.textContent = fmt(t.likes);
  // 詳細モーダルが開いていれば同期
  const tdLike = document.getElementById(`td-like-${idx}`);
  if (tdLike) tdLike.textContent = fmt(t.likes);
  // Supabase に保存（db_id があるときのみ）
  if (t.db_id && typeof dbToggleLike === 'function') {
    const aid = localStorage.getItem('trendy_account_id');
    dbToggleLike(t.db_id, aid, nowLiked, t.user && t.user.h);
  }
}

function toggleRT(idx, btn) {
  const t = _tc[idx];
  if (!t) return;
  if (retweetedTweets.has(idx)) {
    retweetedTweets.delete(idx);
    t.rt = Math.max(0, t.rt - 1);
    btn.classList.remove('rted');
  } else {
    retweetedTweets.add(idx);
    t.rt++;
    btn.classList.add('rted');
  }
  btn.querySelector('.rt-count').textContent = fmt(t.rt);
  const tdRt = document.getElementById(`td-rt-${idx}`);
  if (tdRt) tdRt.textContent = fmt(t.rt);
}

async function toggleFollow(handle) {
  const btn = document.getElementById('user-page-follow-btn');
  if (!btn) return;
  const aid = localStorage.getItem('trendy_account_id');
  const wasFollowing = followingSet.has(handle);

  // ── 楽観的UI更新 ──
  if (wasFollowing) {
    followingSet.delete(handle);
    myFollowingHandles = myFollowingHandles.filter(h => h !== handle);
    btn.textContent = 'フォローする';
    btn.classList.remove('btn-following');
  } else {
    followingSet.add(handle);
    if (!myFollowingHandles.includes(handle)) myFollowingHandles.push(handle);
    btn.textContent = 'フォロー中';
    btn.classList.add('btn-following');
  }

  // ── Supabase に保存 ──
  if (aid && typeof dbToggleFollow === 'function') {
    btn.disabled = true;
    const result = await dbToggleFollow(aid, handle);
    btn.disabled = false;
    // エラー判定（null または { errorMsg } オブジェクト）
    const isError = result === null || (result && typeof result === 'object' && result.errorMsg);
    if (isError) {
      // 楽観的更新を元に戻す
      if (wasFollowing) { followingSet.add(handle); myFollowingHandles.push(handle); btn.textContent = 'フォロー中'; btn.classList.add('btn-following'); }
      else              { followingSet.delete(handle); myFollowingHandles = myFollowingHandles.filter(h => h !== handle); btn.textContent = 'フォローする'; btn.classList.remove('btn-following'); }
      const errMsg = (result && result.errorMsg) ? result.errorMsg : '不明なエラー';
      showToast('フォロー失敗: ' + errMsg, 'error');
      return;
    }
    showToast(result ? `${handle} をフォローしました` : `${handle} のフォローを解除しました`, result ? 'success' : '');
    // ホームフィードをフォロー状態に合わせて再読み込み
    _refreshHomeFeedFromDB();
    // フォロー数を再集計してUIに反映
    if (typeof dbFetchFollowCounts === 'function') {
      dbFetchFollowCounts(aid).then(c => _updateFollowCountUI(c.following, c.followers));
    }
  }
}

// ── フォロー数・フォロワー数UIを全ページ一括更新 ──────────────
function _updateFollowCountUI(following, followers) {
  const f = following.toLocaleString();
  const r = followers.toLocaleString();
  // ホームプロフィールバー
  const hf = document.getElementById('home-following-count'); if (hf) hf.textContent = f;
  const hr = document.getElementById('home-follower-count');  if (hr) hr.textContent = r;
  // フォローページのタブ
  const tf = document.getElementById('follows-following-count'); if (tf) tf.textContent = f;
  const tr = document.getElementById('follows-follower-count');  if (tr) tr.textContent = r;
  // マイページ
  const mf = document.getElementById('mypage-following-count'); if (mf) mf.textContent = f;
  const mr = document.getElementById('mypage-follower-count');  if (mr) mr.textContent = r;
}

// ── マイページの統計を Supabase 実データで更新 ──────────────
async function _refreshMypageStats() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || typeof db === 'undefined') return;

  // ① フォロー数・フォロワー数
  if (typeof dbFetchFollowCounts === 'function') {
    const counts = await dbFetchFollowCounts(aid);
    _updateFollowCountUI(counts.following, counts.followers);
  }

  // ② 投稿数（自分のメインアカウント投稿のみ）
  const handle = '@' + aid;
  const { count: postCount } = await db
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('user_handle', handle)
    .eq('is_sub', false);
  const pc = document.getElementById('mypage-post-count');
  if (pc) pc.textContent = (postCount || 0).toLocaleString();

  // ③ 最高ランク（自分の投稿の中で最もいいね数が多い投稿の全体順位）
  const { data: topPost } = await db
    .from('posts')
    .select('id, likes_count, cat_id')
    .eq('user_handle', handle)
    .eq('is_sub', false)
    .order('likes_count', { ascending: false })
    .limit(1);

  const br = document.getElementById('mypage-best-rank');
  if (topPost && topPost.length > 0 && topPost[0].cat_id) {
    const best = topPost[0];
    // そのカテゴリーで自分より多いいいね数を持つ投稿の数 + 1 = 自分の順位
    const { count: aboveCount } = await db
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('cat_id', best.cat_id)
      .gt('likes_count', best.likes_count || 0);
    const rank = (aboveCount || 0) + 1;
    if (br) br.textContent = rank.toLocaleString() + '位';
  } else {
    if (br) br.textContent = '-';
  }
}

// ── ホームフィード再読み込み（フォロー変更後に呼ぶ） ──────────
async function _refreshHomeFeedFromDB() {
  if (typeof dbLoadAndMergePosts !== 'function') return;
  // ダミーを保持しつつDB由来の実投稿のみリセット
  const dummies  = HOME_TWEETS.filter(t => t.isDummy);
  const myLocals = HOME_TWEETS.filter(t => !t.isDummy && !t.db_id); // まだDB未保存のローカル投稿
  HOME_TWEETS.length = 0;
  HOME_TWEETS.push(...dummies, ...myLocals);
  homeLoaded = 0;
  const feed = document.getElementById('home-feed');
  if (feed) feed.innerHTML = '';
  loadHomeMore();
  await dbLoadAndMergePosts(myFollowingHandles);
}

// ── Tweet Detail ───────────────────────────────────────
function openTweetDetail(idx) {
  const t = _tc[idx];
  if (!t) return;
  const u = t.user;
  const hasRank = t.rank > 0;
  // 自分のアバター（コメント入力欄用）
  const myAvData = localStorage.getItem('trendy_av');
  const myAvHtml = myAvData
    ? `<img src="${myAvData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : (myNickname || 'あ')[0];
  const myAvBg = myAvData ? 'transparent' : '#dbeafe';
  const myAvTc = myAvData ? 'transparent' : '#1e40af';

  document.getElementById('tweet-detail-body').innerHTML = `
    <div class="td-user-row clickable" onclick="closeTweetDetail();openUserPage('${u.h}')">
      <div class="tweet-av" style="background:${u.bg};color:${u.tc};overflow:hidden;flex-shrink:0">${u.av}</div>
      <div style="flex:1;min-width:0">
        <div class="tweet-name" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          ${u.sub ? '匿名ユーザー' : u.n}
          ${u.sub ? subBadge() : `<span class="badge-main">メイン</span>`}
          ${u.nameTag ? `<span class="tweet-name-tag">＠${u.nameTag}</span>` : ''}
        </div>
        <div class="tweet-handle">${u.h} <span style="color:var(--text3);font-size:11px;margin-left:4px">${t.time}</span></div>
      </div>
      <i class="ti ti-chevron-right" style="font-size:14px;opacity:0.35;flex-shrink:0"></i>
    </div>
    <div class="td-content" style="padding:10px 16px">
      ${t.text ? `<div class="td-text" style="font-size:15px;line-height:1.6;margin-bottom:8px">${t.text}</div>` : ''}
      ${t.mediaData ? (t.mediaType === 'image'
        ? `<div class="tweet-media" style="margin:4px 0 8px"><img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" onclick="event.stopPropagation();openImageViewer(this.src)"></div>`
        : `<div class="tweet-media" style="margin:4px 0 8px"><video src="${t.mediaData}" controls class="tweet-media-vid" preload="metadata"></video></div>`)
        : ''}
    </div>
    <div class="td-stats-row" style="padding:8px 16px;display:flex;align-items:center;gap:14px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
      <button class="td-action-btn like-btn${likedTweets.has(idx)?' liked':''}" onclick="toggleLike(${idx},this)"><i class="ti ti-heart"></i><span class="like-count" id="td-like-${idx}">${fmt(t.likes)}</span></button>
      <span style="color:var(--text3);font-size:13px"><i class="ti ti-eye"></i> ${fmt(t.views)}</span>
      ${aiBadge(t.ai)}
      ${hasRank ? `<span class="rank-badge-card ${rc(t.rank)}" style="margin-left:auto">#${t.rank}位</span>${prevBadge(t.prev)}` : ''}
    </div>
    <div class="td-comment-compose" style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border)">
      <div class="tweet-av" style="background:${myAvBg};color:${myAvTc};overflow:hidden;flex-shrink:0;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700">${myAvHtml}</div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <textarea id="td-comment-input" placeholder="返信する..." maxlength="280"
          style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;resize:none;min-height:64px;font-family:inherit;background:var(--bg2);color:var(--text1);display:block"
          oninput="updateTdCommentCount(this)"
          onkeydown="if(event.ctrlKey&&event.key==='Enter')submitComment(${idx})"></textarea>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
          <span id="td-comment-count" style="font-size:11px;color:var(--text3)">0/280</span>
          <button onclick="submitComment(${idx})"
            style="background:var(--primary,#6366f1);color:#fff;border:none;border-radius:20px;padding:6px 18px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px">
            <i class="ti ti-send" style="font-size:13px"></i> 送信
          </button>
        </div>
      </div>
    </div>
    <div id="td-replies-${idx}" class="td-replies-section">
      <div class="replies-empty"><i class="ti ti-loader" style="animation:spin 1s linear infinite;display:inline-block"></i> 読み込み中...</div>
    </div>
  `;
  document.getElementById('tweet-detail-overlay').classList.add('show');
  document.getElementById('tweet-detail-modal').classList.add('show');
  // コメントを非同期でロード
  _loadTweetComments(idx, t);
  // ※閲覧数カウントは画面表示時（IntersectionObserver）で行うため、ここでは不要
}
function closeTweetDetail() {
  document.getElementById('tweet-detail-overlay').classList.remove('show');
  document.getElementById('tweet-detail-modal').classList.remove('show');
}

// ── コメントの文字数カウント ──
function updateTdCommentCount(textarea) {
  const len = textarea.value.length;
  const el = document.getElementById('td-comment-count');
  if (el) { el.textContent = `${len}/280`; el.style.color = len > 250 ? 'var(--danger)' : 'var(--text3)'; }
}

// ── Supabase からコメントを読み込み詳細モーダルに表示 ──
async function _loadTweetComments(idx, t) {
  const section = document.getElementById(`td-replies-${idx}`);
  if (!section) return;
  if (t.db_id && typeof dbFetchComments === 'function') {
    const dbComments = await dbFetchComments(t.db_id);
    if (dbComments.length > 0) {
      // コメント投稿者の account_id を収集してアバターを一括取得
      const accountIds = [...new Set(
        dbComments
          .filter(c => !c.is_sub && c.user_handle?.startsWith('@'))
          .map(c => c.user_handle.slice(1))
      )];
      const avatarMap = {}; // { '@handle': '<img ...>' or null }
      if (accountIds.length > 0 && typeof db !== 'undefined') {
        const { data: profiles } = await db
          .from('profiles')
          .select('account_id, avatar_data')
          .in('account_id', accountIds);
        (profiles || []).forEach(p => {
          avatarMap['@' + p.account_id] = p.avatar_data
            ? `<img src="${p.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
            : null;
        });
      }
      // 自分のアバター（localStorage が最新）
      const myAvData = localStorage.getItem('trendy_av');
      const aid = localStorage.getItem('trendy_account_id');
      if (myAvData && aid) {
        avatarMap['@' + aid] = `<img src="${myAvData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      }

      tweetReplies[idx] = dbComments.map(c => {
        const avImg = c.is_sub ? null : (avatarMap[c.user_handle] || null);
        return {
          user: {
            h      : c.user_handle,
            n      : c.user_name,
            av     : avImg || (c.user_name || '?')[0].toUpperCase(),
            bg     : avImg ? 'transparent' : '#3b82f6',
            tc     : avImg ? 'transparent' : '#ffffff',
            sub    : c.is_sub,
            nameTag: c.name_tag || null,
          },
          text: c.content,
          time: _relativeTime(c.created_at),
        };
      });

      const countEl = document.getElementById(`reply-count-${idx}`);
      if (countEl) countEl.textContent = tweetReplies[idx].length || '';
    }
  }
  section.innerHTML = renderRepliesHTML(idx);
}

// ── コメント送信（Supabase 保存 + ローカル反映） ──
async function submitComment(idx) {
  const textarea = document.getElementById('td-comment-input');
  const text = textarea ? textarea.value.trim() : '';
  if (!text) return;
  const isSub = myAccountType === 'sub';
  const t = _tc[idx];
  // 自分のアバター
  const myAvData = localStorage.getItem('trendy_av');
  const avHtml   = myAvData
    ? `<img src="${myAvData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : null;
  const reply = {
    user: {
      h      : isSub ? '@anon_you' : myHandle,
      n      : isSub ? '匿名ユーザー' : (myNickname || 'あなた'),
      av     : avHtml || (myNickname || 'あ')[0],
      bg     : myAvData ? 'transparent' : '#dbeafe',
      tc     : myAvData ? 'transparent' : '#1e40af',
      sub    : isSub,
      nameTag: isSub ? null : (myNameTag || null),
    },
    text,
    time: '今',
  };
  if (!tweetReplies[idx]) tweetReplies[idx] = [];
  tweetReplies[idx].push(reply);
  // テキストエリアをクリア
  if (textarea) textarea.value = '';
  updateTdCommentCount(textarea || { value: '' });
  // カード上のカウントを更新
  const cardCount = document.getElementById(`reply-count-${idx}`);
  if (cardCount) cardCount.textContent = tweetReplies[idx].length;
  // 詳細モーダルのコメント一覧を再描画
  const section = document.getElementById(`td-replies-${idx}`);
  if (section) section.innerHTML = renderRepliesHTML(idx);
  // Supabase に非同期保存
  if (t && t.db_id && typeof dbSaveComment === 'function') {
    dbSaveComment({
      postId    : t.db_id,
      userHandle: isSub ? '@anon_you' : myHandle,
      userName  : isSub ? '匿名ユーザー' : (myNickname || 'あなた'),
      isSub,
      content   : text,
      nameTag   : isSub ? '' : (myNameTag || ''),
    });
    // 推しレベル更新（匿名コメントは除外）
    if (!isSub && t.user && t.user.h && typeof dbUpdateFanLevel === 'function') {
      const aid = localStorage.getItem('trendy_account_id');
      const authorId = t.user.h.startsWith('@') ? t.user.h.slice(1) : t.user.h;
      if (aid) dbUpdateFanLevel(aid, authorId, 'comment', 1);
    }
  }
}

// ── コメント一覧描画 ──────────────────────────────────────
function renderRepliesHTML(idx) {
  const replies = tweetReplies[idx] || [];
  if (!replies.length) return `<div class="replies-empty"><i class="ti ti-message-circle"></i> まだコメントがありません</div>`;
  return `<div class="replies-label"><i class="ti ti-message-circle"></i> コメント ${replies.length}件</div>` +
    replies.map(r => {
      const ru = r.user;
      // アバター（画像 or 文字）
      const avIsImg = typeof ru.av === 'string' && ru.av.startsWith('<img');
      const avBg = avIsImg ? 'transparent' : (ru.bg || '#3b82f6');
      const avTc = avIsImg ? 'transparent' : (ru.tc || '#fff');
      return `<div class="reply-item">
        <div class="tweet-av reply-av clickable" style="background:${avBg};color:${avTc};overflow:hidden" onclick="closeTweetDetail();openUserPage('${ru.h}')">${ru.av}</div>
        <div class="reply-body">
          <div class="reply-meta">
            <span class="tweet-name">${ru.sub ? '匿名ユーザー' : ru.n}</span>
            ${ru.sub ? subBadge() : ''}
            ${ru.nameTag ? `<span class="tweet-name-tag">＠${ru.nameTag}</span>` : ''}
            <span class="tweet-handle">${ru.h}</span>
            <span class="tweet-time">${r.time}</span>
          </div>
          <div class="tweet-text">${r.text}</div>
        </div>
      </div>`;
    }).join('');
}

function openReplyModal(idx) {
  replyTargetIdx = idx;
  const t = _tc[idx];
  if (!t) return;
  const u = t.user;
  document.getElementById('reply-target-preview').innerHTML = `
    <div class="reply-target-tweet">
      <div class="tweet-av reply-av" style="background:${u.bg};color:${u.tc}">${u.av}</div>
      <div class="reply-target-body">
        <div class="reply-target-meta">
          <span class="tweet-name">${u.sub ? '匿名ユーザー' : u.n}</span>
          <span class="tweet-handle">${u.h}</span>
        </div>
        <div class="reply-target-text">${t.text}</div>
      </div>
    </div>`;
  document.getElementById('reply-input').value = '';
  document.getElementById('reply-char-count').textContent = '0/140';
  document.getElementById('reply-overlay').classList.add('show');
  document.getElementById('reply-modal').classList.add('show');
  setTimeout(() => document.getElementById('reply-input').focus(), 50);
}

function closeReplyModal() {
  document.getElementById('reply-overlay').classList.remove('show');
  document.getElementById('reply-modal').classList.remove('show');
  replyTargetIdx = null;
}

function updateReplyCount() {
  const v = document.getElementById('reply-input').value;
  const len = v.length;
  const el = document.getElementById('reply-char-count');
  el.textContent = `${len}/140`;
  el.style.color = len > 120 ? 'var(--danger)' : 'var(--text3)';
}

function submitReply() {
  const text = document.getElementById('reply-input').value.trim();
  if (!text || replyTargetIdx === null) return;
  const isSub = myAccountType === 'sub';
  const reply = {
    user: { n: isSub ? '匿名ユーザー' : 'あなた', h: isSub ? '@anon_you' : myHandle, av: 'あ', bg: '#dbeafe', tc: '#1e40af', sub: isSub },
    text,
    time: '今',
  };
  if (!tweetReplies[replyTargetIdx]) tweetReplies[replyTargetIdx] = [];
  tweetReplies[replyTargetIdx].unshift(reply);

  // カード上のカウントを更新
  const countEl = document.getElementById(`reply-count-${replyTargetIdx}`);
  if (countEl) countEl.textContent = tweetReplies[replyTargetIdx].length;

  // 詳細モーダルが同じツイートで開いていれば返信一覧を更新
  const repliesSection = document.getElementById(`td-replies-${replyTargetIdx}`);
  if (repliesSection) repliesSection.innerHTML = renderRepliesHTML(replyTargetIdx);

  closeReplyModal();
}

// ── Name Tag ───────────────────────────────────────────
function startNameTagEdit() {
  const row = document.getElementById('name-tag-edit-row');
  const input = document.getElementById('name-tag-input');
  row.style.display = 'flex';
  document.getElementById('name-tag-edit-btn').style.display = 'none';
  document.getElementById('profile-name-tag-display').style.display = 'none';
  input.value = myNameTag;
  updateNameTagCount();
  input.focus();
}
function cancelNameTagEdit() {
  document.getElementById('name-tag-edit-row').style.display = 'none';
  document.getElementById('name-tag-edit-btn').style.display = '';
  if (myNameTag) document.getElementById('profile-name-tag-display').style.display = '';
}
// ── 月1回変更制限ヘルパー ──────────────────────────────
function canChangeMonthly(key) {
  const last = localStorage.getItem('trendy_last_change_' + key);
  if (!last) return true;
  return Date.now() - parseInt(last) > 30 * 24 * 60 * 60 * 1000;
}
function daysUntilChange(key) {
  const last = localStorage.getItem('trendy_last_change_' + key);
  if (!last) return 0;
  const days = 30 - Math.floor((Date.now() - parseInt(last)) / (24 * 60 * 60 * 1000));
  return Math.max(0, days);
}
function recordMonthlyChange(key) {
  localStorage.setItem('trendy_last_change_' + key, Date.now().toString());
}
function renderMonthlyChangeBtn(containerId, key, actionCode, label) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (canChangeMonthly(key)) {
    el.innerHTML = `<button class="btn-sm" onclick="${actionCode}">${label}</button>`;
  } else {
    const days = daysUntilChange(key);
    el.innerHTML = `<button class="btn-sm" disabled style="opacity:0.45;cursor:not-allowed;background:var(--border);color:var(--text3);border-color:var(--border)">変更まで${days}日</button>`;
  }
}

// ── プロフィール編集ページ ─────────────────────────────
function openProfileEdit() {
  // 現在値をフォームに反映
  const nameEl    = document.getElementById('pe-name-input');
  const nameTagEl = document.getElementById('pe-nametag-input');
  const bioEl     = document.getElementById('pe-bio-input');
  const avEl      = document.getElementById('pe-av-display');

  if (nameTagEl) nameTagEl.value = myNameTag || '';
  if (bioEl)     bioEl.value     = myBio || '';

  // ── ニックネーム（月1回制限） ──
  if (nameEl) {
    nameEl.value = myNickname || 'あなた';
    const restrictMsg = document.getElementById('pe-name-restrict-msg');
    if (canChangeMonthly('nickname')) {
      nameEl.disabled = false;
      nameEl.style.opacity = '';
      nameEl.style.cursor  = '';
      if (restrictMsg) restrictMsg.style.display = 'none';
    } else {
      nameEl.disabled = true;
      nameEl.style.opacity = '0.5';
      nameEl.style.cursor  = 'not-allowed';
      if (restrictMsg) {
        restrictMsg.textContent = `変更まで${daysUntilChange('nickname')}日`;
        restrictMsg.style.display = '';
      }
    }
  }

  // アバターを同期
  const srcAv = document.getElementById('my-av-display');
  if (avEl && srcAv) {
    avEl.innerHTML    = srcAv.innerHTML || srcAv.textContent;
    avEl.style.background = srcAv.style.background;
    avEl.style.color      = srcAv.style.color;
  }

  // 属性情報を同期（設定ページの値を引用）
  const syncVal = (peId, settingsId) => {
    const src = document.getElementById(settingsId);
    const dst = document.getElementById(peId);
    if (src && dst) dst.textContent = src.textContent;
  };
  syncVal('pe-gender-val',  'settings-gender-val');
  syncVal('pe-region-val',  'settings-region-val');
  syncVal('pe-dob-val',     'settings-dob-val');
  syncVal('pe-phone-val',   'settings-phone-val');

  // ── 地域・電話番号のボタン（月1回制限） ──
  renderMonthlyChangeBtn('pe-region-change-wrap', 'region', "openSettingsEditFromProfile('region')", '変更');
  renderMonthlyChangeBtn('pe-phone-change-wrap',  'phone',  'openPhoneModalFromProfile()',            '変更');

  // 推しユーザーを読み込み
  loadUserFavorites();

  // 外部リンクを読み込み（Supabase から非同期取得）
  _socialSlots = [];
  _renderSocialSlotsUI();
  const _peAid = localStorage.getItem('trendy_account_id');
  if (_peAid && typeof dbFetchProfile === 'function') {
    dbFetchProfile(_peAid).then(profile => {
      _initSocialSlots(profile?.social_links);
    }).catch(() => {});
  }
}

// ── 推しユーザー設定 ─────────────────────────────────────────

// 現在設定中の推し（account_id, スロット1-3）
let _favSlots = { 1: null, 2: null, 3: null };
let _favPickerTargetSlot = 1;
let _favPickerUsers = []; // ピッカー用ユーザーキャッシュ

async function loadUserFavorites() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || typeof dbFetchUserFavorites !== 'function') return;
  const favs = await dbFetchUserFavorites(aid);
  _favSlots[1] = favs?.favorite_1 || null;
  _favSlots[2] = favs?.favorite_2 || null;
  _favSlots[3] = favs?.favorite_3 || null;
  [1, 2, 3].forEach(i => _renderFavSlot(i));
  _renderMypageFavRow();
}

async function _renderFavSlot(slot) {
  const iconEl  = document.getElementById(`fav-icon-${slot}`);
  const labelEl = document.getElementById(`fav-label-${slot}`);
  const slotEl  = document.getElementById(`fav-slot-${slot}`);
  if (!iconEl || !labelEl) return;

  const accountId = _favSlots[slot];
  if (!accountId) {
    iconEl.innerHTML  = `<i class="ti ti-user-plus" style="font-size:20px"></i>`;
    labelEl.textContent = '追加';
    if (slotEl) slotEl.querySelector('.fav-remove').style.display = 'none';
    return;
  }

  // プロフィール取得してアバター表示
  if (typeof dbFetchProfilesByIds === 'function') {
    const profiles = await dbFetchProfilesByIds([accountId]);
    const p = profiles && profiles[0];
    if (p) {
      if (p.avatar_data) {
        iconEl.innerHTML = `<img src="${p.avatar_data}" style="width:100%;height:100%;object-fit:cover">`;
      } else {
        iconEl.innerHTML = `<span style="font-size:20px;font-weight:700">${(p.nickname||accountId)[0].toUpperCase()}</span>`;
      }
      labelEl.textContent = p.nickname || ('@' + accountId);
    }
  } else {
    iconEl.innerHTML = `<span style="font-size:14px;color:var(--text2)">@${accountId}</span>`;
    labelEl.textContent = '@' + accountId;
  }
  if (slotEl) slotEl.querySelector('.fav-remove').style.display = '';
}

async function _renderMypageFavRow() {
  const myAid = localStorage.getItem('trendy_account_id');
  for (let slot = 1; slot <= 3; slot++) {
    const el = document.getElementById(`mypage-fav-av-${slot}`);
    if (!el) continue;
    const accountId = _favSlots[slot];
    if (!accountId) {
      el.innerHTML = `<div class="mypage-fav-av-inner"><i class="ti ti-plus" style="font-size:14px"></i></div>`;
      el.onclick = () => goPage('profile-edit', null);
      continue;
    }
    el.onclick = () => openUserPage('@' + accountId);

    // プロフィールとファンレベルを並行取得
    const [profiles, fanData] = await Promise.all([
      typeof dbFetchProfilesByIds === 'function' ? dbFetchProfilesByIds([accountId]) : [],
      (myAid && typeof dbGetFanLevel === 'function') ? dbGetFanLevel(myAid, accountId) : null,
    ]);
    const p = profiles && profiles[0];
    const level = fanData?.fan_level ?? 0;

    let avHtml;
    if (p?.avatar_data) {
      avHtml = `<img src="${p.avatar_data}">`;
    } else {
      const initial = (p?.nickname || accountId)[0].toUpperCase();
      avHtml = `<span style="font-size:16px;font-weight:700;color:#fff">${initial}</span>`;
    }
    const innerBg = p?.avatar_data ? '' : 'background:#3b82f6;';
    el.title = p?.nickname || accountId;
    el.innerHTML = `
      <div class="mypage-fav-av-inner filled" style="${innerBg}">${avHtml}</div>
      <div class="mypage-fav-lv">${level}</div>
    `;
  }
}

async function openFavoritePicker(slot) {
  _favPickerTargetSlot = slot;
  const titleEl = document.getElementById('fav-picker-title');
  if (titleEl) titleEl.textContent = `推し${slot}を選択`;

  // フォロー中ユーザーをピッカーに表示
  const aid = localStorage.getItem('trendy_account_id');
  const listEl = document.getElementById('fav-picker-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3)">読み込み中...</div>';

  // フォロー中を取得
  let users = [];
  if (typeof dbFetchFollowing === 'function') {
    const handles = await dbFetchFollowing(aid);
    const ids = handles.map(h => h.replace('@', ''));
    if (ids.length > 0 && typeof dbFetchProfilesByIds === 'function') {
      users = await dbFetchProfilesByIds(ids);
    }
  }
  _favPickerUsers = users;
  _renderFavPickerList(users);

  document.getElementById('fav-picker-overlay').style.display = 'block';
  document.getElementById('fav-picker-modal').style.display = 'flex';
  const searchEl = document.getElementById('fav-picker-search');
  if (searchEl) { searchEl.value = ''; searchEl.focus(); }
}

function _renderFavPickerList(users) {
  const listEl = document.getElementById('fav-picker-list');
  if (!listEl) return;
  if (!users || users.length === 0) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3)">フォロー中のユーザーがいません</div>';
    return;
  }
  listEl.innerHTML = users.map(p => {
    const avHtml = p.avatar_data
      ? `<img src="${p.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<span style="font-size:16px;font-weight:700">${(p.nickname||p.account_id)[0].toUpperCase()}</span>`;
    return `<div class="follow-item" onclick="setFavorite(${_favPickerTargetSlot},'${p.account_id}')">
      <div class="tweet-av" style="width:40px;height:40px;background:#dbeafe;color:#1e40af;overflow:hidden">${avHtml}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px">${p.nickname || p.account_id}</div>
        <div style="font-size:12px;color:var(--text3)">@${p.account_id}</div>
      </div>
    </div>`;
  }).join('');
}

function filterFavPicker(query) {
  const q = query.toLowerCase();
  const filtered = q
    ? _favPickerUsers.filter(p => (p.nickname||'').toLowerCase().includes(q) || p.account_id.toLowerCase().includes(q))
    : _favPickerUsers;
  _renderFavPickerList(filtered);
}

async function setFavorite(slot, accountId) {
  _favSlots[slot] = accountId;
  await _renderFavSlot(slot);
  closeFavoritePicker();
  // 即時保存
  _saveFavorites();
}

function removeFavorite(slot) {
  _favSlots[slot] = null;
  _renderFavSlot(slot);
  _saveFavorites();
}

function _saveFavorites() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || typeof dbSetUserFavorites !== 'function') return;
  dbSetUserFavorites(aid, _favSlots[1], _favSlots[2], _favSlots[3]);
}

function closeFavoritePicker() {
  const overlay = document.getElementById('fav-picker-overlay');
  const modal   = document.getElementById('fav-picker-modal');
  if (overlay) overlay.style.display = 'none';
  if (modal)   modal.style.display   = 'none';
}

function saveProfileEdit() {
  // ── ニックネーム（月1回制限）──
  if (canChangeMonthly('nickname')) {
    const newName = (document.getElementById('pe-name-input')?.value || '').trim();
    if (newName && newName !== myNickname) {
      myNickname = newName || 'あなた';
      localStorage.setItem('trendy_myName', myNickname);
      recordMonthlyChange('nickname');
      _applyMyName();
    }
  }

  // 名前タグ
  const newTag = (document.getElementById('pe-nametag-input')?.value || '').trim();
  myNameTag = newTag;
  localStorage.setItem('trendy_myNameTag', myNameTag);
  _applyNameTag();
  _updateMyPostsNameTag();
  // nameTagのマイページ表示更新
  const display  = document.getElementById('profile-name-tag-display');
  const btnLabel = document.getElementById('name-tag-btn-label');
  if (display)  { display.textContent = myNameTag ? '＠' + myNameTag : ''; display.style.display = myNameTag ? '' : 'none'; }
  if (btnLabel) btnLabel.textContent = myNameTag ? 'タグを編集' : 'タグを追加';

  // 自己紹介
  const newBio = (document.getElementById('pe-bio-input')?.value || '').trim();
  myBio = newBio;
  localStorage.setItem('trendy_bio', myBio);
  const bioDisplay = document.getElementById('profile-bio-display');
  if (bioDisplay) {
    bioDisplay.textContent = myBio || '自己紹介文を追加…（タップして編集）';
    bioDisplay.className   = myBio ? 'profile-bio-text' : 'profile-bio-empty';
  }

  // Supabaseにも同期（ニックネーム・自己紹介・名前タグ）
  const _aid = localStorage.getItem('trendy_account_id');
  if (_aid) {
    if (typeof dbUpdateProfile === 'function') {
      dbUpdateProfile({ accountId: _aid, nickname: myNickname, bio: myBio, isDev: isDeveloper });
    }
    if (typeof dbUpdateProfileMeta === 'function') {
      dbUpdateProfileMeta(_aid, { nameTag: myNameTag });
    }
    // 外部リンクを保存（URLが入力されているスロットのみ）
    const _linksToSave = _socialSlots
      .filter(s => (s.url || '').trim())
      .map(s => ({ url: s.url.trim(), icon: s.icon || '' }));
    if (typeof dbUpdateSocialLinks === 'function') {
      dbUpdateSocialLinks(_aid, _linksToSave);
    }
    // マイページのアイコンを即時反映
    _renderSocialLinks(_linksToSave, 'mypage-social-links');
  }

  showToast('プロフィールを保存しました', 'success');
  goPage('mypage', null);
}

function saveNameTag() {
  myNameTag = (document.getElementById('name-tag-input').value || '').trim();
  const display = document.getElementById('profile-name-tag-display');
  const btnLabel = document.getElementById('name-tag-btn-label');
  if (myNameTag) {
    display.textContent = '＠' + myNameTag;
    display.style.display = '';
    btnLabel.textContent = 'タグを編集';
  } else {
    display.style.display = 'none';
    btnLabel.textContent = 'タグを追加';
  }
  // サイドバー・ホームバーにも反映
  _applyNameTag();
  // 既存投稿のnameTagを一括更新（ランキング・マイページに即反映）
  _updateMyPostsNameTag();
  // localStorageに保存（リロード後も維持）
  localStorage.setItem('trendy_myNameTag', myNameTag);
  // Supabaseにも保存（クロスデバイス同期）
  const _aid = localStorage.getItem('trendy_account_id');
  if (_aid && typeof dbUpdateProfileMeta === 'function') dbUpdateProfileMeta(_aid, { nameTag: myNameTag });
  cancelNameTagEdit();
  showToast('名前タグを保存しました', 'success');
}

function _updateMyPostsNameTag() {
  // myPosts と HOME_TWEETS の @you 投稿を更新
  [myPosts, HOME_TWEETS].forEach(arr => {
    arr.forEach(t => {
      if (t.user && t.user.h === myHandle) {
        t.user.nameTag = myNameTag || null;
      }
    });
  });
  // マイページ投稿タブを再描画
  renderMyPosts();
}
function updateNameTagCount() {
  const len = (document.getElementById('name-tag-input').value || '').length;
  document.getElementById('name-tag-count').textContent = `${len}/20`;
}
// 開発者バッジHTML
function _devBadge() {
  return isDeveloper
    ? '<span class="badge-dev"><i class="ti ti-code" style="font-size:9px;vertical-align:-1px"></i> 開発者</span>'
    : '';
}

// 開発者ナビボタンの表示切替
function _applyDevNav() {
  const devBtn = document.querySelector('.nav-item[data-page="dev"]');
  if (devBtn) devBtn.style.display = isDeveloper ? '' : 'none';
}

function _applyMyHandle() {
  // ハンドル（@ID）をサイドバー・マイページ・設定ページに反映
  const sideHndl = document.getElementById('sidebar-user-handle');
  if (sideHndl && myAccountType !== 'sub') sideHndl.textContent = myHandle;
  const myHandleEl = document.getElementById('mypage-profile-handle');
  if (myHandleEl && myAccountType !== 'sub') myHandleEl.textContent = myHandle;
  const settingsHandle = document.getElementById('settings-account-handle');
  if (settingsHandle) settingsHandle.textContent = `${myNickname || 'あなた'} (${myHandle})`;
}

function _applyMyName() {
  // ニックネームをサイドバー・ホーム・マイページに反映
  const displayName = myNickname || 'あなた';
  const devBadge    = _devBadge();
  const sidebarName = document.getElementById('sidebar-user-name');
  if (sidebarName) sidebarName.innerHTML = displayName + (devBadge ? ' ' + devBadge : '');
  const homeName = document.getElementById('home-profile-name');
  if (homeName) {
    homeName.innerHTML = displayName
      + (devBadge ? ' ' + devBadge : '')
      + (myNameTag ? ` <span class="home-name-tag">＠${myNameTag}</span>` : '');
  }
  const mypageName = document.getElementById('mypage-profile-name');
  if (mypageName) {
    mypageName.innerHTML = displayName
      + ' <span class="badge-main">メイン</span>'
      + (devBadge ? ' ' + devBadge : '');
  }
  _applyDevNav();
}

function _applyNameTag() {
  const displayName = myNickname || 'あなた';
  const devBadge    = _devBadge();
  // サイドバー
  const sidebarName = document.getElementById('sidebar-user-name');
  if (sidebarName) sidebarName.innerHTML = displayName + (devBadge ? ' ' + devBadge : '');
  const sidebarTag = document.getElementById('sidebar-name-tag');
  if (sidebarTag) sidebarTag.textContent = myNameTag ? '＠' + myNameTag : '';

  // ホームプロフィールバー
  const homeName = document.getElementById('home-profile-name');
  if (homeName) {
    homeName.innerHTML = displayName
      + (devBadge ? ' ' + devBadge : '')
      + (myNameTag ? ` <span class="home-name-tag">＠${myNameTag}</span>` : '');
  }
}

// ── User ID ────────────────────────────────────────────

// ── My Profile ─────────────────────────────────────────
function startBioEdit() {
  document.getElementById('profile-bio-wrap').style.display = 'none';
  const edit = document.getElementById('profile-bio-edit');
  edit.style.display = 'flex';
  const ta = document.getElementById('profile-bio-input');
  ta.value = myBio;
  updateBioCount();
  ta.focus();
}
function cancelBioEdit() {
  document.getElementById('profile-bio-edit').style.display = 'none';
  document.getElementById('profile-bio-wrap').style.display = '';
}
function saveBio() {
  myBio = document.getElementById('profile-bio-input').value.trim();
  localStorage.setItem('trendy_bio', myBio);
  // Supabaseにも同期
  const _aid = localStorage.getItem('trendy_account_id');
  if (_aid && typeof dbUpdateProfile === 'function') {
    dbUpdateProfile({ accountId: _aid, nickname: myNickname, bio: myBio, isDev: isDeveloper });
  }
  const display = document.getElementById('profile-bio-display');
  if (myBio) {
    display.textContent = myBio;
    display.className = '';
  } else {
    display.textContent = '自己紹介文を追加…（タップして編集）';
    display.className = 'profile-bio-empty';
  }
  cancelBioEdit();
}
function updateBioCount() {
  const v = document.getElementById('profile-bio-input').value;
  document.getElementById('bio-char-count').textContent = v.length + '/160';
}
// 画像をcanvasで圧縮してJPEG base64に変換
function _compressImage(dataUrl, maxW, maxH, quality = 0.82) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

// ── Avatar Crop State ──
let _avCropState = {
  imageData: null,
  originalImage: null,
  zoom: 100,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};

function handleAvUpload(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    _avCropState.imageData = e.target.result;
    _avCropState.zoom = 100;
    _avCropState.offsetX = 0;
    _avCropState.offsetY = 0;
    _avCropState.rotation = 0;
    openAvCrop();
  };
  reader.readAsDataURL(input.files[0]);
}

function openAvCrop() {
  const overlay = document.getElementById('av-crop-overlay');
  const modal = document.getElementById('av-crop-modal');
  if (overlay) overlay.style.display = 'block';
  if (modal) modal.style.display = 'block';
  setTimeout(() => initAvCropCanvas(), 100);
}

function closeAvCrop() {
  const overlay = document.getElementById('av-crop-overlay');
  const modal = document.getElementById('av-crop-modal');
  if (overlay) overlay.style.display = 'none';
  if (modal) modal.style.display = 'none';
}

function initAvCropCanvas() {
  const canvas = document.getElementById('av-crop-canvas');
  if (!canvas || !_avCropState.imageData) return;

  const img = new Image();
  img.onload = () => {
    _avCropState.originalImage = img;
    updateAvCrop();
    // Add drag handlers for panning
    addAvCanvasDragHandlers(canvas);
  };
  img.src = _avCropState.imageData;
}

let _avDragState = { isDragging: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 };

function addAvCanvasDragHandlers(canvas) {
  canvas.addEventListener('mousedown', e => {
    _avDragState.isDragging = true;
    _avDragState.startX = e.clientX;
    _avDragState.startY = e.clientY;
    _avDragState.startOffsetX = _avCropState.offsetX;
    _avDragState.startOffsetY = _avCropState.offsetY;
    canvas.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', e => {
    if (!_avDragState.isDragging) return;
    const dx = e.clientX - _avDragState.startX;
    const dy = e.clientY - _avDragState.startY;
    _avCropState.offsetX = _avDragState.startOffsetX + dx;
    _avCropState.offsetY = _avDragState.startOffsetY + dy;
    updateAvCrop();
  });

  document.addEventListener('mouseup', () => {
    _avDragState.isDragging = false;
    canvas.style.cursor = 'grab';
  });

  canvas.style.cursor = 'grab';
}

function updateAvCrop() {
  const canvas = document.getElementById('av-crop-canvas');
  const previewCanvas = document.getElementById('av-preview-canvas');
  if (!canvas || !previewCanvas || !_avCropState.originalImage) return;

  // Read zoom from slider
  const zoomSlider = document.getElementById('av-zoom-slider');
  if (zoomSlider) {
    _avCropState.zoom = parseInt(zoomSlider.value);
  }

  const ctx = canvas.getContext('2d');
  const prevCtx = previewCanvas.getContext('2d');

  const zoom = _avCropState.zoom / 100;
  const img = _avCropState.originalImage;

  // Main canvas
  canvas.width = 300;
  canvas.height = 300;

  // Set black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 300, 300);
  ctx.save();
  ctx.translate(150, 150);
  ctx.rotate((_avCropState.rotation * Math.PI) / 180);
  ctx.translate(-150, -150);

  const scaledWidth = img.width * zoom;
  const scaledHeight = img.height * zoom;
  const x = 150 - scaledWidth / 2 + _avCropState.offsetX;
  const y = 150 - scaledHeight / 2 + _avCropState.offsetY;

  ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
  ctx.restore();

  // Preview canvas (circular crop)
  previewCanvas.width = 140;
  previewCanvas.height = 140;

  // Set black background
  prevCtx.fillStyle = '#000000';
  prevCtx.fillRect(0, 0, 140, 140);

  prevCtx.save();
  prevCtx.beginPath();
  prevCtx.arc(70, 70, 70, 0, Math.PI * 2);
  prevCtx.clip();

  prevCtx.translate(70, 70);
  prevCtx.rotate((_avCropState.rotation * Math.PI) / 180);
  prevCtx.translate(-70, -70);

  const prevScaledW = img.width * zoom;
  const prevScaledH = img.height * zoom;
  const prevX = 70 - prevScaledW / 2 + _avCropState.offsetX;
  const prevY = 70 - prevScaledH / 2 + _avCropState.offsetY;

  prevCtx.drawImage(img, prevX, prevY, prevScaledW, prevScaledH);
  prevCtx.restore();

  // Update zoom display
  const zoomDisplay = document.getElementById('av-zoom-value');
  if (zoomDisplay) zoomDisplay.textContent = Math.round(_avCropState.zoom) + '%';
}

function rotateAvCropImage() {
  _avCropState.rotation = (_avCropState.rotation + 90) % 360;
  updateAvCrop();
}

function resetAvCrop() {
  _avCropState.zoom = 100;
  _avCropState.offsetX = 0;
  _avCropState.offsetY = 0;
  _avCropState.rotation = 0;
  document.getElementById('av-zoom-slider').value = 100;
  updateAvCrop();
}

async function saveAvCrop() {
  const previewCanvas = document.getElementById('av-preview-canvas');
  if (!previewCanvas) return;

  // Get circular crop as data URL
  const compressed = previewCanvas.toDataURL('image/jpeg', 0.85);

  localStorage.setItem('trendy_av', compressed);
  _applyAvImage(compressed);

  // Save to Supabase
  const _aid = localStorage.getItem('trendy_account_id');
  if (_aid && typeof dbSaveProfileImage === 'function') {
    await dbSaveProfileImage(_aid, 'avatar_data', compressed);
    localStorage.setItem('trendy_last_sync', new Date().toISOString());
  }

  closeAvCrop();
}
// 現在ユーザーのアバター（画像があればimg HTML、なければ文字）
function _myAvContent() {
  const saved = localStorage.getItem('trendy_av');
  return saved
    ? `<img src="${saved}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : 'あ';
}

function _applyAvImage(data) {
  const img = `<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  // プロフィール各所のアバター更新
  ['my-av-display','home-av-display','sidebar-user-av','home-compose-av'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.innerHTML = img; }
  });
  // ホームフィードの自分の投稿カードも即時更新
  const myHandleVal = myHandle || ('@' + (localStorage.getItem('trendy_account_id') || 'you'));
  [myHandleVal, '@anon_you'].forEach(h => {
    HOME_TWEETS.filter(t => t.user && t.user.h === h).forEach(t => { t.user.av = img; });
    myPosts.filter(t => t.user && t.user.h === h).forEach(t => { t.user.av = img; });
  });
  // フィード再描画
  const feed = document.getElementById('home-feed');
  if (feed && HOME_TWEETS.length > 0) { feed.innerHTML = ''; homeLoaded = 0; loadHomeMore(); }
  if (typeof renderMyPosts === 'function') renderMyPosts();
}
function handleCoverUpload(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = async e => {
    // カバーは900×300に圧縮
    const compressed = await _compressImage(e.target.result, 900, 300, 0.85);
    localStorage.setItem('trendy_cover', compressed);
    _applyCoverImage(compressed);
    // Supabaseにも保存
    const _aid = localStorage.getItem('trendy_account_id');
    if (_aid && typeof dbSaveProfileImage === 'function') {
      await dbSaveProfileImage(_aid, 'cover_data', compressed);
      // 保存後に同期タイムスタンプを更新（このデバイスで再度同期しないよう）
      localStorage.setItem('trendy_last_sync', new Date().toISOString());
    }
  };
  reader.readAsDataURL(input.files[0]);
}
function _applyCoverImage(data) {
  const el = document.getElementById('profile-cover-img');
  if (!el) return;
  el.style.backgroundImage = `url(${data})`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
}

// ── Category Voting ────────────────────────────────────
const myVotes = {}; // 'handle:catName' -> 'agree' | 'deny' | null
let catPickerTargetHandle = myHandle; // どのユーザーに追加するか

function catTrustClass(agree, deny) {
  const total = agree + deny;
  if (!total) return 'trust-mid';
  const ratio = agree / total;
  if (ratio >= 0.70) return 'trust-high';
  if (ratio <= 0.40) return 'trust-low';
  return 'trust-mid';
}

function catChipHTML(handle, cat, isSelf) {
  const key = `${handle}:${cat.name}`;
  const mv = myVotes[key] || null;
  const tCls = catTrustClass(cat.agree, cat.deny);
  const voteAttrs = isSelf
    ? 'disabled'
    : `onclick="event.stopPropagation();doVoteCategory('${handle}','${cat.name}',this)"`;
  return `<div class="profile-cat-chip ${tCls}">
    <button class="cat-vote-btn cat-agree${mv==='agree'?' voted':''}" data-side="agree" ${voteAttrs}>
      <i class="ti ti-chevron-up"></i><span class="cvote-num">${cat.agree}</span>
    </button>
    <span class="cat-chip-name" onclick="event.stopPropagation();openCatDetail('${handle}','${cat.name}')" title="設定者・投票者を確認">
      ${cat.name} <i class="ti ti-info-circle" style="font-size:9px;opacity:0.5;vertical-align:1px"></i>
    </span>
    <button class="cat-vote-btn cat-deny${mv==='deny'?' voted':''}" data-side="deny" ${voteAttrs}>
      <span class="cvote-num">${cat.deny}</span><i class="ti ti-chevron-down"></i>
    </button>
  </div>`;
}

function categoryChipsHTML(handle, isSelf) {
  const profile = USER_PROFILES[handle];
  const cats = profile ? profile.categories : [];
  if (!cats.length) return `<span class="cats-empty">カテゴリー未設定</span>`;
  return cats.map(cat => catChipHTML(handle, cat, isSelf)).join('');
}

function doVoteCategory(handle, catName, btn) {
  const profile = USER_PROFILES[handle];
  if (!profile) return;
  const cat = profile.categories.find(c => c.name === catName);
  if (!cat) return;
  const voteType = btn.dataset.side;
  const key = `${handle}:${catName}`;
  const prev = myVotes[key];

  // 投票者リストの更新
  if (!cat.agreeVoters) cat.agreeVoters = [];
  if (!cat.denyVoters)  cat.denyVoters  = [];
  cat.agreeVoters = cat.agreeVoters.filter(v => v !== myHandle);
  cat.denyVoters  = cat.denyVoters.filter(v => v !== myHandle);

  if (prev === 'agree') cat.agree = Math.max(0, cat.agree - 1);
  if (prev === 'deny')  cat.deny  = Math.max(0, cat.deny  - 1);

  if (prev === voteType) {
    myVotes[key] = null;
  } else {
    myVotes[key] = voteType;
    if (voteType === 'agree') { cat.agree++; cat.agreeVoters.unshift(myHandle); }
    else                      { cat.deny++;  cat.denyVoters.unshift(myHandle); }
  }

  const chip = btn.closest('.profile-cat-chip');
  if (!chip) return;
  const mv = myVotes[key];
  chip.className = `profile-cat-chip ${catTrustClass(cat.agree, cat.deny)}`;
  const aBtn = chip.querySelector('.cat-agree');
  const dBtn = chip.querySelector('.cat-deny');
  if (aBtn) {
    aBtn.className = `cat-vote-btn cat-agree${mv==='agree'?' voted':''}`;
    aBtn.querySelector('.cvote-num').textContent = cat.agree;
  }
  if (dBtn) {
    dBtn.className = `cat-vote-btn cat-deny${mv==='deny'?' voted':''}`;
    dBtn.querySelector('.cvote-num').textContent = cat.deny;
  }
}

function openCatDetail(handle, catName) {
  const profile = USER_PROFILES[handle];
  if (!profile) return;
  const cat = profile.categories.find(c => c.name === catName);
  if (!cat) return;

  const voterRow = (label, voters, total, colorCls) => {
    const shown = voters.slice(0, 5);
    const rest  = total - shown.length;
    const items = shown.map(v => {
      const isMe = v === myHandle;
      return `<span class="cd-voter${isMe?' cd-voter-me':''}">${isMe ? 'あなた' : v}</span>`;
    }).join('');
    const more = rest > 0 ? `<span class="cd-voter-more">他${rest}人</span>` : '';
    return `<div class="cd-voter-row">
      <span class="cd-voter-label ${colorCls}">${label}</span>
      <div class="cd-voters">${items}${more}${!voters.length?'<span class="cats-empty">なし</span>':''}</div>
    </div>`;
  };

  const agreeVoters = cat.agreeVoters || [];
  const denyVoters  = cat.denyVoters  || [];
  const tCls = catTrustClass(cat.agree, cat.deny);
  const trustLabel = tCls === 'trust-high' ? '信用度：高（同意多数）' : tCls === 'trust-low' ? '信用度：低（否定多数・要注意）' : '信用度：中';

  document.getElementById('cat-detail-body').innerHTML = `
    <div class="cd-chip-wrap">
      <div class="profile-cat-chip ${tCls}" style="pointer-events:none">
        <span class="cat-vote-btn cat-agree"><i class="ti ti-chevron-up"></i><span>${cat.agree}</span></span>
        <span class="cat-chip-name">${cat.name}</span>
        <span class="cat-vote-btn cat-deny"><span>${cat.deny}</span><i class="ti ti-chevron-down"></i></span>
      </div>
      <span class="cd-trust-label">${trustLabel}</span>
    </div>
    <div class="cd-section">
      <div class="cd-section-title"><i class="ti ti-pencil"></i> カテゴリー設定者</div>
      <span class="cd-setter">${cat.setBy === myHandle ? 'あなた' : cat.setBy}${cat.setBy === handle ? ' （本人）' : ''}</span>
    </div>
    <div class="cd-section">
      <div class="cd-section-title"><i class="ti ti-chevron-up" style="color:#166534"></i> 同意した人 <span class="cd-count">${cat.agree}人</span></div>
      ${voterRow('同意', agreeVoters, cat.agree, 'cd-label-agree')}
    </div>
    <div class="cd-section">
      <div class="cd-section-title"><i class="ti ti-chevron-down" style="color:#991b1b"></i> 否定した人 <span class="cd-count">${cat.deny}人</span></div>
      ${voterRow('否定', denyVoters, cat.deny, 'cd-label-deny')}
    </div>`;

  document.getElementById('cat-detail-overlay').classList.add('show');
  document.getElementById('cat-detail-modal').classList.add('show');
}
function closeCatDetail() {
  document.getElementById('cat-detail-overlay').classList.remove('show');
  document.getElementById('cat-detail-modal').classList.remove('show');
}

function renderMyCats() {
  const wrap = document.getElementById('my-cats-wrap');
  if (!wrap) return;
  const cats = (USER_PROFILES[myHandle] || USER_PROFILES['@you'] || {categories:[]}).categories;
  if (!cats.length) {
    wrap.innerHTML = `<span class="cats-empty">まだありません。「追加」から設定できます。</span>`;
    return;
  }
  // 投票数合計の多い順に並べ、上位5件を表示
  const sorted = [...cats].sort((a, b) => (b.agree + b.deny) - (a.agree + a.deny));
  const top  = sorted.slice(0, 5);
  const rest = sorted.slice(5);

  let html = top.map(cat => catChipHTML(myHandle, cat, true)).join('');
  if (rest.length) {
    html += `
      <button class="cats-more-btn" id="cats-more-btn" onclick="toggleMoreCats()">
        その他 ${rest.length}件 <i class="ti ti-chevron-down"></i>
      </button>
      <div class="cats-rest-wrap" id="cats-rest-wrap">
        ${rest.map(cat => catChipHTML(myHandle, cat, true)).join('')}
      </div>`;
  }
  wrap.innerHTML = html;
}

function toggleMoreCats() {
  const restWrap = document.getElementById('cats-rest-wrap');
  const btn = document.getElementById('cats-more-btn');
  const open = restWrap.classList.toggle('open');
  const count = restWrap.querySelectorAll('.profile-cat-chip').length;
  btn.innerHTML = open
    ? `閉じる <i class="ti ti-chevron-up"></i>`
    : `その他 ${count}件 <i class="ti ti-chevron-down"></i>`;
}

function openCatPicker(handle) {
  catPickerTargetHandle = handle || myHandle;
  const isSelf = catPickerTargetHandle === myHandle;
  // 名前は USER_PROFILES ではなく allUsers から取得（USER_PROFILES はカテゴリーデータ専用）
  const allUsers = [...FOLLOWS, ...FOLLOWERS, ...SAMPLE_USERS];
  const foundUser = allUsers.find(u => u.h === catPickerTargetHandle);
  const targetName = isSelf ? 'あなた' : (foundUser ? foundUser.n : catPickerTargetHandle);

  // モーダルタイトルを対象ユーザーに合わせて変更
  const titleEl = document.querySelector('#cat-picker-modal .modal-title');
  if (titleEl) {
    titleEl.innerHTML = isSelf
      ? '<i class="ti ti-tags"></i> カテゴリーを追加'
      : `<i class="ti ti-tags"></i> ${targetName}さんにカテゴリーを追加`;
  }

  // 入力欄の説明文も変える
  const descEl = document.querySelector('#cat-picker-modal .modal-body > p');
  if (descEl) {
    descEl.textContent = isSelf
      ? 'カテゴリー名を自由に入力できます。他のユーザーが同意・否定票を投じます。'
      : `${targetName}さんに合うカテゴリーを追加できます。他のユーザーも投票できます。`;
  }

  document.getElementById('cat-picker-overlay').classList.add('show');
  document.getElementById('cat-picker-modal').classList.add('show');
  const inp = document.getElementById('cat-free-input');
  if (inp) { inp.value = ''; inp.focus(); }
  document.getElementById('cat-free-msg').textContent = '';
}
function closeCatPicker() {
  document.getElementById('cat-picker-overlay').classList.remove('show');
  document.getElementById('cat-picker-modal').classList.remove('show');
}
function addMyCategoryFree() {
  const inp = document.getElementById('cat-free-input');
  const msg = document.getElementById('cat-free-msg');
  const name = inp.value.trim();
  if (!name) return;
  if (name.length > 20) { msg.textContent = '20文字以内で入力してください'; return; }

  const handle = catPickerTargetHandle || myHandle;
  if (!USER_PROFILES[handle]) USER_PROFILES[handle] = { categories: [] };
  const cats = USER_PROFILES[handle].categories;
  if (cats.find(c => c.name === name)) {
    msg.textContent = 'そのカテゴリーはすでに設定されています';
    inp.value = ''; return;
  }
  cats.push({ name, setBy: myHandle, agree: 0, deny: 0, agreeVoters: [], denyVoters: [] });
  inp.value = '';
  msg.textContent = `「${name}」を追加しました`;

  // 自分のカテゴリーなら Supabase へも保存
  if (handle === myHandle) {
    const _aid = localStorage.getItem('trendy_account_id');
    if (_aid && typeof dbSaveCategories === 'function') dbSaveCategories(_aid, cats);
    renderMyCats();
  } else {
    renderUserPageCats(handle);
  }
}

// ── Account Switch ─────────────────────────────────────
function selectAccount(type) {
  myAccountType = type;
  const isSub = type === 'sub' && hasSubAccount;

  // サブアカウントの表示情報
  const subN  = subAccountName  || '匿名ユーザー';
  const subH  = subAccountHandle || '@anon_you';
  const subAv = subN !== '匿名ユーザー' ? subN[0] : '匿';
  const subBg = '#ede9fe'; const subTc = '#5b21b6';
  const mainBg = '#dbeafe'; const mainTc = '#1e40af';

  // ── 投稿欄の切り替えボタン ──
  const mainBtn = document.getElementById('acct-main-btn');
  const subBtn  = document.getElementById('acct-sub-btn');
  if (mainBtn) {
    mainBtn.classList.toggle('active-main', !isSub);
    mainBtn.classList.toggle('active-sub',  false);
    subBtn.classList.toggle('active-sub',   isSub);
    subBtn.classList.toggle('active-main',  false);
  }
  const warn = document.getElementById('sub-warn-inline');
  if (warn) warn.style.display = isSub ? 'flex' : 'none';

  // ── サイドバー ──
  const sideChip = document.getElementById('sidebar-acct-type');
  const sideName = document.getElementById('sidebar-user-name');
  const sideHndl = document.getElementById('sidebar-user-handle');
  if (sideChip) {
    sideChip.textContent = isSub ? 'サブ' : 'メイン';
    sideChip.className = 'sidebar-acct-chip ' + (isSub ? 'chip-sub' : 'chip-main');
  }
  if (sideName) sideName.textContent = isSub ? subN : (myNickname || 'あなた');
  if (sideHndl) sideHndl.textContent = isSub ? subH : myHandle;

  // ── ホームのプロフィールバー ──
  const homeAv   = document.getElementById('home-av-display');
  const homeName = document.getElementById('home-profile-name');
  if (homeAv) {
    homeAv.textContent        = isSub ? subAv : 'あ';
    homeAv.style.background   = isSub ? subBg : mainBg;
    homeAv.style.color        = isSub ? subTc : mainTc;
  }
  if (homeName) {
    homeName.innerHTML = isSub
      ? `${subN} ${subBadge()}`
      : (myNickname || 'あなた');
  }

  // ── 投稿欄のアバター ──
  const composeAv = document.getElementById('home-compose-av');
  if (composeAv) {
    composeAv.textContent      = isSub ? subAv : 'あ';
    composeAv.style.background = isSub ? subBg : mainBg;
    composeAv.style.color      = isSub ? subTc : mainTc;
  }

  // ── マイページのプロフィール ──
  const myName     = document.getElementById('mypage-profile-name');
  const myHandleEl = document.getElementById('mypage-profile-handle');
  const myAv       = document.getElementById('my-av-display');
  if (myName) {
    myName.innerHTML = isSub
      ? `${subN} ${subBadge()}`
      : `${myNickname || 'あなた'} <span class="badge-main">メイン</span>`;
  }
  if (myHandleEl) myHandleEl.textContent = isSub ? subH : myHandle;
  if (myAv) {
    myAv.textContent      = isSub ? subAv : 'あ';
    myAv.style.background = isSub ? subBg : mainBg;
    myAv.style.color      = isSub ? subTc : mainTc;
  }
}

// ── Account Switch Page ────────────────────────────────
function renderAcctSwitch() {
  // 戻るボタン
  const backBtn = document.getElementById('acct-switch-back-btn');
  if (backBtn) backBtn.onclick = () => goPage(prevPageId, null);

  // サブ追加ボタン（既にある場合は非表示）
  const addSubBtn = document.getElementById('acct-add-sub-btn');
  if (addSubBtn) addSubBtn.style.display = hasSubAccount ? 'none' : '';

  // アカウント一覧を描画
  const body = document.getElementById('acct-switch-body');
  if (!body) return;
  const mainActive = myAccountType === 'main';
  const subActive  = myAccountType === 'sub';

  let html = `
    <div class="acct-card ${mainActive ? 'acct-active' : ''}">
      <div class="acct-card-av" style="background:#dbeafe;color:#1e40af">あ</div>
      <div class="acct-card-info">
        <div class="acct-card-name">あなた <span class="sidebar-acct-chip chip-main">メイン</span></div>
        <div class="acct-card-handle">${myHandle}</div>
        ${mainActive ? '<div class="acct-card-status"><i class="ti ti-check"></i> 使用中</div>' : ''}
      </div>
      ${mainActive
        ? '<i class="ti ti-check acct-check-icon"></i>'
        : '<button class="btn-sm" onclick="switchToAccount(\'main\')">切り替え</button>'}
    </div>`;

  if (hasSubAccount) {
    const av = subAccountName !== '匿名ユーザー' ? subAccountName[0] : '匿';
    html += `
    <div class="acct-card ${subActive ? 'acct-active' : ''}">
      <div class="acct-card-av" style="background:#ede9fe;color:#5b21b6">${av}</div>
      <div class="acct-card-info">
        <div class="acct-card-name">${subAccountName}
          <span class="badge-sub" style="font-size:10px;padding:2px 6px">
            <i class="ti ti-user-question" style="font-size:9px;vertical-align:-1px"></i> サブ
          </span>
        </div>
        <div class="acct-card-handle">${subAccountHandle}</div>
        ${subActive ? '<div class="acct-card-status"><i class="ti ti-check"></i> 使用中</div>' : ''}
      </div>
      ${subActive
        ? '<i class="ti ti-check acct-check-icon"></i>'
        : '<button class="btn-sm" onclick="switchToAccount(\'sub\')">切り替え</button>'}
    </div>`;
  }

  body.innerHTML = html;
}

function switchToAccount(type) {
  selectAccount(type);
  renderAcctSwitch();
}

// ── Register Page ──────────────────────────────────────
// ── Register (ID + Password) ────────────────────────────
function registerStep(n) {
  [1, 2].forEach(i => {
    const panel = document.getElementById('rpanel-' + i);
    if (panel) panel.style.display = i === n ? '' : 'none';
    const step  = document.getElementById('rstep-' + i);
    if (step) step.classList.toggle('active', i <= n);
  });
}

function validateRegId(input) {
  const val = input.value;
  const errEl = document.getElementById('reg-id-err');
  if (!val) { if (errEl) errEl.style.display = 'none'; return; }
  if (!/^[a-zA-Z0-9_]+$/.test(val)) {
    if (errEl) { errEl.textContent = '半角英数字・アンダースコアのみ使用可能です'; errEl.style.display = ''; }
  } else {
    if (errEl) errEl.style.display = 'none';
  }
}

function checkPwStrength(input) {
  const val = input.value;
  const wrap = document.getElementById('reg-pw-strength-wrap');
  const fill = document.getElementById('reg-pw-strength-fill');
  if (!wrap || !fill) return;
  if (!val) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  let score = 0;
  if (val.length >= 8)  score++;
  if (val.length >= 12) score++;
  if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const pct = Math.min(100, score * 20);
  const color = pct < 40 ? '#ef4444' : pct < 70 ? '#f59e0b' : '#22c55e';
  fill.style.width = pct + '%';
  fill.style.background = color;
}

function togglePwVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  const icon = btn.querySelector('i');
  if (icon) icon.className = isText ? 'ti ti-eye' : 'ti ti-eye-off';
}

function completeRegister() {
  const _val = id => (document.getElementById(id)?.value || '').trim();
  const _err = (id, msg) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? '' : 'none';
  };

  let ok = true;

  // ── ID ──
  const accountId = _val('reg-id');
  if (!accountId) {
    _err('reg-id-err', 'ユーザーIDを入力してください'); ok = false;
  } else if (!/^[a-zA-Z0-9_]+$/.test(accountId)) {
    _err('reg-id-err', '半角英数字・アンダースコアのみ使用可能です'); ok = false;
  } else { _err('reg-id-err', ''); }

  // ── パスワード ──
  const pw  = document.getElementById('reg-pw')?.value  || '';
  const pw2 = document.getElementById('reg-pw2')?.value || '';
  if (pw.length < 8) {
    _err('reg-pw-err', '8文字以上のパスワードを設定してください'); ok = false;
  } else { _err('reg-pw-err', ''); }
  if (pw !== pw2) {
    _err('reg-pw2-err', 'パスワードが一致しません'); ok = false;
  } else { _err('reg-pw2-err', ''); }

  if (!ok) return;

  // ── 利用規約 ──
  const terms = document.getElementById('reg-terms-chk');
  if (terms && !terms.checked) { showToast('利用規約に同意してください'); return; }

  // ── 完了ステップへ ──
  const nickname = _val('reg-name') || accountId;
  const desc = document.getElementById('reg-done-desc');
  if (desc) desc.innerHTML = `<b>@${accountId}</b> さん、ようこそ！<br>アカウントの設定が完了しました。`;
  registerStep(2);

  // ── 登録完了：データ保存（localStorage + Supabase） ──
  const _pwHash = btoa(unescape(encodeURIComponent(pw)));
  localStorage.setItem('trendy_registered',   'true');
  localStorage.setItem('trendy_logged_in',    'true');
  localStorage.setItem('trendy_account_id',   accountId);
  localStorage.setItem('trendy_account_pw',   _pwHash);

  // ニックネーム・ハンドルを保存・反映
  myNickname = nickname;
  localStorage.setItem('trendy_myName', nickname);
  _applyMyName();
  // ハンドルを登録IDに統合
  myHandle = '@' + accountId;
  catPickerTargetHandle = myHandle;
  if (!USER_PROFILES[myHandle]) {
    USER_PROFILES[myHandle] = USER_PROFILES['@you'] || { categories: [] };
  }
  _applyMyHandle();

  // Supabaseにも保存（クロスオリジン・クロスデバイス対応）
  if (typeof dbSaveProfile === 'function') {
    dbSaveProfile({
      accountId    : accountId,
      passwordHash : _pwHash,
      nickname     : nickname,
      bio          : '',
      isDev        : isDeveloper,
    });
  }

  // 戻るボタンを復元
  const regBack = document.getElementById('reg-back-btn');
  if (regBack) regBack.style.display = '';
}

// ── Sub Account Create Page ────────────────────────────
function subCreateStep(n) {
  [1,2,3].forEach(i => {
    const panel = document.getElementById('sspanel-'+i);
    if (panel) panel.style.display = i === n ? '' : 'none';
    const step = document.getElementById('ssstep-'+i);
    if (step) step.classList.toggle('active', i <= n);
  });
  if (n === 2) {
    const nameInput = (document.getElementById('sub-name-input').value || '').trim();
    const displayName = nameInput || '匿名ユーザー';
    const av = nameInput ? nameInput[0] : '匿';
    const nameEl = document.getElementById('sub-confirm-name');
    const avEl   = document.getElementById('sub-confirm-av');
    if (nameEl) nameEl.textContent = displayName;
    if (avEl)   avEl.textContent   = av;
  }
}

function completeSubCreate() {
  const nameInput = (document.getElementById('sub-name-input').value || '').trim();
  subAccountName   = nameInput || '匿名ユーザー';
  subAccountHandle = '@anon_you';
  hasSubAccount    = true;
  subCreateStep(3);
  // サイドバーのサブボタンを有効化
  const subBtn = document.getElementById('acct-sub-btn');
  if (subBtn) subBtn.disabled = false;
  // 通知タブを再描画（サブアカタブが出現するように）
  renderNotifTabs();
}

// ── Settings ───────────────────────────────────────────
function renderCatSettings() {
  const slider = document.getElementById('settings-width-slider');
  if (slider) slider.value = catColWidth;
  const val = document.getElementById('settings-width-val');
  if (val) val.textContent = catColWidth;
  document.getElementById('cat-sort-list').innerHTML = catOrder.map(id => {
    const cat = CATS_DATA.find(c=>c.id===id);
    const vis = catVisible[id];
    return `<div class="cat-sort-item">
      <i class="ti ti-grip-vertical" style="color:var(--text3)"></i>
      <i class="ti ${cat.icon}" style="color:${cat.color}"></i>
      <span class="cat-sort-name">${cat.name}</span>
      <button class="cat-toggle ${vis?'on':'off'}" onclick="toggleCatVisible('${id}',this)"></button>
      <span style="font-size:11px;color:var(--text3);min-width:32px">${vis?'表示':'非表示'}</span>
    </div>`;
  }).join('');
}

function toggleCatVisible(id, btn) {
  catVisible[id] = !catVisible[id];
  btn.className = 'cat-toggle ' + (catVisible[id]?'on':'off');
  btn.nextElementSibling.textContent = catVisible[id]?'表示':'非表示';
}

function toggleR18(cb) {
  if (cb.checked) {
    if (!confirm('R18コンテンツを表示します。18歳以上ですか？')) { cb.checked = false; return; }
  }
  document.getElementById('r18-warn').style.display = cb.checked ? 'flex' : 'none';
}

// ── Kids Mode ──────────────────────────────────────────
// State
const kidsState = {
  step: 1,
  kidName: '',
  kidYear: '', kidMonth: '', kidDay: '',
  kidGender: 'other',
  kidPhone: '',
  kidVerified: false,
  parentPhone: '',
  parentVerified: false,
  kidTimerInterval: null,
  parentTimerInterval: null,
};

function toggleKidsMode(cb) {
  if (cb.checked) {
    // 設定ページから子供モードページへ遷移
    goPage('kids', null);
    kidsReset();
  }
}

function kidsReset() {
  kidsState.step = 1;
  kidsState.kidVerified = false;
  kidsState.parentVerified = false;
  clearInterval(kidsState.kidTimerInterval);
  clearInterval(kidsState.parentTimerInterval);

  // フォームリセット
  const fields = ['kid-name','kid-phone','kid-code','parent-phone','parent-code'];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['kid-year','kid-month','kid-day'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });

  // UI リセット
  document.getElementById('kid-code-field').style.display = 'none';
  document.getElementById('kid-verified').style.display = 'none';
  document.getElementById('kid-next-btn').style.display = 'none';
  document.getElementById('kid-send-btn').style.display = '';
  document.getElementById('parent-code-field').style.display = 'none';
  document.getElementById('parent-verified').style.display = 'none';
  document.getElementById('parent-next-btn').style.display = 'none';
  document.getElementById('parent-send-btn').style.display = '';

  kidsUpdateSteps(1);
  kidsShowPanel(1);
}

function kidsStep(n) {
  // バリデーション
  if (n === 2) {
    const name = document.getElementById('kid-name').value.trim();
    const year = document.getElementById('kid-year').value;
    const month = document.getElementById('kid-month').value;
    const day = document.getElementById('kid-day').value;
    if (!name) { kidsAlert('お子さまの名前を入力してください'); return; }
    if (!year || !month || !day) { kidsAlert('生年月日をすべて選択してください'); return; }
    const age = calcAge(parseInt(year), parseInt(month), parseInt(day));
    if (age >= 18) {
      kidsAlert(`生年月日から計算すると ${age} 歳です。\n子供モードは18歳未満の方が対象です。`);
      return;
    }
    kidsState.kidName = name;
    kidsState.kidYear = year; kidsState.kidMonth = month; kidsState.kidDay = day;
    const gender = document.querySelector('input[name="kid-gender"]:checked');
    kidsState.kidGender = gender ? gender.value : 'other';
  }
  if (n === 3 && !kidsState.kidVerified) {
    kidsAlert('先にお子さまの電話番号認証を完了してください');
    return;
  }
  if (n === 4 && !kidsState.parentVerified) {
    kidsAlert('先に保護者の電話番号認証を完了してください');
    return;
  }
  if (n === 5) {
    renderKidsDoneSummary();
  }
  kidsState.step = n;
  kidsUpdateSteps(n);
  kidsShowPanel(n);
}

function calcAge(year, month, day) {
  const today = new Date();
  let age = today.getFullYear() - year;
  const m = today.getMonth() + 1 - month;
  if (m < 0 || (m === 0 && today.getDate() < day)) age--;
  return age;
}

function kidsAlert(msg) {
  // シンプルなインラインアラート
  alert(msg);
}

function kidsUpdateSteps(active) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('kstep-' + i);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < active) el.classList.add('done');
    if (i === active) el.classList.add('active');
  }
  // ステップライン
  const lines = document.querySelectorAll('.kids-step-line');
  lines.forEach((line, idx) => {
    line.classList.toggle('done', idx < active - 1);
  });
}

function kidsShowPanel(n) {
  for (let i = 1; i <= 5; i++) {
    const p = document.getElementById('kpanel-' + i);
    if (p) p.style.display = i === n ? 'block' : 'none';
  }
  // ページ上部へスクロール
  const page = document.getElementById('page-kids');
  if (page) page.scrollTop = 0;
}

// ── SMS送信（子供） ──
let kidTimerSec = 300;
function sendKidCode() {
  const phone = document.getElementById('kid-phone').value.trim();
  if (!phone) { kidsAlert('お子さまの電話番号を入力してください'); return; }
  if (phone.length < 10) { kidsAlert('正しい電話番号を入力してください'); return; }
  kidsState.kidPhone = phone;

  // SMS送信演出
  const btn = document.getElementById('kid-send-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> 送信中...';
  setTimeout(() => {
    btn.innerHTML = '<i class="ti ti-check"></i> 送信しました';
    document.getElementById('kid-code-field').style.display = 'block';
    startKidTimer();
  }, 1200);
}

function startKidTimer() {
  kidTimerSec = 300;
  clearInterval(kidsState.kidTimerInterval);
  kidsState.kidTimerInterval = setInterval(() => {
    kidTimerSec--;
    const el = document.getElementById('kid-timer');
    if (el) el.textContent = Math.floor(kidTimerSec/60) + ':' + String(kidTimerSec%60).padStart(2,'0');
    if (kidTimerSec <= 0) {
      clearInterval(kidsState.kidTimerInterval);
      if (el) el.textContent = '期限切れ';
    }
  }, 1000);
}

function verifyKidPhone() {
  const code = document.getElementById('kid-code').value.trim();
  if (code.length !== 6) { kidsAlert('6桁のコードを入力してください'); return; }

  const btn = document.querySelector('#kid-code-field .kids-verify-btn');
  btn.disabled = true;
  btn.textContent = '確認中...';
  setTimeout(() => {
    // デモ：任意の6桁で認証成功
    clearInterval(kidsState.kidTimerInterval);
    kidsState.kidVerified = true;
    document.getElementById('kid-code-field').style.display = 'none';
    document.getElementById('kid-verified').style.display = 'flex';
    document.getElementById('kid-send-btn').style.display = 'none';
    document.getElementById('kid-next-btn').style.display = '';
    btn.disabled = false;
    btn.textContent = '認証する';
  }, 1000);
}

// ── SMS送信（保護者） ──
let parentTimerSec = 300;
function sendParentCode() {
  const phone = document.getElementById('parent-phone').value.trim();
  if (!phone) { kidsAlert('保護者の電話番号を入力してください'); return; }
  if (phone.length < 10) { kidsAlert('正しい電話番号を入力してください'); return; }
  if (phone === kidsState.kidPhone) {
    kidsAlert('お子さまの電話番号と同じ番号は使用できません。\n保護者の方の別の電話番号を入力してください。');
    return;
  }
  kidsState.parentPhone = phone;

  const btn = document.getElementById('parent-send-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> 送信中...';
  setTimeout(() => {
    btn.innerHTML = '<i class="ti ti-check"></i> 送信しました';
    document.getElementById('parent-code-field').style.display = 'block';
    startParentTimer();
  }, 1200);
}

function startParentTimer() {
  parentTimerSec = 300;
  clearInterval(kidsState.parentTimerInterval);
  kidsState.parentTimerInterval = setInterval(() => {
    parentTimerSec--;
    const el = document.getElementById('parent-timer');
    if (el) el.textContent = Math.floor(parentTimerSec/60) + ':' + String(parentTimerSec%60).padStart(2,'0');
    if (parentTimerSec <= 0) {
      clearInterval(kidsState.parentTimerInterval);
      if (el) el.textContent = '期限切れ';
    }
  }, 1000);
}

function verifyParentPhone() {
  const code = document.getElementById('parent-code').value.trim();
  if (code.length !== 6) { kidsAlert('6桁のコードを入力してください'); return; }

  const btn = document.querySelector('#parent-code-field .kids-verify-btn');
  btn.disabled = true;
  btn.textContent = '確認中...';
  setTimeout(() => {
    clearInterval(kidsState.parentTimerInterval);
    kidsState.parentVerified = true;
    document.getElementById('parent-code-field').style.display = 'none';
    document.getElementById('parent-verified').style.display = 'flex';
    document.getElementById('parent-send-btn').style.display = 'none';
    document.getElementById('parent-next-btn').style.display = '';
    btn.disabled = false;
    btn.textContent = '認証する';
  }, 1000);
}

function renderKidsDoneSummary() {
  const genderLabel = { male:'男の子', female:'女の子', other:'回答しない' };
  const age = calcAge(parseInt(kidsState.kidYear), parseInt(kidsState.kidMonth), parseInt(kidsState.kidDay));
  document.getElementById('kids-done-summary').innerHTML = `
    <div style="font-size:12px;line-height:2;">
      <div><b>お子さまの名前：</b>${kidsState.kidName}</div>
      <div><b>年齢：</b>${age}歳（${kidsState.kidYear}年${kidsState.kidMonth}月${kidsState.kidDay}日生まれ）</div>
      <div><b>性別：</b>${genderLabel[kidsState.kidGender]}</div>
      <div><b>お子さまの電話番号：</b>${kidsState.kidPhone.replace(/(\d{3})(\d{4})(\d{4})/,'$1-****-$3')}</div>
      <div><b>保護者の電話番号：</b>${kidsState.parentPhone.replace(/(\d{3})(\d{4})(\d{4})/,'$1-****-$3')}</div>
    </div>`;
}

// ── フォロー / フォロワー / ファンランキング ─────────────────
function renderFollows() {
  // フォローページタブを初期化
  const tabBar = document.getElementById('follows-tabs');
  const firstTabBtn = tabBar.querySelector('.tab-btn');
  setFollowsTab('tab-following', firstTabBtn);
}

function setFollowsTab(tabId, btn) {
  // タブボタン切り替え
  document.querySelectorAll('#follows-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // タブコンテンツ切り替え
  document.querySelectorAll('[id^="tab-"]').forEach(t => {
    if (t.id.startsWith('tab-') && !t.id.includes('tab-bar')) t.style.display = 'none';
  });
  document.getElementById(tabId).style.display = 'block';

  // コンテンツ描画
  if (tabId === 'tab-following') renderFollowList();
  else if (tabId === 'tab-followers') renderFollowerList();
  else if (tabId === 'tab-oshi') renderOshiRank();
}

async function renderFollowList() {
  const feed = document.getElementById('follow-list');
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) {
    feed.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">ログインが必要です</div>';
    return;
  }
  feed.innerHTML = '<div style="padding:20px;text-align:center"><i class="ti ti-loader-2"></i></div>';

  const followingHandles = await dbFetchFollowing(aid);
  const followingIds = followingHandles.map(h => h.slice(1));
  console.log('[Follows] Following IDs:', followingIds);

  if (!followingIds || followingIds.length === 0) {
    feed.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">フォロー中のユーザーがいません</div>';
    return;
  }

  const profiles = await dbFetchProfilesByIds(followingIds);
  console.log('[Follows] Following Profiles:', profiles);

  if (!profiles || profiles.length === 0) {
    feed.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">フォロー中のユーザーがいません</div>';
    return;
  }

  feed.innerHTML = profiles.map(p => {
    const avHtml = p.avatar_data
      ? `<img src="${p.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<span style="font-size:16px;font-weight:700;color:#fff">${(p.nickname || p.account_id || '?')[0].toUpperCase()}</span>`;
    const avBg = p.avatar_data ? 'transparent' : '#3b82f6';
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border);cursor:pointer" onclick="openUserPage('@${p.account_id}')">
      <div style="width:40px;height:40px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:${avBg}">${avHtml}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--text)">${p.nickname || p.account_id}</div>
        <div style="font-size:12px;color:var(--text3)">${p.bio || '自己紹介がありません'}</div>
      </div>
      <button class="btn-sm" style="flex-shrink:0" onclick="event.stopPropagation();dbToggleFollow('${aid}','@${p.account_id}').then(() => renderFollowList())">フォロー中</button>
    </div>`;
  }).join('');
}

async function renderFollowerList() {
  const feed = document.getElementById('follower-list');
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) {
    feed.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">ログインが必要です</div>';
    return;
  }
  feed.innerHTML = '<div style="padding:20px;text-align:center"><i class="ti ti-loader-2"></i></div>';

  const followerIds = await dbFetchFollowers(aid);
  console.log('[Follows] Follower IDs:', followerIds);

  if (!followerIds || followerIds.length === 0) {
    feed.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">フォロワーがいません</div>';
    return;
  }

  const profiles = await dbFetchProfilesByIds(followerIds);
  console.log('[Follows] Follower Profiles:', profiles);

  if (!profiles || profiles.length === 0) {
    feed.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">フォロワーがいません</div>';
    return;
  }

  feed.innerHTML = profiles.map(p => {
    const avHtml = p.avatar_data
      ? `<img src="${p.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<span style="font-size:16px;font-weight:700;color:#fff">${(p.nickname || p.account_id || '?')[0].toUpperCase()}</span>`;
    const avBg = p.avatar_data ? 'transparent' : '#7c3aed';
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border);cursor:pointer" onclick="openUserPage('@${p.account_id}')">
      <div style="width:40px;height:40px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:${avBg}">${avHtml}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--text)">${p.nickname || p.account_id}</div>
        <div style="font-size:12px;color:var(--text3)">${p.bio || '自己紹介がありません'}</div>
      </div>
    </div>`;
  }).join('');
}

async function renderOshiRank() {
  const feed = document.getElementById('oshi-rank-list');
  feed.innerHTML = '<div style="padding:20px;text-align:center"><i class="ti ti-loader-2"></i></div>';

  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) {
    feed.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">ログインが必要です</div>';
    return;
  }

  const fans = await dbFetchFanLeaderboard(aid);

  if (!fans || fans.length === 0) {
    feed.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">まだファンがいません<br><span style="font-size:12px">他のユーザーがあなたの投稿を見たり、いいねやコメントをするとここに表示されます</span></div>';
    return;
  }

  const rankCls = i => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
  feed.innerHTML = fans.map((item, i) => {
    const p = item.profile;
    const name = p?.nickname || item.fan_account_id;
    const avHtml = p?.avatar_data
      ? `<img src="${p.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<span style="font-size:16px;font-weight:700">${(name || '?')[0].toUpperCase()}</span>`;
    const avBg = p?.avatar_data ? 'transparent' : '#3b82f6';
    return `<div class="fan-rank-item" onclick="openUserPage('@${item.fan_account_id}')">
      <span class="fan-rank-num ${rankCls(i)}">${i + 1}</span>
      <div style="width:40px;height:40px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:${avBg};color:#fff">${avHtml}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--text)">${name}</div>
        <div style="font-size:12px;color:var(--text3)">@${item.fan_account_id}</div>
      </div>
      <span class="fan-rank-level">レベル：${item.fan_level}</span>
    </div>`;
  }).join('');
}

// ── User Profile Page ──────────────────────────────────
function openUserPage(handle) {
  // 自分のアカウントはマイページへ
  if (handle === myHandle || handle === '@anon_you') {
    goPage('mypage', null);
    return;
  }
  const allUsers = [...FOLLOWS, ...FOLLOWERS, ...SAMPLE_USERS];
  const _hId = handle.startsWith('@') ? handle.slice(1) : handle;
  const _initLetter = (_hId[0] || '?').toUpperCase();
  const u = allUsers.find(u => u.h === handle) || {n:_hId, h:handle, av:_initLetter, bg:'#3b82f6', tc:'#ffffff'};

  currentUserHandle = handle;
  userPostFilter = 'all';

  document.getElementById('user-page-back-btn').onclick = () => goPage(prevPageId, null);
  document.getElementById('user-page-title').textContent = u.n;

  const avEl = document.getElementById('user-page-av');
  // アバターをいったんデフォルト（文字）にリセット
  avEl.innerHTML = (u.av && u.av.includes?.('<img')) ? u.av : (u.av || '?');
  avEl.style.background = u.bg;
  avEl.style.color = u.tc;

  // カバー画像・自己紹介もリセット
  const coverEl = document.getElementById('user-page-cover');
  if (coverEl) { coverEl.style.backgroundImage = ''; }
  const bioEl = document.getElementById('user-page-bio');
  if (bioEl) bioEl.textContent = '-';

  document.getElementById('user-page-name').innerHTML =
    `${u.sub ? '匿名ユーザー' : u.n} ${u.sub ? subBadge() : '<span class="badge-main">メイン</span>'}`;
  document.getElementById('user-page-handle').textContent = handle;

  const meta = document.getElementById('user-page-meta');
  if (!u.sub && (u.age || u.gender || u.region)) {
    meta.innerHTML = [
      u.gender ? `<span><i class="ti ti-user"></i> ${u.gender}</span>` : '',
      u.age    ? `<span><i class="ti ti-calendar"></i> ${u.age}</span>` : '',
      u.region ? `<span><i class="ti ti-map-pin"></i> ${u.region}</span>` : '',
    ].filter(Boolean).join('');
    meta.style.display = '';
  } else {
    meta.innerHTML = '';
  }

  // ダミーのフォロー数・フォロワー数・投稿数
  const seed = handle.charCodeAt(1) || 65;
  document.getElementById('user-page-following-count').textContent = ((seed * 7) % 300 + 50).toLocaleString();
  document.getElementById('user-page-follower-count').textContent  = ((seed * 13) % 1000 + 100).toLocaleString();
  document.getElementById('user-page-post-count').textContent      = ((seed * 3) % 200 + 10).toLocaleString();

  // フォローボタン
  const followBtn = document.getElementById('user-page-follow-btn');
  const isFollowing = followingSet.has(handle);
  followBtn.textContent = isFollowing ? 'フォロー中' : 'フォローする';
  followBtn.className = 'btn-sm' + (isFollowing ? ' btn-following' : '');
  followBtn.onclick = () => toggleFollow(handle);

  // カテゴリー
  renderUserPageCats(handle);

  // フィルターリセット
  const pills = document.querySelectorAll('#user-post-filter-pills .pill');
  pills.forEach(p => p.classList.remove('active'));
  if (pills[0]) pills[0].classList.add('active');

  renderUserPagePosts();
  goPage('user', null);

  // Supabase からプロフィール情報を非同期取得（ページ表示後に上書き反映）
  const _upAccountId = handle.startsWith('@') ? handle.slice(1) : handle;

  // 推しアイコン・ソーシャルリンクをリセット
  const oshiRow = document.getElementById('user-page-oshi-row');
  if (oshiRow) oshiRow.style.display = 'none';
  const socialEl = document.getElementById('user-page-social-links');
  if (socialEl) { socialEl.innerHTML = ''; socialEl.style.display = 'none'; }

  if (_upAccountId && typeof dbFetchProfile === 'function') {
    dbFetchProfile(_upAccountId).then(profile => {
      if (!profile) return;
      // アバター
      if (profile.avatar_data) {
        avEl.style.background = '';
        avEl.style.color = '';
        avEl.innerHTML = `<img src="${profile.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      }
      // カバー
      if (profile.cover_data && coverEl) {
        coverEl.style.backgroundImage    = `url(${profile.cover_data})`;
        coverEl.style.backgroundSize     = 'cover';
        coverEl.style.backgroundPosition = 'center';
      }
      // 自己紹介
      if (profile.bio && bioEl) bioEl.textContent = profile.bio;
      // 外部ソーシャルリンク
      if (profile.social_links) _renderSocialLinks(profile.social_links, 'user-page-social-links');
      // ニックネーム・名前タグ
      if (profile.nickname) {
        const nameEl    = document.getElementById('user-page-name');
        const nameTagHtml = profile.name_tag
          ? `<span class="tweet-name-tag">＠${profile.name_tag}</span>` : '';
        if (nameEl) nameEl.innerHTML =
          `${profile.nickname} ${nameTagHtml} ${u.sub ? subBadge() : '<span class="badge-main">メイン</span>'}`;
        document.getElementById('user-page-title').textContent = profile.nickname;
      }
      // カテゴリー（Supabase から取得して USER_PROFILES に反映）
      if (profile.categories && Array.isArray(profile.categories) && profile.categories.length > 0) {
        if (!USER_PROFILES[handle]) USER_PROFILES[handle] = { categories: [] };
        USER_PROFILES[handle].categories = profile.categories;
        renderUserPageCats(handle);
      }
    }).catch(() => {});
  }

  // そのユーザーの推しアイコンを表示
  if (_upAccountId && typeof dbFetchUserFavorites === 'function') {
    _renderUserPageOshiRow(_upAccountId);
  }
}

async function _renderUserPageOshiRow(targetAccountId) {
  const row = document.getElementById('user-page-oshi-row');
  const iconsEl = document.getElementById('user-page-oshi-icons');
  if (!row || !iconsEl) return;

  const favs = await dbFetchUserFavorites(targetAccountId);
  const slots = [favs?.favorite_1, favs?.favorite_2, favs?.favorite_3].filter(Boolean);

  if (slots.length === 0) { row.style.display = 'none'; return; }

  // プロフィールとファンレベルを並行取得
  const [profiles, ...fanDataArr] = await Promise.all([
    (typeof dbFetchProfilesByIds === 'function') ? dbFetchProfilesByIds(slots) : [],
    ...slots.map(aid =>
      (typeof dbGetFanLevel === 'function') ? dbGetFanLevel(targetAccountId, aid) : null
    ),
  ]);
  const profMap = {};
  (profiles || []).forEach(p => { profMap[p.account_id] = p; });

  iconsEl.innerHTML = slots.map((accountId, i) => {
    const p = profMap[accountId];
    const name = p?.nickname || accountId;
    const avHtml = p?.avatar_data
      ? `<img src="${p.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<span style="font-size:13px;font-weight:700">${name[0].toUpperCase()}</span>`;
    const avBg = p?.avatar_data ? 'transparent' : '#3b82f6';
    const level = fanDataArr[i]?.fan_level ?? 0;
    return `<div class="mypage-fav-av" onclick="openUserPage('@${accountId}')" style="cursor:pointer" title="${name}">
      <div class="mypage-fav-av-inner filled" style="background:${avBg};color:#fff;display:flex;align-items:center;justify-content:center">
        ${avHtml}
      </div>
      <div class="mypage-fav-lv">${level}</div>
    </div>`;
  }).join('');

  row.style.display = '';
}

// ── 外部ソーシャルリンク ─────────────────────────────────────
const SOCIAL_MAX = 5;
let _socialSlots = []; // [{url:'', icon:''}, ...]

/** マイページのソーシャルリンクを Supabase から読んで表示 */
async function _loadMypageSocialLinks() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || typeof dbFetchProfile !== 'function') return;
  const profile = await dbFetchProfile(aid).catch(() => null);
  _renderSocialLinks(profile?.social_links, 'mypage-social-links');
}

/** 保存データ（配列 or 旧オブジェクト形式）からスロットを初期化して描画 */
function _initSocialSlots(linksData) {
  if (Array.isArray(linksData)) {
    _socialSlots = linksData.map(item => ({ url: item.url || '', icon: item.icon || '' }));
  } else if (linksData && typeof linksData === 'object') {
    // 旧フォーマット {pixiv, x, youtube} → 配列変換
    _socialSlots = [];
    if (linksData.pixiv)   _socialSlots.push({ url: linksData.pixiv,   icon: '' });
    if (linksData.x)       _socialSlots.push({ url: linksData.x,       icon: '' });
    if (linksData.youtube) _socialSlots.push({ url: linksData.youtube, icon: '' });
  } else {
    _socialSlots = [];
  }
  _renderSocialSlotsUI();
}

/** プロフィール編集画面のスロット一覧を再描画 */
function _renderSocialSlotsUI() {
  const container = document.getElementById('pe-social-slots');
  const addBtn    = document.getElementById('pe-social-add-btn');
  if (!container) return;

  container.innerHTML = _socialSlots.map((slot, i) => `
    <div class="social-slot">
      <div class="social-slot-icon-wrap" onclick="pickSocialIcon(${i})" title="アイコンを変更">
        <div class="social-slot-icon" id="social-slot-icon-${i}">
          ${slot.icon
            ? `<img src="${slot.icon}">`
            : '<i class="ti ti-photo" style="font-size:15px;color:var(--text3)"></i>'}
        </div>
      </div>
      <input type="url" class="test-input social-slot-url" id="social-slot-url-${i}"
        placeholder="https://..." value="${slot.url || ''}"
        oninput="_onSocialUrlChange(${i},this.value)" style="flex:1">
      <button class="social-slot-remove" onclick="removeSocialSlot(${i})" title="削除">
        <i class="ti ti-x"></i>
      </button>
    </div>`
  ).join('');

  if (addBtn) addBtn.style.display = _socialSlots.length >= SOCIAL_MAX ? 'none' : '';
}

function addSocialSlot() {
  if (_socialSlots.length >= SOCIAL_MAX) return;
  _socialSlots.push({ url: '', icon: '' });
  _renderSocialSlotsUI();
  const newInput = document.getElementById(`social-slot-url-${_socialSlots.length - 1}`);
  if (newInput) newInput.focus();
}

function removeSocialSlot(idx) {
  _socialSlots.splice(idx, 1);
  _renderSocialSlotsUI();
}

function _onSocialUrlChange(idx, val) {
  if (_socialSlots[idx]) _socialSlots[idx].url = val;
}

/** アイコン画像をファイルピッカーで選択して64×64にリサイズ */
function pickSocialIcon(idx) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        canvas.getContext('2d').drawImage(img, 0, 0, 64, 64);
        const dataUrl = canvas.toDataURL('image/png', 0.85);
        if (_socialSlots[idx]) {
          _socialSlots[idx].icon = dataUrl;
          const iconEl = document.getElementById(`social-slot-icon-${idx}`);
          if (iconEl) iconEl.innerHTML = `<img src="${dataUrl}">`;
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

/** ユーザーページでソーシャルリンクアイコン群を描画 */
function _renderSocialLinks(linksData, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  let items = [];
  if (Array.isArray(linksData)) {
    items = linksData.filter(item => item?.url);
  } else if (linksData && typeof linksData === 'object') {
    if (linksData.pixiv)   items.push({ url: linksData.pixiv,   icon: '' });
    if (linksData.x)       items.push({ url: linksData.x,       icon: '' });
    if (linksData.youtube) items.push({ url: linksData.youtube, icon: '' });
  }

  if (items.length === 0) { el.style.display = 'none'; return; }

  el.innerHTML = items.map(item => {
    const iconHtml = item.icon
      ? `<img src="${item.icon}" style="width:100%;height:100%;object-fit:cover">`
      : `<i class="ti ti-link" style="font-size:14px;color:var(--text2)"></i>`;
    return `<a class="social-link-btn" href="${item.url}" target="_blank" rel="noopener noreferrer" title="${item.url}">${iconHtml}</a>`;
  }).join('');
  el.style.display = 'flex';
}

function renderUserPageCats(handle) {
  const wrap    = document.getElementById('user-page-cats-wrap');
  const section = document.getElementById('user-page-cats-section');
  const addBtn  = document.getElementById('user-page-cat-add-btn');
  const hintEl  = document.getElementById('user-page-cat-hint');
  if (!wrap || !section) return;

  // 常に表示、追加ボタンのonclickをセット
  section.style.display = '';
  if (addBtn) addBtn.onclick = () => openCatPicker(handle);

  const profile = USER_PROFILES[handle];
  const isSelf  = handle === myHandle;

  // カテゴリーがない場合
  if (!profile || !profile.categories.length) {
    wrap.innerHTML = `<span class="cats-empty">まだカテゴリーがありません。「追加」から設定できます。</span>`;
    if (hintEl) hintEl.innerHTML = isSelf
      ? '<i class="ti ti-info-circle"></i> 他のユーザーが同意・否定で投票 ／ メイン・サブ含め1票のみ有効'
      : '<i class="ti ti-info-circle"></i> このユーザーに合うカテゴリーを追加できます。↑↓で投票もできます。';
    return;
  }

  // カテゴリー一覧を投票数順で表示
  const sorted = [...profile.categories].sort((a, b) => (b.agree + b.deny) - (a.agree + a.deny));
  const top  = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  let html = top.map(cat => catChipHTML(handle, cat, isSelf)).join('');
  if (rest.length) {
    html += `<button class="cats-more-btn" onclick="toggleUserMoreCats(this)">その他 ${rest.length}件 <i class="ti ti-chevron-down"></i></button>
    <div class="cats-rest-wrap">${rest.map(cat => catChipHTML(handle, cat, isSelf)).join('')}</div>`;
  }
  wrap.innerHTML = html;

  if (hintEl) hintEl.innerHTML = isSelf
    ? '<i class="ti ti-info-circle"></i> 他のユーザーが同意・否定で投票 ／ メイン・サブ含め1票のみ有効'
    : '<i class="ti ti-info-circle"></i> カテゴリーを追加したり、↑↓で投票できます（1アカウント1票）';
}

function toggleUserMoreCats(btn) {
  const restWrap = btn.nextElementSibling;
  restWrap.classList.toggle('open');
  btn.querySelector('i').className = restWrap.classList.contains('open') ? 'ti ti-chevron-up' : 'ti ti-chevron-down';
}

function setUserPostFilter(type, btn) {
  userPostFilter = type;
  pillActive(btn, 'user-post-filter-pills');
  renderUserPagePosts();
}

function renderUserPagePosts() {
  const feed = document.getElementById('user-page-feed');
  const isSelf = currentUserHandle === myHandle || currentUserHandle === '@anon_you';

  if (isSelf) {
    // 自分のページ：myPosts から表示
    const tweets = myPosts.filter(t =>
      t.user.h === currentUserHandle || currentUserHandle === myHandle || currentUserHandle === '@anon_you'
    );
    _renderUserFeed(feed, tweets);
  } else {
    // 他ユーザーのページ：Supabase から実投稿を取得
    feed.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2)"><i class="ti ti-loader-2" style="font-size:24px"></i></div>';
    if (typeof dbFetchPostsByHandle === 'function') {
      dbFetchPostsByHandle(currentUserHandle).then(async dbPosts => {
        if (!dbPosts.length) {
          _renderUserFeed(feed, []);
          return;
        }
        // 投稿者のプロフィール（アバター・名前タグ）を取得
        const accountId = currentUserHandle.startsWith('@') ? currentUserHandle.slice(1) : currentUserHandle;
        let avImg   = null;
        let prof    = null; // ← スコープをブロック外に出す
        if (typeof dbFetchProfile === 'function') {
          prof = await dbFetchProfile(accountId);
          if (prof?.avatar_data) {
            avImg = `<img src="${prof.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
          }
        }
        const profNameTag = prof?.name_tag || null;

        // HOME_TWEETS 形式に変換（全フィールドを正しく復元）
        const tweets = dbPosts.map(p => ({
          db_id    : p.id,
          catId    : p.cat_id    || null,
          text     : p.content,
          likes    : p.likes_count  || 0,
          rt       : p.rt_count     || 0,
          views    : p.views_count  || 0,
          time     : _relativeTime(p.created_at),
          ai       : p.ai_type      || 'none',
          mediaData: p.media_data   || null,
          mediaType: p.media_type   || null,
          tags     : Array.isArray(p.tags) ? p.tags : [],
          rank     : 0,
          isDummy  : false,
          user     : {
            h      : p.user_handle,
            n      : p.user_name,
            av     : p.is_sub ? '匿' : (avImg || (p.user_name || '?')[0].toUpperCase()),
            bg     : '#3b82f6',
            tc     : '#ffffff',
            sub    : p.is_sub,
            nameTag: p.name_tag || profNameTag, // DB値 → プロフィール現在値の順でフォールバック
          },
        }));
        _renderUserFeed(feed, tweets);
      }).catch(() => _renderUserFeed(feed, []));
    } else {
      _renderUserFeed(feed, []);
    }
  }
}

function _renderUserFeed(feed, tweets) {
  const filtered = userPostFilter === 'all'
    ? tweets
    : tweets.filter(t => (t.mediaType || t.media) === userPostFilter);

  if (!filtered.length) {
    const labelMap = {text:'文字のみの投稿', image:'画像投稿', video:'動画投稿'};
    feed.innerHTML = `<div class="user-posts-empty">
      <i class="ti ti-${userPostFilter === 'image' ? 'photo' : userPostFilter === 'video' ? 'video' : 'align-left'}" style="font-size:28px;display:block;margin-bottom:10px"></i>
      ${labelMap[userPostFilter] || '投稿'}がありません
    </div>`;
    return;
  }
  feed.innerHTML = filtered.map(t => userPostCardHTML(t)).join('');
}

function userPostCardHTML(t) {
  const idx = _reg(t);
  const u = t.user;
  const mediaType = t.mediaType || t.media; // 実投稿はmediaType、ダミーはmedia
  const mediaIcon = mediaType === 'image'
    ? '<span class="media-type-badge badge-image"><i class="ti ti-photo"></i> 画像</span>'
    : mediaType === 'video'
    ? '<span class="media-type-badge badge-video"><i class="ti ti-video"></i> 動画</span>'
    : '';
  const mediaBlock = t.mediaData
    ? (t.mediaType === 'image'
        ? `<div class="tweet-media"><img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" onclick="event.stopPropagation();openImageViewer(this.src)"></div>`
        : `<div class="tweet-media"><video src="${t.mediaData}" controls class="tweet-media-vid" preload="metadata"></video></div>`)
    : (mediaType === 'image'
        ? '<div class="tweet-media-placeholder"><i class="ti ti-photo"></i> 画像</div>'
        : mediaType === 'video'
        ? '<div class="tweet-media-placeholder video"><i class="ti ti-video"></i> 動画</div>'
        : '');
  return `<div class="tweet-card" data-db-id="${t.db_id||''}">
    <div class="tweet-av clickable" style="background:${u.bg};color:${u.tc};overflow:hidden;" onclick="openUserPage('${u.h}')">${u.av}</div>
    <div class="tweet-body">
      <div class="tweet-header">
        <span class="tweet-name clickable" onclick="openUserPage('${u.h}')">${u.sub ? '匿名ユーザー' : u.n}</span>
        ${u.nameTag ? `<span class="tweet-name-tag">＠${u.nameTag}</span>` : ''}
        ${u.sub ? subBadge() : ''}
        <span class="tweet-handle">${u.h}</span>
        <span class="tweet-time">${t.time}</span>
        ${mediaIcon}
      </div>
      <div class="tweet-clickable-body" onclick="openTweetDetail(${idx})">
        ${t.text ? `<div class="tweet-text">${t.text}</div>` : ''}
        ${mediaBlock}
      </div>
      <div class="tweet-actions">
        <button class="action-btn reply-btn" onclick="openTweetDetail(${idx})"><i class="ti ti-message-circle"></i><span id="reply-count-${idx}">${(tweetReplies[idx]||[]).length||''}</span></button>
        <button class="action-btn like-btn${likedTweets.has(idx)?' liked':''}" onclick="toggleLike(${idx},this)"><i class="ti ti-heart${likedTweets.has(idx)?'-filled':''}" style="${likedTweets.has(idx)?'color:#e11d48':''}"></i><span class="like-count">${fmt(t.likes)}</span></button>
        <span class="action-btn" style="pointer-events:none;cursor:default"><i class="ti ti-eye"></i><span>${fmt(t.views)}</span></span>
      </div>
    </div>
  </div>`;
}

// ── カテゴリー表示をすべてリセット ────────────────────────────
function resetAllCatVisible() {
  CATS_DATA.forEach(c => { catVisible[c.id] = true; });
  catOrder = CATS_DATA.filter(c => c.id !== 'all').map(c => c.id);
  renderCatSettings();
  renderCatGrid();
  showToast('カテゴリー表示をすべてリセットしました', 'success');
}

// ── Pachinko Effects ──────────────────────────────────

function spawnConfetti(count = 35) {
  const colors = ['#f59e0b','#ef4444','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#f97316'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    const size = 5 + Math.random() * 9;
    el.style.cssText = `
      left:${10 + Math.random()*80}vw;
      top:${30 + Math.random()*30}vh;
      width:${size}px; height:${size}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      border-radius:${Math.random()>0.5?'50%':'3px'};
      animation-delay:${Math.random()*0.6}s;
      animation-duration:${0.9 + Math.random()*0.9}s;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
}

function animateSlot(el, from, to, duration, onDone) {
  const start = Date.now();
  const spinPhase = duration * 0.65;
  el.classList.add('slot-spinning');
  const tick = () => {
    const t = Date.now() - start;
    if (t < spinPhase) {
      // スロット回転フェーズ：ランダム数字を高速表示
      el.textContent = Math.floor(from + Math.random() * (to - from + 80)).toLocaleString();
      requestAnimationFrame(tick);
    } else {
      // 着地フェーズ：easeOutQuint で収束
      const p = Math.min((t - spinPhase) / (duration - spinPhase), 1);
      const e = 1 - Math.pow(1 - p, 5);
      const cur = Math.round(from + (to - from) * e);
      el.textContent = cur.toLocaleString();
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        el.classList.remove('slot-spinning');
        el.textContent = to.toLocaleString();
        if (onDone) onDone();
      }
    }
  };
  requestAnimationFrame(tick);
}


function showFollowerNotifEffect(count, names) {
  const list = names || [];
  const INTERVAL   = 650;  // 1人ずつの間隔 (ms)
  const FIRST_IN   = 600;  // 最初の人が入るまでの待機
  const AV_COLORS  = [
    ['#dbeafe','#1e40af'], ['#d1fae5','#065f46'], ['#fce7f3','#be185d'],
    ['#ede9fe','#5b21b6'], ['#fef3c7','#92400e']
  ];

  // 各人物の行を生成
  const personHTML = list.map((name, i) => {
    const [bg, tc] = AV_COLORS[i % AV_COLORS.length];
    const av = name[0];
    return `<div class="eff-person-row" style="animation-delay:${FIRST_IN + i * INTERVAL}ms">
      <div class="eff-person-av" style="background:${bg};color:${tc}">${av}</div>
      <span class="eff-person-name">${name}</span>
      <i class="ti ti-user-check eff-person-badge"></i>
    </div>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'effect-overlay';
  overlay.innerHTML = `
    <div class="effect-card follower-card-v2">
      <div class="effect-shine"></div>
      <span class="effect-icon">👥</span>
      <div class="effect-title">フォロワーが増えました！</div>
      <div class="eff-entry-label" id="eff-entry-lbl">
        <i class="ti ti-door-enter"></i> 入場中…
      </div>
      <div class="eff-person-stage">${personHTML}</div>
      <div class="effect-gain" id="eff-follow-count" style="opacity:0;transform:scale(0.2)">
        ＋${count}人！🎊
      </div>
      <div class="effect-dismiss">タップで閉じる</div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());

  // 最後の人が入り終わるタイミング
  const lastEnterAt = FIRST_IN + (list.length - 1) * INTERVAL + 550;

  // ドア閉まる → ラベル変更
  setTimeout(() => {
    const lbl = document.getElementById('eff-entry-lbl');
    if (lbl) {
      lbl.innerHTML = '<i class="ti ti-door-off"></i> 入場完了！';
      lbl.classList.add('eff-entry-done');
    }
  }, lastEnterAt);

  // カウントバッジ登場 + 紙吹雪
  setTimeout(() => {
    const countEl = document.getElementById('eff-follow-count');
    if (countEl) {
      countEl.style.transition = 'all 0.65s cubic-bezier(0.34,1.56,0.64,1)';
      countEl.style.opacity    = '1';
      countEl.style.transform  = 'scale(1)';
    }
    spawnConfetti(55);
  }, lastEnterAt + 600);

  // 自動クローズ
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, lastEnterAt + 8000);
}

function showRankingEffect(rank, catName) {
  const rankLabel = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏆';
  const startFrom = Math.max(rank + 7, 10);

  const overlay = document.createElement('div');
  overlay.className = 'effect-overlay';
  overlay.innerHTML = `
    <div class="effect-card rank-card" id="eff-rank-card">
      <div class="effect-shine"></div>
      <span class="effect-icon" id="eff-icon">🎰</span>
      <div class="effect-title">${catName} ランキング入り！</div>
      <div class="rank-countdown-area">
        <div class="rank-cnt-label">現在の順位</div>
        <div class="rank-cnt-row">
          <div class="rank-cnt-num" id="eff-cnt-num">${startFrom}</div>
          <div class="rank-cnt-unit">位</div>
        </div>
      </div>
      <div class="effect-gain gold-gain" id="eff-rank-badge" style="opacity:0;transform:scale(0.4)"></div>
      <div class="effect-sub" id="eff-sub" style="opacity:0">おめでとうございます！</div>
      <div class="effect-dismiss">タップで閉じる</div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());

  // カウントダウンのステップを生成（startFrom → rank）
  const steps = [];
  for (let n = startFrom; n >= rank; n--) steps.push(n);

  const numEl   = document.getElementById('eff-cnt-num');
  const iconEl  = document.getElementById('eff-icon');
  const badge   = document.getElementById('eff-rank-badge');
  const sub     = document.getElementById('eff-sub');
  const card    = document.getElementById('eff-rank-card');

  // ステップ間の遅延：最初は速く、最後に向かってどんどん遅くなる（パチンコ演出）
  const MIN_DELAY  = 80;   // 最初のステップ間隔 (ms)
  const GROW       = 1.5;  // 遅くなる倍率
  const MAX_DELAY  = 900;  // 最大ステップ間隔 (ms)
  const INIT_PAUSE = 450;  // カード表示後に開始するまでの間 (ms)

  let cumTime = INIT_PAUSE;

  for (let i = 1; i < steps.length; i++) {
    const delay   = Math.min(MIN_DELAY * Math.pow(GROW, i - 1), MAX_DELAY);
    cumTime      += delay;
    const cur     = steps[i];
    const isLast  = (i === steps.length - 1);

    setTimeout(() => {
      // 数字を更新＋アニメーション
      numEl.textContent = cur;
      numEl.classList.remove('cnt-pop', 'cnt-land');
      void numEl.offsetWidth; // reflow でアニメーションをリセット
      numEl.classList.add(isLast ? 'cnt-land' : 'cnt-pop');

      if (isLast) {
        // アイコンをメダルに差し替え
        setTimeout(() => {
          iconEl.textContent = rankLabel;
          iconEl.classList.add('eff-icon-swap');
        }, 180);

        // カードを光らせる
        card.classList.add('rank-card-flash');

        // 達成バッジをポン！と出す（テキストはここで初めてセット）
        setTimeout(() => {
          badge.textContent      = `#${rank}位 達成！🎊`;
          badge.style.transition = 'all 0.5s cubic-bezier(0.34,1.56,0.64,1)';
          badge.style.opacity    = '1';
          badge.style.transform  = 'scale(1)';
        }, 320);

        // サブテキスト
        setTimeout(() => {
          sub.style.transition = 'opacity 0.4s ease';
          sub.style.opacity    = '1';
        }, 650);

        // 紙吹雪！
        spawnConfetti(65);
      }
    }, cumTime);
  }

  // 一定時間後に自動で閉じる
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, cumTime + 6000);
}

// ── Ad System ─────────────────────────────────────────
// ユーザー別表示回数トラッキング { adId: count }
const adUserShown = {};
// セッション中に出稿した広告（page-ads で作成）
const userCreatedAds = [];
let adIdCounter = 100; // ユーザー作成広告のID開始番号

/** 全広告（サンプル＋ユーザー作成）を課金額降順で返す */
function getAllAdsSorted() {
  // DBキャッシュがあればDB優先、なければローカルデータにフォールバック
  const base = dbGetCachedAds() || ADS_DATA;
  return [...base, ...userCreatedAds].sort((a, b) => b.budget - a.budget);
}

/**
 * 表示できる広告をフィルタ（サブカテゴリー対応）
 *
 * catId='all', subName=null  → ランキングページ：全体広告のみ
 * catId='anime', subName=null → アニメドリルダウン：アニメ全体 + 全体
 * catId='anime', subName='ウマ娘' → ウマ娘FS：ウマ娘 + アニメ全体 + 全体
 */
function getVisibleAds(catId = 'all', subName = null) {
  return getAllAdsSorted().filter(ad => {
    const shown = adUserShown[ad.id] || 0;
    if (shown >= ad.maxPerUser) return false;

    const adCat = ad.catId || 'all';
    const adSub = ad.subName || null;

    // 全体広告（catId='all'）は常に対象
    if (adCat === 'all') return true;

    // ランキングページ（catId='all'）は全体広告のみ
    if (catId === 'all') return false;

    // カテゴリーが違えば除外
    if (adCat !== catId) return false;

    // カテゴリーが一致
    if (!adSub) return true;                           // カテゴリー全体向け
    if (subName && adSub === subName) return true;     // サブカテゴリー一致
    return false;
  });
}

/** 広告カードの HTML を生成する共通関数 */
function _adCardHTML(ad, rank) {
  const rankCls = rank <= 3 ? `ad-rank-top${rank}` : 'ad-rank-other';
  const stripBg = ad.img ? 'rgba(0,0,0,0.48)' : ad.tc;
  const rightContent = ad.img
    ? `<div class="ad-card-img-wrap"><img class="ad-card-img" src="${ad.img}" alt="広告画像"></div>`
    : `<div class="ad-card-text-content" style="background:${ad.bg}">
         <div class="ad-card-advertiser" style="color:${ad.tc}">${ad.advertiser}</div>
         <div class="ad-card-text">${ad.text}</div>
       </div>`;
  return `<div class="ad-rank-card" style="border-color:${ad.tc}44;background:${ad.bg}" onclick="openAdDetail(${ad.id})">
    <div class="ad-card-left-strip" style="background:${stripBg}">
      <span class="ad-rank-badge ${rankCls}">${rank}位</span>
      <span class="ad-pr-label">PR</span>
    </div>
    ${rightContent}
  </div>`;
}

/** 広告ストリップを描画する汎用関数 */
function _renderAdStripTo(innerId, emptyId, catId, subName, countUp) {
  const inner = document.getElementById(innerId);
  const emptyEl = document.getElementById(emptyId);
  if (!inner) return;

  const visible = getVisibleAds(catId, subName);

  if (visible.length === 0) {
    inner.innerHTML = '';
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  if (countUp) {
    visible.forEach(ad => { adUserShown[ad.id] = (adUserShown[ad.id] || 0) + 1; });
  }

  inner.innerHTML = visible.map((ad, i) => _adCardHTML(ad, i + 1)).join('');
}

/** ランキングページの広告ストリップを描画 */
function renderAdStrip(catId = 'all', subName = null) {
  const adSection = document.getElementById('ad-strip-section');
  const pageHeader = document.querySelector('#page-ranking .page-header');
  if (adSection && pageHeader) {
    adSection.style.top = pageHeader.offsetHeight + 'px';
  }
  _renderAdStripTo('ad-strip-inner', 'ad-strip-empty', catId, subName, true);
}

/** フルスクリーンパネルの広告ストリップを描画（サブカテゴリー対応） */
function renderFsAdStrip(catId, subName = null) {
  const section = document.getElementById('fs-ad-strip-section');
  const visible = getVisibleAds(catId, subName);
  if (section) section.style.display = visible.length === 0 ? 'none' : '';
  _renderAdStripTo('fs-ad-strip-inner', 'fs-ad-strip-empty', catId, subName, false);
}

/** 広告詳細モーダルを開く */
function openAdDetail(id) {
  const ad = [...ADS_DATA, ...userCreatedAds].find(a => a.id === id);
  if (!ad) return;
  const shown = adUserShown[ad.id] || 0;
  const remaining = Math.max(0, ad.maxPerUser - shown);
  const pct = Math.round((shown / ad.maxPerUser) * 100);

  const imgSection = ad.img
    ? `<img src="${ad.img}" alt="広告画像" style="width:100%;max-height:180px;object-fit:cover;border-radius:10px;margin-bottom:12px;display:block">`
    : '';
  document.getElementById('ad-detail-body').innerHTML = `
    <div style="padding:4px 0 12px">
      ${imgSection}
      <div class="ad-detail-badge" style="background:${ad.bg};color:${ad.tc}">
        <i class="ti ti-speakerphone"></i> ${ad.advertiser}
      </div>
      <p style="font-size:15px;font-weight:700;margin:12px 0 6px;line-height:1.5">${ad.text}</p>
      <div class="ad-detail-meta">
        <div class="ad-detail-row"><span>課金額</span><b>¥${ad.budget.toLocaleString()}</b></div>
        <div class="ad-detail-row"><span>あなたへの表示回数</span><b>${shown} / ${ad.maxPerUser}回</b></div>
        <div class="ad-detail-progress">
          <div class="ad-detail-bar" style="width:${pct}%;background:${ad.tc}"></div>
        </div>
        <div class="ad-detail-remain" style="color:${remaining===0?'#ef4444':'var(--text3)'}">
          ${remaining === 0 ? '⚠ この広告は次回以降非表示になります' : `残り ${remaining} 回表示されます`}
        </div>
      </div>
    </div>`;

  document.getElementById('ad-detail-overlay').classList.add('show');
  document.getElementById('ad-detail-modal').classList.add('show');
}
function closeAdDetail() {
  document.getElementById('ad-detail-overlay').classList.remove('show');
  document.getElementById('ad-detail-modal').classList.remove('show');
}

/** 広告管理ページを描画 */
function renderAdsPage() {
  const backBtn = document.getElementById('ads-back-btn');
  if (backBtn) backBtn.onclick = () => goPage(prevPageId, null);

  // カテゴリー選択セレクトを初期化
  const catSelect = document.getElementById('ad-cat-select');
  if (catSelect && catSelect.options.length === 0) {
    const catOptions = [
      { id: 'all', name: '全て（どのカテゴリーにも表示）' },
      ...CATS_DATA.filter(c => c.id !== 'all').map(c => ({ id: c.id, name: c.name }))
    ];
    catSelect.innerHTML = catOptions.map(o =>
      `<option value="${o.id}">${o.name}</option>`
    ).join('');
    updateAdSubSelect();
  }

  // 広告アカウント選択を描画
  renderAdAccountSelector();
}

/** 広告アカウント選択UIを描画 */
function renderAdAccountSelector() {
  const wrap = document.getElementById('ad-acct-selector');
  if (!wrap) return;

  const subN  = subAccountName  || '匿名ユーザー';
  const subH  = subAccountHandle || '@anon_you';
  const subAv = subN !== '匿名ユーザー' ? subN[0] : '匿';
  const mainActive = adAccountType === 'main';
  const subActive  = adAccountType === 'sub';

  let html = `
    <div class="ad-acct-card${mainActive ? ' ad-acct-selected' : ''}" onclick="selectAdAccount('main')">
      <div class="ad-acct-av" style="background:#dbeafe;color:#1e40af">あ</div>
      <div class="ad-acct-info">
        <div class="ad-acct-name">あなた <span class="sidebar-acct-chip chip-main" style="font-size:9px;padding:1px 7px">メイン</span></div>
        <div class="ad-acct-handle">${myHandle}</div>
      </div>
      ${mainActive ? '<i class="ti ti-circle-check ad-acct-check"></i>' : ''}
    </div>`;

  if (hasSubAccount) {
    html += `
    <div class="ad-acct-card${subActive ? ' ad-acct-selected' : ''}" onclick="selectAdAccount('sub')">
      <div class="ad-acct-av" style="background:#ede9fe;color:#5b21b6">${subAv}</div>
      <div class="ad-acct-info">
        <div class="ad-acct-name">${subN} <span class="badge-sub" style="font-size:9px;padding:1px 5px"><i class="ti ti-user-question" style="font-size:8px;vertical-align:-1px"></i> サブ</span></div>
        <div class="ad-acct-handle">${subH}</div>
      </div>
      ${subActive ? '<i class="ti ti-circle-check ad-acct-check"></i>' : ''}
    </div>`;
  } else {
    html += `
    <div class="ad-acct-hint">
      <i class="ti ti-info-circle"></i>
      サブアカウントで出稿したい場合は<button class="ad-acct-link" onclick="goPage('sub-create',null)">サブアカウントを作成</button>してください
    </div>`;
  }

  wrap.innerHTML = html;
}

/** 広告アカウントを選択 */
function selectAdAccount(type) {
  adAccountType = type;
  renderAdAccountSelector();
}

/** メインカテゴリー変更時にサブカテゴリー選択を更新 */
function updateAdSubSelect() {
  const catId = document.getElementById('ad-cat-select')?.value || 'all';
  const subField = document.getElementById('ad-subcat-field');
  const subSelect = document.getElementById('ad-subcat-select');
  if (!subField || !subSelect) return;

  if (catId === 'all') {
    subField.style.display = 'none';
    return;
  }

  const cat = CATS_DATA.find(c => c.id === catId);
  if (!cat) { subField.style.display = 'none'; return; }

  // allSubs を使ってサブカテゴリーをリスト化
  const subs = cat.allSubs ? cat.allSubs.map(s => s.name) : cat.subs.filter(s => s !== '全体');
  subSelect.innerHTML = `<option value="">カテゴリー全体（サブ問わず）</option>`
    + subs.map(s => `<option value="${s}">${s}</option>`).join('');
  subField.style.display = '';
}

/** 出稿フォームのプレビュー更新 */
function updateAdPreview() {
  const textEl   = document.getElementById('ad-text-input');
  const budgetEl = document.getElementById('ad-budget-input');
  const timesEl  = document.getElementById('ad-maxperuser-input');
  const countEl  = document.getElementById('ad-text-count');
  const rankPrev = document.getElementById('ad-rank-preview');
  const costBox  = document.getElementById('ad-cost-box');

  if (textEl && countEl) countEl.textContent = textEl.value.length;

  const budget = parseInt(budgetEl?.value || 0);
  const times  = parseInt(timesEl?.value  || 0);

  if (budget > 0 && rankPrev) {
    // 現在のリストで何位になるか計算
    const sorted = getAllAdsSorted();
    let pos = 1;
    for (const ad of sorted) {
      if (budget >= ad.budget) break;
      pos++;
    }
    const posText = pos === 1 ? '🥇 1位' : pos === 2 ? '🥈 2位' : pos === 3 ? '🥉 3位' : `${pos}位`;
    rankPrev.innerHTML = `この課金額では <b>${posText}</b> になります`;
    rankPrev.style.color = pos <= 3 ? 'var(--accent)' : 'var(--text3)';
  } else if (rankPrev) {
    rankPrev.innerHTML = '';
  }

  if (budget > 0 && times > 0 && costBox) {
    costBox.style.display = '';
    document.getElementById('ad-cost-budget').textContent = `¥${budget.toLocaleString()}`;
    document.getElementById('ad-cost-times').textContent  = `${times}回`;
    document.getElementById('ad-cost-total').textContent  = `¥${(budget * times).toLocaleString()}`;
  } else if (costBox) {
    costBox.style.display = 'none';
  }
}

/** 広告を出稿（フォーム送信） */
function submitNewAd() {
  const text    = (document.getElementById('ad-text-input')?.value || '').trim();
  const budget  = parseInt(document.getElementById('ad-budget-input')?.value || 0);
  const times   = parseInt(document.getElementById('ad-maxperuser-input')?.value || 0);
  const catId   = document.getElementById('ad-cat-select')?.value || 'all';
  const subName = document.getElementById('ad-subcat-select')?.value || null;
  const errEl = document.getElementById('ad-create-err');
  const msgEl = document.getElementById('ad-create-err-msg');

  // 選択中のアカウントから掲載者名を取得
  const isSub = adAccountType === 'sub' && hasSubAccount;
  const adv   = isSub ? (subAccountName || '匿名ユーザー') : 'あなた';

  const fail = msg => {
    errEl.style.display = '';
    msgEl.textContent = msg;
  };
  errEl.style.display = 'none';

  if (!text)                   { fail('広告テキストを入力してください'); return; }
  if (!budget || budget < 100) { fail('課金額を100円以上で入力してください'); return; }
  if (!times || times < 1)     { fail('表示回数を1回以上に設定してください'); return; }

  // ランダムな背景色
  const colors = [['#dbeafe','#1e40af'],['#d1fae5','#065f46'],['#fce7f3','#be185d'],['#ede9fe','#5b21b6'],['#fef3c7','#92400e']];
  const [bg, tc] = colors[userCreatedAds.length % colors.length];

  const newAd = { id: ++adIdCounter, advertiser: adv, text, budget, maxPerUser: times, catId, subName: subName || null, bg, tc, img: pendingAdImg };
  userCreatedAds.push(newAd);
  // Supabaseに保存（非同期）
  dbSaveAd({ advertiser: adv, text, budget, maxPerUser: times, bg, tc });

  // フォームリセット
  ['ad-text-input','ad-budget-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const timesEl = document.getElementById('ad-maxperuser-input');
  if (timesEl) timesEl.value = '2';
  document.getElementById('ad-text-count').textContent = '0';
  document.getElementById('ad-cost-box').style.display = 'none';
  document.getElementById('ad-rank-preview').innerHTML = '';
  // 画像リセット
  pendingAdImg = null;
  const fileEl = document.getElementById('ad-img-file');
  if (fileEl) fileEl.value = '';
  const previewWrap = document.getElementById('ad-img-preview-wrap');
  if (previewWrap) previewWrap.style.display = 'none';
  const uploadArea = document.getElementById('ad-img-upload-area');
  if (uploadArea) uploadArea.style.display = '';

  renderAdsPage();
  showToast(`広告を出稿しました！ランキングに追加されました`, 'success');
}

// ── Ad Image Upload ────────────────────────────────────
function handleAdImgUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    pendingAdImg = e.target.result;
    const preview = document.getElementById('ad-img-preview');
    const previewWrap = document.getElementById('ad-img-preview-wrap');
    const uploadArea = document.getElementById('ad-img-upload-area');
    if (preview) preview.src = pendingAdImg;
    if (previewWrap) previewWrap.style.display = '';
    if (uploadArea) uploadArea.style.display = 'none';
  };
  reader.readAsDataURL(file);
}
function removeAdImg(e) {
  if (e) e.stopPropagation();
  pendingAdImg = null;
  const fileEl = document.getElementById('ad-img-file');
  if (fileEl) fileEl.value = '';
  const preview = document.getElementById('ad-img-preview');
  const previewWrap = document.getElementById('ad-img-preview-wrap');
  const uploadArea = document.getElementById('ad-img-upload-area');
  if (preview) preview.src = '';
  if (previewWrap) previewWrap.style.display = 'none';
  if (uploadArea) uploadArea.style.display = '';
}

// ── Image Viewer (Lightbox) ────────────────────────────
function openImageViewer(src) {
  if (!src) return;
  let overlay = document.getElementById('img-viewer-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'img-viewer-overlay';
    overlay.innerHTML = `
      <div id="img-viewer-inner">
        <button id="img-viewer-close" onclick="closeImageViewer()" title="閉じる"><i class="ti ti-x"></i></button>
        <img id="img-viewer-img" src="" alt="画像">
      </div>`;
    overlay.onclick = e => { if (e.target === overlay || e.target === document.getElementById('img-viewer-inner')) closeImageViewer(); };
    document.body.appendChild(overlay);
    // キーボード ESC で閉じる
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeImageViewer(); });
  }
  document.getElementById('img-viewer-img').src = src;
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeImageViewer() {
  const overlay = document.getElementById('img-viewer-overlay');
  if (overlay) overlay.classList.remove('show');
  document.body.style.overflow = '';
}

// ── Toast ──────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 2800) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icon = type === 'success' ? 'ti-circle-check' : type === 'warn' ? 'ti-alert-triangle' : 'ti-info-circle';
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="ti ${icon}"></i> ${msg}`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-in'));
  setTimeout(() => {
    toast.classList.remove('toast-in');
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ── Login (ID + Password) ──────────────────────────────
function loginStep(n) { /* no-op: login is single-screen */ }

async function completeLogin() {
  const inputId = (document.getElementById('login-id')?.value  || '').trim();
  const inputPw =  document.getElementById('login-pw')?.value  || '';
  const errEl   =  document.getElementById('login-err');
  const loginBtn = document.getElementById('login-submit-btn');
  const _showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } };

  if (!inputId || !inputPw) { _showErr('IDとパスワードを入力してください'); return; }

  const encoded = btoa(unescape(encodeURIComponent(inputPw)));

  // ── Supabase で認証（クロスオリジン・クロスデバイス対応） ──
  if (typeof dbFetchProfile === 'function') {
    if (loginBtn) loginBtn.disabled = true;
    try {
      let profile = await dbFetchProfile(inputId);

      if (!profile) {
        // Supabase未登録 → localStorageで照合して自動移行
        const storedId = localStorage.getItem('trendy_account_id');
        const storedPw = localStorage.getItem('trendy_account_pw');
        if (storedId === inputId && storedPw === encoded) {
          // localStorageのアカウントをSupabaseに移行
          await dbSaveProfile({
            accountId    : inputId,
            passwordHash : encoded,
            nickname     : localStorage.getItem('trendy_myName') || inputId,
            bio          : localStorage.getItem('trendy_bio')    || '',
            isDev        : localStorage.getItem('trendy_isDev') === 'true',
          });
          profile = await dbFetchProfile(inputId); // 移行後に再取得
          console.log('[LOGIN] localStorageアカウントをSupabaseに移行しました');
        } else {
          _showErr('このIDは登録されていません'); return;
        }
      }

      if (profile.password_hash !== encoded) { _showErr('IDまたはパスワードが正しくありません'); return; }

      // Supabase のプロフィールをローカルに適用
      myNickname = profile.nickname || inputId;
      myBio      = profile.bio      || '';
      isDeveloper = profile.is_dev  || false;
      myHandle   = '@' + inputId;
      catPickerTargetHandle = myHandle;
      if (!USER_PROFILES[myHandle]) USER_PROFILES[myHandle] = USER_PROFILES['@you'] || { categories: [] };

      localStorage.setItem('trendy_logged_in',  'true');
      localStorage.setItem('trendy_registered', 'true');
      localStorage.setItem('trendy_account_id', inputId);
      localStorage.setItem('trendy_account_pw', encoded);
      localStorage.setItem('trendy_myName',     myNickname);
      localStorage.setItem('trendy_bio',        myBio);
      localStorage.setItem('trendy_isDev',      isDeveloper ? 'true' : 'false');

      _applyMyName();
      _applyMyHandle();
      _applyDevNav();
      if (myBio) {
        const bioEl = document.getElementById('profile-bio-display');
        if (bioEl) { bioEl.textContent = myBio; bioEl.className = ''; }
      }
      // 画像をSupabaseから復元
      if (profile.avatar_data) {
        localStorage.setItem('trendy_av', profile.avatar_data);
        _applyAvImage(profile.avatar_data);
      }
      if (profile.cover_data) {
        localStorage.setItem('trendy_cover', profile.cover_data);
        _applyCoverImage(profile.cover_data);
      }

    } catch(e) {
      console.warn('[LOGIN] Supabase認証失敗、ローカル認証にフォールバック:', e);
      // フォールバック：localStorage で照合
      const storedId = localStorage.getItem('trendy_account_id');
      const storedPw = localStorage.getItem('trendy_account_pw');
      if (storedId && (inputId !== storedId || encoded !== storedPw)) {
        _showErr('IDまたはパスワードが正しくありません'); return;
      }
      localStorage.setItem('trendy_logged_in', 'true');
    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  } else {
    // Supabase 未接続時：localStorage フォールバック
    const storedId = localStorage.getItem('trendy_account_id');
    const storedPw = localStorage.getItem('trendy_account_pw');
    if (storedId && (inputId !== storedId || encoded !== storedPw)) {
      _showErr('IDまたはパスワードが正しくありません'); return;
    }
    localStorage.setItem('trendy_logged_in', 'true');
  }

  if (errEl) errEl.style.display = 'none';
  showToast('ログインしました ✅', 'success');
  goPage('home', null);
  const homeBtn = document.querySelector('.nav-item[data-page="home"]');
  if (homeBtn) homeBtn.classList.add('active');
}

// ── Logout Confirm ────────────────────────────────────
function confirmLogout() {
  document.getElementById('logout-overlay').classList.add('show');
  document.getElementById('logout-modal').classList.add('show');
}
function closeLogoutModal() {
  document.getElementById('logout-overlay').classList.remove('show');
  document.getElementById('logout-modal').classList.remove('show');
}
function doLogout() {
  closeLogoutModal();
  localStorage.removeItem('trendy_logged_in');
  myAccountType = 'main';
  selectAccount('main');
  // ウェルカムページへリダイレクト
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const wp = document.getElementById('page-welcome');
  if (wp) wp.classList.add('active');
  setTimeout(() => showToast('ログアウトしました'), 200);
}

// ── Phone Change Modal ────────────────────────────────
let phoneChangeVerified = false;
let phoneChangeNewNum   = '';

function openPhoneModal() {
  phoneChangeVerified = false;
  phoneChangeNewNum   = '';
  renderPhoneModalStep(1);
  document.getElementById('phone-modal-overlay').classList.add('show');
  document.getElementById('phone-modal').classList.add('show');
}
function closePhoneModal() {
  document.getElementById('phone-modal-overlay').classList.remove('show');
  document.getElementById('phone-modal').classList.remove('show');
}
function renderPhoneModalStep(step) {
  const body = document.getElementById('phone-modal-body');
  if (step === 1) {
    body.innerHTML = `
      <p style="font-size:12px;color:var(--text3);margin-bottom:14px">新しい電話番号を入力してください。確認SMSを送信します。</p>
      <div class="kids-field">
        <label class="kids-label">新しい電話番号</label>
        <div class="kids-phone-row">
          <span class="kids-phone-prefix">+81</span>
          <input type="tel" class="kids-input kids-phone-input" id="phone-new-input" placeholder="090-0000-0000">
        </div>
      </div>
      <div style="margin-top:14px;text-align:right">
        <button class="kids-next-btn" style="width:auto;padding:10px 22px" onclick="sendPhoneChangeCode()"><i class="ti ti-send"></i> SMSを送信する</button>
      </div>`;
    setTimeout(() => { const el = document.getElementById('phone-new-input'); if (el) el.focus(); }, 50);
  } else if (step === 2) {
    body.innerHTML = `
      <div class="kids-verified-box" style="margin-bottom:12px;background:#eff6ff;border-color:#93c5fd">
        <i class="ti ti-send" style="color:#3b82f6"></i> SMSを送信しました（${phoneChangeNewNum}）
      </div>
      <div class="kids-field">
        <label class="kids-label">認証コード（6桁）</label>
        <input type="tel" class="kids-input" id="phone-change-code" placeholder="123456" maxlength="6" style="letter-spacing:6px;font-size:20px;text-align:center">
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
        <button class="kids-back-btn" style="width:auto" onclick="renderPhoneModalStep(1)"><i class="ti ti-arrow-left"></i> 戻る</button>
        <button class="kids-next-btn" style="width:auto;padding:10px 22px" onclick="verifyPhoneChange()"><i class="ti ti-check"></i> 認証する</button>
      </div>`;
    setTimeout(() => { const el = document.getElementById('phone-change-code'); if (el) el.focus(); }, 50);
  }
}
function sendPhoneChangeCode() {
  const input = document.getElementById('phone-new-input');
  if (!input || !input.value.trim()) { showToast('電話番号を入力してください', 'warn'); return; }
  phoneChangeNewNum = input.value.trim();
  renderPhoneModalStep(2);
}
function verifyPhoneChange() {
  const code = (document.getElementById('phone-change-code') || {}).value || '';
  if (code.length !== 6) { showToast('6桁のコードを入力してください', 'warn'); return; }
  // デモ：任意の6桁で成功
  closePhoneModal();
  const masked = phoneChangeNewNum.replace(/(\d{3})\d{4}(\d{4})/, '$1-****-$2');
  const el = document.getElementById('settings-phone-val');
  if (el) el.textContent = `${masked} ✓認証済み`;
  // プロフィール編集から呼ばれた場合も含め、月1回制限を記録
  recordMonthlyChange('phone');
  showToast('電話番号を変更しました', 'success');
}

// ── プロフィール編集ページ用ラッパー（月1回チェック済み）──
function openSettingsEditFromProfile(field) {
  // 地域はすでにcanChangeMonthlyチェック済みのボタンから呼ばれる
  openSettingsEdit(field);
}
function openPhoneModalFromProfile() {
  // 電話番号はすでにcanChangeMonthlyチェック済みのボタンから呼ばれる
  openPhoneModal();
}

// ── Kids Settings Toggles ─────────────────────────────
const kidsSettings = {
  blockSensitive:    true,
  showPolitics:      false,
  blockDM:           true,
  parentApproveFollow: true,
  weeklyReport:      true,
};
const kidsSettingLabels = {
  blockSensitive:    'センシティブコンテンツをブロック',
  showPolitics:      '政治カテゴリーの表示',
  blockDM:           '知らない人からのDMを禁止',
  parentApproveFollow: 'フォロー申請を保護者が承認',
  weeklyReport:      '週次利用レポートを受け取る',
};
function kidsSettingToggle(key, cb) {
  kidsSettings[key] = cb.checked;
  const label = kidsSettingLabels[key] || key;
  const state = cb.checked ? 'ON' : 'OFF';
  showToast(`${label}：${state}`, 'success');
}

// ── Settings Edit Modal (性別・地域・生年月日) ──────────
const PREFECTURES = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

let settingsProfile = { gender: 'male', region: '東京都', dobYear: 1990, dobMonth: 1, dobDay: 1 };
let settingsEditField = null;

function openSettingsEdit(field) {
  settingsEditField = field;
  const titleEl = document.getElementById('settings-edit-title');
  const bodyEl  = document.getElementById('settings-edit-body');
  if (!titleEl || !bodyEl) return;

  if (field === 'gender') {
    titleEl.innerHTML = '<i class="ti ti-user"></i> 性別の変更';
    bodyEl.innerHTML = `
      <p style="font-size:12px;color:var(--text3);margin-bottom:14px">性別は他のユーザーに表示されます。</p>
      <div class="kids-radio-row" style="gap:16px">
        <label class="kids-radio" style="font-size:14px;padding:10px 20px">
          <input type="radio" name="edit-gender" value="male" ${settingsProfile.gender==='male'?'checked':''}> 男性
        </label>
        <label class="kids-radio" style="font-size:14px;padding:10px 20px">
          <input type="radio" name="edit-gender" value="female" ${settingsProfile.gender==='female'?'checked':''}> 女性
        </label>
      </div>`;
  } else if (field === 'region') {
    titleEl.innerHTML = '<i class="ti ti-map-pin"></i> 地域の変更';
    const opts = PREFECTURES.map(p => `<option value="${p}" ${settingsProfile.region===p?'selected':''}>${p}</option>`).join('');
    bodyEl.innerHTML = `
      <p style="font-size:12px;color:var(--text3);margin-bottom:14px">地域は他のユーザーに表示されます。</p>
      <select class="kids-select" id="edit-region-select" style="width:100%">
        ${opts}
      </select>`;
  } else if (field === 'dob') {
    titleEl.innerHTML = '<i class="ti ti-calendar"></i> 生年月日の変更';
    const years  = Array.from({length: 2010-1920+1}, (_,i) => 2010-i);
    const months = Array.from({length:12}, (_,i) => i+1);
    const days   = Array.from({length:31}, (_,i) => i+1);
    const yOpts  = years.map(y  => `<option ${settingsProfile.dobYear===y?'selected':''}>${y}</option>`).join('');
    const mOpts  = months.map(m => `<option ${settingsProfile.dobMonth===m?'selected':''}>${m}</option>`).join('');
    const dOpts  = days.map(d   => `<option ${settingsProfile.dobDay===d?'selected':''}>${d}</option>`).join('');
    bodyEl.innerHTML = `
      <p style="font-size:12px;color:var(--text3);margin-bottom:14px">生年月日は年代のみ他のユーザーに表示されます（例：1990年代）。</p>
      <div class="kids-dob-row">
        <select class="kids-select" id="edit-dob-year">${yOpts}</select>
        <select class="kids-select" id="edit-dob-month">${mOpts}</select>
        <select class="kids-select" id="edit-dob-day">${dOpts}</select>
      </div>`;
  }

  document.getElementById('settings-edit-overlay').classList.add('show');
  document.getElementById('settings-edit-modal').classList.add('show');
}

function closeSettingsEdit() {
  document.getElementById('settings-edit-overlay').classList.remove('show');
  document.getElementById('settings-edit-modal').classList.remove('show');
  settingsEditField = null;
}

function saveSettingsEdit() {
  const _aid = localStorage.getItem('trendy_account_id');

  if (settingsEditField === 'gender') {
    const g = document.querySelector('input[name="edit-gender"]:checked');
    if (!g) { showToast('性別を選択してください', 'warn'); return; }
    settingsProfile.gender = g.value;
    const label = g.value === 'male' ? '男性' : '女性';
    const displayText = `${label}（非公開）`;
    ['settings-gender-val','pe-gender-val'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = displayText;
    });
    localStorage.setItem('trendy_gender', displayText);
    if (_aid && typeof dbUpdateProfileMeta === 'function') dbUpdateProfileMeta(_aid, { gender: g.value });
    showToast('性別を変更しました', 'success');

  } else if (settingsEditField === 'region') {
    const sel = document.getElementById('edit-region-select');
    if (!sel || !sel.value) { showToast('地域を選択してください', 'warn'); return; }
    settingsProfile.region = sel.value;
    ['settings-region-val','pe-region-val'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = sel.value;
    });
    localStorage.setItem('trendy_region', sel.value);
    recordMonthlyChange('region');
    if (_aid && typeof dbUpdateProfileMeta === 'function') dbUpdateProfileMeta(_aid, { region: sel.value });
    showToast('地域を変更しました', 'success');

  } else if (settingsEditField === 'dob') {
    const y = parseInt((document.getElementById('edit-dob-year') || {}).value);
    const m = parseInt((document.getElementById('edit-dob-month') || {}).value);
    const d = parseInt((document.getElementById('edit-dob-day') || {}).value);
    if (!y || !m || !d) { showToast('生年月日をすべて選択してください', 'warn'); return; }
    settingsProfile.dobYear = y; settingsProfile.dobMonth = m; settingsProfile.dobDay = d;
    const decade = Math.floor(y / 10) * 10;
    const displayText = `${y}年${m}月${d}日 / ${decade}年代（非公開）`;
    ['settings-dob-val','pe-dob-val'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = displayText;
    });
    localStorage.setItem('trendy_dob', displayText);
    if (_aid && typeof dbUpdateProfileMeta === 'function') dbUpdateProfileMeta(_aid, { dob: displayText });
    showToast('生年月日を変更しました', 'success');
  }

  closeSettingsEdit();
}

// ── Feedback 意見箱 ────────────────────────────────────
let fbFilter    = 'all';
let fbSort      = 'new';
let fbAdminMode = false;
const fbVotes   = {};              // { id: 'like' | 'dislike' | null }
const opinions  = [...OPINIONS_DATA]; // 状態管理用コピー

const FB_STATUS_STYLE = {
  '検討中':  { bg:'#dbeafe', tc:'#1e40af' },
  '対応予定':{ bg:'#d1fae5', tc:'#065f46' },
  '実装済み':{ bg:'#dcfce7', tc:'#166534' },
  '見送り':  { bg:'#fee2e2', tc:'#991b1b' },
};
const FB_CAT_ICON = { '機能要望':'💡', 'UIの改善':'🎨', 'バグ報告':'🐛', 'その他':'📝' };

function renderFeedbackPage() {
  // フィルター
  let list = fbFilter === 'all' ? [...opinions] : opinions.filter(o => o.category === fbFilter);

  // ソート
  if (fbSort === 'likes') list.sort((a, b) => b.likes - a.likes);
  else if (fbSort === 'hot') list.sort((a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes));
  else list.sort((a, b) => b.id - a.id); // 新着

  const container = document.getElementById('fb-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<div class="fb-empty"><i class="ti ti-bulb-off"></i><div>意見がまだありません</div><div class="fb-empty-sub">最初の意見を投稿してみましょう</div></div>`;
    return;
  }

  container.innerHTML = list.map(o => {
    const myVote = fbVotes[o.id] || null;
    const sc = FB_STATUS_STYLE[o.status] || null;
    const statusBadge = sc
      ? `<span class="fb-status-badge" style="background:${sc.bg};color:${sc.tc}">${o.status}</span>`
      : '';
    const catIcon = FB_CAT_ICON[o.category] || '📝';
    const netScore = o.likes - o.dislikes;

    // 運営モード：ステータス変更ボタン
    const adminBar = fbAdminMode ? `
      <div class="fb-admin-controls">
        <span class="fb-admin-ctrl-label"><i class="ti ti-shield-check"></i> 実装検討：</span>
        ${Object.keys(FB_STATUS_STYLE).map(s =>
          `<button class="fb-status-btn${o.status===s?' fb-status-active':''}"
            style="${o.status===s ? `background:${FB_STATUS_STYLE[s].bg};color:${FB_STATUS_STYLE[s].tc};border-color:${FB_STATUS_STYLE[s].tc}40` : ''}"
            onclick="setOpinionStatus(${o.id},'${s}')">${s}</button>`
        ).join('')}
        ${o.status ? `<button class="fb-status-btn fb-status-clear" onclick="setOpinionStatus(${o.id},null)">✕ 解除</button>` : ''}
      </div>` : '';

    return `<div class="fb-item" id="fb-item-${o.id}">
      <div class="fb-item-head">
        <div class="fb-item-title-row">
          ${statusBadge}
          <span class="fb-item-title">${o.title}</span>
        </div>
        <span class="fb-cat-tag">${catIcon} ${o.category}</span>
      </div>
      ${o.text ? `<div class="fb-item-text">${o.text}</div>` : ''}
      <div class="fb-item-footer">
        <div class="fb-item-meta">
          <div class="fb-av" style="background:${o.user.bg};color:${o.user.tc}">${o.user.av}</div>
          <span class="fb-user">${o.user.n}</span>
          <span class="fb-dot">·</span>
          <span class="fb-time">${o.time}</span>
        </div>
        <div class="fb-votes">
          <button class="fb-vote-btn fb-like-btn${myVote==='like' ? ' fb-voted-like' : ''}" onclick="voteOpinion(${o.id},'like')">
            <i class="ti ti-thumbs-up"></i><span class="fb-like-cnt">${o.likes}</span>
          </button>
          <div class="fb-net-score${netScore>0?' fb-net-pos':netScore<0?' fb-net-neg':''}">${netScore>0?'+':''}${netScore}</div>
          <button class="fb-vote-btn fb-dislike-btn${myVote==='dislike' ? ' fb-voted-dislike' : ''}" onclick="voteOpinion(${o.id},'dislike')">
            <i class="ti ti-thumbs-down"></i><span class="fb-dislike-cnt">${o.dislikes}</span>
          </button>
        </div>
      </div>
      ${adminBar}
    </div>`;
  }).join('');
}

function setFbFilter(f, btn) {
  fbFilter = f;
  pillActive(btn, 'fb-cat-pills');
  renderFeedbackPage();
}

function setFbSort(s, btn) {
  fbSort = s;
  pillActive(btn, 'fb-sort-pills');
  renderFeedbackPage();
}

function toggleFbAdminMode(cb) {
  fbAdminMode = cb.checked;
  renderFeedbackPage();
  showToast(fbAdminMode ? '運営モードON：ステータスを変更できます' : '運営モードOFF', 'info');
}

function voteOpinion(id, type) {
  const o = opinions.find(x => x.id === id);
  if (!o) return;
  const prev = fbVotes[id] || null;

  // 既存の票を取り消し
  if (prev === 'like')    o.likes    = Math.max(0, o.likes - 1);
  if (prev === 'dislike') o.dislikes = Math.max(0, o.dislikes - 1);

  // 同じボタンなら解除、違うなら変更
  if (prev === type) {
    fbVotes[id] = null;
  } else {
    fbVotes[id] = type;
    if (type === 'like') o.likes++;
    else o.dislikes++;
  }

  // カードの数値だけ差し替え（全再描画しない）
  const item = document.getElementById('fb-item-' + id);
  if (!item) return;
  const myVote   = fbVotes[id] || null;
  const netScore = o.likes - o.dislikes;
  item.querySelector('.fb-like-cnt').textContent    = o.likes;
  item.querySelector('.fb-dislike-cnt').textContent = o.dislikes;
  item.querySelector('.fb-like-btn').className    = `fb-vote-btn fb-like-btn${myVote==='like'    ? ' fb-voted-like'    : ''}`;
  item.querySelector('.fb-dislike-btn').className = `fb-vote-btn fb-dislike-btn${myVote==='dislike' ? ' fb-voted-dislike' : ''}`;
  const netEl = item.querySelector('.fb-net-score');
  if (netEl) {
    netEl.textContent = (netScore > 0 ? '+' : '') + netScore;
    netEl.className = `fb-net-score${netScore>0?' fb-net-pos':netScore<0?' fb-net-neg':''}`;
  }
}

function setOpinionStatus(id, status) {
  const o = opinions.find(x => x.id === id);
  if (!o) return;
  o.status = status || null;
  renderFeedbackPage();
  showToast(status ? `「${o.title}」を「${status}」に設定しました` : 'ステータスを解除しました', 'success');
}

function submitOpinion() {
  const title = (document.getElementById('fb-title-input')?.value || '').trim();
  const text  = (document.getElementById('fb-text-input')?.value  || '').trim();
  const cat   = document.getElementById('fb-cat-select')?.value   || 'その他';
  const anon  = document.getElementById('fb-anon-chk')?.checked   || false;

  if (!title) { showToast('タイトルを入力してください', 'warn'); return; }

  const isSub = myAccountType === 'sub';
  const user  = (anon || isSub)
    ? { n:'匿名ユーザー', h:'@anon', av:'匿', bg:'#f3f4f6', tc:'#4b5563' }
    : { n:'あなた', h:myHandle, av:'あ', bg:'#dbeafe', tc:'#1e40af' };

  opinions.unshift({
    id: Date.now(), title, text, category: cat,
    user, time: 'たった今', likes: 0, dislikes: 0, status: null,
  });

  // フォームリセット
  document.getElementById('fb-title-input').value  = '';
  document.getElementById('fb-text-input').value   = '';
  document.getElementById('fb-char-count').textContent = '0';
  document.getElementById('fb-anon-chk').checked   = false;

  renderFeedbackPage();
  showToast('意見を投稿しました！', 'success');
}

function updateFbCount() {
  const v  = document.getElementById('fb-text-input')?.value || '';
  const el = document.getElementById('fb-char-count');
  if (el) el.textContent = v.length;
}

// ══════════════════════════════════════════
// カテゴリー・タグシステム
// ══════════════════════════════════════════

function initComposeCatPills() {
  const wrap = document.getElementById('compose-cat-pills');
  if (!wrap) return;
  const cats = CATS_DATA.filter(c => c.id !== 'all');
  wrap.innerHTML = `<button class="compose-cat-pill none-pill active" data-catid="" onclick="selectComposeCat(this,'')">なし</button>`
    + cats.map(c => `<button class="compose-cat-pill" data-catid="${c.id}"
        style="--pill-color:${c.color}"
        onclick="selectComposeCat(this,'${c.id}')"
        ><i class="ti ${c.icon}" style="color:${c.color};font-size:11px;margin-right:3px"></i>${c.name}</button>`).join('');
}

function selectComposeCat(btn, catId) {
  document.querySelectorAll('.compose-cat-pill').forEach(b => {
    b.classList.remove('active');
    b.style.background = '';
  });
  btn.classList.add('active');
  if (catId) btn.style.background = btn.style.getPropertyValue('--pill-color') || 'var(--accent)';
  pendingCatId = catId || null;

  // サブカテゴリーセクションを更新
  const subSection = document.getElementById('compose-sub-section');
  const subChips   = document.getElementById('compose-sub-chips');
  if (catId) {
    const cat = CATS_DATA.find(c => c.id === catId);
    if (cat) {
      // 実ランキング上位5件のみ表示
      const topReal = getTopSubTags(catId, 5); // #タグ形式
      if (topReal.length) {
        subChips.innerHTML = topReal.map(tag => {
          const label = tag.replace(/^#/, '');
          const isActive = pendingTags.includes(tag);
          return `<button class="compose-sub-chip${isActive ? ' active' : ''}"
            style="${isActive ? 'background:' + cat.color + ';border-color:' + cat.color : ''}"
            onclick="toggleSubChip(this,'${tag}','${cat.color}')">${label}</button>`;
        }).join('');
      } else {
        subChips.innerHTML = `<span style="font-size:11px;color:var(--text3)">まだランキングデータがありません。カスタムタグから入力できます。</span>`;
      }
      subSection.style.display = '';
    }
  } else {
    subSection.style.display = 'none';
    subChips.innerHTML = '';
  }
  updateComposeCatLabel();
}

function toggleSubChip(btn, tag, color) {
  if (pendingTags.includes(tag)) {
    // 選択解除
    pendingTags = pendingTags.filter(t => t !== tag);
    btn.classList.remove('active');
    btn.style.background = '';
    btn.style.borderColor = '';
  } else {
    // 選択追加
    pendingTags.push(tag);
    btn.classList.add('active');
    btn.style.background = color;
    btn.style.borderColor = color;
  }
  renderComposeTags();
  updateComposeCatLabel();
}

function toggleComposeCat() {
  const body    = document.getElementById('compose-cat-body');
  const chevron = document.getElementById('compose-cat-chevron');
  const open    = body.style.display !== 'none';
  body.style.display    = open ? 'none' : '';
  chevron.classList.toggle('open', !open);
}

function updateComposeCatLabel() {
  const el = document.getElementById('compose-cat-selected');
  if (!el) return;
  const parts = [];
  if (pendingCatId) {
    const cat = CATS_DATA.find(c => c.id === pendingCatId);
    if (cat) parts.push(cat.name);
  }
  parts.push(...pendingTags);
  el.textContent = parts.length ? parts.join('  ') : '未選択';
  // インラインボタンの色変更（選択済み = アクセントカラー）
  const btn = document.getElementById('compose-cat-inline-btn');
  if (btn) btn.classList.toggle('has-cat', parts.length > 0);
}

function handleTagKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); addComposeTag(); }
}

function addComposeTag() {
  const input = document.getElementById('compose-tag-input');
  let val = input.value.trim().replace(/^#+/, '');
  if (!val) return;
  const tag = '#' + val;
  if (pendingTags.includes(tag)) { input.value = ''; return; }
  pendingTags.push(tag);
  input.value = '';
  renderComposeTags();
  updateComposeCatLabel();
}

function removeComposeTag(tag) {
  pendingTags = pendingTags.filter(t => t !== tag);
  renderComposeTags();
  updateComposeCatLabel();
}

function renderComposeTags() {
  const el = document.getElementById('compose-tags-list');
  if (!el) return;
  el.innerHTML = pendingTags.map(tag =>
    `<span class="compose-tag-chip">${tag}<button onclick="removeComposeTag('${tag}')"><i class="ti ti-x"></i></button></span>`
  ).join('');
}

function resetComposeCat() {
  pendingCatId = null;
  pendingTags  = [];
  document.querySelectorAll('.compose-cat-pill').forEach(b => {
    b.classList.remove('active'); b.style.background = '';
  });
  const noneBtn = document.querySelector('.compose-cat-pill.none-pill');
  if (noneBtn) noneBtn.classList.add('active');
  const subSection = document.getElementById('compose-sub-section');
  if (subSection) subSection.style.display = 'none';
  renderComposeTags();
  updateComposeCatLabel();
  const body = document.getElementById('compose-cat-body');
  const chevron = document.getElementById('compose-cat-chevron');
  if (body) body.style.display = 'none';
  if (chevron) chevron.classList.remove('open');
}

// ── サブカテゴリー統計の更新 ──
function recordCatSubStats(catId, tags, likes = 0) {
  if (!catId) return;
  if (!catSubStats[catId]) catSubStats[catId] = {};
  tags.forEach(tag => {
    if (!catSubStats[catId][tag]) catSubStats[catId][tag] = { count: 0, likes: 0, score: 0 };
    catSubStats[catId][tag].count++;
    catSubStats[catId][tag].likes += likes;
    catSubStats[catId][tag].score = catSubStats[catId][tag].count * 10 + catSubStats[catId][tag].likes;
  });
}

function getTopSubTags(catId, limit = 8) {
  const stats = catSubStats[catId] || {};
  return Object.entries(stats)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([name]) => name);
}

// ── 開発者ページ ──
function renderDevPage() {
  renderDevSubRanking();
  renderDevAccountSection();
  renderDevBrandSection();
  renderDevAccountList();
  // 開発者ページを開くたびに現在のブランド設定をSupabaseに同期（全端末共有）
  if (typeof dbSaveAppConfig === 'function') {
    dbSaveAppConfig(appName, appIcon);
  }
}

// ── 登録アカウント一覧 ──
async function renderDevAccountList() {
  const el = document.getElementById('dev-accounts-list');
  if (!el) return;

  el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3)"><i class="ti ti-loader-2" style="font-size:20px;animation:spin 1s linear infinite"></i><br><span style="font-size:12px">読み込み中...</span></div>`;

  const accounts = await dbFetchAllAccounts();

  if (!accounts.length) {
    el.innerHTML = `<p style="color:var(--text3);font-size:13px;text-align:center;padding:16px">登録アカウントはありません</p>`;
    return;
  }

  const myAccountId = localStorage.getItem('trendy_account_id');

  el.innerHTML = accounts.map(a => {
    const initial = (a.nickname || a.account_id || '?')[0].toUpperCase();
    const isMe = a.account_id === myAccountId;
    const regDate = a.created_at
      ? new Date(a.created_at).toLocaleDateString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' })
      : (a.updated_at ? new Date(a.updated_at).toLocaleDateString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' }) : '不明');

    return `
      <div class="dev-acct-item" id="dev-acct-${a.account_id}">
        <div class="dev-acct-av">${initial}</div>
        <div class="dev-acct-info">
          <div class="dev-acct-name">
            ${a.nickname || a.account_id}
            ${a.is_dev ? `<span class="badge-dev" style="font-size:9px;padding:1px 5px"><i class="ti ti-code" style="font-size:9px"></i> 開発者</span>` : ''}
            ${isMe ? `<span style="background:#dcfce7;color:#166534;font-size:9px;padding:1px 5px;border-radius:99px;font-weight:700">自分</span>` : ''}
          </div>
          <div class="dev-acct-handle">@${a.account_id}</div>
          <div class="dev-acct-meta">登録日：${regDate}${a.region ? ` ／ ${a.region}` : ''}${a.gender ? ` ／ ${a.gender}` : ''}</div>
        </div>
        <button class="dev-acct-delete-btn" onclick="devDeleteAccount('${a.account_id}', '${(a.nickname || a.account_id).replace(/'/g, "\\'")}')" ${isMe ? 'disabled title="自分のアカウントは削除できません"' : ''}>
          <i class="ti ti-trash"></i>
        </button>
      </div>`;
  }).join('');

  // 件数バッジを更新
  const badge = document.getElementById('dev-accounts-count');
  if (badge) badge.textContent = accounts.length + ' 件';
}

async function devDeleteAccount(accountId, nickname) {
  if (!accountId) return;
  const myAccountId = localStorage.getItem('trendy_account_id');
  if (accountId === myAccountId) { showToast('自分のアカウントは削除できません', 'error'); return; }

  if (!confirm(`「${nickname}」（@${accountId}）を完全削除しますか？\n\n投稿・フォロー・通知などすべてのデータが削除されます。\nこの操作は取り消せません。`)) return;

  const el = document.getElementById(`dev-acct-${accountId}`);
  if (el) el.style.opacity = '0.4';

  const ok = await dbDeleteAccount(accountId);
  if (!ok) {
    if (el) el.style.opacity = '';
    showToast('削除に失敗しました', 'error');
    return;
  }

  if (el) el.remove();
  showToast(`@${accountId} を削除しました`, 'success');

  // 件数バッジを更新
  const badge = document.getElementById('dev-accounts-count');
  if (badge) {
    const cur = parseInt(badge.textContent) || 0;
    badge.textContent = Math.max(0, cur - 1) + ' 件';
  }
}

function renderDevBrandSection() {
  const el = document.getElementById('dev-brand-section');
  if (!el) return;
  const name  = appName || 'Trendy';
  const first = name[0].toUpperCase();
  const iconPreviewHTML = appIcon
    ? `<img src="${appIcon}" style="width:52px;height:52px;object-fit:cover;border-radius:12px;display:block">`
    : `<div style="width:52px;height:52px;background:var(--accent);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;font-weight:900">${first}</div>`;

  el.innerHTML = `
    <div class="dev-brand-preview">
      ${iconPreviewHTML}
      <span class="dev-brand-name">${name}</span>
    </div>

    <div style="margin-top:14px">
      <label class="settings-key" style="font-size:12px;display:block;margin-bottom:6px">サービス名</label>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" id="dev-app-name-input" class="test-input"
          value="${name}" maxlength="20" placeholder="例：Trendy" style="flex:1">
        <button class="btn-sm" onclick="saveAppName()">
          <i class="ti ti-check"></i> 適用
        </button>
        ${name !== 'Trendy' ? `<button class="btn-sm" style="color:var(--text3)" onclick="resetAppName()">
          <i class="ti ti-rotate-clockwise"></i> リセット
        </button>` : ''}
      </div>
    </div>

    <div style="margin-top:14px">
      <label class="settings-key" style="font-size:12px;display:block;margin-bottom:6px">アイコン画像</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn-sm" onclick="document.getElementById('dev-icon-upload').click()">
          <i class="ti ti-upload"></i> 画像をアップロード
        </button>
        ${appIcon ? `<button class="btn-sm" style="color:#ef4444;border-color:#fca5a5" onclick="resetAppIcon()">
          <i class="ti ti-trash"></i> 削除
        </button>` : ''}
        <input type="file" id="dev-icon-upload" accept="image/*" style="display:none"
          onchange="handleAppIconUpload(this)">
      </div>
      <div class="settings-desc" style="margin-top:6px">正方形の画像推奨（PNG・JPG）。ロゴマーク・ウェルカム画面などに適用されます。</div>
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <button class="btn-primary" style="width:100%;justify-content:center;gap:8px" onclick="pushBrandToAllDevices()">
        <i class="ti ti-world-upload"></i> 全端末に今すぐ反映
      </button>
      <div class="settings-desc" style="margin-top:6px;text-align:center">クリックするとサービス名・アイコンをSupabaseに保存し、他のアカウントに反映されます</div>
    </div>`;
}

async function pushBrandToAllDevices() {
  const btn = document.querySelector('[onclick="pushBrandToAllDevices()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> 保存中...'; }
  try {
    await dbSaveAppConfig(appName, appIcon);
    showToast(`✅ 反映しました。他の端末でページを再読み込みすると「${appName}」が表示されます`, 'success');
    console.log('[Brand] DBに保存完了 name:', appName, '/ icon:', appIcon ? '(あり)' : '(なし)');
  } catch(e) {
    showToast('保存に失敗しました: ' + e.message, 'error');
    console.error('[Brand] 保存エラー:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-world-upload"></i> 全端末に今すぐ反映'; }
  }
}

async function saveAppName() {
  const input = document.getElementById('dev-app-name-input');
  const name = (input?.value || '').trim();
  if (!name) { showToast('サービス名を入力してください'); return; }
  appName = name;
  localStorage.setItem('trendy_app_name', name);
  _applyAppBrand();
  renderDevBrandSection();
  await dbSaveAppConfig(appName, appIcon);
  showToast(`サービス名を「${name}」に変更しました ✅`, 'success');
}

async function resetAppName() {
  appName = 'Trendy';
  localStorage.removeItem('trendy_app_name');
  _applyAppBrand();
  renderDevBrandSection();
  await dbSaveAppConfig('Trendy', appIcon);
  showToast('サービス名をリセットしました');
}

function handleAppIconUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    appIcon = e.target.result;
    localStorage.setItem('trendy_app_icon', appIcon);
    _applyAppBrand();
    renderDevBrandSection();
    await dbSaveAppConfig(appName, appIcon);
    showToast('アイコン画像を更新しました ✅', 'success');
  };
  reader.readAsDataURL(file);
}

async function resetAppIcon() {
  if (!confirm('アイコン画像を削除しますか？')) return;
  appIcon = null;
  localStorage.removeItem('trendy_app_icon');
  _applyAppBrand();
  renderDevBrandSection();
  await dbSaveAppConfig(appName, null);
  showToast('アイコン画像を削除しました');
}

function renderDevAccountSection() {
  const el = document.getElementById('dev-account-section');
  if (!el) return;
  el.innerHTML = isDeveloper
    ? `<div class="dev-account-card active">
        <div class="dev-account-icon"><i class="ti ti-shield-check"></i></div>
        <div class="dev-account-info">
          <div class="dev-account-title">開発者アカウント <span class="badge-dev"><i class="ti ti-code" style="font-size:10px;vertical-align:-1px"></i> 開発者</span></div>
          <div class="dev-account-desc">現在の ${myHandle} アカウントに開発者権限が付与されています</div>
        </div>
        <button class="btn-sm" style="background:#fee2e2;color:#991b1b;border-color:#fca5a5" onclick="toggleDeveloperAccount(false)">
          <i class="ti ti-shield-x"></i> 解除
        </button>
      </div>`
    : `<div class="dev-account-card">
        <div class="dev-account-icon"><i class="ti ti-shield"></i></div>
        <div class="dev-account-info">
          <div class="dev-account-title">開発者アカウント</div>
          <div class="dev-account-desc">有効にすると開発者ページへのアクセスと特別なバッジが表示されます</div>
        </div>
        <button class="btn-sm" style="background:#1e1b4b;color:#a5b4fc;border-color:#3730a3" onclick="toggleDeveloperAccount(true)">
          <i class="ti ti-shield-check"></i> 有効にする
        </button>
      </div>`;
}

function toggleDeveloperAccount(enable) {
  isDeveloper = enable;
  if (enable) {
    localStorage.setItem('trendy_isDev', 'true');
    showToast('🛡️ 開発者アカウントを有効にしました', 'success');
  } else {
    localStorage.removeItem('trendy_isDev');
    showToast('開発者アカウントを解除しました');
  }
  _applyMyName();
  _applyNameTag();
  renderDevAccountSection();
  // Supabaseにも同期
  const _aid = localStorage.getItem('trendy_account_id');
  if (_aid && typeof dbUpdateProfile === 'function') {
    dbUpdateProfile({ accountId: _aid, nickname: myNickname, bio: myBio, isDev: isDeveloper });
  }
}

function renderDevSubRanking() {
  const el = document.getElementById('dev-sub-ranking');
  if (!el) return;
  const cats = CATS_DATA.filter(c => c.id !== 'all');
  if (Object.keys(catSubStats).length === 0) {
    el.innerHTML = `<p class="dev-empty">まだタグ付き投稿がありません。投稿にカテゴリー＋タグを設定すると集計が始まります。</p>`;
    return;
  }
  el.innerHTML = cats.map(cat => {
    const stats = catSubStats[cat.id] || {};
    const entries = Object.entries(stats).sort((a,b) => b[1].score - a[1].score);
    if (!entries.length) return '';
    const maxScore = entries[0]?.[1].score || 1;
    return `<div class="dev-sub-cat-block">
      <div class="dev-sub-cat-title">
        <i class="ti ${cat.icon}" style="color:${cat.color}"></i>${cat.name}
      </div>
      ${entries.map(([tag, s], i) => `
        <div class="dev-sub-row">
          <span class="dev-sub-rank">${i+1}</span>
          <span class="dev-sub-name">${tag}</span>
          <div class="dev-sub-bar-wrap"><div class="dev-sub-bar" style="width:${Math.round(s.score/maxScore*100)}%;background:${cat.color}"></div></div>
          <span class="dev-sub-count">投稿${s.count} / ♥${s.likes}</span>
        </div>`).join('')}
    </div>`;
  }).filter(Boolean).join('') || `<p class="dev-empty">まだタグ付き投稿がありません。</p>`;
}

// ══════════════════════════════════════════
// テストモード
// ══════════════════════════════════════════

function renderTestPage() {
  renderTestActiveCard();
  renderTestDummyList();
}

function renderTestActiveCard() {
  const el = document.getElementById('test-active-user-card');
  if (!el) return;
  if (testActiveUser) {
    el.innerHTML = `
      <div class="test-active-card">
        <div class="test-dummy-av" style="background:${testActiveUser.bg};color:${testActiveUser.tc}">${testActiveUser.av}</div>
        <div class="test-dummy-info">
          <div class="test-dummy-name">${testActiveUser.n}</div>
          <div class="test-dummy-handle">${testActiveUser.h}</div>
        </div>
        <span style="background:#f59e0b;color:#fff;font-size:10px;padding:2px 8px;border-radius:99px;font-weight:700">操作中</span>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="test-self-card">
        <div class="test-dummy-av" style="background:#dbeafe;color:#1e40af">あ</div>
        <div class="test-dummy-info">
          <div class="test-dummy-name">あなた（自分）</div>
          <div class="test-dummy-handle">${myHandle}</div>
        </div>
        <span style="background:#d1fae5;color:#065f46;font-size:10px;padding:2px 8px;border-radius:99px;font-weight:700">操作中</span>
      </div>`;
  }
}

function renderTestDummyList() {
  const el = document.getElementById('test-dummy-list');
  if (!el) return;
  if (!testDummyUsers.length) {
    el.innerHTML = `<p style="color:var(--text3);font-size:13px;padding:8px 0">ダミーユーザーはまだいません</p>`;
    return;
  }
  el.innerHTML = testDummyUsers.map(u => {
    const isActive = testActiveUser && testActiveUser.id === u.id;
    return `
      <div class="test-dummy-item">
        <div class="test-dummy-av" style="background:${u.bg};color:${u.tc}">${u.av}</div>
        <div class="test-dummy-info">
          <div class="test-dummy-name">${u.n} ${isActive ? '<span style="background:#f59e0b;color:#fff;font-size:10px;padding:1px 6px;border-radius:99px;font-weight:700">操作中</span>' : ''}</div>
          <div class="test-dummy-handle">${u.h}</div>
        </div>
        <div class="test-dummy-actions">
          <button class="btn-sm" onclick="testSwitchUser(${u.id})" ${isActive ? 'style="background:var(--accent);color:#fff"' : ''}>${isActive ? '選択中' : '切り替え'}</button>
          <button class="btn-sm" style="color:#ef4444;border-color:#fca5a5" onclick="testDeleteDummyUser(${u.id})"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;
  }).join('');
}

function testAddDummyUser() {
  const name = document.getElementById('test-dummy-name').value.trim();
  let handle = document.getElementById('test-dummy-handle').value.trim();
  if (!name) { showToast('表示名を入力してください'); return; }
  if (!handle) handle = '@user_' + (++testDummyCounter);
  if (!handle.startsWith('@')) handle = '@' + handle;
  const colors = TEST_COLORS[testDummyUsers.length % TEST_COLORS.length];
  const u = { id: ++testDummyCounter, n: name, h: handle, av: name[0], ...colors };
  testDummyUsers.push(u);
  document.getElementById('test-dummy-name').value = '';
  document.getElementById('test-dummy-handle').value = '';
  document.getElementById('test-add-form').style.display = 'none';
  renderTestDummyList();
  showToast(`ダミーユーザー「${name}」を追加しました`);
}

function testDeleteDummyUser(id) {
  testDummyUsers = testDummyUsers.filter(u => u.id !== id);
  if (testActiveUser && testActiveUser.id === id) testSwitchToSelf();
  renderTestDummyList();
  showToast('ダミーユーザーを削除しました');
}

function testSwitchUser(id) {
  const u = testDummyUsers.find(u => u.id === id);
  if (!u) return;
  testActiveUser = u;
  updateTestBanner();
  applyTestUser();
  renderTestPage();
  showToast(`「${u.n}」として操作中`);
}

function testSwitchToSelf() {
  testActiveUser = null;
  updateTestBanner();
  applyTestUser();
  renderTestPage();
  showToast(`自分（${myHandle}）に戻りました`);
}

function applyTestUser() {
  const u = testActiveUser;
  // ダミーユーザー情報 or 自分の情報
  const name   = u ? u.n   : (myNickname || 'あなた');
  const handle = u ? u.h   : myHandle;
  const av     = u ? u.av  : 'あ';
  const bg     = u ? u.bg  : '#dbeafe';
  const tc     = u ? u.tc  : '#1e40af';
  const isDummy = !!u;

  // ── サイドバー ──
  const sideName  = document.getElementById('sidebar-user-name');
  const sideHndl  = document.getElementById('sidebar-user-handle');
  const sideChip  = document.getElementById('sidebar-acct-type');
  if (sideName) sideName.textContent = name;
  if (sideHndl) sideHndl.textContent = handle;
  if (sideChip) {
    sideChip.textContent = isDummy ? 'テスト' : (myAccountType === 'sub' ? 'サブ' : 'メイン');
    sideChip.className = 'sidebar-acct-chip ' + (isDummy ? 'chip-sub' : (myAccountType === 'sub' ? 'chip-sub' : 'chip-main'));
  }

  // ── ホーム プロフィールバー ──
  const homeAv   = document.getElementById('home-av-display');
  const homeName = document.getElementById('home-profile-name');
  if (homeAv) { homeAv.textContent = av; homeAv.style.background = bg; homeAv.style.color = tc; }
  if (homeName) homeName.innerHTML = isDummy
    ? `${name} <span class="badge-sub" style="font-size:10px">テスト</span>`
    : (myNickname || 'あなた');

  // ── 投稿欄のアバター ──
  const composeAv = document.getElementById('home-compose-av');
  if (composeAv) { composeAv.textContent = av; composeAv.style.background = bg; composeAv.style.color = tc; }

  // ── マイページ ──
  const myAv     = document.getElementById('my-av-display');
  const myName   = document.getElementById('mypage-profile-name');
  const myHandle = document.getElementById('mypage-profile-handle');
  if (myAv)     { myAv.textContent = av; myAv.style.background = bg; myAv.style.color = tc; }
  if (myName)   myName.innerHTML = isDummy
    ? `${name} <span class="badge-sub" style="font-size:10px">テスト</span>`
    : `${myNickname || 'あなた'} <span class="badge-main">メイン</span>`;
  if (myHandle) myHandle.textContent = handle;

  // ── マイページ投稿一覧を更新 ──
  renderMyPosts();
  renderMyRank();
}

function updateTestBanner() {
  const banner = document.getElementById('test-active-banner');
  const text   = document.getElementById('test-active-banner-text');
  if (!banner) return;
  if (testActiveUser) {
    banner.style.display = 'flex';
    text.textContent = `「${testActiveUser.n}」（${testActiveUser.h}）として操作中`;
  } else {
    banner.style.display = 'none';
  }
}

async function testReset() {
  if (!confirm('投稿・通知・名前タグ・広告表示回数をすべて削除します。\nサービス開始直後の状態にリセットしますか？')) return;

  // ── ローカルリセット ──
  HOME_TWEETS.length = 0;
  myPosts.length = 0;
  homeLoaded = 0;
  useDummyData = false;
  localStorage.removeItem('trendy_dummy_mode');
  const feed = document.getElementById('home-feed');
  if (feed) feed.innerHTML = '';
  loadHomeMore(); // 空フィード表示

  // 通知をリセット（ローカル + Supabase）
  NOTIFS.length = 0;
  NOTIFS_SUB.length = 0;
  renderNotifs();
  if (typeof dbDeleteAllNotifs === 'function') dbDeleteAllNotifs(); // Supabase 側も削除

  // 名前タグ・ニックネームをリセット（開発者アカウントデータは保持）
  myNameTag = '';
  myNickname = 'あなた';
  myBio = '';
  localStorage.removeItem('trendy_myNameTag');
  localStorage.removeItem('trendy_myName');
  localStorage.removeItem('trendy_bio');
  localStorage.removeItem('trendy_av');
  localStorage.removeItem('trendy_cover');
  localStorage.removeItem('trendy_last_sync');
  // アバター・カバーをデフォルトに戻す
  ['my-av-display','home-av-display','sidebar-user-av','home-compose-av'].forEach(id => {
    const el = document.getElementById(id); if (el) { el.innerHTML = 'あ'; }
  });
  const coverEl = document.getElementById('profile-cover-img');
  if (coverEl) { coverEl.style.backgroundImage = ''; }
  // 月1回制限タイムスタンプもリセット
  ['nickname','phone','region'].forEach(k => localStorage.removeItem('trendy_last_change_' + k));
  // ※ trendy_logged_in / trendy_registered / trendy_userId / trendy_isDev / trendy_gender / trendy_dob / trendy_region は削除しない（アカウント情報は永続保持）

  // UI反映
  _applyMyName();
  _applyNameTag();
  const display  = document.getElementById('profile-name-tag-display');
  const btnLabel = document.getElementById('name-tag-btn-label');
  if (display)  { display.textContent = ''; display.style.display = 'none'; }
  if (btnLabel) btnLabel.textContent = 'タグを追加';

  // マイページ・ランキング再描画
  renderMyPosts();
  renderMyRank();
  renderCatGrid();

  // ── Supabase リセット ──
  try {
    await Promise.all([
      db.from('posts').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      db.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      db.from('ad_impressions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    ]);
    console.log('[TEST] DBリセット完了');
  } catch(e) {
    console.warn('[TEST] DBリセットエラー:', e);
  }

  showToast('✅ サービス開始直後の状態にリセットしました');
  goPage('home', null);
}

// ── Init ───────────────────────────────────────────────
function init() {
  // ── アプリブランドを復元 ──
  appName = localStorage.getItem('trendy_app_name') || 'Trendy';
  appIcon = localStorage.getItem('trendy_app_icon') || null;
  _applyAppBrand();

  // 開発者フラグを復元（最優先・リセット対象外）
  isDeveloper = localStorage.getItem('trendy_isDev') === 'true';
  _applyDevNav();

  // localStorageから自分の情報を復元（リセットでも消えない）
  // 内部セッションキー（表示はしないが一意性確保のため保持）
  if (!localStorage.getItem('trendy_userId')) { myUserId = _genUserId(); }
  else { myUserId = localStorage.getItem('trendy_userId'); }

  const savedName = localStorage.getItem('trendy_myName');
  if (savedName) { myNickname = savedName; }
  _applyMyName();

  // ハンドルを復元（登録済みIDがあれば @ID、なければ @you）
  const savedAccountId = localStorage.getItem('trendy_account_id');
  myHandle = '@' + (savedAccountId || 'you');
  // USER_PROFILES のキーを myHandle に合わせてエイリアス
  if (myHandle !== '@you' && !USER_PROFILES[myHandle]) {
    USER_PROFILES[myHandle] = USER_PROFILES['@you'] || { categories: [] };
  }
  catPickerTargetHandle = myHandle;
  _applyMyHandle();

  // 登録時に入力した属性情報を復元
  const _restoreVal = (key, ...ids) => {
    const val = localStorage.getItem(key);
    if (!val) return;
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = val; });
  };
  _restoreVal('trendy_gender', 'settings-gender-val', 'pe-gender-val');
  _restoreVal('trendy_dob',    'settings-dob-val',    'pe-dob-val');
  _restoreVal('trendy_region', 'settings-region-val', 'pe-region-val');

  const savedNameTag = localStorage.getItem('trendy_myNameTag');
  if (savedNameTag) {
    myNameTag = savedNameTag;
    _applyNameTag();
    const display = document.getElementById('profile-name-tag-display');
    const btnLabel = document.getElementById('name-tag-btn-label');
    if (display) { display.textContent = '＠' + myNameTag; display.style.display = ''; }
    if (btnLabel) btnLabel.textContent = 'タグを編集';
  }

  // アバター・カバー・自己紹介を復元
  const savedAv    = localStorage.getItem('trendy_av');
  const savedCover = localStorage.getItem('trendy_cover');
  const savedBio   = localStorage.getItem('trendy_bio');
  if (savedAv)    _applyAvImage(savedAv);
  if (savedCover) _applyCoverImage(savedCover);
  if (savedBio) {
    myBio = savedBio;
    const bioDisplay = document.getElementById('profile-bio-display');
    if (bioDisplay) { bioDisplay.textContent = myBio; bioDisplay.className = ''; }
  }

  if (useDummyData) initHomeTweets(); // ダミーモードがONの時のみ読み込む
  loadHomeMore();
  initComposeCatPills();
  renderCatGrid(); // まず空で描画
  _loadRankData().then(() => renderCatGrid()); // Supabase から取得後に再描画
  renderNotifs();
  renderMyPosts();
  renderMyRank();
  renderMyCats();
  // 閲覧数カウント（画面表示時）
  _initViewObserver();
  // Supabase からデータを非同期ロード（広告など）
  initSupabase();

  // ── 未ログインチェック：ウェルカムページへリダイレクト ──
  if (!localStorage.getItem('trendy_logged_in')) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const wp = document.getElementById('page-welcome');
    if (wp) wp.classList.add('active');
  }
}

document.addEventListener('DOMContentLoaded', init);

// ── プロフィール自動同期（タブがアクティブになったとき）──────
async function _syncProfileFromSupabase() {
  if (!localStorage.getItem('trendy_logged_in')) return;
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || typeof dbFetchProfile !== 'function') return;
  try {
    const profile = await dbFetchProfile(aid);
    if (!profile) return;

    // updated_at タイムスタンプで変更を検出（base64文字列比較より確実）
    const lastSync  = localStorage.getItem('trendy_last_sync') || '0';
    const remoteTs  = profile.updated_at || '0';
    if (remoteTs <= lastSync) return; // Supabase側に新しい更新なし

    // ── ニックネーム ──
    if (profile.nickname) {
      myNickname = profile.nickname;
      localStorage.setItem('trendy_myName', myNickname);
      _applyMyName();
    }
    // ── 自己紹介 ──
    if (typeof profile.bio === 'string') {
      myBio = profile.bio;
      localStorage.setItem('trendy_bio', myBio);
      const bioEl = document.getElementById('profile-bio-display');
      if (bioEl && myBio) { bioEl.textContent = myBio; bioEl.className = ''; }
    }
    // ── アバター（Supabaseに画像があれば必ず適用）──
    if (profile.avatar_data) {
      localStorage.setItem('trendy_av', profile.avatar_data);
      _applyAvImage(profile.avatar_data);
    }
    // ── カバー（Supabaseに画像があれば必ず適用）──
    if (profile.cover_data) {
      localStorage.setItem('trendy_cover', profile.cover_data);
      _applyCoverImage(profile.cover_data);
    }
    // ── 名前タグ ──
    if (profile.name_tag !== undefined && profile.name_tag !== null) {
      myNameTag = profile.name_tag;
      localStorage.setItem('trendy_myNameTag', myNameTag);
      _applyNameTag();
      const display  = document.getElementById('profile-name-tag-display');
      const btnLabel = document.getElementById('name-tag-btn-label');
      if (display)  { display.textContent = myNameTag ? '＠' + myNameTag : ''; display.style.display = myNameTag ? '' : 'none'; }
      if (btnLabel) btnLabel.textContent = myNameTag ? 'タグを編集' : 'タグを追加';
    }
    // ── 地域・性別・生年月日 ──
    if (profile.region) {
      localStorage.setItem('trendy_region', profile.region);
      ['settings-region-val','pe-region-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = profile.region; });
    }
    if (profile.gender) {
      const label = profile.gender === 'male' ? '男性（非公開）' : '女性（非公開）';
      localStorage.setItem('trendy_gender', label);
      ['settings-gender-val','pe-gender-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = label; });
    }
    if (profile.dob) {
      localStorage.setItem('trendy_dob', profile.dob);
      ['settings-dob-val','pe-dob-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = profile.dob; });
    }

    // ── カテゴリー ──
    if (profile.categories && Array.isArray(profile.categories)) {
      if (!USER_PROFILES[myHandle]) USER_PROFILES[myHandle] = { categories: [] };
      USER_PROFILES[myHandle].categories = profile.categories;
      if (typeof renderMyCats === 'function') renderMyCats();
    }
    // 同期済みタイムスタンプを保存（次回以降の無駄な同期を防ぐ）
    localStorage.setItem('trendy_last_sync', remoteTs);
    console.log('[Sync] プロフィールを同期しました (updated_at:', remoteTs, ')');
  } catch (e) {
    console.warn('[Sync] プロフィール同期エラー:', e.message);
  }
}

// タブ/ウィンドウがアクティブになったら同期
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) _syncProfileFromSupabase();
});
window.addEventListener('focus', () => {
  _syncProfileFromSupabase();
});
