"""血統(父・母父・父の父・母)の収集。1頭1リクエスト、取得済みは再取得しない(再開可)。

出走回数の多い馬から順に取るので、途中で止めてもそこまでの分は特徴量に使える。
  python collect_pedigree.py                 # 全頭(間隔2.5秒。約25時間)
  python collect_pedigree.py --max-horses 500 --sleep 3
"""
import argparse
import re

import pandas as pd
from bs4 import BeautifulSoup

import common
from common import DATA, RESULTS_CSV, fetch

PED_CSV = DATA / "pedigree.csv"
FIELDS = ["horse_id", "sire", "sire_id", "ss", "ss_id", "dam", "damsire", "damsire_id"]


def parse_ped(html: str, horse_id: str):
    t = BeautifulSoup(html, "html.parser").select_one("table.blood_table")
    rows = t.find_all("tr") if t else []
    if len(rows) < 17:
        return None

    def cell(tr, i):
        tds = tr.find_all("td")
        a = tds[i].find("a") if len(tds) > i else None
        m = re.search(r"/horse/(\w+)", a["href"]) if a else None
        return (a.get_text(strip=True), m[1] if m else None) if a else (None, None)

    sire, ss, dam, dsire = cell(rows[0], 0), cell(rows[0], 1), cell(rows[16], 0), cell(rows[16], 1)
    if not sire[0] or not dam[0]:
        return None
    return dict(horse_id=horse_id, sire=sire[0], sire_id=sire[1], ss=ss[0], ss_id=ss[1],
                dam=dam[0], damsire=dsire[0], damsire_id=dsire[1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sleep", type=float, default=2.5)
    ap.add_argument("--max-horses", type=int, default=10**9)
    ap.add_argument("--max-minutes", type=float, default=None, help="この時間で打ち切る(残りは次回)")
    a = ap.parse_args()
    common.SLEEP = a.sleep

    runs = pd.read_csv(RESULTS_CSV, dtype=str, usecols=["horse_id"]).horse_id.value_counts()
    done = set(pd.read_csv(PED_CSV, dtype=str).horse_id) if PED_CSV.exists() else set()
    todo = [h for h in runs.index if h not in done and isinstance(h, str)][: a.max_horses]
    print(f"todo {len(todo)} / total {len(runs)}", flush=True)
    import time as _t
    t_end = _t.time() + a.max_minutes * 60 if a.max_minutes else None
    for i, h in enumerate(todo, 1):
        if t_end and _t.time() > t_end:
            print("時間上限のため中断(次回続きから)")
            break
        try:
            rec = parse_ped(fetch(f"https://db.netkeiba.com/horse/ped/{h}/"), h)
        except Exception as e:
            print("skip", h, e)
            continue
        if rec is None:  # 血統が空の馬は空行で記録し、無限に再取得しない
            rec = dict(horse_id=h)
        pd.DataFrame([rec], columns=FIELDS).to_csv(PED_CSV, mode="a", header=not PED_CSV.exists(), index=False)
        if i % 200 == 0:
            print(f"{i}/{len(todo)}", flush=True)


if __name__ == "__main__":
    main()
