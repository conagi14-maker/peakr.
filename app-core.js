// ※ このファイルは app.js を機能別に分割したものです（読み込み順厳守）
// 基盤・ホームフィード・投稿・称号バッジ強化

﻿// ── 公開URL ─────────────────────────────────────────────
const APP_BASE_URL = 'https://quiet-travesseiro-f384ae.netlify.app/';

// ══════════════════════════════════════════
// 📱 モバイル ドロワーサイドバー
// ══════════════════════════════════════════
(function _initMobileSidebar() {
  const MOBILE_BP  = 768;  // px
  const EDGE_W     = 32;   // 左端からこの幅内のスワイプ開始で開く
  const MIN_SWIPE  = 50;   // 開閉判定の最小スワイプ距離

  let _startX = 0, _startY = 0, _dragging = false;

  function _isMobile() { return window.innerWidth <= MOBILE_BP; }

  window.openMobileSidebar = function() {
    if (!_isMobile()) return;
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sb-overlay')?.classList.add('open');
    document.getElementById('sb-hamburger')?.classList.add('hidden');
  };

  window.closeMobileSidebar = function() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sb-overlay')?.classList.remove('open');
    document.getElementById('sb-hamburger')?.classList.remove('hidden');
  };

  // ナビ項目タップで自動クローズ
  document.addEventListener('click', e => {
    if (!_isMobile()) return;
    if (e.target.closest('.nav-item')) closeMobileSidebar();
  });

  // タッチスワイプ検知
  document.addEventListener('touchstart', e => {
    if (!_isMobile()) return;
    _startX = e.touches[0].clientX;
    _startY = e.touches[0].clientY;
    _dragging = true;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!_isMobile() || !_dragging) return;
    _dragging = false;
    const dx = e.changedTouches[0].clientX - _startX;
    const dy = e.changedTouches[0].clientY - _startY;

    // 縦スクロールは無視
    if (Math.abs(dy) > Math.abs(dx) * 1.2) return;
    if (Math.abs(dx) < MIN_SWIPE) return;

    const isOpen = document.getElementById('sidebar')?.classList.contains('open');
    if (dx > 0 && _startX < EDGE_W && !isOpen) {
      openMobileSidebar();   // 左端から右スワイプ → 開く
    } else if (dx < 0 && isOpen) {
      closeMobileSidebar();  // 右スワイプ中に左スワイプ → 閉じる
    }
  }, { passive: true });

  // リサイズ時にデスクトップに戻ったら強制クローズ
  window.addEventListener('resize', () => {
    if (!_isMobile()) closeMobileSidebar();
  });
})();

// ── State ──────────────────────────────────────────────
let catVisible = {};
let catOrder = CATS_DATA.filter(c => c.id !== 'all').map(c => c.id);
// ユーザー独自の並び順を適用（保存済みの場合のみ）
try {
  const _uo = JSON.parse(localStorage.getItem('trendy_cat_order_user') || '[]');
  if (_uo.length) catOrder.sort((a, b) => {
    const ia = _uo.indexOf(a), ib = _uo.indexOf(b);
    if (ia < 0 && ib < 0) return 0;
    if (ia < 0) return 1; if (ib < 0) return -1;
    return ia - ib;
  });
} catch(e) {}
let catColWidth = 200;
let catSelSubs = {};
let catGridMode = 'main';   // 'main' | 'sub'
let catGridParent = null;   // cat object when in sub mode
let bookmarks = [];

let rankPeriod = 'daily';
let rankCat = 'all';
let rankTweets = [];
let rankOffset = 0;
let rankPrefecture = '全国';  // 選択中の都道府県（'全国' = フィルタなし）
let recommendUserFilter = 'all'; // 'all' | 'following' | 'followers'（ダイブ）
let _followerHandleSet = null;   // フォロワーhandle Setキャッシュ（ダイブ用）

// ── おすすめページ状態 ──
const homeMediaFilters = new Set(); // 選択中のコンテンツタイプ（空 = すべて）
let RECOMMEND_TWEETS = [];        // おすすめフィード用バッファ（検索フィルター後）
let _recommendRawTweets = [];     // フェッチした全投稿（検索前の原本）
let recommendLoaded = 0;
let recommendLoading = false;
let recommendCatFilter = null;    // null = 全カテゴリー
let recommendSearchQuery = '';    // キーワード検索文字列
const _seenReelIds = new Set();   // セッション中に表示済みのdb_id

let fsCat = null;
let fsSub = '全体';
let fsMode = 'ranking';
let fsOffset = 0;
let fsTweets = [];

let pendingAi = 'none';
let pendingAdImg = null;   // 広告作成時の一時画像データ
let pendingMedia    = null;   // 投稿添付メディア { data: base64url, type: 'image'|'video' }
let pendingUrl      = null;   // 投稿に添付するURLボタン用URL
let pendingImageUrl = null;   // 画像タップ時に開くURL
let pendingCatId = null;   // 選択中のメインカテゴリーID
let pendingTags  = [];     // 入力済みタグ配列（例: ['#イラスト', '#ファンアート']）
let pendingLikeEmoji = '❤️'; // この投稿のいいね絵文字
const catSubStats = {};    // { [catId]: { [tagName]: { count, likes, score } } }
let adAccountType = 'main'; // 広告出稿に使うアカウント 'main' | 'sub'
let myAccountType = localStorage.getItem('trendy_acct_type') || 'main'; // 'main' | 'sub'
let hasSubAccount   = localStorage.getItem('trendy_has_sub') === 'true';
let subAccountName  = localStorage.getItem('trendy_sub_name') || 'サブ';
// ハンドルはアカウントIDから自動生成（一意性を保証）
let subAccountHandle = (() => {
  const aid = localStorage.getItem('trendy_account_id');
  return aid ? '@' + aid + '_sub' : '@anon_sub';
})();
let currentUserHandle = null;
let userPostFilter = 'all';
let prevPageId = 'home';
let replyTargetIdx = null;
const tweetReplies = {};
let myBio = '';
let myNickname = localStorage.getItem('trendy_myName') || 'あなた'; // ニックネーム
let myHandle   = '@' + (localStorage.getItem('trendy_account_id') || 'you'); // メインハンドル
let myLikeEmoji = localStorage.getItem('trendy_like_emoji') || '❤️'; // いいね絵文字
let myTitleBadge = localStorage.getItem('trendy_title_badge') || ''; // 称号バッジ
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
let badgeVerifiedIcon  = localStorage.getItem('trendy_badge_verified_icon')  || null;
let badgeCorporateIcon = localStorage.getItem('trendy_badge_corporate_icon') || null;
const _badgeCache = {}; // { accountId: { is_verified, is_corporate } } — populate when profiles fetched

/** 認証バッジ デフォルトアイコン（青丸＋白チェックマーク） */
const _DEFAULT_VERIFIED_ICON = (() => {
  const s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    + '<circle cx="12" cy="12" r="11" fill="#2563EB"/>'
    + '<polyline points="7,12.5 10.5,16 17,9.5" fill="none" stroke="white" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
})();

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

// ── お気に入り（保存ツイート）────────────────────────────
const favDbIds  = new Set();   // db_id → O(1) 判定用
let savedTweets = [];          // [{saveId, db_id, folder, savedAt, ...tweet snapshot}]
let favFolders  = [];          // フォルダー名の配列
let _favActiveFolder = null;   // null = すべて
// デフォルトフォルダーと表示タイプ定数
const FAV_DEFAULT_FOLDERS = ['つぶやき', 'イラスト', '動画'];
const FAV_DEFAULT_TYPES   = { 'つぶやき': 'list', 'イラスト': 'grid', '動画': 'grid' };
let favFolderTypes  = {};          // { [folderName]: 'grid' | 'list' }
let _pendingFolderType = 'list';   // フォルダー作成モーダルで選択中のタイプ

// 旧 favorites との互換エイリアス（呼出し元が残っていても壊れないよう）
const favorites = favDbIds;
const likedTweets = new Set();     // 表示中ツイートのidx単位
const likedDbIds  = new Set();     // Supabase db_id単位（永続化）
const viewedPostIds = new Set();   // セッション内閲覧済み（重複カウント防止）

// ── 閲覧数カウント：画面に表示されたら自動カウント ────────────
let _viewObserver = null;
let _viewMutObs   = null;
let _viewObsTimer = null;

/** カードがどの画面で表示されたか（アクセス解析の「どこで見られた」用） */
function _viewSourceOf(el) {
  if (el.closest('#tweet-detail-modal')) return 'detail';
  const pg = el.closest('.page');
  if (!pg) return 'other';
  const id = (pg.id || '').replace(/^page-/, '');
  const map = { home: 'home', latest: 'latest', recommend: 'dive', ranking: 'ranking', user: 'profile' };
  return map[id] || id || 'other';
}

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
      // Supabase へ送信（DB側でも重複防止）。どの画面で見られたかも記録
      if (typeof dbIncrementView === 'function') dbIncrementView(dbId, aid, _viewSourceOf(el));
      // 推しレベル更新（推しユーザーの投稿のみ）
      if (t && t.user && t.user.h && typeof dbUpdateFanLevel === 'function') {
        const authorId = t.user.h.startsWith('@') ? t.user.h.slice(1) : t.user.h;
        if (_isFanTrigger(authorId)) dbUpdateFanLevel(aid, authorId, 'view', 1);
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
/** HTMLエスケープ（XSS対策の共通ヘルパー）。innerHTML に入るユーザー入力は必ずこれを通す */
function _escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** テキスト内の URL をクリッカブルリンクに変換（先にHTMLエスケープしてから処理） */
function _linkify(text) {
  if (!text) return '';
  const esc = _escHtml(text);
  return esc.replace(/(https?:\/\/[^\s<>"]+)/g, m => {
    const raw = m.replace(/&amp;/g, '&'); // href 用に & だけ戻す
    return `<a href="${encodeURI(raw)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="tweet-link">${m}</a>`;
  });
}
/** 投稿に添付された URL ボタンの HTML を返す */
function _urlBtnHTML(url) {
  if (!url) return '';
  let label = url;
  try { const u = new URL(url); label = u.hostname + (u.pathname !== '/' ? u.pathname : ''); } catch(e) {}
  if (label.length > 40) label = label.slice(0, 40) + '…';
  return `<a class="tweet-url-btn" href="${encodeURI(url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"><i class="ti ti-link"></i>${label}</a>`;
}
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
function favStar(idx) {
  const t = _tc[idx];
  const on = t?.db_id ? favDbIds.has(String(t.db_id)) : false;
  return `<button class="action-btn${on?' faved':''}" onclick="event.stopPropagation();toggleFavByIdx(${idx},this)"><i class="ti ti-star${on?'-filled':''}"></i>${on?'登録済み':'お気に入り'}</button>`;
}
function fsFavBtn(idx) {
  const t = _tc[idx];
  const on = t?.db_id ? favDbIds.has(String(t.db_id)) : false;
  return `<button class="fs-fav-btn${on?' on':''}" onclick="event.stopPropagation();toggleFavByIdx(${idx},this)" title="お気に入り"><i class="ti ti-star${on?'-filled':''}"></i></button>`;
}

// ── Page Navigation ────────────────────────────────────

// マウス戻る/進む（History API）用フラグ
let _poppingState       = false;  // popstate から呼ばれた場合 true
let _historyInitialized = false;  // 最初のページは replaceState で初期化

// ブラウザ戻る/進む（マウスサイドボタン含む）
window.addEventListener('popstate', e => {
  const page = e.state?.page;
  if (!page) return;
  _poppingState = true;
  goPage(page, null);
  _poppingState = false;
});

// 履歴に積まないページ（認証フロー・オーバーレイ系）
const _HISTORY_SKIP = new Set([
  'welcome','login','register','sub-create',
  'acct-switch','user',
]);

// ── アカウント存在確認（ページ遷移のたびに最大15秒に1回チェック） ──
let _lastAccountExistCheck = 0;
let _profileNullCount = 0; // null が続いた回数（2回で初めてログアウト）
function _checkAccountExistsOnNav() {
  // 未ログイン・認証ページ遷移中は不要
  if (!localStorage.getItem('trendy_logged_in')) return;
  const now = Date.now();
  if (now - _lastAccountExistCheck < 15_000) return; // 15秒キャッシュ
  _lastAccountExistCheck = now;
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || typeof dbFetchProfile !== 'function') return;
  dbFetchProfile(aid).then(profile => {
    if (profile === undefined) { _profileNullCount = 0; return; } // ネットワークエラーは無視
    if (profile !== null) { _profileNullCount = 0; return; }      // 正常に存在する

    // profile === null → 存在しない可能性
    _profileNullCount++;
    if (_profileNullCount < 2) {
      // 1回目はまだ判断しない（登録直後のレース、一時エラー等の可能性）
      console.warn('[CHECK] プロフィールが見つかりません (1回目)。5秒後に再確認します。');
      setTimeout(() => {
        _lastAccountExistCheck = 0; // 即座に再チェックを許可
        _checkAccountExistsOnNav();
      }, 5000);
      return;
    }

    // 2回連続で null → アカウントが確実に削除済みと判断
    _profileNullCount = 0;
    console.warn('[CHECK] プロフィールが2回連続で見つかりません。強制ログアウトします。');
    localStorage.removeItem('trendy_logged_in');
    showToast('アカウントが削除されました。再登録が必要です。', 'error');
    setTimeout(() => {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.getElementById('page-welcome')?.classList.add('active');
    }, 1500);
  }).catch(() => { _profileNullCount = 0; }); // エラーはカウントリセット
}

function goPage(id, btn) {
  const noTrack = ['user','acct-switch','register','sub-create','ads','ad-create','ad-boost','ad-list','ad-report','peak-points','test','profile-edit','welcome','login'];
  if (!noTrack.includes(id)) prevPageId = id;

  // ── アカウント存在確認（全リセット後の即時検出） ──
  if (!['welcome','login','register'].includes(id)) {
    _checkAccountExistsOnNav();
  }

  // ── History API：戻る/進むボタンを有効化 ──
  if (!_HISTORY_SKIP.has(id) && !_poppingState) {
    const state = { page: id };
    if (!_historyInitialized) {
      history.replaceState(state, ''); // 初回は replaceState
      _historyInitialized = true;
    } else {
      history.pushState(state, '');   // 2回目以降は pushState
    }
  }

  // 検索オーバーレイを閉じる
  const _hsOverlay = document.getElementById('home-search-overlay');
  if (_hsOverlay) _hsOverlay.style.display = 'none';

  // DM チャット以外のページに移動したらポーリングを止める
  if (id !== 'dm-chat') _stopDmPoll();
  // ダイブを離れるときに未送信のコインをフラッシュ
  if (id !== 'recommend' && typeof _flushReelCoins === 'function') _flushReelCoins();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const pg = document.getElementById('page-'+id);
  if (pg) pg.classList.add('active');
  if (btn) btn.classList.add('active');
  else {
    const nb = document.querySelector(`.nav-item[data-page="${id}"]`);
    if (nb) nb.classList.add('active');
  }
  // ── ボトムナビのアクティブ状態を同期 ──
  document.querySelectorAll('.bnav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.page === id));
  // DMチャット中はボトムナビを隠す（入力欄と重なるため）
  document.body.classList.toggle('bnav-hidden', id === 'dm-chat');
  // ダイブ（リール画面）ではFABを隠す
  document.body.classList.toggle('fab-hidden', id === 'dm-chat' || id === 'recommend');
  if (id === 'test')         renderTestPage();
  if (id === 'dev')          renderDevPage();
  if (id === 'dev-brand')    renderDevBrandSection();
  if (id === 'dev-announce') renderDevAnnounce();
  if (id === 'dev-users')    renderDevAccountList();
  if (id === 'dev-ads')       renderDevAdsList();
  if (id === 'dev-stats')    { renderDevStatsAll(); }
  if (id === 'dm')          { _stopDmPoll(); renderDmRooms(); }
  if (id === 'dm-chat')     renderDmChat();
  if (id === 'badge-apply') renderBadgeApplyPage();
  if (id === 'badges')      renderBadgesPage();
  if (id === 'dev-config')   renderDevAccountSection();
  if (id === 'dev-cats')     renderDevCatEditor();
  if (id === 'profile-edit') openProfileEdit();
  if (id === 'profile-links') openProfileLinks();
  if (id === 'profile-oshi')  openProfileOshi();
  if (id === 'profile-attrs') openProfileAttrs();
  if (id === 'home')      { _refreshHomeFeedFromDB(); _checkAnnouncementBadge(); if (typeof _updateComposeStageVisibility === 'function') _updateComposeStageVisibility(); }
  if (id === 'mypage')    {
    _refreshMypageStats(); loadUserFavorites(); _loadMypageSocialLinks(); _updateMypageMeta(); _renderDisplayBadges();
    renderProfileEquipmentMini(localStorage.getItem('trendy_account_id'), 'mypage-equipment-mini');
    if (typeof renderMyLevelUI === 'function') renderMyLevelUI();
    _renderMyTrackerStats();
    if (typeof renderMyDashboard === 'function') renderMyDashboard();
    const _le = document.getElementById('mypage-like-emoji-current');
    if (_le) _le.textContent = myLikeEmoji;
    const _tb = document.getElementById('mypage-title-current');
    if (_tb) _tb.textContent = myTitleBadge ? `「${myTitleBadge}」` : '称号';
    // 非同期処理完了後にサブモードUIを再適用（カバー・カテゴリー・名前タグ等）
    setTimeout(() => selectAccount(myAccountType), 150);
  }
  if (id === 'ranking')   { _updateRankRegionChip(); _loadRankData().then(() => { renderCatGrid(); renderAdStrip(); }); syncExternalPosts(); syncPixivPosts(); }
  if (id === 'stage')     { if (typeof renderStage === 'function') renderStage(); }
  if (id === 'recommend') _initRecommendPage();
  if (id === 'ads') renderAdsPage();
  if (id === 'ad-create') renderAdCreatePage();
  if (id === 'ad-boost')  renderAdBoostPage();
  if (id === 'ad-list')   renderAdListPage();
  if (id === 'ad-report') renderAdReportPage();
  if (id === 'peak-points') renderPeakPointsPage();
  if (id === 'feedback') openFeedbackPage();
  if (id === 'gacha')    renderGachaPage();
  // 装備ページは廃止
  if (id === 'equipment') { goPage('home', null); return; }
  if (id === 'highlow')  _hlInitPage();
  if (id === 'latest')   loadLatestFeed(true);
  if (id === 'myposts' && typeof loadMyPostsPage === 'function') loadMyPostsPage();
  if (id === 'tracks')    renderTracksPage();
  if (id === 'dev-gacha') { renderDevGachaList(); setTimeout(() => { _loadCutinRatesUI(); _loadBoostAmountsUI(); _loadRarityProbsUI(); }, 100); }
  if (id === 'dev-rank-rewards') { setTimeout(() => _loadRankRewardsUI(), 100); }
  if (id === 'follows') renderFollows();
  if (id === 'settings') { renderCatSettings(); _initSettingsRegionBtns(); }
  if (id === 'dm-settings') { _loadDmSettingsIntoUI(); }
  if (id === 'acct-switch') renderAcctSwitch();
  if (id === 'notif') { _notifPageTab = 'notif'; renderNotifs(); switchNotifPageTab('notif'); }
  if (id === 'favs') { _syncFavFromSupabase(); initFavsPage(); }
  if (id === 'register') { registerStep(1); }
  if (id === 'login')    { /* single-screen */ }
  if (id === 'sub-create') subCreateStep(1);
}

// ── クイック投稿FAB：ホームのコンポーズへジャンプしてフォーカス ──
function fabCompose() {
  goPage('home', null);
  setTimeout(() => {
    const ta = document.getElementById('compose-input');
    if (ta) {
      ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ta.focus({ preventScroll: true });
    }
  }, 80);
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
    ${_tweetAvHtml('tweet-av clickable', `background:${u.bg};color:${u.tc};overflow:hidden`, u.av, u, `openUserPage('${u.h}')`)}
    <div class="tweet-body">
      <div class="tweet-top">
        <span class="tweet-name clickable" onclick="openUserPage('${u.h}')">${_escHtml(u.n)}</span>
        ${u.nameTag ? `<span class="tweet-name-tag">＠${_escHtml(u.nameTag)}</span>` : ''}
        <span class="tweet-handle">${u.h}</span>
        ${u.sub ? subBadge() : ''}
        ${aiBadge(t.ai)}
        <span class="tweet-time">${t.time}</span>
        ${deleteBtn}
      </div>
      <div class="tweet-clickable-body" onclick="openTweetDetail(${idx})">
        ${t.text ? `<div class="tweet-text">${_linkify(t.text)}</div>` : ''}
        ${t.mediaData ? (
          t.mediaType === 'image'
            ? `<div class="tweet-media">${t.imageLinkUrl && _parseMediaImages(t.mediaData).length === 1
                ? `<img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" style="cursor:pointer" onclick="event.stopPropagation();_confirmExternalLink('${encodeURI(t.imageLinkUrl)}')">`
                : _renderMultiImageHtml(t.mediaData, { imgClass: 'tweet-media-img' })
              }</div>`
            : `<div class="tweet-media"><video src="${t.mediaData}" controls class="tweet-media-vid" preload="metadata"></video></div>`
        ) : ''}
      </div>
      ${t.linkUrl ? `<div style="padding:0 0 6px">${_urlBtnHTML(t.linkUrl)}</div>` : ''}
      <div class="tweet-actions">
        <button class="action-btn reply-btn" onclick="openTweetDetail(${idx})"><i class="ti ti-message-circle"></i><span id="reply-count-${idx}">${replyCount || ''}</span></button>
        <button class="action-btn like-btn${likedTweets.has(idx)?' liked':''}" id="like-btn-${idx}" onclick="toggleLike(${idx},this)">${t.likeEmoji ? `<span class="like-emoji-display">${t.likeEmoji}</span>` : (likedTweets.has(idx) ? `<i class="ti ti-heart-filled" style="color:#e11d48" id="like-icon-${idx}"></i>` : `<i class="ti ti-heart" id="like-icon-${idx}"></i>`)}<span class="like-count" id="like-count-${idx}">${fmt(t.likes)}</span></button>
        <button class="action-btn"><i class="ti ti-eye"></i>${fmt(t.views)}</button>
        ${favStar(idx)}
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
  _resizeHomeMasonry();
  // すべて読み込み済みなら完了表示
  const lm = document.getElementById('home-load-more-btn');
  if (lm) lm.style.display = (homeLoaded >= HOME_TWEETS.length) ? 'block' : 'none';
  // ロード後にまだ画面が埋まらないなら追加読み込み
  setTimeout(() => { if (typeof _tryHomeAutoLoad === 'function') _tryHomeAutoLoad(); }, 250);
}

// ホーム自動読み込み: スクロール監視で自動読み込み
function _tryHomeAutoLoad() {
  const page = document.getElementById('page-home');
  if (!page || !page.classList.contains('active')) return;
  if (homeLoaded >= HOME_TWEETS.length) return;
  const sentinel = document.getElementById('home-sentinel');
  if (!sentinel) return;
  const rect = sentinel.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  if (rect.top < vh + 800) {
    loadHomeMore();
    // 連鎖読み込み（コンテンツが少ない時に一気に複数読む）
    setTimeout(_tryHomeAutoLoad, 200);
  }
}
window.addEventListener('scroll', _tryHomeAutoLoad, { passive: true });
document.addEventListener('scroll', _tryHomeAutoLoad, { passive: true, capture: true });
window.addEventListener('resize', _tryHomeAutoLoad);

// ── おすすめページ初期化 ────────────────────────────────
function _initRecommendPage() {
  // ページを開くたびにリセットして読み込む
  RECOMMEND_TWEETS = [];
  _recommendRawTweets = [];
  recommendLoaded  = 0;
  recommendSearchQuery = '';
  // コイン残高表示を初期化
  _loadMyPoints?.().then(() => _updateDiveCoinDisplay(0));
  // 保存済みのデフォルトフィルターを復元（なければ全表示）
  homeMediaFilters.clear();
  try {
    const saved = JSON.parse(localStorage.getItem('trendy_dive_default_filters') || '[]');
    saved.forEach(t => homeMediaFilters.add(t));
  } catch(e) {}
  // 検索バーをリセット
  const si = document.getElementById('dive-search-input');
  if (si) si.value = '';
  const sc = document.getElementById('dive-search-clear');
  if (sc) sc.style.display = 'none';
  // カテゴリーボタン表示を更新
  _updateDiveCatBtn();
  const reel = document.getElementById('recommend-reel');
  if (reel) reel.innerHTML = '';
  requestAnimationFrame(() => {
    _fitReelHeight();
    _loadRecommendFeed(true);
  });
}

// リールの高さをページヘッダー＋統合フィルターバーの実測値に合わせる
function _fitReelHeight() {
  const reel      = document.getElementById('recommend-reel');
  if (!reel) return;
  const header    = document.querySelector('#page-recommend .page-header');
  const filterBar = document.getElementById('dive-filter-bar');
  let offset = 0;
  if (header)    offset += header.offsetHeight;
  if (filterBar) offset += filterBar.offsetHeight;
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
  // 選択状態をデフォルトとして保存
  localStorage.setItem('trendy_dive_default_filters', JSON.stringify([...homeMediaFilters]));
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
  localStorage.setItem('trendy_dive_default_filters', '[]');
  document.querySelectorAll('.home-mf-pill').forEach(p => p.classList.remove('active'));
  _recommendRawTweets = [];
  RECOMMEND_TWEETS = [];
  recommendLoaded = 0;
  const reel = document.getElementById('recommend-reel');
  if (reel) reel.innerHTML = '';
  _loadRecommendFeed(true);
}

// ── ダイブ カテゴリーボタン表示更新 ────────────────────────
function _updateDiveCatBtn() {
  const btnLabel = document.getElementById('dive-cat-btn-label');
  const btnIcon  = document.getElementById('dive-cat-btn-icon');
  const btn      = document.getElementById('dive-cat-btn');
  if (!btnLabel) return;
  if (!recommendCatFilter || recommendCatFilter === 'all') {
    btnLabel.textContent = 'カテゴリー';
    if (btnIcon) btnIcon.className = 'ti ti-category';
    if (btn) btn.classList.remove('active');
  } else {
    const cat = CATS_DATA.find(c => c.id === recommendCatFilter);
    btnLabel.textContent = cat ? cat.name : recommendCatFilter;
    if (btnIcon && cat) btnIcon.className = 'ti ' + cat.icon;
    if (btn) btn.classList.add('active');
  }
  // メディアタイプピルの active 状態を同期
  document.querySelectorAll('.home-mf-pill').forEach(p => {
    p.classList.toggle('active', homeMediaFilters.has(p.dataset.type));
  });
}

// カテゴリーピッカーを開く
function openDiveCatPicker() {
  const dd   = document.getElementById('dive-cat-dropdown');
  const list = document.getElementById('dive-cat-dropdown-list');
  const btn  = document.getElementById('dive-cat-btn');
  if (!dd || !list || !btn) return;
  if (dd.style.display !== 'none') { closeDiveCatPicker(); return; }

  const allCats = [{ id: 'all', name: 'すべて', icon: 'ti-stars' }, ...CATS_DATA.filter(c => c.id !== 'all')];
  list.innerHTML = allCats.map(c => `
    <button class="dcp-item${recommendCatFilter === c.id || (!recommendCatFilter && c.id === 'all') ? ' active' : ''}"
            onclick="setDiveCat('${c.id}')">
      <i class="ti ${c.icon} dcp-icon"></i>
      <span>${c.name}</span>
      ${(recommendCatFilter === c.id || (!recommendCatFilter && c.id === 'all')) ? '<i class="ti ti-check dcp-check"></i>' : ''}
    </button>
  `).join('');

  // ボタンの位置に合わせて fixed 配置
  dd.style.display = 'block';
  const rect = btn.getBoundingClientRect();
  const ddW  = dd.offsetWidth  || 200;
  const ddH  = dd.offsetHeight || 300;
  let left = rect.left;
  let top  = rect.bottom + 4;
  // 画面右端はみ出し補正
  if (left + ddW > window.innerWidth - 8) left = window.innerWidth - ddW - 8;
  // 画面下端はみ出し補正（上に出す）
  if (top + ddH > window.innerHeight - 8) top = rect.top - ddH - 4;
  dd.style.left = left + 'px';
  dd.style.top  = top  + 'px';

  // 外側クリックで閉じる
  setTimeout(() => document.addEventListener('click', _diveCatOutsideClick, { once: true }), 0);
}

function closeDiveCatPicker() {
  const dd = document.getElementById('dive-cat-dropdown');
  if (dd) dd.style.display = 'none';
  document.removeEventListener('click', _diveCatOutsideClick);
}

function _diveCatOutsideClick(e) {
  const dd  = document.getElementById('dive-cat-dropdown');
  const btn = document.getElementById('dive-cat-btn');
  if (dd && !dd.contains(e.target) && btn && !btn.contains(e.target)) {
    closeDiveCatPicker();
  }
}

// カテゴリーを選択してリロード
function setDiveCat(catId) {
  recommendCatFilter = catId === 'all' ? null : catId;
  closeDiveCatPicker();
  _updateDiveCatBtn();
  _recommendRawTweets = [];
  RECOMMEND_TWEETS = [];
  recommendLoaded = 0;
  const reel = document.getElementById('recommend-reel');
  if (reel) reel.innerHTML = '';
  _loadRecommendFeed(true);
}

// ── ダイブ: 1スクロール（1カード表示）ごとに +1コイン ──────
let _reelCoinObserver   = null;
let _reelCoinBuffer     = 0;     // DB未送信のコイン
let _reelCoinFlushTimer = null;

/** バッファに溜めたコインをまとめてDBへ送信（スクロール連打でAPIを叩きすぎない） */
function _flushReelCoins() {
  clearTimeout(_reelCoinFlushTimer);
  _reelCoinFlushTimer = null;
  const amount = _reelCoinBuffer;
  if (!amount) return;
  _reelCoinBuffer = 0;
  const aid = localStorage.getItem('trendy_account_id');
  if (aid && typeof dbAddPoints === 'function') {
    dbAddPoints(aid, amount, 'dive').catch(() => {});
  }
}

/** ピークコイン廃止：ダイブ閲覧でのコイン付与は行わない（no-op） */
function _awardReelScrollCoin(card) {
  if (card && card.dataset) card.dataset.coined = '1';
}

function _initReelCoinObserver() {
  if (_reelCoinObserver) return;
  _reelCoinObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) _awardReelScrollCoin(en.target);
    });
  }, { threshold: 0.6 });
}

// ページ離脱時も未送信分を取りこぼさない（ベストエフォート）
window.addEventListener('beforeunload', () => { try { _flushReelCoins(); } catch(e) {} });

// ── ダイブのコイン残高表示 & +N アニメーション ──
function _updateDiveCoinDisplay(plusAmount) {
  const countEl = document.getElementById('dive-coin-count');
  if (countEl) countEl.textContent = _myPoints.toLocaleString();
  if (plusAmount > 0) {
    const plusEl = document.getElementById('dive-coin-plus');
    if (plusEl) {
      plusEl.textContent = `+${plusAmount}`;
      plusEl.classList.remove('dive-coin-plus-show');
      void plusEl.offsetWidth; // リフロー
      plusEl.classList.add('dive-coin-plus-show');
    }
  }
}

// ── ダイブ キーワード検索 ───────────────────────────────────
// ── ダイブの「舵」: カテゴリー興味の重み付け（もっと見たい/興味なし） ──
let _diveInterest = {};
try { _diveInterest = JSON.parse(localStorage.getItem('trendy_dive_interest') || '{}') || {}; } catch(e) { _diveInterest = {}; }
function _diveWeight(catId) {
  const w = _diveInterest[catId || 'other'];
  return (typeof w === 'number') ? w : 1;
}
function _saveDiveInterest() {
  try { localStorage.setItem('trendy_dive_interest', JSON.stringify(_diveInterest)); } catch(e) {}
}
// 興味の重みで安定ソート（重い＝上位。同重みは元の順序を維持）
function _sortByInterest(tweets) {
  return tweets
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (_diveWeight(b.t.catId) - _diveWeight(a.t.catId)) || (a.i - b.i))
    .map(x => x.t);
}

/** ダイブの舵: dir=+1 もっと見たい / dir=-1 興味なし。次のカードに即反映 */
function _diveSteer(btn, idx, dir) {
  const t = _tc[idx];
  if (!t) return;
  const cat = t.catId || 'other';
  const catName = (typeof CATS_DATA !== 'undefined' && CATS_DATA.find(c => c.id === cat)?.name) || 'この内容';
  const cur = _diveWeight(cat);
  if (dir > 0) {
    _diveInterest[cat] = Math.min(4, (cur < 1 ? 1 : cur) * 2);
  } else {
    _diveInterest[cat] = Math.max(0.05, cur * 0.25);
  }
  _saveDiveInterest();

  // 未表示のキュー（recommendLoaded 以降）を重みで並べ替え → 次バッチに反映
  if (recommendLoaded < RECOMMEND_TWEETS.length) {
    const tail = _sortByInterest(RECOMMEND_TWEETS.slice(recommendLoaded));
    RECOMMEND_TWEETS.splice(recommendLoaded, tail.length, ...tail);
  }

  const card = btn.closest('.reel-card');
  if (dir < 0) {
    showToast(`「${catName}」を減らします`, '');
    // 次のカードを先に確保
    const next = card && card.nextElementSibling;
    // 以降に既に描画済みの同カテゴリーカードを除去
    if (card) {
      let sib = card.nextElementSibling;
      while (sib) {
        const nx = sib.nextElementSibling;
        const sidx = parseInt(sib.dataset.idx, 10);
        if (sib.classList.contains('reel-card') && _tc[sidx] && (_tc[sidx].catId || 'other') === cat) sib.remove();
        sib = nx;
      }
      card.remove(); // 今のカードも消して次へ送る
    }
    // 次カードへスクロール（無ければ追加読み込み）
    if (next && next.isConnected) {
      next.scrollIntoView({ behavior: 'smooth' });
    } else if (typeof _renderRecommendSlice === 'function') {
      _renderRecommendSlice();
    }
  } else {
    showToast(`「${catName}」を増やします`, 'success');
    btn.classList.add('reel-steer-on');
  }
}

function _applyDiveSearchFilter(tweets) {
  let result = tweets;
  // 検索中でなければ表示済みを除外
  if (!recommendSearchQuery.trim()) {
    result = result.filter(t => !t.db_id || !_seenReelIds.has(String(t.db_id)));
  }
  // ユーザーフィルター（フォロー中 / フォロワー）
  if (recommendUserFilter === 'following') {
    result = result.filter(t => t.user && followingSet.has(t.user.h));
  } else if (recommendUserFilter === 'followers' && _followerHandleSet) {
    result = result.filter(t => t.user && _followerHandleSet.has(t.user.h));
  }
  // キーワード検索フィルター
  const q = recommendSearchQuery.trim().toLowerCase();
  if (q) {
    result = result.filter(t =>
      (t.text  || '').toLowerCase().includes(q) ||
      (t.user?.n || '').toLowerCase().includes(q) ||
      (t.user?.h || '').toLowerCase().includes(q) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(q))
    );
  }
  // 検索中でなければ興味の重みで並べ替え（舵の結果を反映）
  if (!q) result = _sortByInterest(result);
  return result;
}

function resetReelSeen() {
  _seenReelIds.clear();
  _initRecommendPage();
}

let _diveSearchTimer = null;

function onDiveSearch(value) {
  recommendSearchQuery = value || '';
  const clrBtn = document.getElementById('dive-search-clear');
  if (clrBtn) clrBtn.style.display = recommendSearchQuery ? '' : 'none';
  clearTimeout(_diveSearchTimer);

  const reel = document.getElementById('recommend-reel');
  if (reel) reel.innerHTML = '';
  recommendLoaded = 0;

  if (recommendSearchQuery.trim()) {
    // 検索中は常にDB全文検索（ローカルフィルター結果に関わらず）
    if (reel) reel.innerHTML = `<div class="reel-empty"><i class="ti ti-loader-2 spin"></i><p>「${recommendSearchQuery}」を検索中...</p></div>`;
    _diveSearchTimer = setTimeout(() => _diveFullTextSearch(recommendSearchQuery.trim()), 400);
  } else if (_recommendRawTweets.length > 0) {
    RECOMMEND_TWEETS = _applyDiveSearchFilter(_recommendRawTweets);
    _renderRecommendSlice();
    _initReelVideoObserver();
    _initReelInfiniteScroll();
    _fitReelHeight();
  }
}

async function _diveFullTextSearch(query) {
  const reel = document.getElementById('recommend-reel');
  if (!reel || !query) return;

  const data = await dbSearchPosts(query, 150);

  // 検索中にクエリが変わっていたら捨てる
  if (recommendSearchQuery.trim() !== query) return;

  if (!data.length) {
    reel.innerHTML = `<div class="reel-empty"><i class="ti ti-search" style="font-size:36px;color:var(--text3)"></i><p>「${query}」に一致する投稿がありません</p></div>`;
    _fitReelHeight();
    return;
  }

  // アバター一括取得
  const ids = [...new Set(data.map(p => p.user_handle?.slice(1)).filter(Boolean))];
  const avatarMap = {};
  if (ids.length) {
    const { data: profs } = await db.from('profiles').select('account_id, avatar_data, name_tag').in('account_id', ids);
    (profs || []).forEach(pr => {
      avatarMap['@' + pr.account_id] = {
        av     : pr.avatar_data ? `<img src="${pr.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : null,
        nameTag: pr.name_tag || null,
      };
    });
  }

  const converted = data.map(p => {
    const prof = avatarMap[p.user_handle] || {};
    const avImg = p.is_sub ? null : prof.av;
    return {
      db_id    : p.id,
      catId    : p.cat_id    || null,
      text     : p.content,
      likes    : p.likes_count  || 0,
      rt       : p.rt_count     || 0,
      views    : p.views_count  || 0,
      time     : _relativeTime(p.created_at),
      ai       : p.ai_type      || 'none',
      mediaData   : p.media_data       || null,
      mediaType   : p.media_type       || null,
      linkUrl     : p.link_url         || null,
      imageLinkUrl: p.image_link_url   || null,
      tags     : Array.isArray(p.tags) ? p.tags : [],
      extSource: p.ext_source || null,
      extUrl   : p.ext_url    || null,
      likeEmoji: p.like_emoji || '❤️',
      rank: 0, isDummy: false,
      user: {
        h      : p.user_handle,
        n      : p.user_name,
        av     : avImg || (p.user_name || '?')[0].toUpperCase(),
        bg     : avImg ? 'transparent' : '#3b82f6',
        tc     : avImg ? 'transparent' : '#ffffff',
        sub    : p.is_sub,
        nameTag: p.is_sub ? null : (p.name_tag || prof.nameTag || null),
      },
    };
  });

  RECOMMEND_TWEETS = converted;
  recommendLoaded  = 0;
  reel.innerHTML   = '';
  _renderRecommendSlice();
  _initReelVideoObserver();
  _initReelInfiniteScroll();
  _fitReelHeight();
}

function clearDiveSearch() {
  recommendSearchQuery = '';
  const si = document.getElementById('dive-search-input');
  if (si) si.value = '';
  const clrBtn = document.getElementById('dive-search-clear');
  if (clrBtn) clrBtn.style.display = 'none';
  onDiveSearch('');
}

/** ダイブ ユーザーフィルター切替（全員 / フォロー中 / フォロワー） */
async function setDiveUserFilter(filter, btn) {
  recommendUserFilter = filter;
  // ピルのアクティブ状態を更新
  document.querySelectorAll('.dive-user-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // フォロワー選択時は初回だけSupabaseから取得してキャッシュ
  if (filter === 'followers' && !_followerHandleSet) {
    const aid = _activeAid();
    if (aid) {
      const ids = await dbFetchFollowers(aid);
      _followerHandleSet = new Set(ids.map(id => '@' + id));
    } else {
      _followerHandleSet = new Set();
    }
  }
  // ユーザーフィルター変更は DB 再フェッチが必要（フォロー中/フォロワーは DB 段階でフィルター）
  _recommendRawTweets = [];
  recommendLoaded  = 0;
  const reel = document.getElementById('recommend-reel');
  if (reel) reel.innerHTML = '';
  await _loadRecommendFeed(true);
  _fitReelHeight();
}

// 全フィルター（カテゴリー＋メディアタイプ＋検索＋ユーザー）を一括リセット
function resetAllDiveFilters() {
  recommendCatFilter  = null;
  recommendSearchQuery = '';
  recommendUserFilter = 'all';
  homeMediaFilters.clear();
  localStorage.setItem('trendy_dive_default_filters', '[]');
  const si = document.getElementById('dive-search-input');
  if (si) si.value = '';
  const clrBtn = document.getElementById('dive-search-clear');
  if (clrBtn) clrBtn.style.display = 'none';
  // ユーザーフィルターピルをリセット
  document.querySelectorAll('.dive-user-pill').forEach(b => b.classList.remove('active'));
  const allBtn = document.getElementById('dive-user-all');
  if (allBtn) allBtn.classList.add('active');
  _updateDiveCatBtn(); // ボタン表示をリセット
  _recommendRawTweets = [];
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
    // ext_pop_score（pixivブックマーク数等）と likes_count どちらかでソート
    let query = db.from('posts').select('*')
      .order('ext_pop_score', { ascending: false, nullsFirst: false })
      .order('likes_count', { ascending: false })
      .limit(500);
    // カテゴリーフィルター
    if (recommendCatFilter && recommendCatFilter !== 'all') {
      query = query.eq('cat_id', recommendCatFilter);
    }
    // コンテンツタイプ複数選択フィルター（空 = すべて表示）
    if (homeMediaFilters.size > 0) {
      const orParts = [];
      // 文字のみ: media_type が image/video でないもの（NULL や 空文字 含む）。外部投稿(pixiv等)は除外
      if (homeMediaFilters.has('text'))  orParts.push('and(media_type.not.in.(image,video),ext_source.is.null)');
      // 画像: media_type=image（pixiv画像も含む）
      if (homeMediaFilters.has('image')) orParts.push('media_type.eq.image');
      // 動画: media_type=video
      if (homeMediaFilters.has('video')) orParts.push('media_type.eq.video');
      if (orParts.length > 0) query = query.or(orParts.join(','));
    }
    // ユーザーフィルター（フォロー中 / フォロワー）を DB 段階で適用
    if (recommendUserFilter === 'following') {
      const handles = (myFollowingHandles || []).filter(Boolean);
      if (handles.length === 0) {
        // フォロー中ゼロ → 結果ゼロ確定
        recommendLoading = false;
        _recommendRawTweets = [];
        RECOMMEND_TWEETS = [];
        reel.innerHTML = `<div class="reel-empty"><i class="ti ti-mood-empty" style="font-size:36px;color:var(--text3)"></i><p>フォロー中のユーザーの投稿はありません</p></div>`;
        return;
      }
      query = query.in('user_handle', handles);
    } else if (recommendUserFilter === 'followers') {
      // フォロワーキャッシュを準備
      if (!_followerHandleSet) {
        const aid = _activeAid();
        if (aid) {
          const ids = await dbFetchFollowers(aid);
          _followerHandleSet = new Set(ids.map(id => '@' + id));
        } else {
          _followerHandleSet = new Set();
        }
      }
      const handles = [..._followerHandleSet];
      if (handles.length === 0) {
        recommendLoading = false;
        _recommendRawTweets = [];
        RECOMMEND_TWEETS = [];
        reel.innerHTML = `<div class="reel-empty"><i class="ti ti-mood-empty" style="font-size:36px;color:var(--text3)"></i><p>フォロワーの投稿はありません</p></div>`;
        return;
      }
      query = query.in('user_handle', handles);
    }

    const { data, error } = await query;
    if (error || !data) { recommendLoading = false; return; }

    // アバターを一括取得
    const accountIds = [...new Set(data.filter(p => p.user_handle?.startsWith('@')).map(p => p.user_handle.slice(1)))];
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
        mediaData   : p.media_data       || null,
        mediaType   : p.media_type       || null,
        linkUrl     : p.link_url         || null,
        imageLinkUrl: p.image_link_url   || null,
        tags     : Array.isArray(p.tags) ? p.tags : [],
        extSource: p.ext_source || null,
        extUrl   : p.ext_url    || null,
        rank     : 0, isDummy: false,
        user: {
          h      : p.user_handle,
          n      : p.user_name,
          av     : avImg || (p.user_name || '?')[0].toUpperCase(),
          bg     : avImg ? 'transparent' : '#3b82f6',
          tc     : avImg ? 'transparent' : '#ffffff',
          sub    : p.is_sub,
          nameTag: p.is_sub ? null : (p.name_tag || prof.nameTag || null),
        },
      };
    });

    // 上位150件を準ランダムシャッフル（Fisher-Yates）
    const pool = converted.slice(0, Math.min(200, converted.length));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    _recommendRawTweets = pool;
    // キーワード検索フィルターを適用
    RECOMMEND_TWEETS = _applyDiveSearchFilter(pool);
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
    const isYt    = t.extSource === 'youtube' || t.extSource === 'shorts';
    const isImg   = !isYt && t.mediaType === 'image';
    const isVideo = !isYt && t.mediaType === 'video';
    if (isYt || isImg || isVideo) {
      if (textBatch.length) { groups.push({ type: 'text', items: textBatch }); textBatch = []; }
      groups.push({ type: isYt ? 'youtube' : t.mediaType, item: t });
    } else {
      textBatch.push(t);
      if (textBatch.length >= 5) { groups.push({ type: 'text', items: textBatch }); textBatch = []; }
    }
  }
  if (textBatch.length) groups.push({ type: 'text', items: textBatch });
  return groups;
}

function _reelYtPlay(thumbEl) {
  const card = thumbEl.closest('.reel-card--youtube');
  if (!card) return;
  const iframe = card.querySelector('.reel-yt-iframe');
  if (!iframe) return;
  iframe.src = card.dataset.embed;
  iframe.style.display = 'block';
  iframe.style.height = '60%'; // サムネイル部と同じ高さ
  thumbEl.style.visibility = 'hidden';
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
      <div class="reel-steer">
        <button class="reel-steer-btn" onclick="event.stopPropagation();_diveSteer(this,${idx},1)" title="もっと見たい">
          <i class="ti ti-thumb-up"></i><span>もっと</span>
        </button>
        <button class="reel-steer-btn" onclick="event.stopPropagation();_diveSteer(this,${idx},-1)" title="興味なし">
          <i class="ti ti-thumb-down"></i><span>興味なし</span>
        </button>
      </div>
      <div class="reel-overlay-author" onclick="event.stopPropagation();openUserPage('${u.h||''}')">
        <div class="reel-av">${_reelAvWrap(u)}</div>
        <div class="reel-author-info">
          <div class="reel-name">${u.n||''}</div>
          <div class="reel-handle">${u.nameTag ? '＠'+u.nameTag : (u.h||'')}</div>
        </div>
      </div>
      ${t.text ? `<div class="reel-caption">${_linkify(t.text)}</div>` : ''}
      ${t.linkUrl ? `<a class="reel-url-btn" href="${encodeURI(t.linkUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"><i class="ti ti-link"></i>${(() => { try { const u = new URL(t.linkUrl); return u.hostname; } catch(e) { return t.linkUrl.slice(0,30); } })()}</a>` : ''}
      <div class="reel-actions">
        <button class="reel-action-btn" onclick="event.stopPropagation();openTweetDetail(${idx})">
          <i class="ti ti-message-circle"></i>
          <span id="reel-rc-${idx}">${(tweetReplies[idx]||[]).length||0}</span>
        </button>
        <button class="reel-action-btn${liked?' reel-liked':''}" id="reel-like-${idx}" onclick="event.stopPropagation();_reelToggleLike(${idx})">
          ${t.likeEmoji ? `<span class="like-emoji-display">${t.likeEmoji}</span>` : `<i class="ti ti-heart${liked?'-filled':''}" ${liked?'style="color:#ef4444"':''}></i>`} <span id="reel-lc-${idx}">${fmt(t.likes)}</span>
        </button>
        <span class="reel-action-btn reel-stat">
          <i class="ti ti-eye"></i> ${fmt(t.views)}
        </span>
        ${(() => {
          const on = t?.db_id ? favDbIds.has(String(t.db_id)) : false;
          return `<button class="reel-action-btn${on?' reel-faved':''}" id="reel-fav-${idx}" onclick="event.stopPropagation();toggleFavByIdx(${idx},this)" title="お気に入り">
            <i class="ti ti-star${on?'-filled':''}" ${on?'style="color:#fbbf24"':''}></i>
          </button>`;
        })()}
      </div>
    </div>`;
}

function _reelCardHTML(group) {
  if (group.type === 'image') {
    const t = group.item;
    const idx = _reg(t);
    const imgs = _parseMediaImages(t.mediaData);
    const firstImg = imgs[0] || t.mediaData;
    const isMulti = imgs.length > 1;
    const reelId = 'reel_mi_' + Math.random().toString(36).slice(2,9);
    const dataAttr = isMulti ? encodeURIComponent(JSON.stringify(imgs)) : '';
    // 複数画像時は画像クリックでサイクル、それ以外は従来通り
    const imgClick = isMulti
      ? `onclick="event.stopPropagation();_cycleReelImage('${reelId}',1)"`
      : (t.imageLinkUrl
          ? `onclick="event.stopPropagation();_confirmExternalLink('${encodeURI(t.imageLinkUrl)}')"`
          : `onclick="event.stopPropagation();openImageViewer(this.src)"`);
    return `<div class="reel-card reel-card--image" data-idx="${idx}" data-db-id="${t.db_id||''}">
      <img class="reel-bg-blur" id="${reelId}_bg" src="${firstImg}" aria-hidden="true">
      <img class="reel-main-img" id="${reelId}_main" src="${firstImg}" style="cursor:pointer" ${imgClick}
        ${isMulti ? `data-images="${dataAttr}" data-index="0"` : ''}>
      ${isMulti ? `
        <div class="reel-multi-count">
          <i class="ti ti-photo"></i>
          <span id="${reelId}_cur">1</span>/<span>${imgs.length}</span>
        </div>
        <div class="reel-multi-dots" id="${reelId}_dots">
          ${imgs.map((_,i)=>`<span class="reel-multi-dot${i===0?' active':''}" onclick="event.stopPropagation();_setReelImage('${reelId}',${i})"></span>`).join('')}
        </div>` : ''}
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
  if (group.type === 'youtube') {
    const t = group.item;
    const idx = _reg(t);
    const isShorts = t.extSource === 'shorts';
    const videoId  = isShorts
      ? (t.extUrl || '').split('/shorts/')[1]?.split('?')[0] || ''
      : new URL(t.extUrl || 'https://x.com').searchParams.get('v') || '';
    const embedSrc = isShorts && t.linkUrl
      ? t.linkUrl
      : `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&rel=0&playsinline=1`;
    const liked = likedTweets.has(idx);
    return `<div class="reel-card reel-card--youtube${isShorts ? ' reel-card--shorts' : ''}" data-idx="${idx}" data-db-id="${t.db_id||''}" data-embed="${embedSrc}">
      <!-- サムネイル部 -->
      <div class="reel-yt-thumb" onclick="_reelYtPlay(this)">
        <img src="${t.mediaData}" class="reel-yt-thumb-img" alt="${_escHtml(t.text)}">
        <div class="reel-yt-play-btn"><i class="ti ti-player-play-filled"></i></div>
        <span class="reel-yt-src-badge ctm-ext-badge ctm-ext-${t.extSource}">${_extSourceLabel(t.extSource)}</span>
      </div>
      <!-- プレイヤー（タップ後に差し替え） -->
      <iframe class="reel-yt-iframe" style="display:none;position:absolute;top:0;left:0;width:100%;height:60%;border:none" allowfullscreen allow="autoplay;encrypted-media;picture-in-picture"></iframe>
      <!-- 情報バー -->
      <div class="reel-yt-info">
        <div class="reel-yt-channel" onclick="event.stopPropagation();window.open('${t.extUrl}','_blank','noopener,noreferrer')">${t.user?.n || ''}</div>
        <div class="reel-yt-title" onclick="event.stopPropagation();window.open('${t.extUrl}','_blank','noopener,noreferrer')">${_escHtml(t.text || '')}</div>
        <div class="reel-yt-actions">
          <button class="reel-action-btn" onclick="event.stopPropagation();openTweetDetail(${idx})">
            <i class="ti ti-message-circle"></i><span>${(tweetReplies[idx]||[]).length||0}</span>
          </button>
          <button class="reel-action-btn${liked?' reel-liked':''}" id="reel-like-${idx}" onclick="event.stopPropagation();_reelToggleLike(${idx})">
            ${t.likeEmoji ? `<span class="like-emoji-display">${t.likeEmoji}</span>` : `<i class="ti ti-heart${liked?'-filled':''}" ${liked?'style="color:#ef4444"':''}></i>`}<span id="reel-lc-${idx}">${fmt(t.likes)}</span>
          </button>
          <span class="reel-action-btn reel-stat"><i class="ti ti-eye"></i>${fmt(t.views)}</span>
          ${(() => {
            const on = t?.db_id ? favDbIds.has(String(t.db_id)) : false;
            return `<button class="reel-action-btn${on?' reel-faved':''}" id="reel-fav-${idx}" onclick="event.stopPropagation();toggleFavByIdx(${idx},this)" title="お気に入り">
              <i class="ti ti-star${on?'-filled':''}" ${on?'style="color:#fbbf24"':''}></i>
            </button>`;
          })()}
        </div>
      </div>
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
        <div class="reel-text-content">${_linkify(t.text||'')}</div>
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
  const nowLiked = !likedTweets.has(idx);
  const btn  = document.getElementById(`reel-like-${idx}`);
  const lc   = document.getElementById(`reel-lc-${idx}`);
  const icon = btn?.querySelector('i');
  if (nowLiked) {
    likedTweets.add(idx);
    if (t.db_id) likedDbIds.add(String(t.db_id));
    t.likes = (t.likes||0) + 1;
    if (btn)  btn.classList.add('reel-liked');
    if (icon) { icon.className = 'ti ti-heart-filled'; icon.style.color = '#ef4444'; }
  } else {
    likedTweets.delete(idx);
    if (t.db_id) likedDbIds.delete(String(t.db_id));
    t.likes = Math.max(0, (t.likes||0) - 1);
    if (btn)  btn.classList.remove('reel-liked');
    if (icon) { icon.className = 'ti ti-heart'; icon.style.color = ''; }
  }
  if (lc) lc.textContent = fmt(t.likes);
  // ホームフィードのいいねボタンも同期
  const homeBtn  = document.getElementById(`like-btn-${idx}`);
  const homeIcon = document.getElementById(`like-icon-${idx}`);
  const homeLc   = document.getElementById(`like-count-${idx}`);
  if (homeBtn)  { homeBtn.classList.toggle('liked', nowLiked); }
  if (homeIcon) { homeIcon.className = nowLiked ? 'ti ti-heart-filled' : 'ti ti-heart'; homeIcon.style.color = nowLiked ? '#e11d48' : ''; }
  if (homeLc)   homeLc.textContent = fmt(t.likes);
  // Supabase に保存
  if (t.db_id && typeof dbToggleLike === 'function') {
    const aid = localStorage.getItem('trendy_account_id');
    const _likeAuthorId = t.user?.h ? (t.user.h.startsWith('@') ? t.user.h.slice(1) : t.user.h) : null;
    dbToggleLike(t.db_id, aid, nowLiked, t.user && t.user.h, _isFanTrigger(_likeAuthorId));
    // ピークコイン廃止：いいねでのコイン付与は行わない
  }
}

function _renderRecommendSlice() {
  const reel = document.getElementById('recommend-reel');
  if (!reel) return;
  if (RECOMMEND_TWEETS.length === 0) {
    // 表示済みがあれば「一周」メッセージ、なければ「投稿なし」
    if (_seenReelIds.size > 0 && !recommendSearchQuery.trim()) {
      reel.innerHTML = `<div class="reel-lap-msg">
        <i class="ti ti-rotate-clockwise-2" style="font-size:36px;color:var(--accent);display:block;margin-bottom:10px"></i>
        <p style="font-weight:700;margin-bottom:6px">一周しました！</p>
        <p style="font-size:12px;color:var(--text3);margin-bottom:16px">${_seenReelIds.size}件の投稿を表示しました</p>
        <button onclick="resetReelSeen()" class="reel-lap-btn">
          <i class="ti ti-refresh"></i> もう一度見る
        </button>
      </div>`;
    } else {
      reel.innerHTML = `<div class="reel-empty"><i class="ti ti-sparkles"></i><p>ダイブできる投稿がありません</p></div>`;
    }
    return;
  }
  // 次の20件をカードに変換して追記
  const slice  = RECOMMEND_TWEETS.slice(recommendLoaded, recommendLoaded + 20);
  if (!slice.length) {
    // スクロール末尾で全件表示済み → 一周メッセージを追加
    if (!recommendSearchQuery.trim() && !reel.querySelector('.reel-lap-msg')) {
      reel.insertAdjacentHTML('beforeend', `<div class="reel-lap-msg">
        <i class="ti ti-rotate-clockwise-2" style="font-size:36px;color:var(--accent);display:block;margin-bottom:10px"></i>
        <p style="font-weight:700;margin-bottom:6px">一周しました！</p>
        <p style="font-size:12px;color:var(--text3);margin-bottom:16px">${_seenReelIds.size}件の投稿を表示しました</p>
        <button onclick="resetReelSeen()" class="reel-lap-btn">
          <i class="ti ti-refresh"></i> もう一度見る
        </button>
      </div>`);
    }
    return;
  }
  const groups = _groupReelCards(slice);
  const html   = groups.map(g => _reelCardHTML(g)).join('');
  reel.insertAdjacentHTML('beforeend', html);
  // 表示済みとして登録（新規分のみカウント）
  let newSeenCount = 0;
  slice.forEach(t => {
    if (t.db_id && !_seenReelIds.has(String(t.db_id))) {
      _seenReelIds.add(String(t.db_id));
      newSeenCount++;
      // トラックポイント +1/閲覧（外部投稿は対象外）
      if (!t.extSource && t.user?.h) {
        _addTrackPoint(_handleToAccountId(t.user.h), TRACK_POINTS.view);
      }
    }
  });
  recommendLoaded += slice.length;

  // コイン付与: カードが実際に表示（スクロール）されるたびに+1（_awardReelScrollCoin）
  _initReelCoinObserver();
  reel.querySelectorAll('.reel-card:not([data-coin-obs])').forEach(c => {
    c.dataset.coinObs = '1';
    _reelCoinObserver.observe(c);
  });
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
    : { n: isSub ? subAccountName : (myNickname || 'あなた'), h: isSub ? subAccountHandle : myHandle, av: isSub ? (subAccountName||'S')[0].toUpperCase() : _myAvContent(), bg:'#dbeafe', tc:'#1e40af', sub: isSub, nameTag: isSub ? null : myNameTag || null };
  const t = {
    rank: 0,
    user: postUser,
    time: '今', text: v, likes: 0, rt: 0, views: 0, ai: pendingAi, prev:'初登場', score: 0,
    catId    : pendingCatId,
    tags     : [...pendingTags],
    // 添付メディア（複数画像時は JSON 配列文字列）
    mediaData   : pendingMedia
      ? ((pendingMedia.type === 'image' && Array.isArray(pendingMedia.dataList) && pendingMedia.dataList.length > 1)
          ? JSON.stringify(pendingMedia.dataList)
          : pendingMedia.data)
      : null,
    mediaType   : pendingMedia ? pendingMedia.type : null,
    // URL 添付
    linkUrl     : pendingUrl      || null,
    imageLinkUrl: pendingImageUrl || null,
  };
  // サブカテゴリー統計を記録（ランキング更新）
  if (pendingCatId && pendingTags.length) {
    recordCatSubStats(pendingCatId, pendingTags);
  }
  t._localId = `local_${Date.now()}`; // DOM追跡用の一時ID
  myPosts.unshift(t);       // 自分の投稿配列に追加（最新が先頭）
  HOME_TWEETS.unshift(t);   // ホームフィードにも追加
  document.getElementById('home-feed').insertAdjacentHTML('afterbegin', homeTweetHTML(t));
  _resizeHomeMasonry();
  // マイページ・ランキングに即反映
  renderMyPosts();
  renderMyRank();
  // ── リセット前に必要な値をキャプチャ ──────────────────────────────
  // ※ pendingMedia / pendingCatId / pendingTags はリセットブロックで
  //   null / [] になるため、DB保存に使う値を先に変数へ退避する
  // 複数画像の場合は JSON 配列で保存（後方互換: 1枚なら data そのまま）
  let _mediaData = null;
  let _mediaType = null;
  if (pendingMedia) {
    _mediaType = pendingMedia.type;
    if (pendingMedia.type === 'image' && Array.isArray(pendingMedia.dataList) && pendingMedia.dataList.length > 1) {
      _mediaData = JSON.stringify(pendingMedia.dataList);
    } else if (pendingMedia.type === 'image' && Array.isArray(pendingMedia.dataList)) {
      _mediaData = pendingMedia.dataList[0] || pendingMedia.data || null;
    } else {
      _mediaData = pendingMedia.data;
    }
  }
  const _catId         = pendingCatId || '';
  const _tags          = [...pendingTags];
  const _linkUrl       = pendingUrl      || '';
  const _imageLinkUrl  = pendingImageUrl || '';

  // ── つぶやき → ステージ出演（トグルON・認証・メイン投稿のみ） ──
  if (!isSub && typeof _composeStageOn !== 'undefined' && _composeStageOn && typeof _createStageFromCompose === 'function') {
    _createStageFromCompose({ text: v, catId: _catId || null, url: _linkUrl || null });
    _resetComposeStage();
  }

  // ランキング入り通知（カテゴリー設定済み・自分アカウントのみ）
  if (_catId && !testActiveUser && !isSub) {
    setTimeout(() => checkRankingAndNotify(_catId), 1800);
  }
  // リセット
  document.getElementById('compose-input').value = '';
  pendingMedia    = null;
  pendingUrl      = null;
  pendingImageUrl = null;
  document.getElementById('compose-img-input').value = '';
  document.getElementById('compose-vid-input').value = '';
  document.getElementById('compose-media-preview').style.display = 'none';
  document.getElementById('compose-media-inner').innerHTML = '';
  document.getElementById('compose-url-row').style.display    = 'none';
  document.getElementById('compose-imgurl-row').style.display = 'none';
  const urlInp    = document.getElementById('compose-url-input');
  const imgUrlInp = document.getElementById('compose-imgurl-input');
  if (urlInp)    urlInp.value    = '';
  if (imgUrlInp) imgUrlInp.value = '';
  const urlBtn = document.getElementById('compose-url-toggle-btn');
  if (urlBtn) urlBtn.classList.remove('compose-url-btn-active');
  resetComposeCat(); // カテゴリー・タグもリセット
  updateCompose();
  // 投稿でピークコインガチャ（1日10回まで） — ガチャ廃止により停止（false で無効化）
  if (false && !testActiveUser && !isSub) {
    const _postAid = localStorage.getItem('trendy_account_id');
    if (_postAid && typeof dbAddPoints === 'function') {
      // 1日のガチャ回数を確認（アカウント毎、ローカル日付）
      const _today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const _key = `trendy_postgacha_${_postAid}`;
      let _rec = { date: _today, count: 0 };
      try {
        const _raw = localStorage.getItem(_key);
        if (_raw) _rec = JSON.parse(_raw);
        if (_rec.date !== _today) _rec = { date: _today, count: 0 };
      } catch(e) { _rec = { date: _today, count: 0 }; }

      if (_rec.count >= 10) {
        // 上限到達 → ガチャ無効
        showToast('本日のコインガチャ回数上限（10回/日）に達しました', 'info');
      } else {
        const _coinChoices = [1, 10, 50, 100, 200, 300, 500, 1000];
        const _wonBase = _coinChoices[Math.floor(Math.random() * _coinChoices.length)];
        const _coinBoost = getBadgeEffect('coin_boost');
        const _wonCoin = Math.round(_wonBase * (1 + _coinBoost / 100));
        const _remaining = 10 - (_rec.count + 1);
        _showPostCoinGacha(_coinChoices, _wonCoin, _remaining);
        dbAddPoints(_postAid, _wonCoin, 'post_gacha').then(() => {
          _loadMyPoints?.();
        }).catch(() => {});
        // 回数を記録
        _rec.count += 1;
        try { localStorage.setItem(_key, JSON.stringify(_rec)); } catch(e) {}
      }
    }
  }

  // Supabase に保存 → db_id が確定したら DOM と配列に反映
  // 投稿には常に絵文字を紐づける（未選択時はデフォルト❤️）
  const _likeEmoji = pendingLikeEmoji || '❤️';
  t.likeEmoji = _likeEmoji;
  // ホームフィードに表示済みのlikeEmojiも更新
  const _localDom = document.querySelector(`[data-local-id="${t._localId}"]`);
  if (_localDom) {
    const likeBtn = _localDom.querySelector('.like-btn i, .like-btn .like-emoji-display');
    if (likeBtn) {
      const span = document.createElement('span');
      span.className = 'like-emoji-display';
      span.textContent = _likeEmoji;
      likeBtn.replaceWith(span);
    }
  }
  // 投稿フォームの絵文字ボタンをデフォルトに戻す
  pendingLikeEmoji = '❤️';
  const _ceEl = document.getElementById('compose-like-emoji-current');
  if (_ceEl) _ceEl.textContent = '❤️';
  dbSavePost({
    handle       : isSub ? subAccountHandle : myHandle,
    name         : isSub ? subAccountName : (myNickname || 'あなた'),
    isSub,
    content      : v,
    aiType       : pendingAi,
    mediaData    : _mediaData,
    mediaType    : _mediaType,
    nameTag      : isSub ? '' : (myNameTag || ''),
    catId        : _catId,
    tags         : _tags,
    linkUrl      : _linkUrl,
    imageLinkUrl : _imageLinkUrl,
    likeEmoji    : _likeEmoji,
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
      // フォロワーへ通知（メイン投稿のみ・通知種別ONの人だけ）。投稿成功は妨げない
      if (!isSub && typeof dbNotifyFollowersOfPost === 'function') {
        const _aid = localStorage.getItem('trendy_account_id');
        if (_aid) dbNotifyFollowersOfPost({
          authorAccountId: _aid,
          authorName     : myNickname || 'あなた',
          mediaType      : _mediaType,
          contentPreview : v,
          postId         : savedPost.id,
        });
      }
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
const COMPOSE_MAX_IMAGES = 4;
const COMPOSE_IMG_MAX_DIM = 1280;   // 長辺最大px
const COMPOSE_IMG_QUALITY = 0.82;   // JPEG品質

// 画像 dataURL をリサイズ＆JPEG圧縮
function _resizeImageDataUrl(dataUrl, maxDim, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else        { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        resolve(dataUrl); // フォールバック
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// media_data 文字列を画像配列にパース（JSON配列なら複数、そうでなければ単一）
// 外部URLへ飛ぶ前の確認モーダル
function _confirmExternalLink(url) {
  if (!url) return;
  let host = url;
  try { host = new URL(url).hostname; } catch(e) {}
  document.getElementById('external-link-confirm')?.remove();
  const safeUrl = url.replace(/"/g, '&quot;');
  const html = `
    <div id="external-link-confirm" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px"
      onclick="if(event.target===this)document.getElementById('external-link-confirm').remove()">
      <div style="background:var(--bg);border-radius:14px;padding:20px 22px;max-width:420px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.4)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <i class="ti ti-external-link" style="font-size:22px;color:#f59e0b"></i>
          <div style="font-weight:900;font-size:15px;color:var(--text1)">外部サイトへの移動確認</div>
        </div>
        <div style="font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:14px">
          このURLにとぼうとしています。<br>
          リンク先の安全性は運営では確認していません。<br>
          移動してよろしいですか？
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;word-break:break-all">
          <div style="color:var(--text3);font-size:10px;margin-bottom:4px">移動先</div>
          <div style="color:var(--accent);font-weight:700">${host}</div>
          <div style="color:var(--text3);font-size:11px;margin-top:4px">${url}</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button onclick="document.getElementById('external-link-confirm').remove()"
            style="padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text1);font-size:13px;font-weight:700;cursor:pointer">
            キャンセル
          </button>
          <button onclick="document.getElementById('external-link-confirm').remove();window.open('${safeUrl}','_blank','noopener,noreferrer')"
            style="padding:8px 16px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:13px;font-weight:700;cursor:pointer">
            <i class="ti ti-external-link"></i> 開く
          </button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function _parseMediaImages(mediaData) {
  if (!mediaData) return [];
  if (typeof mediaData !== 'string') return [mediaData];
  const s = mediaData.trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length > 0) return arr.filter(Boolean);
    } catch(e) {}
  }
  return [mediaData];
}

// 複数画像つぶやき表示用 HTML（クリックで次へ + ドットインジケーター + カウントバッジ）
function _renderMultiImageHtml(mediaData, opts) {
  const imgs = _parseMediaImages(mediaData);
  if (imgs.length === 0) return '';
  if (imgs.length === 1) {
    // 単一画像（既存表示と同じ）
    const cls = opts?.imgClass || 'tweet-media-img';
    return `<img src="${imgs[0]}" alt="添付画像" class="${cls}" onclick="event.stopPropagation();openImageViewer(this.src)">`;
  }
  const id = 'mi_' + Math.random().toString(36).slice(2, 9);
  // 画像URL配列を JSON で属性に格納
  const dataAttr = encodeURIComponent(JSON.stringify(imgs));
  const cls = opts?.imgClass || 'tweet-media-img';
  return `
    <div class="multi-image-wrap" id="${id}" data-images="${dataAttr}" data-index="0">
      <img src="${imgs[0]}" alt="添付画像 1/${imgs.length}" class="${cls} multi-image-img"
           onclick="event.stopPropagation();_cycleMultiImage('${id}',1);">
      <div class="multi-image-count">
        <i class="ti ti-photo"></i>
        <span class="multi-image-cur">1</span>/<span>${imgs.length}</span>
      </div>
      <div class="multi-image-dots">
        ${imgs.map((_, i) => `<span class="multi-image-dot${i===0?' active':''}" data-idx="${i}" onclick="event.stopPropagation();_setMultiImage('${id}',${i})"></span>`).join('')}
      </div>
    </div>`;
}

// リール（ダイブ）用：複数画像の切り替え
function _cycleReelImage(reelId, dir) {
  const main = document.getElementById(reelId + '_main');
  if (!main) return;
  let imgs;
  try { imgs = JSON.parse(decodeURIComponent(main.dataset.images || '')); } catch(e) { return; }
  if (!Array.isArray(imgs) || imgs.length === 0) return;
  let idx = parseInt(main.dataset.index || '0', 10);
  idx = (idx + dir + imgs.length) % imgs.length;
  _setReelImage(reelId, idx);
}
function _setReelImage(reelId, idx) {
  const main = document.getElementById(reelId + '_main');
  const bg   = document.getElementById(reelId + '_bg');
  const cur  = document.getElementById(reelId + '_cur');
  const dots = document.getElementById(reelId + '_dots');
  if (!main) return;
  let imgs;
  try { imgs = JSON.parse(decodeURIComponent(main.dataset.images || '')); } catch(e) { return; }
  if (idx < 0 || idx >= imgs.length) return;
  main.dataset.index = idx;
  main.src = imgs[idx];
  if (bg) bg.src = imgs[idx];
  if (cur) cur.textContent = (idx + 1);
  if (dots) dots.querySelectorAll('.reel-multi-dot').forEach((d,i) => d.classList.toggle('active', i === idx));
}

function _cycleMultiImage(wrapId, dir) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  let imgs;
  try { imgs = JSON.parse(decodeURIComponent(wrap.dataset.images)); } catch(e) { return; }
  if (!Array.isArray(imgs) || imgs.length === 0) return;
  let idx = parseInt(wrap.dataset.index || '0', 10);
  idx = (idx + dir + imgs.length) % imgs.length;
  _setMultiImage(wrapId, idx);
}

function _setMultiImage(wrapId, idx) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  let imgs;
  try { imgs = JSON.parse(decodeURIComponent(wrap.dataset.images)); } catch(e) { return; }
  if (idx < 0 || idx >= imgs.length) return;
  wrap.dataset.index = idx;
  const imgEl = wrap.querySelector('.multi-image-img');
  if (imgEl) {
    imgEl.src = imgs[idx];
    imgEl.alt = `添付画像 ${idx+1}/${imgs.length}`;
    // 新しい画像のロード後にマソンリー高さを再計算（高さ変動による被り防止）
    imgEl.onload = () => {
      const fs = document.getElementById('fs-body');
      if (fs && fs.contains(wrap)) _fsResizeMasonry(fs);
      const hf = document.getElementById('home-feed');
      if (hf && hf.contains(wrap) && typeof _resizeHomeMasonry === 'function') _resizeHomeMasonry();
    };
  }
  const curEl = wrap.querySelector('.multi-image-cur');
  if (curEl) curEl.textContent = (idx + 1);
  wrap.querySelectorAll('.multi-image-dot').forEach((d,i) => {
    d.classList.toggle('active', i === idx);
  });
}

function handleComposeMedia(input, type) {
  const files = Array.from(input.files || []);
  if (files.length === 0) return;

  const maxMB = type === 'video' ? 50 : 10;
  for (const f of files) {
    if (f.size > maxMB * 1024 * 1024) {
      showToast(`${f.name} はサイズオーバー（最大${maxMB}MB）`, 'warn');
      input.value = '';
      return;
    }
  }

  if (type === 'image') {
    // 既存の複数画像があれば追加、なければ新規
    const existing = (pendingMedia && pendingMedia.type === 'image' && Array.isArray(pendingMedia.dataList))
      ? pendingMedia.dataList
      : [];
    const remain = COMPOSE_MAX_IMAGES - existing.length;
    if (remain <= 0) {
      showToast(`画像は最大${COMPOSE_MAX_IMAGES}枚までです`, 'warn');
      input.value = '';
      return;
    }
    const targets = files.slice(0, remain);
    Promise.all(targets.map(f => new Promise(res => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.readAsDataURL(f);
    })))
    .then(raws => Promise.all(raws.map(d => _resizeImageDataUrl(d, COMPOSE_IMG_MAX_DIM, COMPOSE_IMG_QUALITY))))
    .then(dataUrls => {
      const list = existing.concat(dataUrls);
      pendingMedia = {
        type: 'image',
        dataList: list,
        data: list[0], // 互換: 1枚目を data に
      };
      _renderComposeMediaPreview();
      pendingImageUrl = null;
      const imgUrlInp = document.getElementById('compose-imgurl-input');
      if (imgUrlInp) imgUrlInp.value = '';
      document.getElementById('compose-imgurl-row').style.display = '';
      updateCompose();
      input.value = ''; // 同じファイルを再選択できるように
    });
    return;
  }

  // 動画は従来通り単一
  const file = files[0];
  const reader = new FileReader();
  reader.onload = e => {
    pendingMedia = { data: e.target.result, type: 'video' };
    const inner = document.getElementById('compose-media-inner');
    const preview = document.getElementById('compose-media-preview');
    inner.innerHTML = `<video src="${pendingMedia.data}" class="compose-media-vid" controls preload="metadata"></video>`;
    document.getElementById('compose-imgurl-row').style.display = 'none';
    preview.style.display = '';
    updateCompose();
  };
  reader.readAsDataURL(file);
}

function _renderComposeMediaPreview() {
  const inner = document.getElementById('compose-media-inner');
  const preview = document.getElementById('compose-media-preview');
  if (!pendingMedia || pendingMedia.type !== 'image' || !Array.isArray(pendingMedia.dataList)) return;
  const list = pendingMedia.dataList;
  inner.innerHTML = `
    <div class="compose-multi-img-grid" data-count="${list.length}">
      ${list.map((d, i) => `
        <div class="compose-multi-img-item">
          <img src="${d}" alt="画像${i+1}">
          <button type="button" class="compose-multi-img-del" onclick="event.stopPropagation();removeComposeImageAt(${i})" title="削除"><i class="ti ti-x"></i></button>
        </div>
      `).join('')}
    </div>
    <div style="font-size:11px;color:var(--text3);margin-top:6px;text-align:center">${list.length}/${COMPOSE_MAX_IMAGES} 枚（1枚目が表紙）</div>`;
  preview.style.display = '';
}

function removeComposeImageAt(idx) {
  if (!pendingMedia || pendingMedia.type !== 'image' || !Array.isArray(pendingMedia.dataList)) return;
  pendingMedia.dataList.splice(idx, 1);
  if (pendingMedia.dataList.length === 0) {
    removeComposeMedia();
    return;
  }
  pendingMedia.data = pendingMedia.dataList[0];
  _renderComposeMediaPreview();
  updateCompose();
}

function removeComposeMedia() {
  pendingMedia    = null;
  pendingImageUrl = null;
  document.getElementById('compose-img-input').value = '';
  document.getElementById('compose-vid-input').value = '';
  document.getElementById('compose-media-inner').innerHTML = '';
  document.getElementById('compose-media-preview').style.display = 'none';
  document.getElementById('compose-imgurl-row').style.display = 'none';
  const imgUrlInp = document.getElementById('compose-imgurl-input');
  if (imgUrlInp) imgUrlInp.value = '';
  updateCompose();
}

// ── Compose URL helpers ────────────────────────────────
function toggleComposeUrl() {
  const row = document.getElementById('compose-url-row');
  const btn = document.getElementById('compose-url-toggle-btn');
  const visible = row.style.display !== 'none';
  row.style.display = visible ? 'none' : '';
  if (btn) btn.classList.toggle('compose-url-btn-active', !visible);
  if (visible) {
    pendingUrl = null;
    const inp = document.getElementById('compose-url-input');
    if (inp) inp.value = '';
  } else {
    document.getElementById('compose-url-input')?.focus();
  }
}
function updateComposeUrl() {
  const v = (document.getElementById('compose-url-input')?.value || '').trim();
  pendingUrl = v || null;
}
function clearComposeUrl() {
  pendingUrl = null;
  const inp = document.getElementById('compose-url-input');
  if (inp) inp.value = '';
}
function updateImageUrl() {
  const v = (document.getElementById('compose-imgurl-input')?.value || '').trim();
  pendingImageUrl = v || null;
}
function clearImageUrl() {
  pendingImageUrl = null;
  const inp = document.getElementById('compose-imgurl-input');
  if (inp) inp.value = '';
}

// ── Ranking / Category Grid ────────────────────────────
// ランキングデータキャッシュ { period, data:[], fetchedAt }
let _rankCache = { period: null, data: [], fetchedAt: 0 };
const RANK_CACHE_TTL = 60000; // 1分キャッシュ

/** DB投稿をランキング用ツイートオブジェクトに変換 */
function _dbPostToTweet(p, avatarMap = {}, nameTagMap = {}, regionMap = {}, rookieMap = {}) {
  // avatarMap の値は「アバターHTML文字列」または「{av, nameTag} オブジェクト」の両方を許容
  //   （新着フィードは後者を渡す。オブジェクトのまま使うと [object Object] になり
  //     bg/tc も transparent になってアイコンが消えるため、ここで正規化する）
  const _avEntry = avatarMap[p.user_handle];
  const avImg    = (_avEntry && typeof _avEntry === 'object') ? (_avEntry.av || null) : (_avEntry || null);
  const _avTag   = (_avEntry && typeof _avEntry === 'object') ? (_avEntry.nameTag || null) : null;
  const nameTag = p.name_tag || _avTag || nameTagMap[p.user_handle] || null;
  const isExt = !!p.ext_source;
  // 内部投稿は「信頼度補正済みの加重和」で採点（BOT対策）。
  //   weighted_* は各いいね/保存を"した人の信頼度(0〜1.5)"の合計。移行期に
  //   weighted が未蓄積(0)の投稿は素のcountにフォールバックして急落を防ぐ。
  const wLikes = Math.max(p.weighted_likes || 0, ((p.weighted_likes || 0) === 0 ? (p.likes_count || 0) : 0));
  const wSaves = Math.max(p.weighted_saves || 0, ((p.weighted_saves || 0) === 0 ? (p.saved_count || 0) : 0));
  const score = isExt
    // 外部投稿: 閲覧数・BM数ベースのスコア
    ? (p.ext_pop_score || 0)
    // 内部投稿: いいね×20 + お気に入り×30 + 閲覧×2 + ベースボーナス250点
    //   （リポスト・投稿ブーストは廃止。いいね/保存は信頼度加重）
    : wLikes * 20 + wSaves * 30 + (p.views_count || 0) * 2 + 250;
  return {
    db_id    : p.id,
    catId    : p.cat_id   || null,
    text     : p.content,
    likes    : p.likes_count  || 0,
    rt       : p.rt_count     || 0,
    views    : p.views_count  || 0,
    time     : _relativeTime(p.created_at),
    ai       : p.ai_type      || 'none',
    mediaData   : p.media_data       || null,
    mediaType   : p.media_type       || null,
    linkUrl     : p.link_url         || null,
    imageLinkUrl: p.image_link_url   || null,
    tags     : Array.isArray(p.tags) ? p.tags : [],
    extSource : p.ext_source   || null,
    extUrl    : p.ext_url      || null,
    saved     : p.saved_count  || 0,
    boostScore: p.boost_score  || 0,
    likeEmoji : p.like_emoji   || '❤️',
    score,
    rank     : 0,
    prev     : '初登場',
    isDummy  : false,
    user     : {
      h      : p.user_handle,
      n      : p.user_name,
      av     : avImg || (p.user_name || p.user_handle?.slice(1) || '?')[0].toUpperCase(),
      bg     : avImg ? 'transparent' : '#3b82f6',
      tc     : avImg ? 'transparent' : '#ffffff',
      sub    : p.is_sub,
      nameTag,
      region  : regionMap[p.user_handle]  || null,
      isRookie: !!rookieMap[p.user_handle],
    },
  };
}

/** 都道府県名を短縮（東京都→東京、大阪府→大阪、北海道→北海道 など） */
function _shortPref(pref) {
  if (!pref) return '';
  return pref.replace(/[都道府県]$/, '');
}

/** ランキングデータをSupabaseから取得してキャッシュ */
async function _loadRankData(force = false) {
  const now = Date.now();
  if (!force && _rankCache.period === rankPeriod && (now - _rankCache.fetchedAt) < RANK_CACHE_TTL) return;

  const raw = await dbFetchRankedPosts({
    period    : rankPeriod,
    limit     : 500,
    prefecture: rankPrefecture !== '全国' ? rankPrefecture : null,
  });

  // 登場するユーザーのアバター・名前タグ・都道府県・登録日を一括取得
  const accountIds = [...new Set(raw.filter(p => p.user_handle?.startsWith('@') && !p.is_sub).map(p => p.user_handle.slice(1)))];
  const avatarMap  = {};
  const nameTagMap = {};
  const regionMap  = {};
  const rookieMap  = {};
  const ROOKIE_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30日
  if (accountIds.length > 0) {
    const { data: profiles } = await db.from('profiles').select('account_id, avatar_data, name_tag, region, created_at').in('account_id', accountIds);
    (profiles || []).forEach(pr => {
      avatarMap['@' + pr.account_id] = pr.avatar_data
        ? `<img src="${pr.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : null;
      if (pr.name_tag) nameTagMap['@' + pr.account_id] = pr.name_tag;
      if (pr.region)   regionMap['@' + pr.account_id]  = pr.region;
      // アカウント作成から30日以内ならルーキー
      if (pr.created_at) {
        const age = Date.now() - new Date(pr.created_at).getTime();
        if (age <= ROOKIE_THRESHOLD) rookieMap['@' + pr.account_id] = true;
      }
    });
  }

  _rankCache = { period: rankPeriod, data: raw.map(p => _dbPostToTweet(p, avatarMap, nameTagMap, regionMap, rookieMap)), fetchedAt: now };

  // catSubStats をランキングデータから再構築（別アカウント・別端末でも同じサブカテゴリー列を表示するため）
  Object.keys(catSubStats).forEach(k => delete catSubStats[k]);
  _rankCache.data.forEach(t => {
    if (t.catId && Array.isArray(t.tags) && t.tags.length) {
      recordCatSubStats(t.catId, t.tags, t.likes || 0);
    }
  });

  // 自分の投稿がランキングに入っていれば通知
  _notifyMyRankings();

  // ランキング報酬を全ユーザー対象で付与（重複防止はDBで担保）
  _processRankRewards();
}

// ── ランキング報酬の付与（_rankCache から自動算出） ──
async function _processRankRewards() {
  // ピークコイン廃止：ランキング報酬（コイン付与）は行わない。
  return;
  /* eslint-disable no-unreachable */
  const data = _rankCache.data;
  if (!data || !data.length) return;

  // 全体ランキング: スコア順
  const allSorted = [...data].filter(t => !t.isDummy && !t.extSource)
    .sort((a, b) => b.score - a.score);
  for (let i = 0; i < Math.min(100, allSorted.length); i++) {
    const t = allSorted[i];
    if (!t.db_id) continue;
    const accountId = t.user?.h?.startsWith('@') ? t.user.h.slice(1) : t.user?.h;
    if (!accountId) continue;
    grantRankReward(t.db_id, accountId, i + 1, 'all', null);
  }

  // カテゴリー別ランキング
  const byCat = {};
  data.filter(t => !t.isDummy && !t.extSource && t.catId).forEach(t => {
    if (!byCat[t.catId]) byCat[t.catId] = [];
    byCat[t.catId].push(t);
  });
  for (const [catId, posts] of Object.entries(byCat)) {
    const sorted = posts.sort((a, b) => b.score - a.score);
    for (let i = 0; i < Math.min(100, sorted.length); i++) {
      const t = sorted[i];
      if (!t.db_id) continue;
      const accountId = t.user?.h?.startsWith('@') ? t.user.h.slice(1) : t.user?.h;
      if (!accountId) continue;
      grantRankReward(t.db_id, accountId, i + 1, 'cat', catId);
    }
  }
}

/**
 * ランキング通知の中核ロジック。
 * data（ツイート配列）と period を直接受け取るので、
 * キャッシュ状態・グローバル変数に依存しない。
 */
function _notifyFromData(data, period) {
  try {
    if (!localStorage.getItem('trendy_logged_in')) return;
    const myH = myHandle;
    if (!myH || myH === '@you') return;

    // カテゴリー別に全投稿をグループ化
    const byCategory = {};
    data.forEach(t => {
      const cid = t.catId || 'all';
      if (!byCategory[cid]) byCategory[cid] = [];
      byCategory[cid].push(t);
    });

    // 通知済みキー（スパム防止）
    let sentMap = {};
    try { sentMap = JSON.parse(localStorage.getItem('trendy_rank_notif_sent') || '{}'); } catch(e) {}

    Object.entries(byCategory).forEach(([catId, posts]) => {
      const cat = CATS_DATA.find(c => c.id === catId);
      if (!cat) return;

      const sorted = [...posts].sort((a, b) => (b.score - a.score) || 0);
      const prefRanks = _computePrefRanks(sorted);

      sorted.forEach((t, i) => {
        if (t.user?.h !== myH || t.user?.sub) return;
        if (period === 'rookie' && !t.user?.isRookie) return;
        const globalRank = i + 1;
        if (globalRank > 100) return;

        const prefRank = prefRanks[t.db_id] || null;
        const pref     = t.user?.region || null;
        const key = `${t.db_id}_${catId}_${period}`;
        const prevSent = sentMap[key];

        if (prevSent && prevSent.g === globalRank && prevSent.p === prefRank) return;

        const isRookiePeriod = period === 'rookie';
        const prefPart = (!isRookiePeriod && prefRank && pref) ? `・<b>${_shortPref(pref)}県${prefRank}位</b>` : '';
        const notif = {
          icon  : isRookiePeriod ? 'ti-seedling' : 'ti-trophy',
          bg    : isRookiePeriod ? '#f0fdf4' : '#fef3c7',
          tc    : isRookiePeriod ? '#14532d' : '#92400e',
          text  : isRookiePeriod
            ? `あなたの投稿が<b>${cat.name}</b> <b>🌱ルーキーランキング 全体${globalRank}位</b> にランクインしました！`
            : `あなたの投稿が<b>${cat.name}</b>ランキング <b>全体${globalRank}位</b>${prefPart} にランクインしました！`,
          hint  : 'ランキングで確認 👆',
          time  : 'たった今',
          type  : 'rank',
          rank  : globalRank,
          cat   : cat.name,
          unread: true,
        };
        pushNotif(notif, 'main');
        showToast(
          isRookiePeriod
            ? `🌱 ${cat.name} ルーキーランキング 全体${globalRank}位！`
            : `🏆 ${cat.name}ランキング 全体${globalRank}位${prefRank && pref ? `・${_shortPref(pref)}${prefRank}位` : ''}！`,
          'success'
        );

        sentMap[key] = { g: globalRank, p: prefRank };
        localStorage.setItem('trendy_rank_notif_sent', JSON.stringify(sentMap));

        _earnRankBadge(globalRank, cat.name, catId, 'global', '全国', period);
        if (!isRookiePeriod && prefRank && pref) {
          _earnRankBadge(prefRank, cat.name, catId, 'pref', pref, period);
        }
      });
    });
  } catch(e) {
    console.warn('[通知] ランキングチェックエラー:', e);
  }
}

/** _rankCache をもとに通知（_loadRankData から呼ばれる従来の呼び出し口） */
function _notifyMyRankings() {
  _notifyFromData(_rankCache.data, _rankCache.period);
}

/**
 * 起動時バックグラウンドチェック：
 * daily / weekly / monthly / rookie の全期間を順にフェッチし、
 * _rankCache や UI 状態を一切変えずに通知だけ処理する。
 */
async function _startupRankNotifCheck() {
  if (!localStorage.getItem('trendy_logged_in')) return;
  if (!myHandle || myHandle === '@you') return;

  const ROOKIE_MS = 30 * 24 * 60 * 60 * 1000;
  const periods   = ['daily', 'weekly', 'monthly', 'rookie'];

  // 4期間を並列フェッチして起動時間を短縮
  const results = await Promise.allSettled(
    periods.map(period => dbFetchRankedPosts({ period, limit: 500, prefecture: null }))
  );

  await Promise.allSettled(results.map(async (result, i) => {
    const period = periods[i];
    try {
      if (result.status !== 'fulfilled' || !result.value?.length) return;
      const raw = result.value;

      const handles = [...new Set(
        raw.filter(p => p.user_handle?.startsWith('@') && !p.is_sub)
           .map(p => p.user_handle.slice(1))
      )];
      const regionMap = {}, rookieMap = {};
      if (handles.length) {
        const { data: profs } = await db.from('profiles')
          .select('account_id, region, created_at')
          .in('account_id', handles);
        (profs || []).forEach(pr => {
          if (pr.region) regionMap['@' + pr.account_id] = pr.region;
          if (pr.created_at && Date.now() - new Date(pr.created_at).getTime() <= ROOKIE_MS)
            rookieMap['@' + pr.account_id] = true;
        });
      }
      const tweets = raw.map(p => _dbPostToTweet(p, {}, {}, regionMap, rookieMap));
      _notifyFromData(tweets, period);
    } catch(e) {
      console.warn(`[startupNotif] ${period} チェック失敗:`, e);
    }
  }));
}

// ══════════════════════════════════════════════════════
// ── 称号バッジシステム ─────────────────────────────────
// ══════════════════════════════════════════════════════

let _badgeFilterMode  = 'all';  // 'all' | 'gold' | 'silver' | 'bronze' | 'global' | 'pref'
let _badgeSearchQuery = '';

/** localStorage からバッジ一覧を取得 */
function _loadEarnedBadges() {
  try { return JSON.parse(localStorage.getItem('trendy_earned_badges') || '[]'); } catch(e) { return []; }
}
/** localStorage にバッジ一覧を保存 */
function _saveEarnedBadges(list) {
  localStorage.setItem('trendy_earned_badges', JSON.stringify(list));
}
/** 表示中バッジ ID（最大3, null 可）を取得 */
function _loadDisplayBadgeIds() {
  try {
    const raw = JSON.parse(localStorage.getItem('trendy_display_badges') || '[null,null,null]');
    // 正規化: オブジェクトなら .id を取り出す（後方互換）
    const arr = raw.map(b => {
      if (typeof b === 'object' && b !== null) return b.id || null;
      return b;
    });
    while (arr.length < 3) arr.push(null);
    return arr.slice(0, 3);
  } catch(e) { return [null,null,null]; }
}
/** 表示中バッジ ID を保存 */
function _saveDisplayBadgeIds(ids) {
  localStorage.setItem('trendy_display_badges', JSON.stringify(ids.slice(0,3)));
}

/** バッジ獲得 — 重複なし、上位ランクで上書き更新 */
function _earnRankBadge(rank, catName, catId, scopeType, scopeName, period) {
  const isRookie = period === 'rookie';
  if (isRookie  && rank > 30) return; // ルーキーは30位以内
  if (!isRookie && rank > 50) return; // 通常は50位以内
  const now  = new Date();
  const ym   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  // ルーキーバッジはIDに "rookie_" プレフィックスを付けて通常バッジと区別
  const id   = isRookie
    ? `rookie_${catId}_${rank}_${scopeType}_${ym}`
    : `${catId}_${rank}_${scopeType}_${ym}`;
  const tier = isRookie ? 'rookie'
    : rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'standard';
  const list = _loadEarnedBadges();
  // 既にこのIDがあれば上書きしない（同月・同カテゴリー・同順位は1個）
  if (list.find(b => b.id === id)) return;
  const badge = { id, rank, catName, catId, scopeType, scopeName, tier, period, ym, earnedAt: now.toISOString() };
  list.unshift(badge); // 新しい順に先頭追加
  _saveEarnedBadges(list);
}

/** バッジのティアラベルを取得 */
function _badgeTierLabel(tier) {
  if (tier === 'gold')   return '🥇';
  if (tier === 'silver') return '🥈';
  if (tier === 'bronze') return '🥉';
  if (tier === 'rookie') return '🌱';
  return '🏅';
}

/** バッジのスコープ表示文字列 */
function _badgeScopeLabel(scopeType, scopeName) {
  return scopeType === 'global' ? '🌐 全国' : `📍 ${scopeName}`;
}

/** period → 表示名 */
function _periodLabel(period) {
  const map = { daily: 'デイリー', weekly: 'ウィークリー', monthly: 'マンスリー', yearly: 'イヤーリー', rookie: 'ルーキー', male: '男性人気', female: '女性人気' };
  return map[period] || period;
}

/** 年月文字列 → "2026年5月度" */
function _ymLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${y}年${parseInt(m)}月度`;
}

/** カテゴリーIDからアイコンを取得 */
function _catIconForBadge(catId) {
  const c = CATS_DATA.find(x => x.id === catId);
  return c ? `<i class="ti ${c.icon}" style="color:${c.color}"></i>` : '<i class="ti ti-tag"></i>';
}

/**
 * 豪華バッジHTMLを生成
 * @param {Object} badge
 * @param {boolean} selected  選択中かどうか
 * @param {boolean} compact   プロフィール表示用の小サイズ
 */
function _renderBadgeCard(badge, selected = false, compact = false) {
  const tierColors = {
    gold: {
      bg:          'linear-gradient(160deg,#1a0d00 0%,#3d2000 28%,#150a00 55%,#2d1800 100%)',
      border:      '#c8860a',
      glow:        'rgba(255,180,20,0.75)',
      text:        '#ffd700',
      accent:      '#ffb700',
      rankShadow:  '0 0 18px rgba(255,210,0,0.95),0 0 36px rgba(255,160,0,0.6),0 2px 4px rgba(0,0,0,0.8)',
      frame:       'rgba(200,134,10,0.45)',
      cornerColor: '#ffc400',
    },
    silver: {
      bg:          'linear-gradient(160deg,#080e1a 0%,#1a2840 28%,#080e1a 55%,#162235 100%)',
      border:      '#7aacdc',
      glow:        'rgba(122,172,220,0.65)',
      text:        '#c8e4f8',
      accent:      '#a4ccee',
      rankShadow:  '0 0 18px rgba(180,220,255,0.95),0 0 36px rgba(100,160,220,0.6),0 2px 4px rgba(0,0,0,0.8)',
      frame:       'rgba(122,172,220,0.35)',
      cornerColor: '#b8d8f8',
    },
    bronze: {
      bg:          'linear-gradient(160deg,#1a0800 0%,#3d1e00 28%,#150600 55%,#2d1200 100%)',
      border:      '#a05c1a',
      glow:        'rgba(200,110,20,0.75)',
      text:        '#eeaa60',
      accent:      '#d47830',
      rankShadow:  '0 0 18px rgba(230,150,40,0.95),0 0 36px rgba(180,90,10,0.6),0 2px 4px rgba(0,0,0,0.8)',
      frame:       'rgba(160,92,26,0.45)',
      cornerColor: '#e09040',
    },
    standard: {
      bg:          'linear-gradient(160deg,#0d0020 0%,#280050 28%,#0a0018 55%,#1e0040 100%)',
      border:      '#7040b0',
      glow:        'rgba(150,80,220,0.65)',
      text:        '#cc90ff',
      accent:      '#a060e0',
      rankShadow:  '0 0 18px rgba(180,100,255,0.95),0 0 36px rgba(130,60,210,0.6),0 2px 4px rgba(0,0,0,0.8)',
      frame:       'rgba(112,64,176,0.4)',
      cornerColor: '#b878f0',
    },
    // ルーキーバッジ — シンプルなグリーンデザイン
    rookie: {
      bg:          'linear-gradient(145deg,#f0fdf4 0%,#dcfce7 45%,#bbf7d0 100%)',
      border:      '#22c55e',
      glow:        'rgba(34,197,94,0.30)',
      text:        '#14532d',
      accent:      '#16a34a',
      rankShadow:  '0 1px 6px rgba(34,197,94,0.5),0 1px 2px rgba(0,0,0,0.12)',
      frame:       'rgba(34,197,94,0.20)',
      cornerColor: '#4ade80',
    },
  };

  const tc = tierColors[badge.tier] || tierColors.standard;
  const rankLabel = `${badge.rank}位`;
  const scopeLabel = _badgeScopeLabel(badge.scopeType, badge.scopeName);
  const period = _periodLabel(badge.period);
  const dateLabel = _ymLabel(badge.ym);
  const tierEmoji = _badgeTierLabel(badge.tier);
  const catIcon = _catIconForBadge(badge.catId);

  if (compact) {
    // プロフィール表示用コンパクトバッジ
    return `<div class="dbadge-card dbadge-${badge.tier}"
        title="${badge.catName} ${rankLabel} ${scopeLabel} ${dateLabel}"
        style="background:${tc.bg};border-color:${tc.border};box-shadow:0 0 14px ${tc.glow},0 2px 8px rgba(0,0,0,0.7),inset 0 1px 0 ${tc.frame}">
      <div class="dbadge-emoji">${tierEmoji}</div>
      <div class="dbadge-rank" style="color:${tc.text};text-shadow:${tc.rankShadow}">${rankLabel}</div>
      <div class="dbadge-info">
        <span class="dbadge-cat" style="color:${tc.accent}">${catIcon} ${badge.catName}</span>
        <span class="dbadge-date" style="color:${tc.text};opacity:0.65">${dateLabel}</span>
      </div>
    </div>`;
  }

  // フルサイズバッジ（バッジ管理ページ用）
  const isRookieTier = badge.tier === 'rookie';
  // ルーキーバッジはシンプルなシャドウ、通常は多層グロー
  const cardShadow = isRookieTier
    ? `0 4px 14px ${tc.glow},0 2px 6px rgba(0,0,0,0.10)`
    : `0 8px 28px ${tc.glow},0 3px 10px rgba(0,0,0,0.7),inset 0 1px 0 ${tc.frame},inset 0 -1px 0 rgba(0,0,0,0.5)`;
  // ルーキーは装飾パーツ（枠・コーナー）なし
  const decorParts = isRookieTier ? '' : `
    <div class="badge-frame" style="border-color:${tc.frame}"></div>
    <div class="badge-corner bc-tl" style="color:${tc.cornerColor}">✦</div>
    <div class="badge-corner bc-tr" style="color:${tc.cornerColor}">✦</div>
    <div class="badge-corner bc-bl" style="color:${tc.cornerColor}">✦</div>
    <div class="badge-corner bc-br" style="color:${tc.cornerColor}">✦</div>`;
  return `<div class="badge-card badge-tier-${badge.tier}${selected ? ' badge-selected' : ''}"
      style="background:${tc.bg};border-color:${tc.border};box-shadow:${cardShadow}"
      onclick="toggleBadgeSelect('${badge.id}')">
    ${decorParts}
    ${selected ? `<div class="badge-check-mark" style="background:${tc.accent};box-shadow:0 0 8px ${tc.glow}"><i class="ti ti-check"></i></div>` : ''}
    <div class="badge-inner">
      <div class="badge-crown-circle" style="background:radial-gradient(circle,${tc.glow} 0%,transparent 70%);border-color:${tc.border}${isRookieTier ? '60' : '80'}">${tierEmoji}</div>
      <div class="badge-rank-num" style="color:${tc.text};text-shadow:${tc.rankShadow}">${rankLabel}</div>
      <div class="badge-divider" style="background:linear-gradient(90deg,transparent,${tc.border}${isRookieTier ? '60' : '90'},transparent)"></div>
      <div class="badge-cat-row" style="color:${tc.text}">${catIcon} <span style="font-weight:800">${badge.catName}</span></div>
      <div class="badge-scope-row" style="color:${tc.accent}">${scopeLabel}</div>
      <div class="badge-divider" style="background:linear-gradient(90deg,transparent,${tc.border}${isRookieTier ? '30' : '50'},transparent)"></div>
      <div class="badge-period-row" style="color:${tc.accent};opacity:0.75">${period}</div>
      <div class="badge-date-row" style="color:${tc.text}">${dateLabel}</div>
    </div>
  </div>`;
}

/** バッジ選択トグル（最大3つ） */
function toggleBadgeSelect(badgeId) {
  let ids = _loadDisplayBadgeIds();
  const idx = ids.indexOf(badgeId);
  if (idx >= 0) {
    // 選択解除
    ids[idx] = null;
  } else {
    // 空きスロットに追加
    const empty = ids.indexOf(null);
    if (empty >= 0) {
      ids[empty] = badgeId;
    } else {
      // 空きなし → 一番古いスロットを上書き
      ids.shift(); ids.push(badgeId);
    }
  }
  _saveDisplayBadgeIds(ids);
  renderBadgesPage();
  _renderDisplayBadges();
  // Supabase に同期（他ユーザーのプロフィールページで表示するため）
  const _aid = localStorage.getItem('trendy_account_id');
  if (_aid && typeof dbSaveDisplayBadges === 'function') {
    const _earned  = _loadEarnedBadges();
    const _toSave  = ids.map(bid => bid ? (_earned.find(b => b.id === bid) || null) : null).filter(Boolean);
    dbSaveDisplayBadges(_aid, _toSave).catch(() => {});
  }
}

/** マイページのバッジスロット描画 */
function _titleBadgeCardHTML(title, compact = true) {
  const rar = (typeof _getBadgeRarity === 'function')
    ? _getBadgeRarity(title)
    : (Object.values(TITLE_INFO).find(t => t.title === title)?.rarity || 'SR');
  const lv = (typeof _getBadgeLevel === 'function') ? _getBadgeLevel(title) : 0;
  return `<div class="title-badge-display-card title-badge-${rar.toLowerCase()}">
    <span class="title-badge-display-text">${title}</span>
    ${lv > 0 ? `<span class="title-badge-level-overlay">+${lv}</span>` : ''}
  </div>`;
}

function _renderDisplayBadges() {
  const ids    = _loadDisplayBadgeIds();
  const earned = _loadEarnedBadges();
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById(`dbadge-${i}`);
    if (!el) continue;
    const bid = ids[i];
    if (typeof bid === 'string' && bid.startsWith('title:')) {
      el.innerHTML = _titleBadgeCardHTML(bid.slice(6));
      el.classList.add('has-badge');
      continue;
    }
    const badge = bid ? earned.find(b => b.id === bid) : null;
    if (badge) {
      el.innerHTML = _renderBadgeCard(badge, false, true);
      el.classList.add('has-badge');
    } else {
      el.innerHTML = `<div class="dbadge-empty"><i class="ti ti-medal" style="font-size:20px;color:var(--text3)"></i><span>+</span></div>`;
      el.classList.remove('has-badge');
    }
  }
  // プロフィール編集プレビュー
  const preview = document.getElementById('pe-badge-preview');
  if (preview) {
    const items = ids.map(bid => {
      if (typeof bid === 'string' && bid.startsWith('title:')) return { type: 'title', title: bid.slice(6) };
      const b = bid ? earned.find(b => b.id === bid) : null;
      return b ? { type: 'badge', badge: b } : null;
    }).filter(Boolean);
    preview.innerHTML = items.length
      ? items.map(it => it.type === 'title' ? _titleBadgeCardHTML(it.title) : _renderBadgeCard(it.badge, false, true)).join('')
      : `<span style="font-size:12px;color:var(--text3)">バッジが選択されていません</span>`;
  }
}

/** バッジ管理ページ描画 */
function renderBadgesPage() {
  _renderBadgesDisplaySlots();
  _renderBadgesGrid();
  _renderGachaTitleBadgesSection();
}

async function _renderGachaTitleBadgesSection() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  _gachaItems = await dbGetUserItems(aid);

  const owned = Object.entries(TITLE_INFO)
    .filter(([id]) => (_gachaItems[id] || 0) > 0)
    .map(([id, info]) => ({ id, ...info }));

  // 現在表示中のバッジスロットを確認
  const ids = _loadDisplayBadgeIds();
  const slottedTitles = ids.filter(i => typeof i === 'string' && i.startsWith('title:')).map(i => i.slice(6));

  // 現在のスロット状況表示
  const cur = document.getElementById('gacha-title-current-display');
  if (cur) {
    if (slottedTitles.length === 0) {
      cur.innerHTML = `<div style="padding:8px 14px;background:var(--bg2);border-radius:10px;border:1px dashed var(--border);font-size:12px;color:var(--text3)">バッジ枠に追加された称号: なし</div>`;
    } else {
      cur.innerHTML = `<div style="padding:10px 14px;background:var(--bg2);border-radius:10px;border:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:11px;color:var(--text3);font-weight:700">バッジ枠に追加中:</span>
        ${slottedTitles.map(t => `<span class="profile-title-badge"><i class="ti ti-medal"></i>${t}</span>`).join('')}
      </div>`;
    }
  }

  // 所持称号一覧
  const grid = document.getElementById('gacha-title-badges-grid');
  if (!grid) return;
  if (!owned.length) {
    grid.innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">
        <i class="ti ti-medal-off" style="font-size:32px;display:block;margin-bottom:8px"></i>
        ガチャでまだ称号バッジを入手していません
        <div style="margin-top:10px"><button class="btn-primary" onclick="goPage('gacha',null)">ガチャを引く</button></div>
      </div>`;
    return;
  }

  // レアリティ別にグルーピング
  const grouped = { LG: [], UR: [], SSR: [], SR: [] };
  owned.forEach(t => { if (grouped[t.rarity]) grouped[t.rarity].push(t); });

  // 検索バー
  let html = `
    <div style="position:sticky;top:0;background:var(--bg);padding:6px 0 8px;margin-bottom:6px;z-index:5">
      <input type="text" id="title-badge-search" placeholder="🔍 称号を検索…"
        oninput="_filterTitleBadges(this.value)"
        style="width:100%;padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text1);font-size:13px;box-sizing:border-box">
    </div>`;
  for (const rar of ['LG','UR','SSR','SR']) {
    if (!grouped[rar].length) continue;
    // SR は所持数が多いので初期は折りたたむ
    const initialCollapsed = rar === 'SR' && grouped[rar].length > 20;
    html += `
      <div class="title-picker-section${initialCollapsed ? ' collapsed' : ''}" data-rar="${rar}">
        <div class="title-picker-section-head" onclick="this.parentElement.classList.toggle('collapsed')">
          <span class="rarity-${rar.toLowerCase()}">${rar}</span>
          <span style="color:var(--text3);font-size:11px">${grouped[rar].length}種</span>
          <i class="ti ti-chevron-down"></i>
        </div>
        <div class="title-picker-grid">
          ${grouped[rar].map(t => {
            const isInSlot = slottedTitles.includes(t.title);
            const safeTitle = t.title.replace(/'/g, "\\'");
            const lv = _getBadgeLevel(t.title);
            const eff = _badgeEffectValue(t.title);
            const def = BADGE_EFFECT_DEFS[eff.type];
            const effIcon = def && eff.value ? `<i class="ti ${def.icon}" style="font-size:11px;color:${def.color};margin-left:auto" title="${def.label} +${eff.value}${def.unit}"></i>` : '';
            return `<button class="title-picker-btn ${isInSlot ? 'selected' : ''}" data-title="${t.title.toLowerCase()}" onclick="openBadgeActionModal('${safeTitle}')" title="${t.title}${lv>0?' +'+lv:''}${def?' ('+def.label+' +'+eff.value+def.unit+')':''}">
              <span class="rarity-${rar.toLowerCase()}">${rar}</span>
              <span class="title-picker-text">${t.title}</span>
              ${lv > 0 ? `<span style="font-size:10px;color:#fbbf24;font-weight:900">+${lv}</span>` : ''}
              ${effIcon}
              ${isInSlot ? '<i class="ti ti-check" style="color:var(--accent)"></i>' : ''}
            </button>`;
          }).join('')}
        </div>
      </div>`;
  }
  grid.innerHTML = html;
}

// 称号バッジ検索フィルタ
function _filterTitleBadges(query) {
  const q = (query || '').toLowerCase().trim();
  const grid = document.getElementById('gacha-title-badges-grid');
  if (!grid) return;
  const sections = grid.querySelectorAll('.title-picker-section');
  sections.forEach(sec => {
    let visibleCount = 0;
    sec.querySelectorAll('.title-picker-btn').forEach(btn => {
      const t = btn.dataset.title || '';
      const match = !q || t.includes(q);
      btn.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });
    sec.style.display = visibleCount > 0 ? '' : 'none';
    // 検索中はマッチしたセクションを自動展開
    if (q && visibleCount > 0) sec.classList.remove('collapsed');
  });
}

// 称号バッジクリック時のアクションメニュー（設定 or 強化）
function openBadgeActionModal(title) {
  document.getElementById('badge-action-modal')?.remove();
  const ids = _loadDisplayBadgeIds();
  const slotId = 'title:' + title;
  const isSet = ids.includes(slotId);
  const level = _getBadgeLevel(title);
  const html = `
    <div id="badge-action-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px"
      onclick="if(event.target===this)document.getElementById('badge-action-modal').remove()">
      <div style="background:var(--bg);border-radius:14px;padding:20px 22px;max-width:340px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.4)">
        <div style="text-align:center;margin-bottom:14px">
          ${_titleBadgeCardHTML(title)}
          ${level > 0 ? `<div style="margin-top:6px;color:#fbbf24;font-weight:900;font-size:13px">+${level}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button onclick="document.getElementById('badge-action-modal').remove();toggleTitleBadgeSlot('${title.replace(/'/g, "\\'")}')"
            style="padding:11px;border-radius:10px;border:none;background:${isSet?'linear-gradient(135deg,#94a3b8,#64748b)':'linear-gradient(135deg,#7c3aed,#5b21b6)'};color:#fff;font-weight:900;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
            <i class="ti ti-${isSet?'circle-minus':'circle-check'}"></i> ${isSet?'バッジから外す':'バッジ設定'}
          </button>
          <button onclick="document.getElementById('badge-action-modal').remove();openBadgeEnhanceModal('${title.replace(/'/g, "\\'")}')"
            style="padding:11px;border-radius:10px;border:none;background:linear-gradient(135deg,#f59e0b,#b45309);color:#fff;font-weight:900;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
            <i class="ti ti-arrow-up-circle"></i> 強化
          </button>
          <button onclick="document.getElementById('badge-action-modal').remove()"
            style="padding:9px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text2);font-size:12px;cursor:pointer">
            キャンセル
          </button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

// ═══ 称号バッジ効果システム ═══
const BADGE_EFFECT_DEFS = {
  coin_boost:   { label:'コイン獲得',       unit:'%',  icon:'ti-coin',         color:'#fbbf24' },
  rank_boost:   { label:'ランキングブースト', unit:'pt', icon:'ti-trending-up',  color:'#3b82f6' },
  gacha_up:     { label:'ガチャ確率UP',     unit:'%',  icon:'ti-sparkles',     color:'#a855f7' },
  follow_max:   { label:'フォロー上限UP',    unit:'人', icon:'ti-user-plus',    color:'#10b981' },
  stats_unlock: { label:'統計機能解放',     unit:'',   icon:'ti-chart-bar',    color:'#06b6d4' },
  fav_slot:     { label:'推しユーザー枠+1', unit:'',   icon:'ti-heart',        color:'#ec4899' },
  badge_slot:   { label:'称号バッジ枠+1',   unit:'',   icon:'ti-medal',        color:'#f59e0b' },
};
const BADGE_EFFECT_KEYS = Object.keys(BADGE_EFFECT_DEFS);

// レアリティ毎の基礎効果値（+0 時の値）
const BADGE_EFFECT_BASE = {
  LG:  { coin_boost: 30, rank_boost: 50, gacha_up: 5, follow_max: 50, stats_unlock: 1, fav_slot: 1, badge_slot: 1 },
  UR:  { coin_boost: 20, rank_boost: 30, gacha_up: 3, follow_max: 30, stats_unlock: 1, fav_slot: 1, badge_slot: 1 },
  SSR: { coin_boost: 15, rank_boost: 20, gacha_up: 2, follow_max: 20, stats_unlock: 1, fav_slot: 0, badge_slot: 0 },
  SR:  { coin_boost: 10, rank_boost: 10, gacha_up: 1, follow_max: 10, stats_unlock: 0, fav_slot: 0, badge_slot: 0 },
  R:   { coin_boost:  5, rank_boost:  5, gacha_up: 0, follow_max:  5, stats_unlock: 0, fav_slot: 0, badge_slot: 0 },
  N:   { coin_boost:  2, rank_boost:  2, gacha_up: 0, follow_max:  2, stats_unlock: 0, fav_slot: 0, badge_slot: 0 },
};

// バッジ名から効果タイプを決定（タイトル文字のハッシュ）
// レアリティで効果値が 0 の場合は次のキーへフォールバック → 必ず非ゼロの効果になる
function _badgeEffectType(title) {
  if (!title) return 'coin_boost';
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  const info = Object.values(TITLE_INFO).find(t => t.title === title);
  const rar = info?.rarity || 'SR';
  const baseMap = BADGE_EFFECT_BASE[rar] || {};
  // 7つの効果からハッシュで開始位置を決定、レアリティで値が 0 の効果はスキップ
  for (let i = 0; i < BADGE_EFFECT_KEYS.length; i++) {
    const key = BADGE_EFFECT_KEYS[(h + i) % BADGE_EFFECT_KEYS.length];
    if ((baseMap[key] || 0) > 0) return key;
  }
  // 全てゼロ（理論上ないが念のため）
  return 'coin_boost';
}

// バッジの実効効果値（基礎 × (1 + lv × 0.1)）
// 現在の（昇格後の）レアリティを参照
function _badgeEffectValue(title) {
  const rar = _getBadgeRarity(title);
  const effectType = _badgeEffectType(title);
  const base = BADGE_EFFECT_BASE[rar]?.[effectType] || 0;
  if (base === 0) return { type: effectType, value: 0, rarity: rar };
  const lv = _getBadgeLevel(title);
  const value = effectType === 'stats_unlock' || effectType === 'fav_slot' || effectType === 'badge_slot'
    ? base
    : Math.round(base * (1 + lv * 0.1));
  return { type: effectType, value, rarity: rar };
}

// 現在装備中のバッジ全効果を集計
function _aggregateBadgeEffects() {
  const ids = (typeof _loadDisplayBadgeIds === 'function') ? _loadDisplayBadgeIds() : [];
  const titles = ids.filter(i => typeof i === 'string' && i.startsWith('title:')).map(i => i.slice(6));
  const totals = {};
  titles.forEach(t => {
    const eff = _badgeEffectValue(t);
    if (!eff.value) return;
    totals[eff.type] = (totals[eff.type] || 0) + eff.value;
  });
  return totals;
}
// グローバルアクセス用
function getBadgeEffect(effectType) {
  return _aggregateBadgeEffects()[effectType] || 0;
}

// ── 称号バッジ強化システム ──
const BADGE_ENHANCE_ORBS = {
  // 成功率はオーブ名の % 通り。失敗時のペナルティは 30/60 が -1、90 はなし
  enhance_orb_30: { label:'強化のオーブ30%', rate:0.30, failPenalty:1, maxLvAllowed:999, color:'#ef4444', orbClass:'orb-red'   },
  enhance_orb_60: { label:'強化のオーブ60%', rate:0.60, failPenalty:1, maxLvAllowed:10,  color:'#fbbf24', orbClass:'orb-gold'  },
  enhance_orb_90: { label:'強化のオーブ90%', rate:0.90, failPenalty:0, maxLvAllowed:3,   color:'#1f2937', orbClass:'orb-black' },
};
const BADGE_MAX_LEVEL = Infinity; // 上限なし

function _loadBadgeLevels() {
  try { return JSON.parse(localStorage.getItem('trendy_badge_levels') || '{}'); } catch(e) { return {}; }
}
function _saveBadgeLevels(map) {
  try { localStorage.setItem('trendy_badge_levels', JSON.stringify(map)); } catch(e) {}
  _syncBadgeDataToDb();
}

// バッジ強化データを profiles に同期（2秒デバウンス・端末間で消えないように）
let _badgeSyncTimer = null;
function _syncBadgeDataToDb() {
  clearTimeout(_badgeSyncTimer);
  _badgeSyncTimer = setTimeout(async () => {
    const aid = localStorage.getItem('trendy_account_id');
    if (!aid || typeof db === 'undefined') return;
    try {
      const { error } = await db.from('profiles').update({
        badge_levels  : _loadBadgeLevels(),
        badge_rarities: _loadBadgeRarities(),
      }).eq('account_id', aid);
      if (error) console.warn('[BADGE] DB同期エラー（カラム未作成の可能性）:', error.message);
    } catch(e) { console.warn('[BADGE] DB同期失敗:', e); }
  }, 2000);
}
function _getBadgeLevel(title) {
  return _loadBadgeLevels()[title] || 0;
}
function _setBadgeLevel(title, lv) {
  const m = _loadBadgeLevels();
  m[title] = lv;
  _saveBadgeLevels(m);
}

// バッジのレアリティ・オーバーライド（大成功で昇格した結果）
const BADGE_RARITY_ORDER = ['N','R','SR','SSR','UR','LG'];
function _loadBadgeRarities() {
  try { return JSON.parse(localStorage.getItem('trendy_badge_rarities') || '{}'); } catch(e) { return {}; }
}
function _saveBadgeRarities(m) {
  try { localStorage.setItem('trendy_badge_rarities', JSON.stringify(m)); } catch(e) {}
  _syncBadgeDataToDb();
}
function _getBadgeRarity(title) {
  const overrides = _loadBadgeRarities();
  if (overrides[title]) return overrides[title];
  const info = Object.values(TITLE_INFO).find(t => t.title === title);
  return info?.rarity || 'SR';
}
function _setBadgeRarity(title, rar) {
  const m = _loadBadgeRarities();
  m[title] = rar;
  _saveBadgeRarities(m);
}
function _ascendRarity(rar) {
  const i = BADGE_RARITY_ORDER.indexOf(rar);
  if (i < 0 || i >= BADGE_RARITY_ORDER.length - 1) return rar;
  return BADGE_RARITY_ORDER[i + 1];
}
function _isMaxRarity(rar) {
  return rar === BADGE_RARITY_ORDER[BADGE_RARITY_ORDER.length - 1];
}

let _badgeEnhanceState = { title: null, selectedOrb: null };

async function openBadgeEnhanceModal(title) {
  // 最新の所持アイテムを取得
  const aid = localStorage.getItem('trendy_account_id');
  if (aid) {
    try { _gachaItems = await dbGetUserItems(aid); } catch(e) {}
  }
  _badgeEnhanceState = { title, selectedOrb: null };
  _renderBadgeEnhanceModal();
}

function _renderBadgeEnhanceModal() {
  document.getElementById('badge-enhance-modal')?.remove();
  const { title, selectedOrb } = _badgeEnhanceState;
  const level = _getBadgeLevel(title);
  const inv = _gachaItems || {};
  const orbs = Object.entries(BADGE_ENHANCE_ORBS).map(([id, info]) => ({
    id, ...info, qty: inv[id] || 0,
  }));
  const canStart = !!selectedOrb && level < BADGE_MAX_LEVEL && (BADGE_ENHANCE_ORBS[selectedOrb]?.maxLvAllowed > level);
  const lvMaxNotice = level >= BADGE_MAX_LEVEL
    ? '<div style="color:#ef4444;font-weight:700;font-size:11px;text-align:center;margin-top:4px">最大レベルに達しています</div>'
    : '';

  const html = `
    <div id="badge-enhance-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10001;display:flex;align-items:center;justify-content:center;padding:14px"
      onclick="if(event.target===this)document.getElementById('badge-enhance-modal').remove()">
      <div style="background:linear-gradient(160deg,#1a1330,#2a1a4a);border:2px solid #f59e0b;border-radius:16px;padding:20px 22px;max-width:400px;width:100%;box-shadow:0 0 30px rgba(245,158,11,.4)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="color:#fbbf24;font-weight:900;font-size:15px;letter-spacing:1px"><i class="ti ti-arrow-up-circle"></i> 強化</div>
          <button onclick="document.getElementById('badge-enhance-modal').remove()" style="background:none;border:none;font-size:20px;color:#fde68a;cursor:pointer">×</button>
        </div>

        <!-- 効果プレビュー -->
        ${(() => {
          const eff = _badgeEffectValue(title);
          const def = BADGE_EFFECT_DEFS[eff.type];
          if (!def || !eff.value) return '';
          // 次レベル時の値
          const info = Object.values(TITLE_INFO).find(t => t.title === title);
          const rar = info?.rarity || 'SR';
          const base = BADGE_EFFECT_BASE[rar]?.[eff.type] || 0;
          const nextVal = (eff.type === 'stats_unlock' || eff.type === 'fav_slot' || eff.type === 'badge_slot')
            ? base : Math.round(base * (1 + (level+1) * 0.1));
          return `<div style="background:rgba(0,0,0,.25);border:1px solid ${def.color}55;border-radius:10px;padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px">
            <i class="ti ${def.icon}" style="font-size:22px;color:${def.color}"></i>
            <div style="flex:1">
              <div style="color:${def.color};font-size:11px;font-weight:700">${def.label}</div>
              <div style="color:#fde68a;font-size:13px;font-weight:900">
                ${eff.value > 0 ? '+' : ''}${eff.value}${def.unit}
                ${level < BADGE_MAX_LEVEL && nextVal !== eff.value ? `<span style="color:#10b981;font-size:11px;margin-left:6px">→ +${nextVal}${def.unit}</span>` : ''}
              </div>
            </div>
          </div>`;
        })()}

        <!-- 対象バッジ + 強化素材スロット -->
        <div class="enhance-stage" style="position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:14px;padding:14px 8px;background:rgba(0,0,0,.3);border-radius:10px;margin-bottom:10px">
          <div style="text-align:center">
            <div style="min-width:70px">${_titleBadgeCardHTML(title)}</div>
            <div style="margin-top:6px;color:#fbbf24;font-weight:900;font-size:13px">
              <span class="rarity-${_getBadgeRarity(title).toLowerCase()}" style="font-size:10px;padding:1px 5px;margin-right:4px">${_getBadgeRarity(title)}</span>${level > 0 ? `+${level}` : '+0'}
            </div>
            <div style="margin-top:2px;color:#fde68a;font-size:10px">現在</div>
          </div>
          <div style="font-size:24px;color:#fbbf24;font-weight:900">+</div>
          <div id="badge-enhance-orb-slot" style="width:70px;height:90px;border:2px dashed ${selectedOrb?BADGE_ENHANCE_ORBS[selectedOrb].color:'#fbbf24'};border-radius:10px;display:flex;align-items:center;justify-content:center;text-align:center;background:rgba(0,0,0,.2);cursor:pointer"
            onclick="${selectedOrb?'_clearEnhanceOrb()':''}">
            ${selectedOrb ? `
              <div style="font-size:11px;font-weight:900;color:${BADGE_ENHANCE_ORBS[selectedOrb].color};padding:6px 4px;line-height:1.3;text-align:center">
                <div class="enhance-orb ${BADGE_ENHANCE_ORBS[selectedOrb].orbClass}" style="margin:0 auto 4px"></div>
                ${(BADGE_ENHANCE_ORBS[selectedOrb].rate*100)|0}%
              </div>
            ` : '<div style="color:#fde68a;opacity:.5;font-size:11px">素材を<br>選択</div>'}
          </div>
        </div>
        ${selectedOrb ? `
          <div style="text-align:center;color:#fde68a;font-size:11px;margin-bottom:6px">
            ${BADGE_ENHANCE_ORBS[selectedOrb].label}（成功時 +1）
          </div>
        ` : ''}
        ${lvMaxNotice}

        <!-- 強化開始ボタン -->
        <button onclick="doBadgeEnhance()" ${canStart ? '' : 'disabled'}
          style="width:100%;padding:14px;border-radius:10px;border:none;font-size:15px;font-weight:900;cursor:${canStart?'pointer':'not-allowed'};
            background:${canStart?'linear-gradient(135deg,#fbbf24,#b45309)':'rgba(100,100,100,.3)'};
            color:${canStart?'#1f1206':'#888'};
            box-shadow:${canStart?'0 4px 14px rgba(251,191,36,.4)':'none'};
            margin-bottom:14px">
          ${canStart ? '⚡ 強化開始' : (level >= BADGE_MAX_LEVEL ? '最大レベル' : '素材を選択してください')}
        </button>

        <!-- 所持オーブ一覧 -->
        <div style="color:#fde68a;font-size:11px;font-weight:700;margin-bottom:6px">所持オーブ</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${orbs.map(orb => {
            const lvOK = orb.maxLvAllowed > level;
            const usable = orb.qty > 0 && lvOK && level < BADGE_MAX_LEVEL;
            const selected = selectedOrb === orb.id;
            return `<button onclick="_selectEnhanceOrb('${orb.id}')" ${usable ? '' : 'disabled'}
              style="padding:10px 6px;border-radius:10px;border:2px solid ${selected ? orb.color : (usable ? 'var(--border)' : 'rgba(255,255,255,.1)')};
                background:${selected ? `linear-gradient(135deg,${orb.color}33,${orb.color}11)` : (usable ? 'var(--bg2)' : 'rgba(0,0,0,.2)')};
                color:${usable ? '#fde68a' : '#666'};
                cursor:${usable ? 'pointer' : 'not-allowed'};
                opacity:${usable ? 1 : 0.5};
                text-align:center;font-size:11px;font-weight:700">
              <div class="enhance-orb ${orb.orbClass}" style="margin:0 auto 3px"></div>
              <div>${(orb.rate*100)|0}%</div>
              <div style="font-size:9px;opacity:.7">残${orb.qty}</div>
              ${!lvOK && orb.qty > 0 ? `<div style="font-size:8px;color:#ef4444;margin-top:2px">+${orb.maxLvAllowed}まで</div>` : ''}
            </button>`;
          }).join('')}
        </div>
        <div style="font-size:10px;color:var(--text3);text-align:center;margin-top:10px">
          オーブはガチャで獲得できます<br>
          <span style="color:#3b82f6">30%</span>=どんなレベルでも / <span style="color:#a855f7">60%</span>=+10まで / <span style="color:#f59e0b">90%</span>=+3まで
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function _selectEnhanceOrb(orbId) {
  _badgeEnhanceState.selectedOrb = orbId;
  _renderBadgeEnhanceModal();
}
function _clearEnhanceOrb() {
  _badgeEnhanceState.selectedOrb = null;
  _renderBadgeEnhanceModal();
}

// 強化演出（モーダルの「ステージ」枠内に限定 / 豪華演出）
async function _playEnhanceAnimation(result, failPenalty = 1) {
  const modal = document.getElementById('badge-enhance-modal');
  if (!modal) return;
  // バッジ + オーブの「ステージ」要素を取得
  const stage = modal.querySelector('.enhance-stage');
  if (!stage) return;
  const slot  = document.getElementById('badge-enhance-orb-slot');
  const badgeWrap = stage.querySelector('.title-badge-display-card')?.parentElement;

  // ① オーブが光って吸い込まれる
  if (slot) {
    slot.style.transition = 'transform .55s cubic-bezier(.4,0,.6,1), opacity .55s, filter .55s';
    slot.style.transform = 'translateX(-70px) scale(.35) rotate(-30deg)';
    slot.style.opacity   = '.1';
    slot.style.filter    = 'brightness(2.5) drop-shadow(0 0 16px #fbbf24)';
  }
  if (badgeWrap) {
    badgeWrap.style.transition = 'transform .35s ease-out, filter .35s';
    badgeWrap.style.transform = 'scale(1.12)';
    badgeWrap.style.filter = 'brightness(1.5) drop-shadow(0 0 18px #fbbf24)';
  }
  await new Promise(r => setTimeout(r, 420));

  // ② 期待ため
  if (badgeWrap) {
    badgeWrap.style.animation = 'enhanceShake .35s linear 2';
  }
  await new Promise(r => setTimeout(r, 700));

  // ③ ステージ内に結果オーバーレイを挿入（枠内限定）
  stage.insertAdjacentHTML('beforeend', `
    <div id="enhance-result-overlay" class="enhance-fx enhance-fx-${result}">
      <div class="enhance-fx-rays"></div>
      <div class="enhance-fx-flash"></div>
      <div class="enhance-fx-frame"></div>
      <div class="enhance-fx-text">
        ${result === 'great'
          ? '<div class="enhance-text-crown">👑</div><div class="enhance-text-big">大成功</div><div class="enhance-text-sub">★ RARITY UP ★</div>'
          : result === 'success'
          ? '<div class="enhance-text-big">成功</div><div class="enhance-text-sub">+1</div>'
          : `<div class="enhance-text-big">失敗</div><div class="enhance-text-sub">${failPenalty > 0 ? '−' + failPenalty : '±0'}</div>`}
      </div>
      ${result !== 'fail' ? _enhanceSparkles(result) : ''}
    </div>
  `);
  await new Promise(r => setTimeout(r, 1100));

  // クリーンアップ
  document.getElementById('enhance-result-overlay')?.remove();
  if (badgeWrap) {
    badgeWrap.style.animation = '';
    badgeWrap.style.transition = '';
    badgeWrap.style.transform = '';
    badgeWrap.style.filter = '';
  }
}
function _enhanceSparkles(result) {
  const palette = result === 'great'
    ? ['#fbbf24', '#fde68a', '#ef4444', '#c026d3', '#ffffff']
    : ['#10b981', '#34d399', '#fbbf24', '#ffffff'];
  const count = result === 'great' ? 30 : 18;
  let html = '';
  for (let i = 0; i < count; i++) {
    const col = palette[i % palette.length];
    // 中央から放射状に飛び散る（ステージ枠内に収まる範囲）
    const angle = (i / count) * Math.PI * 2 + (Math.random() - .5) * .6;
    const dist  = 50 + Math.random() * 80;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const rot = (Math.random() * 720 - 360);
    const del = Math.random() * 200 | 0;
    html += `<i class="enhance-sparkle" style="background:${col};--tx:${tx}px;--ty:${ty}px;--ang:${rot}deg;animation-delay:${del}ms"></i>`;
  }
  return html;
}

async function doBadgeEnhance() {
  const { title, selectedOrb } = _badgeEnhanceState;
  if (!title || !selectedOrb) return;
  const orb = BADGE_ENHANCE_ORBS[selectedOrb];
  if (!orb) return;
  const level = _getBadgeLevel(title);
  if (level >= BADGE_MAX_LEVEL) { showToast('最大レベルです', 'info'); return; }
  if (orb.maxLvAllowed <= level) { showToast('このオーブは現在のレベルで使用できません', 'warn'); return; }

  // オーブ消費
  const aid = localStorage.getItem('trendy_account_id');
  if (aid) {
    try { await dbConsumeItem(aid, selectedOrb, 1); } catch(e) {}
    try { _gachaItems = await dbGetUserItems(aid); } catch(e) {}
  }

  // 確率判定（オーブ名通り：大成功 = rate × 5% / 成功 = rate × 95% / それ以外 = 失敗）
  const roll = Math.random();
  let result;
  if (roll < orb.rate * 0.05) result = 'great';
  else if (roll < orb.rate)   result = 'success';
  else                        result = 'fail';

  // 演出：オーブが吸い込まれてバッジに飛ぶ → 期待ためダブり振動 → 結果フラッシュ
  await _playEnhanceAnimation(result, orb.failPenalty ?? 1);

  let newLevel = level;
  let msg = '';
  let toastType = 'success';
  const curRarity = _getBadgeRarity(title);
  if (result === 'great') {
    if (!_isMaxRarity(curRarity)) {
      // レアリティ昇格、レベルは据え置き
      const newRar = _ascendRarity(curRarity);
      _setBadgeRarity(title, newRar);
      msg = `🌟 大成功！レアリティ ${curRarity} → ${newRar} に昇格！（+${level} 据え置き）`;
    } else {
      // LG（カンスト）なら +2 レベル
      newLevel = Math.min(BADGE_MAX_LEVEL, level + 2);
      _setBadgeLevel(title, newLevel);
      msg = `🌟 大成功！LG +${level} → +${newLevel}（+2）`;
    }
  } else if (result === 'success') {
    newLevel = Math.min(BADGE_MAX_LEVEL, level + 1);
    _setBadgeLevel(title, newLevel);
    msg = `✨ 成功！「${title}」が +${level} → +${newLevel}`;
  } else {
    const penalty = orb.failPenalty ?? 2;
    newLevel = Math.max(0, level - penalty);
    _setBadgeLevel(title, newLevel);
    msg = penalty === 0
      ? `💔 失敗… レベル維持（+${level}）`
      : `💔 失敗… +${level} → +${newLevel}（-${penalty}）`;
    toastType = 'error';
  }
  showToast(msg, toastType);
  // オーブ選択は維持（連続強化可能）。ただし在庫切れ・レベル制限超過時は解除
  const inv = _gachaItems || {};
  const stillUsable = _badgeEnhanceState.selectedOrb
    && (inv[_badgeEnhanceState.selectedOrb] || 0) > 0
    && BADGE_ENHANCE_ORBS[_badgeEnhanceState.selectedOrb].maxLvAllowed > newLevel;
  if (!stillUsable) _badgeEnhanceState.selectedOrb = null;
  _renderBadgeEnhanceModal();
  // 一覧側の表示を更新
  if (typeof _renderGachaTitleBadgesSection === 'function') {
    _renderGachaTitleBadgesSection();
  }
  // 表示スロットも再描画
  if (typeof _renderBadgesDisplaySlots === 'function') {
    _renderBadgesDisplaySlots();
  }
}

/** ガチャ称号バッジを表示スロットに追加/削除（toggle） */
async function toggleTitleBadgeSlot(title) {
  const slotId = 'title:' + title;
  const ids = _loadDisplayBadgeIds();

  if (ids.includes(slotId)) {
    // 既に入っている → 外す
    const newIds = ids.map(i => i === slotId ? null : i);
    _saveDisplayBadgeIds(newIds);
    showToast(`称号「${title}」を外しました`, 'info');
  } else {
    // 空きスロットに追加
    const emptyIdx = ids.findIndex(i => !i);
    if (emptyIdx === -1) {
      showToast('バッジ枠が満杯です。先に他のバッジを外してください', 'error');
      return;
    }
    ids[emptyIdx] = slotId;
    _saveDisplayBadgeIds(ids);
    showToast(`称号「${title}」をバッジ枠に追加しました`, 'success');
  }

  // myTitleBadge との同期（後方互換）
  const remainingTitles = _loadDisplayBadgeIds().filter(i => typeof i === 'string' && i.startsWith('title:'));
  myTitleBadge = remainingTitles.length ? remainingTitles[0].slice(6) : '';
  localStorage.setItem('trendy_title_badge', myTitleBadge);
  const aid = localStorage.getItem('trendy_account_id');
  if (aid) {
    try { await db.from('profiles').update({ title_badge: myTitleBadge || null, display_badges: _loadDisplayBadgeIds() }).eq('account_id', aid); } catch(e) {}
  }

  // 再描画
  _renderGachaTitleBadgesSection();
  _renderBadgesDisplaySlots();
  _renderDisplayBadges();
}

function _renderBadgesDisplaySlots() {
  const el  = document.getElementById('badge-display-slots');
  if (!el) return;
  const ids    = _loadDisplayBadgeIds();
  const earned = _loadEarnedBadges();
  el.innerHTML = [0,1,2].map(i => {
    const bid = ids[i];
    // ガチャ称号バッジ
    if (typeof bid === 'string' && bid.startsWith('title:')) {
      const title = bid.slice(6);
      return `<div class="badge-dslot badge-dslot--filled" onclick="toggleTitleBadgeSlot('${title.replace(/'/g, "\\'")}')">
        ${_titleBadgeCardHTML(title)}
        <div class="badge-dslot-remove">タップで外す</div>
      </div>`;
    }
    // ランキング入賞バッジ
    const badge = bid ? earned.find(b => b.id === bid) : null;
    if (badge) {
      return `<div class="badge-dslot badge-dslot--filled" onclick="toggleBadgeSelect('${badge.id}')">
        ${_renderBadgeCard(badge, true, true)}
        <div class="badge-dslot-remove">タップで外す</div>
      </div>`;
    }
    return `<div class="badge-dslot badge-dslot--empty">
      <i class="ti ti-medal" style="font-size:24px;color:var(--text3)"></i>
      <span style="font-size:11px;color:var(--text3)">スロット ${i+1}</span>
    </div>`;
  }).join('');
}

function _renderBadgesGrid() {
  const grid  = document.getElementById('badge-grid');
  const empty = document.getElementById('badge-empty');
  if (!grid) return;

  let list = _loadEarnedBadges();
  const ids = _loadDisplayBadgeIds();

  // フィルター
  if (_badgeFilterMode !== 'all') {
    if (['gold','silver','bronze','rookie'].includes(_badgeFilterMode)) {
      list = list.filter(b => b.tier === _badgeFilterMode);
    } else if (_badgeFilterMode === 'global') {
      list = list.filter(b => b.scopeType === 'global' && b.tier !== 'rookie');
    } else if (_badgeFilterMode === 'pref') {
      list = list.filter(b => b.scopeType === 'pref');
    }
  }
  // 検索
  if (_badgeSearchQuery) {
    const q = _badgeSearchQuery.toLowerCase();
    list = list.filter(b =>
      b.catName.toLowerCase().includes(q) ||
      b.scopeName.toLowerCase().includes(q) ||
      _ymLabel(b.ym).includes(q) ||
      String(b.rank).includes(q)
    );
  }

  if (!list.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  grid.innerHTML = list.map(b => _renderBadgeCard(b, ids.includes(b.id))).join('');
}

/** フィルターピル切替 */
function setBadgeFilter(mode, btn) {
  _badgeFilterMode = mode;
  document.querySelectorAll('.badge-fpill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _renderBadgesGrid();
}

/** 検索入力 */