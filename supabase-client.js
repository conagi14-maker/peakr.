// ── Supabase Client ────────────────────────────────────
const SUPABASE_URL = 'https://ueqqurinkmgvetnmjvka.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlcXF1cmlua21ndmV0bm1qdmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODg5NTIsImV4cCI6MjA5NTI2NDk1Mn0.1VoXnxTag38XY98Knzb5nAJbwQE0swKga-bpvMmH-S0';
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 匿名セッションキー（端末ごとのユーザー識別） ──────────
function getSessionKey() {
  let key = localStorage.getItem('trendy_session_v1');
  if (!key) {
    key = (crypto.randomUUID ? crypto.randomUUID()
      : 'sess_' + Math.random().toString(36).slice(2) + Date.now());
    localStorage.setItem('trendy_session_v1', key);
  }
  return key;
}

// ══════════════════════════════════════════
// プロフィール (profiles) ← クロスオリジン対応
// ══════════════════════════════════════════

/** 新規登録時にプロフィールをSupabaseへ保存
 *  ※ upsert で既存行を上書きするため、画像・メタ情報も明示的にリセットする
 *     （リセット後の同一IDでの再登録で古いデータが残らないように）
 */
async function dbSaveProfile({ accountId, passwordHash, nickname, bio, isDev }) {
  const { data, error } = await db.from('profiles').upsert({
    account_id    : accountId,
    password_hash : passwordHash,
    nickname      : nickname || accountId,
    bio           : bio      || '',
    is_dev        : isDev    || false,
    // 以下は新規登録時に必ずリセット（同一IDで再登録した場合に古いデータが復活しないよう）
    avatar_data   : null,
    cover_data    : null,
    name_tag      : null,
    gender        : null,
    dob           : null,
    region        : null,
    city          : null,
    categories    : [],
    display_badges: [],
    updated_at    : new Date().toISOString(),
  }, { onConflict: 'account_id' }).select().single();
  if (error) {
    console.error('[DB] プロフィール保存エラー:', error.message, '| code:', error.code, '| details:', error.details);
    throw new Error(error.message || 'プロフィール保存失敗');
  }
  console.log('[DB] プロフィールを保存しました:', accountId);
  return data;
}

/** accountId でプロフィールを取得（ログイン認証用）
 *  戻り値：
 *   - プロフィールオブジェクト … 正常取得
 *   - null                    … 存在しない（削除済み・未登録）
 *   - undefined               … 通信エラー（存在確認不可）
 */
async function dbFetchProfile(accountId) {
  const { data, error } = await db.from('profiles')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) {
    console.error('[DB] プロフィール取得エラー:', error.message);
    return undefined; // エラーと「存在しない」を区別するために undefined を返す
  }
  return data; // 存在すればオブジェクト、しなければ null
}

/** ソーシャルリンクをSupabaseへ保存 */
async function dbUpdateSocialLinks(accountId, links) {
  if (!accountId) return;
  const { error } = await db.from('profiles')
    .update({ social_links: links, updated_at: new Date().toISOString() })
    .eq('account_id', accountId);
  if (error) console.error('[DB] ソーシャルリンク更新エラー:', error.message);
  else console.log('[DB] ソーシャルリンク保存:', accountId, links);
}

/** 表示バッジ（最大3個）をSupabaseへ保存 */
async function dbSaveDisplayBadges(accountId, badges) {
  if (!accountId) return;
  const { error } = await db.from('profiles')
    .update({ display_badges: badges, updated_at: new Date().toISOString() })
    .eq('account_id', accountId);
  if (error) console.error('[DB] バッジ保存エラー:', error.message);
}

/** 開発者フラグのみ更新（ユーザー管理ページから呼び出す） */
async function dbSetDevFlag(accountId, isDev) {
  if (!accountId) return false;
  const { error } = await db.from('profiles')
    .update({ is_dev: isDev, updated_at: new Date().toISOString() })
    .eq('account_id', accountId);
  if (error) { console.error('[DB] 開発者フラグ更新エラー:', error.message); return false; }
  return true;
}

/** プロフィール変更をSupabaseへ同期 */
async function dbUpdateProfile({ accountId, nickname, bio, isDev }) {
  if (!accountId) return;
  const { error } = await db.from('profiles').update({
    nickname   : nickname,
    bio        : bio,
    is_dev     : isDev,
    updated_at : new Date().toISOString(),
  }).eq('account_id', accountId);
  if (error) console.error('[DB] プロフィール更新エラー:', error.message);
}

/** 名前タグ・地域・性別・生年月日をSupabaseへ保存 */
async function dbUpdateProfileMeta(accountId, { nameTag, region, gender, dob } = {}) {
  if (!accountId) return;
  const update = { updated_at: new Date().toISOString() };
  if (nameTag !== undefined) update.name_tag = nameTag;
  if (region  !== undefined) update.region   = region;
  if (gender  !== undefined) update.gender   = gender;
  if (dob     !== undefined) update.dob      = dob;
  const { error } = await db.from('profiles').update(update).eq('account_id', accountId);
  if (error) console.error('[DB] メタ情報更新エラー:', error.message);
  else localStorage.setItem('trendy_last_sync', new Date().toISOString());
}

/** アバター or カバー画像をSupabaseへ保存（列名を指定） */
async function dbSaveProfileImage(accountId, column, dataUrl) {
  if (!accountId || !column || !dataUrl) return;
  const update = { updated_at: new Date().toISOString() };
  update[column] = dataUrl;
  const { error } = await db.from('profiles').update(update).eq('account_id', accountId);
  if (error) console.error(`[DB] 画像保存エラー (${column}):`, error.message);
  else console.log(`[DB] ${column} を保存しました`);
}

/** カテゴリー一覧をSupabaseへ保存 */
async function dbSaveCategories(accountId, categories) {
  if (!accountId) return;
  const { error } = await db.from('profiles').update({
    categories : categories,
    updated_at : new Date().toISOString(),
  }).eq('account_id', accountId);
  if (error) console.error('[DB] カテゴリー保存エラー:', error.message);
  else localStorage.setItem('trendy_last_sync', new Date().toISOString());
}

/** 指定ユーザーのカテゴリーをSupabaseから取得 */
async function dbLoadCategories(accountId) {
  if (!accountId) return [];
  const { data, error } = await db.from('profiles')
    .select('categories')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) { console.error('[DB] カテゴリー取得エラー:', error.message); return []; }
  return data?.categories || [];
}

// ══════════════════════════════════════════
// 投稿 (posts)
// ══════════════════════════════════════════
async function dbSavePost({ handle, name, isSub, content, aiType, mediaData, mediaType, nameTag, catId, tags, linkUrl, imageLinkUrl }) {
  // 画像は Supabase 保存前に圧縮（容量削減）
  let finalMedia = mediaData || null;
  if (mediaData && mediaType === 'image' && typeof _compressImage === 'function') {
    try { finalMedia = await _compressImage(mediaData, 1080, 1080, 0.82); } catch(e) { /* 圧縮失敗時はそのまま */ }
  }
  const { data, error } = await db.from('posts').insert({
    user_handle     : handle    || '@you',
    user_name       : name      || 'あなた',
    is_sub          : isSub     || false,
    content,
    ai_type         : aiType    || 'none',
    media_data      : finalMedia,
    media_type      : mediaType || '',
    name_tag        : nameTag   || '',
    cat_id          : catId     || '',
    tags            : tags      || [],
    link_url        : linkUrl       || '',
    image_link_url  : imageLinkUrl  || '',
  }).select().single();
  if (error) { console.error('[DB] 投稿保存エラー:', error.message); return null; }
  console.log('[DB] 投稿を保存しました:', data.id);
  return data;
}

/**
 * ランキング用投稿をSupabaseから取得
 * @param {object} opts - { period:'daily'|'weekly'|'monthly', catId, subTag, mode:'ranking'|'new'|'rec', limit }
 */
async function dbFetchRankedPosts({ period = 'daily', catId = null, subTag = null, mode = 'ranking', limit = 300, prefecture = null } = {}) {
  const now = new Date();
  const ROOKIE_MS = 30 * 24 * 60 * 60 * 1000; // 30日
  const periodMs  = { daily: 86400000, weekly: 604800000, monthly: 2592000000, yearly: 31536000000 };

  // 都道府県フィルター：対象 user_handle を先に絞り込む
  let regionHandles = null;
  if (prefecture) {
    const { data: profs } = await db.from('profiles').select('account_id').eq('region', prefecture);
    regionHandles = (profs || []).map(p => '@' + p.account_id);
    if (regionHandles.length === 0) return [];
  }

  // ── ルーキーランキング（アカウント作成から1ヶ月以内のユーザーの投稿） ──
  if (period === 'rookie') {
    const rookieStart = new Date(now - ROOKIE_MS);
    const { data: rookieProfs } = await db.from('profiles')
      .select('account_id')
      .gte('created_at', rookieStart.toISOString());
    let rookieHandles = (rookieProfs || []).map(p => '@' + p.account_id);

    // 都道府県フィルターとの交差
    if (regionHandles) {
      const regionSet = new Set(regionHandles);
      rookieHandles = rookieHandles.filter(h => regionSet.has(h));
    }
    if (rookieHandles.length === 0) return [];

    let rq = db.from('posts').select('*')
      .in('user_handle', rookieHandles)
      .order('likes_count', { ascending: false })
      .order('created_at',  { ascending: false })
      .limit(limit);
    if (catId && catId !== 'all') rq = rq.eq('cat_id', catId);
    const { data: rd, error: re } = await rq;
    if (re) { console.error('[DB] ルーキーランキング取得エラー:', re.message); return []; }
    let rookiePosts = rd || [];
    if (subTag && subTag !== '全体') {
      rookiePosts = rookiePosts.filter(p => Array.isArray(p.tags) && p.tags.includes('#' + subTag));
    }
    return rookiePosts;
  }

  // ── 通常ランキング ──
  const startDate = new Date(now - (periodMs[period] || periodMs.daily));

  let query = db.from('posts')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .limit(limit);

  if (catId && catId !== 'all') query = query.eq('cat_id', catId);
  if (regionHandles) query = query.in('user_handle', regionHandles);

  // 最新モードは created_at 降順、それ以外は likes 降順 → 時刻降順でフォールバック
  if (mode === 'new') {
    query = query.order('created_at', { ascending: false });
  } else {
    query = query.order('likes_count', { ascending: false })
                 .order('created_at',  { ascending: false });
  }

  const { data, error } = await query;
  if (error) { console.error('[DB] ランキング取得エラー:', error.message); return []; }

  let posts = data || [];

  // サブタグフィルター（クライアント側）
  if (subTag && subTag !== '全体') {
    const tag = '#' + subTag;
    posts = posts.filter(p => Array.isArray(p.tags) && p.tags.includes(tag));
  }

  return posts;
}

/** 外部投稿を posts テーブルに挿入（既存 ext_url は除外して重複防止） */
async function dbUpsertExtPosts(posts) {
  if (!posts || !posts.length) return;
  const urls = posts.map(p => p.ext_url).filter(Boolean);
  if (!urls.length) return;

  // 既存の ext_url を確認して新規分だけ INSERT
  const { data: existing } = await db.from('posts').select('ext_url').in('ext_url', urls);
  const existingSet = new Set((existing || []).map(p => p.ext_url));
  const newPosts = posts.filter(p => p.ext_url && !existingSet.has(p.ext_url));
  if (!newPosts.length) return;

  const rows = newPosts.map(p => ({
    user_handle   : p.user_handle,
    user_name     : p.user_name,
    content       : p.content,
    cat_id        : p.cat_id        || null,
    tags          : p.tags          || [],
    media_type    : p.media_type    || null,
    media_data    : p.media_data    || null,
    image_link_url: p.image_link_url|| null,
    link_url      : p.link_url      || null,
    ai_type       : 'none',
    is_sub        : false,
    ext_source    : p.ext_source,
    ext_url       : p.ext_url,
    ext_pop_score : p.ext_pop_score || 0,
    created_at    : p.created_at    || new Date().toISOString(),
  }));
  const { error } = await db.from('posts').insert(rows);
  if (error) console.error('[ext] insert error:', error.message);
}

async function dbFetchPosts(limit = 30) {
  const { data, error } = await db
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('[DB] 投稿取得エラー:', error.message); return []; }
  return data || [];
}

/** 投稿を削除（関連いいねも削除） */
async function dbDeletePost(postId) {
  if (!postId) return false;
  await db.from('post_likes').delete().eq('post_id', postId);
  const { error } = await db.from('posts').delete().eq('id', postId);
  if (error) { console.error('[DB] 投稿削除エラー:', error.message); return false; }
  return true;
}

/** 特定ユーザーの投稿を取得 */
async function dbFetchPostsByHandle(handle, limit = 50) {
  const { data, error } = await db
    .from('posts')
    .select('*')
    .eq('user_handle', handle)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('[DB] ユーザー投稿取得エラー:', error.message); return []; }
  return data || [];
}

// ══════════════════════════════════════════
// コメント (comments)
// ══════════════════════════════════════════

/** コメントを Supabase に保存 */
async function dbSaveComment({ postId, userHandle, userName, isSub, content, nameTag }) {
  if (!postId || !content) return null;
  const { data, error } = await db.from('comments').insert({
    post_id     : String(postId),
    user_handle : userHandle || '@you',
    user_name   : userName   || 'あなた',
    is_sub      : isSub      || false,
    content,
    name_tag    : nameTag    || '',
  }).select().single();
  if (error) { console.error('[DB] コメント保存エラー:', error.message); return null; }
  return data;
}

/** 投稿に紐づくコメントを取得（古い順） */
async function dbFetchComments(postId) {
  if (!postId) return [];
  const { data, error } = await db
    .from('comments')
    .select('*')
    .eq('post_id', String(postId))
    .order('created_at', { ascending: true });
  if (error) { console.error('[DB] コメント取得エラー:', error.message); return []; }
  return data || [];
}

// ══════════════════════════════════════════
// フォロー (follows)
// ══════════════════════════════════════════

/** 自分がフォローしているハンドル一覧を取得（'@id' 形式の配列） */
async function dbFetchFollowing(accountId) {
  if (!accountId) return [];
  const { data, error } = await db
    .from('follows')
    .select('following_id')
    .eq('follower_id', accountId);
  if (error) { console.error('[DB] フォロー一覧取得エラー:', error.message); return []; }
  return (data || []).map(r => '@' + r.following_id);
}

/** フォロー / アンフォロー切り替え。戻り値: true=フォロー, false=解除, null=エラー */
async function dbToggleFollow(myAccountId, targetHandle) {
  if (!myAccountId || !targetHandle) return null;
  const targetId = targetHandle.startsWith('@') ? targetHandle.slice(1) : targetHandle;

  // 既にフォローしているか確認
  const { data: existing, error: selErr } = await db
    .from('follows')
    .select('follower_id')
    .eq('follower_id', myAccountId)
    .eq('following_id', targetId)
    .maybeSingle();
  if (selErr) {
    console.error('[DB] フォロー確認エラー:', selErr.message, selErr.code, selErr.details);
    return { errorMsg: selErr.message };
  }

  if (existing) {
    // アンフォロー
    const { error } = await db.from('follows')
      .delete()
      .eq('follower_id', myAccountId)
      .eq('following_id', targetId);
    if (error) {
      console.error('[DB] アンフォローエラー:', error.message, error.code, error.details);
      return { errorMsg: error.message };
    }
    return false;
  } else {
    // フォロー
    const { error } = await db.from('follows')
      .insert({ follower_id: myAccountId, following_id: targetId });
    if (error) {
      console.error('[DB] フォローエラー:', error.message, error.code, error.details);
      return { errorMsg: error.message };
    }
    // フォローされた人に通知を送る
    await dbSaveFollowNotif(targetId, myAccountId);
    return true;
  }
}

/** フォロー通知をSupabaseに保存（フォローされた人に通知） */
async function dbSaveFollowNotif(targetAccountId, followerAccountId) {
  if (!targetAccountId || !followerAccountId) return;
  try {
    // フォロワーのニックネームを取得
    const { data: followerProfile, error: profErr } = await db
      .from('profiles')
      .select('nickname')
      .eq('account_id', followerAccountId)
      .maybeSingle();

    const followerName = followerProfile?.nickname || followerAccountId;

    await db.from('notifications').insert({
      account_id   : targetAccountId,
      account_type : 'main',
      icon         : 'ti-user-plus',
      bg           : '#fce7f3',
      tc           : '#be185d',
      text         : `${followerName} さんがフォローしました`,
      hint         : 'タップしてプロフィールを確認 👆',
      notif_type   : 'follow',
      follower_count: 1,
      followers    : JSON.stringify([followerName]),
      unread       : true,
    });
  } catch(e) {
    console.warn('[DB] フォロー通知保存エラー:', e);
  }
}

/** フォロワー一覧を取得（account_id 配列） */
async function dbFetchFollowers(accountId) {
  if (!accountId) return [];
  const { data, error } = await db
    .from('follows')
    .select('follower_id')
    .eq('following_id', accountId);
  if (error) { console.error('[DB] フォロワー一覧取得エラー:', error.message); return []; }
  return (data || []).map(r => r.follower_id);
}

/** 複数の account_id のプロフィールを一括取得 */
async function dbFetchProfilesByIds(accountIds) {
  if (!accountIds || accountIds.length === 0) return [];
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .in('account_id', accountIds);
  if (error) { console.error('[DB] プロフィール一括取得エラー:', error.message); return []; }
  return data || [];
}

/** ファンランキング用：全プロフィール＋フォロワー数 */
async function dbFetchAllProfilesWithFollowerCount() {
  const { data: profiles, error: e1 } = await db
    .from('profiles')
    .select('*');
  if (e1 || !profiles) { console.error('[DB] プロフィール取得エラー:', e1?.message); return []; }

  // フォロワー数を取得
  const { data: followers, error: e2 } = await db
    .from('follows')
    .select('following_id');
  if (e2) { console.error('[DB] フォロワーデータ取得エラー:', e2.message); }

  // account_id ごとのフォロワー数をカウント
  const followerCount = {};
  (followers || []).forEach(row => {
    if (row.following_id) {
      followerCount[row.following_id] = (followerCount[row.following_id] || 0) + 1;
    }
  });

  // プロフィールにフォロワー数を付加してソート
  return profiles
    .map(p => ({ ...p, followers: followerCount[p.account_id] || 0 }))
    .sort((a, b) => b.followers - a.followers);
}

// ══════════════════════════════════════════
// 広告 (ads)
// ══════════════════════════════════════════
let _dbAds = null; // メモリキャッシュ

async function dbLoadAds() {
  const { data, error } = await db
    .from('ads')
    .select('*')
    .eq('active', true)
    .order('budget', { ascending: false });
  if (error) { console.error('[DB] 広告取得エラー:', error.message); return []; }
  // アプリ内の形式に正規化
  _dbAds = (data || []).map(ad => ({
    id         : ad.id,
    advertiser : ad.advertiser,
    text       : ad.text,
    budget     : ad.budget,
    maxPerUser : ad.max_per_user,
    bg         : ad.bg,
    tc         : ad.tc,
  }));
  return _dbAds;
}

function dbGetCachedAds() { return _dbAds; }

async function dbDeleteAd(id) {
  if (!id) return false;
  // まずDELETEを試みる
  const { error } = await db.from('ads').delete().eq('id', id);
  if (!error) {
    if (_dbAds) _dbAds = _dbAds.filter(a => String(a.id) !== String(id));
    return true;
  }
  console.warn('[DB] 広告DELETE失敗、active=falseで無効化を試みます:', error.message);
  // RLS等でDELETEできない場合はactive=falseに設定
  const { error: e2 } = await db.from('ads').update({ active: false }).eq('id', id);
  if (e2) { console.error('[DB] 広告無効化エラー:', e2.message); return false; }
  if (_dbAds) _dbAds = _dbAds.filter(a => String(a.id) !== String(id));
  return true;
}

async function dbFetchAllAds() {
  const { data, error } = await db
    .from('ads')
    .select('*')
    .order('budget', { ascending: false });
  if (error) { console.error('[DB] 広告一覧取得エラー:', error.message); return []; }
  return data || [];
}

async function dbSaveAd({ advertiser, text, budget, maxPerUser, bg, tc }) {
  const { data, error } = await db.from('ads').insert({
    advertiser, text, budget,
    max_per_user : maxPerUser,
    bg, tc, active: true,
  }).select().single();
  if (error) { console.error('[DB] 広告保存エラー:', error.message); return null; }
  console.log('[DB] 広告を保存しました:', data.id);
  await dbLoadAds(); // キャッシュ更新
  return data;
}

// ══════════════════════════════════════════
// 投稿の永続化ヘルパー（posts テーブル）
// ══════════════════════════════════════════
// DBの投稿をローカルにマージしてフィードを再描画する
// followingHandles: null=全件取得（未ログイン）/ 配列=自分+フォロー中のみ
async function dbLoadAndMergePosts(followingHandles = null) {
  const aid = localStorage.getItem('trendy_account_id');
  const myHandles = ['@you', '@anon_you'];
  if (aid) {
    myHandles.push('@' + aid);
    myHandles.push('@' + aid + '_sub'); // サブアカウント投稿も取得
  }

  let query = db.from('posts').select('*').order('created_at', { ascending: false }).limit(100);

  // ログイン済みの場合: 自分 + フォロー中のハンドルのみ表示
  if (followingHandles !== null) {
    const allowedHandles = [...new Set([...myHandles, ...followingHandles])];
    query = query.in('user_handle', allowedHandles);
  }

  const { data, error } = await query;
  if (error) { console.error('[DB] 投稿読み込みエラー:', error.message); return; }
  if (!data || !data.length) return;

  // 投稿に登場するすべてのユーザーの account_id を収集（@handle → handle）
  const allAccountIds = [...new Set(
    data
      .filter(p => p.user_handle && p.user_handle.startsWith('@') && !p.is_sub)
      .map(p => p.user_handle.slice(1))
  )];

  // profiles を一括取得してアバター画像マップを作る
  const avatarMap = {}; // { '@handle': '<img ...>' or null }
  if (allAccountIds.length > 0) {
    const { data: profiles } = await db
      .from('profiles')
      .select('account_id, avatar_data, nickname, is_verified, is_corporate')
      .in('account_id', allAccountIds);
    (profiles || []).forEach(prof => {
      avatarMap['@' + prof.account_id] = prof.avatar_data
        ? `<img src="${prof.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : null;
      // バッジキャッシュに登録（app.js の _badgeCache）
      if (typeof _badgeCache !== 'undefined') {
        _badgeCache[prof.account_id] = {
          is_verified : !!prof.is_verified,
          is_corporate: !!prof.is_corporate,
        };
      }
    });
  }

  // 自分のアバター（localStorage が最新）
  const myAvData = localStorage.getItem('trendy_av');
  if (myAvData && aid) {
    avatarMap['@' + aid] = `<img src="${myAvData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  }

  data.forEach(p => {
    // 同じ db_id が既にローカルにあればスキップ（重複防止）
    if (HOME_TWEETS.some(h => h.db_id === p.id)) return;
    const isMyPost = myHandles.includes(p.user_handle);
    const avImg = p.is_sub ? null : avatarMap[p.user_handle];
    const _fallbackName = p.user_name || p.user_handle?.slice(1) || '?';
    const t = {
      db_id    : p.id,
      catId    : null,
      text     : p.content,
      likes    : p.likes_count  || 0,
      rt       : p.rt_count     || 0,
      views    : p.views_count  || 0,
      time     : _relativeTime(p.created_at),
      ai       : p.ai_type      || 'none',
      user     : {
        h          : p.user_handle,
        n          : p.user_name,
        av         : avImg || _fallbackName[0].toUpperCase(),
        bg         : isMyPost ? '#dbeafe' : '#3b82f6',
        tc         : isMyPost ? '#1e40af' : '#ffffff',
        sub        : p.is_sub,
        // 自分の投稿は現在の名前タグをフォールバック（name_tag列追加前の投稿対応）
        nameTag    : p.name_tag || (isMyPost ? myNameTag : null) || null,
        is_verified : !!(p.is_sub ? false : _badgeCache?.[p.user_handle?.slice(1)]?.is_verified),
        is_corporate: !!(p.is_sub ? false : _badgeCache?.[p.user_handle?.slice(1)]?.is_corporate),
      },
      tags        : Array.isArray(p.tags) ? p.tags : [],
      mediaData   : p.media_data      || null,
      mediaType   : p.media_type      || null,
      linkUrl     : p.link_url        || null,
      imageLinkUrl: p.image_link_url  || null,
      catId       : p.cat_id          || null,
      rank        : 0,
      isDummy     : false,
    };
    HOME_TWEETS.push(t);
    if (myHandles.includes(p.user_handle)) {
      if (!myPosts.some(m => m.db_id === p.id)) myPosts.push(t);
    }
  });

  // リアル投稿をダミーより上に並べる
  HOME_TWEETS.sort((a, b) => {
    if (!a.isDummy && b.isDummy)  return -1;
    if (a.isDummy  && !b.isDummy) return  1;
    return 0;
  });

  // フィードを再描画
  const feed = document.getElementById('home-feed');
  if (feed && HOME_TWEETS.length > 0) {
    feed.innerHTML = '';
    homeLoaded = 0;
    loadHomeMore();
  }
  if (typeof renderMyPosts === 'function') renderMyPosts();
  console.log('[DB] 投稿を読み込みました:', data.length, '件');
}

// ── 広告表示回数トラッキング ──────────────────────────────
async function dbSyncImpressions() {
  const { data, error } = await db
    .from('ad_impressions')
    .select('ad_id, count')
    .eq('session_key', getSessionKey());
  if (error) { console.error('[DB] 表示回数同期エラー:', error.message); return {}; }
  const result = {};
  (data || []).forEach(r => { result[r.ad_id] = r.count; });
  return result;
}

async function dbIncrementImpression(adId) {
  const session = getSessionKey();
  const { data: existing } = await db
    .from('ad_impressions')
    .select('id, count')
    .eq('ad_id', adId)
    .eq('session_key', session)
    .maybeSingle();

  if (existing) {
    await db.from('ad_impressions')
      .update({ count: existing.count + 1, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await db.from('ad_impressions')
      .insert({ ad_id: adId, session_key: session, count: 1 });
  }
}

// ══════════════════════════════════════════
// いいね (post_likes)
// ══════════════════════════════════════════

/** ログインユーザーのいいね済み投稿ID一覧を取得 */
async function dbFetchLikedPostIds(accountId) {
  if (!accountId) return [];
  const { data, error } = await db.from('post_likes').select('post_id').eq('account_id', accountId);
  if (error) { console.warn('[DB] いいね取得エラー:', error.message); return []; }
  return (data || []).map(r => r.post_id);
}

/** いいねをトグル（nowLiked=true でいいね、false で取消） */
async function dbToggleLike(postDbId, accountId, nowLiked, postAuthorHandle, isFavorite = false) {
  if (!postDbId || !accountId) return;
  const pid = String(postDbId);
  try {
    if (nowLiked) {
      await db.from('post_likes').insert({ post_id: pid, account_id: accountId });
      await db.rpc('increment_likes', { p_post_id: pid });
    } else {
      await db.from('post_likes').delete().eq('post_id', pid).eq('account_id', accountId);
      await db.rpc('decrement_likes', { p_post_id: pid });
    }
    // 推しレベル更新（推しユーザーのみ）
    if (postAuthorHandle && isFavorite) {
      const authorId = postAuthorHandle.startsWith('@') ? postAuthorHandle.slice(1) : postAuthorHandle;
      dbUpdateFanLevel(accountId, authorId, 'like', nowLiked ? 1 : -1);
    }
  } catch(e) { console.warn('[DB] いいねエラー:', e); }
}

/** アカウントが閲覧済みの投稿IDリストを取得 */
async function dbFetchViewedPostIds(accountId) {
  if (!accountId) return [];
  const { data, error } = await db.from('post_views').select('post_id').eq('account_id', accountId);
  if (error) { console.warn('[DB] 閲覧済み取得エラー:', error.message); return []; }
  return (data || []).map(r => r.post_id);
}

/** 閲覧数カウント（アカウントごとに1回のみ・DB側で重複防止） */
async function dbIncrementView(postDbId, accountId) {
  if (!postDbId || !accountId) return;
  try {
    await db.rpc('increment_views_once', { p_post_id: String(postDbId), p_account_id: accountId });
  } catch(e) { /* silent */ }
}

// ══════════════════════════════════════════
// 推しレベル (user_fan_levels / user_favorites)
// ══════════════════════════════════════════

/** ファンレベルを取得 */
async function dbGetFanLevel(fanAccountId, userAccountId) {
  if (!fanAccountId || !userAccountId) return null;
  const { data, error } = await db.from('user_fan_levels')
    .select('*')
    .eq('fan_account_id', fanAccountId)
    .eq('user_account_id', userAccountId)
    .maybeSingle();
  if (error) { console.warn('[DB] ファンレベル取得エラー:', error.message); return null; }
  return data;
}

/** ファンレベルの指標を更新（upsert して fan_level を再計算） */
async function dbUpdateFanLevel(fanAccountId, userAccountId, metric, delta) {
  if (!fanAccountId || !userAccountId) return;
  if (fanAccountId === userAccountId) return; // 自分自身はカウントしない
  try {
    // 既存行を取得
    const { data: existing } = await db.from('user_fan_levels')
      .select('viewed_posts, liked_posts, comments_made')
      .eq('fan_account_id', fanAccountId)
      .eq('user_account_id', userAccountId)
      .maybeSingle();

    const base = existing || { viewed_posts: 0, liked_posts: 0, comments_made: 0 };
    const viewed   = metric === 'view'    ? Math.max(0, (base.viewed_posts   || 0) + delta) : (base.viewed_posts   || 0);
    const liked    = metric === 'like'    ? Math.max(0, (base.liked_posts    || 0) + delta) : (base.liked_posts    || 0);
    const comments = metric === 'comment' ? Math.max(0, (base.comments_made  || 0) + delta) : (base.comments_made  || 0);
    const total = viewed + liked + comments;

    await db.from('user_fan_levels').upsert({
      fan_account_id : fanAccountId,
      user_account_id: userAccountId,
      fan_level      : total,
      viewed_posts   : viewed,
      liked_posts    : liked,
      comments_made  : comments,
      last_updated   : new Date().toISOString(),
    }, { onConflict: 'fan_account_id,user_account_id' });
  } catch(e) { console.warn('[DB] ファンレベル更新エラー:', e); }
}

/** 自分の推しユーザー3人を取得 */
async function dbFetchUserFavorites(accountId) {
  if (!accountId) return null;
  const { data, error } = await db.from('user_favorites')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) { console.warn('[DB] 推しユーザー取得エラー:', error.message); return null; }
  return data;
}

/** 推しユーザー3人を保存（upsert） */
async function dbSetUserFavorites(accountId, fav1, fav2, fav3) {
  if (!accountId) return;
  const { error } = await db.from('user_favorites').upsert({
    account_id: accountId,
    favorite_1: fav1 || null,
    favorite_2: fav2 || null,
    favorite_3: fav3 || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id' });
  if (error) { console.warn('[DB] 推しユーザー保存エラー:', error.message); }
}

/** 自分のファンランキング（自分の投稿に対してファンレベルが高い順） */
async function dbFetchFanLeaderboard(accountId, limit = 50) {
  if (!accountId) return [];
  const { data, error } = await db.from('user_fan_levels')
    .select('fan_account_id, fan_level')
    .eq('user_account_id', accountId)
    .order('fan_level', { ascending: false })
    .limit(limit);
  if (error) { console.warn('[DB] ファンランキング取得エラー:', error.message); return []; }
  if (!data || data.length === 0) return [];

  // プロフィールを一括取得
  const ids = data.map(r => r.fan_account_id);
  const profiles = await dbFetchProfilesByIds(ids);
  const profMap = {};
  profiles.forEach(p => { profMap[p.account_id] = p; });

  return data.map(r => ({
    fan_account_id: r.fan_account_id,
    fan_level     : r.fan_level,
    profile       : profMap[r.fan_account_id] || null,
  }));
}

/** 自分が推しているユーザーのファンレベル一覧（fan_account_id = 自分、降順） */
async function dbFetchMyFanEngagements(accountId, limit = 50) {
  if (!accountId) return [];
  const { data, error } = await db.from('user_fan_levels')
    .select('user_account_id, fan_level')
    .eq('fan_account_id', accountId)
    .order('fan_level', { ascending: false })
    .limit(limit);
  if (error) { console.warn('[DB] 推しランキング取得エラー:', error.message); return []; }
  if (!data || data.length === 0) return [];

  const ids = data.map(r => r.user_account_id);
  const profiles = await dbFetchProfilesByIds(ids);
  const profMap = {};
  profiles.forEach(p => { profMap[p.account_id] = p; });

  return data.map(r => ({
    user_account_id: r.user_account_id,
    fan_level      : r.fan_level,
    profile        : profMap[r.user_account_id] || null,
  }));
}

// ══════════════════════════════════════════
// フォロー数・フォロワー数
// ══════════════════════════════════════════

/** フォロー数・フォロワー数を取得 */
async function dbFetchFollowCounts(accountId) {
  if (!accountId) return { following: 0, followers: 0 };
  // follows テーブルは follower_id / following_id ともに @ なしで保存
  const [{ count: followingCnt, error: e1 }, { count: followerCnt, error: e2 }] = await Promise.all([
    db.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', accountId),
    db.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', accountId),
  ]);
  if (e1) console.warn('[DB] フォロー数エラー:', e1.message);
  if (e2) console.warn('[DB] フォロワー数エラー:', e2.message);
  return { following: followingCnt || 0, followers: followerCnt || 0 };
}

/** 指定ユーザーの投稿数を取得 */
async function dbFetchUserPostCount(accountId) {
  if (!accountId) return 0;
  const { count, error } = await db
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('user_handle', '@' + accountId);
  if (error) { console.warn('[DB] 投稿数取得エラー:', error.message); return 0; }
  return count || 0;
}

// ══════════════════════════════════════════
// 通知 (notifications) — ユーザーごとに分離
// ══════════════════════════════════════════
async function dbFetchNotifs(accountType = 'main', accountId = null) {
  if (!accountId) return []; // ログインしていない場合は空
  const { data, error } = await db
    .from('notifications')
    .select('*')
    .eq('account_id', accountId)
    .eq('account_type', accountType)
    .order('created_at', { ascending: false });
  if (error) { console.error('[DB] 通知取得エラー:', error.message); return []; }
  return (data || []).map(row => ({
    db_id        : row.id,
    icon         : row.icon,
    bg           : row.bg   || '#dbeafe',
    tc           : row.tc   || '#1e40af',
    text         : row.text,
    hint         : row.hint,
    time         : _relativeTime(row.created_at),
    type         : row.notif_type,
    rank         : row.rank,
    cat          : row.cat,
    followerCount: row.follower_count,
    followers    : Array.isArray(row.followers) ? row.followers : (row.followers ? JSON.parse(row.followers) : []),
    unread       : row.unread,
  }));
}

function _relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'たった今';
  if (m < 60)  return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}日前`;
  return new Date(iso).toLocaleDateString('ja-JP');
}

async function dbMarkNotifRead(dbId) {
  if (!dbId) return;
  await db.from('notifications').update({ unread: false }).eq('id', dbId);
}

// dbSeedNotifs は廃止（ユーザーごとに分離したため共通シードデータは不要）
async function dbSeedNotifs() { /* no-op */ }

// ══════════════════════════════════════════
// メイン初期化（app.js の init() から呼ぶ）
// ══════════════════════════════════════════
// 開発者ページ用：全アカウント一覧取得
// ══════════════════════════════════════════

// ══════════════════════════════════════════
// 運営お知らせ通知
// ══════════════════════════════════════════

/** 全ユーザーにお知らせ通知を送信 */
async function dbSendAnnouncement({ title, message, targetAccountId = null }) {
  // 送信先を決定（指定あり→1人 / なし→全員）
  let accountIds = [];
  if (targetAccountId) {
    accountIds = [targetAccountId];
  } else {
    const { data, error } = await db.from('profiles').select('account_id');
    if (error) { console.error('[DB] お知らせ送信エラー（ユーザー取得）:', error.message); return { ok: false, count: 0 }; }
    accountIds = (data || []).map(r => r.account_id);
  }
  if (!accountIds.length) return { ok: false, count: 0 };

  const rows = accountIds.map(aid => ({
    account_id   : aid,
    account_type : 'main',
    icon         : 'ti-speakerphone',
    bg           : '#eff6ff',
    tc           : '#1d4ed8',
    text         : title,
    hint         : message || '',
    notif_type   : 'announce',
    unread       : true,
  }));

  const { error } = await db.from('notifications').insert(rows);
  if (error) { console.error('[DB] お知らせ送信エラー:', error.message); return { ok: false, count: 0 }; }
  console.log('[DB] お知らせを送信しました:', accountIds.length, '件');
  return { ok: true, count: accountIds.length };
}

/** 全プロフィールを取得（アバター・カバー画像は除外してデータ軽量化） */
async function dbFetchAllAccounts() {
  const { data, error } = await db
    .from('profiles')
    .select('account_id, nickname, bio, is_dev, name_tag, region, gender, dob, updated_at, created_at')
    .order('created_at', { ascending: false });
  if (error) { console.error('[DB] アカウント一覧取得エラー:', error.message); return []; }
  return data || [];
}

/** アカウントを完全削除（プロフィール + 投稿 + 関連データ） */
async function dbDeleteAccount(accountId) {
  if (!accountId) return false;
  try {
    await Promise.all([
      db.from('post_likes').delete().eq('account_id', accountId),
      db.from('notifications').delete().eq('account_id', accountId),
      db.from('follows').delete().eq('follower_id', accountId),
      db.from('follows').delete().eq('following_id', accountId),
      db.from('user_fan_levels').delete().eq('fan_account_id', accountId),
      db.from('user_fan_levels').delete().eq('user_account_id', accountId),
      db.from('user_favorites').delete().eq('account_id', accountId),
    ]);
    // 投稿削除（いいねを先に消す必要があるため順番に）
    const { data: posts } = await db.from('posts').select('id').eq('user_handle', '@' + accountId);
    if (posts && posts.length > 0) {
      const postIds = posts.map(p => p.id);
      await db.from('post_likes').delete().in('post_id', postIds);
      await db.from('posts').delete().eq('user_handle', '@' + accountId);
    }
    // プロフィール削除
    const { error } = await db.from('profiles').delete().eq('account_id', accountId);
    if (error) { console.error('[DB] アカウント削除エラー:', error.message); return false; }
    console.log('[DB] アカウントを削除しました:', accountId);
    return true;
  } catch(e) {
    console.error('[DB] アカウント削除エラー:', e);
    return false;
  }
}

// ══════════════════════════════════════════
// 現在のユーザーの通知を全削除
async function dbDeleteAllNotifs() {
  const accountId = localStorage.getItem('trendy_account_id');
  if (!accountId) return;
  const { error } = await db.from('notifications').delete().eq('account_id', accountId);
  if (error) console.error('[DB] 通知削除エラー:', error.message);
  else console.log('[DB] 通知を削除しました（account_id:', accountId, '）');
}

// ══════════════════════════════════════════
// アプリブランド設定（app_config）── 全端末共有
// ══════════════════════════════════════════

/** アプリ設定を取得（サービス名・アイコン・バッジアイコン） */
async function dbFetchAppConfig() {
  const { data, error } = await db
    .from('app_config')
    .select('app_name, app_icon, badge_verified_icon, badge_corporate_icon')
    .eq('id', 'main')
    .maybeSingle();
  if (error) { console.warn('[DB] アプリ設定取得エラー:', error.message); return null; }
  return data;
}

/** アプリ設定を保存（開発者のみ実行） */
async function dbSaveAppConfig(name, icon, badgeVerifiedIcon, badgeCorporateIcon) {
  console.log('[DB] アプリ設定保存中... name:', name, '/ icon:', icon ? '(データあり ' + Math.round((icon.length * 0.75)/1024) + 'KB)' : '(なし)');
  const payload = {
    id         : 'main',
    app_name   : name || 'Trendy',
    app_icon   : icon !== undefined ? icon : null,
    updated_at : new Date().toISOString(),
  };
  if (badgeVerifiedIcon  !== undefined) payload.badge_verified_icon  = badgeVerifiedIcon;
  if (badgeCorporateIcon !== undefined) payload.badge_corporate_icon = badgeCorporateIcon;
  const { error } = await db.from('app_config').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.error('[DB] アプリ設定保存エラー:', error.message, error);
    throw new Error(error.message);
  }
  console.log('[DB] アプリ設定を保存しました ✅ name:', name);
}

// ══════════════════════════════════════════
// バッジ申請 (badge_requests)
// ══════════════════════════════════════════

/** バッジを申請（自動承認・profiles にも反映） */
async function dbApplyForBadge(accountId, badgeType) {
  if (!accountId || !badgeType) return { ok: false };
  const { error: reqErr } = await db.from('badge_requests').upsert({
    account_id  : accountId,
    badge_type  : badgeType,
    status      : 'approved',
    requested_at: new Date().toISOString(),
  }, { onConflict: 'account_id,badge_type' });
  if (reqErr) {
    console.error('[DB] バッジ申請エラー:', reqErr.message, reqErr);
    throw new Error(reqErr.message);
  }
  const col = badgeType === 'verified' ? 'is_verified' : 'is_corporate';
  const { error: profErr } = await db.from('profiles').update({
    [col]: true, updated_at: new Date().toISOString(),
  }).eq('account_id', accountId);
  if (profErr) {
    console.error('[DB] バッジ反映エラー:', profErr.message, profErr);
    throw new Error(profErr.message);
  }
  return { ok: true };
}

/** バッジを削除（取り消し） */
async function dbRemoveBadge(accountId, badgeType) {
  if (!accountId || !badgeType) return { ok: false };
  const { error: reqErr } = await db.from('badge_requests')
    .delete()
    .eq('account_id', accountId)
    .eq('badge_type', badgeType);
  if (reqErr) {
    console.error('[DB] バッジ削除エラー:', reqErr.message, reqErr);
    throw new Error(reqErr.message);
  }
  const col = badgeType === 'verified' ? 'is_verified' : 'is_corporate';
  const { error: profErr } = await db.from('profiles').update({
    [col]: false, updated_at: new Date().toISOString(),
  }).eq('account_id', accountId);
  if (profErr) {
    console.error('[DB] バッジ反映エラー:', profErr.message, profErr);
    throw new Error(profErr.message);
  }
  return { ok: true };
}

/** バッジステータスを取得 → { verified:'approved'|undefined, corporate:... } */
async function dbFetchBadgeStatus(accountId) {
  if (!accountId) return {};
  const { data, error } = await db.from('badge_requests')
    .select('badge_type, status')
    .eq('account_id', accountId);
  if (error) { console.error('[DB] バッジ状態取得エラー:', error.message); return {}; }
  const result = {};
  (data || []).forEach(r => { result[r.badge_type] = r.status; });
  return result;
}

// ══════════════════════════════════════════
// DM設定 (dm_settings)
// ══════════════════════════════════════════

/** DM受信設定を取得（デフォルト: 'all'） */
async function dbFetchDmSettings(accountId) {
  if (!accountId) return 'all';
  const { data, error } = await db.from('dm_settings')
    .select('allow_from').eq('account_id', accountId).maybeSingle();
  if (error) { console.error('[DB] DM設定取得エラー:', error.message); return 'all'; }
  return data?.allow_from || 'all';
}

/** DM受信設定を保存 */
async function dbSaveDmSettings(accountId, allowFrom) {
  if (!accountId) return false;
  const { error } = await db.from('dm_settings').upsert({
    account_id: accountId, allow_from: allowFrom,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id' });
  if (error) { console.error('[DB] DM設定保存エラー:', error.message); return false; }
  return true;
}

// ══════════════════════════════════════════
// DM ルーム + メッセージ
// ══════════════════════════════════════════

/** DM送信可否をチェック（設定 + バッジ + フォロワー確認） */
async function dbCheckDmAllowed(senderId, receiverId) {
  if (!senderId || !receiverId) return { allowed: false, reason: 'invalid' };
  const [allowFrom, senderProfile, followerRes] = await Promise.all([
    dbFetchDmSettings(receiverId),
    dbFetchProfile(senderId),
    db.from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('follower_id', senderId).eq('following_id', receiverId),
  ]);
  const isFollower = (followerRes.count || 0) > 0;
  if (allowFrom === 'none')       return { allowed: false, reason: 'none' };
  if (allowFrom === 'all')        return { allowed: true };
  if (allowFrom === 'followers')  return isFollower ? { allowed: true } : { allowed: false, reason: 'followers_only' };
  if (allowFrom === 'verified')   return senderProfile?.is_verified  ? { allowed: true } : { allowed: false, reason: 'verified_only' };
  if (allowFrom === 'corporate')  return senderProfile?.is_corporate ? { allowed: true } : { allowed: false, reason: 'corporate_only' };
  return { allowed: true };
}

/** DMルームを取得または作成 */
async function dbGetOrCreateDmRoom(myId, otherId) {
  if (!myId || !otherId || myId === otherId) return null;
  const [lower_id, upper_id] = [myId, otherId].sort();
  const { data: existing } = await db.from('dm_rooms')
    .select('id, lower_id, upper_id, last_message, last_at, unread_lower, unread_upper')
    .eq('lower_id', lower_id).eq('upper_id', upper_id).maybeSingle();
  if (existing) return existing;
  const { data, error } = await db.from('dm_rooms')
    .insert({ lower_id, upper_id, created_at: new Date().toISOString() })
    .select().single();
  if (error) { console.error('[DB] DMルーム作成エラー:', error.message); return null; }
  return data;
}

/** 自分のDMルーム一覧を取得（最終メッセージ順） */
async function dbFetchDmRooms(accountId) {
  if (!accountId) return [];
  const { data, error } = await db.from('dm_rooms')
    .select('id, lower_id, upper_id, last_message, last_at, unread_lower, unread_upper')
    .or(`lower_id.eq.${accountId},upper_id.eq.${accountId}`)
    .order('last_at', { ascending: false, nullsFirst: false });
  if (error) { console.error('[DB] DMルーム一覧エラー:', error.message); return []; }
  return data || [];
}

/** DMメッセージ一覧を取得 */
async function dbFetchDmMessages(roomId, limit = 80) {
  if (!roomId) return [];
  const { data, error } = await db.from('direct_messages')
    .select('id, from_id, to_id, body, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) { console.error('[DB] DMメッセージ取得エラー:', error.message); return []; }
  return data || [];
}

/** DMメッセージを送信 */
async function dbSendDmMessage(roomId, fromId, toId, body) {
  if (!roomId || !fromId || !toId || !body?.trim()) return null;
  const bodyTrimmed = body.trim();
  const { data: msg, error: msgErr } = await db.from('direct_messages').insert({
    room_id: roomId, from_id: fromId, to_id: toId,
    body: bodyTrimmed, created_at: new Date().toISOString(),
  }).select().single();
  if (msgErr) { console.error('[DB] DM送信エラー:', msgErr.message); return { _error: msgErr.message }; }
  // ルーム更新
  const [lower_id, upper_id] = [fromId, toId].sort();
  const unreadField = fromId === lower_id ? 'unread_upper' : 'unread_lower';
  const { data: room } = await db.from('dm_rooms').select(unreadField).eq('id', roomId).maybeSingle();
  await db.from('dm_rooms').update({
    last_message: bodyTrimmed.slice(0, 80),
    last_at     : new Date().toISOString(),
    [unreadField]: (room?.[unreadField] || 0) + 1,
  }).eq('id', roomId);
  return msg;
}

/** DMルームを既読にする */
async function dbMarkDmRoomRead(roomId, accountId) {
  if (!roomId || !accountId) return;
  const { data: room } = await db.from('dm_rooms')
    .select('lower_id').eq('id', roomId).maybeSingle();
  if (!room) return;
  const field = room.lower_id === accountId ? 'unread_lower' : 'unread_upper';
  await db.from('dm_rooms').update({ [field]: 0 }).eq('id', roomId);
}

/** DM未読総数を取得 */
async function dbFetchDmUnreadTotal(accountId) {
  if (!accountId) return 0;
  const rooms = await dbFetchDmRooms(accountId);
  return rooms.reduce((sum, r) => {
    return sum + (r.lower_id === accountId ? (r.unread_lower || 0) : (r.unread_upper || 0));
  }, 0);
}

/** dm_rooms のリアルタイム購読（未読数の即時更新用） */
let _dmRoomsChannel = null;
function dbSubscribeDmRooms(accountId, onChange) {
  if (!accountId) return null;
  if (_dmRoomsChannel) {
    db.removeChannel(_dmRoomsChannel);
    _dmRoomsChannel = null;
  }
  _dmRoomsChannel = db.channel('dm-rooms-rt-' + accountId)
    .on('postgres_changes', {
      event : '*',
      schema: 'public',
      table : 'dm_rooms',
    }, payload => {
      const row = payload.new || payload.old || {};
      if (row.lower_id === accountId || row.upper_id === accountId) {
        if (typeof onChange === 'function') onChange();
      }
    })
    .subscribe();
  return _dmRoomsChannel;
}

// ══════════════════════════════════════════
// 利用統計 (user_activity テーブル)
// ══════════════════════════════════════════

/** アクティビティを記録（時間帯別・日別） */
async function dbRecordActivity(accountId, hourOfDay, durationSec) {
  if (!accountId || durationSec <= 0) return;
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await db
    .from('user_activity')
    .select('session_count, duration_seconds')
    .eq('account_id', accountId)
    .eq('activity_date', today)
    .eq('hour_of_day', hourOfDay)
    .maybeSingle();
  const { error } = await db.from('user_activity').upsert({
    account_id      : accountId,
    activity_date   : today,
    hour_of_day     : hourOfDay,
    session_count   : (existing?.session_count   || 0) + 1,
    duration_seconds: (existing?.duration_seconds || 0) + durationSec,
  }, { onConflict: 'account_id,activity_date,hour_of_day' });
  if (error) console.warn('[DB] アクティビティ記録エラー:', error.message);
}

/** 全アクティビティ統計を取得（開発者向け） */
async function dbFetchAllActivityStats() {
  const { data, error } = await db
    .from('user_activity')
    .select('account_id, activity_date, hour_of_day, session_count, duration_seconds')
    .order('activity_date', { ascending: false });
  if (error) { console.error('[DB] アクティビティ統計取得エラー:', error.message); return []; }
  return data || [];
}

async function initSupabase() {
  console.log('[DB] 初期化中...');

  // ⓪ アプリブランドをDBから取得して全端末に反映（差異チェックなし・常に上書き）
  const _config = await dbFetchAppConfig();
  if (_config) {
    appName = _config.app_name || 'Trendy';
    appIcon = _config.app_icon || null;
    if (appName !== 'Trendy') localStorage.setItem('trendy_app_name', appName);
    else localStorage.removeItem('trendy_app_name');
    if (appIcon) localStorage.setItem('trendy_app_icon', appIcon);
    else localStorage.removeItem('trendy_app_icon');
    // バッジアイコン
    if (typeof badgeVerifiedIcon !== 'undefined') {
      badgeVerifiedIcon  = _config.badge_verified_icon  || null;
      badgeCorporateIcon = _config.badge_corporate_icon || null;
      if (badgeVerifiedIcon)  localStorage.setItem('trendy_badge_verified_icon',  badgeVerifiedIcon);
      else                    localStorage.removeItem('trendy_badge_verified_icon');
      if (badgeCorporateIcon) localStorage.setItem('trendy_badge_corporate_icon', badgeCorporateIcon);
      else                    localStorage.removeItem('trendy_badge_corporate_icon');
    }
    if (typeof _applyAppBrand === 'function') _applyAppBrand();
    console.log('[DB] アプリブランドを反映しました:', appName);
  }

  // ① 広告をDBから読み込み
  const ads = await dbLoadAds();
  if (ads.length > 0) {
    const impressions = await dbSyncImpressions();
    Object.assign(adUserShown, impressions);
    renderAdStrip();
    console.log('[DB] 広告を読み込みました:', ads.length, '件');
  }

  // ② フォロー一覧を先に取得（投稿フィルターに使うため）
  const _aid_init = localStorage.getItem('trendy_account_id');
  let _initFollowingHandles = null; // null = 未ログイン（全件表示）
  if (_aid_init && typeof dbFetchFollowing === 'function') {
    _initFollowingHandles = await dbFetchFollowing(_aid_init);
    // app.js 側の followingSet / myFollowingHandles に反映
    if (typeof myFollowingHandles !== 'undefined') {
      myFollowingHandles.splice(0); // 配列をクリア

      // followingSet のダミーデータを先に除去してから実フォローで上書き
      if (typeof followingSet !== 'undefined' && typeof FOLLOWS !== 'undefined') {
        FOLLOWS.forEach(f => followingSet.delete(f.h));
      }

      _initFollowingHandles.forEach(h => {
        myFollowingHandles.push(h);
        if (typeof followingSet !== 'undefined') followingSet.add(h);
      });
    }
    if (_initFollowingHandles.length > 0) {
      console.log('[DB] フォロー一覧:', _initFollowingHandles.length, '件');
    }
  }

  // ③ 投稿をDBから読み込み（フォロー中 + 自分の投稿に絞る）
  await dbLoadAndMergePosts(_initFollowingHandles);

  // ④ 通知をDBから読み込み（ユーザーごとに分離）
  const _aid_notif = localStorage.getItem('trendy_account_id');
  const [mainNotifs, subNotifs] = await Promise.all([
    dbFetchNotifs('main', _aid_notif),
    dbFetchNotifs('sub',  _aid_notif),
  ]);
  NOTIFS.length = 0;
  NOTIFS.push(...mainNotifs);
  NOTIFS_SUB.length = 0;
  NOTIFS_SUB.push(...subNotifs);
  if (typeof renderNotifs === 'function') renderNotifs();
  if (mainNotifs.length || subNotifs.length) {
    console.log('[DB] 通知を読み込みました:', mainNotifs.length, '件（メイン）/', subNotifs.length, '件（サブ）');
  }

  // ⑤ いいね済み投稿 ID を取得（いいね状態をリストア）
  if (_aid_notif) {
    const likedIds = await dbFetchLikedPostIds(_aid_notif);
    if (typeof likedDbIds !== 'undefined') {
      likedDbIds.clear();
      likedIds.forEach(id => likedDbIds.add(id));
    }
    console.log('[DB] いいね済み投稿:', likedIds.length, '件');
  }

  // ⑤-b 閲覧済み投稿 ID を取得（アカウントごとに1回のみカウント）
  if (_aid_notif && typeof dbFetchViewedPostIds === 'function') {
    const viewedIds = await dbFetchViewedPostIds(_aid_notif);
    if (typeof viewedPostIds !== 'undefined') {
      viewedPostIds.clear();
      viewedIds.forEach(id => viewedPostIds.add(id));
    }
    console.log('[DB] 閲覧済み投稿:', viewedIds.length, '件');
  }

  // ⑥ フォロー数・フォロワー数を取得してUIに反映
  if (_aid_notif && typeof dbFetchFollowCounts === 'function') {
    const counts = await dbFetchFollowCounts(_aid_notif);
    if (typeof _updateFollowCountUI === 'function') _updateFollowCountUI(counts.following, counts.followers);
  }

  // ⑦ ログイン済みならSupabaseからプロフィールを同期（クロスオリジン・クロスデバイス対応）
  const _aid = localStorage.getItem('trendy_account_id');
  if (_aid) {
    let profile = await dbFetchProfile(_aid);

    // プロフィール行が存在しない場合（GRANT付与前に登録したユーザーなど）→ 自動作成
    if (profile === null) {
      const _pw = localStorage.getItem('trendy_account_pw');
      if (_pw) {
        console.log('[DB] プロフィール行が存在しません。自動作成します:', _aid);
        try {
          await dbSaveProfile({
            accountId    : _aid,
            passwordHash : _pw,
            nickname     : localStorage.getItem('trendy_myName') || _aid,
            bio          : localStorage.getItem('trendy_bio')    || '',
            isDev        : localStorage.getItem('trendy_isDev') === 'true',
          });
          profile = await dbFetchProfile(_aid);
          // localStorageの画像があればそのままSupabaseへ移行
          const localAv    = localStorage.getItem('trendy_av');
          const localCover = localStorage.getItem('trendy_cover');
          if (localAv)    await dbSaveProfileImage(_aid, 'avatar_data', localAv);
          if (localCover) await dbSaveProfileImage(_aid, 'cover_data',  localCover);
          if (localAv || localCover) {
            profile = await dbFetchProfile(_aid); // 画像込みで再取得
            console.log('[DB] 画像をSupabaseへ移行しました');
          }
        } catch(e) {
          console.warn('[DB] 自動作成に失敗しました:', e.message);
        }
      }
    }

    if (profile) {
      // ── ニックネーム ──
      if (profile.nickname) {
        myNickname = profile.nickname;
        localStorage.setItem('trendy_myName', myNickname);
        if (typeof _applyMyName === 'function') _applyMyName();
      }
      // ── 自己紹介 ──
      if (profile.bio) {
        myBio = profile.bio;
        localStorage.setItem('trendy_bio', myBio);
        const bioEl = document.getElementById('profile-bio-display');
        if (bioEl) { bioEl.textContent = myBio; bioEl.className = ''; }
      }
      // ── 開発者フラグ ──
      isDeveloper = !!profile.is_dev;
      localStorage.setItem('trendy_isDev', isDeveloper ? 'true' : 'false');
      if (typeof _applyDevNav === 'function') _applyDevNav();
      if (typeof _applyMyName === 'function') _applyMyName();
      // ── ハンドル（@ID） ──
      myHandle = '@' + _aid;
      catPickerTargetHandle = myHandle;
      if (typeof _applyMyHandle === 'function') _applyMyHandle();
      // ── 名前タグ ──
      if (profile.name_tag !== undefined && profile.name_tag !== null) {
        myNameTag = profile.name_tag;
        localStorage.setItem('trendy_myNameTag', myNameTag);
        if (typeof _applyNameTag === 'function') _applyNameTag();
        const display  = document.getElementById('profile-name-tag-display');
        const btnLabel = document.getElementById('name-tag-btn-label');
        if (display)  { display.textContent = myNameTag ? '＠' + myNameTag : ''; display.style.display = myNameTag ? '' : 'none'; }
        if (btnLabel) btnLabel.textContent = myNameTag ? 'タグを編集' : 'タグを追加';
      }
      // ── 地域・性別・生年月日 ──
      if (profile.region) {
        localStorage.setItem('trendy_region', profile.region);
        ['settings-region-val','pe-region-val'].forEach(id => {
          const el = document.getElementById(id); if (el) el.textContent = profile.region;
        });
      }
      if (profile.gender) {
        const label = profile.gender === 'male' ? '男性（非公開）' : '女性（非公開）';
        localStorage.setItem('trendy_gender', label);
        ['settings-gender-val','pe-gender-val'].forEach(id => {
          const el = document.getElementById(id); if (el) el.textContent = label;
        });
      }
      if (profile.dob) {
        localStorage.setItem('trendy_dob', profile.dob);
        ['settings-dob-val','pe-dob-val'].forEach(id => {
          const el = document.getElementById(id); if (el) el.textContent = profile.dob;
        });
      }
      // ── アバター画像 ──
      if (profile.avatar_data) {
        // Supabaseに画像あり → ローカルに適用
        localStorage.setItem('trendy_av', profile.avatar_data);
        if (typeof _applyAvImage === 'function') _applyAvImage(profile.avatar_data);
      } else {
        // Supabaseに画像なし → localStorageにあれば自動移行（旧ユーザー対応）
        const localAv = localStorage.getItem('trendy_av');
        if (localAv) {
          dbSaveProfileImage(_aid, 'avatar_data', localAv);
          console.log('[DB] アバター画像をSupabaseへ移行しました');
        }
      }
      // ── カバー画像 ──
      if (profile.cover_data) {
        localStorage.setItem('trendy_cover', profile.cover_data);
        if (typeof _applyCoverImage === 'function') _applyCoverImage(profile.cover_data);
      } else {
        const localCover = localStorage.getItem('trendy_cover');
        if (localCover) {
          dbSaveProfileImage(_aid, 'cover_data', localCover);
          console.log('[DB] カバー画像をSupabaseへ移行しました');
        }
      }
      // ── カテゴリー ──
      if (profile.categories && Array.isArray(profile.categories) && profile.categories.length > 0) {
        if (!USER_PROFILES[myHandle]) USER_PROFILES[myHandle] = { categories: [] };
        USER_PROFILES[myHandle].categories = profile.categories;
        if (typeof renderMyCats === 'function') renderMyCats();
      }
      // 起動時の同期タイムスタンプを記録（フォーカス時の差分同期に使う）
      if (profile.updated_at) {
        localStorage.setItem('trendy_last_sync', profile.updated_at);
      }
      console.log('[DB] プロフィールを同期しました:', _aid);
    }
  }

  console.log('[DB] 初期化完了 ✅');

  // アカウント選択状態を UI に反映（リロード後も正しいボタンがハイライトされる）
  if (typeof selectAccount === 'function' && typeof myAccountType !== 'undefined') {
    selectAccount(myAccountType);
  }
}

// ══════════════════════════════════════════
// お気に入りデータ同期 (user_saved_items)
// ══════════════════════════════════════════

/**
 * お気に入りデータをSupabaseへ保存
 * mediaData(base64)はサイズが大きいため除外して保存する
 */
async function dbSaveFavData(accountId, savedTweets, favFolders, favFolderTypes) {
  if (!accountId) return;
  try {
    // mediaDataだけ除いてスリム化
    const slim = savedTweets.map(s => {
      const { mediaData, ...rest } = s;
      return rest;
    });
    const { error } = await db.from('user_saved_items').upsert({
      account_id      : accountId,
      saved_tweets    : slim,
      fav_folders     : favFolders,
      fav_folder_types: favFolderTypes,
      updated_at      : new Date().toISOString(),
    }, { onConflict: 'account_id' });
    if (error) console.warn('[DB] お気に入り保存エラー:', error.message);
  } catch(e) { console.warn('[DB] お気に入り保存例外:', e); }
}

/**
 * お気に入りデータをSupabaseから読み込み
 * db_idでpostsを一括取得してmediaDataを補完する
 */
async function dbLoadFavData(accountId) {
  if (!accountId) return null;
  try {
    const { data, error } = await db.from('user_saved_items')
      .select('saved_tweets, fav_folders, fav_folder_types, updated_at')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error || !data) return null;

    // postsからmediaDataを一括補完
    const dbIds = (data.saved_tweets || []).map(s => s.db_id).filter(Boolean);
    if (dbIds.length > 0) {
      const { data: posts } = await db.from('posts')
        .select('id, media_data, media_type, content, likes_count, views_count')
        .in('id', dbIds);
      if (posts) {
        const pm = {};
        posts.forEach(p => { pm[String(p.id)] = p; });
        data.saved_tweets = (data.saved_tweets || []).map(s => {
          const p = pm[String(s.db_id)];
          if (!p) return s;
          return {
            ...s,
            mediaData : p.media_data  || s.mediaData || null,
            mediaType : s.mediaType   || p.media_type || null,
            text      : s.text        || p.content   || '',
            likes     : p.likes_count || s.likes     || 0,
            views     : p.views_count || s.views     || 0,
          };
        });
      }
    }
    return data;
  } catch(e) {
    console.warn('[DB] お気に入り読み込み例外:', e);
    return null;
  }
}

// ══════════════════════════════════════════
// ユーザー告知 (user_announcements)
// ══════════════════════════════════════════

/** ユーザー告知を送信（user_announcements テーブル） */
async function dbSendUserAnnouncement(senderId, title, message, type = 'general') {
  if (!senderId || !title || !message) return { ok: false, msg: 'パラメータ不足: ' + JSON.stringify({senderId,title,message}) };
  const { error } = await db.from('user_announcements').insert({
    sender_id : senderId,
    title,
    message,
    type,
  });
  if (error) { console.error('[DB] 告知送信エラー:', error.message); return { ok: false, msg: error.message }; }
  return { ok: true };
}

/** フォロー中ユーザーの告知を取得（notify_enabled=trueのみ） */
async function dbFetchFollowingAnnouncements(myAccountId, limit = 30) {
  if (!myAccountId) return [];
  // notify_enabled が true または NULL（デフォルトON）のフォロー先を取得
  const { data: follows } = await db
    .from('follows')
    .select('following_id')
    .eq('follower_id', myAccountId)
    .neq('notify_enabled', false);
  if (!follows || follows.length === 0) return [];
  const senderIds = follows.map(f => f.following_id);
  const { data, error } = await db
    .from('user_announcements')
    .select('*')
    .in('sender_id', senderIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('[DB] 告知取得エラー:', error.message); return []; }
  return data || [];
}

/** 特定ユーザーの過去告知を取得 */
async function dbFetchUserAnnouncements(targetAccountId, limit = 10) {
  if (!targetAccountId) return [];
  const { data, error } = await db
    .from('user_announcements')
    .select('*')
    .eq('sender_id', targetAccountId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('[DB] ユーザー告知取得エラー:', error.message); return []; }
  return data || [];
}

/** フォロー通知設定を更新 */
async function dbSetFollowNotify(myAccountId, targetId, enabled) {
  if (!myAccountId || !targetId) return false;
  const { error } = await db.from('follows')
    .update({ notify_enabled: enabled })
    .eq('follower_id', myAccountId)
    .eq('following_id', targetId);
  if (error) { console.error('[DB] 通知設定エラー:', error.message); return false; }
  return true;
}

/** フォロー通知状態を取得 */
async function dbGetFollowNotifyStatus(myAccountId, targetId) {
  if (!myAccountId || !targetId) return true;
  const { data } = await db.from('follows')
    .select('notify_enabled')
    .eq('follower_id', myAccountId)
    .eq('following_id', targetId)
    .maybeSingle();
  if (!data) return true; // フォローしていない or デフォルト
  return data.notify_enabled !== false;
}

/** user_announcements のリアルタイム購読を開始 */
let _announcementsChannel = null;
function dbSubscribeAnnouncements(onNewAnnouncement) {
  if (_announcementsChannel) {
    db.removeChannel(_announcementsChannel);
    _announcementsChannel = null;
  }
  _announcementsChannel = db.channel('user-announcements-rt')
    .on('postgres_changes', {
      event  : 'INSERT',
      schema : 'public',
      table  : 'user_announcements',
    }, payload => {
      if (typeof onNewAnnouncement === 'function') onNewAnnouncement(payload.new);
    })
    .subscribe();
  return _announcementsChannel;
}


// ── サポーター ──────────────────────────────────────────
async function dbGetSupporterProfile(accountId) {
  if (!accountId) return null;
  const { data } = await db.from('supporter_profiles').select('*').eq('account_id', accountId).maybeSingle();
  return data || null;
}

async function dbUpsertSupporterProfile(accountId, fields) {
  if (!accountId) return false;
  const { error } = await db.from('supporter_profiles').upsert(
    { account_id: accountId, ...fields, updated_at: new Date().toISOString() },
    { onConflict: 'account_id' }
  );
  if (error) { console.error('[DB] サポーター更新エラー:', error.message); return false; }
  return true;
}

async function dbGetSupporterTastes(accountId) {
  if (!accountId) return null;
  const { data } = await db.from('supporter_tastes').select('*').eq('account_id', accountId).maybeSingle();
  return data || null;
}

async function dbUpsertSupporterTastes(accountId, tagWeights, catWeights) {
  if (!accountId) return false;
  const { error } = await db.from('supporter_tastes').upsert(
    { account_id: accountId, tag_weights: tagWeights, cat_weights: catWeights, updated_at: new Date().toISOString() },
    { onConflict: 'account_id' }
  );
  if (error) { console.error('[DB] サポーター好み更新エラー:', error.message); return false; }
  return true;
}

/** サポーターデータを全削除（リセット） */
async function dbResetSupporter(accountId) {
  if (!accountId) return false;
  const [r1, r2, r3] = await Promise.all([
    db.from('supporter_profiles').delete().eq('account_id', accountId),
    db.from('supporter_tastes').delete().eq('account_id', accountId),
    db.from('supporter_picks').delete().eq('account_id', accountId),
  ]);
  const err = r1.error || r2.error || r3.error;
  if (err) { console.error('[DB] サポーターリセットエラー:', err.message); return false; }
  return true;
}

/** 全サポーター一覧取得（開発者用） */
async function dbDevFetchAllSupporters() {
  const { data, error } = await db.from('supporter_profiles').select('account_id,name,personality,level').order('created_at', { ascending: false });
  if (error) { console.error('[DB] サポーター一覧エラー:', error.message); return []; }
  return data || [];
}

/** EXPを加算してレベルアップ処理まで行う */
async function dbAddSupporterExp(accountId, amount) {
  if (!accountId || amount <= 0) return null;
  const profile = await dbGetSupporterProfile(accountId);
  if (!profile || !profile.is_active) return null;

  let { level, exp } = profile;
  exp += amount;
  const leveledUp = [];
  while (exp >= level * 20) {   // Lv N→N+1 に必要な EXP = N×20
    exp -= level * 20;
    level++;
    leveledUp.push(level);
  }
  await dbUpsertSupporterProfile(accountId, { level, exp });
  return { level, exp, leveledUp };
}

// ── ピークポイント ──────────────────────────────────────
async function dbGetMyPoints(accountId) {
  if (!accountId) return { points: 0, total_earned: 0 };
  const { data } = await db.from('peak_points').select('points,total_earned').eq('account_id', accountId).maybeSingle();
  return data || { points: 0, total_earned: 0 };
}
async function dbAddPoints(accountId, amount) {
  if (!accountId || amount <= 0) return { ok: false, error: '無効なパラメータ' };
  const cur = await dbGetMyPoints(accountId);
  const newPoints = (cur.points || 0) + amount;
  const newTotal  = (cur.total_earned || 0) + amount;
  const { error } = await db.from('peak_points').upsert({
    account_id  : accountId,
    points      : newPoints,
    total_earned: newTotal,
    updated_at  : new Date().toISOString(),
  }, { onConflict: 'account_id' });
  if (error) {
    console.error('[DB] ポイント加算エラー:', error.message, '| code:', error.code);
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: true, points: newPoints };
}
async function dbUsePoints(accountId, amount) {
  if (!accountId || amount <= 0) return false;
  const cur = await dbGetMyPoints(accountId);
  if ((cur.points || 0) < amount) return false;
  await db.from('peak_points').upsert({
    account_id: accountId,
    points: cur.points - amount,
    total_earned: cur.total_earned || 0,
    updated_at: new Date().toISOString()
  }, { onConflict: 'account_id' });
  return true;
}
async function dbProcessReferral(referrerId, newUserId) {
  if (!referrerId || !newUserId || referrerId === newUserId) return;
  const { data: dup } = await db.from('referral_records').select('id').eq('referred_id', newUserId).maybeSingle();
  if (dup) return;
  const { data: refProf } = await db.from('profiles').select('referrer_id').eq('account_id', referrerId).maybeSingle();
  const grandRef = refProf?.referrer_id;
  await db.from('referral_records').insert({ referrer_id: referrerId, referred_id: newUserId, level: 1, points_awarded: 100 });
  await dbAddPoints(referrerId, 100);
  if (grandRef && grandRef !== newUserId && grandRef !== referrerId) {
    await db.from('referral_records').insert({ referrer_id: grandRef, referred_id: newUserId, level: 2, points_awarded: 100 });
    await dbAddPoints(grandRef, 100);
  }
  await db.from('profiles').update({ referrer_id: referrerId }).eq('account_id', newUserId);
}
async function dbGetMyReferrals(accountId) {
  if (!accountId) return [];
  const { data } = await db.from('referral_records')
    .select('referred_id,level,points_awarded,created_at')
    .eq('referrer_id', accountId)
    .order('created_at', { ascending: false });
  return data || [];
}
// ── 広告キャンペーン ───────────────────────────────────
async function dbCreateAdCampaign(data) {
  const { data: row, error } = await db.from('ad_campaigns').insert(data).select().single();
  if (error) {
    console.error('[DB] 広告作成エラー:', error.message, '| code:', error.code);
    return { _error: error.message, _code: error.code };
  }
  return row;
}
async function dbGetMyCampaigns(accountId) {
  if (!accountId) return [];
  const { data } = await db.from('ad_campaigns').select('*').eq('account_id', accountId).order('created_at', { ascending: false });
  return data || [];
}
async function dbTrackAdImpression(campaignId, viewerId, vInfo = {}) {
  if (!campaignId || !viewerId) return;
  const since = new Date(Date.now() - 86400000).toISOString();
  const { data: dup } = await db.from('ad_impressions').select('id').eq('campaign_id', campaignId).eq('viewer_id', viewerId).gte('viewed_at', since).maybeSingle();
  if (dup) return;
  await db.from('ad_impressions').insert({ campaign_id: campaignId, viewer_id: viewerId, viewer_gender: vInfo.gender || null, viewer_region: vInfo.region || null, viewer_dob: vInfo.dob || null });
}
async function dbTrackAdClick(campaignId, viewerId) {
  if (!campaignId || !viewerId) return;
  await db.from('ad_clicks').insert({ campaign_id: campaignId, viewer_id: viewerId });
}
async function dbGetCampaignReport(campaignId) {
  if (!campaignId) return null;
  const [c, i, k] = await Promise.all([
    db.from('ad_campaigns').select('*').eq('id', campaignId).maybeSingle(),
    db.from('ad_impressions').select('viewer_gender,viewer_region,viewer_dob,viewed_at').eq('campaign_id', campaignId),
    db.from('ad_clicks').select('clicked_at').eq('campaign_id', campaignId),
  ]);
  return { campaign: c.data, impressions: i.data || [], clicks: k.data || [] };
}
async function dbGetActiveAdCampaigns(limit = 50) {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await db.from('ad_campaigns')
    .select('*').eq('status', 'active')
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('daily_budget', { ascending: false }).limit(limit);
  return data || [];
}

// ── 意見箱 (feedback_opinions / feedback_votes) ─────────

/** 意見一覧を取得（最大200件） */
async function dbFetchOpinions() {
  const { data, error } = await db.from('feedback_opinions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) { console.error('[DB] 意見取得エラー:', error.message); return []; }
  return data || [];
}

/** 意見を投稿 */
async function dbSubmitOpinion({ title, text, category, accountId, nickname, isAnon }) {
  const { data, error } = await db.from('feedback_opinions').insert({
    title,
    text:       text || '',
    category:   category || 'その他',
    account_id: isAnon ? null : (accountId || null),
    nickname:   isAnon ? '匿名' : (nickname || '匿名'),
    is_anon:    isAnon || false,
    likes:      0,
    dislikes:   0,
  }).select().single();
  if (error) { console.error('[DB] 意見投稿エラー:', error.message); return null; }
  return data;
}

/** 自分の投票状態を取得 → { opinion_id: 'like'|'dislike' } */
async function dbGetMyVotes(accountId) {
  if (!accountId) return {};
  const { data, error } = await db.from('feedback_votes')
    .select('opinion_id, vote_type')
    .eq('account_id', accountId);
  if (error) return {};
  const map = {};
  (data || []).forEach(v => { map[v.opinion_id] = v.vote_type; });
  return map;
}

/** 投票（いいね/よくない）を切り替え。返値 { likes, dislikes, myVote } */
async function dbVoteOpinion(accountId, opinionId, voteType) {
  if (!accountId || !opinionId) return null;

  // 現在の自分の投票を確認
  const { data: existing } = await db.from('feedback_votes')
    .select('vote_type')
    .eq('account_id', accountId)
    .eq('opinion_id', opinionId)
    .maybeSingle();
  const prev    = existing?.vote_type || null;
  const newVote = (voteType === prev) ? null : voteType; // 同じボタン→解除

  // feedback_votes を更新
  if (newVote === null) {
    await db.from('feedback_votes')
      .delete()
      .eq('account_id', accountId)
      .eq('opinion_id', opinionId);
  } else {
    await db.from('feedback_votes').upsert(
      { account_id: accountId, opinion_id: opinionId, vote_type: newVote },
      { onConflict: 'account_id,opinion_id' }
    );
  }

  // 集計してカウントを更新
  const { data: votes } = await db.from('feedback_votes')
    .select('vote_type')
    .eq('opinion_id', opinionId);
  const likes    = (votes || []).filter(v => v.vote_type === 'like').length;
  const dislikes = (votes || []).filter(v => v.vote_type === 'dislike').length;
  await db.from('feedback_opinions').update({ likes, dislikes }).eq('id', opinionId);

  return { likes, dislikes, myVote: newVote };
}

/** ステータスを設定（isDeveloper 専用） */
async function dbSetOpinionStatus(opinionId, status) {
  const { error } = await db.from('feedback_opinions')
    .update({ status: status || null })
    .eq('id', opinionId);
  if (error) { console.error('[DB] ステータス更新エラー:', error.message); return false; }
  return true;
}

/** 意見を削除（isDeveloper 専用）— 投票レコードも同時に削除 */
async function dbDeleteOpinion(opinionId) {
  // 投票を先に削除（外部キー制約がある場合に備え）
  await db.from('feedback_votes').delete().eq('opinion_id', opinionId);
  const { error } = await db.from('feedback_opinions').delete().eq('id', opinionId);
  if (error) { console.error('[DB] 意見削除エラー:', error.message); return false; }
  return true;
}

// ── 検索 ──────────────────────────────────────────────

/** アカウントを検索（nickname / account_id 部分一致） */
async function dbSearchProfiles(query, limit = 20) {
  if (!query) return [];
  const q = query.replace(/^@/, '').trim();
  const { data, error } = await db.from('profiles')
    .select('account_id, nickname, avatar_data, bio')
    .or(`nickname.ilike.%${q}%,account_id.ilike.%${q}%`)
    .limit(limit);
  if (error) { console.error('[DB] アカウント検索エラー:', error.message); return []; }
  return data || [];
}

/** つぶやきを検索（content 部分一致） */
async function dbSearchPosts(query, limit = 30) {
  if (!query) return [];
  const { data, error } = await db.from('posts')
    .select('id, content, user_handle, user_name, created_at, likes_count, views_count, media_type, media_data, is_sub, name_tag, cat_id, tags, link_url, image_link_url, ai_type, rt_count')
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('[DB] つぶやき検索エラー:', error.message); return []; }
  return data || [];
}
