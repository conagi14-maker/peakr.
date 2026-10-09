"""通過順位(脚質の元データ)の取り直し。既存の races.csv にあるレースだけを対象に、
結果ページを再取得して data/passing.csv に保存する。取得済みは飛ばす(再開可)。

  python collect_passing.py --year 2024 --circuit JRA     # 試験: 2024年のJRAのみ(約3,500レース)
  python collect_passing.py --sleep 3
"""
import argparse

import pandas as pd

import common
from collect import append, parse_race
from common import PASSING_CSV, RACES_CSV


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year")
    ap.add_argument("--circuit", choices=["JRA", "NAR"])
    ap.add_argument("--sleep", type=float, default=2.5)
    a = ap.parse_args()
    common.SLEEP = a.sleep
    races = pd.read_csv(RACES_CSV, dtype=str)
    if a.year:
        races = races[races.date.str[:4] == a.year]
    if a.circuit:
        races = races[races.circuit == a.circuit]
    done = set(pd.read_csv(PASSING_CSV, dtype=str).race_id) if PASSING_CSV.exists() else set()
    todo = races[~races.race_id.isin(done)]
    print(f"todo {len(todo)} / {len(races)}", flush=True)
    for i, (rid, d) in enumerate(zip(todo.race_id, todo.date), 1):
        try:
            _, rows = parse_race(rid, pd.Timestamp(d).date())
        except Exception as e:
            print("skip", rid, e)
            continue
        append(PASSING_CSV, [dict(race_id=rid, umaban=r.get("umaban"), passing=r.get("passing")) for r in rows])
        if i % 200 == 0:
            print(f"{i}/{len(todo)}", flush=True)


if __name__ == "__main__":
    main()
