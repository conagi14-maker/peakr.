"""日次/週次の収集。未取得のレースだけを追加する(差分収集)。

使い方:
  python collect.py --start 2024-01-01 --end 2024-01-31   # 期間指定(初回バックフィル)
  python collect.py                                        # 前回の続き〜昨日まで(ルーティン用)
"""
import argparse
import re
from datetime import date, datetime, timedelta

import pandas as pd
from bs4 import BeautifulSoup

from validate import validate_race

from common import DATA, EXCLUDE_PLACES, PASSING_CSV, PAYOUTS_CSV, RACES_CSV, RESULTS_CSV, circuit_of, fetch

COLS = {"着順": "rank", "枠番": "waku", "馬番": "umaban", "馬名": "horse", "性齢": "sexage",
        "斤量": "weight_carried", "騎手": "jockey", "タイム": "time", "上り": "last3f",
        "単勝": "odds", "人気": "popularity", "馬体重": "body", "調教師": "trainer", "通過": "passing", "賞金(万円)": "prize"}


def race_ids_on(d: date) -> list[str]:
    html = fetch(f"https://db.netkeiba.com/race/list/{d:%Y%m%d}/")
    return sorted(i for i in set(re.findall(r"/race/(\d{12})/", html)) if i[4:6] not in EXCLUDE_PLACES)


PRIZE_CSV = DATA / "prize.csv"  # 賞金(万円) (race_id, umaban, prize)。1着〜入賞馬のみ値がある


def parse_payouts(html: str, race_id: str):
    """払戻金の表(単勝・複勝・枠連・馬連・ワイド・馬単・三連複・三連単)。"""
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for t in soup.select("table.pay_table_01"):
        for tr in t.find_all("tr"):
            th, tds = tr.find("th"), tr.find_all("td")
            if th is None or len(tds) < 2:
                continue
            combos = tds[0].get_text("/", strip=True).split("/")
            pays = tds[1].get_text("/", strip=True).replace(",", "").split("/")
            pops = tds[2].get_text("/", strip=True).split("/") if len(tds) > 2 else [""] * len(combos)
            if len(combos) != len(pays):
                continue
            for i, (cb, pay) in enumerate(zip(combos, pays)):
                out.append(dict(race_id=race_id, bet=th.get_text(strip=True), combo=cb, payout=pay,
                                pop=pops[i] if i < len(pops) else ""))
    if not any(r["bet"] == "単勝" for r in out):  # 不成立などで払戻が無い
        out = [dict(race_id=race_id, bet="なし", combo="", payout="", pop="")]
    return out


def course(text: str):
    """文面から (芝/ダ/障, 距離) を取り出す。レース名に含まれる芝・ダ・障の字に惑わされない。"""
    # 「芝右1600m」「障ダ右3000m」「芝左 外1600m」の形だけを採る(レース名の「芝桜特別」等をまたがない)
    # 障害は「障芝 ダート2970m」のように芝とダートが並ぶ表記もある
    m = re.search(r"(障[ダ芝]?|芝|ダ)(?:右|左|直線)?(?:\s*(?:内|外)(?:2周)?)?(?:\s*(?:ダート|ダ|芝))?\s*(\d{3,4})\s*m", text)
    if m:
        return ("障" if m[1].startswith("障") else m[1], m[2])
    return (None, None)


def parse_race(race_id: str, d: date, extra: bool = False):
    html = fetch(f"https://db.netkeiba.com/race/{race_id}/")
    soup = BeautifulSoup(html, "html.parser")
    intro = soup.select_one("div.data_intro, .racedata")
    text = intro.get_text(" ", strip=True) if intro else ""
    name = soup.select_one("dl.racedata h1")
    m = lambda p: (re.search(p, text) or [None, None])[1]
    race = {
        "race_id": race_id, "date": d.isoformat(), "circuit": circuit_of(race_id),
        "place": race_id[4:6], "race_no": int(race_id[10:12]),
        "race_name": name.get_text(strip=True) if name else "",
        # コース表記(芝右1600m 等)は距離の直前にあるものを採る。レース名の「芝桜賞」等を拾わないため
        "surface": course(text)[0], "distance": course(text)[1],
        "weather": m(r"天候\s*:\s*(\S+)"), "going": m(r"(?:芝|ダート?)\s*:\s*(良|稍重|重|不良|稍|不)"),
    }
    table = soup.select_one("table.race_table_01")
    if table is None:
        return (None, [], []) if extra else (None, [])
    rows = table.find_all("tr")
    head = [c.get_text(strip=True) for c in rows[0].find_all(["th", "td"])]
    out = []
    for tr in rows[1:]:
        tds = tr.find_all("td")
        if len(tds) != len(head):
            continue
        rec = {COLS[h]: td.get_text(strip=True) for h, td in zip(head, tds) if h in COLS}
        href = lambda pat: (re.search(pat, str(tr)) or [None, None])[1]
        rec.update(race_id=race_id, horse_id=href(r"/horse/(\w+)"),
                   jockey_id=href(r"/jockey/(?:result/recent/)?(\w+)"),
                   trainer_id=href(r"/trainer/(?:result/recent/)?(\w+)"))
        out.append(rec)
    return (race, out, parse_payouts(html, race_id)) if extra else (race, out)


def append(path, rows):
    if not rows:
        return
    df = pd.DataFrame(rows)
    df.to_csv(path, mode="a", header=not path.exists(), index=False, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--max-minutes", type=float, default=None, help="この時間で打ち切る(残りは次回。毎日の実行用)")
    a = ap.parse_args()
    DATA.mkdir(exist_ok=True)

    known = set(pd.read_csv(RACES_CSV, dtype={"race_id": str}).race_id) if RACES_CSV.exists() else set()
    if a.start:
        start = datetime.strptime(a.start, "%Y-%m-%d").date()
    elif RACES_CSV.exists():
        start = pd.to_datetime(pd.read_csv(RACES_CSV).date).max().date()  # 最終日は取りこぼし対策で再走査
    else:
        start = date.today() - timedelta(days=30)
    end = datetime.strptime(a.end, "%Y-%m-%d").date() if a.end else date.today() - timedelta(days=1)

    import time as _t
    t_end = _t.time() + a.max_minutes * 60 if a.max_minutes else None
    d = start
    while d <= end:
        if t_end and _t.time() > t_end:
            print("時間上限のため中断(次回続きから)")
            break
        ids = [i for i in race_ids_on(d) if i not in known]
        print(f"{d} new races: {len(ids)}", flush=True)
        for rid in ids:
            if t_end and _t.time() > t_end:
                break
            try:
                race, rows, pays = parse_race(rid, d, extra=True)
            except Exception as e:  # 1レースの失敗で全体を止めない
                print("  skip", rid, e)
                continue
            problems = validate_race(race, rows) if race and rows else ["取得内容が空"]
            if problems:  # 不正データは保存しない(記録して次回以降に再試行)
                print("  reject", rid, "; ".join(problems[:3]))
                with open(DATA / "rejected.log", "a", encoding="utf-8") as f:
                    f.write(f"{d}\t{rid}\t{'; '.join(problems)}\n")
                continue
            append(RACES_CSV, [race])
            append(PASSING_CSV, [dict(race_id=rid, umaban=r.get("umaban"), passing=r.pop("passing", None)) for r in rows])
            append(PRIZE_CSV, [dict(race_id=rid, umaban=r.get("umaban"), prize=r.pop("prize", None)) for r in rows])
            append(PAYOUTS_CSV, pays)
            append(RESULTS_CSV, rows)
            known.add(rid)
        d += timedelta(days=1)


if __name__ == "__main__":
    main()
