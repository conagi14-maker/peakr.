"""レース名に 芝/ダ/障 を含むレースの surface/distance を、正しいコース表記から取り直して races.csv を修正する。
途中で止まっても再開可(data/course_fix.csv に1レースずつ保存)。
  python fix_course.py [--apply]     # --apply で races.csv に反映
"""
import argparse

import pandas as pd

import common
from collect import append, parse_race
from common import DATA, RACES_CSV

FIX = DATA / "course_fix.csv"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--sleep", type=float, default=1.5)
    a = ap.parse_args()
    common.SLEEP = a.sleep
    r = pd.read_csv(RACES_CSV, dtype=str)
    sus = r[r.race_name.fillna("").str.contains("[芝ダ障]")]
    done = set(pd.read_csv(FIX, dtype=str).race_id) if FIX.exists() else set()
    todo = sus[~sus.race_id.isin(done)]
    print(f"対象 {len(sus)} / 未処理 {len(todo)}", flush=True)
    for i, (rid, d) in enumerate(zip(todo.race_id, todo.date), 1):
        try:
            race, _ = parse_race(rid, pd.Timestamp(d).date())
        except Exception as e:
            print("skip", rid, e)
            continue
        if race:
            append(FIX, [dict(race_id=rid, surface=race["surface"], distance=race["distance"])])
        if i % 100 == 0:
            print(f"{i}/{len(todo)}", flush=True)
    if a.apply and FIX.exists():
        fx = pd.read_csv(FIX, dtype=str).drop_duplicates("race_id", keep="last").set_index("race_id")
        ch = 0
        for col in ("surface", "distance"):
            new = r.race_id.map(fx[col])
            m = new.notna() & (new != r[col])
            ch += int(m.sum())
            r.loc[m, col] = new[m]
        r.to_csv(RACES_CSV, index=False)
        print(f"races.csv を修正: {ch} セル")


if __name__ == "__main__":
    main()
