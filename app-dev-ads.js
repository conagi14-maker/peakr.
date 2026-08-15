// ※ このファイルは app.js を機能別に分割したものです（読み込み順厳守）
// 開発者管理・広告・ログイン

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
    result = await dbAddPoints(accountId, amount, 'admin');
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
  // レベルバッジ用: アカウントIDを data 属性で付けておく(描画後に自動で宝石を差し込む)
  let _lvlH = (uOrHandle && typeof uOrHandle === 'object') ? (uOrHandle.h || '') : (typeof uOrHandle === 'string' ? uOrHandle : '');
  const _lvlAcct = _lvlH.replace('@', '');
  const _isSub = (uOrHandle && typeof uOrHandle === 'object') ? !!uOrHandle.sub : false;
  const lvlAttr = (_lvlAcct && _lvlAcct !== 'you' && _lvlAcct !== 'anon_you' && !_isSub) ? ` data-lvl-acct="${_lvlAcct}"` : '';
  return `<div class="tweet-av-wrap"${lvlAttr}><div class="${avClass}" style="${avStyle}"${onclickAttr}>${avInner}</div>${overlay}</div>`;
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
  // メイン + サブ 両方の未読を合算（どちらに来たかは DM ページで分かる）
  const main = localStorage.getItem('trendy_account_id');
  if (!main) return;
  const ids = (hasSubAccount && main) ? [main, main + '__sub'] : [main];
  let total = 0;
  for (const id of ids) {
    total += await dbFetchDmUnreadTotal(id).catch(() => 0);
  }
  const el = document.getElementById('dm-nav-badge');
  if (!el) return;
  if (total > 0) { el.textContent = total > 99 ? '99+' : total; el.style.display = ''; }
  else { el.style.display = 'none'; }
}

async function renderDmRooms() {
  const el = document.getElementById('dm-rooms-list');
  if (!el) return;
  const aid = _activeAid();
  if (!aid) { el.innerHTML = `<p style="padding:16px;color:var(--text3)">ログインしてください</p>`; return; }
  // 現在のアカウント種別バナー
  const isSubMode = (myAccountType === 'sub' && hasSubAccount);
  const acctBanner = `<div style="padding:10px 14px;background:${isSubMode ? 'linear-gradient(135deg,#ede9fe,#ddd6fe)' : 'linear-gradient(135deg,#dbeafe,#bfdbfe)'};color:${isSubMode ? '#5b21b6' : '#1e40af'};font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--border)">
    <i class="ti ti-${isSubMode ? 'user-question' : 'user-check'}"></i>
    ${isSubMode ? 'サブアカウント' : 'メインアカウント'} のDM
  </div>`;

  el.innerHTML = `<p style="padding:16px;color:var(--text3);font-size:13px"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;display:inline-block"></i> 読み込み中…</p>`;
  const rooms = await dbFetchDmRooms(aid).catch(() => []);
  _updateDmBadge();

  if (rooms.length === 0) {
    el.innerHTML = acctBanner + `<div style="padding:40px 16px;text-align:center;color:var(--text3)"><i class="ti ti-mail" style="font-size:40px;opacity:.3;display:block;margin-bottom:8px"></i>まだDMはありません<br><span style="font-size:12px">ユーザーページから DM を送れます</span></div>`;
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

  el.innerHTML = acctBanner + rooms.map(r => {
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
  const myId = _activeAid();
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
  const myId = _activeAid();
  // チャット画面ヘッダーに自分のアカウント種別を表示
  const isSubMode = (myAccountType === 'sub' && hasSubAccount);
  const acctBadgeEl = document.getElementById('dm-chat-self-acct');
  if (acctBadgeEl) {
    acctBadgeEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:${isSubMode?'#ede9fe':'#dbeafe'};color:${isSubMode?'#5b21b6':'#1e40af'};font-size:11px;font-weight:700">
      <i class="ti ti-${isSubMode?'user-question':'user-check'}"></i>${isSubMode?'サブで返信中':'メインで返信中'}
    </span>`;
  }

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
      const body = _escHtml(m.body).replace(/\n/g,'<br>');
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
  const myId = _activeAid();
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
  const myId    = _activeAid();
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
// 開発者統計ダッシュボード セクション開閉
function toggleDevStats(btn) {
  const sec = btn.closest('section');
  if (!sec) return;
  const body = sec.querySelector('.dev-stats-body');
  const chev = sec.querySelector('.dev-stats-chev');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
}

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

  // ── 初訪問オンボーディング（ログイン済み・未オンボーディングのみ） ──
  setTimeout(() => { if (typeof _maybeShowOnboarding === 'function') _maybeShowOnboarding(); }, 700);
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
    // 称号バッジを同期
    if (profile.title_badge !== undefined) {
      myTitleBadge = profile.title_badge || '';
      localStorage.setItem('trendy_title_badge', myTitleBadge);
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
  // 画像プレビューもクリア
  if (typeof removeAnnounceImage === 'function') removeAnnounceImage();
  const tEl = document.getElementById('user-announce-title');
  const mEl = document.getElementById('user-announce-message');
  if (tEl) tEl.value = '';
  if (mEl) mEl.value = '';
}

function selectAnnounceType(btn) {
  const row = btn.closest('.announce-type-row') || document.getElementById('announce-modal');
  if (row) row.querySelectorAll('.announce-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _selectedAnnounceType = btn.dataset.type || 'general';
}

let _pendingAnnounceImage = null;
function handleAnnounceImage(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast('画像は10MB以下にしてください', 'warn'); input.value=''; return; }
  const r = new FileReader();
  r.onload = e => {
    _pendingAnnounceImage = e.target.result;
    const prev = document.getElementById('user-announce-img-preview');
    const thumb = document.getElementById('user-announce-img-thumb');
    if (thumb) thumb.src = _pendingAnnounceImage;
    if (prev) prev.style.display = '';
  };
  r.readAsDataURL(file);
}
function removeAnnounceImage() {
  _pendingAnnounceImage = null;
  const inp = document.getElementById('user-announce-img-input');
  if (inp) inp.value = '';
  const prev = document.getElementById('user-announce-img-preview');
  if (prev) prev.style.display = 'none';
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
    const result = await dbSendUserAnnouncement(myAid, title, message, _selectedAnnounceType, _pendingAnnounceImage);
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

/** 通知設定ベルボタンの状態を更新（フォロー中のみ表示・1つでもONなら点灯） */
let _notifySettingsState  = null;   // { text, image, video, announce }
let _notifySettingsTarget = null;   // 対象アカウントID

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
  const types = await dbGetFollowNotifyTypes(myAid, targetAccountId);
  const anyOn = types.text || types.image || types.video || types.announce;
  const allOff = !anyOn;
  notifyBtn.classList.toggle('active', anyOn);
  notifyBtn.querySelector('i').className = allOff ? 'ti ti-bell-off' : 'ti ti-bell';
  notifyBtn.title = allOff ? '通知OFF（タップで設定）' : '通知設定';
}

/** 通知設定ポップオーバーを開く */
async function openNotifySettings(btn) {
  const pop = document.getElementById('notify-settings-pop');
  if (!pop) return;
  if (pop.style.display !== 'none') { closeNotifySettings(); return; }

  const myAid = localStorage.getItem('trendy_account_id');
  const handle = currentUserHandle;
  if (!myAid || !handle) return;
  _notifySettingsTarget = handle.startsWith('@') ? handle.slice(1) : handle;
  _notifySettingsState = await dbGetFollowNotifyTypes(myAid, _notifySettingsTarget);
  _renderNotifySettings();

  // ボタン位置に合わせて配置（画面端は右寄せ補正）
  pop.style.display = 'block';
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth || 230;
  let left = r.right - w;
  if (left < 8) left = 8;
  let top = r.bottom + 6;
  if (top + pop.offsetHeight > window.innerHeight - 8) top = r.top - pop.offsetHeight - 6;
  pop.style.left = left + 'px';
  pop.style.top  = top  + 'px';

  setTimeout(() => document.addEventListener('click', _notifySettingsOutside, { once: true }), 0);
}

function closeNotifySettings() {
  const pop = document.getElementById('notify-settings-pop');
  if (pop) pop.style.display = 'none';
  document.removeEventListener('click', _notifySettingsOutside);
}

function _notifySettingsOutside(e) {
  const pop = document.getElementById('notify-settings-pop');
  const btn = document.getElementById('user-page-notify-btn');
  if (pop && !pop.contains(e.target) && btn && !btn.contains(e.target)) {
    closeNotifySettings();
  }
}

function _renderNotifySettings() {
  const pop = document.getElementById('notify-settings-pop');
  if (!pop || !_notifySettingsState) return;
  pop.querySelectorAll('.nsp-row').forEach(row => {
    const key = row.dataset.nstype;
    row.classList.toggle('on', _notifySettingsState[key] !== false);
  });
}

/** メモリ状態からベルの点灯/アイコンを反映（保存前でも一貫させる） */
function _applyBellFromState() {
  const btn = document.getElementById('user-page-notify-btn');
  if (!btn || !_notifySettingsState) return;
  const s = _notifySettingsState;
  const anyOn = s.text || s.image || s.video || s.announce;
  btn.classList.toggle('active', anyOn);
  btn.querySelector('i').className = anyOn ? 'ti ti-bell' : 'ti ti-bell-off';
  btn.title = anyOn ? '通知設定' : '通知OFF（タップで設定）';
}

/** トグル1つを切り替えて即保存 */
async function toggleNotifyType(key) {
  if (!_notifySettingsState || !_notifySettingsTarget) return;
  _notifySettingsState[key] = !_notifySettingsState[key];
  _renderNotifySettings();
  _applyBellFromState();
  const myAid = localStorage.getItem('trendy_account_id');
  const ok = await dbSetFollowNotifyTypes(myAid, _notifySettingsTarget, _notifySettingsState);
  if (!ok) showToast('設定の保存に失敗しました', 'error');
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
        ${item.image_data ? `<img src="${item.image_data}" alt="告知画像" style="max-width:100%;max-height:240px;border-radius:8px;margin-top:6px;display:block;cursor:zoom-in" onclick="event.stopPropagation();openImageViewer(this.src)">` : ''}
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
    _flushTrackBuffer();
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
  _flushTrackBuffer();
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

  // ピークコイン廃止：広告は課金（¥）のみ。ポイント払いは行わない。

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
    paid_with: 'billing',
    points_used: 0,
    status: 'active',
    impressions: 0,
    clicks: 0,
  };

  const result = await dbCreateAdCampaign(campaign);
  if (result?._error) {
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
      await dbAddPoints(aid, budget * _adDays, 'refund').catch(() => {});
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
