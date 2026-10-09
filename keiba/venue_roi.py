"""競馬場別の単勝回収率(時系列の分割検証。全部「学習に使っていない期間」の予測)。

データを日付順に5分割し、過去分で学習 → 次の区間を予測、を繰り返す(区間2〜5が評価対象)。
  python venue_roi.py [--use-odds]
"""
import argparse

import lightgbm as lgb
import numpy as np
import pandas as pd

from features import build, feature_cols, load, training_rows
from train import P, norm

PLACE = {"01": "札幌", "02": "函館", "03": "福島", "04": "新潟", "05": "東京", "06": "中山", "07": "中京",
         "08": "京都", "09": "阪神", "10": "小倉", "30": "門別", "35": "盛岡", "36": "水沢", "42": "浦和",
         "43": "船橋", "44": "大井", "45": "川崎", "46": "金沢", "47": "笠松", "48": "名古屋", "50": "園田",
         "51": "姫路", "54": "高知", "55": "佐賀"}


def oos_predictions(df, cols, folds=5):
    dates = np.sort(df["date"].unique())
    cut = [dates[int(len(dates) * i / folds)] for i in range(folds)] + [dates[-1] + np.timedelta64(1, "D")]
    out = []
    for k in range(1, folds):
        tr_all = df[df.date < cut[k]]
        te = df[(df.date >= cut[k]) & (df.date < cut[k + 1])]
        d2 = np.sort(tr_all["date"].unique())
        v0 = d2[int(len(d2) * 0.85)]
        tr, va = tr_all[tr_all.date < v0], tr_all[tr_all.date >= v0]
        m = lgb.LGBMClassifier(n_estimators=1000, **P)
        m.fit(tr[cols], tr["win"], eval_set=[(va[cols], va["win"])], callbacks=[lgb.early_stopping(50, verbose=False)])
        out.append(te.assign(p=norm(te, m.predict_proba(te[cols])[:, 1])))
        print(f"  fold {k}: {len(te)} rows ({str(cut[k])[:10]}~)", flush=True)
    return pd.concat(out)


def summarize(g):
    """g: 1つの競馬場の予測。回収率=100円ずつ買った時の払戻/購入額、±は標準誤差。"""
    def roi(b):
        if len(b) == 0:
            return "-"
        r = b["win"] * b["odds"]
        return f"{r.mean():.2f}±{r.std() / np.sqrt(len(b)):.2f}"
    top = g.loc[g.groupby("race_id")["p"].idxmax()]
    fav = g[g["popularity"] == 1]
    ev = g[g["p"] * g["odds"] > 1.0]
    return pd.Series({"レース数": top.shape[0], "1番人気": roi(fav), "モデル1位": roi(top),
                      "EV>1購入数": len(ev), "EV>1": roi(ev)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--use-odds", action="store_true")
    a = ap.parse_args()
    df = training_rows(build(load())).dropna(subset=["odds"])
    cols = feature_cols(a.use_odds, df)
    pr = oos_predictions(df, cols)
    pr["競馬場"] = pr["place"].astype(str).map(PLACE)
    t = pr.groupby("競馬場").apply(summarize)
    t["_n"] = t["レース数"]
    t = t.sort_values("_n", ascending=False).drop(columns="_n")
    print(f"\n=== 競馬場別 単勝回収率 (1.00=収支ゼロ / odds込み={a.use_odds}) ===")
    print(t.to_string())
    print("\n全体:", summarize(pr).to_dict())
    t.to_csv(f"venue_roi_{'odds' if a.use_odds else 'noodds'}.csv", encoding="utf-8-sig")


if __name__ == "__main__":
    main()
