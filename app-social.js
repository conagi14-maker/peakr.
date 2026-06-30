// ※ このファイルは app.js を機能別に分割したものです（読み込み順厳守）
// フォロー・ユーザーページ・通知・DM・トラック

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
// アクティブなアカウント ID（メイン or サブ）を返す
// サブ時は `mainId__sub` を返してフォロー関係を分離管理する
function _activeAid() {
  const main = localStorage.getItem('trendy_account_id');
  if (!main) return null;
  if (myAccountType === 'sub' && hasSubAccount) return main + '__sub';
  return main;
}
// コイン・アイテム等「常にメイン共有」用
function _mainAid() {
  return localStorage.getItem('trendy_account_id');
}

function selectAccount(type) {
  myAccountType = type;
  localStorage.setItem('trendy_acct_type', type); // 選択状態を永続化
  const isSub = type === 'sub' && hasSubAccount;
  // フォロー一覧を切替先で再読込
  (async () => {
    const aid = _activeAid();
    if (aid && typeof dbFetchFollowing === 'function') {
      try {
        const handles = await dbFetchFollowing(aid);
        // followingSet / myFollowingHandles をサブ用に上書き
        if (typeof followingSet !== 'undefined') {
          // 既存をクリアして再構築
          [...followingSet].forEach(h => followingSet.delete(h));
          myFollowingHandles.splice(0);
          handles.forEach(h => {
            myFollowingHandles.push(h);
            followingSet.add(h);
          });
        }
        // フォロー数表示を更新
        if (typeof dbFetchFollowCounts === 'function') {
          const c = await dbFetchFollowCounts(aid);
          _updateFollowCountUI?.(c.following, c.followers);
        }
      } catch(e) { console.warn('[ACCT] フォロー切替読込失敗:', e); }
    }
  })();

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

  // 実アバター
  const mainAvData = localStorage.getItem('trendy_av');
  const mainNameLetter = (localStorage.getItem('trendy_myName') || 'あ')[0];
  const mainName = localStorage.getItem('trendy_myName') || 'あなた';
  const mainAvInner = mainAvData
    ? `<img src="${mainAvData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : mainNameLetter;
  const mainAvStyle = mainAvData
    ? 'background:transparent;padding:0;overflow:hidden'
    : 'background:#dbeafe;color:#1e40af';

  let html = `
    <div class="acct-card ${mainActive ? 'acct-active' : ''}">
      <div class="acct-card-av" style="${mainAvStyle}">${mainAvInner}</div>
      <div class="acct-card-info">
        <div class="acct-card-name">${mainName} <span class="sidebar-acct-chip chip-main">メイン</span></div>
        <div class="acct-card-handle">${myHandle}</div>
        ${mainActive ? '<div class="acct-card-status"><i class="ti ti-check"></i> 使用中</div>' : ''}
      </div>
      ${mainActive
        ? '<i class="ti ti-check acct-check-icon"></i>'
        : '<button class="btn-sm" onclick="switchToAccount(\'main\')">切り替え</button>'}
    </div>`;

  if (hasSubAccount) {
    const av = subAccountName !== '匿名ユーザー' ? subAccountName[0] : '匿';
    const subAvData = localStorage.getItem('trendy_sub_av');
    const subAvInner = subAvData
      ? `<img src="${subAvData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : av;
    const subAvStyle = subAvData
      ? 'background:transparent;padding:0;overflow:hidden'
      : 'background:#ede9fe;color:#5b21b6';
    html += `
    <div class="acct-card ${subActive ? 'acct-active' : ''}">
      <div class="acct-card-av" style="${subAvStyle}">${subAvInner}</div>
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

  // ── 認証情報をサーバーに作成（scrypt・匿名キーから読めない auth_credentials へ） ──
  if (typeof dbRegisterCredential === 'function') dbRegisterCredential(accountId, pw);

  // ── 新規登録ボーナス：1000ピークコインをプレゼント ──
  if (typeof dbAddPoints === 'function') {
    dbAddPoints(accountId, 1000, 'admin').catch(e => {
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

  // 新規登録直後にカテゴリー選択オンボーディングを表示
  setTimeout(() => { if (typeof _maybeShowOnboarding === 'function') _maybeShowOnboarding(); }, 500);
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

// ══════════════════════════════════════════
// 初訪問オンボーディング: メインカテゴリー選択 → 自分向けランキング
// ══════════════════════════════════════════
let _onboardSel = [];

/** オンボーディング完了フラグのキー（アカウント別＋後方互換の旧グローバル） */
function _onbDoneKey() {
  return 'trendy_onboarded_' + (localStorage.getItem('trendy_account_id') || 'guest');
}
function _isOnboarded() {
  return localStorage.getItem('trendy_onboarded') === 'true'
      || localStorage.getItem(_onbDoneKey()) === 'true';
}
function _markOnboardedLocal() {
  // 端末ローカルのキャッシュ（次回は即スキップ）
  try { localStorage.setItem(_onbDoneKey(), 'true'); } catch(e) {}
}
function _markOnboarded() {
  // ローカル＋DB（アカウント単位で全端末に反映）
  _markOnboardedLocal();
  const aid = localStorage.getItem('trendy_account_id');
  if (aid && typeof dbSetOnboarded === 'function') dbSetOnboarded(aid);
}

/** ログイン済みで未オンボーディングなら選択画面を表示（DBでアカウント単位に確認） */
async function _maybeShowOnboarding() {
  if (!localStorage.getItem('trendy_logged_in')) return;
  if (typeof CATS_DATA === 'undefined' || !CATS_DATA.length) return;
  if (_isOnboarded()) return; // ローカルキャッシュで既知なら即スキップ
  // 別端末で完了済みかDBで確認（列が無ければ null → ローカル基準で表示）
  const aid = localStorage.getItem('trendy_account_id');
  if (aid && typeof dbGetOnboarded === 'function') {
    const done = await dbGetOnboarded(aid);
    if (done === true) { _markOnboardedLocal(); return; }
  }
  if (document.getElementById('onboard-overlay')) return; // 待機中に開いていたら二重表示しない
  _showOnboarding();
}

function _showOnboarding() {
  if (document.getElementById('onboard-overlay')) return; // 二重表示防止
  // 表示した時点で「提示済み」にする → 操作せず離脱/リロードしても二度と出さない
  _markOnboarded();
  _onboardSel = [];
  const cats = CATS_DATA.filter(c => c.id !== 'all');
  const chips = cats.map(c => `
    <button class="onb-chip" data-cat="${c.id}" onclick="_toggleOnboardCat('${c.id}',this)">
      <i class="ti ${c.icon}" style="color:${c.color}"></i>
      <span>${c.name}</span>
    </button>`).join('');
  const html = `
    <div class="onboard-overlay" id="onboard-overlay" onclick="if(event.target===this)_finishOnboarding(false)">
      <div class="onboard-panel">
        <button class="onb-close" onclick="_finishOnboarding(false)" aria-label="閉じる"><i class="ti ti-x"></i></button>
        <div class="onb-logo"><span class="logo-mark">T</span></div>
        <h2 class="onb-title">興味のあるカテゴリーを選ぼう</h2>
        <p class="onb-sub">選んだカテゴリーがランキング・ダイブの先頭に来て、あなた向けの表示になります（後から設定で変更できます）</p>
        <div class="onb-chips">${chips}</div>
        <div class="onb-actions">
          <button class="onb-skip" onclick="_finishOnboarding(false)">スキップ</button>
          <button class="onb-go" id="onb-go" disabled onclick="_finishOnboarding(true)">
            <span id="onb-go-label">カテゴリーを選択</span>
          </button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function _toggleOnboardCat(id, btn) {
  const i = _onboardSel.indexOf(id);
  if (i >= 0) { _onboardSel.splice(i, 1); btn.classList.remove('on'); }
  else { _onboardSel.push(id); btn.classList.add('on'); }
  const go = document.getElementById('onb-go');
  const label = document.getElementById('onb-go-label');
  if (go) go.disabled = _onboardSel.length === 0;
  if (label) label.textContent = _onboardSel.length === 0
    ? 'カテゴリーを選択'
    : `これで始める（${_onboardSel.length}件）`;
}

/** apply=true なら選択を catOrder/ダイブ興味に反映 */
function _finishOnboarding(apply) {
  if (apply && _onboardSel.length) {
    // 選んだカテゴリーをランキング列の先頭へ
    const rest = catOrder.filter(id => !_onboardSel.includes(id));
    catOrder = [..._onboardSel.filter(id => catOrder.includes(id)), ...rest];
    try { localStorage.setItem('trendy_cat_order_user', JSON.stringify(catOrder)); } catch(e) {}
    // ダイブも同カテゴリーを優先（舵の重みを底上げ）
    if (typeof _diveInterest !== 'undefined') {
      _onboardSel.forEach(id => { _diveInterest[id] = 2; });
      if (typeof _saveDiveInterest === 'function') _saveDiveInterest();
    }
  }
  _markOnboarded();
  document.getElementById('onboard-overlay')?.remove();
  if (apply && _onboardSel.length) {
    if (typeof showToast === 'function') showToast('あなた向けランキングを表示します', 'success');
    goPage('ranking', null);
    if (typeof renderCatGrid === 'function') renderCatGrid();
  }
}

// ══════════════════════════════════════════
// ステージ（リアルタイム活動アピール）
// ══════════════════════════════════════════
const STAGE_TYPES = {
  stream : { label: '配信',    icon: 'ti-device-tv-old' },
  live   : { label: 'ライブ',  icon: 'ti-microphone-2' },
  tv     : { label: 'TV出演',  icon: 'ti-device-tv' },
  event  : { label: 'イベント', icon: 'ti-calendar-event' },
  signing: { label: 'サイン会', icon: 'ti-writing-sign' },
  other  : { label: 'その他',  icon: 'ti-star' },
};
let _stageCatFilter   = null;   // null = 全て
let _stageActivities  = [];
let _stageProfMap     = {};
let _stageCommenters  = {};     // { activityId: { total, set:Set(account_id) } }
let _actSelType       = 'stream';

function _stageEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// 終了時刻は廃止。手動「終了」(ends_at をセット) が無ければ、内部の安全フェード
// 期間(ユーザーには締切として見せない)を過ぎたら自動で消す。
const STAGE_LIVE_MAX_MS = 6 * 3600 * 1000;
function _activityStatus(a, now) {
  const start = new Date(a.starts_at).getTime();
  const end = a.ends_at ? new Date(a.ends_at).getTime() : start + STAGE_LIVE_MAX_MS;
  if (now >= start && now <= end) return 'live';
  if (now < start) return 'upcoming';
  return 'expired';
}
function _activityScore(a, now) {
  const start = new Date(a.starts_at).getTime();
  const hoursSince = Math.max(0, (now - start) / 3600000);
  const cm = _stageCommenters[a.id];
  const uniqueCommenters = cm ? cm.set.size : 0;
  // フォロワーは評価から除外。クリックはアカウント単位で重複排除済み(click_count)。
  const base = (a.boost_score || 0) + (a.click_count || 0) * 3 + uniqueCommenters * 5;
  const recency = Math.max(0, 60 - hoursSince * 5);
  return Math.round(base + recency);
}
function _stageTimeLabel(a, now) {
  const start = new Date(a.starts_at);
  const hh = String(start.getHours()).padStart(2,'0') + ':' + String(start.getMinutes()).padStart(2,'0');
  const diffMin = Math.round((start.getTime() - now) / 60000);
  if (diffMin > 0 && diffMin < 60) return `あと${diffMin}分`;
  return hh;
}

async function renderStage() {
  const body = document.getElementById('stage-body');
  if (!body) return;
  // 認証アカウントのみ「出演を登録」を表示
  const regBtn = document.getElementById('stage-register-btn');
  const hint   = document.getElementById('stage-verify-hint');
  if (regBtn) regBtn.style.display = _myIsVerified ? '' : 'none';
  if (hint)   hint.style.display   = (_myIsVerified || !localStorage.getItem('trendy_logged_in')) ? 'none' : '';

  body.innerHTML = '<div class="stage-empty"><i class="ti ti-loader-2"></i> 読み込み中…</div>';
  let acts = [];
  try { acts = await dbFetchActivities(200); } catch(e) { console.warn('[stage]', e); }
  const now = Date.now();
  acts = (acts || []).filter(a => _activityStatus(a, now) !== 'expired');
  _stageActivities = acts;

  // プロフィール＋実況参加者(スコア用)を一括取得
  const ids    = [...new Set(acts.map(a => a.account_id))];
  const actIds = acts.map(a => a.id);
  _stageProfMap = {}; _stageCommenters = {};
  if (ids.length) {
    try {
      const profs = await dbFetchProfilesByIds(ids);
      (profs || []).forEach(p => { _stageProfMap[p.account_id] = p; });
    } catch(e) {}
  }
  if (actIds.length) {
    try { _stageCommenters = await dbFetchActivityCommenters(actIds); } catch(e) {}
  }
  _renderStageCats();
  _renderStageBody();
}

function _renderStageCats() {
  const bar = document.getElementById('stage-cat-bar');
  if (!bar) return;
  const used = new Set(_stageActivities.map(a => a.cat_id).filter(Boolean));
  const cats = (typeof CATS_DATA !== 'undefined' ? CATS_DATA : []).filter(c => c.id !== 'all' && used.has(c.id));
  let html = `<button class="stage-cat-chip${!_stageCatFilter?' active':''}" onclick="setStageCat(null)">全て</button>`;
  html += cats.map(c => `<button class="stage-cat-chip${_stageCatFilter===c.id?' active':''}" onclick="setStageCat('${c.id}')"><i class="ti ${c.icon}"></i> ${_stageEsc(c.name)}</button>`).join('');
  bar.innerHTML = html;
}
function setStageCat(catId) {
  _stageCatFilter = catId;
  _renderStageCats();
  _renderStageBody();
}

function _stageAvatar(a) {
  const p = _stageProfMap[a.account_id] || {};
  if (p.avatar_data) return `<img src="${p.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  const ch = (p.nickname || a.account_id || '?')[0];
  return `<span>${_stageEsc(ch)}</span>`;
}
function _stageName(a) {
  const p = _stageProfMap[a.account_id] || {};
  return _stageEsc(p.nickname || a.account_id);
}
function _stageVerifiedMark(a) {
  const p = _stageProfMap[a.account_id] || {};
  return p.is_verified ? '<i class="ti ti-rosette-discount-check stage-verify-ic"></i>' : '';
}
function _stageActionHTML(a) {
  if (a.url) {
    return `<a class="stage-watch" href="${encodeURI(a.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();_stageOpenLink('${a.id}')"><i class="ti ti-external-link"></i> 見る</a>`;
  }
  if (a.location) {
    return `<span class="stage-loc"><i class="ti ti-map-pin"></i> ${_stageEsc(a.location)}</span>`;
  }
  return '';
}
function _stageIsOwn(a) {
  return a.account_id === localStorage.getItem('trendy_account_id');
}
function _stageBoostBtn(a) {
  if (_stageIsOwn(a)) return '';
  return `<button class="stage-boost-btn" onclick="event.stopPropagation();openActivityBoostPicker('${a.id}')" title="ブースト"><i class="ti ti-rocket"></i></button>`;
}
function _stageEndBtn(a) {
  if (!_stageIsOwn(a)) return '';
  return `<button class="stage-end-btn" onclick="event.stopPropagation();endMyActivity('${a.id}')" title="この出演を終了"><i class="ti ti-square"></i> 終了</button>`;
}
async function endMyActivity(activityId) {
  if (!confirm('この出演を終了しますか？')) return;
  const ok = await dbEndActivity(activityId);
  if (!ok) { showToast('終了に失敗しました', 'error'); return; }
  showToast('出演を終了しました', '');
  renderStage();
}

function _renderStageBody() {
  const body = document.getElementById('stage-body');
  if (!body) return;
  const now = Date.now();
  let acts = _stageActivities;
  if (_stageCatFilter) acts = acts.filter(a => a.cat_id === _stageCatFilter);

  const live = acts.filter(a => _activityStatus(a, now) === 'live')
                   .sort((x, y) => _activityScore(y, now) - _activityScore(x, now));
  const upcoming = acts.filter(a => _activityStatus(a, now) === 'upcoming')
                       .sort((x, y) => new Date(x.starts_at) - new Date(y.starts_at));

  if (!live.length && !upcoming.length) {
    body.innerHTML = `<div class="stage-empty"><i class="ti ti-broadcast-off"></i><div>今この${_stageCatFilter?'カテゴリーの':''}ステージに立っている人はいません</div></div>`;
    return;
  }

  let html = '';
  if (live.length) {
    html += `<div class="stage-sec-head live"><span class="stage-live-dot"></span> ライブ中 <span class="stage-sec-sub">注目度順</span></div>`;
    html += live.map((a, i) => _stageLiveCard(a, i + 1, now)).join('');
  }
  if (upcoming.length) {
    html += `<div class="stage-sec-head"><i class="ti ti-calendar-event"></i> これから <span class="stage-sec-sub">時間順</span></div>`;
    html += upcoming.map(a => _stageUpcomingCard(a, now)).join('');
  }
  body.innerHTML = html;
}

function _stageLiveCard(a, rank, now) {
  const t = STAGE_TYPES[a.type] || STAGE_TYPES.other;
  const score = _activityScore(a, now);
  const boost = (a.boost_score || 0) > 0 ? `<span class="stage-boost-pill"><i class="ti ti-rocket"></i> +${(a.boost_score||0).toLocaleString()}</span>` : '';
  const rankCls = rank === 1 ? 'r1' : rank === 2 ? 'r2' : rank === 3 ? 'r3' : '';
  return `<div class="stage-card live${rank===1?' hero':''}">
    <div class="stage-card-main">
      <span class="stage-rank ${rankCls}">${rank}</span>
      <div class="stage-av">${_stageAvatar(a)}</div>
      <div class="stage-card-info">
        <div class="stage-card-top">
          <span class="stage-card-name">${_stageName(a)}</span>${_stageVerifiedMark(a)}
          <span class="stage-type-chip"><i class="ti ${t.icon}"></i> ${t.label}</span>
        </div>
        <div class="stage-card-title">${_stageEsc(a.title)}</div>
      </div>
    </div>
    <div class="stage-card-foot">
      <span class="stage-attn"><i class="ti ti-flame"></i> 注目度 <b>${score.toLocaleString()}</b></span>
      ${boost}
      <span class="stage-foot-right">${_stageEndBtn(a)}${_stageBoostBtn(a)}${_stageActionHTML(a)}</span>
    </div>
    ${_stageCommentSection(a)}
  </div>`;
}

function _stageUpcomingCard(a, now) {
  const t = STAGE_TYPES[a.type] || STAGE_TYPES.other;
  const meta = a.location
    ? `<i class="ti ti-map-pin"></i> ${_stageEsc(a.location)}`
    : (a.url ? `<i class="ti ti-link"></i> オンライン` : '');
  return `<div class="stage-up-row">
    <div class="stage-up-time">${_stageTimeLabel(a, now)}</div>
    <div class="stage-card up">
      <div class="stage-card-main">
        <div class="stage-av sm">${_stageAvatar(a)}</div>
        <div class="stage-card-info">
          <div class="stage-card-top">
            <span class="stage-card-name">${_stageName(a)}</span>${_stageVerifiedMark(a)}
            <span class="stage-type-chip"><i class="ti ${t.icon}"></i> ${t.label}</span>
          </div>
          <div class="stage-card-title">${_stageEsc(a.title)}</div>
          ${meta ? `<div class="stage-up-meta">${meta}</div>` : ''}
        </div>
        ${_stageUpcomingActionBtn(a)}
      </div>
      ${_stageCommentSection(a)}
    </div>
  </div>`;
}
function _stageUpcomingActionBtn(a) {
  if (_stageIsOwn(a)) {
    return `<button class="stage-end-btn" onclick="event.stopPropagation();cancelMyActivity('${a.id}')" title="取り消し"><i class="ti ti-x"></i></button>`;
  }
  return _stageBoostBtn(a);
}
async function cancelMyActivity(activityId) {
  if (!confirm('この出演予定を取り消しますか？')) return;
  const ok = await dbDeleteActivity(activityId);
  if (!ok) { showToast('取り消しに失敗しました', 'error'); return; }
  showToast('出演予定を取り消しました', '');
  renderStage();
}

function _stageOpenLink(activityId) {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  const a = _stageActivities.find(x => x.id === activityId);
  if (a && a.account_id === aid) return; // 自分のクリックは数えない
  if (typeof dbIncrementActivityClick === 'function') dbIncrementActivityClick(activityId, aid);
}

// ── 実況コメント（スコアにも反映：ユニーク参加者数） ──
function _stageCommentSection(a) {
  const cm = _stageCommenters[a.id];
  const n = cm ? cm.total : 0;
  return `<button class="stage-comment-btn" data-act="${a.id}" onclick="event.stopPropagation();toggleStageComments('${a.id}',this)">
      <i class="ti ti-message-circle"></i> 実況${n ? ' ' + n : ''}
    </button>
    <div class="stage-comments" id="sc-${a.id}" style="display:none"></div>`;
}
async function toggleStageComments(activityId, btn) {
  const box = document.getElementById('sc-' + activityId);
  if (!box) return;
  if (box.style.display !== 'none') { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = '<div class="sc-loading"><i class="ti ti-loader-2"></i></div>';
  const comments = await dbFetchActivityComments(activityId);
  _renderStageComments(activityId, comments);
}
function _renderStageComments(activityId, comments) {
  const box = document.getElementById('sc-' + activityId);
  if (!box) return;
  const loggedIn = !!localStorage.getItem('trendy_logged_in');
  const list = (comments && comments.length)
    ? comments.map(c => `<div class="sc-item"><span class="sc-name">${_stageEsc(c.user_name || c.account_id)}</span><span class="sc-text">${_stageEsc(c.content)}</span></div>`).join('')
    : '<div class="sc-empty">まだ実況がありません。最初のひとことを！</div>';
  const input = loggedIn
    ? `<div class="sc-input-row">
         <input type="text" class="sc-input" id="sc-in-${activityId}" maxlength="140" placeholder="実況コメント…" onkeydown="if(event.key==='Enter')submitStageComment('${activityId}')">
         <button class="sc-send" onclick="submitStageComment('${activityId}')">送信</button>
       </div>`
    : '<div class="sc-empty">ログインすると実況できます</div>';
  box.innerHTML = `<div class="sc-list">${list}</div>${input}`;
  const inEl = document.getElementById('sc-in-' + activityId);
  if (inEl) inEl.focus();
}
async function submitStageComment(activityId) {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) { showToast('ログインが必要です', 'warn'); return; }
  const inEl = document.getElementById('sc-in-' + activityId);
  const content = (inEl ? inEl.value : '').trim();
  if (!content) return;
  if (inEl) inEl.value = '';
  const res = await dbAddActivityComment({ activityId, accountId: aid, userName: (typeof myNickname !== 'undefined' ? myNickname : '') || aid, content });
  if (!res) { showToast('送信に失敗しました', 'error'); return; }
  // スコア用の参加者集計をローカル更新（新規参加者なら注目度+5相当）
  if (!_stageCommenters[activityId]) _stageCommenters[activityId] = { total: 0, set: new Set() };
  _stageCommenters[activityId].total++;
  _stageCommenters[activityId].set.add(aid);
  // 実況リストを更新（パネルは開いたまま）
  const comments = await dbFetchActivityComments(activityId);
  _renderStageComments(activityId, comments);
  // ボタンの件数バッジを更新
  const btn = document.querySelector(`.stage-comment-btn[data-act="${activityId}"]`);
  if (btn) btn.innerHTML = `<i class="ti ti-message-circle"></i> 実況 ${_stageCommenters[activityId].total}`;
}

// ── 出演登録モーダル ──
function openActivityModal() {
  if (!_myIsVerified) { showToast('出演登録は認証アカウントのみ可能です', 'warn'); return; }
  // カテゴリー候補を埋める
  const sel = document.getElementById('act-cat');
  if (sel && typeof CATS_DATA !== 'undefined') {
    sel.innerHTML = '<option value="">カテゴリーを選択</option>' +
      CATS_DATA.filter(c => c.id !== 'all').map(c => `<option value="${c.id}">${_stageEsc(c.name)}</option>`).join('');
  }
  // 既定の開始時刻＝今
  const startEl = document.getElementById('act-start');
  if (startEl) startEl.value = _localDatetimeValue(new Date());
  const endEl = document.getElementById('act-end');
  if (endEl) endEl.value = '';
  ['act-title','act-url','act-location'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  _actSelType = 'stream';
  document.querySelectorAll('#act-type-row .act-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'stream'));
  document.getElementById('activity-overlay').style.display = 'block';
  document.getElementById('activity-modal').style.display = 'block';
}
function closeActivityModal() {
  const ov = document.getElementById('activity-overlay');
  const mo = document.getElementById('activity-modal');
  if (ov) ov.style.display = 'none';
  if (mo) mo.style.display = 'none';
}
function selectActType(type, btn) {
  _actSelType = type;
  document.querySelectorAll('#act-type-row .act-type-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}
function _localDatetimeValue(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function submitActivity() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || !_myIsVerified) { showToast('認証アカウントのみ出演できます', 'warn'); return; }
  const title = (document.getElementById('act-title').value || '').trim();
  if (!title) { showToast('タイトルを入力してください', 'warn'); return; }
  const startVal = document.getElementById('act-start').value;
  if (!startVal) { showToast('開始時刻を入力してください', 'warn'); return; }
  const btn = document.getElementById('act-submit');
  if (btn) btn.disabled = true;
  const res = await dbCreateActivity({
    accountId: aid,
    type     : _actSelType,
    title    : title,
    catId    : document.getElementById('act-cat').value || null,
    url      : (document.getElementById('act-url').value || '').trim() || null,
    location : (document.getElementById('act-location').value || '').trim() || null,
    startsAt : new Date(startVal).toISOString(),
    endsAt   : null,
  });
  if (btn) btn.disabled = false;
  if (!res) { showToast('登録に失敗しました', 'error'); return; }
  closeActivityModal();
  showToast('ステージに出演しました 🎤', 'success');
  renderStage();
}

// ── 活動ブースト（既存チケット＋1出演あたり上限を流用） ──
async function openActivityBoostPicker(activityId) {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) { showToast('ログインが必要です', 'warn'); return; }
  let curBoost = 0;
  try {
    _gachaItems = await dbGetUserItems(aid);
    curBoost = await dbGetActivityBoost(activityId);
  } catch(e) {}
  const cap = (typeof BOOST_CAP === 'number' && BOOST_CAP > 0) ? BOOST_CAP : 1000;
  const remain = Math.max(0, cap - curBoost);
  const inv = _gachaItems || {};
  const items = [
    { id:'boost_lg',  label:'LG ブースト',  add:'+1000', amt:1000, color:'#ef4444', qty: inv['boost_lg']  || 0 },
    { id:'boost_ssr', label:'SSR ブースト', add:'+100',  amt:100,  color:'#f59e0b', qty: inv['boost_ssr'] || 0 },
    { id:'boost_sr',  label:'SR ブースト',  add:'+30',   amt:30,   color:'#a855f7', qty: inv['boost_sr']  || 0 },
    { id:'boost_r',   label:'R ブースト',   add:'+5',    amt:5,    color:'#3b82f6', qty: inv['boost_r']   || 0 },
    { id:'boost_n',   label:'N ブースト',   add:'+1',    amt:1,    color:'#64748b', qty: inv['boost_n']   || 0 },
  ];
  document.getElementById('boost-picker-modal')?.remove();
  const html = `
    <div id="boost-picker-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)document.getElementById('boost-picker-modal').remove()">
      <div style="background:var(--bg);border-radius:14px;padding:18px;max-width:380px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-weight:700;font-size:15px;color:var(--text1)"><i class="ti ti-rocket" style="color:#f59e0b"></i> 活動をブースト</div>
          <button onclick="document.getElementById('boost-picker-modal').remove()" style="background:none;border:none;font-size:20px;color:var(--text3);cursor:pointer">×</button>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;margin-bottom:10px;border-radius:10px;background:var(--surface);border:1px solid var(--border)">
          <span style="font-size:11px;color:var(--text3)"><i class="ti ti-shield-check" style="color:#10b981"></i> 公平性のため1活動の上限あり</span>
          <span style="font-size:12px;font-weight:700;color:${remain>0?'var(--text1)':'#ef4444'}">残り +${remain.toLocaleString()} / +${cap.toLocaleString()}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${items.map(b => {
            const over = b.amt > remain;
            if (b.qty > 0 && !over) {
              return `<button onclick="document.getElementById('boost-picker-modal').remove();applyBoostToActivity('${activityId}','${b.id}')" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;border:1px solid ${b.color};background:var(--bg2);color:var(--text1);font-size:13px;cursor:pointer;text-align:left">
                <span style="font-weight:700;color:${b.color};min-width:60px">${b.add}</span><span style="flex:1">${b.label}</span><span style="color:var(--text3);font-size:12px">残${b.qty}</span></button>`;
            }
            return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;border:1px dashed var(--border);background:var(--surface);color:var(--text3);font-size:13px;text-align:left">
                <span style="font-weight:700;min-width:60px">${b.add}</span><span style="flex:1">${b.label}</span><span style="font-size:12px">${b.qty<=0?'所持なし':'上限超過'}</span></div>`;
          }).join('')}
        </div>
        <div style="margin-top:12px;font-size:11px;color:var(--text3);text-align:center">ブーストチケットはガチャで獲得できます</div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
async function applyBoostToActivity(activityId, itemId) {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || !activityId || !itemId) return;
  const boostAmt = BOOST_AMOUNTS[itemId];
  if (!boostAmt) return;
  const qty = _gachaItems[itemId] || 0;
  if (qty <= 0) { showToast('アイテムがありません', 'error'); return; }
  const cap = (typeof BOOST_CAP === 'number' && BOOST_CAP > 0) ? BOOST_CAP : 1000;
  const curBoost = await dbGetActivityBoost(activityId);
  if (curBoost >= cap) { showToast(`この活動はブースト上限（+${cap.toLocaleString()}）に達しています`, 'warn'); return; }
  if (curBoost + boostAmt > cap) { showToast(`残り上限は +${(cap-curBoost).toLocaleString()} です`, 'warn'); return; }
  const ok1 = await dbConsumeItem(aid, itemId, 1);
  if (!ok1) { showToast('消費に失敗しました', 'error'); return; }
  const ok2 = await dbApplyActivityBoost(activityId, boostAmt);
  if (!ok2) { await dbAddItem(aid, itemId, 1); showToast('ブーストに失敗しました', 'error'); return; }
  _gachaItems[itemId] = qty - 1;
  showToast(`🚀 ブースト！ +${boostAmt} 注目度`, 'success');
  renderStage();
}

// ── つぶやき → ステージ出演（コンポーズ連携） ──
let _composeStageOn   = false;
let _composeStageType = 'stream';

/** コンポーズの「ステージにも出演」トグル（認証アカウントのみ） */
function _updateComposeStageVisibility() {
  const btn = document.getElementById('compose-stage-toggle-btn');
  if (btn) btn.style.display = _myIsVerified ? '' : 'none';
}
function toggleComposeStage() {
  if (!_myIsVerified) { showToast('ステージ出演は認証アカウントのみ利用できます', 'warn'); return; }
  const panel = document.getElementById('compose-stage-body');
  const btn   = document.getElementById('compose-stage-toggle-btn');
  if (!panel) return;
  _composeStageOn = panel.style.display === 'none';
  panel.style.display = _composeStageOn ? 'block' : 'none';
  if (btn) btn.classList.toggle('compose-url-btn-active', _composeStageOn);
  if (_composeStageOn) {
    const ta = document.getElementById('compose-input');
    const parsed = _parseActivityTime(ta ? ta.value : '') || new Date();
    const startEl = document.getElementById('compose-stage-start');
    if (startEl) startEl.value = _localDatetimeValue(parsed);
  }
}
function selectComposeStageType(type, btn) {
  _composeStageType = type;
  document.querySelectorAll('#compose-stage-types .cs-type-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}
function _resetComposeStage() {
  _composeStageOn = false; _composeStageType = 'stream';
  const panel = document.getElementById('compose-stage-body');
  if (panel) panel.style.display = 'none';
  const btn = document.getElementById('compose-stage-toggle-btn');
  if (btn) btn.classList.remove('compose-url-btn-active');
  document.querySelectorAll('#compose-stage-types .cs-type-btn').forEach((b,i) => b.classList.toggle('active', i === 0));
}

/** 本文から開始時刻を推定（「20時から」「21:00」「今から」等） */
function _parseActivityTime(text) {
  if (!text) return null;
  const now = new Date();
  if (/今から|これから|いまから|今すぐ|まもなく/.test(text)) return now;
  let m = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (m) return _todayAt(parseInt(m[1],10), parseInt(m[2],10), now);
  m = text.match(/(\d{1,2})\s*時\s*(半)?/);
  if (m) return _todayAt(parseInt(m[1],10), m[2] ? 30 : 0, now);
  return null;
}
function _todayAt(h, min, now) {
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0, 0);
  if (d.getTime() < now.getTime() - 6 * 3600 * 1000) d.setDate(d.getDate() + 1); // 大幅に過去なら翌日
  return d;
}

/** 投稿時に呼ばれる: トグルON & 認証なら活動を作成 */
async function _createStageFromCompose({ text, catId, url } = {}) {
  if (!_composeStageOn || !_myIsVerified) return;
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  const startEl = document.getElementById('compose-stage-start');
  let startsAt;
  if (startEl && startEl.value) startsAt = new Date(startEl.value).toISOString();
  else startsAt = (_parseActivityTime(text) || new Date()).toISOString();
  const title = ((text || '').trim().split('\n')[0] || '').slice(0, 60) || 'ライブ';
  const res = await dbCreateActivity({
    accountId: aid, type: _composeStageType, title,
    catId: catId || null, url: url || null, location: null,
    startsAt, endsAt: null,
  });
  if (res && typeof showToast === 'function') showToast('ステージにも出演しました 🎤', 'success');
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
  const aid = _activeAid();
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
    const avBg = p.avatar_data ? 'transparent' : 'var(--accent)';
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border);cursor:pointer" onclick="openUserPage('@${p.account_id}')">
      <div style="width:40px;height:40px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:${avBg}">${avHtml}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--text)">${p.nickname || p.account_id}</div>
        <div style="font-size:12px;color:var(--text3)">@${p.account_id}${p.bio ? ' ・ ' + p.bio : ''}</div>
      </div>
      <button class="btn-sm" style="flex-shrink:0" onclick="event.stopPropagation();dbToggleFollow('${aid}','@${p.account_id}').then(() => renderFollowList())">フォロー中</button>
    </div>`;
  }).join('');
}

async function renderFollowerList() {
  const feed = document.getElementById('follower-list');
  const aid = _activeAid();
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
    const avBg = p.avatar_data ? 'transparent' : 'var(--accent)';
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border);cursor:pointer" onclick="openUserPage('@${p.account_id}')">
      <div style="width:40px;height:40px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:${avBg}">${avHtml}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--text)">${p.nickname || p.account_id}</div>
        <div style="font-size:12px;color:var(--text3)">@${p.account_id}${p.bio ? ' ・ ' + p.bio : ''}</div>
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

  // 装備ミニ表示
  const _upAcc = handle.startsWith('@') ? handle.slice(1) : handle;
  renderProfileEquipmentMini(_upAcc, 'user-page-equipment-mini');

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

  // トラックpt表示
  const _upTrackPt = document.getElementById('user-page-track-pt');
  if (_upTrackPt) {
    dbFetchTrackPoints(_upAcc).then(pt => {
      _upTrackPt.innerHTML = pt > 0
        ? `<span class="${_isTracked(pt) ? 'user-page-track-active' : ''}"><i class="ti ti-radar-2"></i> 興味度 ${pt}pt${_isTracked(pt) ? ' <small>トラック中</small>' : ''}</span>`
        : '';
    });
  }
  // トラッカー数（このユーザーをトラックしている人数。誰かは見せない）
  const _upTrackerCnt = document.getElementById('user-page-tracker-count');
  if (_upTrackerCnt) {
    _upTrackerCnt.textContent = '0';
    dbFetchTrackerCount(_upAcc).then(c => { _upTrackerCnt.textContent = c; });
  }

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
          _upBadgesRow.innerHTML = _dispBadges.map(b => {
            // 称号バッジ（title:称号名）
            if (typeof b === 'string' && b.startsWith('title:')) {
              return `<div class="user-page-title-badge-wrap">${_titleBadgeCardHTML(b.slice(6))}</div>`;
            }
            // 通常バッジ（rookie 等）: 自分のローカルに同 ID があれば借用
            const earned = _loadEarnedBadges();
            const badge = earned.find(x => x.id === b);
            if (badge) {
              return `<div style="width:50px;overflow:hidden;border-radius:7px;flex-shrink:0">${_renderBadgeCard(badge, false, true)}</div>`;
            }
            return '';
          }).filter(Boolean).join('');
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
        ? `<div class="tweet-media">${t.imageLinkUrl && _parseMediaImages(t.mediaData).length === 1
            ? `<img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" style="cursor:pointer" onclick="event.stopPropagation();_confirmExternalLink('${encodeURI(t.imageLinkUrl)}')">`
            : _renderMultiImageHtml(t.mediaData, { imgClass: 'tweet-media-img' })
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

// localStorage で永続化して、ブラウザ閉じても日次同期される
let _pixivSyncedAt = parseInt(localStorage.getItem('trendy_pixiv_synced_at') || '0', 10);
const _PIXIV_SYNC_TTL = 60 * 60 * 1000;        // 1時間（同じ端末で連打されるのを防ぐ）
const _PIXIV_RETRY_COOLDOWN = 5 * 60 * 1000;   // 失敗時はこの時間だけ再試行を控える（毎回叩かない）

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

// daily を含めることで日々新しい作品が流れる
const _PIXIV_MODES = ['daily', 'weekly', 'monthly', 'original', 'rookie'];

async function syncPixivPosts() {
  if (Date.now() - _pixivSyncedAt < _PIXIV_SYNC_TTL) return;
  _pixivSyncedAt = Date.now();
  localStorage.setItem('trendy_pixiv_synced_at', _pixivSyncedAt.toString());
  try {
    // 4モードを並行取得（weekly/monthly/original/rookie 各200件 = 計最大800件）
    const results = await Promise.allSettled(
      _PIXIV_MODES.map(mode =>
        fetch(`/.netlify/functions/pixiv-ranking?mode=${mode}`)
          .then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status))
      )
    );

    const failedModes = [];
    const allItems = results.flatMap((r, i) => {
      if (r.status !== 'fulfilled') { failedModes.push(_PIXIV_MODES[i]); return []; }
      return r.value.items || [];
    });

    if (!allItems.length) {
      // 全モード取得不可（ローカルdevではNetlify関数が無いため正常）。
      // 即再試行せず一定時間クールダウン（毎回ランキングを開くたびに叩かない）
      _pixivSyncedAt = Date.now() - _PIXIV_SYNC_TTL + _PIXIV_RETRY_COOLDOWN;
      localStorage.setItem('trendy_pixiv_synced_at', _pixivSyncedAt.toString());
      console.warn('[ext] pixiv同期スキップ: 取得不可（dev環境ではNetlify関数が無いため正常）');
      return;
    }
    // 一部モードのみ失敗した場合はまとめて1行だけ通知
    if (failedModes.length) console.warn('[ext] pixiv 一部モード取得失敗:', failedModes.join(', '));

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
    // 失敗時もクールダウン（即時再試行で毎回叩かないように）
    _pixivSyncedAt = Date.now() - _PIXIV_SYNC_TTL + _PIXIV_RETRY_COOLDOWN;
    localStorage.setItem('trendy_pixiv_synced_at', _pixivSyncedAt.toString());
    console.warn('[ext] pixiv sync failed:', e.message);
  }
}


// ══════════════════════════════════════════
// 🎲 ガチャ
// ══════════════════════════════════════════

// ブースト効果（localStorage で編集可能）
const _BOOST_AMOUNTS_DEFAULT = { boost_lg: 1000, boost_ur: 500, boost_ssr: 100, boost_sr: 30, boost_r: 5, boost_n: 1 };
let BOOST_AMOUNTS = { ..._BOOST_AMOUNTS_DEFAULT };
try {
  const saved = JSON.parse(localStorage.getItem('trendy_boost_amounts') || 'null');
  if (saved) BOOST_AMOUNTS = { ..._BOOST_AMOUNTS_DEFAULT, ...saved };
} catch(e) {}
// 1投稿あたりに乗せられるブースト合計スコアの上限（公平性確保・チケット連打での順位買い対策）
const BOOST_CAP_DEFAULT = 1000;
let BOOST_CAP = BOOST_CAP_DEFAULT;
try {
  const _cap = parseInt(localStorage.getItem('trendy_boost_cap') || '', 10);
  if (!isNaN(_cap) && _cap > 0) BOOST_CAP = _cap;
} catch(e) {}
const RARITY_COLORS = { LG: '#ef4444', UR: '#c026d3', SSR: '#f59e0b', SR: '#8b5cf6', R: '#3b82f6', N: '#6b7280' };

// ── 絵文字プール（SR=50, SSR=35, UR=20, LG=15） ──────
const EMOJI_POOL = {
  LG: [
    '❤️','🎉','🔥','💯','👑','🌟','💎','🥇','🏆','⭐','💝','🦄','🌈','✨','💖',
  ],
  UR: [
    '🌌','🌠','💫','⚡','🔱','🗝️','🎭','🪐','🪄','💍','🦅','🐉','🌋','🔮','🧿','⛩️','🎌','🎏','🍾','🥂',
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
const R_EMOJI_RATE = 0.85; // R の85%は SR 相当の特殊枠に昇格
const N_EMOJI_RATE = 0.80; // N の80%は SR 相当の特殊枠に昇格

// ── 称号バッジプール（SR=120, SSR=85, UR=40, LG=40） ──────
const TITLE_POOL = {
  LG: [
    // 既存（30）
    '神','王','女王','皇帝','覇者','伝説','創造主','救世主','預言者',
    '龍神','不死鳥','麒麟','鳳凰','神龍','守護神','月光','太陽神','雷神','風神',
    '開拓者','革命家','賢者','老師','仙人','英雄','勇者','大魔法使い','大冒険家','大富豪','名匠',
    // ネタ・記号系（10）
    '命ずる！','キャー！','†','♔','∞','Ω','Σ','Φ','Ψ','Δ',
  ],
  UR: [
    // 既存（30）
    '至高','絶対','究極','超越','極限','超人','大天使','聖人','聖女','聖戦士',
    '鬼神','夜叉','修羅','阿修羅','麒麟児','黒龍','白龍','金龍','銀龍','虹龍',
    '宇宙','銀河','流星','光明','闇王','大公','大将','元帥','総帥','黄金',
    // ネタ・記号系（10）
    '変態紳士','ざわざわ・・・','！？','☆','★','♕','♛','※','☢','☮',
  ],
  SSR: [
    // 既存（70）
    '戦士','騎士','剣豪','侍','忍者','武士','海賊','空の旅人','賞金稼ぎ',
    '魔法使い','召喚士','錬金術師','聖騎士','暗黒騎士','黒魔導士','白魔導士','哲学者',
    'クリエーター','アーティスト','写真家','映画監督','作家','詩人','漫画家','アニメーター','ゲーマー','プログラマー',
    '紳士','淑女','貴族','プリンセス','プリンス','公爵','伯爵','男爵','女神','美神',
    'スター','アイドル','シンガー','ダンサー','ピアニスト','ロックスター','DJ','歌姫','演奏家',
    'アスリート','チャンピオン','MVP','エース','ヒーロー','ヒロイン','レジェンド','スーパースター','トップランカー',
    '探偵','スパイ','鑑識','ハッカー','科学者','教授','博士','研究者','発明家','天才',
    'アルケミスト','ガンナー','吟遊詩人','機械工','ダンディ','カリスマ','聖女','王子','姫','勇敢',
    // ネタ・コミカル系（15）
    'もちもち','ふわふわ','もぐもぐ','ぷにぷに','ふにふに','キラキラ','ピカピカ','ぐるぐる','ぴょんぴょん',
    'にゃんにゃん','わんわん','ウキウキ','ワクワク','ガオー','うふふ',
  ],
  SR: [
    // 既存（100）
    '女の子','男の子','美少女','イケメン','少年','少女','妖精','幼な妻','幼な子',
    'ネコ好き','イヌ好き','鳥好き','魚好き','爬虫類好き','動物愛好家','植物育成者','園芸家','花好き','自然主義',
    'グルメ','料理人','パン職人','パティシエ','バリスタ','ソムリエ','スイーツ通','ラーメン通','カフェ通','大食い',
    '旅行者','バックパッカー','冒険家','探検家','アウトドア派','キャンパー','ハイカー','サーファー','スキーヤー','ランナー',
    '読書家','映画好き','アニメ好き','漫画好き','ゲーム好き','音楽好き','ライブ好き','カラオケ好き','推し活','オタク',
    '早起き','夜更かし','寝坊助','引きこもり','リア充','充実中','仕事人','学生','フリーランス','社畜',
    'メガネ','ロン毛','短髪','おしゃれ','ファッショニスタ','シンプル派','ナチュラル派','ヴィンテージ','ストリート派','和装',
    'ポジティブ','ネガティブ','クール','熱血','おっとり','せっかち','やさしい','さわやか','おもしろい','ミステリアス',
    '優しい人','頑張り屋','癒し系','元気っ子','天然系','努力家','マイペース','チャレンジャー','ロマンチスト','現実主義者',
    '冷静沈着','一途','負けず嫌い','人見知り','社交家','インドア派','アウトドア派','晴れ男','晴れ女','雨男',
    // ネタ系（20）
    'ポ','ヒソヒソ','ニコニコ','ぽよぽよ','もこもこ','すべすべ','もにゅもにゅ',
    'ふむ','ほう','なるほど','まじ','やばい','いいね','つよい','よわい','すごい',
    'てへ','わー','？？？','〜',
  ],
};

const TITLE_ID = {}; // title_id → 称号文字列
const TITLE_INFO = {}; // title_id → {rarity, title}
Object.entries(TITLE_POOL).forEach(([rarity, list]) => {
  list.forEach((t, i) => {
    const id = `title_${rarity}_${String(i+1).padStart(3,'0')}`;
    TITLE_ID[id] = t;
    TITLE_INFO[id] = { rarity, title: t };
  });
});
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
const _RARITY_PROBS_DEFAULT = { LG: 1, UR: 4, SSR: 10, SR: 20, R: 30, N: 35 };
let RARITY_PROBS = { ..._RARITY_PROBS_DEFAULT };
try {
  const saved = JSON.parse(localStorage.getItem('trendy_rarity_probs') || 'null');
  if (saved) RARITY_PROBS = { ..._RARITY_PROBS_DEFAULT, ...saved };
} catch(e) {}
// そのレアリティ内で絵文字/称号が出る確率（残りはブースト）
// 各レアリティ内で「絵文字 or 称号」が出る確率（残りがブースト）
// 数値を上げるほどブーストが出にくくなる
const EMOJI_RATE_IN_RARITY = { LG: 0.92, UR: 0.9, SSR: 0.9, SR: 0.85 };

const GACHA_ITEMS = [
  { id: 'boost_lg',  label: 'ブーストLG',  rarity: 'LG',  get boost() { return BOOST_AMOUNTS.boost_lg; }  },
  { id: 'boost_ur',  label: 'ブーストUR',  rarity: 'UR',  get boost() { return BOOST_AMOUNTS.boost_ur; }  },
  { id: 'boost_ssr', label: 'ブーストSSR', rarity: 'SSR', get boost() { return BOOST_AMOUNTS.boost_ssr; } },
  { id: 'boost_sr',  label: 'ブーストSR',  rarity: 'SR',  get boost() { return BOOST_AMOUNTS.boost_sr; }  },
  { id: 'boost_r',   label: 'ブーストR',   rarity: 'R',   get boost() { return BOOST_AMOUNTS.boost_r; }   },
  { id: 'boost_n',   label: 'ブーストN',   rarity: 'N',   get boost() { return BOOST_AMOUNTS.boost_n; }   },
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

  // ヘルパー
  const makeOrb = () => {
    const orbs = ['enhance_orb_30', 'enhance_orb_60', 'enhance_orb_90'];
    const oid = orbs[Math.floor(Math.random() * orbs.length)];
    const orbLabels = { enhance_orb_30:'強化のオーブ30%', enhance_orb_60:'強化のオーブ60%', enhance_orb_90:'強化のオーブ90%' };
    return { id: oid, label: orbLabels[oid], rarity: 'N', type: 'orb' };
  };

  // 2) レアリティ別の内容物抽選
  if (rarity === 'LG' || rarity === 'UR' || rarity === 'SSR' || rarity === 'SR') {
    // 高レア: 絵文字 40% / 称号 40% / オーブ 10% / ブースト 10%
    const r2 = Math.random();
    if (r2 < 0.40 && EMOJI_POOL[rarity]) {
      const pool = EMOJI_POOL[rarity];
      const idx = Math.floor(Math.random() * pool.length);
      const id = `emoji_${rarity}_${String(idx+1).padStart(3,'0')}`;
      return { id, label: pool[idx], rarity, type: 'emoji', emoji: pool[idx] };
    } else if (r2 < 0.80 && TITLE_POOL[rarity]) {
      const pool = TITLE_POOL[rarity];
      const idx = Math.floor(Math.random() * pool.length);
      const id = `title_${rarity}_${String(idx+1).padStart(3,'0')}`;
      return { id, label: pool[idx], rarity, type: 'title', title: pool[idx] };
    } else if (r2 < 0.90) {
      return makeOrb();
    }
    // ブースト
    return GACHA_ITEMS.find(i => i.rarity === rarity) || GACHA_ITEMS[GACHA_ITEMS.length - 1];
  }

  // R: オーブ 50% / R ブースト 50%（R 色のチケットがしっかり出る）
  if (rarity === 'R') {
    if (Math.random() < 0.50) return makeOrb();
    return GACHA_ITEMS.find(i => i.rarity === 'R') || GACHA_ITEMS[GACHA_ITEMS.length - 1];
  }
  // N: オーブ 70% / N ブースト 30%
  if (Math.random() < 0.70) return makeOrb();
  return GACHA_ITEMS.find(i => i.rarity === 'N') || GACHA_ITEMS[GACHA_ITEMS.length - 1];
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
  _refreshGachaRatesDisplay();
}

// 排出確率＆ブースト効果表示を最新に更新
function _refreshGachaRatesDisplay() {
  ['LG','UR','SSR','SR','R','N'].forEach(rar => {
    // 確率
    const pctEl = document.getElementById(`gacha-pct-${rar}`);
    if (pctEl) {
      const p = RARITY_PROBS[rar] ?? 0;
      // 小数表記を見やすく（整数なら整数、小数2桁まで）
      pctEl.textContent = (p < 1 ? p.toFixed(2) : (p % 1 === 0 ? p.toFixed(0) : p.toFixed(2))) + '%';
    }
    // ブースト効果
    const boostEl = document.getElementById(`gacha-rate-boost-${rar}`);
    if (boostEl) {
      const itemId = _ITEM_BY_RARITY[rar];
      const amt = BOOST_AMOUNTS[itemId];
      if (amt !== undefined) boostEl.textContent = `+${amt}スコア相当`;
    }
  });
}

function _renderGachaInventory() {
  const el = document.getElementById('gacha-inventory');
  if (!el) return;
  const boostItems = GACHA_ITEMS.filter(i => (_gachaItems[i.id] || 0) > 0);
  const emojiItems = Object.entries(EMOJI_INFO)
    .filter(([id]) => (_gachaItems[id] || 0) > 0)
    .map(([id, info]) => ({ id, ...info, qty: _gachaItems[id] }));
  const titleItems = Object.entries(TITLE_INFO)
    .filter(([id]) => (_gachaItems[id] || 0) > 0)
    .map(([id, info]) => ({ id, ...info, qty: _gachaItems[id] }));

  if (!boostItems.length && !emojiItems.length && !titleItems.length) {
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
  }
  if (titleItems.length) {
    html += `<div class="gacha-inv-title" style="margin-top:14px"><i class="ti ti-medal"></i> 称号バッジ</div>`;
    html += `<div class="gacha-title-grid">` +
      titleItems.map(t =>
        `<div class="gacha-title-badge rarity-bg-${t.rarity.toLowerCase()}" title="${t.rarity}">
          <span class="rarity-${t.rarity.toLowerCase()}">${t.rarity}</span>
          <span class="gacha-title-text">${t.title}</span>
        </div>`
      ).join('') +
      `</div>`;
  }
  if (emojiItems.length || titleItems.length) {
    html += `<div style="margin-top:10px;text-align:center"><a onclick="goPage('mypage',null)" style="font-size:12px;color:var(--accent);cursor:pointer">マイページで設定 →</a></div>`;
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
  const equipResults = [];
  for (const item of finalResults) {
    if (item.type === 'equip') {
      // 装備は user_equipments に個別保存
      equipResults.push(item);
    } else {
      gained[item.id] = (gained[item.id] || 0) + 1;
    }
  }
  // 通常アイテム
  await Promise.all(Object.entries(gained).map(([id, qty]) => dbAddItem(aid, id, qty)));
  for (const [id, qty] of Object.entries(gained)) {
    _gachaItems[id] = (_gachaItems[id] || 0) + qty;
  }
  // 装備
  await Promise.all(equipResults.map(item => dbAddEquipment(aid, item.slot, item.rarity)));

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

// ══════════════════════════════════════════
// ⚒️ 装備システム
// ══════════════════════════════════════════
// ══════════════════════════════════════════
// 🎯 トラック機能（自動フォロー風・興味スコア）
// ══════════════════════════════════════════
const TRACK_THRESHOLD = 5;      // 5pt 以上でトラック扱い
const TRACK_EXPIRE_DAYS = 30;   // 30日無更新で自動解除
const TRACK_POINTS = { view: 1, click: 2, like: 3 };

// ローカルバッファ（DB アクセス削減）
let _trackBuffer = {}; // { tracked_id: 累積pt }
let _trackBufferTimer = null;

function _addTrackPoint(trackedAccountId, points) {
  if (!trackedAccountId) return;
  const myAid = localStorage.getItem('trendy_account_id');
  if (!myAid || myAid === trackedAccountId) return; // 自分は対象外
  // フォロー中ユーザーは対象外
  if (typeof followingSet !== 'undefined' && followingSet.has('@' + trackedAccountId)) return;
  _trackBuffer[trackedAccountId] = (_trackBuffer[trackedAccountId] || 0) + points;
  console.log(`[TRACK] buffer +${points}pt for ${trackedAccountId} (累積バッファ ${_trackBuffer[trackedAccountId]}pt)`);
  // 3秒後にまとめてDB反映
  clearTimeout(_trackBufferTimer);
  _trackBufferTimer = setTimeout(_flushTrackBuffer, 3000);
}

async function _flushTrackBuffer() {
  const myAid = localStorage.getItem('trendy_account_id');
  if (!myAid || Object.keys(_trackBuffer).length === 0) return;
  const buf = { ..._trackBuffer };
  _trackBuffer = {};
  for (const [trackedId, pt] of Object.entries(buf)) {
    if (pt <= 0) continue;
    try {
      // 既存レコードを確認
      const { data: cur, error: selErr } = await db.from('user_tracks')
        .select('points').eq('tracker_id', myAid).eq('tracked_id', trackedId).maybeSingle();
      if (selErr) { console.error('[TRACK] select error:', selErr.message); continue; }
      const newPt = (cur?.points || 0) + pt;
      const { error: upErr } = await db.from('user_tracks').upsert({
        tracker_id: myAid, tracked_id: trackedId,
        points: newPt,
        last_activity: new Date().toISOString(),
      }, { onConflict: 'tracker_id,tracked_id' });
      if (upErr) {
        console.error('[TRACK] upsert error:', upErr.message, 'code:', upErr.code);
      } else {
        console.log(`[TRACK] +${pt}pt → ${trackedId} (合計 ${newPt}pt)`);
      }
    } catch(e) {
      console.error('[TRACK] 例外:', e);
    }
  }
}

// 興味スコアでトラック状態を判定
function _isTracked(points) { return (points || 0) >= TRACK_THRESHOLD; }

// 自分がトラックしている一覧を取得（pt順、降順）
async function dbFetchMyTracks() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return [];
  // 期限切れ削除
  const expireDate = new Date(Date.now() - TRACK_EXPIRE_DAYS * 86400000).toISOString();
  await db.from('user_tracks').delete().eq('tracker_id', aid).lt('last_activity', expireDate);
  const { data } = await db.from('user_tracks').select('*').eq('tracker_id', aid).order('points', { ascending: false });
  return data || [];
}

// 自分をトラックしている人数を取得
async function dbFetchTrackerCount(targetAccountId) {
  if (!targetAccountId) return 0;
  const { count } = await db.from('user_tracks')
    .select('id', { count: 'exact', head: true })
    .eq('tracked_id', targetAccountId).gte('points', TRACK_THRESHOLD);
  return count || 0;
}

// 特定相手への自分のスコアを取得
async function dbFetchTrackPoints(trackedAccountId) {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || !trackedAccountId) return 0;
  const { data } = await db.from('user_tracks').select('points').eq('tracker_id', aid).eq('tracked_id', trackedAccountId).maybeSingle();
  return data?.points || 0;
}

// トラックページ
let _trackTab = 'tracking';

async function renderTracksPage() {
  await _flushTrackBuffer(); // 未保存ぶんを反映
  const tracks = await dbFetchMyTracks();
  _renderTracksList(tracks);
}

function setTrackTab(tab, btn) {
  _trackTab = tab;
  document.querySelectorAll('.tracks-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTracksPage();
}

async function _renderTracksList(tracks) {
  const el = document.getElementById('tracks-list');
  if (!el) return;

  let list = tracks;
  if (_trackTab === 'tracking') list = tracks.filter(t => _isTracked(t.points));

  if (!list.length) {
    el.innerHTML = `<div class="tracks-empty">
      <i class="ti ti-radar" style="font-size:48px;display:block;margin-bottom:12px;color:var(--text3)"></i>
      ${_trackTab === 'tracking' ? '5pt以上のトラック対象はまだいません' : 'まだ誰の投稿も見ていません'}
      <p style="font-size:12px;color:var(--text3);margin-top:6px">気になる投稿を見たり、いいねしたりすると貯まります</p>
    </div>`;
    return;
  }

  // プロフィール情報を一括取得
  const ids = list.map(t => t.tracked_id);
  const { data: profiles } = await db.from('profiles')
    .select('account_id, nickname, avatar_data, name_tag')
    .in('account_id', ids);
  const profMap = {};
  (profiles || []).forEach(p => { profMap[p.account_id] = p; });

  el.innerHTML = list.map(t => {
    const p = profMap[t.tracked_id] || {};
    const name = p.nickname || t.tracked_id;
    const avHtml = p.avatar_data
      ? `<img src="${p.avatar_data}" alt="">`
      : `<span style="background:#3b82f6;color:#fff;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;border-radius:50%">${(name[0]||'?').toUpperCase()}</span>`;
    const lastActivityStr = _relativeTime(t.last_activity);
    const pct = Math.min(100, (t.points / TRACK_THRESHOLD) * 100);
    const isTracked = _isTracked(t.points);
    const targetHandle = '@' + t.tracked_id;
    const isFollowing = (typeof followingSet !== 'undefined') && followingSet.has(targetHandle);
    const followBtnHtml = `<button class="track-card-follow-btn${isFollowing ? ' following' : ''}"
        onclick="event.stopPropagation();toggleFollow('${targetHandle}').then(()=>renderTrackPage&&renderTrackPage())">
        <i class="ti ti-${isFollowing ? 'user-check' : 'user-plus'}"></i> ${isFollowing ? 'フォロー中' : 'フォロー'}
      </button>`;
    return `<div class="track-card${isTracked ? ' track-card-active' : ''}" onclick="openUserPage('@${t.tracked_id}')">
      <div class="track-card-av">${avHtml}</div>
      <div class="track-card-info">
        <div class="track-card-name-row">
          <div class="track-card-name">${name} ${p.name_tag ? `<span class="track-card-tag">＠${p.name_tag}</span>` : ''}</div>
          ${followBtnHtml}
        </div>
        <div class="track-card-handle">@${t.tracked_id}</div>
        <div class="track-card-bar">
          <div class="track-card-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="track-card-meta">
          <span class="track-card-pt"><i class="ti ti-flame"></i> ${t.points}pt</span>
          <span class="track-card-time">${lastActivityStr}</span>
          ${isTracked ? '<span class="track-card-badge"><i class="ti ti-radar-2"></i> トラック中</span>' : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

// マイページに「あなたへの興味」表示
async function _renderMyTrackerStats() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) return;
  const count = await dbFetchTrackerCount(aid);
  const el = document.getElementById('mypage-tracker-count');
  if (el) el.textContent = count;
}

// ハンドル→アカウントID変換ヘルパー
function _handleToAccountId(handle) {
  if (!handle) return null;
  const h = handle.startsWith('@') ? handle.slice(1) : handle;
  if (h.endsWith('_sub')) return h.slice(0, -4); // サブはメインに統合
  return h;
}

const EQUIP_SLOTS = ['jewel','amulet','artifact','soul','medal'];
const EQUIP_INFO = {
  jewel:    { label:'宝石',          icon:'ti-diamond' },
  amulet:   { label:'お守り',        icon:'ti-shield'  },
  artifact: { label:'アーティファクト', icon:'ti-flask'   },
  soul:     { label:'ソウル',        icon:'ti-flame'   },
  medal:    { label:'メダル',        icon:'ti-trophy'  },
};

// 装備効果プール（ガチャ獲得時にランダム付与）
const EQUIP_EFFECTS = {
  like_boost:    { label:'いいね効果増加',     type:'numeric', unit:'+',  desc:p=>`いいね報酬を ${p}コイン 増やす`   },
  coin_boost:    { label:'コイン獲得増加',     type:'numeric', unit:'%',  desc:p=>`コイン獲得が +${p}%`              },
  login_bonus:   { label:'ログインボーナス増加', type:'numeric', unit:'+',  desc:p=>`ログイン報酬 +${p}コイン`         },
  rank_reward:   { label:'ランキング報酬増加', type:'numeric', unit:'%',  desc:p=>`ランキング報酬が +${p}%`          },
  view_score:    { label:'閲覧スコア増加',     type:'numeric', unit:'%',  desc:p=>`閲覧によるスコアが +${p}%`        },
  stats_unlock:  { label:'統計機能解放',       type:'unlock',  unit:'',   desc:_=>'装備中は統計機能が解放される' },
  fav_slot:      { label:'推しユーザー枠+1',  type:'unlock',  unit:'+',  desc:_=>'推しユーザー枠 +1（装備中のみ）' },
  badge_slot:    { label:'称号バッジ枠+1',    type:'unlock',  unit:'+',  desc:_=>'称号バッジ枠 +1（装備中のみ）' },
};