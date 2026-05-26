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

/** 新規登録時にプロフィールをSupabaseへ保存 */
async function dbSaveProfile({ accountId, passwordHash, nickname, bio, isDev }) {
  const { data, error } = await db.from('profiles').upsert({
    account_id    : accountId,
    password_hash : passwordHash,
    nickname      : nickname || accountId,
    bio           : bio      || '',
    is_dev        : isDev    || false,
    updated_at    : new Date().toISOString(),
  }, { onConflict: 'account_id' }).select().single();
  if (error) { console.error('[DB] プロフィール保存エラー:', error.message); return null; }
  console.log('[DB] プロフィールを保存しました:', accountId);
  return data;
}

/** accountId でプロフィールを取得（ログイン認証用） */
async function dbFetchProfile(accountId) {
  const { data, error } = await db.from('profiles')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) { console.error('[DB] プロフィール取得エラー:', error.message); return null; }
  return data;
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
async function dbSavePost({ handle, name, isSub, content, aiType, mediaData, mediaType, nameTag, catId, tags }) {
  // 画像は Supabase 保存前に圧縮（容量削減）
  let finalMedia = mediaData || null;
  if (mediaData && mediaType === 'image' && typeof _compressImage === 'function') {
    try { finalMedia = await _compressImage(mediaData, 1080, 1080, 0.82); } catch(e) { /* 圧縮失敗時はそのまま */ }
  }
  const { data, error } = await db.from('posts').insert({
    user_handle : handle    || '@you',
    user_name   : name      || 'あなた',
    is_sub      : isSub     || false,
    content,
    ai_type     : aiType    || 'none',
    media_data  : finalMedia,
    media_type  : mediaType || '',
    name_tag    : nameTag   || '',
    cat_id      : catId     || '',
    tags        : tags      || [],
  }).select().single();
  if (error) { console.error('[DB] 投稿保存エラー:', error.message); return null; }
  console.log('[DB] 投稿を保存しました:', data.id);
  return data;
}

/**
 * ランキング用投稿をSupabaseから取得
 * @param {object} opts - { period:'daily'|'weekly'|'monthly', catId, subTag, mode:'ranking'|'new'|'rec', limit }
 */
async function dbFetchRankedPosts({ period = 'daily', catId = null, subTag = null, mode = 'ranking', limit = 300 } = {}) {
  const now = new Date();
  const periodMs = { daily: 86400000, weekly: 604800000, monthly: 2592000000 };
  const startDate = new Date(now - (periodMs[period] || periodMs.daily));

  let query = db.from('posts')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .limit(limit);

  if (catId && catId !== 'all') query = query.eq('cat_id', catId);

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
  if (aid) myHandles.push('@' + aid);

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
      .select('account_id, avatar_data, nickname')
      .in('account_id', allAccountIds);
    (profiles || []).forEach(prof => {
      avatarMap['@' + prof.account_id] = prof.avatar_data
        ? `<img src="${prof.avatar_data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : null;
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
        h      : p.user_handle,
        n      : p.user_name,
        av     : avImg || _fallbackName[0].toUpperCase(),
        bg     : isMyPost ? '#dbeafe' : '#3b82f6',
        tc     : isMyPost ? '#1e40af' : '#ffffff',
        sub    : p.is_sub,
        // 自分の投稿は現在の名前タグをフォールバック（name_tag列追加前の投稿対応）
        nameTag: p.name_tag || (isMyPost ? myNameTag : null) || null,
      },
      tags     : Array.isArray(p.tags) ? p.tags : [],
      mediaData: p.media_data  || null,
      mediaType: p.media_type  || null,
      catId    : p.cat_id      || null,
      rank     : 0,
      isDummy  : false,
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
async function dbToggleLike(postDbId, accountId, nowLiked, postAuthorHandle) {
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
    // 推しレベル更新（投稿者が分かっている場合のみ）
    if (postAuthorHandle) {
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
// 現在のユーザーの通知を全削除（testReset 用）
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

/** アプリ設定を取得（サービス名・アイコン） */
async function dbFetchAppConfig() {
  const { data, error } = await db
    .from('app_config')
    .select('app_name, app_icon')
    .eq('id', 'main')
    .maybeSingle();
  if (error) { console.warn('[DB] アプリ設定取得エラー:', error.message); return null; }
  return data;
}

/** アプリ設定を保存（開発者のみ実行） */
async function dbSaveAppConfig(name, icon) {
  console.log('[DB] アプリ設定保存中... name:', name, '/ icon:', icon ? '(データあり ' + Math.round((icon.length * 0.75)/1024) + 'KB)' : '(なし)');
  const { error } = await db.from('app_config').upsert({
    id         : 'main',
    app_name   : name || 'Trendy',
    app_icon   : icon !== undefined ? icon : null,
    updated_at : new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) {
    console.error('[DB] アプリ設定保存エラー:', error.message, error);
    throw new Error(error.message);
  }
  console.log('[DB] アプリ設定を保存しました ✅ name:', name);
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
    if (!profile) {
      const _pw = localStorage.getItem('trendy_account_pw');
      if (_pw) {
        console.log('[DB] プロフィール行が存在しません。自動作成します:', _aid);
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
}
