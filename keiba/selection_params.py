"""「狙い目(堅い)」「鉄板級」「波乱含み」の基準と、その過去の実績を計算して data/selection_params.json に保存する。

  python selection_params.py
- 市場込みモデル(オッズあり): data/oos_residual_new.pkl (residual_model.py の時系列検証の予想)
- 市場なしモデル(オッズ未発表時の参考): data/test_preds_noodds.pkl (train.py のテスト期間の予想)
"""
import json

import numpy as np
import pandas as pd

from common import DATA

THRESH = {"market": dict(solid=(0.45, 0.10), ironclad=(0.60, 0.10)),     # (予想1位の勝率, 2位との差)
          "free": dict(solid=(0.40, 0.10), ironclad=(0.50, 0.10))}


def norm_entropy(s, n):
    p = s / s.sum()
    return float(-(p * np.log(p.clip(1e-9))).sum() / np.log(max(n, 2)))


def analyze(pr, pcol, th):
    pr = pr.copy()
    pr["p"] = pr[pcol] / pr.groupby("race_id")[pcol].transform("sum")
    pr["ret"] = pr.win * pr.odds
    g = pr.sort_values(["race_id", "p"], ascending=[True, False])
    top = g.groupby("race_id").head(1).set_index("race_id")
    sec = g.groupby("race_id").nth(1).set_index("race_id")
    r = top[["p", "win", "top3", "ret", "circuit"]].rename(columns={"p": "p1"})
    r["gap"] = r.p1 - sec.p
    r["ent"] = pr.groupby("race_id").apply(lambda x: norm_entropy(x.p, len(x)))
    wp = pr[pr.win == 1].groupby("race_id").popularity.first()
    r["upset"] = (wp >= 5).reindex(r.index)

    def st(m):
        x = r[m]
        return dict(n=int(len(x)), share=float(len(x) / len(r)), hit=float(x.win.mean()), top3=float(x.top3.mean()),
                    roi=float(x.ret.mean()))
    out = {"n_races": int(len(r)), "thresholds": th}
    out["ent_q80"] = float(r.ent.quantile(0.8))
    out["solid"] = st((r.p1 >= th["solid"][0]) & (r.gap >= th["solid"][1]))
    out["ironclad"] = st((r.p1 >= th["ironclad"][0]) & (r.gap >= th["ironclad"][1]))
    x, y = r[r.ent >= out["ent_q80"]], r[r.ent < r.ent.quantile(0.2)]
    out["rough"] = dict(n=int(len(x)), upset=float(x.upset.mean()), hit=float(x.win.mean()))
    out["firm_upset"] = float(y.upset.mean())
    return out


def main():
    res = {}
    f = DATA / "oos_residual_new.pkl"
    if f.exists():
        res["market"] = analyze(pd.read_pickle(f), "p", THRESH["market"])
    f = DATA / "test_preds_noodds.pkl"
    if f.exists():
        res["free"] = analyze(pd.read_pickle(f), "p_win", THRESH["free"])
    json.dump(res, open(DATA / "selection_params.json", "w"), ensure_ascii=False, indent=1)
    for k, v in res.items():
        print(k, json.dumps({a: v[a] for a in ("solid", "ironclad", "rough", "firm_upset", "ent_q80")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
