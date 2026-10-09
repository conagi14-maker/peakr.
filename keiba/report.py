"""日次レポート(Markdown)を作る。 data/report_latest.md と data/report_YYYYMMDD.md に保存する。

内容: ①収集状況 ②直近の開催の結果 ③予想の答え合わせ(前向き検証) ④これからのレースの注目・狙い目・波乱含み
基準(狙い目など)と過去の実績は data/selection_params.json (selection_params.py で作成) から読む。
予想の基礎: オッズが出ているレースは「市場込み」(市場の確率+モデルの補正)、未発表は「市場なし(参考)」。
"""
import datetime as dt
import json

import numpy as np
import pandas as pd

from common import DATA, RACES_CSV, RESULTS_CSV
from upcoming import PLACE

DEFAULT = {"market": dict(solid=(0.45, 0.10), ironclad=(0.60, 0.10), ent=0.80),
           "free": dict(solid=(0.40, 0.10), ironclad=(0.50, 0.10), ent=0.87)}


def params():
    f = DATA / "selection_params.json"
    return json.load(open(f)) if f.exists() else {}


def norm_entropy(s: pd.Series, n: int) -> float:
    p = s / s.sum()
    return float(-(p * np.log(p.clip(1e-9))).sum() / np.log(max(n, 2)))


def venue(row) -> str:
    return f"{PLACE.get(str(row.place), row.place)}{int(row.race_no)}R"


def fmt_pick(r) -> str:
    odds = f" 人気{int(r.popularity)}・{r.odds:g}倍" if pd.notna(r.odds) and pd.notna(r.popularity) else ""
    return f"{r.horse}({r.jockey}) 勝{r.p_win:.0%}/複{r.p_top3:.0%}{odds}"


def race_lines(g: pd.DataFrame, marks="◎○▲△") -> list:
    g = g.sort_values("p_win", ascending=False)
    return [f"    {m} {fmt_pick(r)}" for m, (_, r) in zip(marks, g.head(4).iterrows())]


def section_results(res, races) -> list:
    out = ["## 2. 直近の開催の結果"]
    last = races.date.max()
    day = races[races.date == last]
    r = res[res.race_id.isin(day.race_id)].copy()
    for c in ("rank", "popularity", "odds"):
        r[c] = pd.to_numeric(r[c], errors="coerce")
    w = r[r["rank"] == 1].drop_duplicates("race_id").merge(day[["race_id", "place", "race_no", "race_name", "circuit"]], on="race_id")
    out.append(f"- 最新の収集日: **{last}** ({len(day)}レース)")
    if len(w):
        out.append(f"- 1番人気の勝率: {(w.popularity == 1).mean():.0%} / 5番人気以下の勝利: {(w.popularity >= 5).mean():.0%}")
        up = w.sort_values("odds", ascending=False).head(5)
        out.append("- 大穴の勝利(単勝オッズ順): " + " / ".join(
            f"{PLACE.get(str(x.place), x.place)}{int(x.race_no)}R {x.horse}({int(x.popularity)}人気・{x.odds:g}倍)" for x in up.itertuples()))
        g = w[w.race_name.fillna("").str.contains(r"\(G|\(Jpn|\(L\)")]
        for x in g.itertuples():
            out.append(f"- 重賞/L: {PLACE.get(str(x.place), x.place)}{int(x.race_no)}R {x.race_name} → {x.horse}({x.jockey}) {int(x.popularity)}人気")
    return out + [""]


def section_forward(res) -> list:
    out = ["## 3. 予想の答え合わせ(記録した予想と実際の結果)"]
    f = DATA / "predictions_log.csv"
    if not f.exists():
        return out + ["- まだ記録がありません(予想は毎日記録され、結果が出たら自動で突き合わせます)", ""]
    log = pd.read_csv(f, dtype={"race_id": str}, encoding="utf-8-sig")
    if "basis" not in log.columns:
        log["basis"] = "市場なし(参考)"
    log["basis"] = log["basis"].fillna("市場なし(参考)")
    log = log.sort_values("snapshot").drop_duplicates(["race_id", "umaban"], keep="last")   # レース直前に最も近い記録
    r = res[["race_id", "umaban", "rank", "popularity"]].rename(columns={"popularity": "pop_res"}).copy()
    r["umaban"] = pd.to_numeric(r.umaban, errors="coerce")
    r["rank"] = pd.to_numeric(r["rank"], errors="coerce")
    r["pop_res"] = pd.to_numeric(r["pop_res"], errors="coerce")
    m = log.merge(r, on=["race_id", "umaban"], how="inner")
    if m.empty:
        return out + ["- 記録した予想のレースは、まだ結果が出ていません", ""]
    m["win"] = (m["rank"] == 1).astype(float)
    m["top3"] = (m["rank"] <= 3).astype(float)
    for basis, g in m.groupby("basis"):
        top = g.loc[g.groupby("race_id").p_win.idxmax()]
        nr = top.race_id.nunique()
        ll = -np.mean(g.win * np.log(g.p_win.clip(1e-6)) + (1 - g.win) * np.log((1 - g.p_win).clip(1e-6)))
        fav = g[g.pop_res == 1]
        out.append(f"- 【{basis}】答え合わせ済み **{nr}レース**: 予想1位の的中率 **{top.win.mean():.1%}** "
                   f"(予想した平均 {top.p_win.mean():.1%}) / 複勝圏率 {top.top3.mean():.1%} / 1番人気の的中率 {fav.win.mean():.1%} / logloss {ll:.4f}")
        if nr < 200:
            out.append("  - ※レース数が少ないうちは、偶然の振れが大きく、評価には使えません(目安: 数百レース以上)")
    return out + [""]


def stat_text(s) -> str:
    return f"過去の実績(検証{s['n']:,}レース): 的中{s['hit']:.0%}・3着内{s['top3']:.0%}・単勝回収率{s['roi']:.2f}"


def race_table(x: pd.DataFrame, P: dict) -> pd.DataFrame:
    """レースごとの要約(予想1位の勝率・2位との差・混戦度・各種フラグ)。レポート(md/html)で共通に使う。"""
    if "basis" not in x.columns:
        x["basis"] = "市場なし(参考)"
    rows = []
    for rid, g in x.groupby("race_id"):
        gs = g.sort_values("p_win", ascending=False)
        info = gs.iloc[0]
        key = "market" if info.basis == "市場込み" else "free"
        d = DEFAULT[key]
        th_s = P.get(key, {}).get("thresholds", {}).get("solid", d["solid"])
        th_i = P.get(key, {}).get("thresholds", {}).get("ironclad", d["ironclad"])
        ent_thr = P.get(key, {}).get("ent_q80", d["ent"])
        p1, p2 = gs.p_win.iloc[0], (gs.p_win.iloc[1] if len(gs) > 1 else 0)
        ent = norm_entropy(gs.p_win, len(gs))
        grade = str(info.grade) if pd.notna(info.grade) else ""
        rows.append(dict(race_id=rid, date=info.date, start=info.start, name=info.race_title, surface=info.surface,
                         distance=info.distance, venue=venue(info), p1=p1, gap=p1 - p2, ent=ent, grade=grade,
                         cls=info.class_group, draw=bool(info.draw_confirmed), n=len(gs), basis=info.basis, key=key,
                         solid=(p1 >= th_s[0]) and (p1 - p2 >= th_s[1]), ironclad=(p1 >= th_i[0]) and (p1 - p2 >= th_i[1]),
                         rough=ent >= ent_thr))
    R = pd.DataFrame(rows)
    R["notable"] = R.grade.ne("") | R.cls.isin(["G1", "G2", "G3", "OP"])
    return R


def section_upcoming(P) -> list:
    f = DATA / "upcoming_latest.csv"
    out = ["## 4. これからのレース"]
    if not f.exists():
        return out + ["- 出馬表を取得できていません", ""]
    x = pd.read_csv(f, dtype={"race_id": str}, encoding="utf-8-sig")
    if x.empty:
        return out + ["- 対象レースなし", ""]
    if "basis" not in x.columns:
        x["basis"] = "市場なし(参考)"
    R = race_table(x, P)
    nm = int((R.basis == "市場込み").sum())
    out.append(f"- 取得したレース: {len(R)}(うち市場込み {nm} / 市場なし・参考 {len(R) - nm})。全頭の予想は `data/upcoming_latest.csv`")
    out.append("- ◎○▲△ = 勝つ確率の順(勝=勝つ確率、複=3着以内の確率)。人気・倍率は発表済みのレースのみ")
    out.append("- **市場込み** = オッズの確率を土台にモデルが補正(信頼度が高い) / **市場なし・参考** = オッズ未発表でモデル単独(過信しやすいので参考程度)")
    out.append("")
    S = {k: P.get(k, {}) for k in ("market", "free")}
    for d, Rd in R.sort_values(["date", "start"]).groupby("date"):
        wd = "月火水木金土日"[dt.date.fromisoformat(d).weekday()]
        out.append(f"### {d}({wd})  {len(Rd)}レース")
        if not Rd.draw.all():
            out.append(f"> ※ 枠順が未確定のレースがあります({int((~Rd.draw).sum())}レース)。確定後(JRAは前日)の予想のほうが精度が高くなります")
        blocks = [("★ 注目レース(重賞・リステッド・オープン)", Rd.notable, ""),
                  ("◎ 狙い目(堅い): 予想1位の勝率が高く、2位と差がある", Rd.solid & ~Rd.notable, "solid"),
                  ("△ 波乱含み(混戦): 予想が割れている上位20%のレース", Rd.rough & ~Rd.notable, "rough")]
        for title, mask, kind in blocks:
            sel = Rd[mask]
            if sel.empty:
                continue
            note = ""
            if kind == "solid":
                parts = [f"{'市場込み' if k == 'market' else '市場なし'}: {stat_text(S[k]['solid'])}" for k in ("market", "free")
                         if S[k] and (sel.key == k).any()]
                note = " / ".join(parts)
            if kind == "rough":
                parts = [f"{'市場込み' if k == 'market' else '市場なし'}: 5番人気以下が勝つ割合{S[k]['rough']['upset']:.0%}(堅いレースは{S[k]['firm_upset']:.0%})"
                         for k in ("market", "free") if S[k] and (sel.key == k).any()]
                note = " / ".join(parts) + "。本命は信頼しにくい"
            out.append(f"**{title}**" + (f"  _{note}_" if note else ""))
            for t in sel.sort_values("start").itertuples():
                tags = ("【鉄板級】" if t.ironclad else "") + ("【堅い】" if t.solid else "") + ("【混戦】" if t.rough else "")
                tags += "" if t.basis == "市場込み" else "【市場なし・参考】"
                dist = int(t.distance) if pd.notna(t.distance) else ""
                out.append(f"- {t.start} {t.venue} {t.name} ({t.surface}{dist}m・{t.n}頭) {tags}")
                out += race_lines(x[x.race_id == t.race_id])
            out.append("")
    return out


def main():
    res = pd.read_csv(RESULTS_CSV, dtype={"race_id": str}, low_memory=False, on_bad_lines="skip")
    races = pd.read_csv(RACES_CSV, dtype={"race_id": str}, on_bad_lines="skip")
    P = params()
    now = dt.datetime.now()
    L = [f"# 競馬 日次レポート  {now:%Y-%m-%d %H:%M}", "",
         "## 1. データ収集状況",
         f"- 収集済み: {len(races):,}レース / 最新日 {races.date.max()} / 検査: `python validate.py`", ""]
    lag = (dt.date.today() - dt.date.fromisoformat(str(races.date.max()))).days
    if lag >= 4:
        L.insert(-1, f"- ⚠ 結果データが約{lag}日分遅れています(取り込み中)。直近の成績が反映されていないため、予想の精度は落ちます。")
    L += section_results(res, races) + section_forward(res) + section_upcoming(P)
    L += ["---", "### この報告の見方と注意",
          "- モデルは「勝ちやすさ」を高い精度で予想できますが、**馬券の回収率は1.0を超えていません**(検証済み)。"
          "最良でも、複勝の人気馬で約0.86、予想1位の単勝で約0.80〜0.87です。参考情報として使ってください。",
          "- 「狙い目(堅い)」は的中しやすいという意味で、儲かるという意味ではありません(過去の実績の単勝回収率は上記のとおり1.0未満)。",
          "- 基準と実績は、過去の時系列検証(約4万レース)から決めています。毎日の予想は記録され、結果と自動で突き合わせます(第3節)。",
          "- 枠順・馬体重・オッズは、発表前は空欄または仮の扱いです。馬券の購入は自己責任で、無理のない範囲で。"]
    text = "\n".join(L)
    (DATA / "report_latest.md").write_text(text, encoding="utf-8")
    (DATA / f"report_{now:%Y%m%d}.md").write_text(text, encoding="utf-8")
    try:
        from report_html import build_html
        build_html()
    except Exception as e:  # HTMLが作れなくてもMarkdownレポートは残す
        print("HTMLレポートの作成に失敗:", e)
    print(text)


if __name__ == "__main__":
    main()
