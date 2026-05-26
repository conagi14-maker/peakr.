// ── Opinions Data (意見箱) ─────────────────────────────
const OPINIONS_DATA = [
  { id:1,  title:'ダークモードの追加',               text:'夜間に使う時に目が疲れるので、ダークモードを実装してほしいです。',                                   category:'機能要望', user:{n:'たろう',  h:'@taro',   av:'た', bg:'#dbeafe', tc:'#1e40af'}, time:'2時間前',  likes:24, dislikes:2,  status:'検討中'  },
  { id:2,  title:'投稿の編集機能',                   text:'一度投稿したつぶやきを後から編集できるようにしてほしい。誤字が多くて困っています。',                 category:'機能要望', user:{n:'はなこ',  h:'@hanako', av:'は', bg:'#d1fae5', tc:'#065f46'}, time:'5時間前',  likes:18, dislikes:5,  status:'対応予定' },
  { id:3,  title:'フォロー通知が多すぎる',           text:'フォロー通知をまとめてくれると助かります。一度に50件来た時は困りました。',                         category:'UIの改善', user:{n:'けんじ',  h:'@kenji',  av:'け', bg:'#fce7f3', tc:'#be185d'}, time:'1日前',    likes:15, dislikes:1,  status:null      },
  { id:4,  title:'カテゴリーのキーワード検索',       text:'気になるカテゴリーをキーワードで検索できるようにしてほしい。カテゴリーが多くて見つけにくい。',       category:'機能要望', user:{n:'ゆうき',  h:'@yuki',   av:'ゆ', bg:'#ede9fe', tc:'#5b21b6'}, time:'2日前',    likes:12, dislikes:3,  status:null      },
  { id:5,  title:'動画の自動再生をオフにしたい',     text:'タイムラインで動画が自動再生されて困ります。設定でオフにできるようにしてください。',               category:'UIの改善', user:{n:'みゆ',    h:'@miyu',   av:'み', bg:'#fef3c7', tc:'#92400e'}, time:'3日前',    likes:31, dislikes:4,  status:'実装済み' },
  { id:6,  title:'過去ランキングのアーカイブ',       text:'先月・先週のランキングを振り返れるようにしてほしい。記録として残しておきたいです。',               category:'機能要望', user:{n:'りく',    h:'@riku',   av:'り', bg:'#dcfce7', tc:'#16a34a'}, time:'4日前',    likes:9,  dislikes:2,  status:null      },
  { id:7,  title:'画像が表示されないバグ',           text:'iPhoneで使っていると、たまに画像が白くなります。再読み込みすると直りますが毎回困っています。',     category:'バグ報告', user:{n:'さくら',  h:'@sakura', av:'さ', bg:'#fee2e2', tc:'#991b1b'}, time:'5日前',    likes:7,  dislikes:0,  status:'検討中'  },
  { id:8,  title:'DM（ダイレクトメッセージ）機能',   text:'フォロー中の人と個別にやり取りできるDM機能があると便利だと思います。',                           category:'機能要望', user:{n:'あおい',  h:'@aoi',    av:'あ', bg:'#e0f2fe', tc:'#0369a1'}, time:'1週間前',  likes:42, dislikes:6,  status:'検討中'  },
  { id:9,  title:'投稿にカテゴリータグを付けたい',   text:'つぶやき投稿時にカテゴリーを指定できたら、見つけてもらいやすくなると思います。',                   category:'機能要望', user:{n:'まこと',  h:'@makoto', av:'ま', bg:'#fdf4ff', tc:'#7e22ce'}, time:'1週間前',  likes:21, dislikes:3,  status:null      },
  { id:10, title:'ランキング通知のカスタマイズ',     text:'何位以内に入ったときだけ通知する設定が欲しいです。TOP50だけなど指定できると嬉しい。',               category:'機能要望', user:{n:'なな',    h:'@nana',   av:'な', bg:'#fff7ed', tc:'#9a3412'}, time:'2週間前',  likes:16, dislikes:1,  status:null      },
];

// ── Ad Data ────────────────────────────────────────────
// budget = 課金額（ランキング順位の基準）
// maxPerUser = 1人あたり最大表示回数（達したらそのユーザーには非表示）
// catId = 掲載カテゴリー（'all'=全体, それ以外はカテゴリーID）
const ADS_DATA = [
  { id:1, advertiser:'株式会社トレンド',    text:'新春セール開催中！最大50%OFF',                  budget:50000, maxPerUser:2, catId:'all',     bg:'#dbeafe', tc:'#1e40af' },
  { id:2, advertiser:'ゲームスタジオXY',    text:'新作RPGリリース！今すぐDL♟',                    budget:38000, maxPerUser:2, catId:'game',    bg:'#ede9fe', tc:'#5b21b6' },
  { id:3, advertiser:'@fashion_mika',       text:'私のハンドメイドショップ見てね♥',               budget:12000, maxPerUser:2, catId:'fashion', bg:'#fce7f3', tc:'#be185d' },
  { id:4, advertiser:'フードデリバリーABC', text:'初回注文500円引き！今すぐ注文',                  budget:8500,  maxPerUser:2, catId:'food',    bg:'#d1fae5', tc:'#065f46' },
  { id:5, advertiser:'@tech_blog_k',        text:'プログラミング講座を無料公開中📚',               budget:5000,  maxPerUser:2, catId:'tech',    bg:'#fef3c7', tc:'#92400e' },
  { id:6, advertiser:'旅行代理店たびたび',  text:'沖縄ツアー最安値を毎日更新中！',                budget:3200,  maxPerUser:2, catId:'travel',  bg:'#f0fdf4', tc:'#166534' },
  { id:7, advertiser:'@music_studio_r',     text:'DTM初心者向け動画チャンネル🎵',                 budget:1800,  maxPerUser:2, catId:'music',   bg:'#fff7ed', tc:'#9a3412' },
  { id:8, advertiser:'コスメブランドLUX',   text:'敏感肌専用スキンケア新発売✨',                   budget:980,   maxPerUser:2, catId:'fashion', bg:'#fdf4ff', tc:'#7e22ce' },
  // ── サブカテゴリー向け広告（subName を指定）──
  { id:9,  advertiser:'アニメグッズ本舗',    text:'ウマ娘フィギュア新作予約受付中🐴✨',      budget:25000, maxPerUser:2, catId:'anime',    subName:'ウマ娘',        bg:'#fef9c3', tc:'#a16207' },
  { id:10, advertiser:'ドラえもん公式Shop', text:'映画ドラえもん新作グッズ好評発売中！',    budget:22000, maxPerUser:2, catId:'anime',    subName:'ドラえもん',    bg:'#dbeafe', tc:'#1e40af' },
  { id:11, advertiser:'ポケモンセンター',   text:'新作ポケモンカード先行販売中🎴',          budget:20000, maxPerUser:2, catId:'game',     subName:'ポケモン',      bg:'#fef9c3', tc:'#b45309' },
  { id:12, advertiser:'モンハングッズ',     text:'ワイルズ公式コラボグッズ入荷🗡',          budget:16000, maxPerUser:2, catId:'game',     subName:'モンハン',      bg:'#fef2f2', tc:'#b91c1c' },
  { id:13, advertiser:'ボカロフェス事務局', text:'ボカロフェス2026チケット発売中🎤',         budget:14000, maxPerUser:2, catId:'music',    subName:'ボカロ',        bg:'#f3e8ff', tc:'#7e22ce' },
  { id:14, advertiser:'Vtuber応援グッズ',   text:'推しの公式グッズ最新ラインナップ💙',       budget:11000, maxPerUser:2, catId:'music',    subName:'Vtuber',        bg:'#fce7f3', tc:'#be185d' },
  { id:15, advertiser:'コナングッズ公式',   text:'名探偵コナン最新映画公開中🔍',            budget:9500,  maxPerUser:2, catId:'anime',    subName:'コナン',        bg:'#dbeafe', tc:'#1e3a8a' },
  { id:16, advertiser:'原神公式',           text:'原神・新イベント開催中！ログインボーナス🎁',budget:8000,  maxPerUser:2, catId:'game',     subName:'原神',          bg:'#e0f2fe', tc:'#0369a1' },
  { id:17, advertiser:'漫画サブスクPlus',   text:'人気漫画が読み放題！初月無料📖',          budget:18000, maxPerUser:2, catId:'manga',                              bg:'#f0fdf4', tc:'#15803d' },
  { id:18, advertiser:'動画編集Pro',        text:'プロ級の動画編集ソフトを無料体験🎬',      budget:7500,  maxPerUser:2, catId:'video',                              bg:'#fdf4ff', tc:'#7c3aed' },
];

// ── Data ──────────────────────────────────────────────
const CATS_DATA = [
  { id:'all', name:'全て', icon:'ti-stars', color:'#0f172a', bar:'#334155',
    subs:['全体'],
    allSubs:[
      {name:'イラスト/アニメ',trend:'up',score:99},{name:'漫画',trend:'up',score:95},
      {name:'ゲーム',trend:'same',score:92},{name:'音楽',trend:'up',score:88},
      {name:'動画',trend:'same',score:84},{name:'つぶやき',trend:'up',score:78},
      {name:'政治',trend:'down',score:65},
    ],
  },
  { id:'anime',  name:'イラスト/アニメ', icon:'ti-palette',         color:'#5b21b6', bar:'#7c3aed',
    subs:['全体','ドラえもん','ウマ娘','コナン','ハルヒ'],
    allSubs:[
      {name:'ドラえもん',trend:'up',score:98},{name:'ハルヒの憂鬱',trend:'up',score:91},
      {name:'クレヨンしんちゃん',trend:'same',score:84},{name:'ウマ娘',trend:'up',score:79},
      {name:'コナン',trend:'down',score:73},{name:'鬼滅の刃',trend:'down',score:65},
      {name:'呪術廻戦',trend:'up',score:61},{name:'進撃の巨人',trend:'same',score:54},
      {name:'スパイファミリー',trend:'up',score:48},{name:'ワンピース',trend:'same',score:44},
    ],
  },
  { id:'manga',  name:'漫画',            icon:'ti-book',            color:'#be185d', bar:'#ec4899',
    subs:['全体','少年漫画','少女漫画','青年漫画','4コマ'],
    allSubs:[
      {name:'ワンピース',trend:'up',score:95},{name:'進撃の巨人',trend:'same',score:88},
      {name:'呪術廻戦',trend:'up',score:82},{name:'鬼滅の刃',trend:'down',score:76},
      {name:'スラムダンク',trend:'up',score:70},{name:'NARUTO',trend:'same',score:63},
      {name:'ドラゴンボール',trend:'down',score:57},{name:'ちいかわ',trend:'up',score:51},
    ],
  },
  { id:'game',   name:'ゲーム',          icon:'ti-device-gamepad-2',color:'#065f46', bar:'#059669',
    subs:['全体','モンハン','ポケモン','原神','スプラ'],
    allSubs:[
      {name:'モンハン',trend:'up',score:96},{name:'ポケモン',trend:'same',score:88},
      {name:'マリオカート',trend:'up',score:81},{name:'原神',trend:'down',score:74},
      {name:'スプラトゥーン',trend:'up',score:68},{name:'VALORANT',trend:'up',score:62},
      {name:'FF XVI',trend:'down',score:55},{name:'ゼルダ',trend:'same',score:50},
      {name:'エルデンリング',trend:'up',score:45},{name:'Among Us',trend:'down',score:38},
    ],
  },
  { id:'music',  name:'音楽',            icon:'ti-music',           color:'#9a3412', bar:'#ea580c',
    subs:['全体','ボカロ','Vtuber','J-POP','アニソン'],
    allSubs:[
      {name:'ボカロ',trend:'up',score:94},{name:'Vtuber',trend:'up',score:87},
      {name:'J-POP',trend:'same',score:79},{name:'アニソン',trend:'up',score:72},
      {name:'インディーズ',trend:'down',score:65},{name:'ライブレポ',trend:'up',score:58},
      {name:'K-POP',trend:'same',score:51},{name:'クラシック',trend:'down',score:43},
    ],
  },
  { id:'video',  name:'動画',            icon:'ti-player-play',     color:'#1e40af', bar:'#2563eb',
    subs:['全体','切り抜き','Vlog','解説','料理'],
    allSubs:[
      {name:'切り抜き',trend:'up',score:93},{name:'Vlog',trend:'up',score:86},
      {name:'解説動画',trend:'same',score:78},{name:'料理動画',trend:'up',score:71},
      {name:'ゲーム実況',trend:'down',score:64},{name:'旅行',trend:'up',score:57},
      {name:'教育',trend:'same',score:49},{name:'アウトドア',trend:'up',score:42},
    ],
  },
  { id:'tweet',  name:'つぶやき',        icon:'ti-message-circle',  color:'#166534', bar:'#16a34a',
    subs:['全体','日常','グルメ','育児','旅行'],
    allSubs:[
      {name:'日常',trend:'up',score:97},{name:'グルメ',trend:'up',score:89},
      {name:'育児',trend:'same',score:82},{name:'仕事',trend:'down',score:75},
      {name:'旅行',trend:'up',score:67},{name:'スポーツ',trend:'up',score:60},
      {name:'ペット',trend:'up',score:53},{name:'健康',trend:'same',score:46},
    ],
  },
  { id:'politics',name:'政治',           icon:'ti-building-bank',   color:'#374151', bar:'#6b7280',
    subs:['全体','国会','選挙','外交','経済'],
    allSubs:[
      {name:'国会中継',trend:'up',score:91},{name:'選挙',trend:'up',score:85},
      {name:'外交',trend:'same',score:76},{name:'経済政策',trend:'down',score:69},
      {name:'地方政治',trend:'up',score:61},{name:'社会保障',trend:'same',score:54},
      {name:'環境政策',trend:'up',score:47},{name:'防衛',trend:'down',score:40},
    ],
  },
];

const SAMPLE_USERS = [
  {n:'山田花子',  h:'@hanako_y',  av:'山',bg:'#dcfce7',tc:'#166534', age:'20代',gender:'女性', region:'東京都'},
  {n:'匿名ユーザー',h:'@m_tanaka', av:'田',bg:'#fef3c7',tc:'#92400e', sub:true},
  {n:'鈴木あい',  h:'@ai_suzuki',av:'鈴',bg:'#fce7f3',tc:'#be185d', age:'10代',gender:'女性', region:'大阪府'},
  {n:'匿名ユーザー',h:'@ken_sato', av:'佐',bg:'#ede9fe',tc:'#5b21b6', sub:true},
  {n:'伊藤花',    h:'@hana_ito', av:'伊',bg:'#d1fae5',tc:'#065f46', age:'30代',gender:'女性', region:'神奈川県'},
  {n:'匿名ユーザー',h:'@sho_w',    av:'渡',bg:'#fee2e2',tc:'#991b1b', sub:true},
  {n:'中村つばさ', h:'@tsubasa_n',av:'中',bg:'#dbeafe',tc:'#1e40af', age:'20代',gender:'男性', region:'愛知県'},
  {n:'小林まこ',  h:'@mako_k',   av:'小',bg:'#fef9c3',tc:'#713f12', age:'30代',gender:'女性', region:'福岡県'},
];

const TWEET_TEXTS = {
  anime: [
    'ドラえもん映画、今年も最高だった！のび太の成長が泣ける',
    'ハルヒの再放送やってる！今見ても全然色あせてない',
    'ウマ娘の新キャラ実装！早速育成してみた',
    'コナンの最新話、あの伏線がついに回収された',
    'クレヨンしんちゃんの映画は毎回大人が泣く',
    '新作アニメのキャラデザが神すぎて震えてる',
    '推しのグッズが即完売でつらい…次こそ買う',
    '聖地巡礼してきた！感動が止まらない',
  ],
  manga: [
    '最新話の展開が予想外すぎて眠れない',
    '久しぶりに一気読みしたら止まらなくなった',
    'この漫画の作画、本当に神だと思う',
    '主人公の成長に涙が止まらない最終回だった',
    '新連載始まったけどこれは当たりの予感',
    '電子書籍で全巻買ってしまった。後悔なし',
  ],
  game: [
    'モンハンワイルズ、新モンスター実装！早速狩りに行く',
    '新作ポケモン情報きた！伝説ポケモンのデザイン好きすぎ',
    'ソロ討伐成功！装備が整ってきた感じがする',
    '色違いマスカーニャ出た！400時間かかった…',
    'バンカラマッチS+到達！やっと念願達成',
    'ゲームのBGM聴きながら作業するの最高すぎる',
    'オンライン対戦で連勝中！このまま行けるか',
    '積みゲー消化するぞと思ったら新作買ってた',
  ],
  music: [
    '新曲投稿しました！初音ミクで作ったオリジナル曲です',
    'このボカロ曲、サビが頭から離れない',
    '昨日のライブ最高すぎた。またすぐ行きたい',
    '懐かしのボカロ曲特集ありがとう。全部神曲',
    '新曲のMVやばい。何回も見てる',
    'アニソンライブ行ってきた！最高の夜だった',
  ],
  video: [
    'この配信の切り抜き最高。何回見ても笑える',
    '切り抜き職人の編集力、本当にすごい',
    '今日の日常Vlog上げました。カフェ巡りしてきた',
    '切り抜きから本チャンネル登録する流れ、自分もやってた',
    '解説動画のおかげで理解できた！助かった',
    '料理動画見て作ってみたら意外と上手くできた',
  ],
  tweet: [
    '散歩してたら野良猫に懐かれた。かわいすぎた',
    'コンビニの新作スイーツ、毎週チェックするの楽しい',
    '今日の夕焼けがきれいすぎて思わず写真撮った',
    '近所に新しくできたラーメン屋、並ぶ価値あった',
    '朝のコーヒー一杯で一日が始まる幸せ',
    '久しぶりに友達と会って笑いすぎた',
  ],
  politics: [
    '国会中継見てる。今日の質問は鋭い',
    '予算委員会のやりとり、もっとわかりやすく報道してほしい',
    '国民が政治に関心を持つことが大切だと改めて思う',
    '次の選挙、若い世代にもっと関心を持ってほしい',
    '投票率が上がれば社会は変わると信じてる',
  ],
};

const PRESET_CATEGORIES = [
  {name:'良い人',           type:'positive'},
  {name:'プロ',             type:'positive'},
  {name:'教育者',           type:'positive'},
  {name:'インフルエンサー', type:'neutral'},
  {name:'クリエイター',     type:'neutral'},
  {name:'ゲーマー',         type:'neutral'},
  {name:'アーティスト',     type:'neutral'},
  {name:'情報屋',           type:'neutral'},
  {name:'ガチ勢',           type:'neutral'},
  {name:'詐欺師',           type:'negative'},
  {name:'荒らし',           type:'negative'},
  {name:'スパム',           type:'negative'},
  {name:'なりすまし',       type:'negative'},
  {name:'誇張が多い',       type:'negative'},
];

const USER_PROFILES = {
  '@hanako_y':  { categories: [
    {name:'良い人',       setBy:'@ai_suzuki', agree:42, deny:3,  agreeVoters:['@tsubasa_n','@mako_k','@hana_ito'], denyVoters:['@sho_w']},
    {name:'クリエイター', setBy:'@hanako_y',  agree:35, deny:2,  agreeVoters:['@ai_suzuki','@hana_ito'],           denyVoters:['@ken_sato']},
  ]},
  '@m_tanaka':  { categories: [
    {name:'詐欺師', setBy:'@hana_ito',  agree:45, deny:12, agreeVoters:['@hanako_y','@ai_suzuki','@tsubasa_n'], denyVoters:['@sho_w','@mako_k']},
    {name:'荒らし', setBy:'@tsubasa_n', agree:22, deny:8,  agreeVoters:['@hanako_y','@hana_ito'],               denyVoters:['@ken_sato','@mako_k']},
  ]},
  '@ai_suzuki': { categories: [
    {name:'ガチ勢',       setBy:'@ai_suzuki', agree:28, deny:5, agreeVoters:['@hanako_y','@tsubasa_n'], denyVoters:['@sho_w']},
    {name:'アーティスト', setBy:'@mako_k',    agree:19, deny:2, agreeVoters:['@hanako_y','@hana_ito'], denyVoters:['@ken_sato']},
  ]},
  '@ken_sato':  { categories: [
    {name:'なりすまし', setBy:'@m_tanaka', agree:18, deny:31, agreeVoters:['@sho_w'], denyVoters:['@hanako_y','@ai_suzuki','@tsubasa_n','@mako_k']},
  ]},
  '@hana_ito':  { categories: [
    {name:'インフルエンサー', setBy:'@hana_ito', agree:156, deny:22, agreeVoters:['@hanako_y','@ai_suzuki','@tsubasa_n'], denyVoters:['@m_tanaka','@sho_w']},
    {name:'良い人',           setBy:'@hanako_y', agree:89,  deny:11, agreeVoters:['@tsubasa_n','@mako_k'],                denyVoters:['@m_tanaka']},
  ]},
  '@sho_w':     { categories: [
    {name:'スパム', setBy:'@hana_ito', agree:34, deny:67, agreeVoters:['@m_tanaka'], denyVoters:['@hanako_y','@ai_suzuki','@tsubasa_n','@mako_k']},
  ]},
  '@tsubasa_n': { categories: [
    {name:'プロ',   setBy:'@tsubasa_n', agree:67, deny:4, agreeVoters:['@hanako_y','@ai_suzuki','@hana_ito'], denyVoters:['@m_tanaka']},
    {name:'教育者', setBy:'@hana_ito',  agree:43, deny:6, agreeVoters:['@hanako_y','@mako_k'],                denyVoters:['@sho_w']},
  ]},
  '@mako_k':    { categories: [
    {name:'良い人',   setBy:'@mako_k',    agree:31, deny:2, agreeVoters:['@hanako_y','@ai_suzuki'], denyVoters:['@ken_sato']},
    {name:'ゲーマー', setBy:'@tsubasa_n', agree:25, deny:3, agreeVoters:['@hanako_y','@hana_ito'], denyVoters:['@m_tanaka']},
  ]},
  '@you': { categories: [
    {name:'クリエイター', setBy:'@you', agree:12, deny:1, agreeVoters:['@hanako_y','@ai_suzuki'], denyVoters:['@sho_w']},
  ]},
};

const TIMES = ['1分前','3分前','7分前','12分前','20分前','35分前','52分前','1時間前','2時間前','3時間前','5時間前','8時間前','昨日','2日前'];
const AI_TYPES = ['none','none','none','part','part','full']; // noneが多め
const PREV_OPTIONS = ['初登場','↑前日12位','↑前日34位','↓前日2位','↑前日89位','↓前日5位','→前日同順位','初登場','↑前日201位','↓前日8位','↑前日156位','初登場'];

// 通知はSupabaseから読み込む（起動時は空、initSupabaseで上書き）
const NOTIFS     = [];
const NOTIFS_SUB = [];

const FOLLOWS = [
  {n:'山田花子',    h:'@hanako_y',  av:'山',bg:'#dcfce7',tc:'#166534', xp:2847, age:'20代', gender:'女性', region:'東京都'},
  {n:'匿名ユーザー',h:'@m_tanaka',  av:'田',bg:'#fef3c7',tc:'#92400e', xp:1203, sub:true},
  {n:'鈴木あい',    h:'@ai_suzuki', av:'鈴',bg:'#fce7f3',tc:'#be185d', xp:456,  age:'10代', gender:'女性', region:'大阪府'},
  {n:'匿名ユーザー',h:'@ken_sato',  av:'佐',bg:'#ede9fe',tc:'#5b21b6', xp:89,   sub:true},
];
const FOLLOWERS = [
  {n:'伊藤花',      h:'@hana_ito',  av:'伊',bg:'#d1fae5',tc:'#065f46', xp:5621, age:'30代', gender:'女性', region:'神奈川県'},
  {n:'匿名ユーザー',h:'@sho_w',     av:'渡',bg:'#fee2e2',tc:'#991b1b', xp:3102, sub:true},
  {n:'中村つばさ',  h:'@tsubasa_n', av:'中',bg:'#dbeafe',tc:'#1e40af', xp:1847, age:'20代', gender:'男性', region:'愛知県'},
  {n:'小林まこ',    h:'@mako_k',    av:'小',bg:'#fef9c3',tc:'#713f12', xp:742,  age:'30代', gender:'女性', region:'福岡県'},
  {n:'山田花子',    h:'@hanako_y',  av:'山',bg:'#dcfce7',tc:'#166534', xp:2847, age:'20代', gender:'女性', region:'東京都'},
];

const MEDIA_TYPES = ['text','text','text','text','text','text','image','image','image','video'];

// Tweet generator
function genTweet(rank, catId, offset=0) {
  const texts = catId === 'all'
    ? Object.values(TWEET_TEXTS).flat()
    : (TWEET_TEXTS[catId] || TWEET_TEXTS.tweet);
  const u = SAMPLE_USERS[(rank + offset) % SAMPLE_USERS.length];
  const ai = AI_TYPES[Math.floor(Math.random() * AI_TYPES.length)];
  const base = Math.max(5, 3000 - rank * 0.85 + Math.random() * 200);
  const likes = Math.floor(base * (0.5 + Math.random() * 0.5));
  const rt = Math.floor(likes * (0.1 + Math.random() * 0.35));
  const views = Math.floor(likes * (6 + Math.random() * 14));
  const prevIdx = Math.floor(Math.random() * PREV_OPTIONS.length);
  const timeIdx = Math.min(Math.floor(rank / 300), TIMES.length - 1);
  const media = MEDIA_TYPES[(rank + offset) % MEDIA_TYPES.length];
  return { rank, user:u, time:TIMES[timeIdx], text:texts[rank % texts.length], likes, rt, views, ai, prev:PREV_OPTIONS[prevIdx], score: likes + rt*3 + Math.floor(views/10), media };
}
