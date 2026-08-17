// ※ このファイルは app.js を機能別に分割したものです（読み込み順厳守）
// ランキング・カテゴリー・ハイ&ロー・お気に入り・プロフィール編集

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
          ? `<div class="ctm-media-actual">${_renderMultiImageHtml(t.mediaData, { imgClass: 'ctm-media-img' })}</div>`
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
        ${u.nameTag ? `<span class="ctm-author-tag">＠${_escHtml(u.nameTag)}</span>` : ''}
      </div>
      ${t.text ? `<div class="ctm-text">${_escHtml(t.text)}</div>` : ''}
      ${mediaThumb}
      <div class="ctm-stats">
        <button class="ctm-comment-btn" onclick="event.stopPropagation();openTweetDetail(${idx})" title="コメント">
          <i class="ti ti-message-circle"></i><span id="reply-count-${idx}">${(tweetReplies[idx]||[]).length||''}</span>
        </button>
        <button class="ctm-like-btn${likedTweets.has(idx)?' liked':''}" onclick="event.stopPropagation();toggleLike(${idx},this)" title="いいね">
          <i class="ti ti-heart${likedTweets.has(idx)?'-filled':''}" style="${likedTweets.has(idx)?'color:#e11d48':''}"></i><span class="like-count">${fmt(t.likes)}</span>
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
        : HOME_TWEETS.filter(t => !t.isDummy).map(t => ({ ...t, score: (t.likes||0)*10 + (t.views||0) }));

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
        : HOME_TWEETS.filter(t => !t.isDummy).map(t => ({ ...t, score: (t.likes||0)*10 + (t.views||0) }));

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
// ═══════════════════════ ハイ&ロー ═══════════════════════
const HL_SUITS = [
  { sym: '♠', red: false },
  { sym: '♥', red: true  },
  { sym: '♦', red: true  },
  { sym: '♣', red: false },
];
const HL_RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const HL_MAX_BET = 1500;
const HL_MAX_ROUNDS = 4;
// 各ラウンドの勝率（0-1）。round=0 が 1R 目。引き分けは別途再抽選。
const HL_WIN_RATES = [0.45, 0.50, 0.40, 0.45];

const _hl = {
  state: 'idle', // idle | playing | finished
  bet: 100,
  pot: 0,
  round: 0,      // 連勝数（次の勝負で +1）
  current: null, // {rank:1..13, suit:idx}
};

function _hlRandomCard() {
  return {
    rank: 1 + Math.floor(Math.random() * 13),
    suit: Math.floor(Math.random() * 4),
  };
}

function _hlRenderCardFace(el, card) {
  const suit = HL_SUITS[card.suit];
  const rank = HL_RANKS[card.rank - 1];
  el.innerHTML = `
    <div class="hl-card-face ${suit.red ? 'red' : ''}">
      <div class="hl-rank-tl"><span>${rank}</span><span>${suit.sym}</span></div>
      <div class="hl-suit-center">${suit.sym}</div>
      <div class="hl-rank-br"><span>${rank}</span><span>${suit.sym}</span></div>
    </div>`;
}

function _hlRenderCardBack(el) {
  el.innerHTML = `<div class="hl-card-back"></div>`;
}

function _hlInitPage() {
  _hl.state = 'idle';
  _hl.bet = 100;
  _hl.pot = 0;
  _hl.round = 0;
  _hl.current = null;
  document.getElementById('hl-bet-area').style.display    = '';
  document.getElementById('hl-action-area').style.display = 'none';
  document.getElementById('hl-continue-area').style.display = 'none';
  document.getElementById('hl-result').textContent = '';
  document.getElementById('hl-result').className   = 'hl-result';
  const cardA = document.getElementById('hl-card-current');
  const cardB = document.getElementById('hl-card-next');
  cardA.className = 'hl-card idle';
  cardB.className = 'hl-card idle';
  _hlRenderCardBack(cardA);
  _hlRenderCardBack(cardB);
  document.getElementById('hl-bet-input').value = '100';
  _hlUpdateCoinDisplay();
}

async function _hlUpdateCoinDisplay() {
  const el = document.getElementById('hl-coin-display');
  if (!el) return;
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) { el.textContent = '0'; return; }
  try {
    const r = await dbGetMyPoints(aid);
    const pts = (r && r.points) || 0;
    el.textContent = (pts || 0).toLocaleString();
  } catch(e) {}
}

function hlSetBet(amt) {
  if (amt > HL_MAX_BET) amt = HL_MAX_BET;
  _hl.bet = amt;
  document.getElementById('hl-bet-input').value = amt;
}
function hlOnBetInput() {
  const inp = document.getElementById('hl-bet-input');
  let v = parseInt(inp.value, 10) || 0;
  if (v < 1) v = 1;
  if (v > HL_MAX_BET) v = HL_MAX_BET;
  inp.value = v;
  _hl.bet = v;
}

async function hlStartGame() {
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid) { showToast('ログインが必要です', 'error'); return; }
  const bet = parseInt(document.getElementById('hl-bet-input').value, 10) || 0;
  if (bet < 1) { showToast('1コイン以上を賭けてください', 'error'); return; }
  if (bet > HL_MAX_BET) { showToast(`賭け金上限は${HL_MAX_BET}コインです`, 'error'); return; }
  // 残高チェック
  let balance = 0;
  try { const r = await dbGetMyPoints(aid); balance = (r && r.points) || 0; } catch(e) {}
  if (balance < bet) { showToast('ピークコインが足りません', 'error'); return; }
  // 賭け金を消費
  const okBet = await dbUsePoints(aid, bet).catch(() => false);
  if (!okBet) { showToast('賭け金の消費に失敗しました', 'error'); return; }
  _hl.bet = bet;
  _hl.pot = bet;
  _hl.round = 0;
  _hl.state = 'playing';
  _hl.current = _hlRandomCard();
  // UI 切替
  document.getElementById('hl-bet-area').style.display = 'none';
  document.getElementById('hl-action-area').style.display = '';
  document.getElementById('hl-continue-area').style.display = 'none';
  document.getElementById('hl-result').textContent = '';
  document.getElementById('hl-result').className = 'hl-result';
  document.getElementById('hl-pot').textContent = _hl.pot.toLocaleString();
  // カードオープン
  const cardA = document.getElementById('hl-card-current');
  cardA.className = 'hl-card flip';
  setTimeout(() => {
    _hlRenderCardFace(cardA, _hl.current);
    cardA.classList.remove('flip');
    cardA.classList.add('reveal');
  }, 280);
  // 次カードは裏面で待機（アイドル）
  const cardB = document.getElementById('hl-card-next');
  _hlRenderCardBack(cardB);
  cardB.className = 'hl-card idle';
  _hlUpdateCoinDisplay();
}

async function hlChoose(dir) {
  if (_hl.state !== 'playing') return;
  // 今ラウンドの設定勝率（次の勝負）
  const rateIdx = Math.min(_hl.round, HL_WIN_RATES.length - 1);
  const winRate = HL_WIN_RATES[rateIdx];
  const cur = _hl.current.rank;
  // 引き分けは出さない範囲で「勝ち/負け」を確率で決めて、対応するランクからランダム抽選
  const winRanks  = (dir === 'high')
    ? Array.from({length: 13}, (_,i)=>i+1).filter(r => r > cur)
    : Array.from({length: 13}, (_,i)=>i+1).filter(r => r < cur);
  const loseRanks = (dir === 'high')
    ? Array.from({length: 13}, (_,i)=>i+1).filter(r => r < cur)
    : Array.from({length: 13}, (_,i)=>i+1).filter(r => r > cur);
  // どちらか片方が空（端カード）→ 引き分けを混ぜる
  // それ以外は確率で勝ち/負け側のランクを選択
  let next;
  if (winRanks.length === 0) {
    // 必敗：負け or 引き分け
    next = (Math.random() < 0.5)
      ? { rank: loseRanks[Math.floor(Math.random()*loseRanks.length)], suit: Math.floor(Math.random()*4) }
      : { rank: cur, suit: Math.floor(Math.random()*4) };
  } else if (loseRanks.length === 0) {
    // 必勝：勝ち or 引き分け
    next = (Math.random() < winRate)
      ? { rank: winRanks[Math.floor(Math.random()*winRanks.length)], suit: Math.floor(Math.random()*4) }
      : { rank: cur, suit: Math.floor(Math.random()*4) };
  } else {
    // 確率で勝ち/負け決定。引き分けは出さない（再抽選の煩雑さ回避）
    if (Math.random() < winRate) {
      next = { rank: winRanks[Math.floor(Math.random()*winRanks.length)], suit: Math.floor(Math.random()*4) };
    } else {
      next = { rank: loseRanks[Math.floor(Math.random()*loseRanks.length)], suit: Math.floor(Math.random()*4) };
    }
  }
  // カードをめくる
  const cardB = document.getElementById('hl-card-next');
  cardB.classList.remove('idle');
  cardB.classList.add('flip');
  await new Promise(r => setTimeout(r, 280));
  _hlRenderCardFace(cardB, next);
  cardB.classList.remove('flip');
  cardB.classList.add('reveal');
  await new Promise(r => setTimeout(r, 380));

  const nx  = next.rank;
  const resultEl = document.getElementById('hl-result');

  if (cur === nx) {
    // 引き分け → 再抽選（pot はそのまま）
    resultEl.textContent = 'DRAW（引き分け）— もう一度引きます';
    resultEl.className = 'hl-result draw';
    await new Promise(r => setTimeout(r, 1100));
    // 現在カードを差し替え
    _hl.current = next;
    const cardA = document.getElementById('hl-card-current');
    cardA.className = 'hl-card flip';
    setTimeout(() => {
      _hlRenderCardFace(cardA, _hl.current);
      cardA.classList.remove('flip');
      cardA.classList.add('reveal');
    }, 280);
    // next を裏返す
    setTimeout(() => {
      cardB.className = 'hl-card flip';
      setTimeout(() => {
        _hlRenderCardBack(cardB);
        cardB.classList.remove('flip');
        cardB.classList.add('idle');
      }, 280);
    }, 600);
    resultEl.textContent = '';
    resultEl.className = 'hl-result';
    return;
  }

  const win = (dir === 'high' && nx > cur) || (dir === 'low' && nx < cur);

  if (win) {
    _hl.pot *= 2;
    _hl.round += 1;
    // 🎉 勝利演出
    cardB.classList.add('win-glow');
    document.getElementById('hl-card-current').classList.add('win-glow');
    setTimeout(() => {
      cardB.classList.remove('win-glow');
      document.getElementById('hl-card-current')?.classList.remove('win-glow');
    }, 900);
    _hlPlayWinEffect(_hl.pot);
    await new Promise(r => setTimeout(r, 1100));
    resultEl.textContent = `WIN! 獲得予定 ${_hl.pot.toLocaleString()} コイン`;
    resultEl.className = 'hl-result win';
    document.getElementById('hl-pot').textContent = _hl.pot.toLocaleString();
    document.getElementById('hl-action-area').style.display = 'none';

    // 4回戦到達で強制受取（パーフェクトクリア）
    if (_hl.round >= HL_MAX_ROUNDS) {
      await new Promise(r => setTimeout(r, 600));
      showToast(`🏆 パーフェクト達成！ ${_hl.pot.toLocaleString()} コイン獲得！`, 'success');
      const aid = localStorage.getItem('trendy_account_id');
      const won = _hl.pot;
      _hl.state = 'finished';
      try { if (aid && won > 0) await dbAddPoints(aid, won, 'highlow'); } catch(e) {}
      _hl.pot = 0;
      _hlUpdateCoinDisplay();
      setTimeout(_hlInitPage, 1400);
      return;
    }

    const contEl = document.getElementById('hl-continue-area');
    contEl.style.display = '';
    document.getElementById('hl-win-msg').innerHTML = `${_hl.pot.toLocaleString()} コイン獲得チャンス！<br><small style="color:#fde68a;font-size:11px">第 ${_hl.round}/${HL_MAX_ROUNDS} 戦 クリア</small>`;
    // 次のラウンド用に現カードを今の next にする（まだ確定はしない）
    _hl.current = next;
  } else {
    resultEl.textContent = 'LOSE…';
    resultEl.className = 'hl-result lose';
    _hl.state = 'finished';
    _hl.pot = 0;
    setTimeout(() => {
      showToast('残念！賭け金は没収されました', 'info');
      _hlInitPage();
    }, 1600);
  }
}

// 勝利演出：金フラッシュ＋WINテキスト＋紙吹雪
function _hlPlayWinEffect(pot) {
  document.getElementById('hl-win-overlay')?.remove();
  // 紙吹雪（金・赤・紫）の小さな破片
  const pieces = [];
  for (let i = 0; i < 28; i++) {
    const col = ['#fbbf24','#fde68a','#f59e0b','#dc2626','#a855f7','#ffffff'][i % 6];
    const lx  = Math.random() * 100;
    const ang = (Math.random() * 720 - 360);
    const del = (Math.random() * 200).toFixed(0);
    pieces.push(`<i class="hl-confetti" style="left:${lx}%;background:${col};--ang:${ang}deg;animation-delay:${del}ms"></i>`);
  }
  const html = `
    <div id="hl-win-overlay">
      <div class="hl-win-flash"></div>
      <div class="hl-win-rays"></div>
      <div class="hl-win-confetti">${pieces.join('')}</div>
      <div class="hl-win-text">
        <div class="hl-win-big">WIN!</div>
        <div class="hl-win-amt">×2  →  ${pot.toLocaleString()} <small>コイン</small></div>
      </div>
    </div>`;
  // ハイ&ローページのテーブルに乗せる（位置基準にするため）
  const table = document.querySelector('#page-highlow .hl-table');
  (table || document.body).insertAdjacentHTML('beforeend', html);
  // 1.6秒後に消す
  setTimeout(() => document.getElementById('hl-win-overlay')?.remove(), 1600);
}

async function hlContinue() {
  if (_hl.state !== 'playing') return;
  // 前回 next で出たカードを現在カードへ引き継ぎ、次カードを裏返してリセット
  const cardA = document.getElementById('hl-card-current');
  const cardB = document.getElementById('hl-card-next');
  cardA.className = 'hl-card flip';
  cardB.className = 'hl-card flip';
  await new Promise(r => setTimeout(r, 280));
  _hlRenderCardFace(cardA, _hl.current);
  _hlRenderCardBack(cardB);
  cardA.classList.remove('flip'); cardA.classList.add('reveal');
  cardB.classList.remove('flip'); cardB.classList.add('idle');
  // アクションエリア再表示
  document.getElementById('hl-continue-area').style.display = 'none';
  document.getElementById('hl-action-area').style.display = '';
  document.getElementById('hl-result').textContent = '';
  document.getElementById('hl-result').className = 'hl-result';
}

async function hlQuit() {
  if (_hl.state !== 'playing') return;
  const aid = localStorage.getItem('trendy_account_id');
  const won = _hl.pot;
  _hl.state = 'finished';
  try { if (aid && won > 0) await dbAddPoints(aid, won, 'highlow'); } catch(e) {}
  showToast(`🪙 ${won.toLocaleString()} コイン獲得！`, 'success');
  _hl.pot = 0;
  _hlUpdateCoinDisplay();
  setTimeout(_hlInitPage, 600);
}

// 投稿後コインガチャ演出（スロット風 1秒）
function _showPostCoinGacha(choices, won, remaining) {
  // 既存を除去
  document.getElementById('post-coin-gacha')?.remove();
  const remText = (typeof remaining === 'number')
    ? `<div style="color:#a78bfa;font-size:10px;margin-top:8px;opacity:.8">本日のガチャ残り ${remaining}/10 回</div>`
    : '';
  const html = `
    <div id="post-coin-gacha" style="position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10001;display:flex;align-items:center;justify-content:center;animation:fadeIn .15s ease">
      <div style="background:linear-gradient(135deg,#1f1f3a,#2d1b4e);border:2px solid #fbbf24;border-radius:18px;padding:24px 32px;box-shadow:0 0 40px rgba(251,191,36,.4);text-align:center;min-width:260px">
        <div style="color:#fbbf24;font-size:13px;font-weight:700;letter-spacing:2px;margin-bottom:10px">🎰 COIN GACHA</div>
        <div id="pcg-slot" style="font-size:44px;font-weight:900;color:#fde68a;height:60px;line-height:60px;font-family:'Courier New',monospace;text-shadow:0 0 16px rgba(251,191,36,.7);overflow:hidden">?</div>
        <div style="color:#a78bfa;font-size:11px;margin-top:6px">ピークコイン</div>
        ${remText}
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const slotEl = document.getElementById('pcg-slot');
  // スロット回転：60ms ごとにランダム値を表示
  const total = 1000;
  const tick  = 70;
  const start = performance.now();
  const spin = () => {
    const elapsed = performance.now() - start;
    if (elapsed < total) {
      const v = choices[Math.floor(Math.random() * choices.length)];
      slotEl.textContent = v;
      setTimeout(spin, tick);
    } else {
      // 確定演出
      slotEl.textContent = won;
      slotEl.style.transition = 'transform .25s, color .25s';
      slotEl.style.transform = 'scale(1.25)';
      slotEl.style.color = won >= 500 ? '#fbbf24' : '#fde68a';
      setTimeout(() => { slotEl.style.transform = 'scale(1)'; }, 250);
      // 1.4秒後に閉じてトースト
      setTimeout(() => {
        document.getElementById('post-coin-gacha')?.remove();
        if (typeof showToast === 'function') {
          showToast(`🪙 ピークコインを${won}獲得しました！`, 'success');
        }
      }, 1400);
    }
  };
  spin();
}

// Pinterest 風 masonry: 各カードの実高さから grid-row span を計算
function _fsResizeMasonry(body, cardSelector) {
  if (!body) return;
  const style = getComputedStyle(body);
  const rowH = parseFloat(style.getPropertyValue('grid-auto-rows')) || 4;
  const gap  = parseFloat(style.getPropertyValue('row-gap')) || parseFloat(style.gap) || 4;
  const cards = body.querySelectorAll(cardSelector || '.fs-tweet');
  // まず span をリセット（前回値で高さが固定されないように）
  cards.forEach(card => { card.style.gridRowEnd = ''; });
  // 次フレームで実高さ計測
  requestAnimationFrame(() => {
    cards.forEach(card => {
      const h = card.scrollHeight || card.getBoundingClientRect().height;
      if (h > 0) {
        const span = Math.ceil((h + gap) / (rowH + gap));
        card.style.gridRowEnd = 'span ' + span;
      }
    });
  });
}
// リサイズ時にも再計算
window.addEventListener('resize', () => {
  const b = document.getElementById('fs-body');
  if (b) _fsResizeMasonry(b);
  const hf = document.getElementById('home-feed');
  if (hf) _fsResizeMasonry(hf, '.tweet-card');
});

// ホームフィード用 masonry 再計算
// 新着ページ用 masonry 再計算
function _resizeLatestMasonry() {
  const lf = document.getElementById('latest-feed');
  if (!lf) return;
  _fsResizeMasonry(lf, '.tweet-card');
  lf.querySelectorAll('.tweet-card img').forEach(img => {
    if (!img.complete) {
      img.addEventListener('load',  () => _fsResizeMasonry(lf, '.tweet-card'), { once: true });
      img.addEventListener('error', () => _fsResizeMasonry(lf, '.tweet-card'), { once: true });
    }
  });
}

// 新着ページ状態
let _latestFilter = 'all';
let _latestPosts = [];
let _latestOffset = 0;
let _latestLoading = false;
let _latestEnd = false;
const LATEST_PAGE_SIZE = 30;

function setLatestFilter(t, btn) {
  _latestFilter = t;
  document.querySelectorAll('.latest-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadLatestFeed(true);
}

async function loadLatestFeed(reset = false) {
  if (_latestLoading) return;
  const feed = document.getElementById('latest-feed');
  if (!feed) return;
  if (reset) {
    _latestPosts = [];
    _latestOffset = 0;
    _latestEnd = false;
    feed.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)"><i class="ti ti-loader-2"></i></div>';
  }
  if (_latestEnd) return;
  _latestLoading = true;

  try {
    let query = db.from('posts').select('*')
      .order('created_at', { ascending: false })
      .range(_latestOffset, _latestOffset + LATEST_PAGE_SIZE - 1);
    // 外部投稿は除外（オリジナル投稿のみ）
    query = query.is('ext_source', null);
    if (_latestFilter === 'text')  query = query.not('media_type', 'in', '(image,video)');
    if (_latestFilter === 'image') query = query.eq('media_type', 'image');
    if (_latestFilter === 'video') query = query.eq('media_type', 'video');
    const { data, error } = await query;
    if (error || !data) { _latestLoading = false; return; }

    if (reset) feed.innerHTML = '';

    // プロフィール取得
    const ids = [...new Set(data.filter(p => p.user_handle?.startsWith('@')).map(p => p.user_handle.slice(1)))];
    const avatarMap = {};
    if (ids.length > 0) {
      const { data: profs } = await db.from('profiles').select('account_id, avatar_data, name_tag').in('account_id', ids);
      (profs || []).forEach(pr => {
        avatarMap['@' + pr.account_id] = {
          av: pr.avatar_data ? `<img src="${pr.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : null,
          nameTag: pr.name_tag || null,
        };
      });
    }

    data.forEach(p => {
      const t = _dbPostToTweet(p, avatarMap);
      _latestPosts.push(t);
      feed.insertAdjacentHTML('beforeend', homeTweetHTML(t));
    });

    _latestOffset += data.length;
    if (data.length < LATEST_PAGE_SIZE) _latestEnd = true;
    const endMsg = document.getElementById('latest-end-msg');
    if (endMsg) endMsg.style.display = _latestEnd ? 'block' : 'none';
    if (_latestPosts.length === 0) {
      feed.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)"><i class="ti ti-mood-empty" style="font-size:36px"></i><p>該当する投稿がありません</p></div>';
    }
    _resizeLatestMasonry();
  } catch(e) {
    console.error('[新着] エラー:', e);
  } finally {
    _latestLoading = false;
  }
}

// スクロールで自動読み込み
function _tryLatestAutoLoad() {
  const page = document.getElementById('page-latest');
  if (!page || !page.classList.contains('active')) return;
  if (_latestEnd || _latestLoading) return;
  const sentinel = document.getElementById('latest-sentinel');
  if (!sentinel) return;
  const rect = sentinel.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  if (rect.top < vh + 600) loadLatestFeed(false);
}
window.addEventListener('scroll', _tryLatestAutoLoad, { passive: true });
document.addEventListener('scroll', _tryLatestAutoLoad, { passive: true, capture: true });

function _resizeHomeMasonry() {
  const hf = document.getElementById('home-feed');
  if (!hf) return;
  _fsResizeMasonry(hf, '.tweet-card');
  hf.querySelectorAll('.tweet-card img').forEach(img => {
    if (!img.complete) {
      img.addEventListener('load',  () => _fsResizeMasonry(hf, '.tweet-card'), { once: true });
      img.addEventListener('error', () => _fsResizeMasonry(hf, '.tweet-card'), { once: true });
    }
  });
}

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
          ? `<div class="ctm-media-actual">${_renderMultiImageHtml(t.mediaData, { imgClass: 'ctm-media-img' })}</div>`
          : `<div class="fs-media-thumb fs-thumb-video"><i class="ti ti-video"></i> 動画</div>`)
      : (t.media === 'image'
          ? `<div class="fs-media-thumb fs-thumb-image"><i class="ti ti-photo"></i> 画像</div>`
          : t.media === 'video'
          ? `<div class="fs-media-thumb fs-thumb-video"><i class="ti ti-video"></i> 動画</div>`
          : '');
    const u = t.user || {};
    const avIsImg2 = typeof u.av === 'string' && u.av.startsWith('<img');
    const fsAvHtml = avIsImg2
      ? `<div class="fs-tweet-av" style="overflow:hidden">${u.av}</div>`
      : `<div class="fs-tweet-av" style="background:${u.bg||'#3b82f6'};color:${u.tc||'#fff'}">${u.av || '?'}</div>`;
    body.insertAdjacentHTML('beforeend', `<div class="fs-tweet clickable" onclick="openUserPage('${u.h || ''}')">
      <div class="fs-tweet-top">
        <span class="rank-badge-card ${rc(t.rank)}">#${t.rank}</span>
        ${prevBadge(t.prev)}
      </div>
      <div class="fs-tweet-userrow">
        ${fsAvHtml}
        <span class="fs-tweet-user">${u.n ? (u.sub ? '匿名' : u.n) : u.h || ''}</span>
        ${u.nameTag ? `<span class="fs-tweet-handle">＠${_escHtml(u.nameTag)}</span>` : ''}
        ${u.sub ? subBadge() : ''}
      </div>
      ${t.text ? `<div class="fs-tweet-text">${_escHtml(t.text)}</div>` : ''}
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

  // Pinterest 風 masonry: 各カードの内容高さから grid-row span を計算
  _fsResizeMasonry(body);

  // 画像ロード後にも再計算（aspect-ratio が確定する前後で）
  body.querySelectorAll('.fs-tweet img').forEach(img => {
    if (!img.complete) {
      img.addEventListener('load',  () => _fsResizeMasonry(body), { once: true });
      img.addEventListener('error', () => _fsResizeMasonry(body), { once: true });
    }
  });

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
  // 投稿ごとのお気に入り数（社会的表示）を増減
  if (typeof dbAdjustSavedCount === 'function') dbAdjustSavedCount(dbId, nowSaved ? 1 : -1);
  // 信頼度加重（ランキング採点用）
  if (typeof actorTrustWeight === 'function' && typeof dbAddWeighted === 'function') {
    const myAid = localStorage.getItem('trendy_account_id');
    if (myAid) actorTrustWeight(myAid).then(w => { if (w > 0) dbAddWeighted(dbId, 'save', nowSaved ? w : -w); });
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
    // reel お気に入りボタン
    const reelFav = document.getElementById(`reel-fav-${idx}`);
    if (reelFav) {
      reelFav.classList.toggle('reel-faved', isSaved);
      const ic = reelFav.querySelector('i');
      if (ic) {
        ic.className = `ti ti-star${isSaved?'-filled':''}`;
        ic.style.color = isSaved ? '#fbbf24' : '';
      }
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
    ? `<div class="tweet-media" style="margin:4px 0 6px" onclick="event.stopPropagation()">${s.imageLinkUrl && _parseMediaImages(s.mediaData).length === 1
        ? `<img src="${s.mediaData}" class="tweet-media-img" style="cursor:pointer" onclick="_confirmExternalLink('${encodeURI(s.imageLinkUrl)}')">`
        : _renderMultiImageHtml(s.mediaData, { imgClass: 'tweet-media-img' })}</div>`
    : s.mediaData && s.mediaType === 'video'
    ? `<div class="tweet-media" style="margin:4px 0 6px" onclick="event.stopPropagation()"><video src="${s.mediaData}" controls class="tweet-media-vid" preload="metadata"></video></div>`
    : '';
  return `<div class="tweet-card fav-tweet-card" style="cursor:pointer" onclick="openTweetDetailBySaveId('${s.saveId}')" data-save-id="${s.saveId}">
    <div style="${avStyle}">${u.av||'?'}</div>
    <div class="tweet-body">
      <div class="tweet-top">
        <span class="tweet-name">${u.sub?'匿名ユーザー':(u.n||'')}</span>
        ${u.nameTag?`<span class="tweet-name-tag">＠${_escHtml(u.nameTag)}</span>`:''}
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
    const imgs = _parseMediaImages(s.mediaData);
    const cover = imgs[0] || s.mediaData;
    const multiBadge = imgs.length > 1
      ? `<div class="fav-grid-multi-badge"><i class="ti ti-photo"></i> ${imgs.length}</div>`
      : '';
    thumb = `<div class="fav-grid-thumb-wrap"><img src="${cover}" class="fav-grid-thumb" alt="thumbnail">${multiBadge}</div>`;
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

/** db_id から投稿詳細を開く（通知タップなどから利用） */
async function openPostById(dbId) {
  if (!dbId) return;
  // すでにメモリにあれば即開く
  const idx = _tc.findIndex(t => t && String(t.db_id) === String(dbId));
  if (idx >= 0) { openTweetDetail(idx); return; }
  // なければ DB から取得して仮ツイートを生成
  if (typeof db === 'undefined') return;
  try {
    const { data: p } = await db.from('posts').select('*').eq('id', dbId).maybeSingle();
    if (!p) { showToast('投稿が見つかりませんでした（削除された可能性があります）', 'info'); return; }
    const t = {
      db_id: p.id, text: p.content, catId: p.cat_id || null,
      likes: p.likes_count || 0, rt: p.rt_count || 0, views: p.views_count || 0,
      time: _relativeTime(p.created_at), ai: p.ai_type || 'none',
      mediaData: p.media_data || null, mediaType: p.media_type || null,
      linkUrl: p.link_url || null, imageLinkUrl: p.image_link_url || null,
      tags: Array.isArray(p.tags) ? p.tags : [], isDummy: false, rank: 0,
      user: {
        h: p.user_handle, n: p.user_name || p.user_handle,
        av: (p.user_name || p.user_handle || '?').replace(/^@/, '').slice(0, 1).toUpperCase(),
        bg: 'var(--accent)', tc: '#ffffff', sub: p.is_sub, nameTag: p.name_tag || null,
      },
    };
    openTweetDetail(_reg(t));
  } catch(e) { console.warn('[notif] 投稿取得失敗:', e); }
}

/** お気に入りから削除 */
function removeSavedTweet(saveId) {
  const entry = savedTweets.find(s => s.saveId === saveId);
  if (!entry) return;
  savedTweets = savedTweets.filter(s => s.saveId !== saveId);
  favDbIds.delete(String(entry.db_id));
  if (typeof dbAdjustSavedCount === 'function') dbAdjustSavedCount(String(entry.db_id), -1);
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
      text  : `あなたの投稿が<b>${cat.name}</b>カテゴリーランキングにランクインしました！`,
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
  const subAvLetter = subN !== '匿名ユーザー' ? subN[0] : '匿';

  // メインアバター（実アバターがあれば画像、なければ文字）
  const mainAvData = localStorage.getItem('trendy_av');
  const myNameLetter = (localStorage.getItem('trendy_myName') || 'あ')[0];
  const mainAvHtml = mainAvData
    ? `<div class="notif-tab-av" style="background:transparent;padding:0;overflow:hidden"><img src="${mainAvData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
    : `<div class="notif-tab-av" style="background:#dbeafe;color:#1e40af">${myNameLetter}</div>`;

  // サブアバター
  const subAvData = localStorage.getItem('trendy_sub_av');
  const subAvHtml = subAvData
    ? `<div class="notif-tab-av" style="background:transparent;padding:0;overflow:hidden"><img src="${subAvData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
    : `<div class="notif-tab-av" style="background:#ede9fe;color:#5b21b6">${subAvLetter}</div>`;

  el.innerHTML = `
    <div class="notif-acct-tabs">
      <button class="notif-acct-tab${notifActiveAcct === 'main' ? ' active' : ''}" onclick="switchNotifAcct('main')">
        ${mainAvHtml}
        <div class="notif-tab-info">
          <span class="notif-tab-name">メインアカウント</span>
          <span class="notif-tab-handle">${myHandle}</span>
        </div>
        ${mainUnread ? `<span class="notif-tab-badge">${mainUnread}</span>` : ''}
      </button>
      <button class="notif-acct-tab${notifActiveAcct === 'sub' ? ' active' : ''}" onclick="switchNotifAcct('sub')">
        ${subAvHtml}
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

    // ランキング通知：順位は伏せて、カテゴリーのみ表示（ネタバレ防止）
    if (n.type === 'rank') {
      extra += `<div class="notif-rank-badge" style="color:#6d28d9">
        🏆 <b>?位</b>${n.cat ? ` / ${n.cat}` : ''}
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
        <div class="notif-text">${n.type === 'rank' ? (n.text || '').replace(/<b>[\d,]+位<\/b>/g, '').replace(/[\d,]+位/g, '') : n.text}</div>
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
  // 投稿通知（フォロー先の新規投稿）は既読・未読問わずその投稿を開く
  if (n.type === 'post' && n.cat) {
    openPostById(n.cat);
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
  // メインのベルは「通知」だけを数える。告知は告知タブ専用バッジで表示し、
  // ログインのたびにベルが点灯し続けないようにする（_unreadAnnounceCount は含めない）
  const mainCount = NOTIFS.filter(n => n.unread).length;
  const subCount  = NOTIFS_SUB.filter(n => n.unread).length;
  const count = mainCount + subCount;
  const badge = document.getElementById('notif-nav-badge') || document.querySelector('.nav-badge');
  if (badge) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count ? '' : 'none';
  }
  // ボトムナビ側のバッジも同期
  const bBadge = document.getElementById('bnav-notif-badge');
  if (bBadge) {
    bBadge.textContent = count > 99 ? '99+' : count;
    bBadge.style.display = count ? '' : 'none';
  }
  // 告知は専用タブバッジで表示
  if (typeof _updateAnnounceBadgeTab === 'function') _updateAnnounceBadgeTab();
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

// ── My Page アクセス解析ダッシュボード ─────────────────
let _dashPeriod = 'week';
let _dashCache  = null;

function setDashPeriod(period, btn) {
  _dashPeriod = period;
  document.querySelectorAll('#mydash-period .mydash-pill').forEach(b =>
    b.classList.toggle('active', b.dataset.period === period));
  if (_dashCache) _renderDashBody(_dashCache);
  else renderMyDashboard();
}

async function renderMyDashboard() {
  const body = document.getElementById('mydash-body');
  if (!body) return;
  const aid = localStorage.getItem('trendy_account_id');
  if (!aid || typeof db === 'undefined') {
    body.innerHTML = '<div class="mydash-empty">ログインすると解析データが表示されます</div>';
    return;
  }
  body.innerHTML = '<div class="mydash-empty"><i class="ti ti-loader-2"></i> 解析データを読み込み中...</div>';
  try {
    _dashCache = await _fetchDashData(aid);
    _renderDashBody(_dashCache);
  } catch(e) {
    console.error('[Dashboard] エラー:', e);
    body.innerHTML = '<div class="mydash-empty" style="color:var(--red)"><i class="ti ti-alert-circle"></i> データ取得に失敗しました<br><small>' + (e.message || '') + '</small></div>';
  }
}

async function _fetchDashData(aid) {
  const handle = '@' + aid;

  // ① 自分の投稿（サブ投稿は除外）
  const { data: postsRaw, error: pErr } = await db.from('posts')
    .select('id, likes_count, views_count, created_at, is_sub')
    .eq('user_handle', handle);
  if (pErr) throw pErr;
  const posts = (postsRaw || []).filter(p => !p.is_sub);
  const ids = posts.map(p => String(p.id));
  const idSet = new Set(ids);

  // ② 閲覧・いいね・コメント（自分の投稿に対するもの）
  let views = [], viewsHasMeta = false, likes = [], comments = [];
  if (ids.length) {
    // post_views の created_at / source はマイグレーション後のみ存在
    let vq = await db.from('post_views').select('post_id, created_at, source').in('post_id', ids);
    if (vq.error) {
      vq = await db.from('post_views').select('post_id').in('post_id', ids);
    } else {
      viewsHasMeta = true;
    }
    views = vq.data || [];

    const [lq, cq] = await Promise.all([
      db.from('post_likes').select('post_id, created_at').in('post_id', ids),
      db.from('comments').select('post_id, created_at, user_handle').in('post_id', ids),
    ]);
    likes = lq.data || [];
    // 自分の投稿への自分の返信はカウントしない
    comments = (cq.data || []).filter(c => c.user_handle !== handle);
  }

  // ③ フォロワー（created_at で期間内の新規が分かる）
  const { data: fol } = await db.from('follows').select('created_at').eq('following_id', aid);

  // ④ トラッカー数（現在値）
  const trackers = typeof dbFetchTrackerCount === 'function' ? await dbFetchTrackerCount(aid) : 0;

  // ⑤ お気に入り登録された数（全ユーザーの保存リストから自分の投稿を抽出）
  const { data: savedRows } = await db.from('user_saved_items').select('account_id, saved_tweets');
  const favs = [];
  (savedRows || []).forEach(r => {
    if (!r || r.account_id === aid) return; // 自分の保存は除外
    (r.saved_tweets || []).forEach(s => {
      if (s && s.db_id && idSet.has(String(s.db_id))) favs.push({ savedAt: s.savedAt || null });
    });
  });

  return { aid, handle, posts, views, viewsHasMeta, likes, comments, follows: fol || [], trackers, favs };
}

// 期間内/前期間のイベント数を数える
function _dashCount(arr, since, prevSince, key) {
  const k = key || 'created_at';
  let now = 0, prev = 0;
  arr.forEach(x => {
    const t = x[k] ? new Date(x[k]).getTime() : null;
    if (!t) return;
    if (t >= since) now++;
    else if (t >= prevSince) prev++;
  });
  return { now, prev, total: arr.length };
}

// 前期間比の表示（▲12% / ▼5% / 新規 / —）
function _dashDelta(now, prev) {
  if (now === null) return '';
  if (prev === 0 && now === 0) return '<span class="mydash-delta flat">—</span>';
  if (prev === 0) return '<span class="mydash-delta up">▲ 新規</span>';
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct > 0)  return `<span class="mydash-delta up">▲ ${pct}%</span>`;
  if (pct < 0)  return `<span class="mydash-delta down">▼ ${Math.abs(pct)}%</span>`;
  return '<span class="mydash-delta flat">±0%</span>';
}

// 時系列バケット（週=日次7本 / 月=日次30本 / 年=月次12本）
function _dashBuckets(events, period, key) {
  const k = key || 'created_at';
  const out = [];
  const now = new Date();
  if (period === 'year') {
    for (let i = 11; i >= 0; i--) {
      const d0 = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const d1 = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      out.push({ label: (d0.getMonth() + 1) + '月', from: d0.getTime(), to: d1.getTime(), count: 0 });
    }
  } else {
    const days = period === 'week' ? 7 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      out.push({ label: (d0.getMonth() + 1) + '/' + d0.getDate(), from: d0.getTime(), to: d1.getTime(), count: 0 });
    }
  }
  events.forEach(e => {
    const t = e[k] ? new Date(e[k]).getTime() : null;
    if (!t) return;
    for (const b of out) {
      if (t >= b.from && t < b.to) { b.count++; break; }
    }
  });
  return out;
}

const _DASH_SRC_LABELS = {
  home: 'ホーム', dive: 'ダイブ', latest: '新着', ranking: 'ランキング',
  profile: 'プロフィール', detail: '投稿詳細', favs: 'お気に入り',
  mypage: 'マイページ', other: 'その他',
};

function _renderDashBody(d) {
  const body = document.getElementById('mydash-body');
  if (!body) return;
  const period = _dashPeriod;
  const DAY = 86400000;
  const spanDays = period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const since = Date.now() - spanDays * DAY;
  const prevSince = since - spanDays * DAY;
  const periodLabel = period === 'week' ? '過去7日' : period === 'month' ? '過去30日' : '過去1年';

  const totalViews = d.posts.reduce((s, p) => s + (p.views_count || 0), 0);
  const vStat   = d.viewsHasMeta ? _dashCount(d.views, since, prevSince) : null;
  const lStat   = _dashCount(d.likes, since, prevSince);
  const cStat   = _dashCount(d.comments, since, prevSince);
  const fStat   = _dashCount(d.favs, since, prevSince, 'savedAt');
  const folStat = _dashCount(d.follows, since, prevSince);

  const card = (icon, label, mainVal, deltaHTML, subText) => `
    <div class="mydash-card">
      <div class="mydash-card-top">
        <span class="mydash-card-icon"><i class="ti ti-${icon}"></i></span>
        <span class="mydash-card-label">${label}</span>
        ${deltaHTML || ''}
      </div>
      <div class="mydash-card-val">${mainVal}</div>
      <div class="mydash-card-sub">${subText || ''}</div>
    </div>`;

  const cardsHTML = `
    <div class="mydash-cards">
      ${card('eye', '閲覧',
        vStat ? vStat.now.toLocaleString() : totalViews.toLocaleString(),
        vStat ? _dashDelta(vStat.now, vStat.prev) : '',
        vStat ? '累計 ' + totalViews.toLocaleString() : '累計（全期間）')}
      ${card('heart', 'いいね', lStat.now.toLocaleString(), _dashDelta(lStat.now, lStat.prev), '累計 ' + lStat.total.toLocaleString())}
      ${card('message-circle', 'コメント', cStat.now.toLocaleString(), _dashDelta(cStat.now, cStat.prev), '累計 ' + cStat.total.toLocaleString())}
      ${card('star', 'お気に入り', fStat.now.toLocaleString(), _dashDelta(fStat.now, fStat.prev), '累計 ' + fStat.total.toLocaleString())}
      ${card('users', 'フォロワー', d.follows.length.toLocaleString(), _dashDelta(folStat.now, folStat.prev), periodLabel + 'で +' + folStat.now.toLocaleString())}
      ${card('radar-2', 'トラッカー', d.trackers.toLocaleString(), '', '現在あなたを追跡中')}
    </div>`;

  // ── 閲覧数の推移チャート ──
  let chartHTML;
  if (d.viewsHasMeta) {
    const buckets = _dashBuckets(d.views.filter(v => new Date(v.created_at).getTime() >= since), period);
    const max = Math.max(1, ...buckets.map(b => b.count));
    const labelEvery = period === 'month' ? 5 : 1;
    chartHTML = `
      <div class="mydash-chart">
        ${buckets.map((b, i) => `
          <div class="mydash-col" title="${b.label}: ${b.count.toLocaleString()}回">
            <div class="mydash-colbar" style="height:${Math.max(2, Math.round(b.count / max * 100))}%"></div>
            <div class="mydash-collabel">${i % labelEvery === 0 ? b.label : ''}</div>
          </div>`).join('')}
      </div>`;
  } else {
    chartHTML = _dashMigrationNotice();
  }

  // ── どこで見られた ──
  let srcHTML;
  if (d.viewsHasMeta) {
    const inRange = d.views.filter(v => new Date(v.created_at).getTime() >= since);
    const bySrc = {};
    inRange.forEach(v => {
      const key = v.source || '_pre';
      bySrc[key] = (bySrc[key] || 0) + 1;
    });
    const entries = Object.entries(bySrc).sort((a, b) => b[1] - a[1]);
    const total = inRange.length;
    srcHTML = entries.length === 0
      ? '<div class="mydash-empty">この期間の閲覧データはまだありません</div>'
      : entries.map(([src, n]) => {
          const label = src === '_pre' ? '計測開始前' : (_DASH_SRC_LABELS[src] || src);
          const pct = total ? Math.round(n / total * 100) : 0;
          return `
            <div class="mydash-src-row">
              <span class="mydash-src-label">${label}</span>
              <div class="mydash-src-track"><div class="mydash-src-fill" style="width:${pct}%"></div></div>
              <span class="mydash-src-val">${n.toLocaleString()} <small>(${pct}%)</small></span>
            </div>`;
        }).join('');
  } else {
    srcHTML = _dashMigrationNotice();
  }

  body.innerHTML = `
    ${cardsHTML}
    <div class="mydash-section">
      <div class="mydash-sec-title"><i class="ti ti-chart-bar"></i> 閲覧数の推移 <span class="mydash-sec-sub">${periodLabel}</span></div>
      ${chartHTML}
    </div>
    <div class="mydash-section">
      <div class="mydash-sec-title"><i class="ti ti-map-pin"></i> どこで見られた <span class="mydash-sec-sub">${periodLabel}</span></div>
      ${srcHTML}
    </div>`;
}

function _dashMigrationNotice() {
  return `<div class="mydash-empty">
    <i class="ti ti-database-cog"></i> この解析には DB マイグレーションが必要です<br>
    <small>sql/analytics-dashboard.sql を Supabase SQL Editor で実行してください</small>
  </div>`;
}

function renderMyPosts() {
  const feed = document.getElementById('mypost-feed');
  if (!feed) return; // ダッシュボード化でマイページから投稿一覧は撤去済み
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
  if (!feed) return; // ダッシュボード化でマイページからランキング入りは撤去済み
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
          <span class="tweet-name">${_escHtml(u.n)}</span>
          ${u.nameTag ? `<span class="tweet-name-tag">＠${_escHtml(u.nameTag)}</span>` : ''}
          <span class="tweet-handle">${u.h}</span>
          <span class="tweet-time">${t.time}</span>
        </div>
        ${t.text ? `<div class="tweet-text">${_escHtml(t.text)}</div>` : ''}
        ${t.mediaData ? (t.mediaType === 'image'
          ? `<div class="tweet-media">${_renderMultiImageHtml(t.mediaData, { imgClass: 'tweet-media-img' })}</div>`
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
    // トラックポイント +3/いいね
    if (!t.extSource && t.user?.h) {
      _addTrackPoint(_handleToAccountId(t.user.h), TRACK_POINTS.like);
    }
  } else {
    likedTweets.delete(idx);
    if (t.db_id) likedDbIds.delete(String(t.db_id));
    t.likes = Math.max(0, t.likes - 1);
    btn.classList.remove('liked');
  }
  // ハートアイコンを切替（いいね絵文字は廃止）
  const icon = btn.querySelector('i, .like-emoji-display');
  if (icon) {
    const i = document.createElement('i');
    if (nowLiked) { i.className = 'ti ti-heart-filled'; i.style.color = '#e11d48'; }
    else          { i.className = 'ti ti-heart'; }
    icon.replaceWith(i);
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
      const i = document.createElement('i');
      if (nowLiked) { i.className = 'ti ti-heart-filled'; i.style.color = '#ef4444'; }
      else          { i.className = 'ti ti-heart'; }
      reelTarget.replaceWith(i);
    }
  }
  if (reelLc)   reelLc.textContent = fmt(t.likes);
  // Supabase に保存（db_id があるときのみ）
  if (t.db_id && typeof dbToggleLike === 'function') {
    const aid = localStorage.getItem('trendy_account_id');
    const _reelAuthorId = t.user?.h ? (t.user.h.startsWith('@') ? t.user.h.slice(1) : t.user.h) : null;
    dbToggleLike(t.db_id, aid, nowLiked, t.user && t.user.h, _isFanTrigger(_reelAuthorId));
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
  const btn = document.getElementById('user-page-follow-btn'); // ユーザーページ上のボタン（無くてもOK）
  const aid = _activeAid(); // メイン/サブ別のフォロー管理
  const wasFollowing = followingSet.has(handle);

  // ── 楽観的UI更新 ──
  if (wasFollowing) {
    followingSet.delete(handle);
    myFollowingHandles = myFollowingHandles.filter(h => h !== handle);
    if (btn) { btn.textContent = 'フォローする'; btn.classList.remove('btn-following'); }
  } else {
    followingSet.add(handle);
    if (!myFollowingHandles.includes(handle)) myFollowingHandles.push(handle);
    if (btn) { btn.textContent = 'フォロー中'; btn.classList.add('btn-following'); }
    // フォロー時はトラックレコードを削除（対象外になるため）
    try {
      const tid = handle.startsWith('@') ? handle.slice(1) : handle;
      if (aid) await db.from('user_tracks').delete().eq('tracker_id', aid).eq('tracked_id', tid);
    } catch(e) { console.warn('[TRACK] フォロー時の削除失敗:', e); }
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
      if (wasFollowing) { followingSet.add(handle); myFollowingHandles.push(handle); if(btn){btn.textContent = 'フォロー中'; btn.classList.add('btn-following');} }
      else              { followingSet.delete(handle); myFollowingHandles = myFollowingHandles.filter(h => h !== handle); if(btn){btn.textContent = 'フォローする'; btn.classList.remove('btn-following');} }
      const errMsg = (result && result.errorMsg) ? result.errorMsg : '不明なエラー';
      showToast('フォロー失敗: ' + errMsg, 'error');
      return;
    }
    // DB の結果（true=フォロー / false=解除）で状態を確定
    const nowFollowing = (result === true);
    // followingSet をDB結果に合わせて補正（ローカルと食い違っていた場合の救済）
    if (nowFollowing) {
      followingSet.add(handle);
      if (!myFollowingHandles.includes(handle)) myFollowingHandles.push(handle);
      if (btn) { btn.textContent = 'フォロー中'; btn.classList.add('btn-following'); }
      // フォロー時は user_tracks を削除
      try {
        const tid = handle.startsWith('@') ? handle.slice(1) : handle;
        await db.from('user_tracks').delete().eq('tracker_id', aid).eq('tracked_id', tid);
      } catch(e) {}
    } else {
      followingSet.delete(handle);
      myFollowingHandles = myFollowingHandles.filter(h => h !== handle);
      if (btn) { btn.textContent = 'フォローする'; btn.classList.remove('btn-following'); }
    }
    showToast(nowFollowing ? `${handle} をフォローしました` : `${handle} のフォローを解除しました`, nowFollowing ? 'success' : '');
    // トラックページを開いていれば再描画
    if (typeof renderTrackPage === 'function' && document.getElementById('page-track')?.classList.contains('active')) {
      renderTrackPage();
    }
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

  // ① フォロー数・フォロワー数（アクティブアカウント別）
  if (typeof dbFetchFollowCounts === 'function') {
    const counts = await dbFetchFollowCounts(_activeAid() || aid);
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

  // フォロー中 + トラック中（5pt以上）のユーザーを統合
  const tracks = await dbFetchMyTracks().catch(() => []);
  const trackedHandles = tracks
    .filter(t => _isTracked(t.points))
    .map(t => '@' + t.tracked_id);
  const merged = [...new Set([...(myFollowingHandles || []), ...trackedHandles])];

  await dbLoadAndMergePosts(merged);
}

// ── Tweet Detail ───────────────────────────────────────
async function openTweetDetail(idx) {
  const t = _tc[idx];
  if (!t) return;
  // 外部投稿は外部URLへ
  if (t.extUrl) { window.open(t.extUrl, '_blank', 'noopener,noreferrer'); return; }
  const u = t.user;
  // トラックポイント +2/つぶやきクリック
  if (!t.extSource && u?.h) {
    _addTrackPoint(_handleToAccountId(u.h), TRACK_POINTS.click);
  }
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
          ${_escHtml(u.n)}
          ${u.sub ? subBadge() : `<span class="badge-main">メイン</span>`}
          ${u.nameTag ? `<span class="tweet-name-tag">＠${_escHtml(u.nameTag)}</span>` : ''}
        </div>
        <div class="tweet-handle">${u.h} <span style="color:var(--text3);font-size:11px;margin-left:4px">${t.time}</span></div>
      </div>
      <i class="ti ti-chevron-right" style="font-size:14px;opacity:0.35;flex-shrink:0"></i>
    </div>
    <div class="td-content" style="padding:10px 16px">
      ${t.text ? `<div class="td-text" style="font-size:15px;line-height:1.6;margin-bottom:8px">${_linkify(t.text)}</div>` : ''}
      ${t.mediaData ? (t.mediaType === 'image'
          ? `<div class="tweet-media" style="margin:4px 0 8px">${t.imageLinkUrl && _parseMediaImages(t.mediaData).length === 1
              ? `<img src="${t.mediaData}" alt="添付画像" class="tweet-media-img" style="cursor:pointer" onclick="event.stopPropagation();_confirmExternalLink('${encodeURI(t.imageLinkUrl)}')">`
              : _renderMultiImageHtml(t.mediaData, { imgClass: 'tweet-media-img' })
            }</div>`
          : `<div class="tweet-media" style="margin:4px 0 8px"><video src="${t.mediaData}" controls class="tweet-media-vid" preload="metadata"></video></div>`)
        : ''}
      ${t.linkUrl ? `<div style="margin-top:2px;margin-bottom:4px">${_urlBtnHTML(t.linkUrl)}</div>` : ''}
    </div>
    <div class="td-stats-row" style="padding:8px 14px;display:flex;align-items:center;gap:8px;flex-wrap:nowrap;border-top:1px solid var(--border);border-bottom:1px solid var(--border);overflow:hidden;font-size:11px">
      <button class="td-action-btn like-btn${likedTweets.has(idx)?' liked':''}" onclick="toggleLike(${idx},this)" style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;flex-shrink:0;padding:2px 4px;font-size:11px">${t.likeEmoji ? `<span class="like-emoji-display">${t.likeEmoji}</span>` : `<i class="ti ti-heart${likedTweets.has(idx)?'-filled':''}" style="${likedTweets.has(idx)?'color:#e11d48':''};font-size:14px"></i>`}<span class="like-count" id="td-like-${idx}" style="font-size:11px">${fmt(t.likes)}</span></button>
      <span style="color:var(--text3);display:inline-flex;align-items:center;gap:2px;white-space:nowrap;flex-shrink:0"><i class="ti ti-eye" style="font-size:14px"></i>${fmt(t.views)}</span>
      ${t.boostScore > 0 ? `<span style="color:#f59e0b;display:inline-flex;align-items:center;gap:2px;white-space:nowrap;flex-shrink:0"><i class="ti ti-rocket" style="font-size:13px"></i>+${t.boostScore}</span>` : ''}
      ${aiBadge(t.ai)}
      <span style="display:inline-flex;align-items:center;flex-shrink:0;transform:scale(.85);transform-origin:left center">${favStar(idx)}</span>
      ${hasRank ? `<span style="margin-left:auto;display:inline-flex;align-items:center;gap:3px;white-space:nowrap;flex-shrink:0;transform:scale(.9);transform-origin:right center"><span class="rank-badge-card ${rc(t.rank)}">#${t.rank}位</span>${prevBadge(t.prev)}</span>` : ''}
    </div>
    ${(false && t.db_id && !t.extSource) ? `<div style="padding:8px 14px;border-bottom:1px solid var(--border)">
      <button onclick="openBoostPicker('${t.db_id}')" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:18px;border:1px solid #f59e0b;background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;font-size:12px;font-weight:700;cursor:pointer">
        <i class="ti ti-rocket"></i> ブーストチケットを使う
      </button>
    </div>` : ''}
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
      if (aid && _isFanTrigger(authorId)) dbUpdateFanLevel(aid, authorId, 'comment', 1);
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
            <span class="tweet-name">${ru.sub ? '匿名ユーザー' : _escHtml(ru.n)}</span>
            ${ru.sub ? subBadge() : ''}
            ${ru.nameTag ? `<span class="tweet-name-tag">＠${_escHtml(ru.nameTag)}</span>` : ''}
            <span class="tweet-handle">${ru.h}</span>
            <span class="tweet-time">${r.time}</span>
          </div>
          <div class="tweet-text">${_escHtml(r.text)}</div>
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
        <div class="reply-target-text">${_escHtml(t.text)}</div>
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
/** ファンレベル計上の対象（推しユーザー or フォロー中ユーザー） */
function _isFanTrigger(accountId) {
  if (!accountId) return false;
  if (_isFavUser(accountId)) return true;
  if (typeof followingSet !== 'undefined' && followingSet.has('@' + accountId)) return true;
  return false;
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
