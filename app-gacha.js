// ※ このファイルは app.js を機能別に分割したものです（読み込み順厳守）
// ガチャ・アイテム・開発者統計

// ※ 装備システム・ガチャ演出・称号バッジ・いいね絵文字は廃止により削除


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

      // パスワード照合はサーバー(Netlify Function)で行う。未デプロイ環境は従来方式へフォールバック
      const _pwOk = await dbVerifyLogin(inputId, inputPw, profile);
      if (!_pwOk) { _showErr('IDまたはパスワードが正しくありません'); return; }

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
      // バッジ強化レベル・レアリティをSupabaseから復元
      if (profile.badge_levels && typeof profile.badge_levels === 'object') {
        localStorage.setItem('trendy_badge_levels', JSON.stringify(profile.badge_levels));
      }
      if (profile.badge_rarities && typeof profile.badge_rarities === 'object') {
        localStorage.setItem('trendy_badge_rarities', JSON.stringify(profile.badge_rarities));
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
  // 未オンボーディングならカテゴリー選択を表示
  setTimeout(() => { if (typeof _maybeShowOnboarding === 'function') _maybeShowOnboarding(); }, 500);
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

let _hsTimer       = null;
let _hsPostCache   = [];      // 検索結果の投稿を一時保存（index で参照）
let _hsAccExpanded = false;   // アカウント結果の「すべて表示」状態
let _hsLastResult  = null;    // 再描画用キャッシュ { accounts, posts, q }

function openHomeSearch() {
  const overlay = document.getElementById('home-search-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  const q = (document.getElementById('home-search-input')?.value || '').trim();
  if (!q) _hsShowHint();
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
  _hsShowHint();
}

/* 未入力時のガイド表示 */
function _hsShowHint() {
  const results = document.getElementById('home-search-results');
  if (!results) return;
  results.innerHTML = `<div class="hs-hint">
    <i class="ti ti-search"></i>
    <div class="hs-hint-title">投稿とアカウントをまとめて検索</div>
    <div class="hs-hint-sub">キーワード・名前・カテゴリーで探せます</div>
  </div>`;
}

function onHomeSearchInput() {
  const q = (document.getElementById('home-search-input')?.value || '').trim();
  const clrBtn = document.getElementById('hs-clear-btn');
  if (clrBtn) clrBtn.style.display = q ? '' : 'none';
  clearTimeout(_hsTimer);
  if (!q) { _hsShowHint(); return; }
  _hsTimer = setTimeout(() => _runHomeSearch(q), 280);
}

async function _runHomeSearch(q) {
  const results = document.getElementById('home-search-results');
  if (!results) return;
  results.innerHTML = `<div class="hs-loading"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;font-size:24px"></i></div>`;
  // 投稿とアカウントを同時に検索
  const [accounts, posts] = await Promise.all([
    dbSearchProfiles(q),
    dbSearchPosts(q),
  ]);
  _hsAccExpanded = false;
  _hsLastResult = { accounts: accounts || [], posts: posts || [], q };
  _renderHsCombined();
}

/* アカウント「すべて表示」 */
function _hsExpandAccounts() {
  _hsAccExpanded = true;
  _renderHsCombined();
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

/* アカウント1行のHTML */
function _hsUserRowHTML(p, q, myId) {
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
}

/* 投稿1件のHTML（i は _hsPostCache のインデックス） */
function _hsPostRowHTML(p, i, q) {
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
      <div class="hs-post-meta"><i class="ti ti-heart"></i> ${p.likes_count||0} <span class="hs-meta-sep"></span><i class="ti ti-eye"></i> ${p.views_count||0}</div>
    </div>
  </div>`;
}

/* 投稿+アカウントの同時表示 */
const HS_ACC_PREVIEW = 4; // 折りたたみ時に見せるアカウント数
function _renderHsCombined() {
  const results = document.getElementById('home-search-results');
  if (!results || !_hsLastResult) return;
  const { accounts, posts, q } = _hsLastResult;
  const myId = localStorage.getItem('trendy_account_id');

  if (!accounts.length && !posts.length) {
    results.innerHTML = `<div class="hs-empty"><i class="ti ti-zoom-question"></i><div>「${_hsEsc(q)}」に一致する投稿・アカウントが見つかりません</div></div>`;
    return;
  }

  let html = '';

  // ── アカウントセクション ──
  if (accounts.length) {
    const shown = _hsAccExpanded ? accounts : accounts.slice(0, HS_ACC_PREVIEW);
    const moreBtn = !_hsAccExpanded && accounts.length > HS_ACC_PREVIEW
      ? `<button class="hs-more-btn" onclick="_hsExpandAccounts()">残り${accounts.length - HS_ACC_PREVIEW}人をすべて表示 <i class="ti ti-chevron-down"></i></button>`
      : '';
    html += `<div class="hs-section">
      <div class="hs-sec-head"><i class="ti ti-users"></i> アカウント <span class="hs-sec-count">${accounts.length}</span></div>
      ${shown.map(p => _hsUserRowHTML(p, q, myId)).join('')}
      ${moreBtn}
    </div>`;
  }

  // ── 投稿セクション ──
  if (posts.length) {
    _hsPostCache = posts;
    html += `<div class="hs-section">
      <div class="hs-sec-head"><i class="ti ti-message"></i> 投稿 <span class="hs-sec-count">${posts.length}</span></div>
      ${posts.map((p, i) => _hsPostRowHTML(p, i, q)).join('')}
    </div>`;
  }

  results.innerHTML = html;
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