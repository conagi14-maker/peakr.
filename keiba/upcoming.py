"""これから走るレース(今日〜数日先)の出馬表を取得し、モデルで予想する。

  python upcoming.py [--days 4] [--ped-limit 200] [--max-races N]
出力: data/upcoming_latest.csv (全馬の予想) / data/predictions_log.csv (予想の記録=後で結果と突き合わせて前向き検証)
注意: 枠順の確定前(JRAは前日)は馬番が空 → 仮の並びで計算するため精度が落ちる(draw_confirmed=False)。
"""
import argparse
import datetime as dt
import re

import lightgbm as lgb
import numpy as np
import pandas as pd
from bs4 import BeautifulSoup

import common
import ratings as R
from common import DATA, EXCLUDE_PLACES, MODELS, RACES_CSV, RESULTS_CSV, circuit_of, fetch
from features import build, clean

PLACE = {"01": "札幌", "02": "函館", "03": "福島", "04": "新潟", "05": "東京", "06": "中山", "07": "中京",
         "08": "京都", "09": "阪神", "10": "小倉", "30": "門別", "35": "盛岡", "36": "水沢", "42": "浦和",
         "43": "船橋", "44": "大井", "45": "川崎", "46": "金沢", "47": "笠松", "48": "名古屋", "50": "園田",
         "51": "姫路", "54": "高知", "55": "佐賀"}
GRADE = {"G1": "(GI)", "G2": "(GII)", "G3": "(GIII)", "Jpn1": "(JpnI)", "Jpn2": "(JpnII)", "Jpn3": "(JpnIII)",
         "JpnI": "(JpnI)", "JpnII": "(JpnII)", "JpnIII": "(JpnIII)", "L": "(L)"}


def race_ids_for(d: dt.date):
    ids = []
    for host in ("race", "nar"):
        try:
            h = fetch(f"https://{host}.netkeiba.com/top/race_list_sub.html?kaisai_date={d:%Y%m%d}")
        except Exception:
            continue
        ids += re.findall(r"race_id=(\d{12})", h)
    return sorted({i for i in ids if i[4:6] not in EXCLUDE_PLACES})


def num(x, f=float):
    try:
        return f(str(x).strip())
    except ValueError:
        return None


def first(pattern, text, default=None):
    m = re.search(pattern, text)
    return m[1] if m else default


def fetch_entries(race_id: str):
    host = "race" if circuit_of(race_id) == "JRA" else "nar"
    soup = BeautifulSoup(fetch(f"https://{host}.netkeiba.com/race/shutuba.html?race_id={race_id}"), "html.parser")
    title = soup.title.get_text(strip=True) if soup.title else ""

    def txt(sel):
        el = soup.select_one(sel)
        return el.get_text(" ", strip=True) if el else ""

    d1, d2, name = txt(".RaceData01"), txt(".RaceData02"), txt(".RaceName")
    date = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", title)
    if not date or not d1:
        return None, []
    g = first(r"\((G[123]|Jpn[123I]+|L)\)", title, "")
    cm = re.search(r"(障?[芝ダ]|障)\s*(\d{3,4})m", d1)
    st = re.search(r"(\d{1,2}):(\d{2})発走", d1)
    race = dict(
        race_id=race_id, date=f"{int(date[1])}-{int(date[2]):02d}-{int(date[3]):02d}", circuit=circuit_of(race_id),
        place=race_id[4:6], race_no=int(race_id[10:12]),
        race_name=f"{name}{GRADE.get(g, '')} {d2.split('本賞金')[0]}".strip(),   # クラス判定用(条件を含む)
        race_title=name if (not g or g in name) else f"{name}({g})",                     # 表示用
        surface=("障" if cm[1].startswith("障") else cm[1]) if cm else None, distance=cm[2] if cm else None,
        weather=first(r"天候:(\S+)", d1), going=first(r"馬場:(\S+)", d1),
        start=f"{int(st[1]):02d}:{st[2]}" if st else "", grade=g)
    rows = []
    for tr in soup.select("tr.HorseList"):
        if "Cancel" in " ".join(tr.get("class", [])):
            continue
        tds = tr.find_all("td")

        def cell(prefix):
            return next((td for td in tds if any(c.startswith(prefix) for c in td.get("class", []))), None)

        hi = next((i for i, td in enumerate(tds) if "HorseInfo" in td.get("class", [])), None)
        if hi is None:
            continue
        trn = cell("Trainer")
        tt = trn.get_text(" ", strip=True).split() if trn else []
        region = "東" if tt and tt[0] == "美浦" else ("西" if tt and tt[0] == "栗東" else "地")
        wcell = cell("Weight")
        wt = re.search(r"(\d{3})\s*\(([+-]?\d+)\)", wcell.get_text(" ", strip=True)) if wcell else None
        pop = [td for td in tds if "Popular" in td.get("class", [])]
        odds = next((num(td.get_text(strip=True)) for td in pop if "Txt_R" in td.get("class", [])), None)
        ninki = next((num(td.get_text(strip=True), int) for td in pop if "Txt_C" in td.get("class", [])), None)
        s = str(tr)
        um, wk, jk = cell("Umaban"), cell("Waku"), cell("Jockey")
        rows.append(dict(
            race_id=race_id, waku=num(wk.get_text(strip=True), int) if wk else None,
            umaban=num(um.get_text(strip=True), int) if um else None, horse=tds[hi].get_text(strip=True),
            sexage=tds[hi + 1].get_text(strip=True), weight_carried=num(tds[hi + 2].get_text(strip=True)),
            jockey=jk.get_text(strip=True) if jk else "", trainer=f"[{region}]{tt[-1] if tt else ''}",
            body=f"{wt[1]}({wt[2]})" if wt else "", odds=odds, popularity=ninki,
            horse_id=first(r"/horse/(\w+)", s), jockey_id=first(r"/jockey/(?:result/recent/)?(\w+)", s),
            trainer_id=first(r"/trainer/(?:result/recent/)?(\w+)", s)))
    return race, rows


def fill_pedigree(horse_ids, limit):
    from collect_pedigree import FIELDS, PED_CSV, parse_ped
    done = set(pd.read_csv(PED_CSV, dtype=str).horse_id) if PED_CSV.exists() else set()
    todo = [h for h in dict.fromkeys(horse_ids) if h and h not in done][:limit]
    old = common.SLEEP
    common.SLEEP = 2.5
    for h in todo:
        try:
            rec = parse_ped(fetch(f"https://db.netkeiba.com/horse/ped/{h}/"), h) or dict(horse_id=h)
        except Exception:
            continue
        pd.DataFrame([rec], columns=FIELDS).to_csv(PED_CSV, mode="a", header=not PED_CSV.exists(), index=False)
    common.SLEEP = old
    return len(todo)


def history():
    # 収集が同時に書き込み中でも読めるよう、途中の壊れた行は飛ばす
    races = pd.read_csv(RACES_CSV, dtype={"race_id": str, "place": str}, on_bad_lines="skip")
    res = pd.read_csv(RESULTS_CSV, dtype={"race_id": str, "horse_id": str, "jockey_id": str, "trainer_id": str},
                      on_bad_lines="skip", low_memory=False)
    return res.merge(races, on="race_id")


def predict(races_info, entries):
    """races_info: race dictのリスト, entries: 馬ごとのdictのリスト。返り値: 全馬の予想DataFrame。"""
    ent = pd.DataFrame(entries)
    meta = pd.DataFrame(races_info).set_index("race_id")
    ent = ent.join(meta.drop(columns=["start", "grade", "race_title"]), on="race_id")
    ent["draw_confirmed"] = ent.groupby("race_id")["umaban"].transform(lambda s: bool(s.notna().all()))
    # 枠順未確定は仮の並び(出走表の並び順)で計算
    ent["umaban"] = ent["umaban"].where(ent["umaban"].notna(), ent.groupby("race_id").cumcount() + 1)
    ent["rank"] = np.nan
    ent["time"] = None
    ent["last3f"] = np.nan
    df = clean(pd.concat([history(), ent], ignore_index=True))
    # レーティングを、履歴+出走馬で再計算(出走馬の『レース前』の値を使う)
    df["win"] = (df["rank"] == 1).astype(float)
    use = df["rank"].notna() | df["odds"].notna() | df["race_id"].isin(set(ent.race_id))
    sub = df[use]
    ph, pj, pp, _, _, pt = R.run(sub, lr_h=0.8, lr_j=0.06, lr_t=0.04)
    for c, v in (("rate_h", ph), ("rate_j", pj), ("rate_t", pt), ("rate_sum", ph + pj + pt), ("p_rate", pp)):
        df[c] = np.nan
        df.loc[sub.index, c] = v
    df = build(df)
    x = df[df.race_id.isin(set(ent.race_id))].copy()
    out = {}
    for name in ("win", "top3", "rank"):
        b = lgb.Booster(model_str=(MODELS / f"{name}_noodds.txt").read_text())
        out[name] = b.predict(x[b.feature_name()])
    x["p_win_raw"], x["p_top3"], x["rank_score"] = out["win"], out["top3"], out["rank"]
    x["p_win"] = x.p_win_raw / x.groupby("race_id")["p_win_raw"].transform("sum")
    return x


def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def blend_with_market(x):
    """オッズが全頭分出ているレースは、市場の確率を土台に、モデルは『差』だけを足して予想する(過信を防ぐ)。
    models/*_resid.txt が無い/オッズ未発表のレースは、市場なしモデルのまま(basis='市場なし(参考)')。"""
    import json
    x = x.copy()
    x["p_win_free"], x["p_top3_free"] = x["p_win"], x["p_top3"]
    x["basis"] = "市場なし(参考)"
    pf = MODELS / "resid_params.json"
    if not pf.exists():
        return x
    par = json.load(open(pf))
    ok = x.groupby("race_id")["odds"].transform(lambda s: bool(s.notna().all() and (s > 0).all()))
    if not ok.any():
        return x
    wb = lgb.Booster(model_str=(MODELS / "win_resid.txt").read_text())
    tb = lgb.Booster(model_str=(MODELS / "top3_resid.txt").read_text())
    y = x[ok].copy()
    inv = 1.0 / y["odds"].clip(lower=1.0)
    y["pm"] = inv / inv.groupby(y["race_id"]).transform("sum")
    z = np.c_[logit(y["pm"].values), np.log(y["field_size"].values)]
    p3m = sigmoid(z @ np.array(par["coef"][0]) + par["intercept"][0])
    pw = sigmoid(wb.predict(y[wb.feature_name()], raw_score=True) + logit(y["pm"].values))
    p3 = sigmoid(tb.predict(y[tb.feature_name()], raw_score=True) + logit(p3m))
    y["p_win"] = pw / pd.Series(pw, index=y.index).groupby(y["race_id"]).transform("sum")
    y["p_top3"] = p3
    y["basis"] = "市場込み"
    x.loc[y.index, ["p_win", "p_top3", "basis"]] = y[["p_win", "p_top3", "basis"]]
    return x


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=4)
    ap.add_argument("--ped-limit", type=int, default=200)
    ap.add_argument("--max-races", type=int, default=10 ** 9)
    a = ap.parse_args()
    now = dt.datetime.now()
    infos, rows = [], []
    for k in range(a.days):
        d = (now + dt.timedelta(days=k)).date()
        for rid in race_ids_for(d):
            if len(infos) >= a.max_races:
                break
            try:
                race, ent = fetch_entries(rid)
            except Exception as e:
                print("skip", rid, e)
                continue
            if not race or not ent:
                continue
            if race["start"] and dt.datetime.fromisoformat(f"{race['date']} {race['start']}") < now:
                continue  # すでに発走したレースは対象外
            infos.append(race)
            rows += ent
        print(f"{d}: 累計 {len(infos)}レース", flush=True)
    if not infos:
        print("対象レースなし")
        return
    n = fill_pedigree([r["horse_id"] for r in rows], a.ped_limit)
    print(f"新しい馬の血統を {n} 頭取得")
    x = blend_with_market(predict(infos, rows))
    x = x.join(pd.DataFrame(infos).set_index("race_id")[["start", "grade", "race_title"]], on="race_id")
    keep = ["race_id", "date", "start", "circuit", "place", "race_no", "race_name", "race_title", "grade", "surface", "distance", "going",
            "umaban", "waku", "horse", "sexage", "jockey", "trainer", "odds", "popularity", "p_win", "p_top3", "rank_score",
            "p_win_free", "p_top3_free", "basis",
            "draw_confirmed", "class_group", "field_size"]
    x = x[keep].sort_values(["date", "start", "race_id", "p_win"], ascending=[True, True, True, False])
    x.to_csv(DATA / "upcoming_latest.csv", index=False, encoding="utf-8-sig")
    log = x[["race_id", "umaban", "horse", "p_win", "p_top3", "rank_score", "p_win_free", "basis", "odds", "popularity", "draw_confirmed"]].assign(
        snapshot=now.strftime("%Y-%m-%d %H:%M"))
    lf = DATA / "predictions_log.csv"
    if lf.exists():  # 列が増えても壊れないよう、既存の記録と結合して書き直す
        log = pd.concat([pd.read_csv(lf, dtype={"race_id": str}, encoding="utf-8-sig"), log], ignore_index=True)
    log.to_csv(lf, index=False, encoding="utf-8-sig")
    print(f"予想 {x.race_id.nunique()}レース / {len(x)}頭 → data/upcoming_latest.csv")


if __name__ == "__main__":
    main()
