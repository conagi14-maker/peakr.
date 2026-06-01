// Netlify Function: pixiv デイリーランキング取得プロキシ
// pixiv は CORS + Referer 制限があるためサーバーサイドで取得する

const PIXIV_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://www.pixiv.net/',
  'Accept': 'application/json, text/javascript, */*',
  'Accept-Language': 'ja,en;q=0.9',
};

async function fetchPage(page) {
  const url = `https://www.pixiv.net/ranking.php?mode=daily&content=illust&p=${page}&format=json`;
  const res = await fetch(url, { headers: PIXIV_HEADERS });
  if (!res.ok) throw new Error('pixiv HTTP ' + res.status);
  const data = await res.json();
  return data.contents || [];
}

exports.handler = async () => {
  try {
    // 4ページ並行取得（各50件 × 4 = 200件）
    const pages = await Promise.all([1, 2, 3, 4].map(fetchPage));
    const allContents = pages.flat();

    const items = allContents.map((item, i) => {
      const thumb = (item.url || '').replace('https://i.pximg.net', 'https://i.pixiv.re');
      return {
        rank      : i + 1,
        illust_id : item.illust_id,
        title     : item.title     || '',
        author    : item.user_name || '',
        author_id : item.user_id,
        url       : `https://www.pixiv.net/artworks/${item.illust_id}`,
        thumb,
        tags      : Array.isArray(item.tags) ? item.tags : [],
        bookmarks : item.rating_count || 0,
        views     : item.view_count  || 0,
      };
    });

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
