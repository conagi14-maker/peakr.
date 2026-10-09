"""出馬表から予想。  python predict.py <race_id> [--use-odds]

出馬表ページ(race.netkeiba.com / nar.netkeiba.com)を取得し、過去成績と結合して
勝率・複勝率・ランキングスコアを出す。"""
import argparse
import re

import lightgbm as lgb
import pandas as pd
from bs4 import BeautifulSoup

from common import MODELS, RESULTS_CSV, RACES_CSV, circuit_of, fetch
from features import build, clean, feature_cols


def fetch_entries(race_id: str):
    host = "race" if circuit_of(race_id) == "JRA" else "nar"
    html = fetch(f"https://{host}.netkeiba.com/race/shutuba.html?race_id={race_id}")
    soup = BeautifulSoup(html, "html.parser")
    info = soup.select_one(".RaceData01")
    text = info.get_text(" ", strip=True) if info else ""
    m = lambda p: (re.search(p, text) or [None, None])[1]
    race = dict(race_id=race_id, circuit=circuit_of(race_id), place=race_id[4:6], race_no=int(race_id[10:12]),
                surface=m(r"(芝|ダ|障)"), distance=m(r"(\d{3,4})\s*m"), weather=None, going=m(r"馬場:(\S+)"))
    rows = []
    for tr in soup.select("tr.HorseList"):
        tds = tr.find_all("td")
        href = lambda pat: (re.search(pat, str(tr)) or [None, None])[1]
        rows.append(dict(
            waku=tds[0].get_text(strip=True), umaban=tds[1].get_text(strip=True),
            horse=tr.select_one(".HorseName").get_text(strip=True), sexage=tds[4].get_text(strip=True),
            weight_carried=tds[5].get_text(strip=True), jockey=tds[6].get_text(strip=True),
            body=tds[8].get_text(strip=True), odds=tds[9].get_text(strip=True),
            popularity=tds[10].get_text(strip=True),
            horse_id=href(r"/horse/(\w+)"), jockey_id=href(r"/jockey/(?:result/recent/)?(\w+)"),
            trainer_id=href(r"/trainer/(?:result/recent/)?(\w+)"), race_id=race_id))
    return race, pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("race_id")
    ap.add_argument("--date", help="開催日 YYYY-MM-DD(省略時は今日)")
    ap.add_argument("--use-odds", action="store_true")
    a = ap.parse_args()
    tag = "odds" if a.use_odds else "noodds"
    
    race, ent = fetch_entries(a.race_id)
    if ent.empty:
        raise SystemExit("出馬表を取得できませんでした(race_idか公開時期を確認)")
    ent = ent.assign(**{k: v for k, v in race.items() if k != "race_id"},
                     date=a.date or pd.Timestamp.today().date().isoformat(), rank=None)
    races = pd.read_csv(RACES_CSV, dtype={"race_id": str, "place": str})
    hist = pd.read_csv(RESULTS_CSV, dtype={"race_id": str, "horse_id": str, "jockey_id": str, "trainer_id": str}
                       ).merge(races, on="race_id")
    hist = hist[hist.race_id != a.race_id]
    df = build(clean(pd.concat([hist, ent], ignore_index=True)))
    x = df[df.race_id == a.race_id].copy()
    cols = feature_cols(a.use_odds, df)

    x["p_win"] = lgb.Booster(model_str=(MODELS / f"win_{tag}.txt").read_text()).predict(x[cols])
    x["p_top3"] = lgb.Booster(model_str=(MODELS / f"top3_{tag}.txt").read_text()).predict(x[cols])
    x["rank_score"] = lgb.Booster(model_str=(MODELS / f"rank_{tag}.txt").read_text()).predict(x[cols])
    x["p_win"] /= x["p_win"].sum()  # レース内で合計1に正規化
    x["EV"] = x["p_win"] * x["odds"]
    out = x.sort_values("rank_score", ascending=False)[
        ["umaban", "horse", "jockey", "odds", "p_win", "p_top3", "rank_score", "EV"]]
    print(out.round(3).to_string(index=False))


if __name__ == "__main__":
    main()
