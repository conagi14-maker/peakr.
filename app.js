// ── 公開URL ─────────────────────────────────────────────
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
      // 推しレベル更新（推しユーザーの投稿のみ）
      if (t && t.user && t.user.h && typeof dbUpdateFanLevel === 'function') {
        const authorId = t.user.h.startsWith('@') ? t.user.h.slice(1) : t.user.h;
        if (_isFavUser(authorId)) dbUpdateFanLevel(aid, authorId, 'view', 1);
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
/** テキスト内の URL をクリッカブルリンクに変換 */
function _linkify(text) {
  if (!text) return '';
  return text.replace(/(https?:\/\/[^\s<>"]+)/g, url =>
    `<a href="${encodeURI(url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="tweet-link">${url}</a>`
  );
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
  if (id === 'home')      { _refreshHomeFeedFromDB(); _checkAnnouncementBadge(); }
  if (id === 'mypage')    {
    _refreshMypageStats(); loadUserFavorites(); _loadMypageSocialLinks(); _updateMypageMeta(); _renderDisplayBadges();
    const _le = document.getElementById('mypage-like-emoji-current');
    if (_le) _le.textContent = myLikeEmoji;
    // 非同期処理完了後にサブモードUIを再適用（カバー・カテゴリー・名前タグ等）
    setTimeout(() => selectAccount(myAccountType), 150);
  }
  if (id === 'ranking')   { _updateRankRegionChip(); _loadRankData().then(() => { renderCatGrid(); renderAdStrip(); }); syncExternalPosts(); syncPixivPosts(); }
  if (id === 'recommend') _initRecommendPage();
  if (id === 'ads') renderAdsPage();
  if (id === 'ad-create') renderAdCreatePage();
  if (id === 'ad-boost')  renderAdBoostPage();
  if (id === 'ad-list')   renderAdListPage();
  if (id === 'ad-report') renderAdReportPage();
  if (id === 'peak-points') renderPeakPointsPage();
  if (id === 'feedback') openFeedbackPage();
  if (id === 'gacha')    renderGachaPage();
  if (id === 'dev-gacha') { renderDevGachaList(); setTimeout(() => _loadCutinRatesUI(), 100); }
  if (id === 'follows') renderFollows();
  if (id === 'settings') { renderCatSettings(); _loadDmSettingsIntoUI(); _initSettingsRegionBtns(); }
  if (id === 'acct-switch') renderAcctSwitch();
  if (id === 'notif') { _notifPageTab = 'notif'; renderNotifs(); switchNotifPageTab('notif'); }
  if (id === 'favs') { _syncFavFromSupabase(); initFavsPage(); }
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
    ${_tweetAvHtml('tweet-av clickable', `background:${u.bg};color:${u.tc};overflow:hidden`, u.av, u, `openUserPage('${u.h}')`)}
    <div class="tweet-body">
      <div class="tweet-top">
        <span class="tweet-name clickable" onclick="openUserPage('${u.h}')">${u.n}</span>
        ${u.nameTag ? `<span class="tweet-name-tag">＠${u.nameTag}</span>` : ''}
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
            ? `<div class="tweet-media">${t.imageLinkUrl
                ? `<a href="${encodeURI(t.imageLinkUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"><img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" style="cursor:pointer"></a>`
                : `<img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" onclick="event.stopPropagation();openImageViewer(this.src)">`
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
}

// ── おすすめページ初期化 ────────────────────────────────
function _initRecommendPage() {
  // ページを開くたびにリセットして読み込む
  RECOMMEND_TWEETS = [];
  _recommendRawTweets = [];
  recommendLoaded  = 0;
  recommendSearchQuery = '';
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

// ── ダイブ キーワード検索 ───────────────────────────────────
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
  if (!q) return result;
  return result.filter(t =>
    (t.text  || '').toLowerCase().includes(q) ||
    (t.user?.n || '').toLowerCase().includes(q) ||
    (t.user?.h || '').toLowerCase().includes(q) ||
    (t.tags || []).some(tag => tag.toLowerCase().includes(q))
  );
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
    const aid = localStorage.getItem('trendy_account_id');
    if (aid) {
      const ids = await dbFetchFollowers(aid);
      _followerHandleSet = new Set(ids.map(id => '@' + id));
    } else {
      _followerHandleSet = new Set();
    }
  }
  // ロード済みデータがあればリアルタイムで再フィルター
  if (_recommendRawTweets.length > 0) {
    RECOMMEND_TWEETS = _applyDiveSearchFilter(_recommendRawTweets);
    recommendLoaded  = 0;
    const reel = document.getElementById('recommend-reel');
    if (reel) reel.innerHTML = '';
    if (RECOMMEND_TWEETS.length === 0) {
      if (reel) reel.innerHTML = `<div class="reel-empty"><i class="ti ti-mood-empty" style="font-size:36px;color:var(--text3)"></i><p>該当する投稿がありません</p></div>`;
    } else {
      _renderRecommendSlice();
      _initReelVideoObserver();
      _initReelInfiniteScroll();
    }
    _fitReelHeight();
  }
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
    let query = db.from('posts').select('*').order('likes_count', { ascending: false }).limit(300);
    // カテゴリーフィルター
    if (recommendCatFilter && recommendCatFilter !== 'all') {
      query = query.eq('cat_id', recommendCatFilter);
    }
    // コンテンツタイプ複数選択フィルター（空 = すべて表示）
    if (homeMediaFilters.size > 0) {
      const orParts = [];
      if (homeMediaFilters.has('text'))  orParts.push('and(media_type.is.null,ext_source.is.null)');
      // 画像: media_type=image かつ YouTube/Shorts以外（ext_source is null）
      if (homeMediaFilters.has('image')) orParts.push('and(media_type.eq.image,ext_source.is.null)');
      // 動画: media_type=video または YouTube/Shorts
      if (homeMediaFilters.has('video')) orParts.push('media_type.eq.video,ext_source.eq.youtube,ext_source.eq.shorts');
      if (orParts.length > 0) query = query.or(orParts.join(','));
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
      </div>
    </div>`;
}

function _reelCardHTML(group) {
  if (group.type === 'image') {
    const t = group.item;
    const idx = _reg(t);
    const imgClick = t.imageLinkUrl
      ? `onclick="event.stopPropagation();window.open('${encodeURI(t.imageLinkUrl)}','_blank','noopener,noreferrer')"`
      : `onclick="event.stopPropagation();openImageViewer(this.src)"`;
    return `<div class="reel-card reel-card--image" data-idx="${idx}" data-db-id="${t.db_id||''}">
      <img class="reel-bg-blur" src="${t.mediaData}" aria-hidden="true">
      <img class="reel-main-img" src="${t.mediaData}" style="${t.imageLinkUrl ? 'cursor:pointer' : ''}" ${imgClick}>
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
        <img src="${t.mediaData}" class="reel-yt-thumb-img" alt="${t.text}">
        <div class="reel-yt-play-btn"><i class="ti ti-player-play-filled"></i></div>
        <span class="reel-yt-src-badge ctm-ext-badge ctm-ext-${t.extSource}">${_extSourceLabel(t.extSource)}</span>
      </div>
      <!-- プレイヤー（タップ後に差し替え） -->
      <iframe class="reel-yt-iframe" style="display:none;position:absolute;top:0;left:0;width:100%;height:60%;border:none" allowfullscreen allow="autoplay;encrypted-media;picture-in-picture"></iframe>
      <!-- 情報バー -->
      <div class="reel-yt-info">
        <div class="reel-yt-channel" onclick="event.stopPropagation();window.open('${t.extUrl}','_blank','noopener,noreferrer')">${t.user?.n || ''}</div>
        <div class="reel-yt-title" onclick="event.stopPropagation();window.open('${t.extUrl}','_blank','noopener,noreferrer')">${t.text || ''}</div>
        <div class="reel-yt-actions">
          <button class="reel-action-btn" onclick="event.stopPropagation();openTweetDetail(${idx})">
            <i class="ti ti-message-circle"></i><span>${(tweetReplies[idx]||[]).length||0}</span>
          </button>
          <button class="reel-action-btn${liked?' reel-liked':''}" id="reel-like-${idx}" onclick="event.stopPropagation();_reelToggleLike(${idx})">
            ${t.likeEmoji ? `<span class="like-emoji-display">${t.likeEmoji}</span>` : `<i class="ti ti-heart${liked?'-filled':''}" ${liked?'style="color:#ef4444"':''}></i>`}<span id="reel-lc-${idx}">${fmt(t.likes)}</span>
          </button>
          <span class="reel-action-btn reel-stat"><i class="ti ti-eye"></i>${fmt(t.views)}</span>
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
    dbToggleLike(t.db_id, aid, nowLiked, t.user && t.user.h, _isFavUser(_likeAuthorId));
    // いいねでピークコイン +10
    if (nowLiked && aid && typeof dbAddPoints === 'function') {
      dbAddPoints(aid, 10).then(() => { _loadMyPoints?.(); }).catch(() => {});
    }
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
    }
  });
  recommendLoaded += slice.length;

  // ダイブ閲覧でピークコイン +1/件（新規分のみ）
  if (newSeenCount > 0 && !recommendSearchQuery.trim()) {
    const aid = localStorage.getItem('trendy_account_id');
    if (aid && typeof dbAddPoints === 'function') {
      dbAddPoints(aid, newSeenCount).then(() => {
        _myPoints += newSeenCount;
        // ガチャページのコイン表示も更新
        const coinEl = document.getElementById('gacha-ticket-count');
        if (coinEl) coinEl.textContent = _myPoints.toLocaleString();
      }).catch(() => {});
    }
  }
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
    // 添付メディア
    mediaData   : pendingMedia ? pendingMedia.data : null,
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
  // マイページ・ランキングに即反映
  renderMyPosts();
  renderMyRank();
  // ── リセット前に必要な値をキャプチャ ──────────────────────────────
  // ※ pendingMedia / pendingCatId / pendingTags はリセットブロックで
  //   null / [] になるため、DB保存に使う値を先に変数へ退避する
  const _mediaData     = pendingMedia ? pendingMedia.data : null;
  const _mediaType     = pendingMedia ? pendingMedia.type : null;
  const _catId         = pendingCatId || '';
  const _tags          = [...pendingTags];
  const _linkUrl       = pendingUrl      || '';
  const _imageLinkUrl  = pendingImageUrl || '';

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
  // 投稿でピークコイン +100
  if (!testActiveUser && !isSub) {
    const _postAid = localStorage.getItem('trendy_account_id');
    if (_postAid && typeof dbAddPoints === 'function') {
      dbAddPoints(_postAid, 100).then(() => {
        _loadMyPoints?.();
        showToast('🪙 ピークコインを100獲得しました！', 'success');
      }).catch(() => {});
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
      // 画像URLリセット
      pendingImageUrl = null;
      const imgUrlInp = document.getElementById('compose-imgurl-input');
      if (imgUrlInp) imgUrlInp.value = '';
      document.getElementById('compose-imgurl-row').style.display = '';
    } else {
      inner.innerHTML = `<video src="${pendingMedia.data}" class="compose-media-vid" controls preload="metadata"></video>`;
      document.getElementById('compose-imgurl-row').style.display = 'none';
    }
    preview.style.display = '';
    updateCompose();
  };
  reader.readAsDataURL(file);
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
  const avImg   = avatarMap[p.user_handle];
  const nameTag = p.name_tag || nameTagMap[p.user_handle] || null;
  const isExt = !!p.ext_source;
  const score = isExt
    // 外部投稿: 閲覧数・BM数ベースのスコア
    ? (p.ext_pop_score || 0)
    // 内部投稿: エンゲージメント倍率2倍 + ブーストスコア + ベースボーナス250点
    : (p.likes_count || 0) * 20 + (p.rt_count || 0) * 10 + ((p.views_count || 0) + (p.boost_score || 0)) * 2 + 250;
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
  try { return JSON.parse(localStorage.getItem('trendy_display_badges') || '[null,null,null]'); } catch(e) { return [null,null,null]; }
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
function _renderDisplayBadges() {
  const ids    = _loadDisplayBadgeIds();
  const earned = _loadEarnedBadges();
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById(`dbadge-${i}`);
    if (!el) continue;
    const bid   = ids[i];
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
    const displayed = ids.map(bid => bid ? earned.find(b => b.id === bid) : null).filter(Boolean);
    preview.innerHTML = displayed.length
      ? displayed.map(b => _renderBadgeCard(b, false, true)).join('')
      : `<span style="font-size:12px;color:var(--text3)">バッジが選択されていません</span>`;
  }
}

/** バッジ管理ページ描画 */
function renderBadgesPage() {
  _renderBadgesDisplaySlots();
  _renderBadgesGrid();
}

function _renderBadgesDisplaySlots() {
  const el  = document.getElementById('badge-display-slots');
  if (!el) return;
  const ids    = _loadDisplayBadgeIds();
  const earned = _loadEarnedBadges();
  el.innerHTML = [0,1,2].map(i => {
    const bid   = ids[i];
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
function filterBadges(q) {
  _badgeSearchQuery = q || '';
  _renderBadgesGrid();
}

/** （後方互換）同期呼び出し用スタブ → 非同期ロード後に再描画 */
function genRankTweets() {
  _loadRankData().then(() => { renderCatGrid(); });
}

const _EXT_SOURCE_LABELS = { nhk: 'NHK', pixiv: 'pixiv', x: 'X' };
function _extSourceLabel(src) { return _EXT_SOURCE_LABELS[src] || src; }

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
    const prefBadge = (t.prefRank && t.user?.region && !t.user?.sub)
      ? `<span class="rank-badge-pref">${_shortPref(t.user.region)}${t.prefRank}位</span>`
      : '';
    const rookieBadge = (t.user?.isRookie && !t.user?.sub)
      ? `<span class="rank-badge-rookie">🌱 NEW</span>`
      : '';
    const extBadgeHtml = t.extSource ? `<span class="ctm-ext-badge ctm-ext-${t.extSource}">${_extSourceLabel(t.extSource)}</span>` : '';
    const extIconHtml  = t.extUrl    ? `<i class="ti ti-external-link" style="font-size:9px;color:var(--text3);margin-left:2px;vertical-align:middle"></i>` : '';
    return `<div class="cat-tweet-mini${t.extSource ? ' cat-tweet-ext' : ''}" data-db-id="${t.db_id||''}" onclick="openTweetDetail(${idx})">
      <div class="ctm-top">
        <span class="rank-badge-card ${rc(i+1)}">#${i+1}</span>
        ${prefBadge}
        ${rookieBadge}
        ${prevBadge(t.prev)}
        ${extBadgeHtml}
      </div>
      <div class="ctm-author" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
        <span onclick="event.stopPropagation();${t.extUrl ? `window.open('${t.extUrl}','_blank','noopener,noreferrer')` : `openUserPage('${u.h||''}')`}" style="cursor:pointer;display:inline-flex;align-items:center;gap:5px">
          ${avHtml}
          <span class="ctm-author-name">${authorName}${extIconHtml}</span>
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
          ${t.likeEmoji ? `<span class="like-emoji-display">${t.likeEmoji}</span>` : `<i class="ti ti-heart${likedTweets.has(idx)?'-filled':''}" style="${likedTweets.has(idx)?'color:#e11d48':''}"></i>`}<span class="like-count">${fmt(t.likes)}</span>
        </button>
        <span class="ctm-stat"><i class="ti ti-eye"></i>${fmt(t.views)}</span>
        ${fsFavBtn(idx)}
      </div>
      <div class="score-bar"><div class="score-fill" style="width:${pct}%;background:${bar}"></div></div>
    </div>`;
  }).join('');
}

/** スコア順に並んだ投稿配列から都道府県別順位マップを生成
 *  @returns {Object} db_id → prefRank (1始まり) */
function _computePrefRanks(sortedPosts) {
  const prefCount = {};
  const map = {};
  sortedPosts.forEach(t => {
    const pref = t.user?.region;
    if (!pref) return;
    prefCount[pref] = (prefCount[pref] || 0) + 1;
    map[t.db_id] = prefCount[pref];
  });
  return map;
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
      const subSorted = [...subFiltered].sort((a, b) => (b.score - a.score) || (b.db_id > a.db_id ? -1 : 1));
      const subPrefRanks = _computePrefRanks(subSorted);
      const tweets = subSorted
        .slice(0, 10)
        .map((t, i) => ({ ...t, rank: i + 1, prev: '初登場', prefRank: subPrefRanks[t.db_id] || null }));

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
      const mainSorted = [...filtered].sort((a, b) => (b.score - a.score) || (b.db_id > a.db_id ? -1 : 1));
      const mainPrefRanks = _computePrefRanks(mainSorted);
      const tweets = mainSorted
        .slice(0, 10)
        .map((t, i) => ({ ...t, rank: i + 1, prev: '初登場', prefRank: mainPrefRanks[t.db_id] || null }));

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
        ${fsFavBtn(idx)}
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


// ── 地域絞り込みモーダル ─────────────────────────────────

/** 地方区分データ */
const REGIONS_DATA = [
  { name: '北海道',     icon: '🏔️', prefs: ['北海道'] },
  { name: '東北',       icon: '⛩️', prefs: ['青森県','岩手県','宮城県','秋田県','山形県','福島県'] },
  { name: '関東',       icon: '🗼', prefs: ['茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県'] },
  { name: '中部',       icon: '🗻', prefs: ['新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県'] },
  { name: '近畿',       icon: '🦌', prefs: ['三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県'] },
  { name: '中国',       icon: '⛩️', prefs: ['鳥取県','島根県','岡山県','広島県','山口県'] },
  { name: '四国',       icon: '🍊', prefs: ['徳島県','香川県','愛媛県','高知県'] },
  { name: '九州・沖縄', icon: '🌺', prefs: ['福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'] },
];

let _rrStep = 'region';   // 'region' | 'pref'
let _rrSelectedRegion = null;

/** 地域チップのテキストを更新 */
function _updateRankRegionChip() {
  const chip  = document.getElementById('rank-region-chip-text');
  const clear = document.getElementById('rank-region-clear');
  if (!chip) return;
  if (rankPrefecture === '全国') {
    chip.textContent = '全国';
    if (clear) clear.style.display = 'none';
  } else {
    chip.textContent = rankPrefecture;
    if (clear) clear.style.display = '';
  }
}

/** モーダルを開く */
function openRankRegionModal() {
  _rrStep = 'region';
  _rrSelectedRegion = null;
  _renderRRModal();
  document.getElementById('rank-region-overlay').classList.add('show');
  document.getElementById('rank-region-modal').classList.add('show');
}

/** モーダルを閉じる */
function closeRankRegionModal() {
  document.getElementById('rank-region-overlay').classList.remove('show');
  document.getElementById('rank-region-modal').classList.remove('show');
}

/** 絞り込みをリセット */
async function clearRankRegion() {
  rankPrefecture = '全国';
  _rankCache = { period: null, data: [], fetchedAt: 0 };
  _updateRankRegionChip();
  await _loadRankData(true);
  renderCatGrid();
}

/** モーダル内容を描画 */
function _renderRRModal() {
  const title = document.getElementById('rank-region-modal-title');
  const bc    = document.getElementById('rank-region-breadcrumb');
  const body  = document.getElementById('rank-region-modal-body');
  if (!body) return;

  if (_rrStep === 'region') {
    if (title) title.innerHTML = '<i class="ti ti-map-pin"></i> 地方を選ぶ';
    if (bc) bc.innerHTML = '';
    body.innerHTML = `
      <button class="rr-item rr-item--all" onclick="_rrPickAll()">
        <span class="rr-item-icon">🗾</span>
        <span class="rr-item-name">全国（絞り込みなし）</span>
      </button>
      ${REGIONS_DATA.map(r => `
        <button class="rr-item" onclick="_rrPickRegion('${r.name}')">
          <span class="rr-item-icon">${r.icon}</span>
          <span class="rr-item-name">${r.name}</span>
          <span class="rr-item-count">${r.prefs.length}都道府県</span>
          <i class="ti ti-chevron-right rr-item-arrow"></i>
        </button>`).join('')}`;

  } else if (_rrStep === 'pref') {
    const rd = REGIONS_DATA.find(r => r.name === _rrSelectedRegion);
    if (title) title.innerHTML = `<i class="ti ti-map-pin"></i> 都道府県を選ぶ`;
    if (bc) bc.innerHTML = `
      <button class="rr-bc-btn" onclick="_rrBack('region')"><i class="ti ti-arrow-left"></i> 地方</button>
      <span class="rr-bc-sep">›</span>
      <span class="rr-bc-current">${_rrSelectedRegion}</span>`;
    body.innerHTML = `
      <button class="rr-item rr-item--all" onclick="_rrPickPrefAll()">
        <span class="rr-item-icon">📍</span>
        <span class="rr-item-name">${_rrSelectedRegion}全域</span>
      </button>
      ${(rd ? rd.prefs : []).map(p => `
        <button class="rr-item${rankPrefecture === p ? ' rr-item--active' : ''}" onclick="_rrPickPref('${p}')">
          <span class="rr-item-icon">🏙️</span>
          <span class="rr-item-name">${p}</span>
        </button>`).join('')}`;
  }
}

function _rrPickAll() {
  closeRankRegionModal();
  clearRankRegion();
}

function _rrPickRegion(name) {
  _rrSelectedRegion = name;
  const rd = REGIONS_DATA.find(r => r.name === name);
  if (rd && rd.prefs.length === 1) {
    // 北海道のように1つだけなら即適用
    rankPrefecture = rd.prefs[0];
    _applyRankRegion();
    return;
  }
  _rrStep = 'pref';
  _renderRRModal();
}

function _rrPickPrefAll() {
  // 地方全域（都道府県フィルタなし）→ 特定地方の全都道府県はフィルタ不可なのでリセット
  closeRankRegionModal();
  clearRankRegion();
}

function _rrPickPref(pref) {
  rankPrefecture = pref;
  _applyRankRegion();
}

function _rrBack(to) {
  _rrStep = to;
  if (to === 'region') rankPrefecture = '全国';
  _renderRRModal();
}

async function _applyRankRegion() {
  closeRankRegionModal();
  _updateRankRegionChip();
  _rankCache = { period: null, data: [], fetchedAt: 0 };
  await _loadRankData(true);
  renderCatGrid();
}

// 旧ピル関数（後方互換）
function renderRankPrefPills() { _updateRankRegionChip(); }
async function setRankPrefecture(pref) { rankPrefecture = pref; await _applyRankRegion(); }

// ── Favorites (お気に入り) ──────────────────────────────

/** localStorage からお気に入りデータを読み込む */
function _loadFavData() {
  try {
    const st = localStorage.getItem('trendy_saved_tweets');
    if (st) {
      savedTweets = JSON.parse(st);
      favDbIds.clear();
      savedTweets.forEach(s => {
        if (s.db_id) favDbIds.add(String(s.db_id));
        // 旧形式 (folder: string|null) → 新形式 (folders: string[]) へ移行
        if (!Array.isArray(s.folders)) {
          s.folders = s.folder ? [s.folder] : [];
          delete s.folder;
        }
      });
    }
    const ff = localStorage.getItem('trendy_fav_folders');
    if (ff) favFolders = JSON.parse(ff);
    const ft = localStorage.getItem('trendy_fav_folder_types');
    if (ft) favFolderTypes = JSON.parse(ft);
  } catch(e) {}
  // デフォルトフォルダーが存在しなければ先頭に追加
  let dirty = false;
  const missing = FAV_DEFAULT_FOLDERS.filter(f => !favFolders.includes(f));
  if (missing.length) { favFolders = [...missing, ...favFolders]; dirty = true; }
  // デフォルトフォルダーの表示タイプを保証
  Object.entries(FAV_DEFAULT_TYPES).forEach(([name, type]) => {
    if (!(name in favFolderTypes)) { favFolderTypes[name] = type; dirty = true; }
  });
  if (dirty) _saveFavData(true); // localStorageのみ（Supabase上書き防止）
}

/** Supabaseからお気に入りデータを取得してローカルに反映（バックグラウンド同期） */
let _lastFavSyncAt = 0;
const _FAV_SYNC_INTERVAL = 60_000; // 最短60秒に1回
async function _syncFavFromSupabase() {
  const _now = Date.now();
  if (_now - _lastFavSyncAt < _FAV_SYNC_INTERVAL) return; // クールダウン中
  _lastFavSyncAt = _now;
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || typeof dbLoadFavData !== 'function') return;
  const remote = await dbLoadFavData(aid);
  if (!remote || !Array.isArray(remote.saved_tweets)) return;

  // Supabaseのデータでローカルを上書き
  savedTweets = remote.saved_tweets;
  favDbIds.clear();
  savedTweets.forEach(s => {
    if (s.db_id) favDbIds.add(String(s.db_id));
    // 旧形式 (folder) → 新形式 (folders) 移行
    if (!Array.isArray(s.folders)) {
      s.folders = s.folder ? [s.folder] : [];
      delete s.folder;
    }
  });
  if (Array.isArray(remote.fav_folders)) {
    const missing = FAV_DEFAULT_FOLDERS.filter(f => !remote.fav_folders.includes(f));
    favFolders = [...missing, ...remote.fav_folders];
  }
  if (remote.fav_folder_types && typeof remote.fav_folder_types === 'object') {
    favFolderTypes = { ...FAV_DEFAULT_TYPES, ...remote.fav_folder_types };
  }
  _saveFavData(true); // localStorageのみ更新（Supabase再送不要）

  // ページが開いていれば再描画
  if (document.getElementById('page-favs')?.classList.contains('active'))   initFavsPage();
  if (document.getElementById('page-mypage')?.classList.contains('active')) renderMyFavs();
  console.log('[DB] お気に入り同期完了:', savedTweets.length, '件');
}

/** お気に入りデータを localStorage + Supabase に保存
 *  skipRemote=true のときはlocalStorageのみ（同期ループ防止用）
 */
function _saveFavData(skipRemote = false) {
  localStorage.setItem('trendy_saved_tweets',      JSON.stringify(savedTweets));
  localStorage.setItem('trendy_fav_folders',       JSON.stringify(favFolders));
  localStorage.setItem('trendy_fav_folder_types',  JSON.stringify(favFolderTypes));
  if (!skipRemote) {
    const aid = localStorage.getItem('trendy_account_id');
    if (aid && typeof dbSaveFavData === 'function') {
      dbSaveFavData(aid, savedTweets, favFolders, favFolderTypes).catch(() => {});
    }
  }
}

/** idx から tweet を取得してお気に入りをトグル */
function toggleFavByIdx(idx, btn) {
  const t = _tc[idx];
  if (!t || !t.db_id) { showToast('この投稿は保存できません', 'warn'); return; }
  const dbId = String(t.db_id);
  const nowSaved = !favDbIds.has(dbId);
  if (nowSaved) {
    // メディアタイプに応じてデフォルトフォルダーへ自動振り分け
    const autoFolder = t.mediaType === 'video' ? '動画'
                     : t.mediaType === 'image' ? 'イラスト'
                     : 'つぶやき';
    const entry = {
      saveId: `save_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      db_id: dbId, folders: [autoFolder], savedAt: Date.now(),
      text: t.text || '', user: { ...(t.user||{}) },
      likes: t.likes||0, rt: t.rt||0, views: t.views||0,
      mediaData: t.mediaData||null, mediaType: t.mediaType||null,
      linkUrl: t.linkUrl||null, imageLinkUrl: t.imageLinkUrl||null,
      catId: t.catId||null, tags: [...(t.tags||[])],
      time: t.time||'', ai: t.ai||'none', rank: t.rank||0,
    };
    savedTweets.unshift(entry);
    favDbIds.add(dbId);
    showToast('お気に入りに追加しました ⭐', 'success');
  } else {
    savedTweets = savedTweets.filter(s => String(s.db_id) !== dbId);
    favDbIds.delete(dbId);
    showToast('お気に入りを解除しました', 'info');
  }
  _saveFavData();
  // ボタン表示を更新（同じ投稿の全ボタン）
  _updateAllFavButtons(dbId, nowSaved);
  // favs ページが開いていれば再描画
  if (document.getElementById('page-favs')?.classList.contains('active')) renderFavsPage();
}

/** 旧 toggleFav / fsFavToggle の互換ラッパー（呼び出し残骸対策） */
function toggleFav(rank, btn)    { /* no-op: 新システムに移行済み */ }
function fsFavToggle(rank, btn)  { /* no-op: 新システムに移行済み */ }

/** 同じ db_id を持つ全ての☆ボタンの表示を更新 */
function _updateAllFavButtons(dbId, isSaved) {
  // _tc を走査して同じ db_id の idx を集める
  _tc.forEach((t, idx) => {
    if (!t.db_id || String(t.db_id) !== dbId) return;
    // action-btn (favStar)
    const star = document.querySelector(`.action-btn[onclick*="toggleFavByIdx(${idx},"]`);
    if (star) {
      star.classList.toggle('faved', isSaved);
      star.innerHTML = `<i class="ti ti-star${isSaved?'-filled':''}"></i>${isSaved?'登録済み':'お気に入り'}`;
    }
    // fs-fav-btn (fsFavBtn)
    const fsBtn = document.querySelector(`.fs-fav-btn[onclick*="toggleFavByIdx(${idx},"]`);
    if (fsBtn) {
      fsBtn.classList.toggle('on', isSaved);
      const ic = fsBtn.querySelector('i');
      if (ic) ic.className = `ti ti-star${isSaved?'-filled':''}`;
    }
  });
}

// ── お気に入りページ ────────────────────────────────────

/** ページを開いたときの初期化 */
function initFavsPage() {
  // カテゴリーセレクトを動的生成
  const catSel = document.getElementById('favs-cat-select');
  if (catSel && catSel.options.length <= 1) {
    CATS_DATA.filter(c => c.id !== 'all').forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.name;
      catSel.appendChild(o);
    });
  }
  renderFavsPage();
}

/** フォルダータブを描画 */
function _renderFavFolderTabs() {
  const wrap = document.getElementById('favs-folder-tabs');
  if (!wrap) return;
  const all = [null, ...favFolders];
  wrap.innerHTML = all.map(f => {
    const active = _favActiveFolder === f;
    const count  = f === null
      ? savedTweets.length
      : savedTweets.filter(s => (s.folders||[]).includes(f)).length;
    const label  = f === null ? 'すべて' : f;
    const typeIcon = f !== null
      ? `<i class="ti ti-${favFolderTypes[f]==='grid'?'layout-grid':'layout-list'}" style="font-size:11px;opacity:0.65"></i>`
      : `<i class="ti ti-bookmark" style="font-size:11px;opacity:0.65"></i>`;
    return `<button class="fav-folder-tab${active?' active':''}" onclick="_setFavFolder(${f===null?'null':`'${f}'`})">
      ${typeIcon}${label}
      <span class="fav-folder-count">${count}</span>
      ${f!==null && !FAV_DEFAULT_FOLDERS.includes(f)?`<span class="fav-folder-del" onclick="event.stopPropagation();deleteFavFolder('${f}')" title="削除"><i class="ti ti-x"></i></span>`:''}
    </button>`;
  }).join('');
}

function _setFavFolder(folder) {
  _favActiveFolder = folder;
  renderFavsPage();
}

/** お気に入りページ本体を描画 */
function renderFavsPage() {
  _renderFavFolderTabs();
  const feed    = document.getElementById('favs-feed');
  const search  = (document.getElementById('favs-search-input')?.value || '').toLowerCase().trim();
  const sort    = document.getElementById('favs-sort-select')?.value || 'new';
  const catFilter = document.getElementById('favs-cat-select')?.value || '';

  // フィルタリング
  let list = savedTweets.filter(s => {
    if (_favActiveFolder !== null && !(s.folders||[]).includes(_favActiveFolder)) return false;
    if (catFilter && s.catId !== catFilter) return false;
    if (search) {
      const hay = (s.text + ' ' + (s.user?.n||'') + ' ' + (s.user?.h||'') + ' ' + (s.tags||[]).join(' ')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // 並び替え
  if (sort === 'old')   list = [...list].reverse();
  if (sort === 'likes') list = [...list].sort((a,b) => (b.likes||0)-(a.likes||0));

  if (!list.length) {
    feed.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3)">
      <i class="ti ti-star" style="font-size:32px;display:block;margin-bottom:10px"></i>
      ${savedTweets.length === 0 ? 'お気に入りはまだありません<br><span style="font-size:12px">投稿の☆ボタンで保存できます</span>' : '条件に一致する投稿がありません'}
    </div>`;
    return;
  }
  // フォルダーの表示タイプを参照してグリッド/リスト切り替え
  const useGrid = _favActiveFolder !== null && favFolderTypes[_favActiveFolder] === 'grid';
  if (useGrid) {
    feed.innerHTML = `<div class="fav-grid">${list.map(s => _favGridCardHTML(s)).join('')}</div>`;
  } else {
    feed.innerHTML = list.map(s => _favCardHTML(s)).join('');
  }
}

/** お気に入りページのツイートカード */
function _favCardHTML(s) {
  const u = s.user || {};
  const avIsImg = typeof u.av === 'string' && u.av.startsWith('<img');
  const avStyle = avIsImg
    ? 'width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0'
    : `width:36px;height:36px;border-radius:50%;background:${u.bg||'#3b82f6'};color:${u.tc||'#fff'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0`;
  const folders = Array.isArray(s.folders) ? s.folders : (s.folder ? [s.folder] : []);
  const folderBadges = folders.length
    ? `<div class="fav-card-folder-badges">${folders.map(f =>
        `<span class="fav-card-folder-badge"><i class="ti ti-folder" style="font-size:9px"></i>${f}</span>`
      ).join('')}</div>`
    : '';
  const imgBlock = s.mediaData && s.mediaType === 'image'
    ? `<div class="tweet-media" style="margin:4px 0 6px" onclick="event.stopPropagation()">${s.imageLinkUrl
        ? `<a href="${encodeURI(s.imageLinkUrl)}" target="_blank" rel="noopener noreferrer"><img src="${s.mediaData}" class="tweet-media-img" style="cursor:pointer"></a>`
        : `<img src="${s.mediaData}" class="tweet-media-img" style="cursor:zoom-in" onclick="openImageViewer(this.src)">`}</div>`
    : s.mediaData && s.mediaType === 'video'
    ? `<div class="tweet-media" style="margin:4px 0 6px" onclick="event.stopPropagation()"><video src="${s.mediaData}" controls class="tweet-media-vid" preload="metadata"></video></div>`
    : '';
  return `<div class="tweet-card fav-tweet-card" style="cursor:pointer" onclick="openTweetDetailBySaveId('${s.saveId}')" data-save-id="${s.saveId}">
    <div style="${avStyle}">${u.av||'?'}</div>
    <div class="tweet-body">
      <div class="tweet-top">
        <span class="tweet-name">${u.sub?'匿名ユーザー':(u.n||'')}</span>
        ${u.nameTag?`<span class="tweet-name-tag">＠${u.nameTag}</span>`:''}
        <span class="tweet-handle">${u.h||''}</span>
        <span class="tweet-time">${s.time||''}</span>
      </div>
      ${folderBadges}
      ${s.text?`<div class="tweet-text" style="margin:4px 0">${_linkify(s.text)}</div>`:''}
      ${imgBlock}
      ${_urlBtnHTML(s.linkUrl)}
      <div class="fav-card-actions" onclick="event.stopPropagation()">
        <span style="font-size:12px;color:var(--text3)"><i class="ti ti-heart"></i>${fmt(s.likes||0)}</span>
        <span style="font-size:12px;color:var(--text3)"><i class="ti ti-eye"></i>${fmt(s.views||0)}</span>
        <button class="fav-card-btn" onclick="openFavFolderPicker('${s.saveId}')" title="フォルダーに移動"><i class="ti ti-folder-symlink"></i> フォルダー</button>
        <button class="fav-card-btn fav-card-btn-del" onclick="removeSavedTweet('${s.saveId}')" title="削除"><i class="ti ti-trash"></i></button>
      </div>
    </div>
  </div>`;
}

/** グリッド表示カード（イラスト・動画フォルダー用） */
function _favGridCardHTML(s) {
  const u = s.user || {};
  let thumb;
  if (s.mediaData && s.mediaType === 'image') {
    thumb = `<img src="${s.mediaData}" class="fav-grid-thumb" alt="thumbnail">`;
  } else if (s.mediaData && s.mediaType === 'video') {
    thumb = `<video src="${s.mediaData}" class="fav-grid-thumb" preload="metadata" muted playsinline></video>`;
  } else {
    thumb = `<div class="fav-grid-thumb fav-grid-no-media"><i class="ti ti-photo-off"></i>${s.text?`<span class="fav-grid-text-snippet">${s.text.slice(0,20)}…</span>`:''}</div>`;
  }
  const isVideo = s.mediaType === 'video' && s.mediaData;
  return `<div class="fav-grid-card" onclick="openTweetDetailBySaveId('${s.saveId}')" data-save-id="${s.saveId}">
    ${thumb}
    ${isVideo ? '<div class="fav-grid-video-icon"><i class="ti ti-player-play-filled"></i></div>' : ''}
    <div class="fav-grid-overlay">
      <span class="fav-grid-name">${u.sub?'匿名':(u.n||'')}</span>
      <button class="fav-grid-menu" onclick="event.stopPropagation();_showFavGridMenu('${s.saveId}')" title="メニュー"><i class="ti ti-dots-vertical"></i></button>
    </div>
  </div>`;
}

/** グリッドカードのメニュー（フォルダー変更・削除） */
function _showFavGridMenu(saveId) {
  _showSimpleModal('操作を選択',
    `<div class="fav-folder-pick-list">
      <button class="fav-folder-pick-btn" onclick="openFavFolderPicker('${saveId}')">
        <i class="ti ti-folder-symlink"></i> フォルダーを変更
      </button>
      <button class="fav-folder-pick-btn" style="color:#ef4444" onclick="_closeSimpleModal();removeSavedTweet('${saveId}')">
        <i class="ti ti-trash"></i> お気に入りから削除
      </button>
    </div>`
  );
}

/** saveId からツイート詳細を開く（グリッドカードから呼ばれる） */
function openTweetDetailBySaveId(saveId) {
  const s = savedTweets.find(e => e.saveId === saveId);
  if (!s) return;
  // _tc に同じ db_id があればそのツイート詳細を開く
  const idx = _tc.findIndex(t => t && String(t.db_id) === String(s.db_id));
  if (idx >= 0) { openTweetDetail(idx); return; }
  // なければスナップショットから仮ツイートを生成して詳細表示
  const fakeTweet = {
    db_id: s.db_id, text: s.text, user: s.user,
    likes: s.likes, rt: s.rt, views: s.views,
    mediaData: s.mediaData, mediaType: s.mediaType,
    linkUrl: s.linkUrl, imageLinkUrl: s.imageLinkUrl,
    catId: s.catId, tags: s.tags, time: s.time, ai: s.ai,
  };
  openTweetDetail(_reg(fakeTweet));
}

/** お気に入りから削除 */
function removeSavedTweet(saveId) {
  const entry = savedTweets.find(s => s.saveId === saveId);
  if (!entry) return;
  savedTweets = savedTweets.filter(s => s.saveId !== saveId);
  favDbIds.delete(String(entry.db_id));
  _saveFavData();
  _updateAllFavButtons(String(entry.db_id), false);
  renderFavsPage();
  showToast('お気に入りを削除しました', 'info');
}

/** フォルダーピッカー（複数選択・タップで即トグル） */
function openFavFolderPicker(saveId) {
  const entry = savedTweets.find(s => s.saveId === saveId);
  if (!entry) return;
  const current = Array.isArray(entry.folders) ? entry.folders : [];
  const opts = favFolders.map(f => {
    const on = current.includes(f);
    const typeIcon = favFolderTypes[f] === 'grid' ? 'layout-grid' : 'layout-list';
    return `<button class="fav-folder-pick-btn${on?' active':''}" onclick="toggleFavFolderAssign('${saveId}','${f.replace(/'/g,"\\'")}')">
      <i class="ti ti-${typeIcon}"></i>${f}
      <i class="ti ti-${on?'check':'plus'}" style="margin-left:auto;font-size:13px"></i>
    </button>`;
  }).join('');
  _showSimpleModal(
    'フォルダーを選択（複数可）',
    `<div class="fav-folder-pick-list">${opts || '<div style="color:var(--text3);font-size:13px;padding:8px 0">フォルダーがありません</div>'}</div>
     <button class="post-btn" style="width:100%;margin-top:12px" onclick="_closeSimpleModal()">完了</button>`
  );
}

/** フォルダーへの所属をトグル（追加 or 削除） */
function toggleFavFolderAssign(saveId, folder) {
  const entry = savedTweets.find(s => s.saveId === saveId);
  if (!entry) return;
  if (!Array.isArray(entry.folders)) entry.folders = [];
  const idx = entry.folders.indexOf(folder);
  if (idx >= 0) entry.folders.splice(idx, 1);
  else          entry.folders.push(folder);
  _saveFavData();
  // モーダルをそのまま再描画（閉じない）
  openFavFolderPicker(saveId);
  // フィードのカウントもバックグラウンドで更新
  if (document.getElementById('page-favs')?.classList.contains('active')) renderFavsPage();
}

/** フォルダー作成モーダル */
function openCreateFolderModal() {
  _pendingFolderType = 'list';
  _showSimpleModal('フォルダーを作成',
    `<div style="display:flex;flex-direction:column;gap:14px">
      <input id="new-folder-input" type="text" maxlength="20" placeholder="フォルダー名（最大20文字）"
        style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:14px;background:var(--bg2);color:var(--text);width:100%;box-sizing:border-box">
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:7px;letter-spacing:0.04em">表示タイプ</div>
        <div style="display:flex;gap:8px">
          <button id="fav-type-list-btn" class="fav-type-btn active" onclick="_setFolderType('list')">
            <i class="ti ti-layout-list" style="font-size:18px"></i>
            <span>リスト</span>
            <span class="fav-type-hint">つぶやき向け</span>
          </button>
          <button id="fav-type-grid-btn" class="fav-type-btn" onclick="_setFolderType('grid')">
            <i class="ti ti-layout-grid" style="font-size:18px"></i>
            <span>グリッド</span>
            <span class="fav-type-hint">イラスト・動画向け</span>
          </button>
        </div>
      </div>
      <button class="post-btn" style="align-self:flex-end" onclick="createFavFolder()"><i class="ti ti-folder-plus"></i> 作成</button>
    </div>`
  );
  setTimeout(() => document.getElementById('new-folder-input')?.focus(), 50);
}

/** 表示タイプトグルボタン切り替え */
function _setFolderType(type) {
  _pendingFolderType = type;
  document.getElementById('fav-type-list-btn')?.classList.toggle('active', type === 'list');
  document.getElementById('fav-type-grid-btn')?.classList.toggle('active', type === 'grid');
}

function createFavFolder() {
  const name = (document.getElementById('new-folder-input')?.value || '').trim();
  if (!name) return;
  if (favFolders.includes(name)) { showToast('同じ名前のフォルダーが既にあります', 'warn'); return; }
  favFolders.push(name);
  favFolderTypes[name] = _pendingFolderType;
  _saveFavData();
  _closeSimpleModal();
  renderFavsPage();
  showToast(`フォルダー「${name}」を作成しました`, 'success');
}

function deleteFavFolder(name) {
  if (FAV_DEFAULT_FOLDERS.includes(name)) { showToast('デフォルトフォルダーは削除できません', 'warn'); return; }
  if (!confirm(`フォルダー「${name}」を削除しますか？\n中のツイートは「未整理」に戻ります。`)) return;
  savedTweets.forEach(s => {
    if (Array.isArray(s.folders)) s.folders = s.folders.filter(f => f !== name);
  });
  favFolders = favFolders.filter(f => f !== name);
  delete favFolderTypes[name];
  if (_favActiveFolder === name) _favActiveFolder = null;
  _saveFavData();
  renderFavsPage();
}

/** 汎用モーダル（お気に入りページ用） */
function _showSimpleModal(title, bodyHTML) {
  let modal = document.getElementById('simple-modal-wrap');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'simple-modal-wrap';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45)';
    modal.onclick = e => { if (e.target === modal) _closeSimpleModal(); };
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div style="background:var(--surface);border-radius:16px;padding:20px;min-width:280px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <span style="font-weight:700;font-size:15px">${title}</span>
      <button onclick="_closeSimpleModal()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text3)"><i class="ti ti-x"></i></button>
    </div>
    ${bodyHTML}
  </div>`;
  modal.style.display = 'flex';
}
function _closeSimpleModal() {
  const m = document.getElementById('simple-modal-wrap');
  if (m) m.style.display = 'none';
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

    // announce は既読後も hint を1行プレビュー表示
    const hintPreview = n.hint
      ? (n.hint.length > 40 ? n.hint.slice(0, 40) + '…' : n.hint) : '';
    const hintHTML = n.hint
      ? `<div class="notif-hint">${n.type === 'announce' ? hintPreview : (n.unread ? n.hint : '')}</div>`
      : '';

    return `<div class="notif-item${n.unread ? ' unread' : ''}${n.hint ? ' has-hint' : ''} clickable" data-type="${n.type || ''}" onclick="markNotifRead('${notifActiveAcct}',${i})">
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
  _updateAnnounceBadgeTab();
  // 告知タブが開いていれば内容も再描画
  if (_notifPageTab === 'announce') _loadFollowingAnnouncements();
}

function markNotifRead(acct, i) {
  const arr = _notifArray(acct);
  const n = arr[i];
  const wasUnread = n.unread;
  n.unread = false;
  if (n.db_id) dbMarkNotifRead(n.db_id); // DBに既読を反映
  renderNotifs();
  // お知らせ（announce）は既読・未読問わず常に詳細モーダルを表示
  if (n.type === 'announce') {
    _showNotifAnnounce(n);
    return;
  }
  if (!wasUnread) return;
  if (n.type === 'rank') {
    setTimeout(() => showRankingEffect(n.rank, n.cat), 200);
  } else if (n.type === 'follow') {
    setTimeout(() => showFollowerNotifEffect(n.followerCount, n.followers), 200);
  }
}

/** 運営お知らせの詳細モーダル */
function _showNotifAnnounce(n) {
  const titleHTML = `<span style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700">
    <span style="width:28px;height:28px;border-radius:8px;background:${n.bg};color:${n.tc};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px">
      <i class="ti ${n.icon}"></i>
    </span>
    ${n.text || 'お知らせ'}
  </span>`;
  const bodyHTML = `
    ${n.hint ? `<div style="font-size:14px;line-height:1.8;color:var(--text);white-space:pre-wrap;padding:6px 0 4px">${n.hint}</div>` : '<div style="color:var(--text3);font-size:13px">内容はありません</div>'}
    <div style="margin-top:8px;font-size:11px;color:var(--text3);text-align:right">${n.time || ''}</div>
  `;
  _showSimpleModal(titleHTML, bodyHTML);
}

let _unreadAnnounceCount = 0; // フォロー中告知の未読数
let _notifPageTab = 'notif';  // 'notif' | 'announce'

/** 通知ページのタブ切り替え */
function switchNotifPageTab(tab) {
  _notifPageTab = tab;
  // タブボタン active 切り替え
  document.querySelectorAll('.notif-page-tab').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`nptab-${tab}`);
  if (btn) btn.classList.add('active');
  // コンテンツペイン切り替え
  const notifPane    = document.getElementById('notif-page-notif');
  const announcePane = document.getElementById('notif-page-announce');
  if (notifPane)    notifPane.style.display    = tab === 'notif'    ? '' : 'none';
  if (announcePane) announcePane.style.display = tab === 'announce' ? '' : 'none';
  // ヘッダーボタンも切り替え（通知タブ:全て既読 / 告知タブ:不要）
  const headerBtn = document.getElementById('notif-header-btn');
  if (headerBtn) headerBtn.style.display = tab === 'notif' ? '' : 'none';
  // 告知タブに切り替えたとき内容を読み込む
  if (tab === 'announce') _loadFollowingAnnouncements();
}

/** 告知タブのバッジ（未読数）を更新 */
function _updateAnnounceBadgeTab() {
  const badge = document.getElementById('nptab-announce-badge');
  if (!badge) return;
  if (_unreadAnnounceCount > 0) {
    badge.textContent = _unreadAnnounceCount > 99 ? '99+' : _unreadAnnounceCount;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function updateNotifBadge() {
  const mainCount = NOTIFS.filter(n => n.unread).length;
  const subCount  = NOTIFS_SUB.filter(n => n.unread).length;
  const count = mainCount + subCount + _unreadAnnounceCount;
  const badge = document.querySelector('.nav-badge');
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : count;
  badge.style.display = count ? '' : 'none';
}

/** 告知の未読数をチェックしてバッジを更新（バックグラウンドで定期実行） */
async function _checkAnnouncementBadge() {
  const myAid = localStorage.getItem('trendy_account_id');
  if (!myAid || !localStorage.getItem('trendy_logged_in')) return;
  const lastRead = localStorage.getItem('trendy_announce_last_read') || '1970-01-01T00:00:00Z';
  const items = await dbFetchFollowingAnnouncements(myAid, 50).catch(() => []);
  _unreadAnnounceCount = (items || []).filter(i => i.created_at > lastRead).length;
  updateNotifBadge();
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
  const activeHandle = testActiveUser ? testActiveUser.h : null;
  const isSub = myAccountType === 'sub' && hasSubAccount;
  const posts = myPosts.filter(t =>
    activeHandle
      ? t.user.h === activeHandle
      : isSub
        ? t.user.h === subAccountHandle          // サブ中: サブハンドルの投稿のみ
        : t.user.h === myHandle                   // メイン中: メインハンドルの投稿のみ
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
  if (!feed) return;
  if (!savedTweets.length) {
    feed.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text3)">
      <i class="ti ti-star" style="font-size:28px;display:block;margin-bottom:10px"></i>
      お気に入りはまだありません<br><span style="font-size:12px">投稿の☆ボタンで保存できます</span></div>`;
    return;
  }
  feed.innerHTML = savedTweets.map(s => _favCardHTML(s)).join('');
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
      ${_tweetAvHtml('tweet-av', `background:${u.bg};color:${u.tc};overflow:hidden`, u.av, u)}
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
  // アイコンを絵文字 or ハートに切替
  const icon = btn.querySelector('i, .like-emoji-display');
  if (icon) {
    if (t.likeEmoji) {
      // 投稿固有の絵文字は常に表示（いいね状態に関係なく）
      const span = document.createElement('span');
      span.className = 'like-emoji-display';
      span.textContent = t.likeEmoji;
      icon.replaceWith(span);
    } else if (nowLiked) {
      const i = document.createElement('i');
      i.className = 'ti ti-heart-filled';
      i.style.color = '#e11d48';
      icon.replaceWith(i);
    } else {
      const i = document.createElement('i');
      i.className = 'ti ti-heart';
      icon.replaceWith(i);
    }
  }
  // カウント表示更新
  const countEl = btn.querySelector('.like-count');
  if (countEl) countEl.textContent = fmt(t.likes);
  // 詳細モーダルが開いていれば同期
  const tdLike = document.getElementById(`td-like-${idx}`);
  if (tdLike) tdLike.textContent = fmt(t.likes);
  // ダイブ（リール）カードのいいねボタンも同期
  const reelBtn  = document.getElementById(`reel-like-${idx}`);
  const reelIcon = reelBtn?.querySelector('i');
  const reelLc   = document.getElementById(`reel-lc-${idx}`);
  if (reelBtn)  { reelBtn.classList.toggle('reel-liked', nowLiked); }
  if (reelIcon) {
    const reelTarget = reelBtn.querySelector('i, .like-emoji-display');
    if (reelTarget) {
      if (t.likeEmoji) {
        const span = document.createElement('span');
        span.className = 'like-emoji-display';
        span.textContent = t.likeEmoji;
        reelTarget.replaceWith(span);
      } else if (nowLiked) {
        const i = document.createElement('i');
        i.className = 'ti ti-heart-filled';
        i.style.color = '#ef4444';
        reelTarget.replaceWith(i);
      } else {
        const i = document.createElement('i');
        i.className = 'ti ti-heart';
        reelTarget.replaceWith(i);
      }
    }
  }
  if (reelLc)   reelLc.textContent = fmt(t.likes);
  // Supabase に保存（db_id があるときのみ）
  if (t.db_id && typeof dbToggleLike === 'function') {
    const aid = localStorage.getItem('trendy_account_id');
    const _reelAuthorId = t.user?.h ? (t.user.h.startsWith('@') ? t.user.h.slice(1) : t.user.h) : null;
    dbToggleLike(t.db_id, aid, nowLiked, t.user && t.user.h, _isFavUser(_reelAuthorId));
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
// ── 個人情報 公開/非公開 ─────────────────────────────────

/**
 * プライバシー設定のデフォルト
 *   gender: false（非公開）  region: true（公開）  age: false（非公開）
 */
function _getPrivacy(field) {
  const val = localStorage.getItem('trendy_show_' + field);
  if (val !== null) return val === 'true';
  return field === 'region'; // region のみデフォルト公開
}

/** プライバシートグルを描画（'gender'|'region'|'age'） */
function _renderPrivacyToggle(field) {
  const isPublic = _getPrivacy(field);
  const html = `<button class="priv-toggle ${isPublic ? 'priv-toggle--on' : ''}" onclick="togglePrivacy('${field}')">
    <i class="ti ti-${isPublic ? 'eye' : 'eye-off'}"></i>${isPublic ? '公開' : '非公開'}
  </button>`;
  [`priv-toggle-pe-${field}`, `priv-toggle-settings-${field}`].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

/** 全トグルを描画 */
function _renderAllPrivacyToggles() {
  ['gender', 'region', 'age'].forEach(_renderPrivacyToggle);
}

/** トグル切り替え */
async function togglePrivacy(field) {
  const newVal = !_getPrivacy(field);
  localStorage.setItem('trendy_show_' + field, String(newVal));
  _renderPrivacyToggle(field);
  showToast(newVal ? '公開に変更しました' : '非公開に変更しました', 'success');
  const aid = localStorage.getItem('trendy_account_id');
  const colMap = { gender: 'show_gender', region: 'show_region', age: 'show_age' };
  if (aid && typeof dbUpdateProfileMeta === 'function') {
    dbUpdateProfileMeta(aid, { [colMap[field]]: newVal }).catch(() => {});
  }
}

/** マイページのメタ情報（地域・年代）を更新 */
function _updateMypageMeta() {
  const el = document.getElementById('mypage-profile-meta');
  if (!el) return;
  const pref = localStorage.getItem('trendy_region') || '';
  const city = localStorage.getItem('trendy_city')   || '';
  const dob  = localStorage.getItem('trendy_dob')    || '';
  // 年代を dob 文字列から抽出（例："1990年1月1日 / 1990年代（非公開）"）
  const decadeMatch = dob.match(/(\d{4})年代/);
  const decade = decadeMatch ? decadeMatch[1] + '年代' : '';
  const parts = [];
  if (pref || city) {
    const loc = [pref, city].filter(Boolean).join(' ');
    parts.push(`<span><i class="ti ti-map-pin"></i> ${loc}</span>`);
  }
  if (decade) parts.push(`<span><i class="ti ti-calendar"></i> ${decade}</span>`);
  el.innerHTML = parts.join('');
}

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
  // 外部投稿は外部URLへ
  if (t.extUrl) { window.open(t.extUrl, '_blank', 'noopener,noreferrer'); return; }
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
    <div class="td-user-row clickable" onclick="${t.extUrl ? `window.open('${t.extUrl}','_blank','noopener,noreferrer')` : `closeTweetDetail();openUserPage('${u.h}')`}">
      ${_tweetAvHtml('tweet-av', `background:${u.bg};color:${u.tc};overflow:hidden;flex-shrink:0`, u.av, u)}
      <div style="flex:1;min-width:0">
        <div class="tweet-name" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          ${u.n}
          ${u.sub ? subBadge() : `<span class="badge-main">メイン</span>`}
          ${u.nameTag ? `<span class="tweet-name-tag">＠${u.nameTag}</span>` : ''}
        </div>
        <div class="tweet-handle">${u.h} <span style="color:var(--text3);font-size:11px;margin-left:4px">${t.time}</span></div>
      </div>
      <i class="ti ti-chevron-right" style="font-size:14px;opacity:0.35;flex-shrink:0"></i>
    </div>
    <div class="td-content" style="padding:10px 16px">
      ${t.text ? `<div class="td-text" style="font-size:15px;line-height:1.6;margin-bottom:8px">${_linkify(t.text)}</div>` : ''}
      ${t.mediaData ? (t.mediaType === 'image'
          ? `<div class="tweet-media" style="margin:4px 0 8px">${t.imageLinkUrl
              ? `<a href="${encodeURI(t.imageLinkUrl)}" target="_blank" rel="noopener noreferrer"><img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" style="cursor:pointer"></a>`
              : `<img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" onclick="event.stopPropagation();openImageViewer(this.src)">`
            }</div>`
          : `<div class="tweet-media" style="margin:4px 0 8px"><video src="${t.mediaData}" controls class="tweet-media-vid" preload="metadata"></video></div>`)
        : ''}
      ${t.linkUrl ? `<div style="margin-top:2px;margin-bottom:4px">${_urlBtnHTML(t.linkUrl)}</div>` : ''}
    </div>
    <div class="td-stats-row" style="padding:8px 16px;display:flex;align-items:center;gap:14px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
      <button class="td-action-btn like-btn${likedTweets.has(idx)?' liked':''}" onclick="toggleLike(${idx},this)">${t.likeEmoji ? `<span class="like-emoji-display">${t.likeEmoji}</span>` : `<i class="ti ti-heart${likedTweets.has(idx)?'-filled':''}" style="${likedTweets.has(idx)?'color:#e11d48':''}"></i>`}<span class="like-count" id="td-like-${idx}">${fmt(t.likes)}</span></button>
      <span style="color:var(--text3);font-size:13px"><i class="ti ti-eye"></i> ${fmt(t.views)}</span>
      ${t.boostScore > 0 ? `<span style="font-size:11px;color:#f59e0b"><i class="ti ti-rocket"></i>+${t.boostScore}</span>` : ''}
      ${aiBadge(t.ai)}
      ${favStar(idx)}
      ${hasRank ? `<span class="rank-badge-card ${rc(t.rank)}" style="margin-left:auto">#${t.rank}位</span>${prevBadge(t.prev)}` : ''}
    </div>
    ${(() => {
      const myH = localStorage.getItem('trendy_account_id');
      const isMyPost = myH && (u.h === '@' + myH || u.h === myH);
      if (!isMyPost || !t.db_id || t.extSource) return '';
      const inv = typeof _gachaItems !== 'undefined' ? _gachaItems : {};
      const boostItems = [
        { id:'boost_lg',  label:'LG +1000', qty: inv['boost_lg'] ||0 },
        { id:'boost_ssr', label:'SSR +100', qty: inv['boost_ssr']||0 },
        { id:'boost_sr',  label:'SR +30',   qty: inv['boost_sr'] ||0 },
        { id:'boost_r',   label:'R +5',     qty: inv['boost_r']  ||0 },
        { id:'boost_n',   label:'N +1',     qty: inv['boost_n']  ||0 },
      ].filter(b => b.qty > 0);
      if (!boostItems.length) return `<div style="padding:8px 16px;font-size:12px;color:var(--text3)"><i class="ti ti-rocket"></i> ブーストアイテムなし（ガチャで獲得できます）</div>`;
      return `<div style="padding:8px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:700;margin-bottom:6px;color:var(--text2)"><i class="ti ti-rocket"></i> ブースト適用</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${boostItems.map(b=>`<button onclick="applyBoostToPost('${t.db_id}','${b.id}')" style="padding:4px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);font-size:12px;cursor:pointer">${b.label}（残${b.qty}）</button>`).join('')}
        </div>
      </div>`;
    })()}
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
          .select('account_id, avatar_data, is_verified, is_corporate')
          .in('account_id', accountIds);
        (profiles || []).forEach(p => {
          avatarMap['@' + p.account_id] = p.avatar_data
            ? `<img src="${p.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
            : null;
          _badgeCache[p.account_id] = { is_verified: !!p.is_verified, is_corporate: !!p.is_corporate };
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
    // 推しレベル更新（推しユーザーへのコメントのみ・匿名除外）
    if (!isSub && t.user && t.user.h && typeof dbUpdateFanLevel === 'function') {
      const aid = localStorage.getItem('trendy_account_id');
      const authorId = t.user.h.startsWith('@') ? t.user.h.slice(1) : t.user.h;
      if (aid && _isFavUser(authorId)) dbUpdateFanLevel(aid, authorId, 'comment', 1);
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
        ${_tweetAvHtml('tweet-av reply-av clickable', `background:${avBg};color:${avTc};overflow:hidden`, ru.av, ru, `closeTweetDetail();openUserPage('${ru.h}')`)}

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
      ${_tweetAvHtml('tweet-av reply-av', `background:${u.bg};color:${u.tc}`, u.av, u)}
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
    avEl.innerHTML        = srcAv.innerHTML || srcAv.textContent;
    avEl.style.background = srcAv.style.background;
    avEl.style.color      = srcAv.style.color;
  }
}

// ── 推しユーザー設定 ─────────────────────────────────────────

// 現在設定中の推し（account_id, スロット1-3）
let _favSlots = { 1: null, 2: null, 3: null };

/** accountId が自分の推しユーザーかどうか（O(1) メモリ検索） */
function _isFavUser(accountId) {
  if (!accountId) return false;
  return _favSlots[1] === accountId || _favSlots[2] === accountId || _favSlots[3] === accountId;
}
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

  // Supabaseにも同期
  const _aid = localStorage.getItem('trendy_account_id');
  if (_aid) {
    if (typeof dbUpdateProfile === 'function') {
      dbUpdateProfile({ accountId: _aid, nickname: myNickname, bio: myBio, isDev: isDeveloper });
    }
    if (typeof dbUpdateProfileMeta === 'function') {
      dbUpdateProfileMeta(_aid, { nameTag: myNameTag });
    }
  }

  showToast('プロフィールを保存しました', 'success');
  goPage('mypage', null);
}

// ── 外部リンク管理ページ ──────────────────────────────────
function openProfileLinks() {
  _socialSlots = [];
  _renderSocialSlotsUI();
  const aid = localStorage.getItem('trendy_account_id');
  if (aid && typeof dbFetchProfile === 'function') {
    dbFetchProfile(aid).then(profile => {
      _initSocialSlots(profile?.social_links);
    }).catch(() => {});
  }
}

function saveProfileLinks() {
  const aid = localStorage.getItem('trendy_account_id');
  if (aid) {
    const linksToSave = _socialSlots
      .filter(s => (s.url || '').trim())
      .map(s => ({ url: s.url.trim(), icon: s.icon || '' }));
    if (typeof dbUpdateSocialLinks === 'function') {
      dbUpdateSocialLinks(aid, linksToSave);
    }
    _renderSocialLinks(linksToSave, 'mypage-social-links');
  }
  showToast('外部リンクを保存しました', 'success');
  goPage('profile-edit', null);
}

// ── 推しユーザー設定ページ ────────────────────────────────
function openProfileOshi() {
  loadUserFavorites();
}

// ── 属性・アカウント情報ページ ────────────────────────────
function openProfileAttrs() {
  // 属性情報を同期
  const syncVal = (peId, settingsId) => {
    const src = document.getElementById(settingsId);
    const dst = document.getElementById(peId);
    if (src && dst) dst.textContent = src.textContent;
  };
  syncVal('pe-gender-val',    'settings-gender-val');
  syncVal('pe-dob-val',       'settings-dob-val');
  syncVal('pe-phone-val',     'settings-phone-val');
  const pref = localStorage.getItem('trendy_region') || '';
  const city = localStorage.getItem('trendy_city')   || '';
  const prefEl = document.getElementById('pe-prefecture-val');
  const cityEl = document.getElementById('pe-city-val');
  if (prefEl) prefEl.textContent = pref || '（未設定）';
  if (cityEl) cityEl.textContent = city || '（未設定）';
  // 月1回制限ボタン
  renderMonthlyChangeBtn('pe-prefecture-change-wrap', 'prefecture', "openSettingsEditFromProfile('prefecture')", '変更');
  renderMonthlyChangeBtn('pe-city-change-wrap',       'city',       "openSettingsEditFromProfile('city')",       '変更');
  renderMonthlyChangeBtn('pe-phone-change-wrap',      'phone',      'openPhoneModalFromProfile()',               '変更');
  _renderAllPrivacyToggles();
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
      + (devBadge ? ' ' + devBadge : '')
      + ' ' + _buildProfileBadgeHtml(_myIsVerified, _myIsCorporate);
  }
  _applyDevNav();
}

function _applyNameTag() {
  const displayName = myNickname || 'あなた';
  const devBadge    = _devBadge();
  const isSub = myAccountType === 'sub';

  // サイドバー（サブ中はメインの情報で上書きしない）
  if (!isSub) {
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
let _avCropCallback = null; // セット時は saveAvCrop がデフォルト保存の代わりにこれを呼ぶ
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
// ドラッグハンドラーの重複登録防止フラグ
let _avDragHandlersAdded = false;
let _avDragCanvas = null; // 現在ハンドラーが登録されているcanvas

function addAvCanvasDragHandlers(canvas) {
  // canvasが変わった場合のみmousedownを付け直す（常に最新のcanvasを参照させる）
  if (_avDragCanvas !== canvas) {
    _avDragCanvas = canvas;
    canvas.addEventListener('mousedown', e => {
      _avDragState.isDragging = true;
      _avDragState.startX = e.clientX;
      _avDragState.startY = e.clientY;
      _avDragState.startOffsetX = _avCropState.offsetX;
      _avDragState.startOffsetY = _avCropState.offsetY;
      canvas.style.cursor = 'grabbing';
    });
  }

  // documentへのリスナーは一度だけ登録
  if (!_avDragHandlersAdded) {
    _avDragHandlersAdded = true;
    document.addEventListener('mousemove', e => {
      if (!_avDragState.isDragging) return;
      const dx = e.clientX - _avDragState.startX;
      const dy = e.clientY - _avDragState.startY;
      _avCropState.offsetX = _avDragState.startOffsetX + dx;
      _avCropState.offsetY = _avDragState.startOffsetY + dy;
      updateAvCrop();
    });
    document.addEventListener('mouseup', () => {
      if (!_avDragState.isDragging) return;
      _avDragState.isDragging = false;
      if (_avDragCanvas) _avDragCanvas.style.cursor = 'grab';
    });
  }

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

  const compressed = previewCanvas.toDataURL('image/jpeg', 0.85);

  // コールバックがセットされていればそちらに渡して終了（サポーター等）
  if (typeof _avCropCallback === 'function') {
    const cb = _avCropCallback;
    _avCropCallback = null;
    closeAvCrop();
    cb(compressed);
    return;
  }

  // デフォルト：マイページアバター保存
  localStorage.setItem('trendy_av', compressed);
  _applyAvImage(compressed);

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
  if (myAccountType === 'sub') return; // サブ中はカバーを上書きしない
  const el = document.getElementById('profile-cover-img');
  if (!el) return;
  el.style.backgroundImage = `url(${data})`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
}

// ── Category Voting ────────────────────────────────────
const myVotes = {}; // 'handle:catName' -> 'agree' | 'deny' | null
// localStorageから投票状態を復元（ページリロード後も自分の投票が保持される）
(function _restoreCatVotes() {
  try {
    const saved = localStorage.getItem('trendy_cat_votes');
    if (saved) Object.assign(myVotes, JSON.parse(saved));
  } catch(e) {}
})();

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

  // ── 投票をSupabaseへ保存（他のユーザーにも反映されるよう）──
  const _voteAid = localStorage.getItem('trendy_account_id');
  if (_voteAid && typeof dbSaveCategories === 'function') {
    const _targetAid = handle.startsWith('@') ? handle.slice(1) : handle;
    dbSaveCategories(_targetAid, profile.categories).catch(e => {
      console.warn('[VOTE] カテゴリー投票の保存に失敗:', e?.message);
    });
  }
  // ── 自分の投票状態をlocalStorageに永続化 ──
  try { localStorage.setItem('trendy_cat_votes', JSON.stringify(myVotes)); } catch(e) {}
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
  // サブ中はカテゴリーセクションを非表示
  const catSection = document.querySelector('.profile-cats-section');
  if (catSection) catSection.style.display = (myAccountType === 'sub') ? 'none' : '';
  if (myAccountType === 'sub') return;
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

  // Supabase へも保存（自分・他ユーザー問わず）
  const _catAddAid = handle.startsWith('@') ? handle.slice(1) : handle;
  if (_catAddAid && typeof dbSaveCategories === 'function') {
    dbSaveCategories(_catAddAid, cats).catch(e => {
      console.warn('[CAT] カテゴリー追加の保存に失敗:', e?.message);
    });
  }
  if (handle === myHandle) {
    renderMyCats();
  } else {
    renderUserPageCats(handle);
  }
}

// ── Account Switch ─────────────────────────────────────
function selectAccount(type) {
  myAccountType = type;
  localStorage.setItem('trendy_acct_type', type); // 選択状態を永続化
  const isSub = type === 'sub' && hasSubAccount;

  // サブアカウントの表示情報
  const subN  = subAccountName  || 'サブ';
  const subH  = subAccountHandle || '@anon_sub';
  const subAv = (subN[0] || 'S').toUpperCase();
  const subBg = '#ede9fe'; const subTc = '#5b21b6';
  const mainBg = '#dbeafe'; const mainTc = '#1e40af';

  // メインアバターのコンテンツ（宣言を先頭に移動して全箇所で使えるように）
  const _mainAvHtml = typeof _myAvContent === 'function' ? _myAvContent() : 'あ';
  const _hasAvImg   = _mainAvHtml.startsWith('<img');
  const _mainAvBg   = _hasAvImg ? 'transparent' : mainBg;
  const _mainAvTc   = _hasAvImg ? 'transparent' : mainTc;

  // ── 投稿欄の切り替えボタン（選択したtypeを必ず反映） ──
  const mainBtn = document.getElementById('acct-main-btn');
  const subBtn  = document.getElementById('acct-sub-btn');
  if (mainBtn) {
    mainBtn.classList.toggle('active-main', type === 'main');
    mainBtn.classList.remove('active-sub');
  }
  if (subBtn) {
    subBtn.classList.toggle('active-sub',  type === 'sub');
    subBtn.classList.remove('active-main');
  }
  const warn = document.getElementById('sub-warn-inline');
  if (warn) warn.style.display = isSub ? 'flex' : 'none';

  // ── サイドバー ──
  const sideChip = document.getElementById('sidebar-acct-type');
  const sideName = document.getElementById('sidebar-user-name');
  const sideHndl = document.getElementById('sidebar-user-handle');
  const sideTag  = document.getElementById('sidebar-name-tag');
  const sideAv   = document.getElementById('sidebar-user-av');
  if (sideChip) {
    sideChip.textContent = isSub ? 'サブ' : 'メイン';
    sideChip.className = 'sidebar-acct-chip ' + (isSub ? 'chip-sub' : 'chip-main');
  }
  if (sideName) sideName.textContent = isSub ? subN : (myNickname || 'あなた');
  if (sideHndl) sideHndl.textContent = isSub ? subH : myHandle;
  // 名前タグ：サブ中は非表示
  if (sideTag)  sideTag.textContent  = isSub ? '' : (myNameTag ? '＠' + myNameTag : '');
  // アバター：サブ中はサブのイニシャル、メインは画像 or イニシャル
  if (sideAv) {
    sideAv.innerHTML        = isSub ? subAv : _mainAvHtml;
    sideAv.style.background = isSub ? subBg : _mainAvBg;
    sideAv.style.color      = isSub ? subTc : _mainAvTc;
  }

  // ── ホームのプロフィールバー ──
  const homeAv   = document.getElementById('home-av-display');
  const homeName = document.getElementById('home-profile-name');
  if (homeAv) {
    homeAv.innerHTML        = isSub ? subAv : _mainAvHtml;
    homeAv.style.background = isSub ? subBg : _mainAvBg;
    homeAv.style.color      = isSub ? subTc : _mainAvTc;
  }
  if (homeName) {
    homeName.innerHTML = isSub
      ? `${subN} ${subBadge()}`
      : (myNickname || 'あなた');
  }

  // ── 投稿欄のアバター ──
  const composeAv = document.getElementById('home-compose-av');
  if (composeAv) {
    composeAv.innerHTML        = isSub ? subAv : _mainAvHtml;
    composeAv.style.background = isSub ? subBg : _mainAvBg;
    composeAv.style.color      = isSub ? subTc : _mainAvTc;
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
    myAv.innerHTML        = isSub ? subAv : _mainAvHtml;
    myAv.style.background = isSub ? subBg : _mainAvBg;
    myAv.style.color      = isSub ? subTc : _mainAvTc;
  }

  // ── マイページ：サブ中は個人情報系を非表示 ──
  // 名前タグ
  const myNameTagEl = document.getElementById('profile-name-tag-display');
  if (myNameTagEl) {
    if (isSub) {
      myNameTagEl.style.display = 'none';
    } else {
      myNameTagEl.style.display = myNameTag ? '' : 'none';
      myNameTagEl.textContent   = myNameTag ? '＠' + myNameTag : '';
    }
  }
  // タグ編集ボタン
  const myTagEditBtn = document.getElementById('name-tag-edit-btn');
  if (myTagEditBtn) myTagEditBtn.style.display = isSub ? 'none' : '';

  // 自己紹介
  const bioWrap = document.getElementById('profile-bio-wrap');
  if (bioWrap) bioWrap.style.display = isSub ? 'none' : '';

  // 地域・年代などメタ情報
  const metaEl = document.getElementById('mypage-profile-meta');
  if (metaEl) metaEl.style.display = isSub ? 'none' : '';

  // プロフィール編集ボタン（サブは個人情報設定不要）
  const profEditBtn = document.getElementById('mypage-profile-edit-btn');
  if (profEditBtn) profEditBtn.style.display = isSub ? 'none' : '';

  // カバー画像：サブ中はクリア、メインに戻ったら復元
  const coverEl = document.getElementById('profile-cover-img');
  if (coverEl) {
    if (isSub) {
      coverEl.style.backgroundImage = 'none';
    } else {
      const savedCover = localStorage.getItem('trendy_cover');
      if (savedCover) {
        coverEl.style.backgroundImage = `url(${savedCover})`;
        coverEl.style.backgroundSize  = 'cover';
        coverEl.style.backgroundPosition = 'center';
      } else {
        coverEl.style.backgroundImage = 'none';
      }
    }
  }

  // カテゴリーセクション：サブ中は非表示
  const catSection = document.querySelector('.profile-cats-section');
  if (catSection) catSection.style.display = isSub ? 'none' : '';

  // マイページが開いていれば投稿タブも再描画
  if (document.getElementById('page-mypage')?.classList.contains('active')) {
    renderMyPosts();
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

async function completeRegister() {
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

  const nickname = _val('reg-name') || accountId;
  const _pwHash = btoa(unescape(encodeURIComponent(pw)));

  // ── Supabaseへ先に保存（保存に失敗したら登録完了にしない）──
  const regBtn = document.querySelector('#rpanel-1 .kids-next-btn');
  if (regBtn) { regBtn.disabled = true; regBtn.innerHTML = '<i class="ti ti-loader-2"></i> 保存中...'; }

  if (typeof dbSaveProfile === 'function') {
    let saved = null;
    let saveErrMsg = '';
    try {
      saved = await dbSaveProfile({
        accountId    : accountId,
        passwordHash : _pwHash,
        nickname     : nickname,
        bio          : '',
        isDev        : false,
      });
    } catch(e) {
      saveErrMsg = e.message || '';
      console.error('[REG] Supabase保存エラー:', e);
    }
    if (!saved) {
      // 保存失敗 → ボタンを戻してエラー表示
      if (regBtn) { regBtn.disabled = false; regBtn.innerHTML = '<i class="ti ti-user-check"></i> 登録する'; }
      const detail = saveErrMsg ? `\n（${saveErrMsg}）` : '通信環境を確認してもう一度お試しください。';
      showToast(`アカウントの保存に失敗しました。${detail}`, 'error');
      return;
    }
  }

  if (regBtn) { regBtn.disabled = false; regBtn.innerHTML = '<i class="ti ti-user-check"></i> 登録する'; }

  // ── 新規登録ボーナス：1000ピークコインをプレゼント ──
  if (typeof dbAddPoints === 'function') {
    dbAddPoints(accountId, 1000).catch(e => {
      console.warn('[REG] 登録ボーナス付与エラー:', e?.message);
    });
  }

  // ── 保存成功 → 完了ステップへ ──
  const desc = document.getElementById('reg-done-desc');
  if (desc) desc.innerHTML = `<b>@${accountId}</b> さん、ようこそ！<br>アカウントの設定が完了しました。<br><span style="color:#7c3aed;font-weight:700"><i class="ti ti-gift"></i> 登録ボーナスとして 1,000 ピークコイン をプレゼントしました！</span>`;
  registerStep(2);

  // ── 前アカウントのプロフィールデータをクリア ──
  const _REG_CLEAR_KEYS = [
    'trendy_av', 'trendy_cover', 'trendy_bio',
    'trendy_gender', 'trendy_dob', 'trendy_region', 'trendy_city', 'trendy_phone',
    'trendy_badge_verified_icon', 'trendy_badge_corporate_icon',
    'trendy_last_sync', 'trendy_isDev',  // 開発者フラグも必ずリセット
    'trendy_myNameTag', 'trendy_earned_badges', 'trendy_display_badges',
    'trendy_saved_tweets', 'trendy_fav_folders', 'trendy_fav_folder_types',
    'trendy_cat_votes',  // カテゴリー投票状態もリセット
  ];
  _REG_CLEAR_KEYS.forEach(k => localStorage.removeItem(k));
  // メモリ変数もリセット
  myBio = '';
  myNameTag = '';
  badgeVerifiedIcon = null;
  badgeCorporateIcon = null;
  isDeveloper = false;  // 新規登録アカウントは常に非開発者
  _applyDevNav();       // 開発者メニューを非表示に
  // カテゴリー投票メモリをリセット
  Object.keys(myVotes).forEach(k => delete myVotes[k]);
  // お気に入りもリセット（新アカウントは空の状態から開始）
  savedTweets = [];
  favDbIds.clear();
  favFolders = [...FAV_DEFAULT_FOLDERS];
  favFolderTypes = { ...FAV_DEFAULT_TYPES };
  _lastFavSyncAt = 0;
  // 名前タグ表示をクリア
  const _ntDisp2 = document.getElementById('profile-name-tag-display');
  if (_ntDisp2) { _ntDisp2.textContent = ''; _ntDisp2.style.display = 'none'; }
  // アバター表示をイニシャルに戻す
  ['my-av-display','home-av-display','sidebar-user-av','home-compose-av'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = ''; el.textContent = (nickname || accountId)[0] || '?'; }
  });
  // カバー画像をクリア
  const _coverEl = document.getElementById('profile-cover-img');
  if (_coverEl) { _coverEl.style.backgroundImage = ''; }

  // ── ローカルストレージに保存 ──
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
    USER_PROFILES[myHandle] = { categories: [] }; // 新規登録は常に空カテゴリー
  }
  _applyMyHandle();

  // 存在チェックタイマーをリセット（Supabase保存済みなのでチェック不要）
  _lastAccountExistCheck = Date.now();
  _profileNullCount = 0;

  // 紹介コード処理（登録完了後）
  const _refCode = localStorage.getItem('trendy_ref_code');
  if (_refCode && _refCode !== accountId) {
    dbProcessReferral(_refCode, accountId).catch(() => {});
    localStorage.removeItem('trendy_ref_code');
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
  const aid = localStorage.getItem('trendy_account_id') || 'you';
  subAccountName   = nameInput || 'サブ';
  subAccountHandle = '@' + aid + '_sub';
  hasSubAccount    = true;
  localStorage.setItem('trendy_has_sub',  'true');
  localStorage.setItem('trendy_sub_name', subAccountName);
  subCreateStep(3);
  // サイドバーのサブボタンを有効化
  const subBtn = document.getElementById('acct-sub-btn');
  if (subBtn) subBtn.disabled = false;
  // 通知タブを再描画（サブアカタブが出現するように）
  renderNotifTabs();
}

// ── ランキング設定パネル ────────────────────────────────
function openRankingSettings() {
  const overlay = document.getElementById('rank-settings-overlay');
  const panel   = document.getElementById('rank-settings-panel');
  if (!overlay || !panel) return;
  overlay.classList.add('show');
  panel.classList.add('open');
  renderCatSettings(); // スライダーと並び替えリストを最新状態に
}

function closeRankingSettings() {
  document.getElementById('rank-settings-overlay')?.classList.remove('show');
  document.getElementById('rank-settings-panel')?.classList.remove('open');
}

// ── Settings ───────────────────────────────────────────
function renderCatSettings() {
  const slider = document.getElementById('settings-width-slider');
  if (slider) slider.value = catColWidth;
  const val = document.getElementById('settings-width-val');
  if (val) val.textContent = catColWidth;
  document.getElementById('cat-sort-list').innerHTML = catOrder.map((id, idx) => {
    const cat = CATS_DATA.find(c=>c.id===id);
    if (!cat) return '';
    const vis = catVisible[id];
    return `<div class="cat-sort-item">
      <div class="cat-move-btns">
        <button class="cat-move-btn" onclick="moveUserCat('${id}',-1)" ${idx===0?'disabled':''} title="上へ"><i class="ti ti-chevron-up"></i></button>
        <button class="cat-move-btn" onclick="moveUserCat('${id}',1)" ${idx===catOrder.length-1?'disabled':''} title="下へ"><i class="ti ti-chevron-down"></i></button>
      </div>
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

function moveUserCat(id, dir) {
  const i = catOrder.indexOf(id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= catOrder.length) return;
  [catOrder[i], catOrder[j]] = [catOrder[j], catOrder[i]];
  localStorage.setItem('trendy_cat_order_user', JSON.stringify(catOrder));
  renderCatSettings();
  renderCatGrid();
}

// ── ダークモード ──
function _applyDarkMode(enable) {
  if (enable) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) toggle.checked = !!enable;
}

function toggleDarkMode(cb) {
  const enable = cb.checked;
  localStorage.setItem('trendy_dark_mode', enable ? 'true' : 'false');
  _applyDarkMode(enable);
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

  if (!followingIds || followingIds.length === 0) {
    feed.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">フォロー中のユーザーがいません</div>';
    return;
  }

  const profiles = await dbFetchProfilesByIds(followingIds);

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

  if (!followerIds || followerIds.length === 0) {
    feed.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">フォロワーがいません</div>';
    return;
  }

  const profiles = await dbFetchProfilesByIds(followerIds);

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
    const fanAvOverlay = _buildAvBadgeOverlay(!!p?.is_verified, !!p?.is_corporate);
    return `<div class="fan-rank-item" onclick="openUserPage('@${item.fan_account_id}')">
      <span class="fan-rank-num ${rankCls(i)}">${i + 1}</span>
      <div class="tweet-av-wrap"><div style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:${avBg};color:#fff">${avHtml}</div>${fanAvOverlay}</div>
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
  // 称号バッジ行をリセット（非同期取得前に隠す）
  const upBadgesRow = document.getElementById('user-page-display-badges');
  if (upBadgesRow) { upBadgesRow.innerHTML = ''; upBadgesRow.style.display = 'none'; }

  document.getElementById('user-page-name').innerHTML =
    `${u.sub ? '匿名ユーザー' : u.n} ${u.sub ? subBadge() : '<span class="badge-main">メイン</span>'}`;
  document.getElementById('user-page-handle').textContent = handle;

  const meta = document.getElementById('user-page-meta');
  if (!u.sub && (u.age || u.gender || u.region)) {
    meta.innerHTML = [
      u.gender ? `<span><i class="ti ti-user"></i> ${u.gender}</span>` : '',
      u.age    ? `<span><i class="ti ti-calendar"></i> ${u.age}</span>` : '',
      u.region ? `<span><i class="ti ti-map-pin"></i> ${u.region}${u.city ? ' ' + u.city : ''}</span>` : '',
    ].filter(Boolean).join('');
    meta.style.display = '';
  } else {
    meta.innerHTML = '';
  }

  // カウントをリセット（非同期取得まで「-」表示）
  document.getElementById('user-page-following-count').textContent = '-';
  document.getElementById('user-page-follower-count').textContent  = '-';
  document.getElementById('user-page-post-count').textContent      = '-';

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

  // 推しアイコン・ソーシャルリンク・バッジをリセット
  const oshiRow = document.getElementById('user-page-oshi-row');
  if (oshiRow) oshiRow.style.display = 'none';
  const socialEl = document.getElementById('user-page-social-links');
  if (socialEl) { socialEl.innerHTML = ''; socialEl.style.display = 'none'; }
  const badgesEl = document.getElementById('user-page-badges');
  if (badgesEl) badgesEl.innerHTML = '';

  // DM ボタンを自分以外にのみ表示（リセット）
  const dmBtn = document.getElementById('user-page-dm-btn');
  if (dmBtn) dmBtn.style.display = _upAccountId && _upAccountId !== localStorage.getItem('trendy_account_id') ? '' : 'none';

  // 告知通知ベルボタン（フォロー中の場合のみ表示）
  const notifyBtn = document.getElementById('user-page-notify-btn');
  if (notifyBtn) notifyBtn.style.display = 'none'; // 非同期更新まで非表示
  if (_upAccountId) _updateFollowNotifyBtn(_upAccountId);

  // ── フォロー数・フォロワー数・投稿数を Supabase から取得 ──
  if (_upAccountId && typeof dbFetchFollowCounts === 'function') {
    Promise.all([
      dbFetchFollowCounts(_upAccountId),
      (typeof dbFetchUserPostCount === 'function') ? dbFetchUserPostCount(_upAccountId) : Promise.resolve(0),
    ]).then(([counts, postCnt]) => {
      const followingEl = document.getElementById('user-page-following-count');
      const followerEl  = document.getElementById('user-page-follower-count');
      const postEl      = document.getElementById('user-page-post-count');
      if (followingEl) followingEl.textContent = (counts.following || 0).toLocaleString();
      if (followerEl)  followerEl.textContent  = (counts.followers || 0).toLocaleString();
      if (postEl)      postEl.textContent      = (postCnt || 0).toLocaleString();
    }).catch(() => {
      // エラー時は0表示
      const followingEl = document.getElementById('user-page-following-count');
      const followerEl  = document.getElementById('user-page-follower-count');
      const postEl      = document.getElementById('user-page-post-count');
      if (followingEl) followingEl.textContent = '0';
      if (followerEl)  followerEl.textContent  = '0';
      if (postEl)      postEl.textContent      = '0';
    });
  }

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
      // アバターにバッジオーバーレイを注入
      const _upAvWrap = document.getElementById('user-page-av-wrap');
      if (_upAvWrap) {
        _upAvWrap.querySelectorAll('.av-badge-overlay').forEach(el => el.remove());
        const _upOverlay = _buildAvBadgeOverlay(!!profile.is_verified, !!profile.is_corporate);
        if (_upOverlay) _upAvWrap.insertAdjacentHTML('beforeend', _upOverlay);
      }
      // ニックネーム・名前タグ・バッジ
      if (profile.nickname) {
        const nameEl      = document.getElementById('user-page-name');
        const nameTagHtml = profile.name_tag
          ? `<span class="tweet-name-tag">＠${profile.name_tag}</span>` : '';
        const profileBadges = _buildProfileBadgeHtml(profile.is_verified, profile.is_corporate);
        if (nameEl) nameEl.innerHTML =
          `${profile.nickname} ${nameTagHtml} ${u.sub ? subBadge() : '<span class="badge-main">メイン</span>'} ${profileBadges}`;
        document.getElementById('user-page-title').textContent = profile.nickname;
      } else if (profile.is_verified || profile.is_corporate) {
        // nickname がなくてもバッジだけ反映
        const nameEl = document.getElementById('user-page-name');
        if (nameEl) nameEl.innerHTML += ' ' + _buildProfileBadgeHtml(profile.is_verified, profile.is_corporate);
      }
      // user-page-badges は非表示（インライン化したため不要）
      if (badgesEl) badgesEl.style.display = 'none';
      // 地域・年代をメタエリアに反映（プライバシー設定を尊重）
      {
        const showGender = !!profile.show_gender;
        const showRegion = profile.show_region !== false;
        const showAge    = !!profile.show_age;
        const pref   = profile.region || '';
        const city   = profile.city   || '';
        const gender = profile.gender ? (profile.gender === 'male' ? '男性' : '女性') : '';
        const dob    = profile.dob || '';
        const decadeMatch = dob.match(/(\d{4})年代/);
        const decade = decadeMatch ? decadeMatch[1] + '年代' : '';
        const metaEl = document.getElementById('user-page-meta');
        if (metaEl && !u.sub) {
          const parts = [
            (showGender && gender) ? `<span><i class="ti ti-user"></i> ${gender}</span>` : '',
            (showAge    && decade) ? `<span><i class="ti ti-calendar"></i> ${decade}</span>` : '',
            (showRegion && (pref || city)) ? `<span><i class="ti ti-map-pin"></i> ${[pref, city].filter(Boolean).join(' ')}</span>` : '',
          ].filter(Boolean);
          metaEl.innerHTML = parts.join('');
          metaEl.style.display = parts.length ? '' : 'none';
        }
      }
      // カテゴリー（Supabase から取得して USER_PROFILES に反映）
      // ※ 投票が含まれるため、常にSupabaseの最新データで上書きする
      if (!USER_PROFILES[handle]) USER_PROFILES[handle] = { categories: [] };
      if (Array.isArray(profile.categories)) {
        USER_PROFILES[handle].categories = profile.categories;
      }
      renderUserPageCats(handle);
      // 称号バッジ（display_badges カラムに保存された最大3個を表示）
      const _upBadgesRow = document.getElementById('user-page-display-badges');
      if (_upBadgesRow) {
        const _dispBadges = Array.isArray(profile.display_badges)
          ? profile.display_badges.filter(Boolean) : [];
        if (_dispBadges.length > 0) {
          _upBadgesRow.innerHTML = _dispBadges.map(b =>
            `<div style="width:50px;overflow:hidden;border-radius:7px;flex-shrink:0">${_renderBadgeCard(b, false, true)}</div>`
          ).join('');
          _upBadgesRow.style.display = '';
        } else {
          _upBadgesRow.style.display = 'none';
        }
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
          db_id       : p.id,
          catId       : p.cat_id          || null,
          text        : p.content,
          likes       : p.likes_count     || 0,
          rt          : p.rt_count        || 0,
          views       : p.views_count     || 0,
          time        : _relativeTime(p.created_at),
          ai          : p.ai_type         || 'none',
          mediaData   : p.media_data      || null,
          mediaType   : p.media_type      || null,
          linkUrl     : p.link_url        || null,
          imageLinkUrl: p.image_link_url  || null,
          tags        : Array.isArray(p.tags) ? p.tags : [],
          rank        : 0,
          isDummy     : false,
          user        : {
            h      : p.user_handle,
            n      : p.user_name,
            av     : p.is_sub ? '匿' : (avImg || (p.user_name || '?')[0].toUpperCase()),
            bg     : '#3b82f6',
            tc     : '#ffffff',
            sub    : p.is_sub,
            nameTag: p.name_tag || profNameTag,
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
        ? `<div class="tweet-media">${t.imageLinkUrl
            ? `<a href="${encodeURI(t.imageLinkUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"><img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" style="cursor:pointer"></a>`
            : `<img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" onclick="event.stopPropagation();openImageViewer(this.src)">`
          }</div>`
        : `<div class="tweet-media"><video src="${t.mediaData}" controls class="tweet-media-vid" preload="metadata"></video></div>`)
    : (mediaType === 'image'
        ? '<div class="tweet-media-placeholder"><i class="ti ti-photo"></i> 画像</div>'
        : mediaType === 'video'
        ? '<div class="tweet-media-placeholder video"><i class="ti ti-video"></i> 動画</div>'
        : '');
  return `<div class="tweet-card" data-db-id="${t.db_id||''}">
    ${_tweetAvHtml('tweet-av clickable', `background:${u.bg};color:${u.tc};overflow:hidden`, u.av, u, `openUserPage('${u.h}')`)}
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
        ${t.text ? `<div class="tweet-text">${_linkify(t.text)}</div>` : ''}
        ${mediaBlock}
      </div>
      ${t.linkUrl ? `<div style="padding:0 0 4px">${_urlBtnHTML(t.linkUrl)}</div>` : ''}
      <div class="tweet-actions">
        <button class="action-btn reply-btn" onclick="openTweetDetail(${idx})"><i class="ti ti-message-circle"></i><span id="reply-count-${idx}">${(tweetReplies[idx]||[]).length||''}</span></button>
        <button class="action-btn like-btn${likedTweets.has(idx)?' liked':''}" onclick="toggleLike(${idx},this)">${t.likeEmoji ? `<span class="like-emoji-display">${t.likeEmoji}</span>` : `<i class="ti ti-heart${likedTweets.has(idx)?'-filled':''}" style="${likedTweets.has(idx)?'color:#e11d48':''}"></i>`}<span class="like-count">${fmt(t.likes)}</span></button>
        <span class="action-btn" style="pointer-events:none;cursor:default"><i class="ti ti-eye"></i><span>${fmt(t.views)}</span></span>
      </div>
    </div>
  </div>`;
}

// ── カテゴリー表示をすべてリセット ────────────────────────────
function resetAllCatVisible() {
  CATS_DATA.forEach(c => { catVisible[c.id] = true; });
  catOrder = CATS_DATA.filter(c => c.id !== 'all').map(c => c.id);
  localStorage.removeItem('trendy_cat_order_user'); // ユーザー独自順もリセット
  renderCatSettings();
  renderCatGrid();
  showToast('カテゴリー表示・並び順をリセットしました', 'success');
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

// ══════════════════════════════════════════
// 外部トレンド
// ══════════════════════════════════════════

// 外部ニュースキャッシュ（全記事を1回取得してカテゴリー別にフィルタリング）
// ══════════════════════════════════════════
// 外部投稿同期（NHK ニュース → posts テーブル）
// ══════════════════════════════════════════

let _extSyncedAt = 0;
const _EXT_SYNC_TTL = 10 * 60 * 1000; // 10分

// カテゴリー自動判定キーワード
const _EXT_CAT_KW = {
  anime:    ['アニメ', 'マンガ', 'コミック', 'ジブリ', 'ワンピース', '鬼滅', '呪術', '推しの子', 'ガンダム'],
  manga:    ['漫画', '週刊少年', '少年ジャンプ', '連載', '集英社漫画', '小学館漫画'],
  game:     ['ゲーム', '任天堂', 'Nintendo', 'PS5', 'PlayStation', 'Xbox', 'Steam', 'eスポーツ'],
  music:    ['音楽', '歌手', 'ライブ', 'コンサート', 'アルバム', 'リリース', 'Vtuber', 'ボカロ'],
  video:    ['動画', 'YouTube', '配信', 'ストリーミング', 'Netflix', '映画', '映像'],
  politics: ['首相', '政府', '国会', '選挙', '政治', '内閣', '議員', '与党', '野党', '法案', '外交'],
  voice:    ['声優', 'ラジオ', 'ポッドキャスト', 'ASMR'],
};

function _detectCatId(title) {
  for (const [catId, kws] of Object.entries(_EXT_CAT_KW)) {
    if (kws.some(kw => title.includes(kw))) return catId;
  }
  return 'tweet'; // デフォルトはつぶやきカテゴリー
}

async function syncExternalPosts() {
  if (Date.now() - _extSyncedAt < _EXT_SYNC_TTL) return;
  _extSyncedAt = Date.now(); // 多重起動防止（失敗時は後でリセット）

  try {
    // NHK ニュース RSS 取得
    const rssUrl = 'https://www3.nhk.or.jp/rss/news/cat0.xml';
    const apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl);
    const res  = await fetch(apiUrl);
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(json.message);

    const posts = (json.items || []).slice(0, 20).map((item, i) => {
      const title = item.title?.trim() || '';
      const rank  = i + 1;
      return {
        user_handle   : '@ext_nhk',
        user_name     : 'NHK NEWS',
        content       : title,
        cat_id        : _detectCatId(title),
        tags          : [],
        ext_source    : 'nhk',
        ext_url       : item.link || '',
        ext_pop_score : Math.max(50, 600 - rank * 50), // 1位=550, 2位=500…10位=100
        created_at    : item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      };
    }).filter(p => p.ext_url);

    await dbUpsertExtPosts(posts);
    // ランキングキャッシュを破棄して再取得
    _rankCache = { period: null, data: [], fetchedAt: 0 };
    await _loadRankData(true);
    renderCatGrid();
  } catch (e) {
    _extSyncedAt = 0; // 失敗時は次回再試行できるようリセット
    console.warn('[ext] NHK sync failed:', e.message);
  }
}

// ── pixiv ランキング同期 ──────────────────────────────────

let _pixivSyncedAt = 0;
const _PIXIV_SYNC_TTL = 10 * 60 * 1000;

// pixivタグ → PEAKR カテゴリー
const _PIXIV_TAG_CAT = {
  anime:    ['アニメ', 'anime', 'イラスト', '二次創作', 'ファンアート'],
  manga:    ['漫画', 'manga', '4コマ', 'コミック'],
  game:     ['ゲーム', 'game', 'FGO', '原神', 'ウマ娘', 'プロセカ', 'ブルアカ'],
  music:    ['音楽', 'music', 'ボカロ', 'VOCALOID', 'Vtuber', '歌ってみた'],
  voice:    ['声優', 'ASMR'],
  politics: ['政治', '社会'],
};

function _detectCatFromPixivTags(tags) {
  if (!Array.isArray(tags)) return 'anime';
  for (const [catId, kws] of Object.entries(_PIXIV_TAG_CAT)) {
    if (tags.some(tag => kws.some(kw => tag.includes(kw)))) return catId;
  }
  return 'anime'; // pixiv はデフォルトをアニメ/イラストカテゴリーに
}

const _PIXIV_MODES = ['weekly', 'monthly', 'original', 'rookie'];

async function syncPixivPosts() {
  if (Date.now() - _pixivSyncedAt < _PIXIV_SYNC_TTL) return;
  _pixivSyncedAt = Date.now();
  try {
    // 4モードを並行取得（weekly/monthly/original/rookie 各200件 = 計最大800件）
    const results = await Promise.allSettled(
      _PIXIV_MODES.map(mode =>
        fetch(`/.netlify/functions/pixiv-ranking?mode=${mode}`)
          .then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status))
      )
    );

    const allItems = results.flatMap((r, i) => {
      if (r.status !== 'fulfilled') {
        console.warn(`[ext] pixiv ${_PIXIV_MODES[i]} failed`);
        return [];
      }
      return r.value.items || [];
    });

    if (!allItems.length) throw new Error('all modes failed');

    // ext_url で重複除去（複数モードに同じ作品が入る場合）
    const seen = new Set();
    const unique = allItems.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

    const posts = unique.map(item => ({
      user_handle   : '@ext_pixiv_' + item.author_id,
      user_name     : item.author || 'pixiv作者',
      content       : item.title,
      cat_id        : _detectCatFromPixivTags(item.tags),
      tags          : item.tags.slice(0, 5).map(t => '#' + t),
      media_type    : 'image',
      media_data    : item.thumb,
      ext_source    : 'pixiv',
      ext_url       : item.url,
      // ブックマーク数を対数スケールでスコア化（1万ブックマーク≒800点）
      ext_pop_score : item.bookmarks > 0
        ? Math.min(1000, Math.floor(Math.log10(item.bookmarks + 1) * 200))
        : Math.max(10, 700 - item.rank * 3),
      created_at    : new Date().toISOString(),
    }));

    await dbUpsertExtPosts(posts);
    _rankCache = { period: null, data: [], fetchedAt: 0 };
    await _loadRankData(true);
    renderCatGrid();
  } catch (e) {
    _pixivSyncedAt = 0;
    console.warn('[ext] pixiv sync failed:', e.message);
  }
}


// ══════════════════════════════════════════
// 🎲 ガチャ
// ══════════════════════════════════════════

const BOOST_AMOUNTS = { boost_lg: 1000, boost_ssr: 100, boost_sr: 30, boost_r: 5, boost_n: 1 };
const RARITY_COLORS = { LG: '#ef4444', SSR: '#f59e0b', SR: '#8b5cf6', R: '#3b82f6', N: '#6b7280' };

// ── 絵文字プール（SR=50, SSR=35, LG=15） ──────
const EMOJI_POOL = {
  LG: [
    '❤️','🎉','🔥','💯','👑','🌟','💎','🥇','🏆','⭐','💝','🦄','🌈','✨','💖',
  ],
  SSR: [
    '😍','🥰','😘','💕','💞','💓','💗','💘','💙','💜','💚','💛','🧡','🖤','🤍',
    '🤎','🌹','🌷','🌸','🌺','🌼','🌻','🎀','🍓','🍒','🎂','🧁','🍰','🍭','🍩',
    '🦋','🐰','🐱','🐶','🐼',
  ],
  SR: [
    '👍','👏','🙌','👌','🤝','✋','🤘','✌️','🤞','🤟','🙏','💪',
    '😀','😄','😆','😁','😂','🤣','😊','😎','🤩','🥳','😋','🤤','🤗','🤔','🤭','🙃','🙂',
    '😺','😸','😻','🐾',
    '🌙','☀️','⚡','🌊','🔮','🎁','🎊','🎈','🎶','🎵','🎤',
    '🍀','🌿','🍂','🍁','⚽','🏀',
  ],
};
// R レアでも SR の絵文字を出して入手機会を増やす
const R_EMOJI_RATE = 0.3; // R 35% × 30% = 10.5% の確率で絵文字
// 絵文字ID生成（emoji_LG_001 のような形）
const EMOJI_ID = {}; // emoji_id → 絵文字
const EMOJI_INFO = {}; // emoji_id → {rarity, emoji}
Object.entries(EMOJI_POOL).forEach(([rarity, list]) => {
  list.forEach((emj, i) => {
    const id = `emoji_${rarity}_${String(i+1).padStart(3,'0')}`;
    EMOJI_ID[id] = emj;
    EMOJI_INFO[id] = { rarity, emoji: emj };
  });
});

// レアリティ別の総確率（合計100%）
const RARITY_PROBS = { LG: 0.01, SSR: 2.99, SR: 12, R: 35, N: 50 };
// そのレアリティ内で絵文字が出る確率（残りはブースト）
const EMOJI_RATE_IN_RARITY = { LG: 0.7, SSR: 0.75, SR: 0.65 };

const GACHA_ITEMS = [
  { id: 'boost_lg',  label: 'ブーストLG',  rarity: 'LG',  boost: 1000 },
  { id: 'boost_ssr', label: 'ブーストSSR', rarity: 'SSR', boost: 100  },
  { id: 'boost_sr',  label: 'ブーストSR',  rarity: 'SR',  boost: 30   },
  { id: 'boost_r',   label: 'ブーストR',   rarity: 'R',   boost: 5    },
  { id: 'boost_n',   label: 'ブーストN',   rarity: 'N',   boost: 1    },
];

let _gachaItems = {}; // キャッシュ

function _rollOne() {
  // 1) レアリティ抽選
  const r = Math.random() * 100;
  let cum = 0;
  let rarity = 'N';
  for (const [rar, p] of Object.entries(RARITY_PROBS)) {
    cum += p;
    if (r < cum) { rarity = rar; break; }
  }

  // 2) そのレアリティで絵文字が出るか抽選
  let emojiRarity = null;
  if (EMOJI_POOL[rarity] && Math.random() < (EMOJI_RATE_IN_RARITY[rarity] || 0)) {
    emojiRarity = rarity;
  } else if (rarity === 'R' && Math.random() < R_EMOJI_RATE) {
    // Rでも一定確率でSR絵文字が出る
    emojiRarity = 'SR';
  }
  if (emojiRarity) {
    const pool = EMOJI_POOL[emojiRarity];
    const idx = Math.floor(Math.random() * pool.length);
    const id = `emoji_${emojiRarity}_${String(idx+1).padStart(3,'0')}`;
    return { id, label: pool[idx], rarity: emojiRarity, type: 'emoji', emoji: pool[idx] };
  }

  // 3) ブースト
  return GACHA_ITEMS.find(i => i.rarity === rarity) || GACHA_ITEMS[GACHA_ITEMS.length - 1];
}

async function renderGachaPage() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  _gachaItems = await dbGetUserItems(aid);
  await _loadMyPoints();
  const ticketEl = document.getElementById('gacha-ticket-count');
  if (ticketEl) ticketEl.textContent = _myPoints.toLocaleString();
  _renderGachaInventory();
  _updateGachaNavBadge();
}

function _renderGachaInventory() {
  const el = document.getElementById('gacha-inventory');
  if (!el) return;
  const boostItems = GACHA_ITEMS.filter(i => (_gachaItems[i.id] || 0) > 0);
  const emojiItems = Object.entries(EMOJI_INFO)
    .filter(([id]) => (_gachaItems[id] || 0) > 0)
    .map(([id, info]) => ({ id, ...info, qty: _gachaItems[id] }));

  if (!boostItems.length && !emojiItems.length) {
    el.innerHTML = '<div class="gacha-inv-empty">所持アイテムなし</div>';
    return;
  }

  let html = '';
  if (boostItems.length) {
    html += `<div class="gacha-inv-title"><i class="ti ti-rocket"></i> ブーストアイテム</div>`;
    html += boostItems.map(i => `
      <div class="gacha-inv-row">
        <span class="rarity-${i.rarity.toLowerCase()}">${i.rarity}</span>
        <span class="gacha-inv-label">${i.label}（+${i.boost}スコア）</span>
        <span class="gacha-inv-qty">${_gachaItems[i.id]}枚</span>
      </div>`).join('');
  }
  if (emojiItems.length) {
    html += `<div class="gacha-inv-title" style="margin-top:14px"><i class="ti ti-mood-smile"></i> いいね絵文字</div>`;
    html += `<div class="gacha-emoji-grid">` +
      emojiItems.map(e =>
        `<div class="gacha-emoji-item rarity-bg-${e.rarity.toLowerCase()}" title="${e.rarity}">
          <span class="gacha-emoji-char">${e.emoji}</span>
          <span class="gacha-emoji-rarity">${e.rarity}</span>
        </div>`
      ).join('') +
      `</div>`;
    html += `<div style="margin-top:10px;text-align:center"><a onclick="goPage('mypage',null);setTimeout(()=>document.querySelector('.mypage-like-emoji-btn')?.click(),300)" style="font-size:12px;color:var(--accent);cursor:pointer">マイページでいいね絵文字を設定 →</a></div>`;
  }
  el.innerHTML = html;
}

function _updateGachaNavBadge() {
  const badge = document.getElementById('gacha-nav-badge');
  if (badge) badge.style.display = 'none';
}

async function doGacha(count) {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  const cost = 100 * count;
  if (_myPoints < cost) {
    showToast(`コインが足りません（所持: ${_myPoints} / 必要: ${cost}）`, 'error'); return;
  }
  // ピークコイン消費
  const ok = await dbUsePoints(aid, cost);
  if (!ok) { showToast('コインの消費に失敗しました', 'error'); return; }
  _myPoints -= cost;
  const ticketEl = document.getElementById('gacha-ticket-count');
  if (ticketEl) ticketEl.textContent = _myPoints.toLocaleString();

  // 抽選
  let results = Array.from({ length: count }, () => _rollOne());

  // カットイン抽選
  const cutins = _rollGachaCutins();
  const preCutins  = cutins.filter(c => c.type === 'shake' || c.type === 'blackout');
  const postCutins = cutins.filter(c => c.type === 'henpen' || c.type === 'chain');

  // pre演出（振動・ブラックアウト）→ 結果書き換え
  const hasBlackout = preCutins.some(c => c.type === 'blackout');
  if (preCutins.length) {
    await _playGachaCutins(preCutins);
    results = _applyGachaCutins(results, preCutins);
  }

  // タメ演出（2秒）→ 結果表示。ブラックアウト時はタメをスキップして即結果
  if (!hasBlackout) {
    await _playGachaSuspense(results);
  }
  _showGachaResult(results);

  // post演出：確変・連続確変があればクリック待ち → 結果上書き
  let finalResults = results;
  if (postCutins.length) {
    finalResults = await _waitForKakuhenClick(results, postCutins);
  }

  // アイテム加算（最終結果で）
  const gained = {};
  for (const item of finalResults) {
    gained[item.id] = (gained[item.id] || 0) + 1;
  }
  await Promise.all(Object.entries(gained).map(([id, qty]) => dbAddItem(aid, id, qty)));
  for (const [id, qty] of Object.entries(gained)) {
    _gachaItems[id] = (_gachaItems[id] || 0) + qty;
  }

  _renderGachaInventory();
  _updateGachaNavBadge();
}

// 確変クリック待ち：結果表示後、ユーザーがどこかをクリックすると金エフェクトで結果上書き
function _waitForKakuhenClick(results, postCutins) {
  return new Promise(resolve => {
    // 画面下にヒント
    const hint = document.createElement('div');
    hint.id = 'gacha-kakuhen-hint';
    hint.className = 'gacha-kakuhen-hint';
    hint.innerHTML = '<i class="ti ti-hand-finger"></i> どこかをタップ…？';
    document.body.appendChild(hint);

    const onClick = async () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('touchstart', onClick, true);
      hint.remove();

      const stage = document.getElementById('gacha-stage');
      const resultEl = document.getElementById('gacha-result');

      // ガチャページに戻ってない場合は戻す
      if (!document.getElementById('page-gacha')?.classList.contains('active')) {
        goPage('gacha', null);
        await new Promise(r => setTimeout(r, 200));
      }

      // 1) 結果カードを消す
      if (resultEl) {
        resultEl.style.opacity = '0';
        resultEl.style.transition = 'opacity 0.25s ease';
      }
      await new Promise(r => setTimeout(r, 250));

      // 2) ステージ枠内に金色オーバーレイを表示（持続）
      if (stage) stage.classList.add('gacha-kakuhen-gold');
      if (resultEl) {
        resultEl.style.display = 'none';
        resultEl.style.opacity = '';
        resultEl.style.transition = '';
      }

      // 3) 結果を計算
      const newResults = _applyGachaCutins(results, postCutins);

      // 4) タメ時間（金色背景を見せる）
      await new Promise(r => setTimeout(r, 1400));

      // 5) 結果を表示（金色背景は残したまま）
      _showGachaResult(newResults);

      // 6) 結果カードが出てから0.6秒後に金色背景をフェードアウト
      await new Promise(r => setTimeout(r, 600));
      if (stage) {
        stage.classList.add('gacha-kakuhen-gold-out');
        setTimeout(() => {
          stage.classList.remove('gacha-kakuhen-gold','gacha-kakuhen-gold-out');
        }, 600);
      }

      resolve(newResults);
    };

    setTimeout(() => {
      document.addEventListener('click', onClick, true);
      document.addEventListener('touchstart', onClick, true);
    }, 100);
  });
}

// ══════════════════════════════════════════
// カットイン演出
// ══════════════════════════════════════════

const _RARITY_ASCEND = ['N','R','SR','SSR','LG'];
const _ITEM_BY_RARITY = { N:'boost_n', R:'boost_r', SR:'boost_sr', SSR:'boost_ssr', LG:'boost_lg' };
const _BOOST_BY_RARITY = { N:1, R:5, SR:30, SSR:100, LG:1000 };

// カットイン確率（開発者ページで変更可能）
const _CUTIN_RATES_DEFAULT = {
  shake:      0.10, // ページ振動の発動率
  blackout:   0.10, // ブラックアウトの発動率
  henpen:     0.10, // 確変の発動率
  chain:      0.10, // 連続確変の追加発動率
  shakeBonus: 0.20, // 振動発動時の他カットインへの上乗せ
};
let _cutinRates = { ..._CUTIN_RATES_DEFAULT };
// localStorage から復元
try {
  const saved = JSON.parse(localStorage.getItem('trendy_cutin_rates') || 'null');
  if (saved) _cutinRates = { ..._CUTIN_RATES_DEFAULT, ...saved };
} catch(e) {}

/** カットインを抽選（順序: 振動 → ブラックアウト → 確変 → 連続確変） */
function _rollGachaCutins() {
  const cutins = [];
  let extra = 0;

  if (Math.random() < _cutinRates.shake) {
    cutins.push({ type: 'shake' });
    extra = _cutinRates.shakeBonus;
  }
  if (Math.random() < _cutinRates.blackout + extra) {
    cutins.push({ type: 'blackout' });
  }
  if (Math.random() < _cutinRates.henpen + extra) {
    cutins.push({ type: 'henpen' });
    let chains = 0;
    while (Math.random() < _cutinRates.chain + extra && chains < 2) {
      chains++;
    }
    if (chains > 0) cutins.push({ type: 'chain', count: chains });
  }
  return cutins;
}

/** カットイン効果を結果に適用 */
function _applyGachaCutins(results, cutins) {
  const hasBlackout = cutins.some(c => c.type === 'blackout');
  const henpen = cutins.find(c => c.type === 'henpen') ? 1 : 0;
  const chain = cutins.find(c => c.type === 'chain')?.count || 0;
  const totalAscend = henpen + chain;

  // 最高レアの結果1つに効果適用（10連の場合）
  const rarityOrder = { LG: 5, SSR: 4, SR: 3, R: 2, N: 1 };
  let bestIdx = 0;
  results.forEach((r, i) => {
    if (rarityOrder[r.rarity] > rarityOrder[results[bestIdx].rarity]) bestIdx = i;
  });

  let newRarity = results[bestIdx].rarity;
  if (hasBlackout) {
    newRarity = 'SSR';
  } else if (totalAscend > 0) {
    const curIdx = _RARITY_ASCEND.indexOf(newRarity);
    const newIdx = Math.min(_RARITY_ASCEND.length - 1, curIdx + totalAscend);
    newRarity = _RARITY_ASCEND[newIdx];
  }

  if (newRarity !== results[bestIdx].rarity) {
    results[bestIdx] = {
      rarity: newRarity,
      label : 'ブースト' + newRarity,
      boost : _BOOST_BY_RARITY[newRarity],
      id    : _ITEM_BY_RARITY[newRarity],
    };
  }

  return results;
}

/** カットイン演出を順番に再生 */
async function _playGachaCutins(cutins) {
  for (const c of cutins) {
    await _playSingleCutin(c);
  }
}

function _playSingleCutin(cutin) {
  // ブラックアウトは専用CRT演出
  if (cutin.type === 'blackout') return _playBlackoutCutin();
  // 振動は単語なしの2秒振動
  if (cutin.type === 'shake')    return _playShakeCutin();

  // 確変系は単語表示なし（postでクリック待ち演出に統合）
  return Promise.resolve();
}

// ページ振動演出（単語なし、2秒間ステージが揺れる）
function _playShakeCutin() {
  return new Promise(resolve => {
    const stage = document.getElementById('gacha-stage');
    if (!stage) { resolve(); return; }
    stage.classList.add('gacha-stage-shake-strong');
    setTimeout(() => {
      stage.classList.remove('gacha-stage-shake-strong');
      resolve();
    }, 2000);
  });
}

// ブラックアウト＝昔のCRTテレビの電源OFF演出（4秒）
function _playBlackoutCutin() {
  return new Promise(resolve => {
    const overlay = document.getElementById('gacha-cutin');
    if (!overlay) { resolve(); return; }

    overlay.className = 'gacha-cutin gacha-cutin-crt';
    overlay.style.display = 'block';
    overlay.innerHTML = `
      <!-- 画面の縮小スクリーン（白→電源OFF） -->
      <div class="gacha-crt-screen"></div>
      <!-- 走査線 -->
      <div class="gacha-crt-scanline"></div>
      <!-- 中央の白い線（電源OFF直後の残像） -->
      <div class="gacha-crt-line"></div>
      <!-- 残光ドット -->
      <div class="gacha-crt-dot"></div>
      <!-- 真っ暗背景 -->
      <div class="gacha-crt-black"></div>
    `;

    setTimeout(() => {
      overlay.style.display = 'none';
      resolve();
    }, 4000);
  });
}

// ── 2秒のタメ演出（期待感を煽る） ──
function _playGachaSuspense(results) {
  return new Promise(resolve => {
    const rarityOrder = { LG: 5, SSR: 4, SR: 3, R: 2, N: 1 };
    const best = results.reduce((a, b) => rarityOrder[a.rarity] >= rarityOrder[b.rarity] ? a : b);

    const orb     = document.querySelector('.gacha-orb');
    const stage   = document.getElementById('gacha-stage');
    const iconWrap= document.getElementById('gacha-icon-wrap');
    const resultEl= document.getElementById('gacha-result');
    if (!orb || !stage) { resolve(); return; }

    // 結果を非表示にして中央オーブを表示
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    if (iconWrap) iconWrap.style.display = '';

    // クラスをリセット
    orb.classList.remove('gacha-charge-n','gacha-charge-r','gacha-charge-sr','gacha-charge-ssr','gacha-burst');
    stage.classList.remove('gacha-stage-shake','gacha-stage-flash');
    void orb.offsetWidth; // リフロー

    // 1) 0〜1.0s: 共通チャージ（白→金色がだんだん強くなる）
    orb.classList.add('gacha-charging');
    stage.classList.add('gacha-stage-shake');

    // 2) 1.0s時点：レアリティに応じて色変化（フェイクで途中SR色に → 切り替え）
    const teaseTimers = [];
    teaseTimers.push(setTimeout(() => {
      // フェイク：先に低レアっぽい色を見せる（外す可能性を演出）
      orb.classList.add('gacha-charge-r');
    }, 800));

    // 1.5s: 確定レア色に変わる（高レアは華やか、低レアはそのまま）
    teaseTimers.push(setTimeout(() => {
      orb.classList.remove('gacha-charge-r');
      orb.classList.add('gacha-charge-' + best.rarity.toLowerCase());
    }, 1500));

    // 1.9s: 弾けて結果を表示する直前のフラッシュ
    teaseTimers.push(setTimeout(() => {
      orb.classList.add('gacha-burst');
      stage.classList.add('gacha-stage-flash');
    }, 1900));

    // 2.1s: 終了
    teaseTimers.push(setTimeout(() => {
      orb.classList.remove('gacha-charging','gacha-burst','gacha-charge-n','gacha-charge-r','gacha-charge-sr','gacha-charge-ssr');
      stage.classList.remove('gacha-stage-shake','gacha-stage-flash');
      resolve();
    }, 2100));
  });
}

function _showGachaResult(results) {
  const stage = document.getElementById('gacha-stage');
  const iconWrap = document.getElementById('gacha-icon-wrap');
  const resultEl = document.getElementById('gacha-result');
  if (!stage || !resultEl) return;

  iconWrap.style.display = 'none';
  resultEl.style.display = '';

  // 最高レアリティを判定
  const rarityOrder = { LG: 5, SSR: 4, SR: 3, R: 2, N: 1 };
  const best = results.reduce((a, b) => rarityOrder[a.rarity] >= rarityOrder[b.rarity] ? a : b);
  const color = RARITY_COLORS[best.rarity];

  const renderDesc = (r) => {
    if (r.type === 'emoji') return `いいねの絵文字をGET！`;
    return `+${r.boost}スコア（${r.boost}閲覧相当）`;
  };
  const renderMain = (r) => {
    if (r.type === 'emoji') return `<div class="gacha-result-emoji">${r.emoji}</div>`;
    return '';
  };

  if (results.length === 1) {
    const b = best;
    resultEl.innerHTML = `
      <div class="gacha-result-single" style="--rarity-color:${color}">
        <div class="gacha-result-rarity" style="color:${color}">${b.rarity}</div>
        ${renderMain(b)}
        <div class="gacha-result-name">${b.label}</div>
        <div class="gacha-result-desc">${renderDesc(b)}</div>
      </div>
      <button class="gacha-close-btn" onclick="_resetGachaStage()">閉じる</button>`;
  } else {
    const rows = results.map(r =>
      `<div class="gacha-result-item" style="border-color:${RARITY_COLORS[r.rarity]}">
        <span class="rarity-${r.rarity.toLowerCase()}">${r.rarity}</span>
        ${r.type === 'emoji'
          ? `<span style="font-size:24px;line-height:1">${r.emoji}</span>`
          : `<span>${r.label}</span>
             <span style="color:var(--text3);font-size:11px">+${r.boost}</span>`}
      </div>`
    ).join('');
    resultEl.innerHTML = `
      <div class="gacha-result-multi">${rows}</div>
      <button class="gacha-close-btn" onclick="_resetGachaStage()">閉じる</button>`;
  }
}

function _resetGachaStage() {
  document.getElementById('gacha-icon-wrap').style.display = '';
  const r = document.getElementById('gacha-result');
  if (r) { r.style.display = 'none'; r.innerHTML = ''; }
}

// ブーストを投稿に適用
async function applyBoostToPost(postDbId, itemId) {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || !postDbId || !itemId) return;
  const boostAmt = BOOST_AMOUNTS[itemId];
  if (!boostAmt) return;
  const qty = _gachaItems[itemId] || 0;
  if (qty <= 0) { showToast('アイテムがありません', 'error'); return; }
  const ok1 = await dbConsumeItem(aid, itemId, 1);
  if (!ok1) { showToast('消費に失敗しました', 'error'); return; }
  const ok2 = await dbApplyBoost(postDbId, boostAmt);
  if (!ok2) {
    // ロールバック
    await dbAddItem(aid, itemId, 1);
    showToast('ブーストの適用に失敗しました', 'error'); return;
  }
  _gachaItems[itemId] = qty - 1;
  showToast(`🚀 ブースト適用！ +${boostAmt}スコアが加算されました`, 'success');
  // ランキングキャッシュをリセットして再取得
  _rankCache = { period: null, data: [], fetchedAt: 0 };
  _loadRankData();
}

// ══════════════════════════════════════════
// 😀 いいね絵文字
// ══════════════════════════════════════════

// 投稿フォーム用：選択した絵文字を pendingLikeEmoji に
async function openComposeLikeEmojiPicker() {
  await openLikeEmojiPicker({ mode: 'compose' });
}

async function openLikeEmojiPicker(opts = {}) {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  // 所持アイテムを最新化
  _gachaItems = await dbGetUserItems(aid);

  const ownedEmojis = Object.entries(EMOJI_INFO)
    .filter(([id]) => (_gachaItems[id] || 0) > 0)
    .map(([id, info]) => ({ id, ...info }));

  const body = document.getElementById('like-emoji-modal-body');
  if (!body) return;

  const isCompose = opts.mode === 'compose';
  const current = isCompose ? pendingLikeEmoji : myLikeEmoji;
  const selectFn = isCompose ? 'selectComposeLikeEmoji' : 'selectLikeEmoji';

  let html = `
    <div style="font-size:13px;color:var(--text2);margin-bottom:14px;line-height:1.6">
      ${isCompose
        ? 'この投稿のいいねボタンに表示する絵文字を選びます。<br>未投稿時はデフォルトの♡が表示されます。'
        : 'ガチャで入手した絵文字を選択できます。'}
    </div>
    <div class="like-emoji-section">
      <div class="like-emoji-section-title">現在の選択</div>
      <div class="like-emoji-current-box">
        <span class="like-emoji-current-icon">${current}</span>
        <button class="btn-sm" onclick="${selectFn}('❤️')">デフォルトに戻す</button>
      </div>
    </div>`;

  if (!ownedEmojis.length) {
    html += `
      <div class="like-emoji-empty">
        <i class="ti ti-mood-empty" style="font-size:36px;color:var(--text3);display:block;margin-bottom:10px"></i>
        <p>所持絵文字なし</p>
        <p style="font-size:12px;color:var(--text3);margin-top:6px">ガチャで絵文字をGETしよう！</p>
        <button class="btn-primary" style="margin-top:14px" onclick="closeLikeEmojiPicker();goPage('gacha',null)">ガチャを引く</button>
      </div>`;
  } else {
    const grouped = { LG: [], SSR: [], SR: [] };
    ownedEmojis.forEach(e => { if (grouped[e.rarity]) grouped[e.rarity].push(e); });
    for (const rar of ['LG','SSR','SR']) {
      if (!grouped[rar].length) continue;
      html += `
        <div class="like-emoji-section">
          <div class="like-emoji-section-title">
            <span class="rarity-${rar.toLowerCase()}">${rar}</span>
            <span style="color:var(--text3);font-size:11px;margin-left:6px">${grouped[rar].length}種</span>
          </div>
          <div class="like-emoji-grid">
            ${grouped[rar].map(e => `
              <button class="like-emoji-btn ${current === e.emoji ? 'selected' : ''}" onclick="${selectFn}('${e.emoji}')">
                <span class="like-emoji-btn-char">${e.emoji}</span>
              </button>
            `).join('')}
          </div>
        </div>`;
    }
  }

  body.innerHTML = html;
  document.getElementById('like-emoji-modal')?.classList.add('show');
  document.getElementById('like-emoji-overlay')?.classList.add('show');
}

// 投稿フォームで絵文字選択
function selectComposeLikeEmoji(emoji) {
  pendingLikeEmoji = emoji;
  const el = document.getElementById('compose-like-emoji-current');
  if (el) el.textContent = emoji;
  closeLikeEmojiPicker();
}

function closeLikeEmojiPicker() {
  document.getElementById('like-emoji-modal')?.classList.remove('show');
  document.getElementById('like-emoji-overlay')?.classList.remove('show');
}

async function selectLikeEmoji(emoji) {
  myLikeEmoji = emoji;
  localStorage.setItem('trendy_like_emoji', emoji);
  // マイページ表示更新
  const el = document.getElementById('mypage-like-emoji-current');
  if (el) el.textContent = emoji;
  // Supabase に保存
  const aid = localStorage.getItem('trendy_account_id');
  if (aid) {
    try {
      await db.from('profiles').update({ like_emoji: emoji }).eq('account_id', aid);
    } catch(e) {}
  }
  showToast(`いいね絵文字を ${emoji} に変更しました`, 'success');
  closeLikeEmojiPicker();
}

// ══════════════════════════════════════════
// 🛠️ 開発者ガチャ管理
// ══════════════════════════════════════════

const _DEV_ITEM_LABELS = {
  boost_lg:     'LG ブースト',
  boost_ssr:    'SSR ブースト',
  boost_sr:     'SR ブースト',
  boost_r:      'R ブースト',
  boost_n:      'N ブースト',
};

async function devBulkGiveItem() {
  const itemType = document.getElementById('dev-gacha-bulk-item')?.value;
  const qty = parseInt(document.getElementById('dev-gacha-bulk-qty')?.value || '1', 10);
  if (!itemType || qty <= 0) { showToast('数量が無効です', 'error'); return; }
  if (!confirm(`全ユーザーに「${_DEV_ITEM_LABELS[itemType]}」を ${qty}個 配布しますか？`)) return;

  const { data: profs } = await db.from('profiles').select('account_id');
  if (!profs || !profs.length) { showToast('対象ユーザーがいません', 'error'); return; }

  showToast(`${profs.length}人に配布中...`, 'info');
  await Promise.all(profs.map(p => dbAddItem(p.account_id, itemType, qty)));
  showToast(`✅ ${profs.length}人に配布完了`, 'success');
  renderDevGachaList();
  // 自分宛なら _gachaItems も更新
  if (profs.some(p => p.account_id === localStorage.getItem('trendy_account_id'))) {
    const aid = localStorage.getItem('trendy_account_id');
    _gachaItems = await dbGetUserItems(aid);
    _updateGachaNavBadge();
  }
}

async function devGiveItem() {
  const aid = document.getElementById('dev-gacha-target-id')?.value.trim();
  const itemType = document.getElementById('dev-gacha-target-item')?.value;
  const qty = parseInt(document.getElementById('dev-gacha-target-qty')?.value || '1', 10);
  if (!aid) { showToast('account_id を入力してください', 'error'); return; }
  if (!itemType || qty <= 0) { showToast('数量が無効です', 'error'); return; }

  const ok = await dbAddItem(aid, itemType, qty);
  if (ok) {
    showToast(`✅ ${aid} に「${_DEV_ITEM_LABELS[itemType]}」を ${qty}個 付与`, 'success');
    renderDevGachaList();
    if (aid === localStorage.getItem('trendy_account_id')) {
      _gachaItems = await dbGetUserItems(aid);
      _updateGachaNavBadge();
    }
  } else {
    showToast('付与に失敗しました', 'error');
  }
}

async function devTakeItem() {
  const aid = document.getElementById('dev-gacha-target-id')?.value.trim();
  const itemType = document.getElementById('dev-gacha-target-item')?.value;
  const qty = parseInt(document.getElementById('dev-gacha-target-qty')?.value || '1', 10);
  if (!aid) { showToast('account_id を入力してください', 'error'); return; }

  const ok = await dbConsumeItem(aid, itemType, qty);
  if (ok) {
    showToast(`✅ ${aid} から「${_DEV_ITEM_LABELS[itemType]}」を ${qty}個 削減`, 'success');
    renderDevGachaList();
    if (aid === localStorage.getItem('trendy_account_id')) {
      _gachaItems = await dbGetUserItems(aid);
      _updateGachaNavBadge();
    }
  } else {
    showToast('削減に失敗しました（所持数不足）', 'error');
  }
}

async function devResetUserItems() {
  const aid = document.getElementById('dev-gacha-target-id')?.value.trim();
  if (!aid) { showToast('account_id を入力してください', 'error'); return; }
  if (!confirm(`「${aid}」の所持アイテムを全て削除しますか？`)) return;

  const { error } = await db.from('user_items').delete().eq('account_id', aid);
  if (!error) {
    showToast('✅ 全アイテムを削除しました', 'success');
    renderDevGachaList();
    if (aid === localStorage.getItem('trendy_account_id')) {
      _gachaItems = {};
      _updateGachaNavBadge();
    }
  } else {
    showToast('削除に失敗しました: ' + error.message, 'error');
  }
}

// ── カットイン確率の編集 ──
function _loadCutinRatesUI() {
  document.getElementById('dev-cutin-shake').value      = Math.round(_cutinRates.shake * 100);
  document.getElementById('dev-cutin-shakeBonus').value = Math.round(_cutinRates.shakeBonus * 100);
  document.getElementById('dev-cutin-blackout').value   = Math.round(_cutinRates.blackout * 100);
  document.getElementById('dev-cutin-henpen').value     = Math.round(_cutinRates.henpen * 100);
  document.getElementById('dev-cutin-chain').value      = Math.round(_cutinRates.chain * 100);
}

function saveCutinRates() {
  const rates = {
    shake:      parseFloat(document.getElementById('dev-cutin-shake').value || 0) / 100,
    shakeBonus: parseFloat(document.getElementById('dev-cutin-shakeBonus').value || 0) / 100,
    blackout:   parseFloat(document.getElementById('dev-cutin-blackout').value || 0) / 100,
    henpen:     parseFloat(document.getElementById('dev-cutin-henpen').value || 0) / 100,
    chain:      parseFloat(document.getElementById('dev-cutin-chain').value || 0) / 100,
  };
  _cutinRates = rates;
  localStorage.setItem('trendy_cutin_rates', JSON.stringify(rates));
  showToast('✅ カットイン確率を保存しました', 'success');
}

function resetCutinRates() {
  if (!confirm('カットイン確率をデフォルトに戻しますか？')) return;
  _cutinRates = { ..._CUTIN_RATES_DEFAULT };
  localStorage.removeItem('trendy_cutin_rates');
  _loadCutinRatesUI();
  showToast('デフォルトに戻しました', 'success');
}

async function testCutin(type) {
  // ガチャページに移動して演出を強制発動
  if (!document.getElementById('page-gacha')?.classList.contains('active')) {
    goPage('gacha', null);
    await new Promise(r => setTimeout(r, 300));
  }
  if (type === 'shake') {
    await _playShakeCutin();
    showToast('振動テスト完了', 'success');
  } else if (type === 'blackout') {
    await _playBlackoutCutin();
    showToast('ブラックアウトテスト完了', 'success');
  } else if (type === 'henpen') {
    // 仮結果を表示してから確変
    _showGachaResult([{rarity:'N',label:'ブーストN',boost:1,id:'boost_n'}]);
    await new Promise(r => setTimeout(r, 400));
    await _waitForKakuhenClick(
      [{rarity:'N',label:'ブーストN',boost:1,id:'boost_n'}],
      [{type:'henpen'}]
    );
  }
}

async function renderDevGachaList() {
  const el = document.getElementById('dev-gacha-list');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--text3)">読み込み中...</p>';

  const { data, error } = await db
    .from('user_items')
    .select('account_id, item_type, quantity')
    .gt('quantity', 0)
    .order('account_id');

  if (error) { el.innerHTML = '<p style="color:#ef4444">エラー: ' + error.message + '</p>'; return; }
  if (!data || !data.length) { el.innerHTML = '<p style="color:var(--text3)">所持アイテムがあるユーザーはいません</p>'; return; }

  // account_id ごとにグループ化
  const grouped = {};
  data.forEach(r => {
    if (!grouped[r.account_id]) grouped[r.account_id] = [];
    grouped[r.account_id].push(r);
  });

  el.innerHTML = Object.entries(grouped).map(([aid, items]) => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px;display:flex;align-items:center;gap:6px">
        <i class="ti ti-user"></i> ${aid}
        <button class="btn-sm" style="margin-left:auto;font-size:11px;color:var(--text3)" onclick="document.getElementById('dev-gacha-target-id').value='${aid}'">編集対象に設定</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:12px">
        ${items.map(i => `<span style="background:var(--bg2);padding:3px 8px;border-radius:6px">${_DEV_ITEM_LABELS[i.item_type] || i.item_type}: <b>${i.quantity}</b></span>`).join('')}
      </div>
    </div>
  `).join('');
}

// 旧互換
function loadExternalTrends() { syncExternalPosts(); }
function setExtTab() {}

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
  renderAdHub();
}

function renderAdHub() {
  _loadMyPoints(); // 毎回Supabaseから最新残高を取得
}

// 新規広告作成ページ初期化
function renderAdCreatePage() {
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
  // デフォルト開始日を今日に
  const startInput = document.getElementById('ad-start-date');
  if (startInput && !startInput.value) {
    startInput.value = new Date().toISOString().split('T')[0];
  }
  // ポイント残高を表示
  const ptBalEl = document.getElementById('ad-pay-points-bal');
  if (ptBalEl) ptBalEl.textContent = _myPoints.toLocaleString();
  // 日数を1日にリセット
  _adDays = 1;
  _adPayMethod = 'money';
  document.querySelectorAll('#page-ad-create .ad-days-btn').forEach((b,i) => b.classList.toggle('active', i===0));
  document.querySelectorAll('#page-ad-create .ad-pay-btn').forEach((b,i) => b.classList.toggle('active', i===0));
  updateAdPreviewNew();
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

      if (profile === undefined) {
        // ネットワークエラー → ローカル認証にフォールバック（後続の catch で処理）
        throw new Error('dbFetchProfile returned undefined (network error)');
      }
      if (profile === null) {
        // Supabaseにプロフィールが存在しない → 登録されていないか、全リセット済み
        _showErr('このIDは登録されていません'); return;
      }

      if (profile.password_hash !== encoded) { _showErr('IDまたはパスワードが正しくありません'); return; }

      // Supabase のプロフィールをローカルに適用
      myNickname = profile.nickname || inputId;
      myBio      = profile.bio      || '';
      isDeveloper = profile.is_dev  || false;
      myHandle   = '@' + inputId;
      catPickerTargetHandle = myHandle;
      if (!USER_PROFILES[myHandle]) USER_PROFILES[myHandle] = { categories: [] }; // ログイン時は空カテゴリーで初期化（Supabaseから上書き）

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
      // ── ログイン時：前アカウントのプロフィールデータを必ずクリアしてから復元 ──
      const _LOGIN_CLEAR_KEYS = [
        'trendy_av', 'trendy_cover',
        'trendy_gender', 'trendy_dob', 'trendy_region', 'trendy_city', 'trendy_phone',
        'trendy_badge_verified_icon', 'trendy_badge_corporate_icon', 'trendy_last_sync',
        'trendy_myNameTag', 'trendy_earned_badges', 'trendy_display_badges',
        'trendy_saved_tweets', 'trendy_fav_folders', 'trendy_fav_folder_types',
        'trendy_cat_votes',  // カテゴリー投票状態もリセット
      ];
      _LOGIN_CLEAR_KEYS.forEach(k => localStorage.removeItem(k));
      // お気に入りメモリをリセット（新アカウントのデータをSupabaseから取り直す）
      savedTweets = [];
      favDbIds.clear();
      favFolders = [...FAV_DEFAULT_FOLDERS];
      favFolderTypes = { ...FAV_DEFAULT_TYPES };
      _lastFavSyncAt = 0; // クールダウンをリセットして強制同期を許可
      // カテゴリー投票メモリをリセット（別アカウントの投票状態が残らないよう）
      Object.keys(myVotes).forEach(k => delete myVotes[k]);
      // メモリ変数もリセット
      badgeVerifiedIcon = null;
      badgeCorporateIcon = null;
      myNameTag = '';
      // カバーのDOMをクリア
      const _loginCoverEl = document.getElementById('profile-cover-img');
      if (_loginCoverEl) { _loginCoverEl.style.backgroundImage = ''; }
      // 名前タグ表示をクリア
      const _ntDisp = document.getElementById('profile-name-tag-display');
      if (_ntDisp) { _ntDisp.textContent = ''; _ntDisp.style.display = 'none'; }

      // アバターをSupabaseから復元（なければイニシャル表示）
      if (profile.avatar_data) {
        localStorage.setItem('trendy_av', profile.avatar_data);
        _applyAvImage(profile.avatar_data);
      } else {
        ['my-av-display','home-av-display','sidebar-user-av','home-compose-av'].forEach(id => {
          const el = document.getElementById(id);
          if (el) { el.innerHTML = ''; el.textContent = (myNickname || inputId)[0] || '?'; }
        });
      }
      // カバーをSupabaseから復元（なければ空白）
      if (profile.cover_data) {
        localStorage.setItem('trendy_cover', profile.cover_data);
        _applyCoverImage(profile.cover_data);
      }
      // 名前タグをSupabaseから復元
      if (profile.name_tag) {
        myNameTag = profile.name_tag;
        localStorage.setItem('trendy_myNameTag', myNameTag);
        _applyNameTag();
      }
      // 称号バッジをSupabaseから復元
      if (Array.isArray(profile.display_badges) && profile.display_badges.length > 0) {
        localStorage.setItem('trendy_display_badges', JSON.stringify(profile.display_badges));
      }
      // その他プロフィールメタをSupabaseから復元
      if (profile.gender)  localStorage.setItem('trendy_gender', profile.gender);
      if (profile.dob)     localStorage.setItem('trendy_dob',    profile.dob);
      if (profile.region)  localStorage.setItem('trendy_region', profile.region);
      if (profile.city)    localStorage.setItem('trendy_city',   profile.city);
      if (profile.phone)   localStorage.setItem('trendy_phone',  profile.phone);

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
  // ログイン直後の不要な存在チェックを防ぐ（プロフィールが存在することは確認済み）
  _lastAccountExistCheck = Date.now();
  _profileNullCount = 0;
  showToast('ログインしました ✅', 'success');
  _startSessionTracking(); // セッション追跡開始
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
  _flushSessionTracking(); // ← ログアウト前にセッションを保存
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

let settingsProfile = { gender: 'male', region: '東京都', city: '', dobYear: 1990, dobMonth: 1, dobDay: 1 };
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
  } else if (field === 'prefecture') {
    titleEl.innerHTML = '<i class="ti ti-map-pin"></i> 都道府県の変更';
    const prefOpts = ['（未設定）', ...PREFECTURES].map(p => `<option value="${p}" ${settingsProfile.region===p?'selected':''}>${p}</option>`).join('');
    bodyEl.innerHTML = `
      <p style="font-size:12px;color:var(--text3);margin-bottom:14px">都道府県は他のユーザーに表示されます。<br>設定後は<b>1か月間変更できません</b>。</p>
      <select class="kids-select" id="edit-prefecture-select" style="width:100%">
        ${prefOpts}
      </select>`;
  } else if (field === 'city') {
    titleEl.innerHTML = '<i class="ti ti-building-community"></i> 市区町村の変更';
    const currentCities = (typeof PREFECTURE_CITIES !== 'undefined' && PREFECTURE_CITIES[settingsProfile.region]) || [];
    if (!settingsProfile.region || currentCities.length === 0) {
      bodyEl.innerHTML = `<p style="font-size:13px;color:var(--text3);padding:16px 0">先に都道府県を設定してください。</p>`;
    } else {
      const cityOpts = ['（未設定）', ...currentCities].map(c => `<option value="${c}" ${settingsProfile.city===c?'selected':''}>${c}</option>`).join('');
      bodyEl.innerHTML = `
        <p style="font-size:12px;color:var(--text3);margin-bottom:14px">現在の都道府県：<b>${settingsProfile.region}</b><br>市区町村は他のユーザーに表示されます。<br>設定後は<b>1か月間変更できません</b>。</p>
        <select class="kids-select" id="edit-city-select" style="width:100%">
          ${cityOpts}
        </select>`;
    }
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

/** 設定ページの地域ボタン + プライバシートグルを初期化（ページ表示時に呼ぶ） */
function _initSettingsRegionBtns() {
  renderMonthlyChangeBtn('settings-prefecture-change-wrap', 'prefecture', "openSettingsEdit('prefecture')", '変更');
  renderMonthlyChangeBtn('settings-city-change-wrap',       'city',       "openSettingsEdit('city')",       '変更');
  _renderAllPrivacyToggles();
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
    ['settings-gender-val','pe-gender-val'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = label;
    });
    localStorage.setItem('trendy_gender', label);
    if (_aid && typeof dbUpdateProfileMeta === 'function') dbUpdateProfileMeta(_aid, { gender: g.value });
    showToast('性別を変更しました', 'success');

  } else if (settingsEditField === 'prefecture') {
    const sel = document.getElementById('edit-prefecture-select');
    if (!sel || !sel.value || sel.value === '（未設定）') {
      // 未設定を選んだ場合はクリア
      settingsProfile.region = '';
      settingsProfile.city   = '';
      ['settings-prefecture-val','pe-prefecture-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '（未設定）'; });
      ['settings-city-val','pe-city-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '（未設定）'; });
      localStorage.removeItem('trendy_region');
      localStorage.removeItem('trendy_city');
      recordMonthlyChange('prefecture');
      if (_aid && typeof dbUpdateProfileMeta === 'function') dbUpdateProfileMeta(_aid, { region: '', city: '' });
      showToast('都道府県をクリアしました', 'success');
    } else {
      const newPref = sel.value;
      // 都道府県を変えたら市区町村はリセット
      settingsProfile.region = newPref;
      settingsProfile.city   = '';
      ['settings-prefecture-val','pe-prefecture-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = newPref; });
      ['settings-city-val','pe-city-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '（未設定）'; });
      localStorage.setItem('trendy_region', newPref);
      localStorage.removeItem('trendy_city');
      recordMonthlyChange('prefecture');
      if (_aid && typeof dbUpdateProfileMeta === 'function') dbUpdateProfileMeta(_aid, { region: newPref, city: '' });
      showToast('都道府県を変更しました', 'success');
    }
    // ボタンを更新
    renderMonthlyChangeBtn('pe-prefecture-change-wrap',       'prefecture', "openSettingsEditFromProfile('prefecture')", '変更');
    renderMonthlyChangeBtn('settings-prefecture-change-wrap', 'prefecture', "openSettingsEdit('prefecture')",            '変更');
    _updateMypageMeta();

  } else if (settingsEditField === 'city') {
    const citySel = document.getElementById('edit-city-select');
    if (!citySel) return;
    const newCity = (citySel.value && citySel.value !== '（未設定）') ? citySel.value : '';
    settingsProfile.city = newCity;
    const displayCity = newCity || '（未設定）';
    ['settings-city-val','pe-city-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = displayCity; });
    localStorage.setItem('trendy_city', newCity);
    recordMonthlyChange('city');
    if (_aid && typeof dbUpdateProfileMeta === 'function') dbUpdateProfileMeta(_aid, { city: newCity });
    showToast('市区町村を変更しました', 'success');
    // ボタンを更新
    renderMonthlyChangeBtn('pe-city-change-wrap',       'city', "openSettingsEditFromProfile('city')", '変更');
    renderMonthlyChangeBtn('settings-city-change-wrap', 'city', "openSettingsEdit('city')",            '変更');
    _updateMypageMeta();

  } else if (settingsEditField === 'dob') {
    const y = parseInt((document.getElementById('edit-dob-year') || {}).value);
    const m = parseInt((document.getElementById('edit-dob-month') || {}).value);
    const d = parseInt((document.getElementById('edit-dob-day') || {}).value);
    if (!y || !m || !d) { showToast('生年月日をすべて選択してください', 'warn'); return; }
    settingsProfile.dobYear = y; settingsProfile.dobMonth = m; settingsProfile.dobDay = d;
    const decade = Math.floor(y / 10) * 10;
    const displayText = `${y}年${m}月${d}日 / ${decade}年代`;
    ['settings-dob-val','pe-dob-val'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = displayText;
    });
    localStorage.setItem('trendy_dob', displayText);
    if (_aid && typeof dbUpdateProfileMeta === 'function') dbUpdateProfileMeta(_aid, { dob: displayText });
    _updateMypageMeta();
    showToast('生年月日を変更しました', 'success');
  }

  closeSettingsEdit();
}

// ══════════════════════════════════════════
// ホーム検索
// ══════════════════════════════════════════

let _hsTab       = 'posts';   // 'posts' | 'accounts'
let _hsTimer     = null;
let _hsPostCache = [];        // 検索結果の投稿を一時保存（index で参照）

function openHomeSearch() {
  const overlay = document.getElementById('home-search-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('home-search-input')?.focus(), 60);
}

function closeHomeSearch() {
  const overlay = document.getElementById('home-search-overlay');
  if (overlay) overlay.style.display = 'none';
  clearTimeout(_hsTimer);
}

function clearHomeSearch() {
  const input = document.getElementById('home-search-input');
  if (input) { input.value = ''; input.focus(); }
  document.getElementById('hs-clear-btn').style.display = 'none';
  document.getElementById('home-search-results').innerHTML = '';
}

function setHomeSearchTab(tab, btn) {
  _hsTab = tab;
  document.querySelectorAll('.hs-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const q = (document.getElementById('home-search-input')?.value || '').trim();
  if (q) _runHomeSearch(q);
}

function onHomeSearchInput() {
  const q = (document.getElementById('home-search-input')?.value || '').trim();
  const clrBtn = document.getElementById('hs-clear-btn');
  if (clrBtn) clrBtn.style.display = q ? '' : 'none';
  clearTimeout(_hsTimer);
  if (!q) { document.getElementById('home-search-results').innerHTML = ''; return; }
  _hsTimer = setTimeout(() => _runHomeSearch(q), 280);
}

async function _runHomeSearch(q) {
  const results = document.getElementById('home-search-results');
  if (!results) return;
  results.innerHTML = `<div class="hs-loading"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;font-size:24px"></i></div>`;
  if (_hsTab === 'accounts') {
    const data = await dbSearchProfiles(q);
    _renderHsAccounts(data, q);
  } else {
    const data = await dbSearchPosts(q);
    _renderHsPosts(data, q);
  }
}

function _hsEsc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _hsHighlight(text, q) {
  const esc = _hsEsc(text);
  if (!q) return esc;
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
  return esc.replace(re, '<mark class="hs-mark">$1</mark>');
}

function _renderHsAccounts(data, q) {
  const results = document.getElementById('home-search-results');
  if (!results) return;
  if (!data.length) {
    results.innerHTML = `<div class="hs-empty"><i class="ti ti-user-off"></i><div>「${_hsEsc(q)}」のアカウントが見つかりません</div></div>`;
    return;
  }
  const myId = localStorage.getItem('trendy_account_id');
  results.innerHTML = data.map(p => {
    const avContent = p.avatar_data
      ? `<img src="${p.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<span style="font-size:15px;font-weight:700">${(p.nickname||p.account_id||'?').slice(0,1)}</span>`;
    const isSelf = p.account_id === myId;
    const isFollowing = followingSet && followingSet.has('@' + p.account_id);
    const followBtn = !isSelf
      ? `<button class="hs-follow-btn${isFollowing ? ' hs-following' : ''}"
           onclick="event.stopPropagation();_hsToggleFollow('${p.account_id}',this)">
           ${isFollowing ? 'フォロー中' : 'フォロー'}
         </button>`
      : '';
    return `<div class="hs-user-item" onclick="openUserPage('@${p.account_id}');closeHomeSearch()">
      <div class="hs-av">${avContent}</div>
      <div class="hs-user-info">
        <div class="hs-nickname">${_hsHighlight(p.nickname || p.account_id, q)}</div>
        <div class="hs-handle">@${_hsEsc(p.account_id)}</div>
        ${p.bio ? `<div class="hs-bio">${_hsEsc((p.bio||'').slice(0,50))}${(p.bio||'').length>50?'…':''}</div>` : ''}
      </div>
      ${followBtn}
    </div>`;
  }).join('');
}

function _renderHsPosts(data, q) {
  const results = document.getElementById('home-search-results');
  if (!results) return;
  if (!data.length) {
    results.innerHTML = `<div class="hs-empty"><i class="ti ti-message-off"></i><div>「${_hsEsc(q)}」のつぶやきが見つかりません</div></div>`;
    return;
  }
  _hsPostCache = data; // インデックスで参照できるようにキャッシュ
  results.innerHTML = data.map((p, i) => {
    const diff = Date.now() - new Date(p.created_at).getTime();
    const m = Math.floor(diff/60000);
    const timeStr = m < 60 ? `${m}分前` : m < 1440 ? `${Math.floor(m/60)}時間前` : `${Math.floor(m/1440)}日前`;
    const avChar = (p.user_name || p.user_handle || '?').replace(/^@/,'').slice(0,1).toUpperCase();
    const hasImg = p.media_type === 'image' && p.media_data;
    return `<div class="hs-post-item" onclick="_hsOpenPost(${i})">
      <div class="hs-post-av">${avChar}</div>
      <div class="hs-post-body">
        <div class="hs-post-header">
          <span class="hs-post-name">${_hsEsc(p.user_name||p.user_handle)}</span>
          <span class="hs-post-handle">${_hsEsc(p.user_handle)}</span>
          <span class="hs-post-time">${timeStr}</span>
        </div>
        <div class="hs-post-content">${_hsHighlight(p.content, q)}</div>
        ${hasImg ? `<div class="hs-post-img"><img src="${p.media_data}" alt="" loading="lazy"></div>` : ''}
        <div class="hs-post-meta"><i class="ti ti-heart"></i> ${p.likes_count||0}</div>
      </div>
    </div>`;
  }).join('');
}

function _hsOpenPost(cacheIdx) {
  const p = _hsPostCache[cacheIdx];
  if (!p) return;
  closeHomeSearch();
  const t = {
    db_id:        p.id,
    text:         p.content,
    catId:        p.cat_id || null,
    likes:        p.likes_count    || 0,
    rt:           p.rt_count       || 0,
    views:        p.views_count    || 0,
    time:         _relativeTime(p.created_at),
    ai:           p.ai_type        || 'none',
    mediaData:    p.media_data     || null,
    mediaType:    p.media_type     || null,
    linkUrl:      p.link_url       || null,
    imageLinkUrl: p.image_link_url || null,
    tags:         Array.isArray(p.tags) ? p.tags : [],
    isDummy: false, rank: 0,
    user: {
      h:       p.user_handle,
      n:       p.user_name || p.user_handle,
      av:      (p.user_name||p.user_handle||'?').replace(/^@/,'').slice(0,1).toUpperCase(),
      bg:      '#3b82f6', tc: '#ffffff',
      sub:     p.is_sub,
      nameTag: p.name_tag || null,
    },
  };
  openTweetDetail(_reg(t));
}

async function _hsToggleFollow(accountId, btn) {
  const myId = localStorage.getItem('trendy_account_id');
  if (!myId) { showToast('ログインが必要です', 'warn'); return; }
  const result = await dbToggleFollow(myId, '@' + accountId);
  if (result === true) {
    btn.textContent = 'フォロー中';
    btn.classList.add('hs-following');
    if (followingSet) followingSet.add('@' + accountId);
  } else if (result === false) {
    btn.textContent = 'フォロー';
    btn.classList.remove('hs-following');
    if (followingSet) followingSet.delete('@' + accountId);
  }
}

// ── Feedback 意見箱 ────────────────────────────────────
let fbFilter    = 'all';
let fbSort      = 'new';
let fbAdminMode = false;
let _fbOpinions = [];          // Supabase から取得した意見一覧
let _fbMyVotes  = {};          // { opinion_id: 'like' | 'dislike' }

const FB_STATUS_STYLE = {
  '検討中':  { bg:'#dbeafe', tc:'#1e40af' },
  '対応予定':{ bg:'#d1fae5', tc:'#065f46' },
  '実装済み':{ bg:'#dcfce7', tc:'#166534' },
  '見送り':  { bg:'#fee2e2', tc:'#991b1b' },
};
const FB_CAT_ICON = { '機能要望':'💡', 'UIの改善':'🎨', 'バグ報告':'🐛', 'その他':'📝' };

/** HTMLエスケープ（意見箱専用） */
function _fbEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** 投稿時刻を「N分前」形式に変換 */
function _fbTimeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'たった今';
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}日前`;
  return new Date(isoStr).toLocaleDateString('ja-JP');
}

/** 意見箱ページを開く（Supabase からデータ取得 → 描画） */
async function openFeedbackPage() {
  // 管理バーは isDeveloper のみ表示
  const adminBar = document.getElementById('fb-admin-bar');
  if (adminBar) adminBar.style.display = isDeveloper ? '' : 'none';

  // ローディング表示
  const container = document.getElementById('fb-list');
  if (container) container.innerHTML = `<div class="fb-empty"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i><div>読み込み中...</div></div>`;

  const myId = localStorage.getItem('trendy_account_id');
  const [opinionsRes, votesRes] = await Promise.allSettled([
    dbFetchOpinions(),
    myId ? dbGetMyVotes(myId) : Promise.resolve({}),
  ]);

  _fbOpinions = (opinionsRes.status === 'fulfilled' ? opinionsRes.value : []) || [];
  _fbMyVotes  = (votesRes.status   === 'fulfilled' ? votesRes.value    : {}) || {};

  renderFeedbackPage();
}

function renderFeedbackPage() {
  // フィルター
  let list = fbFilter === 'all'
    ? [..._fbOpinions]
    : _fbOpinions.filter(o => o.category === fbFilter);

  // ソート
  if (fbSort === 'likes') list.sort((a, b) => b.likes - a.likes);
  else if (fbSort === 'hot') list.sort((a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes));
  else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // 新着

  const container = document.getElementById('fb-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<div class="fb-empty"><i class="ti ti-bulb-off"></i><div>意見がまだありません</div><div class="fb-empty-sub">最初の意見を投稿してみましょう</div></div>`;
    return;
  }

  container.innerHTML = list.map(o => {
    const myVote      = _fbMyVotes[o.id] || null;
    const sc          = FB_STATUS_STYLE[o.status] || null;
    const statusBadge = sc
      ? `<span class="fb-status-badge" style="background:${sc.bg};color:${sc.tc}">${o.status}</span>`
      : '';
    const catIcon  = FB_CAT_ICON[o.category] || '📝';
    const netScore = o.likes - o.dislikes;
    const timeStr  = _fbTimeAgo(o.created_at);
    const avChar   = (o.nickname || '匿').slice(0, 1);

    // 運営モード：ステータス変更 + 削除ボタン（isDeveloper のみ）
    const adminControls = (fbAdminMode && isDeveloper) ? `
      <div class="fb-admin-controls">
        <span class="fb-admin-ctrl-label"><i class="ti ti-shield-check"></i> 実装検討：</span>
        ${Object.keys(FB_STATUS_STYLE).map(s =>
          `<button class="fb-status-btn${o.status===s?' fb-status-active':''}"
            style="${o.status===s ? `background:${FB_STATUS_STYLE[s].bg};color:${FB_STATUS_STYLE[s].tc};border-color:${FB_STATUS_STYLE[s].tc}40` : ''}"
            onclick="setOpinionStatus('${o.id}','${s}')">${s}</button>`
        ).join('')}
        ${o.status ? `<button class="fb-status-btn fb-status-clear" onclick="setOpinionStatus('${o.id}',null)">✕ 解除</button>` : ''}
        <button class="fb-delete-btn" onclick="deleteOpinion('${o.id}')" title="この意見を削除">
          <i class="ti ti-trash"></i> 削除
        </button>
      </div>` : '';

    return `<div class="fb-item" id="fb-item-${o.id}">
      <div class="fb-item-head">
        <div class="fb-item-title-row">
          ${statusBadge}
          <span class="fb-item-title">${_fbEsc(o.title)}</span>
        </div>
        <span class="fb-cat-tag">${catIcon} ${o.category}</span>
      </div>
      ${o.text ? `<div class="fb-item-text">${_fbEsc(o.text)}</div>` : ''}
      <div class="fb-item-footer">
        <div class="fb-item-meta">
          <div class="fb-av" style="background:#dbeafe;color:#1e40af">${_fbEsc(avChar)}</div>
          <span class="fb-user">${_fbEsc(o.nickname || '匿名')}</span>
          <span class="fb-dot">·</span>
          <span class="fb-time">${timeStr}</span>
        </div>
        <div class="fb-votes">
          <button class="fb-vote-btn fb-like-btn${myVote==='like' ? ' fb-voted-like' : ''}" onclick="voteOpinion('${o.id}','like')">
            <i class="ti ti-thumbs-up"></i><span class="fb-like-cnt">${o.likes}</span>
          </button>
          <div class="fb-net-score${netScore>0?' fb-net-pos':netScore<0?' fb-net-neg':''}">${netScore>0?'+':''}${netScore}</div>
          <button class="fb-vote-btn fb-dislike-btn${myVote==='dislike' ? ' fb-voted-dislike' : ''}" onclick="voteOpinion('${o.id}','dislike')">
            <i class="ti ti-thumbs-down"></i><span class="fb-dislike-cnt">${o.dislikes}</span>
          </button>
        </div>
      </div>
      ${adminControls}
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
  if (!isDeveloper) { cb.checked = false; return; }
  fbAdminMode = cb.checked;
  renderFeedbackPage();
  showToast(fbAdminMode ? '運営モードON：ステータスを変更できます' : '運営モードOFF', 'info');
}

async function voteOpinion(opinionId, type) {
  const myId = localStorage.getItem('trendy_account_id');
  if (!myId) { showToast('ログインが必要です', 'warn'); return; }

  const result = await dbVoteOpinion(myId, opinionId, type);
  if (!result) return;

  // ローカル状態を更新
  _fbMyVotes[opinionId] = result.myVote;
  const o = _fbOpinions.find(x => x.id === opinionId);
  if (o) { o.likes = result.likes; o.dislikes = result.dislikes; }

  // DOM を差し替え（全再描画しない）
  const item = document.getElementById('fb-item-' + opinionId);
  if (!item) return;
  const netScore = result.likes - result.dislikes;
  item.querySelector('.fb-like-cnt').textContent    = result.likes;
  item.querySelector('.fb-dislike-cnt').textContent = result.dislikes;
  item.querySelector('.fb-like-btn').className    = `fb-vote-btn fb-like-btn${result.myVote==='like'    ? ' fb-voted-like'    : ''}`;
  item.querySelector('.fb-dislike-btn').className = `fb-vote-btn fb-dislike-btn${result.myVote==='dislike' ? ' fb-voted-dislike' : ''}`;
  const netEl = item.querySelector('.fb-net-score');
  if (netEl) {
    netEl.textContent = (netScore > 0 ? '+' : '') + netScore;
    netEl.className = `fb-net-score${netScore>0?' fb-net-pos':netScore<0?' fb-net-neg':''}`;
  }
}

async function setOpinionStatus(opinionId, status) {
  if (!isDeveloper) return;
  const ok = await dbSetOpinionStatus(opinionId, status || null);
  if (!ok) { showToast('ステータス更新に失敗しました', 'error'); return; }
  const o = _fbOpinions.find(x => x.id === opinionId);
  if (o) o.status = status || null;
  renderFeedbackPage();
  showToast(status ? `ステータスを「${status}」に設定しました` : 'ステータスを解除しました', 'success');
}

async function deleteOpinion(opinionId) {
  if (!isDeveloper) return;
  const o = _fbOpinions.find(x => x.id === opinionId);
  const titlePreview = o ? `「${o.title.slice(0, 20)}${o.title.length > 20 ? '…' : ''}」` : '';
  if (!confirm(`この意見${titlePreview}を削除しますか？\nこの操作は元に戻せません。`)) return;
  const ok = await dbDeleteOpinion(opinionId);
  if (!ok) { showToast('削除に失敗しました', 'error'); return; }
  _fbOpinions = _fbOpinions.filter(x => x.id !== opinionId);
  delete _fbMyVotes[opinionId];
  renderFeedbackPage();
  showToast('意見を削除しました', 'success');
}

async function submitOpinion() {
  const title = (document.getElementById('fb-title-input')?.value || '').trim();
  const text  = (document.getElementById('fb-text-input')?.value  || '').trim();
  const cat   = document.getElementById('fb-cat-select')?.value   || 'その他';
  const anon  = document.getElementById('fb-anon-chk')?.checked   || false;

  if (!title) { showToast('タイトルを入力してください', 'warn'); return; }

  const myId   = localStorage.getItem('trendy_account_id');
  const isSub  = myAccountType === 'sub';
  const useAnon = anon || isSub;

  const result = await dbSubmitOpinion({
    title,
    text,
    category:  cat,
    accountId: useAnon ? null : myId,
    nickname:  useAnon ? '匿名' : (myNickname || myId || '匿名'),
    isAnon:    useAnon,
  });

  if (!result) { showToast('投稿に失敗しました', 'error'); return; }

  // フォームリセット
  document.getElementById('fb-title-input').value       = '';
  document.getElementById('fb-text-input').value        = '';
  document.getElementById('fb-char-count').textContent  = '0';
  document.getElementById('fb-anon-chk').checked        = false;

  // ローカル配列の先頭に追加し、フィルター・ソートをリセットして再描画
  _fbOpinions.unshift(result);
  fbFilter = 'all';
  fbSort   = 'new';
  const allPill  = document.querySelector('#fb-cat-pills .pill');
  const newPill  = document.querySelector('#fb-sort-pills .pill');
  if (allPill) pillActive(allPill, 'fb-cat-pills');
  if (newPill) pillActive(newPill, 'fb-sort-pills');
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
  // ハブページ：サブページへのナビカードのみ（個別レンダリング不要）
}

// ── カテゴリー管理 ──────────────────────────────────────
function _getCatOverrides() {
  try { return JSON.parse(localStorage.getItem('trendy_cat_overrides') || '{}'); } catch(e) { return {}; }
}
function _saveCatOverrides(ov) {
  localStorage.setItem('trendy_cat_overrides', JSON.stringify(ov));
}

function renderDevCatEditor() {
  const list = document.getElementById('dev-cat-list');
  if (!list) return;

  const movable = CATS_DATA.filter(c => c.id !== 'all');
  list.innerHTML = CATS_DATA.map((c, idx) => {
    const isProtected = c.id === 'all';
    const isCustom = !CATS_ORIGINAL.some(o => o.id === c.id);
    const badge = isProtected ? '<span class="dev-cat-badge">固定</span>'
                : isCustom   ? '<span class="dev-cat-badge" style="background:#eff6ff;color:#2563eb">カスタム</span>'
                : '';
    const movIdx   = movable.findIndex(m => m.id === c.id);
    const canUp    = !isProtected && movIdx > 0;
    const canDown  = !isProtected && movIdx < movable.length - 1;
    return `<div class="dev-cat-row">
      <div class="dev-cat-icon" style="background:${c.color}22;color:${c.color}">
        <i class="ti ${c.icon || 'ti-category'}"></i>
      </div>
      <div class="dev-cat-info">
        <div class="dev-cat-name">${c.name}</div>
        <div class="dev-cat-meta">ID: ${c.id}</div>
      </div>
      ${badge}
      ${isProtected ? '<div style="width:68px"></div>' : `
        <div class="dev-cat-move-wrap">
          <button class="dev-cat-move" onclick="devMoveCat('${c.id}',-1)" ${canUp?'':'disabled'} title="上へ">
            <i class="ti ti-arrow-up"></i>
          </button>
          <button class="dev-cat-move" onclick="devMoveCat('${c.id}',1)" ${canDown?'':'disabled'} title="下へ">
            <i class="ti ti-arrow-down"></i>
          </button>
        </div>
        <button class="dev-cat-del" onclick="devDeleteCat('${c.id}')" title="削除">
          <i class="ti ti-trash"></i>
        </button>
      `}
    </div>`;
  }).join('');

  // 削除済みデフォルトカテゴリーの復元セクション
  const ov = _getCatOverrides();
  const deletedIds = ov.deleted || [];
  const restoreSection = document.getElementById('dev-cat-restore-section');
  const restoreList    = document.getElementById('dev-cat-restore-list');
  if (deletedIds.length > 0 && restoreSection && restoreList) {
    restoreSection.style.display = '';
    restoreList.innerHTML = deletedIds.map(id => {
      const orig = CATS_ORIGINAL.find(o => o.id === id);
      if (!orig) return '';
      return `<div class="dev-cat-row">
        <div class="dev-cat-icon" style="background:${orig.color}22;color:${orig.color}">
          <i class="ti ${orig.icon || 'ti-category'}"></i>
        </div>
        <div class="dev-cat-info">
          <div class="dev-cat-name">${orig.name}</div>
          <div class="dev-cat-meta" style="color:#ef4444">削除済み</div>
        </div>
        <button class="dev-cat-restore" onclick="devRestoreCat('${id}')" title="復元">
          <i class="ti ti-restore"></i> 復元
        </button>
      </div>`;
    }).join('');
  } else {
    if (restoreSection) restoreSection.style.display = 'none';
  }
}

function devMoveCat(id, dir) {
  // 'all' を除いた現在の順序
  const order = CATS_DATA.filter(c => c.id !== 'all').map(c => c.id);
  const i = order.indexOf(id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  localStorage.setItem('trendy_cat_order_default', JSON.stringify(order));
  // ユーザー独自順はデフォルト変更に追従させるためクリア
  // （クリアしたくない場合はここを削除）
  location.reload();
}

function devDeleteCat(id) {
  if (id === 'all') return;
  const cat = CATS_DATA.find(c => c.id === id);
  if (!cat) return;
  if (!confirm(`「${cat.name}」を削除しますか？\nランキングやダイブページから非表示になります。`)) return;

  const ov = _getCatOverrides();
  const isCustom = !CATS_ORIGINAL.some(o => o.id === id);
  if (isCustom) {
    ov.added = (ov.added || []).filter(c => c.id !== id);
  } else {
    ov.deleted = [...new Set([...(ov.deleted || []), id])];
  }
  _saveCatOverrides(ov);
  showToast(`「${cat.name}」を削除しました`, 'success');
  setTimeout(() => location.reload(), 800);
}

function devRestoreCat(id) {
  const ov = _getCatOverrides();
  ov.deleted = (ov.deleted || []).filter(d => d !== id);
  _saveCatOverrides(ov);
  const orig = CATS_ORIGINAL.find(o => o.id === id);
  showToast(`「${orig?.name || id}」を復元しました`, 'success');
  setTimeout(() => location.reload(), 800);
}

function devAddCat() {
  const name  = document.getElementById('dev-cat-name')?.value.trim();
  const icon  = (document.getElementById('dev-cat-icon')?.value.trim() || 'ti-category');
  const color = document.getElementById('dev-cat-color')?.value || '#3b82f6';
  const bar   = document.getElementById('dev-cat-bar')?.value   || color;

  if (!name) { showToast('カテゴリー名を入力してください', 'warn'); return; }
  if (CATS_DATA.some(c => c.name === name)) {
    showToast('同じ名前のカテゴリーが既に存在します', 'warn'); return;
  }
  // アイコンに ti- がなければ付与
  const iconClass = icon.startsWith('ti-') ? icon : `ti-${icon}`;

  const id = 'custom_' + Date.now().toString(36);
  const ov = _getCatOverrides();
  ov.added = ov.added || [];
  ov.added.push({ id, name, icon: iconClass, color, bar, subs: ['全体'], allSubs: [] });
  _saveCatOverrides(ov);
  showToast(`「${name}」を追加しました`, 'success');
  setTimeout(() => location.reload(), 800);
}

// ── お知らせ送信ページ ──
function renderDevAnnounce() {
  // 送信フォームはHTMLに静的定義済み。履歴をDBから取得して表示
  _loadAnnounceHistory();
}

async function _loadAnnounceHistory() {
  const el = document.getElementById('announce-history');
  if (!el) return;
  const { data, error } = await db
    .from('notifications')
    .select('text, hint, created_at')
    .eq('notif_type', 'announce')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error || !data || !data.length) {
    el.innerHTML = '<p class="settings-desc">まだ送信履歴がありません</p>';
    return;
  }
  // 同じ text + 同日の重複を除去
  const seen = new Set();
  const unique = data.filter(r => {
    const key = r.text + r.created_at?.slice(0, 10);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  el.innerHTML = unique.map(r => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:13px;font-weight:600;color:var(--text)">${r.text}</div>
      ${r.hint ? `<div style="font-size:12px;color:var(--text2);margin-top:3px">${r.hint}</div>` : ''}
      <div style="font-size:11px;color:var(--text3);margin-top:4px">${_relTime(r.created_at)}</div>
    </div>`).join('');
}

function _relTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function sendAnnouncement() {
  const title  = (document.getElementById('announce-title')?.value || '').trim();
  const body   = (document.getElementById('announce-body')?.value  || '').trim();
  const target = (document.getElementById('announce-target')?.value || '').trim().replace(/^@/, '');
  if (!title) { showToast('タイトルを入力してください', 'error'); return; }

  const btn = document.getElementById('announce-send-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> 送信中...'; }

  const result = await dbSendAnnouncement({ title, message: body, targetAccountId: target || null });

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> 送信する'; }

  if (result.ok) {
    showToast(`✅ ${result.count}件のアカウントに送信しました`, 'success');
    document.getElementById('announce-title').value  = '';
    document.getElementById('announce-body').value   = '';
    document.getElementById('announce-target').value = '';
    _loadAnnounceHistory();
  } else {
    showToast('送信に失敗しました', 'error');
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

    const devBtnStyle = a.is_dev
      ? 'background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd'
      : 'background:var(--bg2);color:var(--text3);border:1px solid var(--border)';
    const devBtnTitle = a.is_dev ? '開発者フラグをOFFにする' : '開発者フラグをONにする';

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
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          <button title="${devBtnTitle}"
            style="padding:5px 8px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;${devBtnStyle}"
            onclick="devToggleDevFlag('${a.account_id}', ${!!a.is_dev}, this)">
            <i class="ti ti-code" style="font-size:12px"></i> ${a.is_dev ? 'DEV ON' : 'DEV OFF'}
          </button>
          <button title="ピークコインを付与"
            style="padding:5px 8px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe"
            onclick="devGrantPoints('${a.account_id}', '${(a.nickname || a.account_id).replace(/'/g, "\\'")}')">
            <i class="ti ti-diamond" style="font-size:12px"></i>
          </button>
          <button class="dev-acct-delete-btn" onclick="devDeleteAccount('${a.account_id}', '${(a.nickname || a.account_id).replace(/'/g, "\\'")}')" ${isMe ? 'disabled title="自分のアカウントは削除できません"' : ''}>
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>`;
  }).join('');

  // 件数バッジを更新
  const badge = document.getElementById('dev-accounts-count');
  if (badge) badge.textContent = accounts.length + ' 件';
}

// ── ピークコイン付与 ──
function devGrantPoints(accountId, nickname) {
  if (!accountId) return;
  const modal = document.getElementById('dev-grant-points-modal');
  const nameEl = document.getElementById('dev-grant-points-name');
  const input  = document.getElementById('dev-grant-points-input');
  if (!modal) return;
  if (nameEl) nameEl.textContent = `${nickname}（@${accountId}）`;
  if (input)  input.value = '';
  modal.dataset.targetId = accountId;
  modal.dataset.targetName = nickname;
  modal.classList.add('show');
  document.getElementById('dev-grant-points-overlay')?.classList.add('show');
  setTimeout(() => input?.focus(), 100);
}

async function devGrantPointsConfirm() {
  const modal = document.getElementById('dev-grant-points-modal');
  if (!modal) return;
  const accountId = modal.dataset.targetId;
  const nickname  = modal.dataset.targetName;
  const input = document.getElementById('dev-grant-points-input');
  const amount = parseInt(input?.value || 0);

  if (!amount || amount < 1) { showToast('付与するポイント数を入力してください', 'error'); return; }
  if (amount > 9999999) { showToast('上限は9,999,999ptです', 'error'); return; }

  const btn = document.getElementById('dev-grant-points-confirm-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i>'; }

  let result = { ok: false, error: 'dbAddPoints が見つかりません' };
  if (typeof dbAddPoints === 'function') {
    result = await dbAddPoints(accountId, amount);
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> 付与する'; }

  if (!result?.ok) {
    const errMsg = result?.error || '不明なエラー';
    showToast(`付与に失敗しました：${errMsg}`, 'error');
    console.error('[DEV] ポイント付与失敗:', errMsg);
    return;
  }

  devGrantPointsClose();
  showToast(`@${accountId} に ${amount.toLocaleString()} コイン を付与しました（残高：${(result.points || 0).toLocaleString()} コイン）`, 'success');

  // 自分自身への付与の場合は表示を即時更新
  const myAccountId = localStorage.getItem('trendy_account_id');
  if (accountId === myAccountId && typeof _loadMyPoints === 'function') {
    await _loadMyPoints();
  }
}

function devGrantPointsClose() {
  document.getElementById('dev-grant-points-modal')?.classList.remove('show');
  document.getElementById('dev-grant-points-overlay')?.classList.remove('show');
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


// ── 広告管理ページ ──
async function renderDevAdsList() {
  const el = document.getElementById('dev-ads-list');
  if (!el) return;

  el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3)"><i class="ti ti-loader-2" style="font-size:20px;animation:spin 1s linear infinite"></i><br><span style="font-size:12px">読み込み中...</span></div>`;

  const ads = typeof dbFetchAllAds === 'function' ? await dbFetchAllAds() : [];

  const badge = document.getElementById('dev-ads-count');
  if (badge) badge.textContent = ads.length + ' 件';

  if (!ads.length) {
    el.innerHTML = `<p style="color:var(--text3);font-size:13px;text-align:center;padding:24px">広告データはありません</p>`;
    return;
  }

  el.innerHTML = ads.map(ad => {
    const statusLabel = ad.active ? '配信中' : '停止';
    const statusColor = ad.active ? '#10b981' : '#94a3b8';
    return `
      <div class="dev-acct-item" id="dev-ad-${ad.id}">
        <div class="dev-acct-av" style="background:${ad.bg || 'var(--bg2)'};color:${ad.tc || 'var(--text1)'};font-size:18px;flex-shrink:0">
          <i class="ti ti-speakerphone"></i>
        </div>
        <div class="dev-acct-info" style="flex:1;min-width:0">
          <div class="dev-acct-name" style="font-size:13px">${ad.advertiser || '(広告主不明)'}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ad.text || ''}</div>
          <div class="dev-acct-meta">¥${(ad.budget || 0).toLocaleString()} ／ <span style="color:${statusColor}">● ${statusLabel}</span></div>
        </div>
        <button class="dev-acct-delete-btn" onclick="devDeleteAd('${ad.id}', '${(ad.advertiser || '').replace(/'/g, "\\'")}')">
          <i class="ti ti-trash"></i>
        </button>
      </div>`;
  }).join('');
}

async function devDeleteAd(id, name) {
  if (!confirm(`広告「${name}」を削除しますか？\nこの操作は取り消せません。`)) return;
  const el = document.getElementById(`dev-ad-${id}`);
  if (el) el.style.opacity = '0.4';
  const ok = typeof dbDeleteAd === 'function' ? await dbDeleteAd(id) : false;
  if (!ok) {
    if (el) el.style.opacity = '';
    showToast('削除に失敗しました', 'error');
    return;
  }
  if (el) el.remove();
  showToast(`広告を削除しました`, 'success');
  const badge = document.getElementById('dev-ads-count');
  if (badge) {
    const cur = parseInt(badge.textContent) || 0;
    badge.textContent = Math.max(0, cur - 1) + ' 件';
  }
  // キャッシュをリフレッシュ
  if (typeof dbLoadAds === 'function') {
    await dbLoadAds();
    renderAdStrip();
  }
}

async function devToggleDevFlag(accountId, currentIsDev, btn) {
  if (!accountId || typeof dbSetDevFlag !== 'function') return;
  const newIsDev = !currentIsDev;
  const label = newIsDev ? 'ONにする' : 'OFFにする';

  if (!confirm(`@${accountId} の開発者フラグを${label}しますか？`)) return;

  btn.disabled = true;
  const ok = await dbSetDevFlag(accountId, newIsDev);
  btn.disabled = false;

  if (!ok) { showToast('更新に失敗しました', 'error'); return; }

  // UI を即時更新
  const item = document.getElementById(`dev-acct-${accountId}`);
  if (item) {
    // 開発者バッジの表示/非表示
    const nameEl = item.querySelector('.dev-acct-name');
    if (nameEl) {
      const existing = nameEl.querySelector('.badge-dev');
      if (existing) existing.remove();
      if (newIsDev) {
        nameEl.insertAdjacentHTML('beforeend',
          `<span class="badge-dev" style="font-size:9px;padding:1px 5px"><i class="ti ti-code" style="font-size:9px"></i> 開発者</span>`);
      }
    }
    // ボタンのスタイルとテキスト更新
    if (newIsDev) {
      btn.style.cssText = 'padding:5px 8px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd';
      btn.innerHTML = '<i class="ti ti-code" style="font-size:12px"></i> DEV ON';
      btn.title = '開発者フラグをOFFにする';
    } else {
      btn.style.cssText = 'padding:5px 8px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;background:var(--bg2);color:var(--text3);border:1px solid var(--border)';
      btn.innerHTML = '<i class="ti ti-code" style="font-size:12px"></i> DEV OFF';
      btn.title = '開発者フラグをONにする';
    }
    btn.setAttribute('onclick', `devToggleDevFlag('${accountId}', ${newIsDev}, this)`);
  }

  // 自分のアカウントならメモリとlocalStorageも更新
  const myAccountId = localStorage.getItem('trendy_account_id');
  if (accountId === myAccountId) {
    isDeveloper = newIsDev;
    localStorage.setItem('trendy_isDev', newIsDev ? 'true' : 'false');
    _applyDevNav();
  }

  showToast(`@${accountId} の開発者フラグを${newIsDev ? 'ON' : 'OFF'}にしました`, 'success');
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

    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
      <label class="settings-key" style="font-size:12px;display:block;margin-bottom:10px">バッジアイコン</label>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:36px;height:36px;border-radius:8px;border:1px solid var(--border);overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--bg2);flex-shrink:0">
          <img src="${badgeVerifiedIcon || _DEFAULT_VERIFIED_ICON}" style="width:26px;height:26px;object-fit:contain">
        </div>
        <span style="font-size:13px;font-weight:600;flex:1">認証バッジ${!badgeVerifiedIcon ? ' <span style="font-size:10px;color:var(--text3);font-weight:400">（デフォルト）</span>' : ''}</span>
        <button class="btn-sm" onclick="document.getElementById('badge-verified-upload').click()">
          <i class="ti ti-upload"></i> 変更
        </button>
        ${badgeVerifiedIcon ? `<button class="btn-sm" style="color:#ef4444;border-color:#fca5a5" onclick="resetBadgeIcon('verified')">
          <i class="ti ti-trash"></i>
        </button>` : ''}
        <input type="file" id="badge-verified-upload" accept="image/*" style="display:none"
          onchange="handleBadgeIconUpload('verified', this)">
      </div>

      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:8px;border:1px solid var(--border);overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--bg2);flex-shrink:0">
          ${badgeCorporateIcon
            ? `<img src="${badgeCorporateIcon}" style="width:100%;height:100%;object-fit:cover">`
            : `<i class="ti ti-building-store" style="color:#d97706;font-size:20px"></i>`}
        </div>
        <span style="font-size:13px;font-weight:600;flex:1">企業バッジ</span>
        <button class="btn-sm" onclick="document.getElementById('badge-corporate-upload').click()">
          <i class="ti ti-upload"></i> 変更
        </button>
        ${badgeCorporateIcon ? `<button class="btn-sm" style="color:#ef4444;border-color:#fca5a5" onclick="resetBadgeIcon('corporate')">
          <i class="ti ti-trash"></i>
        </button>` : ''}
        <input type="file" id="badge-corporate-upload" accept="image/*" style="display:none"
          onchange="handleBadgeIconUpload('corporate', this)">
      </div>
      <div class="settings-desc" style="margin-top:6px">バッジのアイコン画像を設定します。未設定の場合はデフォルトのアイコンが使用されます。</div>
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <button class="btn-primary" style="width:100%;justify-content:center;gap:8px" onclick="pushBrandToAllDevices()">
        <i class="ti ti-world-upload"></i> 全端末に今すぐ反映
      </button>
      <div class="settings-desc" style="margin-top:6px;text-align:center">クリックするとサービス名・アイコン・バッジアイコンをSupabaseに保存し、他のアカウントに反映されます</div>
    </div>`;
}

async function pushBrandToAllDevices() {
  const btn = document.querySelector('[onclick="pushBrandToAllDevices()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> 保存中...'; }
  try {
    await dbSaveAppConfig(appName, appIcon, badgeVerifiedIcon, badgeCorporateIcon);
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
  await dbSaveAppConfig(appName, appIcon, badgeVerifiedIcon, badgeCorporateIcon);
  showToast(`サービス名を「${name}」に変更しました ✅`, 'success');
}

async function resetAppName() {
  appName = 'Trendy';
  localStorage.removeItem('trendy_app_name');
  _applyAppBrand();
  renderDevBrandSection();
  await dbSaveAppConfig('Trendy', appIcon, badgeVerifiedIcon, badgeCorporateIcon);
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
    await dbSaveAppConfig(appName, appIcon, badgeVerifiedIcon, badgeCorporateIcon);
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
  await dbSaveAppConfig(appName, null, badgeVerifiedIcon, badgeCorporateIcon);
  showToast('アイコン画像を削除しました');
}

function handleBadgeIconUpload(type, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    const dataUrl = e.target.result;
    if (type === 'verified') {
      badgeVerifiedIcon = dataUrl;
      localStorage.setItem('trendy_badge_verified_icon', dataUrl);
    } else {
      badgeCorporateIcon = dataUrl;
      localStorage.setItem('trendy_badge_corporate_icon', dataUrl);
    }
    renderDevBrandSection();
    await dbSaveAppConfig(appName, appIcon, badgeVerifiedIcon, badgeCorporateIcon);
    showToast('バッジアイコンを更新しました ✅', 'success');
  };
  reader.readAsDataURL(file);
}

async function resetBadgeIcon(type) {
  if (!confirm('バッジアイコンを削除しますか？')) return;
  if (type === 'verified') {
    badgeVerifiedIcon = null;
    localStorage.removeItem('trendy_badge_verified_icon');
  } else {
    badgeCorporateIcon = null;
    localStorage.removeItem('trendy_badge_corporate_icon');
  }
  renderDevBrandSection();
  await dbSaveAppConfig(appName, appIcon, badgeVerifiedIcon, badgeCorporateIcon);
  showToast('バッジアイコンを削除しました');
}

function renderDevAccountSection() {
  // バックアップ存在確認 → 復元セクションの表示切り替え
  _checkRestoreSection();

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

// ══════════════════════════════════════════
// バッジ ユーティリティ
// ══════════════════════════════════════════

let _myIsVerified  = false;
let _myIsCorporate = false;

/** バッジHTML を生成（スタンドアローン使用） */
/** DM一覧・ヘッダー等のコンパクト用（アイコンのみ） */
function _buildBadgeHtml(isVerified, isCorporate) {
  let html = '';
  if (isVerified) {
    // カスタムアイコン優先、なければデフォルトSVGバッジ
    const src = badgeVerifiedIcon || _DEFAULT_VERIFIED_ICON;
    html += `<span class="badge-verified" title="認証済みアカウント"><img src="${src}" style="width:14px;height:14px;object-fit:contain;vertical-align:-2px;border-radius:0"></span>`;
  }
  if (isCorporate) {
    const inner = badgeCorporateIcon
      ? `<img src="${badgeCorporateIcon}" style="width:14px;height:14px;object-fit:cover;border-radius:50%;vertical-align:-2px">`
      : `<i class="ti ti-building-store"></i>`;
    html += `<span class="badge-corporate" title="企業アカウント">${inner}</span>`;
  }
  return html;
}

/** プロフィールページ用（アイコン＋テキスト、少し大きめ） */
function _buildProfileBadgeHtml(isVerified, isCorporate) {
  let html = '';
  if (isVerified) {
    const src = badgeVerifiedIcon || _DEFAULT_VERIFIED_ICON;
    html += `<span class="badge-verified badge-verified--profile"><img src="${src}" style="width:16px;height:16px;object-fit:contain;vertical-align:-3px;border-radius:0"> 認証済み</span>`;
  }
  if (isCorporate) {
    const inner = badgeCorporateIcon
      ? `<img src="${badgeCorporateIcon}" style="width:16px;height:16px;object-fit:cover;border-radius:50%;vertical-align:-3px">`
      : `<i class="ti ti-building-store"></i>`;
    html += `<span class="badge-corporate badge-corporate--profile">${inner} 企業</span>`;
  }
  return html;
}

/** アバター左下に重ねるバッジオーバーレイ HTML を返す */
function _buildAvBadgeOverlay(isVerified, isCorporate) {
  if (isVerified) {
    const src = badgeVerifiedIcon || _DEFAULT_VERIFIED_ICON;
    // デフォルトSVGは背景色不要（SVG自体に青円が含まれる）
    const bg = badgeVerifiedIcon ? '' : 'background:transparent;';
    return `<div class="av-badge-overlay av-badge-overlay--verified" style="${bg}border:none;box-shadow:0 1px 4px rgba(0,0,0,0.22)"><img src="${src}" style="width:100%;height:100%;object-fit:contain"></div>`;
  }
  if (isCorporate) {
    if (badgeCorporateIcon) {
      return `<div class="av-badge-overlay av-badge-overlay--corporate"><img src="${badgeCorporateIcon}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`;
    }
    return `<div class="av-badge-overlay av-badge-overlay--corporate"><i class="ti ti-building-store" style="font-size:9px"></i></div>`;
  }
  return '';
}

/**
 * バッジオーバーレイ付きアバターHTMLを生成（tweet-av-wrap でラップ）
 * @param {string} avClass   - avatar の class 名（例 "tweet-av clickable"）
 * @param {string} avStyle   - avatar の style（background/colorなど）
 * @param {string} avInner   - avatar の内側HTML（img or 文字）
 * @param {object|string} uOrHandle - ユーザーオブジェクト or handle 文字列（キャッシュ参照用）
 * @param {string} [onclick]  - onclick 属性の値（例 "openUserPage('@foo')"）
 */
function _tweetAvHtml(avClass, avStyle, avInner, uOrHandle, onclick) {
  let isV = false, isC = false;
  if (uOrHandle && typeof uOrHandle === 'object') {
    isV = uOrHandle.is_verified  || _badgeCache[(uOrHandle.h || '').replace('@','')]?.is_verified  || false;
    isC = uOrHandle.is_corporate || _badgeCache[(uOrHandle.h || '').replace('@','')]?.is_corporate || false;
  } else if (typeof uOrHandle === 'string') {
    const key = uOrHandle.replace('@','');
    isV = _badgeCache[key]?.is_verified  || false;
    isC = _badgeCache[key]?.is_corporate || false;
  }
  const overlay = _buildAvBadgeOverlay(isV, isC);
  const onclickAttr = onclick ? ` onclick="${onclick}"` : '';
  return `<div class="tweet-av-wrap"><div class="${avClass}" style="${avStyle}"${onclickAttr}>${avInner}</div>${overlay}</div>`;
}

/** マイページのバッジ表示を更新（名前行 + アバターボタン） */
function _applyMyBadges() {
  _applyMyName(); // 名前行にバッジを含めて再描画
  const btn = document.getElementById('av-badge-btn');
  if (!btn) return;
  const hasBadge = _myIsVerified || _myIsCorporate;
  btn.classList.toggle('has-badge', hasBadge);
  if (_myIsVerified) {
    const src = badgeVerifiedIcon || _DEFAULT_VERIFIED_ICON;
    btn.innerHTML = `<img src="${src}" style="width:22px;height:22px;object-fit:contain;pointer-events:none;border-radius:0">`;
    btn.title = '認証済みバッジ（クリックして確認）';
    btn.style.cssText = ''; // CSS に任せる（has-badge クラスで制御）
  } else if (_myIsCorporate) {
    const inner = badgeCorporateIcon
      ? `<img src="${badgeCorporateIcon}" style="width:22px;height:22px;object-fit:contain;pointer-events:none;border-radius:50%">`
      : `<i class="ti ti-building-store"></i>`;
    btn.innerHTML = inner;
    btn.title = '企業バッジ取得済み（クリックして確認）';
    btn.style.cssText = '';
  } else {
    btn.innerHTML = '<i class="ti ti-rosette-discount-check"></i>';
    btn.title = 'バッジを申請する';
    btn.style.cssText = '';
  }
}

// ══════════════════════════════════════════
// バッジ申請ページ
// ══════════════════════════════════════════

async function renderBadgeApplyPage() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  const statuses = await dbFetchBadgeStatus(aid).catch(() => ({}));

  ['verified', 'corporate'].forEach(type => {
    const status = statuses[type];
    const statusEl = document.getElementById(`badge-${type}-status`);
    const btn      = document.getElementById(`badge-${type}-btn`);
    if (!statusEl || !btn) return;
    if (status === 'approved') {
      statusEl.innerHTML = `<div class="badge-status-ok"><i class="ti ti-check"></i> 取得済み — バッジが付与されています</div>`;
      btn.disabled = false;
      btn.innerHTML = `<i class="ti ti-rosette-discount-check-off"></i> バッジを外す`;
      btn.style.opacity = '1';
      btn.style.background = '#ef4444';
      btn.style.borderColor = '#ef4444';
      btn.onclick = () => removeBadge(type);
    } else {
      statusEl.innerHTML = '';
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.background = type === 'verified' ? '' : '#f59e0b';
      btn.style.borderColor = type === 'verified' ? '' : '#f59e0b';
      btn.innerHTML = type === 'verified'
        ? '<i class="ti ti-rosette-discount-check"></i> 認証バッジを申請する'
        : '<i class="ti ti-building-store"></i> 企業バッジを申請する';
      btn.onclick = () => applyForBadge(type);
    }
  });
}

async function removeBadge(type) {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  const btn = document.getElementById(`badge-${type}-btn`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite;display:inline-block"></i> 処理中…'; }
  const res = await dbRemoveBadge(aid, type).catch(e => ({ ok: false, error: e?.message }));
  if (!res.ok) {
    const msg = res.error ? `削除に失敗しました: ${res.error}` : '削除に失敗しました';
    showToast(msg, 'error');
    if (btn) { btn.disabled = false; }
    renderBadgeApplyPage();
    return;
  }
  // ローカルに反映
  if (type === 'verified')  { _myIsVerified = false;  localStorage.removeItem('trendy_is_verified'); }
  if (type === 'corporate') { _myIsCorporate = false; localStorage.removeItem('trendy_is_corporate'); }
  _applyMyBadges();
  showToast('バッジを外しました', 'success');
  renderBadgeApplyPage();
}

async function applyForBadge(type) {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) { showToast('ログインが必要です', 'error'); return; }
  const btn = document.getElementById(`badge-${type}-btn`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite;display:inline-block"></i> 申請中…'; }
  const res = await dbApplyForBadge(aid, type).catch(e => ({ ok: false, error: e?.message }));
  if (!res.ok) {
    const msg = res.error ? `申請に失敗しました: ${res.error}` : '申請に失敗しました（コンソールを確認）';
    showToast(msg, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = type === 'verified' ? '<i class="ti ti-rosette-discount-check"></i> 認証バッジを申請する' : '<i class="ti ti-building-store"></i> 企業バッジを申請する'; }
    return;
  }
  // ローカルに反映
  if (type === 'verified')  { _myIsVerified = true;  localStorage.setItem('trendy_is_verified', 'true'); }
  if (type === 'corporate') { _myIsCorporate = true; localStorage.setItem('trendy_is_corporate', 'true'); }
  _applyMyBadges();
  showToast(type === 'verified' ? '✅ 認証バッジが付与されました！' : '🏢 企業バッジが付与されました！', 'success');
  renderBadgeApplyPage();
}

// ══════════════════════════════════════════
// DM ルーム一覧
// ══════════════════════════════════════════

let _dmCurrentRoomId   = null;
let _dmCurrentOtherId  = null;
let _dmCurrentOtherName = '';
let _dmPollTimer       = null;

function _stopDmPoll() {
  if (_dmPollTimer) { clearInterval(_dmPollTimer); _dmPollTimer = null; }
}

/** DM ナビバッジを更新 */
async function _updateDmBadge() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  const total = await dbFetchDmUnreadTotal(aid).catch(() => 0);
  const el = document.getElementById('dm-nav-badge');
  if (!el) return;
  if (total > 0) { el.textContent = total > 99 ? '99+' : total; el.style.display = ''; }
  else { el.style.display = 'none'; }
}

async function renderDmRooms() {
  const el = document.getElementById('dm-rooms-list');
  if (!el) return;
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) { el.innerHTML = `<p style="padding:16px;color:var(--text3)">ログインしてください</p>`; return; }

  el.innerHTML = `<p style="padding:16px;color:var(--text3);font-size:13px"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;display:inline-block"></i> 読み込み中…</p>`;
  const rooms = await dbFetchDmRooms(aid).catch(() => []);
  _updateDmBadge();

  if (rooms.length === 0) {
    el.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--text3)"><i class="ti ti-mail" style="font-size:40px;opacity:.3;display:block;margin-bottom:8px"></i>まだDMはありません<br><span style="font-size:12px">ユーザーページから DM を送れます</span></div>`;
    return;
  }

  // 相手のプロフィールを取得
  const otherIds = rooms.map(r => r.lower_id === aid ? r.upper_id : r.lower_id);
  const profiles = await dbFetchProfilesByIds(otherIds).catch(() => []);
  const profileMap = {};
  profiles.forEach(p => { profileMap[p.account_id] = p; });

  const fmtTime = ts => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '今';
    if (diff < 3600000) return Math.floor(diff/60000) + '分前';
    if (diff < 86400000) return Math.floor(diff/3600000) + '時間前';
    return `${d.getMonth()+1}/${d.getDate()}`;
  };

  el.innerHTML = rooms.map(r => {
    const otherId = r.lower_id === aid ? r.upper_id : r.lower_id;
    const unread  = r.lower_id === aid ? (r.unread_lower || 0) : (r.unread_upper || 0);
    const p = profileMap[otherId] || {};
    const nick = (p.nickname || otherId).replace(/</g,'&lt;');
    const avLetter = (p.nickname || otherId)[0]?.toUpperCase() || '?';
    const avHtml = p.avatar_data
      ? `<img src="${p.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : avLetter;
    const lastMsg = (r.last_message || '').replace(/</g,'&lt;');
    const badges = _buildBadgeHtml(p.is_verified, p.is_corporate);
    const dmAvOverlay = _buildAvBadgeOverlay(!!p.is_verified, !!p.is_corporate);
    return `<div class="dm-room-item" onclick="openDmChat('${otherId}','${nick}')">
      <div class="tweet-av-wrap"><div class="dm-room-av">${avHtml}</div>${dmAvOverlay}</div>
      <div class="dm-room-info">
        <div class="dm-room-name">${nick}${badges}</div>
        <div class="dm-room-last">${lastMsg || '<span style="opacity:.5">メッセージなし</span>'}</div>
      </div>
      <div class="dm-room-meta">
        <span class="dm-room-time">${fmtTime(r.last_at)}</span>
        ${unread > 0 ? `<span class="dm-unread-badge">${unread}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// DM チャット
// ══════════════════════════════════════════

async function openDmChat(otherId, otherName) {
  const myId = localStorage.getItem('trendy_account_id');
  if (!myId) { showToast('ログインが必要です', 'error'); return; }
  _dmCurrentOtherId   = otherId;
  _dmCurrentOtherName = otherName || otherId;
  _dmCurrentRoomId    = null;

  // ルームを取得または作成
  const room = await dbGetOrCreateDmRoom(myId, otherId).catch(() => null);
  if (!room) { showToast('DMルームの作成に失敗しました', 'error'); return; }
  _dmCurrentRoomId = room.id;

  // チャットタイトルを設定
  const titleEl = document.getElementById('dm-chat-title');
  if (titleEl) titleEl.textContent = _dmCurrentOtherName;

  // 相手のバッジ表示（ヘッダー）
  const hdBadges = document.getElementById('dm-chat-header-badges');
  if (hdBadges) {
    dbFetchProfile(otherId).then(p => {
      if (p) hdBadges.innerHTML = _buildBadgeHtml(p.is_verified, p.is_corporate);
    }).catch(() => {});
  }

  goPage('dm-chat', null);
  await dbMarkDmRoomRead(room.id, myId).catch(() => {});
  _updateDmBadge();
}

async function renderDmChat() {
  const el = document.getElementById('dm-messages-area');
  if (!el || !_dmCurrentRoomId) return;
  const myId = localStorage.getItem('trendy_account_id');

  const msgs = await dbFetchDmMessages(_dmCurrentRoomId).catch(() => []);

  if (msgs.length === 0) {
    el.innerHTML = `<div class="dm-empty">まだメッセージがありません</div>`;
  } else {
    const fmtTs = ts => {
      const d = new Date(ts);
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    };
    el.innerHTML = msgs.map(m => {
      const isMine = m.from_id === myId;
      const body = m.body.replace(/</g,'&lt;').replace(/\n/g,'<br>');
      return `<div class="dm-msg-wrap ${isMine ? 'dm-mine' : 'dm-theirs'}">
        <div class="dm-bubble">${body}</div>
        <div class="dm-ts">${fmtTs(m.created_at)}</div>
      </div>`;
    }).join('');
  }
  // 最下部にスクロール
  el.scrollTop = el.scrollHeight;

  // ポーリング開始（チャット画面を開いている間）
  _stopDmPoll();
  _dmPollTimer = setInterval(async () => {
    if (!_dmCurrentRoomId) return;
    const newMsgs = await dbFetchDmMessages(_dmCurrentRoomId).catch(() => null);
    if (!newMsgs) return;
    // 件数が変わったら再描画（スクロール位置保持しつつ末尾追加）
    if (newMsgs.length !== msgs.length) {
      renderDmChat();
    }
  }, 10_000);
}

async function sendDmMessage() {
  const inputEl = document.getElementById('dm-input');
  if (!inputEl) return;
  const body = inputEl.value.trim();
  if (!body) return;
  const myId = localStorage.getItem('trendy_account_id');
  if (!myId || !_dmCurrentRoomId || !_dmCurrentOtherId) return;

  inputEl.disabled = true;
  const msg = await dbSendDmMessage(_dmCurrentRoomId, myId, _dmCurrentOtherId, body).catch(e => ({ _error: e.message }));
  inputEl.disabled = false;
  if (!msg || msg._error) { showToast('送信失敗: ' + (msg?._error || '不明'), 'error'); return; }
  inputEl.value = '';
  inputEl.style.height = 'auto';
  renderDmChat();
}

/** ユーザーページの「DM」ボタンから呼ばれる */
async function checkAndOpenDm() {
  const myId    = localStorage.getItem('trendy_account_id');
  const otherId = currentUserHandle?.startsWith('@') ? currentUserHandle.slice(1) : currentUserHandle;
  if (!myId || !otherId) return;

  const result = await dbCheckDmAllowed(myId, otherId).catch(() => ({ allowed: true }));
  if (!result.allowed) {
    const msgs = {
      none          : 'このユーザーはDMを受け付けていません',
      followers_only: 'フォロワーのみDMを受け付けています',
      verified_only : '認証アカウントのみDMを受け付けています',
      corporate_only: '企業アカウントのみDMを受け付けています',
    };
    showToast(msgs[result.reason] || 'DMを送信できません', 'error');
    return;
  }
  const nameEl = document.getElementById('user-page-name');
  const name   = nameEl?.textContent?.trim() || otherId;
  openDmChat(otherId, name);
}

/** DM設定をセレクトボックスから保存 */
async function saveDmSettingsFromSelect() {
  const aid    = localStorage.getItem('trendy_account_id');
  const select = document.getElementById('dm-allow-select');
  if (!aid || !select) return;
  const ok = await dbSaveDmSettings(aid, select.value).catch(() => false);
  if (ok) showToast('DM設定を保存しました', 'success');
  else    showToast('保存に失敗しました', 'error');
}

/** 設定ページを開いたときにDM設定を復元 */
async function _loadDmSettingsIntoUI() {
  const aid = localStorage.getItem('trendy_account_id');
  const select = document.getElementById('dm-allow-select');
  if (!aid || !select) return;
  const val = await dbFetchDmSettings(aid).catch(() => 'all');
  select.value = val;
}

// ══════════════════════════════════════════
// 📊 開発者統計ダッシュボード（拡張版）
// ══════════════════════════════════════════

async function renderDevStatsAll() {
  // 並行で全データ取得
  showToast('統計データを読み込み中...', 'info');
  const [posts, profiles, likes, views, comments, follows, items, coins, dmRooms] = await Promise.all([
    db.from('posts').select('id,user_handle,cat_id,tags,likes_count,views_count,rt_count,ai_type,media_type,is_sub,created_at,ext_source,boost_score,like_emoji').then(r => r.data || []),
    db.from('profiles').select('account_id,nickname,is_verified,is_corporate,is_dev,region,created_at').then(r => r.data || []),
    db.from('post_likes').select('id,account_id,created_at').then(r => r.data || []).catch(() => []),
    db.from('post_views').select('post_id,account_id').then(r => r.data || []).catch(() => []),
    db.from('comments').select('id,user_handle,created_at').then(r => r.data || []).catch(() => []),
    db.from('follows').select('follower_id,followee_id').then(r => r.data || []).catch(() => []),
    db.from('user_items').select('account_id,item_type,quantity').then(r => r.data || []).catch(() => []),
    db.from('peak_points').select('account_id,points,total_earned').then(r => r.data || []).catch(() => []),
    db.from('dm_rooms').select('id,lower_id,upper_id').then(r => r.data || []).catch(() => []),
  ]);

  const stats = { posts, profiles, likes, views, comments, follows, items, coins, dmRooms };
  _renderKPIGrid(stats);
  _renderAccessStats(stats);
  _renderContentStats(stats);
  _renderCategoryStats(stats);
  _renderUserBehavior(stats);
  _renderTimeStats(stats);
  _renderTopUsers(stats);
  _renderEconomyStats(stats);
  _renderGachaStats(stats);
  _renderExtStats(stats);
}

function _devKpiCard(label, value, sub, color) {
  return `<div class="dev-kpi-card" style="border-left:4px solid ${color}">
    <div class="dev-kpi-label">${label}</div>
    <div class="dev-kpi-value">${value}</div>
    ${sub ? `<div class="dev-kpi-sub">${sub}</div>` : ''}
  </div>`;
}

function _renderKPIGrid(s) {
  const el = document.getElementById('dev-kpi-grid');
  if (!el) return;
  const internalPosts = s.posts.filter(p => !p.ext_source);
  const extPosts = s.posts.filter(p => p.ext_source);
  const totalLikes = s.posts.reduce((a, p) => a + (p.likes_count || 0), 0);
  const totalViews = s.posts.reduce((a, p) => a + (p.views_count || 0), 0);
  const totalCoins = s.coins.reduce((a, c) => a + (c.points || 0), 0);
  const totalEarned = s.coins.reduce((a, c) => a + (c.total_earned || 0), 0);
  const verifiedUsers = s.profiles.filter(p => p.is_verified).length;

  el.innerHTML = [
    _devKpiCard('総ユーザー数', s.profiles.length, `認証 ${verifiedUsers}人`, '#3b82f6'),
    _devKpiCard('総投稿数', s.posts.length, `内部 ${internalPosts.length} / 外部 ${extPosts.length}`, '#10b981'),
    _devKpiCard('総いいね数', totalLikes.toLocaleString(), '', '#ef4444'),
    _devKpiCard('総閲覧数', totalViews.toLocaleString(), '', '#0ea5e9'),
    _devKpiCard('総コメント数', s.comments.length.toLocaleString(), '', '#8b5cf6'),
    _devKpiCard('総フォロー関係', s.follows.length, '', '#f59e0b'),
    _devKpiCard('DMルーム数', s.dmRooms.length, '', '#06b6d4'),
    _devKpiCard('流通コイン', totalCoins.toLocaleString(), `累計獲得: ${totalEarned.toLocaleString()}`, '#d97706'),
  ].join('');
}

function _renderAccessStats(s) {
  const el = document.getElementById('dev-access-stats');
  if (!el) return;
  const now = Date.now();
  const DAY = 86400000;

  // 期間別集計
  const periods = [
    { name: '24時間', ms: DAY },
    { name: '7日間', ms: 7*DAY },
    { name: '30日間', ms: 30*DAY },
  ];
  const html = periods.map(p => {
    const since = now - p.ms;
    const posts = s.posts.filter(x => new Date(x.created_at).getTime() > since).length;
    const newUsers = s.profiles.filter(x => new Date(x.created_at).getTime() > since).length;
    const likes = (s.likes || []).filter(x => x.created_at && new Date(x.created_at).getTime() > since).length;
    return `<div class="dev-stat-row">
      <span class="dev-stat-label">${p.name}</span>
      <span class="dev-stat-pill">投稿 ${posts}</span>
      <span class="dev-stat-pill">新規ユーザー ${newUsers}</span>
      <span class="dev-stat-pill">いいね ${likes}</span>
    </div>`;
  }).join('');
  el.innerHTML = html;
}

function _renderContentStats(s) {
  const el = document.getElementById('dev-content-stats');
  if (!el) return;
  const ip = s.posts.filter(p => !p.ext_source);

  // メディアタイプ別
  const byMedia = { text: 0, image: 0, video: 0 };
  ip.forEach(p => {
    if (p.media_type === 'image') byMedia.image++;
    else if (p.media_type === 'video') byMedia.video++;
    else byMedia.text++;
  });

  // AI使用
  const byAi = { none: 0, part: 0, full: 0 };
  ip.forEach(p => { byAi[p.ai_type || 'none'] = (byAi[p.ai_type || 'none'] || 0) + 1; });

  // メイン/サブ
  const subPosts = ip.filter(p => p.is_sub).length;
  const mainPosts = ip.length - subPosts;

  // ブースト適用済み投稿
  const boosted = ip.filter(p => (p.boost_score || 0) > 0).length;

  // 平均値
  const avgLikes = ip.length ? (ip.reduce((a, p) => a + (p.likes_count || 0), 0) / ip.length).toFixed(1) : '0';
  const avgViews = ip.length ? (ip.reduce((a, p) => a + (p.views_count || 0), 0) / ip.length).toFixed(1) : '0';

  el.innerHTML = `
    <div class="dev-stat-row">
      <span class="dev-stat-label">メディア種別</span>
      <span class="dev-stat-pill">📝 文字 ${byMedia.text}</span>
      <span class="dev-stat-pill">🖼 画像 ${byMedia.image}</span>
      <span class="dev-stat-pill">🎬 動画 ${byMedia.video}</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">アカウント</span>
      <span class="dev-stat-pill">メイン ${mainPosts}</span>
      <span class="dev-stat-pill">サブ ${subPosts}</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">AI使用</span>
      <span class="dev-stat-pill">未使用 ${byAi.none||0}</span>
      <span class="dev-stat-pill">一部 ${byAi.part||0}</span>
      <span class="dev-stat-pill">全文 ${byAi.full||0}</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">ブースト</span>
      <span class="dev-stat-pill">適用済み ${boosted}件</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">平均</span>
      <span class="dev-stat-pill">いいね/投稿 ${avgLikes}</span>
      <span class="dev-stat-pill">閲覧/投稿 ${avgViews}</span>
    </div>
  `;
}

function _renderCategoryStats(s) {
  const el = document.getElementById('dev-category-stats');
  if (!el) return;
  const catCount = {};
  const catLikes = {};
  const catViews = {};
  s.posts.forEach(p => {
    const c = p.cat_id || '未分類';
    catCount[c] = (catCount[c] || 0) + 1;
    catLikes[c] = (catLikes[c] || 0) + (p.likes_count || 0);
    catViews[c] = (catViews[c] || 0) + (p.views_count || 0);
  });
  const rows = Object.entries(catCount).sort((a,b)=>b[1]-a[1]).map(([cat, count]) => {
    const c = CATS_DATA.find(x => x.id === cat);
    const name = c ? c.name : cat;
    return `<div class="dev-stat-row">
      <span class="dev-stat-label">${name}</span>
      <span class="dev-stat-pill">投稿 ${count}</span>
      <span class="dev-stat-pill">いいね ${catLikes[cat] || 0}</span>
      <span class="dev-stat-pill">閲覧 ${catViews[cat] || 0}</span>
    </div>`;
  }).join('');
  el.innerHTML = rows || '<p style="color:var(--text3)">データなし</p>';
}

function _renderUserBehavior(s) {
  const el = document.getElementById('dev-user-behavior');
  if (!el) return;
  // 投稿者数（ユニーク）
  const posters = new Set(s.posts.filter(p => !p.ext_source).map(p => p.user_handle)).size;
  // いいねしたユーザー数
  const likers = new Set((s.likes || []).map(l => l.account_id).filter(Boolean)).size;
  // コメントしたユーザー数
  const commenters = new Set((s.comments || []).map(c => c.user_handle).filter(Boolean)).size;
  // フォロー関係：相互フォロー数
  const followsSet = new Set(s.follows.map(f => `${f.follower_id}>${f.followee_id}`));
  let mutual = 0;
  s.follows.forEach(f => {
    if (followsSet.has(`${f.followee_id}>${f.follower_id}`)) mutual++;
  });
  mutual = Math.floor(mutual / 2);
  // アクティブ率
  const totalU = s.profiles.length || 1;
  const activePct = ((posters / totalU) * 100).toFixed(1);

  // 地域別
  const regions = {};
  s.profiles.forEach(p => { if (p.region) regions[p.region] = (regions[p.region] || 0) + 1; });
  const topRegions = Object.entries(regions).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([r,c])=>`${r}(${c})`).join(', ') || 'なし';

  el.innerHTML = `
    <div class="dev-stat-row">
      <span class="dev-stat-label">投稿アクティブ</span>
      <span class="dev-stat-pill">${posters}人 (${activePct}%)</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">いいねアクティブ</span>
      <span class="dev-stat-pill">${likers}人</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">コメントアクティブ</span>
      <span class="dev-stat-pill">${commenters}人</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">相互フォロー</span>
      <span class="dev-stat-pill">${mutual}ペア</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">地域TOP5</span>
      <span style="font-size:12px;color:var(--text2)">${topRegions}</span>
    </div>
  `;
}

function _renderTimeStats(s) {
  const el = document.getElementById('dev-time-stats');
  if (!el) return;
  const hours = new Array(24).fill(0);
  s.posts.filter(p => !p.ext_source).forEach(p => {
    const h = new Date(p.created_at).getHours();
    hours[h]++;
  });
  const max = Math.max(...hours, 1);
  const bars = hours.map((c, h) => {
    const pct = (c / max) * 100;
    return `<div class="dev-time-bar" title="${h}時: ${c}件">
      <div class="dev-time-fill" style="height:${pct}%"></div>
      <div class="dev-time-label">${h}</div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="dev-time-graph">${bars}</div>`;
}

function _renderTopUsers(s) {
  const el = document.getElementById('dev-top-users');
  if (!el) return;
  // ユーザー別の集計
  const userMap = {};
  s.posts.filter(p => !p.ext_source).forEach(p => {
    const h = p.user_handle;
    if (!userMap[h]) userMap[h] = { posts: 0, likes: 0, views: 0 };
    userMap[h].posts++;
    userMap[h].likes += p.likes_count || 0;
    userMap[h].views += p.views_count || 0;
  });
  const top = Object.entries(userMap).map(([h, v]) => ({ h, ...v }))
    .sort((a, b) => b.posts - a.posts).slice(0, 10);
  el.innerHTML = `
    <div class="dev-rank-title">投稿数TOP10</div>
    ${top.map((u, i) => `
      <div class="dev-stat-row">
        <span style="font-weight:700;color:var(--accent);min-width:24px">#${i+1}</span>
        <span class="dev-stat-label">${u.h}</span>
        <span class="dev-stat-pill">投稿 ${u.posts}</span>
        <span class="dev-stat-pill">♡ ${u.likes}</span>
        <span class="dev-stat-pill">👁 ${u.views}</span>
      </div>
    `).join('')}
  `;
}

function _renderEconomyStats(s) {
  const el = document.getElementById('dev-economy-stats');
  if (!el) return;
  // 所持アイテム集計
  const itemCount = {};
  s.items.forEach(i => { itemCount[i.item_type] = (itemCount[i.item_type] || 0) + i.quantity; });
  // 絵文字所持者数
  const emojiOwners = new Set();
  s.items.forEach(i => { if (i.item_type.startsWith('emoji_') && i.quantity > 0) emojiOwners.add(i.account_id); });
  // ブーストアイテムの分布
  const boostTotal = (itemCount['boost_lg']||0) + (itemCount['boost_ssr']||0) + (itemCount['boost_sr']||0) + (itemCount['boost_r']||0) + (itemCount['boost_n']||0);
  // コイン保有者
  const coinHolders = s.coins.filter(c => (c.points || 0) > 0).length;
  // 経済格差（コイン上位10名のシェア）
  const topCoinSum = s.coins.sort((a,b)=>(b.points||0)-(a.points||0)).slice(0,10).reduce((a,c)=>a+(c.points||0),0);
  const totalCoinSum = s.coins.reduce((a,c)=>a+(c.points||0),0) || 1;
  const top10Share = ((topCoinSum / totalCoinSum) * 100).toFixed(1);

  el.innerHTML = `
    <div class="dev-stat-row">
      <span class="dev-stat-label">LGブースト</span><span class="dev-stat-pill">${itemCount['boost_lg']||0}個</span>
      <span class="dev-stat-label">SSR</span><span class="dev-stat-pill">${itemCount['boost_ssr']||0}個</span>
      <span class="dev-stat-label">SR</span><span class="dev-stat-pill">${itemCount['boost_sr']||0}個</span>
      <span class="dev-stat-label">R</span><span class="dev-stat-pill">${itemCount['boost_r']||0}個</span>
      <span class="dev-stat-label">N</span><span class="dev-stat-pill">${itemCount['boost_n']||0}個</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">ブースト総数</span><span class="dev-stat-pill">${boostTotal}個</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">絵文字所持者</span><span class="dev-stat-pill">${emojiOwners.size}人</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">コイン保有者</span><span class="dev-stat-pill">${coinHolders}人</span>
      <span class="dev-stat-label">TOP10シェア</span><span class="dev-stat-pill">${top10Share}%</span>
    </div>
  `;
}

function _renderGachaStats(s) {
  const el = document.getElementById('dev-gacha-stats');
  if (!el) return;

  // 所持アイテム集計
  const ownedByRarity = { LG: 0, SSR: 0, SR: 0, R: 0, N: 0 };
  const ownedEmojisByRarity = { LG: 0, SSR: 0, SR: 0 };
  const ownedBoostByRarity = { LG: 0, SSR: 0, SR: 0, R: 0, N: 0 };
  s.items.forEach(i => {
    if (i.quantity <= 0) return;
    if (i.item_type.startsWith('boost_')) {
      const rar = i.item_type.replace('boost_','').toUpperCase();
      ownedBoostByRarity[rar] = (ownedBoostByRarity[rar] || 0) + i.quantity;
      ownedByRarity[rar] = (ownedByRarity[rar] || 0) + i.quantity;
    } else if (i.item_type.startsWith('emoji_')) {
      // emoji_LG_001 形式
      const parts = i.item_type.split('_');
      const rar = parts[1];
      if (ownedEmojisByRarity[rar] !== undefined) {
        ownedEmojisByRarity[rar] += i.quantity;
        ownedByRarity[rar] = (ownedByRarity[rar] || 0) + i.quantity;
      }
    }
  });
  const totalOwned = Object.values(ownedByRarity).reduce((a,b)=>a+b,0);

  // ブースト適用回数（投稿のboost_score > 0）
  const boostApplied = s.posts.filter(p => !p.ext_source && (p.boost_score || 0) > 0).length;
  const boostTotalScore = s.posts.reduce((a, p) => a + (p.boost_score || 0), 0);

  // 累計ガチャ回数の推定
  // 累計ガチャ消費コイン = 累計獲得 - 現在所持 - 投稿でもらった分（推定）
  const totalEarned = s.coins.reduce((a, c) => a + (c.total_earned || 0), 0);
  const currentCoins = s.coins.reduce((a, c) => a + (c.points || 0), 0);
  const estSpentCoins = totalEarned - currentCoins;
  const estGachaCount = Math.floor(estSpentCoins / 100);

  // 絵文字種類別所持率
  const uniqueEmojiOwned = new Set();
  s.items.forEach(i => { if (i.item_type.startsWith('emoji_') && i.quantity > 0) uniqueEmojiOwned.add(i.item_type); });
  const totalEmojiTypes = 100; // 全種類

  // いいね絵文字使用統計（posts.like_emoji）
  const emojiUsage = {};
  s.posts.filter(p => !p.ext_source && p.like_emoji && p.like_emoji !== '❤️').forEach(p => {
    emojiUsage[p.like_emoji] = (emojiUsage[p.like_emoji] || 0) + 1;
  });
  const popularEmojis = Object.entries(emojiUsage).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const customEmojiPosts = s.posts.filter(p => !p.ext_source && p.like_emoji && p.like_emoji !== '❤️').length;
  const defaultEmojiPosts = s.posts.filter(p => !p.ext_source).length - customEmojiPosts;

  // 排出レアリティ分布（現在所持から推定）
  const totalAcc = totalOwned || 1;
  const rarityDist = {
    LG:  ((ownedByRarity.LG / totalAcc) * 100).toFixed(2),
    SSR: ((ownedByRarity.SSR / totalAcc) * 100).toFixed(2),
    SR:  ((ownedByRarity.SR / totalAcc) * 100).toFixed(2),
    R:   ((ownedByRarity.R / totalAcc) * 100).toFixed(2),
    N:   ((ownedByRarity.N / totalAcc) * 100).toFixed(2),
  };

  el.innerHTML = `
    <div class="dev-stat-row">
      <span class="dev-stat-label">推定ガチャ回数</span>
      <span class="dev-stat-pill">${estGachaCount.toLocaleString()} 回</span>
      <span class="dev-stat-label">消費コイン</span>
      <span class="dev-stat-pill">${estSpentCoins.toLocaleString()}</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">累計獲得アイテム</span>
      <span class="dev-stat-pill">${totalOwned}個（現在所持）</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">所持LG</span><span class="dev-stat-pill">${ownedByRarity.LG} (${rarityDist.LG}%)</span>
      <span class="dev-stat-label">SSR</span><span class="dev-stat-pill">${ownedByRarity.SSR} (${rarityDist.SSR}%)</span>
      <span class="dev-stat-label">SR</span><span class="dev-stat-pill">${ownedByRarity.SR} (${rarityDist.SR}%)</span>
      <span class="dev-stat-label">R</span><span class="dev-stat-pill">${ownedByRarity.R} (${rarityDist.R}%)</span>
      <span class="dev-stat-label">N</span><span class="dev-stat-pill">${ownedByRarity.N} (${rarityDist.N}%)</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">ブースト適用</span>
      <span class="dev-stat-pill">${boostApplied}件の投稿</span>
      <span class="dev-stat-label">合計スコア</span>
      <span class="dev-stat-pill">+${boostTotalScore.toLocaleString()}</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">絵文字コレクション</span>
      <span class="dev-stat-pill">${uniqueEmojiOwned.size} / ${totalEmojiTypes} 種類</span>
      <span class="dev-stat-pill">LG ${ownedEmojisByRarity.LG} / SSR ${ownedEmojisByRarity.SSR} / SR ${ownedEmojisByRarity.SR}</span>
    </div>
    <div class="dev-stat-row">
      <span class="dev-stat-label">絵文字いいね設定</span>
      <span class="dev-stat-pill">カスタム ${customEmojiPosts}件</span>
      <span class="dev-stat-pill">デフォルト❤️ ${defaultEmojiPosts}件</span>
    </div>
    ${popularEmojis.length ? `
    <div class="dev-stat-row">
      <span class="dev-stat-label">人気いいね絵文字</span>
      ${popularEmojis.map(([e,c]) => `<span class="dev-stat-pill" style="font-size:14px">${e} ${c}</span>`).join('')}
    </div>` : ''}
  `;
}

function _renderExtStats(s) {
  const el = document.getElementById('dev-ext-stats');
  if (!el) return;
  const ext = s.posts.filter(p => p.ext_source);
  const bySource = {};
  ext.forEach(p => { bySource[p.ext_source] = (bySource[p.ext_source] || 0) + 1; });
  el.innerHTML = `
    <div class="dev-stat-row">
      <span class="dev-stat-label">外部投稿総数</span>
      <span class="dev-stat-pill">${ext.length}件</span>
    </div>
    ${Object.entries(bySource).map(([src, c]) => `
      <div class="dev-stat-row">
        <span class="dev-stat-label">${src}</span>
        <span class="dev-stat-pill">${c}件</span>
      </div>
    `).join('')}
  `;
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
// 開発者 - 利用統計
// ══════════════════════════════════════════

async function renderDevUsageStats() {
  const el = document.getElementById('dev-usage-stats');
  if (!el) return;
  el.innerHTML = `<p style="color:var(--text3);font-size:13px;padding:8px 0"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;display:inline-block"></i> 集計中...</p>`;
  if (typeof dbFetchAllActivityStats !== 'function' || typeof dbFetchAllAccounts !== 'function') {
    el.innerHTML = `<p class="dev-empty">データを取得できません</p>`; return;
  }
  const [stats, accounts] = await Promise.all([
    dbFetchAllActivityStats(),
    dbFetchAllAccounts(),
  ]);

  const nickMap = {};
  accounts.forEach(a => { nickMap[a.account_id] = a.nickname || a.account_id; });

  const byAccount = {};
  const byHour    = new Array(24).fill(0);
  const today     = new Date().toISOString().split('T')[0];
  const weekAgo   = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0];
  const activeToday = new Set();
  const activeWeek  = new Set();
  let totalSec = 0;

  stats.forEach(r => {
    const { account_id: aid, activity_date: dt, hour_of_day: h, session_count: sc, duration_seconds: ds } = r;
    if (!byAccount[aid]) byAccount[aid] = { total_sec: 0, sessions: 0, last_date: '0000-00-00' };
    byAccount[aid].total_sec += ds || 0;
    byAccount[aid].sessions  += sc || 0;
    if (dt > byAccount[aid].last_date) byAccount[aid].last_date = dt;
    byHour[h] += ds || 0;
    if (dt === today) activeToday.add(aid);
    if (dt >= weekAgo) activeWeek.add(aid);
    totalSec += ds || 0;
  });

  const fmtSec = s => {
    if (!s || s < 1) return '0秒';
    if (s < 60)   return s + '秒';
    if (s < 3600) return Math.floor(s/60) + '分';
    const h = Math.floor(s/3600);
    const m = Math.floor((s % 3600) / 60);
    return h + '時間' + (m ? m + '分' : '');
  };

  const maxH  = Math.max(...byHour, 1);
  const hourBars = byHour.map((sec, h) => {
    const barH = Math.round(sec / maxH * 64);
    const color = h < 12 ? '#0ea5e9' : '#8b5cf6';
    return `<div class="act-hour-col">
      <div class="act-hour-bar-wrap">
        <div class="act-hour-bar" style="height:${barH}px;background:${color}" title="${fmtSec(sec)}"></div>
      </div>
      <div class="act-hour-label">${h}</div>
    </div>`;
  }).join('');

  const accountList = Object.entries(byAccount).sort((a, b) => b[1].total_sec - a[1].total_sec);
  const tableRows = accountList.map(([aid, d]) => {
    const nick   = (nickMap[aid] || aid).replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const aidEsc = aid.replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<tr>
      <td class="act-tbl-nick">${nick}</td>
      <td class="act-tbl-handle">@${aidEsc}</td>
      <td class="act-tbl-time">${fmtSec(d.total_sec)}</td>
      <td class="act-tbl-sess">${d.sessions}</td>
      <td class="act-tbl-date">${d.last_date}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="act-cards">
      <div class="act-card"><div class="act-val">${accounts.length}</div><div class="act-lbl">総アカウント</div></div>
      <div class="act-card"><div class="act-val">${activeToday.size}</div><div class="act-lbl">今日アクティブ</div></div>
      <div class="act-card"><div class="act-val">${activeWeek.size}</div><div class="act-lbl">今週アクティブ</div></div>
      <div class="act-card"><div class="act-val">${fmtSec(totalSec)}</div><div class="act-lbl">総利用時間</div></div>
    </div>
    <div class="act-sec-title"><i class="ti ti-clock"></i> 時間帯別アクセス（全体合計）</div>
    <div class="act-hour-chart">${hourBars}</div>
    <div class="act-sec-title"><i class="ti ti-users"></i> アカウント別利用時間</div>
    ${accountList.length === 0
      ? `<p class="dev-empty">まだ利用データがありません</p>`
      : `<div class="act-table-wrap">
          <table class="act-table">
            <thead><tr><th>ニックネーム</th><th>ハンドル</th><th>利用時間</th><th>回数</th><th>最終利用</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>`
    }`;
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

// ══════════════════════════════════════════
// リセット機能
// ══════════════════════════════════════════

/** Supabase テーブルを全行削除するユーティリティ */
async function _clearTable(tableName) {
  // テーブルごとに適切な主キー列を使って全行削除
  const NULL_UUID = '00000000-0000-0000-0000-000000000000';
  const COL = {
    // UUID id を持つテーブル
    posts:              ['id',             NULL_UUID],
    comments:           ['id',             NULL_UUID],
    notifications:      ['id',             NULL_UUID],
    user_saved_items:   ['id',             NULL_UUID],
    user_announcements: ['id',             NULL_UUID],
    badge_requests:     ['id',             NULL_UUID],
    dm_rooms:           ['id',             NULL_UUID],
    direct_messages:    ['id',             NULL_UUID],
    ad_campaigns:       ['id',             NULL_UUID],
    ad_impressions:     ['id',             NULL_UUID],
    ad_clicks:          ['id',             NULL_UUID],
    feedback_opinions:  ['id',             NULL_UUID],
    referral_records:   ['id',             NULL_UUID],
    // account_id (text) を持つテーブル
    post_likes:         ['account_id',     ''],
    post_views:         ['account_id',     ''],
    user_favorites:     ['account_id',     ''],
    user_activity:      ['account_id',     ''],
    dm_settings:        ['account_id',     ''],
    feedback_votes:     ['account_id',     ''],
    peak_points:        ['account_id',     ''],
    profiles:           ['account_id',     ''],
    // 特殊キー
    follows:            ['follower_id',    ''],
    user_fan_levels:    ['fan_account_id', ''],
  };
  const [col, val] = COL[tableName] || ['id', NULL_UUID];
  // 空文字 neq → 全行削除、UUID sentinel neq → 全行削除
  const q = val === ''
    ? db.from(tableName).delete().neq(col, val)        // account_id != '' → 全行
    : db.from(tableName).delete().neq(col, val);       // id != null UUID → 全行
  const { error } = await q;
  if (error) console.warn(`[RESET] ${tableName} 削除エラー:`, error.message);
}

async function _clearTables(tableList) {
  await Promise.allSettled(tableList.map(t => _clearTable(t)));
}

/** 共通：メモリ上の状態をリセット */
function _resetMemoryState() {
  HOME_TWEETS.length = 0;
  myPosts.length     = 0;
  homeLoaded         = 0;
  useDummyData       = false;
  NOTIFS.length      = 0;
  NOTIFS_SUB.length  = 0;
  myNameTag          = '';
  const feed = document.getElementById('home-feed');
  if (feed) feed.innerHTML = '';
}

// ── コンテンツのみリセット（アカウント・フォロー保持） ──────────────

async function resetContentOnly() {
  if (!confirm(
    '【コンテンツリセット】\n\n' +
    '以下をすべて削除します：\n' +
    '・投稿・コメント・いいね・閲覧履歴\n' +
    '・通知・DM・保存済み\n' +
    '・広告キャンペーン・表示履歴\n' +
    '・意見箱・ファンレベル・ポイント\n\n' +
    'アカウント・フォロー関係は保持されます。\n続けますか？'
  )) return;

  showToast('リセット中...', 'info');

  // メモリリセット
  _resetMemoryState();
  renderNotifs();

  // ローカルキャッシュ削除（アカウント情報は保持）
  const removeKeys = [
    'trendy_myNameTag', 'trendy_dummy_mode', 'trendy_last_sync',
    'trendy_saved_tweets', 'trendy_fav_folders', 'trendy_fav_folder_types',
    'trendy_announce_last_read', 'trendy_earned_badges', 'trendy_display_badges',
    'trendy_ref_code',
  ];
  removeKeys.forEach(k => localStorage.removeItem(k));
  ['nickname','phone','region'].forEach(k => localStorage.removeItem('trendy_last_change_' + k));
  Object.keys(localStorage)
    .filter(k => k.startsWith('trendy_rank_notif') || k.startsWith('trendy_show_'))
    .forEach(k => localStorage.removeItem(k));

  // Supabase：コンテンツ系テーブルを削除（profiles/follows/user_favorites は保持）
  await _clearTables([
    'posts', 'post_likes', 'post_views', 'comments',
    'notifications', 'user_saved_items', 'user_announcements',
    'user_activity', 'user_fan_levels', 'badge_requests',
    'dm_rooms', 'direct_messages',
    'ad_campaigns', 'ad_impressions', 'ad_clicks',
    'feedback_opinions', 'feedback_votes',
    'peak_points', 'referral_records',
  ]);

  // UI 反映
  _applyMyName();
  renderMyPosts();
  renderMyRank();
  renderCatGrid();
  showToast('✅ コンテンツをリセットしました', 'success');
  goPage('home', null);
  loadHomeMore();
}

// ── リセットバックアップ・復元 ────────────────────────────────────────

/** 全リセット前にSupabaseの主要テーブルをlocalStorageへバックアップ */
async function _takeResetBackup() {
  try {
    const tables = ['profiles', 'posts', 'follows', 'comments',
                    'post_likes', 'feedback_opinions', 'feedback_votes',
                    'user_saved_items'];
    const snap = { timestamp: new Date().toISOString() };
    await Promise.allSettled(tables.map(async t => {
      const { data } = await db.from(t).select('*').limit(2000);
      snap[t] = data || [];
    }));
    localStorage.setItem('trendy_dev_backup', JSON.stringify(snap));
    console.log('[BACKUP] バックアップ完了:', new Date(snap.timestamp).toLocaleString('ja-JP'));
  } catch(e) {
    console.warn('[BACKUP] バックアップに失敗しました:', e);
  }
}

/** バックアップの存在確認 → 復元セクションの表示切り替え */
function _checkRestoreSection() {
  const sec  = document.getElementById('reset-restore-section');
  const desc = document.getElementById('reset-restore-desc');
  if (!sec) return;
  const raw = localStorage.getItem('trendy_dev_backup');
  if (!raw) { sec.style.display = 'none'; return; }
  try {
    const snap = JSON.parse(raw);
    const dt = new Date(snap.timestamp).toLocaleString('ja-JP');
    const cnt = Object.values(snap).filter(Array.isArray).reduce((s, a) => s + a.length, 0);
    if (desc) desc.textContent = `バックアップ日時：${dt}（${cnt} 件のレコード）`;
  } catch(e) {}
  sec.style.display = '';
}

/** バックアップデータをSupabaseへ復元 */
async function restoreFromBackup() {
  if (!isDeveloper) return;
  const raw = localStorage.getItem('trendy_dev_backup');
  if (!raw) { showToast('バックアップが見つかりません', 'error'); return; }
  if (!confirm('バックアップからデータを復元しますか？\n現在のデータに上書きされます。')) return;

  showToast('復元中...', 'info');
  try {
    const snap = JSON.parse(raw);

    // 順序：profiles → posts → follows → comments → post_likes → その他
    const ORDER = ['profiles', 'follows', 'posts', 'comments',
                   'post_likes', 'feedback_opinions', 'feedback_votes',
                   'user_saved_items'];

    for (const t of ORDER) {
      const rows = snap[t];
      if (!rows || rows.length === 0) continue;
      // バッチ100件ずつupsert
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await db.from(t).upsert(batch, { ignoreDuplicates: false });
        if (error) console.warn(`[RESTORE] ${t} 復元エラー:`, error.message);
      }
    }

    showToast('✅ 復元が完了しました。リロードします...', 'success');
    setTimeout(() => location.reload(), 1500);
  } catch(e) {
    console.error('[RESTORE] 復元エラー:', e);
    showToast('復元に失敗しました', 'error');
  }
}

/** バックアップデータを削除 */
function clearResetBackup() {
  if (!confirm('バックアップデータを削除しますか？\nこの操作は元に戻せません。')) return;
  localStorage.removeItem('trendy_dev_backup');
  _checkRestoreSection();
  showToast('バックアップを削除しました', 'success');
}

// ── 全リセット（アカウント含む完全削除） ──────────────────────────────

async function resetEverything() {
  if (!confirm(
    '⚠️ 【全リセット - 危険】\n\n' +
    'アカウントを含むすべてのデータを\n' +
    '完全に削除します。\n\n' +
    '・全アカウント削除\n' +
    '・全投稿・フォロー・DM削除\n' +
    '・すべてのローカルデータ削除\n\n' +
    'この操作は取り消せません。続けますか？'
  )) return;
  if (!confirm(
    '最終確認：\n\n' +
    '本当に全データを完全削除しますか？\n' +
    'ページがリロードされ、再登録が必要になります。'
  )) return;

  showToast('バックアップ取得中...', 'info');

  // リセット前にバックアップを取得（開発者 localStorage に保存）
  await _takeResetBackup();

  showToast('全リセット実行中...', 'info');

  // メモリリセット
  _resetMemoryState();

  // Supabase：コンテンツ系テーブルを全削除（posts以外）
  await _clearTables([
    'post_likes', 'post_views', 'comments',
    'notifications', 'follows', 'user_saved_items', 'user_announcements',
    'user_activity', 'user_fan_levels', 'user_favorites', 'badge_requests',
    'dm_settings', 'dm_rooms', 'direct_messages',
    'ad_campaigns', 'ad_impressions', 'ad_clicks',
    'feedback_opinions', 'feedback_votes',
    'peak_points', 'referral_records',
  ]);

  // posts：開発者の投稿（user_handle = '@' + devId）は保持し、それ以外を削除
  const _devId = localStorage.getItem('trendy_account_id');
  if (_devId) {
    await db.from('posts').delete().neq('user_handle', '@' + _devId);
  } else {
    await _clearTables(['posts']);
  }

  // profiles：開発者アカウント（is_dev = true）は保持し、それ以外を削除
  await db.from('profiles').delete().neq('is_dev', true);

  // localStorage の処理
  if (isDeveloper) {
    // 開発者自身のアカウント情報は保持してリセット
    const DEV_KEEP_KEYS = [
      'trendy_account_id', 'trendy_account_pw',
      'trendy_registered',  'trendy_logged_in',
      'trendy_isDev',       'trendy_userId',     'trendy_session_v1',
      'trendy_myName',      'trendy_bio',         'trendy_av',   'trendy_cover',
      'trendy_gender',      'trendy_dob',
      'trendy_region',      'trendy_city',        'trendy_phone',
      'trendy_dark_mode',
      'trendy_dev_backup',  // 全リセット前バックアップ（復元用）
    ];
    const saved = {};
    DEV_KEEP_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) saved[k] = v; });
    localStorage.clear();
    Object.entries(saved).forEach(([k, v]) => localStorage.setItem(k, v));
  } else {
    localStorage.clear();
  }

  showToast('✅ 全データを削除しました。リロードします...', 'success');
  setTimeout(() => location.reload(), 1200);
}

// ── Init ───────────────────────────────────────────────
function init() {
  // ── URL の ref パラメータを保存（紹介登録用） ──
  const _urlRef = new URLSearchParams(location.search).get('ref');
  if (_urlRef) localStorage.setItem('trendy_ref_code', _urlRef);

  // ── ダークモードを最初に復元（ちらつき防止） ──
  _applyDarkMode(localStorage.getItem('trendy_dark_mode') === 'true');

  // ── アプリブランドを復元 ──
  appName = localStorage.getItem('trendy_app_name') || 'Trendy';
  appIcon = localStorage.getItem('trendy_app_icon') || null;
  badgeVerifiedIcon  = localStorage.getItem('trendy_badge_verified_icon')  || null;
  badgeCorporateIcon = localStorage.getItem('trendy_badge_corporate_icon') || null;
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
    USER_PROFILES[myHandle] = { categories: [] }; // 起動時は空カテゴリーで初期化（Supabaseから上書き）
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
  // 都道府県・市区町村・性別・生年月日を個別に表示
  {
    const savedRegion = localStorage.getItem('trendy_region') || '';
    const savedCity   = localStorage.getItem('trendy_city')   || '';
    const savedGender = localStorage.getItem('trendy_gender') || '';
    const savedDob    = localStorage.getItem('trendy_dob')    || '';
    settingsProfile.region = savedRegion;
    settingsProfile.city   = savedCity;
    ['settings-prefecture-val','pe-prefecture-val'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = savedRegion || '（未設定）';
    });
    ['settings-city-val','pe-city-val'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = savedCity || '（未設定）';
    });
    ['settings-gender-val','pe-gender-val'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = savedGender || '（未設定）';
    });
    ['settings-dob-val','pe-dob-val'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = savedDob ? savedDob.replace('（非公開）','').trim() : '（未設定）';
    });
    _updateMypageMeta();
  }
  // DB から取得したプライバシー設定を反映（後で上書き）
  _renderAllPrivacyToggles();

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
  _loadFavData();           // お気に入りデータをlocalStorageから即時復元
  _syncFavFromSupabase();   // Supabaseからバックグラウンド同期（非同期）
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

  // ── バッジ状態を復元 ──
  _myIsVerified  = localStorage.getItem('trendy_is_verified')  === 'true';
  _myIsCorporate = localStorage.getItem('trendy_is_corporate') === 'true';
  // 自分のバッジをキャッシュに登録
  const _initAid = localStorage.getItem('trendy_account_id');
  if (_initAid) _badgeCache[_initAid] = { is_verified: _myIsVerified, is_corporate: _myIsCorporate };
  _applyMyBadges();

  // ── セッション追跡開始 ──
  _startSessionTracking();

  // ── 起動時ランキング通知チェック（全period・バックグラウンド） ──
  // 4秒後に実行することで初期レンダリングをブロックしない
  setTimeout(_startupRankNotifCheck, 4000);
}

document.addEventListener('DOMContentLoaded', init);

// ── プロフィール自動同期（タブがアクティブになったとき）──────
let _lastProfileSyncAt = 0;      // スロットル用タイムスタンプ
const _PROFILE_SYNC_INTERVAL = 30_000; // 最短30秒に1回
async function _syncProfileFromSupabase() {
  if (!localStorage.getItem('trendy_logged_in')) return;
  const _now = Date.now();
  if (_now - _lastProfileSyncAt < _PROFILE_SYNC_INTERVAL) return; // クールダウン中
  _lastProfileSyncAt = _now;
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || typeof dbFetchProfile !== 'function') return;
  try {
    const profile = await dbFetchProfile(aid);
    if (profile === undefined || profile === null) {
      // ネットワークエラーまたはプロフィールが見つからない場合は同期をスキップ
      // ※ 強制ログアウトはここでは行わない（_checkAccountExistsOnNav が担当）
      console.warn('[SYNC] プロフィールが取得できません。同期をスキップします。');
      return;
    }

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
    // ── 都道府県・市区町村・性別・生年月日 ──
    {
      const pref = profile.region || '';
      const city = profile.city   || '';
      settingsProfile.region = pref;
      settingsProfile.city   = city;
      if (pref) localStorage.setItem('trendy_region', pref); else localStorage.removeItem('trendy_region');
      if (city) localStorage.setItem('trendy_city',   city); else localStorage.removeItem('trendy_city');
      ['settings-prefecture-val','pe-prefecture-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = pref || '（未設定）'; });
      ['settings-city-val','pe-city-val'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = city || '（未設定）'; });
      // プライバシー設定をDBから反映
      if (profile.show_gender !== undefined) localStorage.setItem('trendy_show_gender', String(!!profile.show_gender));
      if (profile.show_region !== undefined) localStorage.setItem('trendy_show_region', String(profile.show_region !== false));
      if (profile.show_age    !== undefined) localStorage.setItem('trendy_show_age',    String(!!profile.show_age));
      _renderAllPrivacyToggles();
      _updateMypageMeta();
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
    // ── バッジ状態を同期 ──
    if (typeof profile.is_verified  === 'boolean') {
      _myIsVerified = profile.is_verified;
      localStorage.setItem('trendy_is_verified', profile.is_verified ? 'true' : 'false');
    }
    if (typeof profile.is_corporate === 'boolean') {
      _myIsCorporate = profile.is_corporate;
      localStorage.setItem('trendy_is_corporate', profile.is_corporate ? 'true' : 'false');
    }
    // 自分のバッジをキャッシュに登録（投稿アバターにも反映）
    const _aid_badge = localStorage.getItem('trendy_account_id');
    if (_aid_badge) {
      _badgeCache[_aid_badge] = { is_verified: !!_myIsVerified, is_corporate: !!_myIsCorporate };
    }
    _applyMyBadges();
    // いいね絵文字を同期
    if (profile.like_emoji) {
      myLikeEmoji = profile.like_emoji;
      localStorage.setItem('trendy_like_emoji', myLikeEmoji);
    }
    // 同期済みタイムスタンプを保存（次回以降の無駄な同期を防ぐ）
    localStorage.setItem('trendy_last_sync', remoteTs);
    console.log('[Sync] プロフィールを同期しました (updated_at:', remoteTs, ')');
  } catch (e) {
    console.warn('[Sync] プロフィール同期エラー:', e.message);
  }
}

// ── ユーザー告知機能 ────────────────────────────────────────
let _selectedAnnounceType = 'general';

function openAnnounceModal() {
  const myAid = localStorage.getItem('trendy_account_id');
  if (!myAid || !localStorage.getItem('trendy_logged_in')) {
    showToast('ログインが必要です', 'error'); return;
  }
  const titleEl   = document.getElementById('user-announce-title');
  const msgEl     = document.getElementById('user-announce-message');
  if (titleEl)   titleEl.value   = '';
  if (msgEl)     msgEl.value     = '';
  _selectedAnnounceType = 'general';
  document.querySelectorAll('#announce-modal .announce-type-btn').forEach(b => b.classList.remove('active'));
  const firstBtn = document.querySelector('#announce-modal .announce-type-btn[data-type="general"]');
  if (firstBtn) firstBtn.classList.add('active');
  const ov = document.getElementById('announce-overlay');
  const mo = document.getElementById('announce-modal');
  if (ov) ov.style.display = 'block';
  if (mo) mo.style.display = 'block';
}

function closeAnnounceModal() {
  const ov = document.getElementById('announce-overlay');
  const mo = document.getElementById('announce-modal');
  if (ov) ov.style.display = 'none';
  if (mo) mo.style.display = 'none';
}

function selectAnnounceType(btn) {
  const row = btn.closest('.announce-type-row') || document.getElementById('announce-modal');
  if (row) row.querySelectorAll('.announce-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _selectedAnnounceType = btn.dataset.type || 'general';
}

async function sendUserAnnouncement() {
  const myAid = localStorage.getItem('trendy_account_id');
  if (!myAid) { showToast('ログインが必要です', 'error'); return; }
  const titleEl   = document.getElementById('user-announce-title');
  const msgEl     = document.getElementById('user-announce-message');
  const title     = (titleEl?.value || '').trim();
  const message   = (msgEl?.value  || '').trim();
  if (!title)   { showToast('タイトルを入力してください', 'error'); return; }
  if (!message) { showToast('本文を入力してください', 'error'); return; }
  const submitBtn = document.getElementById('announce-submit-btn');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const result = await dbSendUserAnnouncement(myAid, title, message, _selectedAnnounceType);
    if (result && result.ok) {
      showToast('告知を送信しました！', 'success');
      closeAnnounceModal();
    } else {
      showToast('失敗: ' + (result?.msg || '不明なエラー'), 'error');
    }
  } catch (e) {
    console.error('[告知送信エラー]', e);
    showToast('エラーが発生しました', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/** 告知通知ベルボタンの状態を更新 */
async function _updateFollowNotifyBtn(targetAccountId) {
  const notifyBtn = document.getElementById('user-page-notify-btn');
  if (!notifyBtn) return;
  const myAid = localStorage.getItem('trendy_account_id');
  if (!myAid || !localStorage.getItem('trendy_logged_in')) {
    notifyBtn.style.display = 'none'; return;
  }
  const targetHandle = '@' + targetAccountId;
  if (!followingSet.has(targetHandle)) {
    notifyBtn.style.display = 'none'; return;
  }
  notifyBtn.style.display = '';
  const enabled = await dbGetFollowNotifyStatus(myAid, targetAccountId);
  notifyBtn.classList.toggle('active', !!enabled);
  notifyBtn.title = enabled ? '告知通知 ON（クリックでOFF）' : '告知通知 OFF（クリックでON）';
}

/** 告知通知の ON/OFF を切り替え */
async function toggleFollowNotify() {
  const myAid = localStorage.getItem('trendy_account_id');
  if (!myAid) return;
  const handle = currentUserHandle;
  if (!handle) return;
  const targetAccountId = handle.startsWith('@') ? handle.slice(1) : handle;
  const notifyBtn = document.getElementById('user-page-notify-btn');
  const currentOn = !!notifyBtn?.classList.contains('active');
  const newEnabled = !currentOn;
  const ok = await dbSetFollowNotify(myAid, targetAccountId, newEnabled);
  if (ok) {
    if (notifyBtn) {
      notifyBtn.classList.toggle('active', newEnabled);
      notifyBtn.title = newEnabled ? '告知通知 ON（クリックでOFF）' : '告知通知 OFF（クリックでON）';
    }
    showToast(newEnabled ? '告知通知をONにしました 🔔' : '告知通知をOFFにしました 🔕', 'success');
  }
}

/** フォロー中ユーザーからの告知を告知タブに表示 */
async function _loadFollowingAnnouncements() {
  const myAid  = localStorage.getItem('trendy_account_id');
  const listEl = document.getElementById('following-announce-list');
  if (!listEl) return;
  if (!myAid || !localStorage.getItem('trendy_logged_in')) return;

  listEl.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--text3);font-size:13px"><i class="ti ti-loader-2" style="font-size:22px;display:block;margin-bottom:6px"></i>読み込み中…</div>';

  const items = await dbFetchFollowingAnnouncements(myAid, 20).catch(() => []);
  if (!items || items.length === 0) {
    listEl.innerHTML = '<div style="padding:48px 20px;text-align:center;color:var(--text3);font-size:13px"><i class="ti ti-speakerphone" style="font-size:28px;display:block;margin-bottom:8px"></i>告知はありません</div>';
    return;
  }

  // 送信者プロフィールを一括取得
  const senderIds = [...new Set(items.map(i => i.sender_id))];
  const profiles  = await dbFetchProfilesByIds(senderIds).catch(() => []);
  const profMap   = {};
  (profiles || []).forEach(p => { profMap[p.account_id] = p; });

  const lastRead  = localStorage.getItem('trendy_announce_last_read') || '1970-01-01T00:00:00Z';
  const typeLabel = { general: '📢', release: '🎵', live: '📺', event: '📅' };
  const _e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  listEl.innerHTML = items.map(item => {
    const isUnread = item.created_at > lastRead;
    const icon = typeLabel[item.type] || '📢';
    const d = new Date(item.created_at);
    const timeStr = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

    // アバター生成
    const prof = profMap[item.sender_id];
    const initLetter = (item.sender_id[0] || '?').toUpperCase();
    const avatarInner = prof?.avatar_data
      ? `<img src="${prof.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : initLetter;
    const avatarBg = prof?.avatar_data ? 'transparent' : '#3b82f6';
    const nickname = prof?.nickname || item.sender_id;

    return `<div class="following-announce-item${isUnread ? ' fa-unread' : ''}" onclick="openUserPage('@${_e(item.sender_id)}')">
      <div class="fa-item-left">
        <div class="fa-item-av" style="background:${avatarBg};color:#fff">${avatarInner}</div>
        <span class="fa-item-type">${icon}</span>
      </div>
      <div class="fa-item-right">
        <div class="fa-item-header">
          <span class="fa-item-sender">${_e(nickname)}</span>
          <span class="fa-item-handle">@${_e(item.sender_id)}</span>
          <span class="fa-item-time">${timeStr}</span>
          ${isUnread ? '<span class="fa-unread-dot"></span>' : ''}
        </div>
        <div class="fa-item-title">${_e(item.title)}</div>
        ${item.message ? `<div class="fa-item-body">${_e(item.message)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  // 告知タブを開いた時点で既読にする
  localStorage.setItem('trendy_announce_last_read', new Date().toISOString());
  _unreadAnnounceCount = 0;
  updateNotifBadge();
  _updateAnnounceBadgeTab();
}

// ── セッション時間トラッキング ──────────────────────────────
let _sessionStartTime = 0;
let _sessionHour = -1;

function _startSessionTracking() {
  if (!localStorage.getItem('trendy_logged_in')) return;
  _sessionStartTime = Date.now();
  _sessionHour = new Date().getHours();
}

function _flushSessionTracking() {
  if (_sessionStartTime <= 0) return;
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || !localStorage.getItem('trendy_logged_in')) { _sessionStartTime = 0; return; }
  const durationSec = Math.round((Date.now() - _sessionStartTime) / 1000);
  _sessionStartTime = 0;
  if (durationSec < 10) return; // 10秒未満は記録しない
  if (typeof dbRecordActivity === 'function') {
    dbRecordActivity(aid, _sessionHour, durationSec).catch(() => {});
  }
}

// タブ/ウィンドウがアクティブになったら同期
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    _flushSessionTracking();
  } else {
    _startSessionTracking();
    _syncProfileFromSupabase();
    _syncFavFromSupabase();
  }
});
window.addEventListener('focus', () => {
  _syncProfileFromSupabase();
  _syncFavFromSupabase();
});
window.addEventListener('beforeunload', () => {
  _flushSessionTracking();
});

// 5分ごとにセッションデータを自動保存（タブを閉じなくてもDBに記録）
setInterval(() => {
  if (!localStorage.getItem('trendy_logged_in')) return;
  _flushSessionTracking();
  _startSessionTracking(); // 新しいセグメントを開始
}, 5 * 60 * 1000);

// DM バッジ：起動時チェック＋リアルタイム購読＋30秒ごとポーリング
setTimeout(() => {
  const _dmAid = localStorage.getItem('trendy_account_id');
  if (_dmAid && localStorage.getItem('trendy_logged_in')) {
    _updateDmBadge();
    // リアルタイム購読（dm_rooms が更新されたら即バッジ更新）
    if (typeof dbSubscribeDmRooms === 'function') {
      dbSubscribeDmRooms(_dmAid, () => _updateDmBadge());
    }
  }
}, 2000);
setInterval(() => {
  if (localStorage.getItem('trendy_logged_in')) _updateDmBadge();
}, 30 * 1000);

// 告知バッジ：起動時チェック＋リアルタイム購読
setTimeout(() => {
  _checkAnnouncementBadge();
  // リアルタイム購読（新しい告知が INSERT されたら即バッジ更新）
  if (typeof dbSubscribeAnnouncements === 'function') {
    dbSubscribeAnnouncements(async () => {
      // DBから再取得して正確なカウントに更新（インクリメントによる二重計上を防ぐ）
      await _checkAnnouncementBadge();
    });
  }
}, 1500);
// フォールバック：30秒ごとにポーリング（リアルタイムが切れた場合の保険）
setInterval(() => _checkAnnouncementBadge(), 30 * 1000);

// ── ピークコイン ─────────────────────────────────────
let _myPoints = 0;
let _myTotalEarned = 0;
let _boostSelectedPostId = null;
let _boostSelectedPost = null;
let _currentReportCampaignId = null;
let _adDays = 1;
let _adPayMethod = 'money'; // 'money' | 'points'

async function _loadMyPoints() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  const r = await dbGetMyPoints(aid).catch(() => ({ points: 0, total_earned: 0 }));
  _myPoints = r.points || 0;
  _myTotalEarned = r.total_earned || 0;
  // ハブのバナーを更新
  const el = document.getElementById('ad-hub-points-val');
  if (el) el.textContent = `${_myPoints.toLocaleString()} コイン`;
}

// ピークコインページ
async function renderPeakPointsPage() {
  await _loadMyPoints();
  const aid = localStorage.getItem('trendy_account_id');
  const referrals = await dbGetMyReferrals(aid).catch(() => []);
  // 直接紹介のみカウント
  const directCount = referrals.filter(r => r.level === 1).length;
  const refUrl = `${APP_BASE_URL}?ref=${aid}`;

  const container = document.getElementById('peak-points-content');
  if (!container) return;
  container.innerHTML = `
    <div class="pp-balance-card">
      <div class="pp-balance-label"><i class="ti ti-diamond"></i> 現在の残高</div>
      <div class="pp-balance-val">${_myPoints.toLocaleString()}<span class="pp-pt">コイン</span></div>
      <div class="pp-total-earned">累計獲得: ${_myTotalEarned.toLocaleString()} コイン</div>
    </div>
    <div class="pp-section">
      <div class="pp-section-title"><i class="ti ti-link"></i> 紹介リンク</div>
      <div class="pp-ref-url-box" id="pp-ref-url">${refUrl}</div>
      <button class="kids-next-btn" style="margin-top:8px" onclick="copyReferralLink()">
        <i class="ti ti-copy"></i> リンクをコピー
      </button>
      <div class="pp-ref-count">このリンクから登録した人: <b>${directCount}人</b></div>
    </div>
    <div class="pp-section">
      <div class="pp-section-title"><i class="ti ti-info-circle"></i> ポイントの仕組み</div>
      <div class="pp-howto">
        <div class="pp-howto-row">🧑‍🤝‍🧑 友達を招待して登録されたら <b>+100 コイン</b></div>
        <div class="pp-howto-row">🔗 友達がさらに別の人を招待して登録されたら <b>+100 コイン</b></div>
        <div class="pp-howto-row">💎 獲得したポイントは <b>広告費として使用</b> できます</div>
      </div>
    </div>
    <div class="pp-section">
      <div class="pp-section-title"><i class="ti ti-history"></i> 紹介履歴</div>
      ${referrals.length === 0
        ? '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">まだ紹介実績がありません</div>'
        : referrals.map(r => {
            const d = new Date(r.created_at);
            const label = r.level === 1 ? '直接紹介' : '間接紹介';
            return `<div class="pp-history-item">
              <div class="pp-history-left">
                <span class="pp-history-label ${r.level === 1 ? 'pp-direct' : 'pp-indirect'}">${label}</span>
                <span class="pp-history-user">@${r.referred_id}</span>
              </div>
              <div class="pp-history-right">
                <span class="pp-history-pts">+${r.points_awarded} コイン</span>
                <span class="pp-history-date">${d.getMonth()+1}/${d.getDate()}</span>
              </div>
            </div>`;
          }).join('')
      }
    </div>
  `;
}

function copyReferralLink() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  const url = `${APP_BASE_URL}?ref=${aid}`;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url)
      .then(() => showToast('紹介リンクをコピーしました！', 'success'))
      .catch(() => _copyFallback(url));
  } else {
    _copyFallback(url);
  }
}
function _copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try {
    document.execCommand('copy');
    showToast('紹介リンクをコピーしました！', 'success');
  } catch (e) {
    showToast('コピーできませんでした。手動でコピーしてください', 'error');
  }
  document.body.removeChild(ta);
}

// キャンペーン一覧ページ
async function renderAdListPage() {
  const aid = localStorage.getItem('trendy_account_id');
  const list = await dbGetMyCampaigns(aid).catch(() => []);
  const container = document.getElementById('ad-list-content');
  if (!container) return;
  if (!list.length) {
    container.innerHTML = '<div style="padding:48px 20px;text-align:center;color:var(--text3);font-size:13px"><i class="ti ti-speakerphone" style="font-size:28px;display:block;margin-bottom:8px"></i>広告キャンペーンがありません</div>';
    return;
  }
  container.innerHTML = list.map(c => {
    const statusLabel = c.status === 'active' ? '配信中' : c.status === 'paused' ? '一時停止' : '終了';
    const statusColor = c.status === 'active' ? '#10b981' : c.status === 'paused' ? '#f59e0b' : '#94a3b8';
    const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(1) : '0.0';
    const typeLabel = c.ad_type === 'post_boost' ? '🚀 投稿ブースト' : '📢 通常広告';
    return `<div class="ad-list-card">
      <div class="ad-list-card-head">
        <span class="ad-list-type">${typeLabel}</span>
        <span class="ad-list-status" style="color:${statusColor}">● ${statusLabel}</span>
      </div>
      <div class="ad-list-title">${c.title || c.ad_text || '(タイトルなし)'}</div>
      <div class="ad-list-meta">
        <span>📅 ${c.start_date || '—'} 〜 ${c.end_date || '—'}</span>
        <span>💰 ¥${(c.daily_budget || 0).toLocaleString()}/日 × ${c.days || 1}日</span>
      </div>
      <div class="ad-list-stats">
        <div class="ad-list-stat"><div class="ad-list-stat-val">${(c.impressions || 0).toLocaleString()}</div><div class="ad-list-stat-label">表示</div></div>
        <div class="ad-list-stat"><div class="ad-list-stat-val">${(c.clicks || 0).toLocaleString()}</div><div class="ad-list-stat-label">クリック</div></div>
        <div class="ad-list-stat"><div class="ad-list-stat-val">${ctr}%</div><div class="ad-list-stat-label">CTR</div></div>
      </div>
      <button class="btn-sm" style="margin-top:8px" onclick="openAdReport('${c.id}')">
        <i class="ti ti-chart-bar"></i> レポートを見る
      </button>
    </div>`;
  }).join('');
}

// レポートページ
async function openAdReport(campaignId) {
  _currentReportCampaignId = campaignId;
  goPage('ad-report', null);
}

async function renderAdReportPage() {
  const container = document.getElementById('ad-report-content');
  if (!container) return;
  container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text3)"><i class="ti ti-loader-2" style="font-size:24px"></i><br>読み込み中…</div>';

  const report = await dbGetCampaignReport(_currentReportCampaignId).catch(() => null);
  if (!report || !report.campaign) {
    container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text3)">データが見つかりません</div>';
    return;
  }

  const { campaign: c, impressions, clicks } = report;
  const totalImp = impressions.length;
  const totalClk = clicks.length;
  const ctr = totalImp > 0 ? ((totalClk / totalImp) * 100).toFixed(1) : '0.0';

  // 性別集計
  const genderMap = { male: 0, female: 0, unknown: 0 };
  impressions.forEach(i => { const g = i.viewer_gender || 'unknown'; genderMap[g] = (genderMap[g] || 0) + 1; });

  // 地域集計（上位5）
  const regionMap = {};
  impressions.forEach(i => { if (i.viewer_region) regionMap[i.viewer_region] = (regionMap[i.viewer_region] || 0) + 1; });
  const topRegions = Object.entries(regionMap).sort((a,b) => b[1]-a[1]).slice(0, 5);

  // 時間帯集計
  const hourMap = Array(24).fill(0);
  clicks.forEach(ck => { const h = new Date(ck.clicked_at).getHours(); hourMap[h]++; });
  const maxHour = Math.max(...hourMap, 1);

  // 日別集計（過去14日）
  const dayMap = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dayMap[d.toISOString().split('T')[0]] = 0;
  }
  clicks.forEach(ck => { const d = ck.clicked_at.split('T')[0]; if (dayMap[d] !== undefined) dayMap[d]++; });
  const dayEntries = Object.entries(dayMap).reverse();
  const maxDay = Math.max(...Object.values(dayMap), 1);

  const typeLabel = c.ad_type === 'post_boost' ? '投稿ブースト' : '通常広告';

  container.innerHTML = `
    <div class="report-campaign-info">
      <span class="report-type-badge">${typeLabel}</span>
      <div class="report-campaign-title">${c.title || c.ad_text || '広告キャンペーン'}</div>
      <div class="report-campaign-period">${c.start_date || '—'} 〜 ${c.end_date || '—'} (${c.days || 1}日間)</div>
    </div>

    <!-- KPI -->
    <div class="report-kpi-row">
      <div class="report-kpi"><div class="report-kpi-val">${totalImp.toLocaleString()}</div><div class="report-kpi-label">表示回数</div></div>
      <div class="report-kpi"><div class="report-kpi-val">${totalClk.toLocaleString()}</div><div class="report-kpi-label">クリック数</div></div>
      <div class="report-kpi"><div class="report-kpi-val">${ctr}%</div><div class="report-kpi-label">CTR</div></div>
    </div>

    <!-- 性別 -->
    <div class="report-section">
      <div class="report-section-title">👤 性別</div>
      ${_renderReportBar('男性', genderMap.male, totalImp, '#3b82f6')}
      ${_renderReportBar('女性', genderMap.female, totalImp, '#ec4899')}
      ${_renderReportBar('不明', genderMap.unknown, totalImp, '#94a3b8')}
    </div>

    <!-- 地域 -->
    <div class="report-section">
      <div class="report-section-title">📍 地域（上位5）</div>
      ${topRegions.length ? topRegions.map(([r, cnt]) => _renderReportBar(r, cnt, totalImp, '#8b5cf6')).join('') : '<div style="color:var(--text3);font-size:12px;padding:8px 0">データなし</div>'}
    </div>

    <!-- 時間帯 -->
    <div class="report-section">
      <div class="report-section-title">🕐 時間帯別クリック</div>
      <div class="report-hour-chart">
        ${hourMap.map((v, h) => `
          <div class="report-hour-bar-wrap" title="${h}時: ${v}回">
            <div class="report-hour-bar" style="height:${Math.round((v/maxHour)*60)}px"></div>
            <div class="report-hour-label">${h % 3 === 0 ? h : ''}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- 日別 -->
    <div class="report-section">
      <div class="report-section-title">📅 日別クリック（過去14日）</div>
      <div class="report-day-chart">
        ${dayEntries.map(([date, cnt]) => {
          const d = new Date(date);
          const label = `${d.getMonth()+1}/${d.getDate()}`;
          return `<div class="report-day-bar-wrap" title="${label}: ${cnt}回">
            <div class="report-day-bar" style="height:${Math.round((cnt/maxDay)*80)}px"></div>
            <div class="report-day-label">${label}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function _renderReportBar(label, count, total, color) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return `<div class="report-bar-row">
    <div class="report-bar-label">${label}</div>
    <div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    <div class="report-bar-val">${count} (${pct}%)</div>
  </div>`;
}

// 広告作成（新版）
function updateAdPreviewNew() {
  const textInput = document.getElementById('ad-text-input');
  const countEl = document.getElementById('ad-text-count-new');
  if (textInput && countEl) countEl.textContent = textInput.value.length;

  const budget = parseInt(document.getElementById('ad-budget-input')?.value || 0);
  const costEl = document.getElementById('ad-create-total-cost');
  if (costEl) {
    const total = budget * _adDays;
    costEl.textContent = total > 0 ? `合計費用: ¥${total.toLocaleString()} (¥${budget.toLocaleString()} × ${_adDays}日)` : '';
  }
  // 終了日を計算
  const startInput = document.getElementById('ad-start-date');
  const endPreview = document.getElementById('ad-end-date-preview');
  if (startInput && startInput.value && endPreview) {
    const start = new Date(startInput.value);
    start.setDate(start.getDate() + _adDays - 1);
    endPreview.textContent = `終了日: ${start.toLocaleDateString('ja-JP')}`;
  }
}

function setAdDays(days, btn) {
  _adDays = days;
  // クリックされたボタンのグループ内のみ active を切り替え
  if (btn) {
    const row = btn.closest('.ad-days-row');
    if (row) row.querySelectorAll('.ad-days-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  updateAdPreviewNew();
}

function setAdPayMethod(method, btn) {
  _adPayMethod = method;
  if (btn) {
    const row = btn.closest('.ad-pay-row');
    if (row) row.querySelectorAll('.ad-pay-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  // ポイント選択時、残高確認
  if (method === 'points') {
    const budget = parseInt(document.getElementById('ad-budget-input')?.value || 0);
    const needed = budget * _adDays;
    const warn = document.getElementById('ad-points-warn');
    if (warn) warn.textContent = _myPoints >= needed ? `残高 ${_myPoints.toLocaleString()} コイン → 使用後 ${(_myPoints - needed).toLocaleString()} コイン` : `⚠ 残高不足（必要: ${needed} コイン, 残高: ${_myPoints} コイン）`;
  }
}

// カテゴリー別の広告カラーパレット
const _AD_CAT_COLORS = {
  all:     { bg: '#dbeafe', tc: '#1e40af' },
  anime:   { bg: '#ede9fe', tc: '#5b21b6' },
  game:    { bg: '#fef9c3', tc: '#b45309' },
  music:   { bg: '#fff7ed', tc: '#9a3412' },
  fashion: { bg: '#fce7f3', tc: '#be185d' },
  food:    { bg: '#d1fae5', tc: '#065f46' },
  tech:    { bg: '#fef3c7', tc: '#92400e' },
  travel:  { bg: '#f0fdf4', tc: '#166534' },
  manga:   { bg: '#ecfeff', tc: '#164e63' },
  video:   { bg: '#fdf4ff', tc: '#7c3aed' },
};

async function submitNewAdCampaign() {
  const aid = localStorage.getItem('trendy_account_id');
  const text = (document.getElementById('ad-text-input')?.value || '').trim();
  const budget = parseInt(document.getElementById('ad-budget-input')?.value || 0);
  const catId = document.getElementById('ad-cat-select')?.value || 'all';
  const subName = document.getElementById('ad-subcat-select')?.value || null;
  const startDate = document.getElementById('ad-start-date')?.value || new Date().toISOString().split('T')[0];
  const endDateObj = new Date(startDate); endDateObj.setDate(endDateObj.getDate() + _adDays - 1);
  const endDate = endDateObj.toISOString().split('T')[0];

  if (!text) { showToast('広告テキストを入力してください', 'error'); return; }
  if (!budget || budget < 1) { showToast('課金額を入力してください', 'error'); return; }

  // ポイント払いの場合は残高チェック
  if (_adPayMethod === 'points') {
    const needed = budget * _adDays;
    const ok = await dbUsePoints(aid, needed);
    if (!ok) { showToast('ポイントが不足しています', 'error'); return; }
    await _loadMyPoints();
  }

  // 広告主名（選択中のアカウント）
  const advertiserName = adAccountType === 'sub'
    ? (subAccountName || subAccountHandle || '@' + aid)
    : (localStorage.getItem('trendy_nickname') || myHandle || '@' + aid);
  const colors = _AD_CAT_COLORS[catId] || _AD_CAT_COLORS.all;

  const campaign = {
    account_id: aid,
    ad_type: 'custom',
    title: text.slice(0, 20),
    ad_text: text,
    img_data: pendingAdImg || null,
    category: catId,
    sub_category: subName || null,
    daily_budget: budget,
    days: _adDays,
    start_date: startDate,
    end_date: endDate,
    paid_with: _adPayMethod,
    points_used: _adPayMethod === 'points' ? budget * _adDays : 0,
    status: 'active',
    impressions: 0,
    clicks: 0,
  };

  const result = await dbCreateAdCampaign(campaign);
  if (result?._error) {
    // ポイント払いで失敗した場合は返金
    if (_adPayMethod === 'points') {
      await dbAddPoints(aid, budget * _adDays).catch(() => {});
      await _loadMyPoints();
    }
    showToast(`広告の出稿に失敗しました：${result._error}`, 'error');
    return;
  }
  if (result) {
    // ads テーブルにも登録してスポンサーランキングに表示
    if (typeof dbSaveAd === 'function') {
      await dbSaveAd({
        advertiser: advertiserName,
        text: text,
        budget: budget,
        maxPerUser: 5,
        bg: colors.bg,
        tc: colors.tc,
      });
    }
    await dbLoadAds();
    renderAdStrip();
    showToast('広告を出稿しました！スポンサーランキングに掲載されます', 'success');
    pendingAdImg = null;
    goPage('ad-list', null);
  } else {
    showToast('広告の出稿に失敗しました', 'error');
  }
}

// 投稿ブースト
async function renderAdBoostPage() {
  const aid = localStorage.getItem('trendy_account_id');
  await _loadMyPoints();
  // ポイント残高を表示
  const ptEl = document.getElementById('ad-boost-points');
  if (ptEl) ptEl.textContent = `${_myPoints.toLocaleString()}`;
  // カテゴリー選択を初期化
  const catSelect = document.getElementById('boost-cat-select');
  if (catSelect && catSelect.options.length === 0) {
    const catOptions = [
      { id: 'all', name: '全て（どのカテゴリーにも表示）' },
      ...CATS_DATA.filter(c => c.id !== 'all').map(c => ({ id: c.id, name: c.name }))
    ];
    catSelect.innerHTML = catOptions.map(o =>
      `<option value="${o.id}">${o.name}</option>`
    ).join('');
  }
  // デフォルト開始日
  const startInput = document.getElementById('boost-start-date');
  if (startInput && !startInput.value) {
    startInput.value = new Date().toISOString().split('T')[0];
  }
  // 日数・支払方法リセット
  _adDays = 1;
  _adPayMethod = 'money';
  document.querySelectorAll('#page-ad-boost .ad-days-btn').forEach((b,i) => b.classList.toggle('active', i===0));
  document.querySelectorAll('#page-ad-boost .ad-pay-btn').forEach((b,i) => b.classList.toggle('active', i===0));
}

async function openBoostPostPicker() {
  // 自分の投稿を最近20件取得
  const aid = localStorage.getItem('trendy_account_id');
  const { data: posts } = await db.from('posts').select('id,content,created_at,likes_count,views_count')
    .eq('user_handle', '@' + aid).order('created_at', { ascending: false }).limit(20);

  const modal = document.getElementById('boost-post-picker-modal');
  const list = document.getElementById('boost-post-picker-list');
  if (!modal || !list) return;

  list.innerHTML = (posts || []).map(p => {
    const d = new Date(p.created_at);
    const timeStr = `${d.getMonth()+1}/${d.getDate()}`;
    const preview = (p.content || '').slice(0, 40) + ((p.content || '').length > 40 ? '…' : '');
    return `<div class="boost-post-item" onclick="selectBoostPost('${p.id}', this)">
      <div class="boost-post-preview">${preview || '(内容なし)'}</div>
      <div class="boost-post-meta">${timeStr} ❤️${p.likes_count||0} 👁${p.views_count||0}</div>
    </div>`;
  }).join('') || '<div style="padding:20px;text-align:center;color:var(--text3)">投稿がありません</div>';

  modal.style.display = 'flex';
}

function selectBoostPost(postId, el) {
  _boostSelectedPostId = postId;
  document.querySelectorAll('.boost-post-item').forEach(b => b.classList.remove('selected'));
  if (el) el.classList.add('selected');
  const preview = el?.querySelector('.boost-post-preview')?.textContent || '';
  const selectedEl = document.getElementById('boost-selected-preview');
  if (selectedEl) { selectedEl.textContent = preview; selectedEl.style.display = ''; }
  document.getElementById('boost-post-picker-modal').style.display = 'none';
}

async function submitPostBoost() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!_boostSelectedPostId) { showToast('投稿を選択してください', 'error'); return; }
  const budget = parseInt(document.getElementById('boost-budget-input')?.value || 0);
  const catId = document.getElementById('boost-cat-select')?.value || 'all';
  const startDate = document.getElementById('boost-start-date')?.value || new Date().toISOString().split('T')[0];
  const endDateObj = new Date(startDate); endDateObj.setDate(endDateObj.getDate() + _adDays - 1);
  const endDate = endDateObj.toISOString().split('T')[0];

  if (!budget || budget < 1) { showToast('課金額を入力してください', 'error'); return; }

  if (_adPayMethod === 'points') {
    const needed = budget * _adDays;
    const ok = await dbUsePoints(aid, needed);
    if (!ok) { showToast('ポイントが不足しています', 'error'); return; }
  }

  // ブースト対象の投稿テキストを取得（プレビューから）
  const boostPreviewText = document.getElementById('boost-selected-preview')?.textContent || '投稿をブースト中';
  const advertiserName = localStorage.getItem('trendy_nickname') || myHandle || '@' + aid;
  const colors = _AD_CAT_COLORS[catId] || _AD_CAT_COLORS.all;

  const campaign = {
    account_id: aid,
    ad_type: 'post_boost',
    post_id: _boostSelectedPostId,
    title: '投稿ブースト',
    category: catId,
    daily_budget: budget,
    days: _adDays,
    start_date: startDate,
    end_date: endDate,
    paid_with: _adPayMethod,
    points_used: _adPayMethod === 'points' ? budget * _adDays : 0,
    status: 'active',
    impressions: 0,
    clicks: 0,
  };

  const result = await dbCreateAdCampaign(campaign);
  if (result?._error) {
    // ポイント払いで失敗した場合は返金
    if (_adPayMethod === 'points') {
      await dbAddPoints(aid, budget * _adDays).catch(() => {});
      await _loadMyPoints();
    }
    showToast(`ブーストに失敗しました：${result._error}`, 'error');
    return;
  }
  if (result) {
    // ads テーブルにも登録してスポンサーランキングに表示
    if (typeof dbSaveAd === 'function') {
      const boostText = boostPreviewText.slice(0, 60) || '投稿ブースト中🚀';
      await dbSaveAd({
        advertiser: advertiserName,
        text: boostText,
        budget: budget,
        maxPerUser: 5,
        bg: colors.bg,
        tc: colors.tc,
      });
    }
    await dbLoadAds();
    renderAdStrip();
    showToast('投稿をブーストしました！スポンサーランキングに掲載されます', 'success');
    _boostSelectedPostId = null;
    goPage('ad-list', null);
  } else {
    showToast('ブーストに失敗しました', 'error');
  }
}
