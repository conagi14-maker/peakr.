// Netlify Function: YouTube 急上昇動画取得
// YOUTUBE_API_KEY を Netlify 環境変数に設定してください

// YouTube カテゴリID → PEAKR カテゴリ（大まかな分類のみ。細かい判定はクライアント側キーワードマッチングに委ねる）
const YT_CAT_MAP = {
  '10': 'music',    // Music
  '20': 'game',     // Gaming
  '25': 'politics', // News & Politics
};

async function fetchPage(apiKey, pageToken) {
  const params = new URLSearchParams({
    part      : 'snippet,statistics',
    chart     : 'mostPopular',
    regionCode: 'JP',
    maxResults: '50',
    key       : apiKey,
    ...(pageToken ? { pageToken } : {}),
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  if (!res.ok) throw new Error('YouTube API HTTP ' + res.status);
  return res.json();
}

exports.handler = async () => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'API key not set' }) };

  try {
    const items = [];
    let pageToken = null;

    // 最大4ページ（50件×4 = 200件）
    for (let i = 0; i < 4; i++) {
      const data = await fetchPage(apiKey, pageToken);
      for (const v of (data.items || [])) {
        const sn    = v.snippet     || {};
        const stats = v.statistics  || {};
        const catId = YT_CAT_MAP[sn.categoryId] || 'video';
        items.push({
          rank      : items.length + 1,
          video_id  : v.id,
          title     : sn.title            || '',
          channel   : sn.channelTitle     || '',
          url       : `https://www.youtube.com/watch?v=${v.id}`,
          thumb     : sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || '',
          views     : parseInt(stats.viewCount  || '0', 10),
          likes     : parseInt(stats.likeCount  || '0', 10),
          cat_id    : catId,
          tags      : Array.isArray(sn.tags) ? sn.tags.slice(0, 5) : [],
          published : sn.publishedAt || '',
        });
      }
      pageToken = data.nextPageToken || null;
      if (!pageToken) break;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type' : 'application/json',
        'Cache-Control': 'public, max-age=600',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ items }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
