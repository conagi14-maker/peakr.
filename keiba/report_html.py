"""見やすいHTMLレポートを作る。 data/report_latest.html (Artifactとして公開する用。スマホ幅を最優先)。

report.py から呼ばれる。単体でも実行できる: python report_html.py
"""
import datetime as dt
import html

import numpy as np
import pandas as pd

from common import DATA, RACES_CSV, RESULTS_CSV
from report import params, race_table

WD = "月火水木金土日"
E = html.escape

CSS = """
:root{
  /* 競馬場の芝をイメージした深い緑を軸に、青みのある淡いグレーを下地にする */
  --bg:#eef3f0; --surface:#ffffff; --ink:#13211a; --ink2:#4b5e54; --ink3:#7a8c82; --line:#d9e3dc;
  --turf:#17784c; --turf-soft:#e1f1e8; --turf-ink:#0e5236;
  --amber:#a85f00; --amber-soft:#fcefd9;
  --indigo:#3949a8; --indigo-soft:#e6e9fa;
  --bar:#2c9a68; --bar-bg:#e4ece7; --shadow:0 1px 2px rgba(20,40,30,.06);
  --f-body:"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;
  --f-num:"Barlow Semi Condensed","Noto Sans JP",sans-serif;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#0e1612; --surface:#15201a; --ink:#e7f1eb; --ink2:#a3b6ab; --ink3:#7d9186; --line:#25352b;
  --turf:#4fc58b; --turf-soft:#163226; --turf-ink:#8fe0b8;
  --amber:#f0b45a; --amber-soft:#322611; --indigo:#a0abff; --indigo-soft:#1c2150;
  --bar:#43b57d; --bar-bg:#223229; --shadow:none; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#0e1612; --surface:#15201a; --ink:#e7f1eb; --ink2:#a3b6ab; --ink3:#7d9186; --line:#25352b;
  --turf:#4fc58b; --turf-soft:#163226; --turf-ink:#8fe0b8;
  --amber:#f0b45a; --amber-soft:#322611; --indigo:#a0abff; --indigo-soft:#1c2150;
  --bar:#43b57d; --bar-bg:#223229; --shadow:none; color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:15px;line-height:1.7;
  margin:0;padding-inline:16px;padding-block:20px 56px}
.wrap{max-width:720px;margin-inline:auto;display:flex;flex-direction:column;gap:22px}
.eyebrow{font-size:12.5px;color:var(--ink3);letter-spacing:.04em}
h1{font-size:28px;line-height:1.25;margin:4px 0 0;font-weight:900;letter-spacing:.01em;text-wrap:balance}
h2{font-size:18px;margin:0;font-weight:700;text-wrap:balance}
h3{font-size:16px;margin:0;font-weight:700;line-height:1.45;text-wrap:balance}
.num{font-family:var(--f-num);font-variant-numeric:tabular-nums}

/* 結論 */
.lead{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:var(--shadow);
  display:flex;flex-direction:column;gap:14px}
.lead h2{font-size:17px}
.pick{display:grid;grid-template-columns:104px minmax(0,1fr);gap:4px 12px;align-items:start;text-decoration:none;color:inherit}
.pick .tag{grid-row:span 2;text-align:center}
.pick .where{font-weight:700;font-size:15px}
.pick .who{color:var(--ink2);font-size:14px;min-width:0}
.pick .who b{color:var(--ink)}
.expect{font-size:14px;color:var(--ink2);margin:0}
.note{font-size:13px;color:var(--ink2);background:var(--bg);border-radius:10px;padding:10px 12px;margin:0}

.tag{display:inline-block;font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;white-space:nowrap;height:fit-content}
.t-solid{background:var(--turf-soft);color:var(--turf-ink)}
.t-iron{background:var(--turf);color:#fff}
:root[data-theme="dark"] .t-iron{color:#06240f}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .t-iron{color:#06240f}}
.t-rough{background:var(--amber-soft);color:var(--amber)}
.t-note{background:var(--indigo-soft);color:var(--indigo)}
.t-ref{background:var(--bg);color:var(--ink3);border:1px solid var(--line)}

/* 絞り込み */
.filters{display:flex;gap:8px;flex-wrap:wrap}
.chip{font:inherit;font-size:14px;padding:7px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);
  color:var(--ink2);cursor:pointer;min-height:38px}
.chip[aria-pressed="true"]{background:var(--turf);border-color:var(--turf);color:#fff;font-weight:700}
:root[data-theme="dark"] .chip[aria-pressed="true"]{color:#06240f}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .chip[aria-pressed="true"]{color:#06240f}}
.chip:focus-visible,.pick:focus-visible,summary:focus-visible{outline:2px solid var(--turf);outline-offset:2px}
.chip .c{font-family:var(--f-num);margin-left:5px;opacity:.85}

/* 日付とレースカード */
.day{display:flex;flex-direction:column;gap:12px}
.day h2{display:flex;align-items:baseline;gap:10px;padding-top:6px;border-top:2px solid var(--ink)}
.day h2 small{font-size:13px;color:var(--ink3);font-weight:400}
.warn{font-size:13px;color:var(--amber);background:var(--amber-soft);border-radius:10px;padding:8px 12px;margin:0}
.race{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px 12px;box-shadow:var(--shadow);
  display:flex;flex-direction:column;gap:10px;scroll-margin-top:12px}
.race[hidden]{display:none}
.rh{display:flex;flex-direction:column;gap:3px}
.rh .row1{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.time{font-family:var(--f-num);font-weight:700;font-size:17px;font-variant-numeric:tabular-nums}
.where2{font-weight:700;color:var(--turf-ink)}
.meta{font-size:13px;color:var(--ink3)}
.picks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.picks li{display:grid;grid-template-columns:22px minmax(0,1fr) 52px;gap:2px 8px;align-items:center}
.mk{font-size:16px;color:var(--turf);text-align:center}
.nm{min-width:0;overflow-wrap:anywhere;font-weight:700;font-size:15px}
.nm small{font-weight:400;color:var(--ink3);font-size:12.5px;margin-left:6px}
.pc{text-align:right;font-family:var(--f-num);font-weight:700;font-size:19px;font-variant-numeric:tabular-nums}
.pc small{font-size:12px;font-weight:400;color:var(--ink3)}
.bar{grid-column:2 / 4;height:6px;border-radius:3px;background:var(--bar-bg);overflow:hidden}
.bar i{display:block;height:100%;background:var(--bar);border-radius:3px}
.sub{grid-column:2 / 4;font-size:12.5px;color:var(--ink3);margin-top:-2px}
.picks li:not(:first-child) .nm{font-weight:500}
.picks li:not(:first-child) .pc{font-size:16px;font-weight:600}
.picks li:not(:first-child) .bar i{opacity:.7}

/* 成績・説明 */
.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px}
.kv{display:flex;gap:6px 18px;flex-wrap:wrap}
.kv div{display:flex;flex-direction:column;min-width:0}
.kv b{font-family:var(--f-num);font-size:22px;font-variant-numeric:tabular-nums}
.kv span{font-size:12.5px;color:var(--ink3)}
details{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:4px 16px}
summary{cursor:pointer;font-weight:700;padding:12px 0;min-height:44px}
details p,details li{font-size:14px;color:var(--ink2);margin:0 0 10px}
details ul{padding-left:1.2em;margin:0 0 8px}
.foot{font-size:12.5px;color:var(--ink3);line-height:1.6}
@media (max-width:400px){h1{font-size:25px}.pick{grid-template-columns:1fr}.pick .tag{grid-row:auto;justify-self:start}}
@media (prefers-reduced-motion:no-preference){.chip{transition:background .15s,color .15s}}
"""

JS = """
(function(){
  var chips=document.querySelectorAll('.chip'),races=document.querySelectorAll('.race'),days=document.querySelectorAll('.day');
  function apply(f){
    chips.forEach(function(c){c.setAttribute('aria-pressed',c.dataset.f===f?'true':'false')});
    races.forEach(function(r){
      var t=' '+r.dataset.tags+' ';
      r.hidden=!(f==='all'||(f==='rec'&&r.dataset.tags!=='')||t.indexOf(' '+f+' ')>-1);
    });
    days.forEach(function(d){d.hidden=!d.querySelector('.race:not([hidden])')});
    try{sessionStorage.setItem('keibaFilter',f)}catch(e){}
  }
  chips.forEach(function(c){c.addEventListener('click',function(){apply(c.dataset.f)})});
  var f='rec';try{f=sessionStorage.getItem('keibaFilter')||'rec'}catch(e){}
  apply(f);
  document.querySelectorAll('a.pick').forEach(function(a){a.addEventListener('click',function(){
    var el=document.getElementById(a.getAttribute('href').slice(1));if(el&&el.hidden){apply('all')}})});
})();
"""


def pct(x) -> str:
    return f"{x * 100:.0f}"


def date_label(d: str) -> str:
    t = dt.date.fromisoformat(d)
    return f"{t.month}/{t.day}({WD[t.weekday()]})"


def tags_for(r):
    out = []
    if r.ironclad:
        out.append(("t-iron", "鉄板級"))
    elif r.solid:
        out.append(("t-solid", "堅い"))
    if r.rough:
        out.append(("t-rough", "荒れそう"))
    if r.notable:
        out.append(("t-note", r.grade if r.grade else "オープン"))
    if r.basis != "市場込み":
        out.append(("t-ref", "オッズ未発表・参考"))
    return out


def tag_html(cls, text):
    return f'<span class="tag {cls}">{E(text)}</span>'


def race_card(r, g: pd.DataFrame) -> str:
    g = g.sort_values("p_win", ascending=False).head(4)
    tg = tags_for(r)
    cats = " ".join(k for k, ok in (("notable", r.notable), ("solid", r.solid or r.ironclad), ("rough", r.rough)) if ok)
    dist = f"{int(r.distance)}m" if pd.notna(r.distance) else ""
    badges = "".join(tag_html(c, t) for c, t in tg)
    lis = []
    for mark, (_, h) in zip("◎○▲△", g.iterrows()):
        sub = [f"3着以内 {pct(h.p_top3)}%"]
        if pd.notna(h.odds) and pd.notna(h.popularity):
            sub.append(f"{int(h.popularity)}番人気・{h.odds:g}倍")
        lis.append(
            f'<li><span class="mk">{mark}</span><span class="nm">{E(str(h.horse))}<small>{E(str(h.jockey))}</small></span>'
            f'<span class="pc">{pct(h.p_win)}<small>%</small></span>'
            f'<span class="bar"><i style="width:{max(2, h.p_win * 100):.0f}%"></i></span>'
            f'<span class="sub">{E(" ・ ".join(sub))}</span></li>')
    return (f'<article class="race" id="r{E(r.race_id)}" data-tags="{cats}">'
            f'<div class="rh"><div class="row1"><span class="time">{E(str(r.start))}</span>'
            f'<span class="where2">{E(r.venue)}</span>{badges}</div>'
            f'<h3>{E(str(r.name))}</h3><span class="meta">{E(str(r.surface))}{dist} ・ {r.n}頭</span></div>'
            f'<ol class="picks">{"".join(lis)}</ol></article>')


def pick_row(label_cls, label, r, g) -> str:
    top = g.sort_values("p_win", ascending=False).iloc[0]
    return (f'<a class="pick" href="#r{E(r.race_id)}">{tag_html(label_cls, label)}'
            f'<span class="where">{E(date_label(r.date))} {E(str(r.start))} {E(r.venue)} {E(str(r["name"]))}</span>'
            f'<span class="who">本命 <b>{E(str(top.horse))}</b>（{E(str(top.jockey))}）勝つ確率 <b class="num">{pct(top.p_win)}%</b></span></a>')


def forward_panel(res) -> str:
    f = DATA / "predictions_log.csv"
    empty = ('<section class="panel"><h2>予想の成績</h2><p class="note">予想は毎日記録しています。レースの結果が出たら、'
             'ここに当たり外れの成績を表示します(数百レース分たまるまでは、偶然の振れが大きいため参考程度です)。</p></section>')
    if not f.exists():
        return empty
    log = pd.read_csv(f, dtype={"race_id": str}, encoding="utf-8-sig")
    if "basis" not in log.columns:
        log["basis"] = "市場なし(参考)"
    log["basis"] = log["basis"].fillna("市場なし(参考)")
    log = log.sort_values("snapshot").drop_duplicates(["race_id", "umaban"], keep="last")
    r = res[["race_id", "umaban", "rank", "popularity"]].rename(columns={"popularity": "pop_res"}).copy()
    for c in ("umaban", "rank", "pop_res"):
        r[c] = pd.to_numeric(r[c], errors="coerce")
    m = log.merge(r, on=["race_id", "umaban"], how="inner")
    if m.empty:
        return empty
    m["win"] = (m["rank"] == 1).astype(float)
    m["top3"] = (m["rank"] <= 3).astype(float)
    g = m[m.basis == "市場込み"] if (m.basis == "市場込み").any() else m
    top = g.loc[g.groupby("race_id").p_win.idxmax()]
    fav = g[g.pop_res == 1]
    nr = top.race_id.nunique()
    small = '<p class="note">まだレース数が少ないため、偶然の振れが大きく、評価には使えません。</p>' if nr < 200 else ""
    return ('<section class="panel"><h2>予想の成績</h2><div class="kv">'
            f'<div><b>{nr}</b><span>答え合わせ済みのレース</span></div>'
            f'<div><b>{top.win.mean() * 100:.0f}%</b><span>本命が勝った割合(予想 {top.p_win.mean() * 100:.0f}%)</span></div>'
            f'<div><b>{top.top3.mean() * 100:.0f}%</b><span>本命が3着以内に入った割合</span></div>'
            f'<div><b>{fav.win.mean() * 100:.0f}%</b><span>参考: 1番人気が勝った割合</span></div></div>{small}</section>')


def build_html() -> str:
    P = params()
    now = dt.datetime.now()
    f = DATA / "upcoming_latest.csv"
    x = pd.read_csv(f, dtype={"race_id": str}, encoding="utf-8-sig") if f.exists() else pd.DataFrame()
    res = pd.read_csv(RESULTS_CSV, dtype={"race_id": str}, low_memory=False, on_bad_lines="skip")
    races = pd.read_csv(RACES_CSV, dtype={"race_id": str}, on_bad_lines="skip")
    parts = []

    if x.empty:
        R = pd.DataFrame()
        head_line = "これから走るレースの出馬表は、まだ取得できていません。"
    else:
        R = race_table(x, P).sort_values(["date", "start"]).reset_index(drop=True)
        # 「荒れそう」は1日あたり上位8レースまで(多すぎると目印にならないため)
        for d_, Rd_ in R[R.rough].groupby("date"):
            R.loc[Rd_.sort_values("ent", ascending=False).index[8:], "rough"] = False
        n_solid, n_rough = int((R.solid | R.ironclad).sum()), int(R.rough.sum())
        n_note = int(R.notable.sum())
        head_line = f"{date_label(R.date.min())}〜{date_label(R.date.max())} の {len(R)}レース"

    # --- 結果データの遅れの注意 ---
    lag = (dt.date.today() - dt.date.fromisoformat(str(races.date.max()))).days
    if lag >= 4:
        parts.append(f'<p class="warn">結果データがまだ {E(str(races.date.max()))} まで(約{lag}日分の遅れ)です。'
                     'いま取り込みを進めています。直近のレースの成績が反映されていないため、予想の精度は落ちます。'
                     '遅れが解消するまで、参考程度に見てください。</p>')

    # --- 結論 ---
    lead = ['<section class="lead"><h2>今日の結論</h2>']
    if len(R):
        solid = R[R.solid | R.ironclad].sort_values("p1", ascending=False)
        note = R[R.notable].sort_values(["date", "start"])
        rough = R[R.rough].sort_values("ent", ascending=False)
        G = lambda rid: x[x.race_id == rid]
        if len(solid):
            s = solid.iloc[0]
            lead.append(pick_row("t-iron" if s.ironclad else "t-solid", "いちばん堅い", s, G(s.race_id)))
        if len(note):
            gnote = note[note.grade.ne("")]
            n = (gnote if len(gnote) else note).iloc[0]
            lead.append(pick_row("t-note", "注目の一戦", n, G(n.race_id)))
        if len(rough):
            q = rough.iloc[0]
            lead.append(pick_row("t-rough", "いちばん荒れそう", q, G(q.race_id)))
        sol = R[R.solid | R.ironclad]
        if len(sol):
            lead.append(f'<p class="expect">「堅い」レースは {len(sol)}件。予想どおりなら、そのうち約 '
                        f'<b class="num">{sol.p1.sum():.0f}</b>件で本命が勝つ見込みです。'
                        f'荒れそうなレースは {n_rough}件、重賞・オープンは {n_note}件あります。</p>')
        st = P.get("market", {}).get("solid")
        if st:
            lead.append(f'<p class="note">過去の検証({st["n"]:,}レース)では、「堅い」レースの本命は約{st["hit"] * 100:.0f}%で勝ち、'
                        f'3着以内は約{st["top3"] * 100:.0f}%でした。ただし、勝ちやすいレースを買い続けても、単勝100円あたりの戻りは約'
                        f'{st["roi"] * 100:.0f}円で、損をしない水準には届いていません。見立ての参考にしてください。</p>')
    else:
        lead.append('<p class="note">出馬表を取得できていません。次の更新をお待ちください。</p>')
    lead.append("</section>")
    parts.append("".join(lead))

    # --- 絞り込み ---
    if len(R):
        cnt = dict(rec=int((R.solid | R.ironclad | R.rough | R.notable).sum()), notable=int(R.notable.sum()),
                   solid=int((R.solid | R.ironclad).sum()), rough=int(R.rough.sum()), all=len(R))
        names = [("rec", "おすすめ"), ("notable", "重賞・オープン"), ("solid", "堅い"), ("rough", "荒れそう"), ("all", "すべて")]
        parts.append('<div class="filters" role="group" aria-label="レースの絞り込み">' + "".join(
            f'<button class="chip" type="button" id="f-{k}" data-f="{k}" aria-pressed="false">{n}<span class="c">{cnt[k]}</span></button>'
            for k, n in names) + "</div>")
        for d, Rd in R.groupby("date", sort=True):
            cards = "".join(race_card(r, x[x.race_id == r.race_id]) for r in Rd.itertuples())
            warn = ""
            if not Rd.draw.all():
                warn = (f'<p class="warn">枠順がまだ決まっていないレースが{int((~Rd.draw).sum())}件あります。'
                        f'枠順が決まる前日以降の予想のほうが、精度が高くなります。</p>')
            parts.append(f'<section class="day"><h2>{E(date_label(d))}<small>{len(Rd)}レース</small></h2>{warn}{cards}</section>')

    parts.append(forward_panel(res))

    # --- 見方 ---
    st_m, st_f = P.get("market", {}), P.get("free", {})
    rough_txt = ""
    if st_m.get("rough"):
        rough_txt = (f'<li><b>荒れそう</b>: 有力馬が割れていて、どの馬が勝ってもおかしくないレースです。過去の検証では、'
                     f'5番人気以下の馬が勝った割合が約{st_m["rough"]["upset"] * 100:.0f}%でした(堅いレースは約{st_m["firm_upset"] * 100:.0f}%)。</li>')
    parts.append(
        '<details><summary>この見方について</summary>'
        '<ul><li><b>勝つ確率</b>: その馬が1着になる確率です。同じレースの全馬を合わせて100%になります。</li>'
        '<li><b>3着以内</b>: 3着までに入る確率です。複勝の的中しやすさの目安になります。</li>'
        '<li><b>◎○▲△</b>: 勝つ確率が高い順です。</li>'
        '<li><b>堅い</b>: 本命の勝つ確率が高く、2番手との差も大きいレースです。'
        '<b>鉄板級</b>は、その中でも特に差が大きいレースです。</li>'
        f'{rough_txt}'
        '<li><b>オッズ未発表・参考</b>: 倍率が出る前の予想です。オッズが出ると、市場の見立てを土台に予想を作り直すので、'
        '未発表のときは、参考程度に見てください。</li></ul>'
        '<p>予想は、過去5万レース以上の結果から学習したモデルが出しています。毎日記録して、結果と突き合わせています。</p>'
        '<p>勝ちやすい馬を当てる精度は高いのですが、オッズも同じ情報を価格に反映しているため、馬券の回収率は'
        '1.0を超えていません。馬券の購入は自己責任で、無理のない範囲でお願いします。</p></details>')

    last = races.date.max()
    parts.append(f'<p class="foot">更新 {now:%Y-%m-%d %H:%M} ・ 結果データ: {E(str(last))} まで取得済み'
                 f'(毎日、前日分から順に取り込んでいます) ・ 対象: JRA と地方競馬(ばんえいを除く)</p>')

    body = "\n".join(parts)
    doc = (f'<title>競馬の見立て</title>\n'
           '<link rel="preconnect" href="https://fonts.googleapis.com">'
           '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900'
           '&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap">\n'
           f'<style>{CSS}</style>\n'
           f'<main class="wrap"><header><div class="eyebrow">{E(head_line)} ・ {now:%m/%d %H:%M} 更新</div>'
           f'<h1>競馬の見立て</h1></header>\n{body}</main>\n<script>{JS}</script>\n')
    out = DATA / "report_latest.html"
    out.write_text(doc, encoding="utf-8")
    print(f"HTMLレポート: {out} ({len(doc) / 1024:.0f} KB)")
    return doc


if __name__ == "__main__":
    build_html()
