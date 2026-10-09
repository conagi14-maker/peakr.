"""払戻金(単勝・複勝・枠連・馬連・ワイド・馬単・三連複・三連単)の収集。

結果ページを再取得して data/payouts.csv に保存する。取得済みレースは飛ばす(再開可)。
  python collect_payouts.py --year 2024 --circuit JRA      # 試験(約3,450レース・約2.7時間)
  python collect_payouts.py --year 2024                    # 2024年全体
"""
import argparse

import pandas as pd
from bs4 import BeautifulSoup

import common
from collect import append, parse_payouts
from common import PAYOUTS_CSV, RACES_CSV, fetch


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year")
    ap.add_argument("--circuit", choices=["JRA", "NAR"])
    ap.add_argument("--sleep", type=float, default=2.5)
    ap.add_argument("--max-races", type=int, default=10**9)
    a = ap.parse_args()
    common.SLEEP = a.sleep
    races = pd.read_csv(RACES_CSV, dtype=str)
    if a.year:
        races = races[races.date.str[:4] == a.year]
    if a.circuit:
        races = races[races.circuit == a.circuit]
    done = set(pd.read_csv(PAYOUTS_CSV, dtype=str).race_id) if PAYOUTS_CSV.exists() else set()
    todo = races[~races.race_id.isin(done)].race_id.tolist()[: a.max_races]
    print(f"todo {len(todo)} / {len(races)}", flush=True)
    for i, rid in enumerate(todo, 1):
        try:
            rows = parse_payouts(fetch(f"https://db.netkeiba.com/race/{rid}/"), rid)
        except Exception as e:
            print("skip", rid, e)
            continue
        if not any(r["bet"] == "単勝" for r in rows):  # 不成立などで払戻が無い
            rows = [dict(race_id=rid, bet="なし", combo="", payout="", pop="")]
        append(PAYOUTS_CSV, rows)
        if i % 200 == 0:
            print(f"{i}/{len(todo)}", flush=True)


if __name__ == "__main__":
    main()
