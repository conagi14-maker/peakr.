// Netlify Function: YouTube Shorts 人気動画取得
// search.list (100ユニット) + videos.list (1ユニット) = 約101ユニット/回

exports.handler = async () => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'API key not set' }) };

  try {
    // ① Shorts を検索（#shorts タグ + 短尺フィルター）
    const searchParams = new URLSearchParams({
      part       : 'snippet',
      q          : '#shorts',
      type       : 'video',
      videoDuration: 'short',
      order      : 'viewCount',
      regionCode : 'JP',
      maxResults : '50',
      key        : apiKey,
    });
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams}`
    );
    if (!searchRes.ok) throw new Error('search HTTP ' + searchRes.status);
    const searchData = await searchRes.json();

    const videoIds = (searchData.items || [])
      .map(item => item.id?.videoId)
      .filter(Boolean)
      .join(',');

    if (!videoIds) return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [] }) };

    // ② 統計情報・サムネイルを取得
    const detailParams = new URLSearchParams({
      part      : 'snippet,statistics',
      id        : videoIds,
      key       : apiKey,
    });
    const detailRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${detailParams}`
    );
    if (!detailRes.ok) throw new Error('videos HTTP ' + detailRes.status);
    const detailData = await detailRes.json();

    const items = (detailData.items || []).map((v, i) => {
      const sn    = v.snippet    || {};
      const stats = v.statistics || {};
      // Shorts のサムネイルは maxres または high を優先
      const thumb = sn.thumbnails?.maxres?.url
        || sn.thumbnails?.high?.url
        || sn.thumbnails?.medium?.url
        || sn.thumbnails?.default?.url
        || '';
      return {
        rank     : i + 1,
        video_id : v.id,
        title    : sn.title         || '',
        channel  : sn.channelTitle  || '',
        url      : `https://www.youtube.com/shorts/${v.id}`,
        embed_url: `https://www.youtube.com/embed/${v.id}?loop=1&playlist=${v.id}&rel=0`,
        thumb,
        views    : parseInt(stats.viewCount || '0', 10),
        likes    : parseInt(stats.likeCount || '0', 10),
        tags     : Array.isArray(sn.tags) ? sn.tags.slice(0, 5) : [],
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type' : 'application/json',
        'Cache-Control': 'public, max-age=3600', // 1時間キャッシュ（APIユニット節約）
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ items }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
