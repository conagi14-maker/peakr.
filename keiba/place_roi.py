"""複勝・ワイドの回収率検証(実際の払戻金を使用)。

学習: 評価開始日より前のデータだけ。評価: payouts.csv があるレースのみ。
  python place_roi.py --start 2024-01-01 [--circuit JRA]
手順: 単勝オッズ → 市場の「3着内確率」を較正 → その上に残差モデルを学習 → 払戻で回収率を測る。
"""
import argparse

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss

from common import PAYOUTS_CSV
from features import build, feature_cols, load, training_rows
from residual_model import R, logit, market_prob


def fuku_table():
    p = pd.read_csv(PAYOUTS_CSV, dtype=str).fillna("")
    f = p[p.bet == "複勝"].copy()
    f["umaban"] = f.combo.astype(int)
    f["fuku"] = f.payout.astype(float) / 100
    w = p[p.bet == "ワイド"].copy()
    w["fuku"] = w.payout.astype(float) / 100
    return set(p[p.bet != "なし"].race_id), f[["race_id", "umaban", "fuku"]], w[["race_id", "combo", "fuku"]]


def roi(r):
    return "   -   " if len(r) == 0 else f"{np.mean(r):.3f}±{np.std(r) / np.sqrt(len(r)):.3f} (n={len(r)})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2024-01-01")
    ap.add_argument("--circuit", choices=["JRA", "NAR"])
    a = ap.parse_args()
    ok_races, fuku, wide = fuku_table()
    df = training_rows(build(load())).dropna(subset=["odds"]).reset_index(drop=True)
    df["pm"] = market_prob(df)
    cutoff = pd.Timestamp(a.start)
    tr_all = df[df.date < cutoff].copy()
    te = df[(df.date >= cutoff) & df.race_id.isin(ok_races)].copy()
    if a.circuit:
        te = te[te.circuit == a.circuit]
    print(f"学習 {len(tr_all)}行 / 評価 {len(te)}行 ({te.race_id.nunique()}レース)")

    # 1) 市場の3着内確率: 単勝の市場確率と頭数から較正(これが「市場の基準線」)
    X = lambda d: np.c_[logit(d["pm"].values), np.log(d["field_size"].values)]
    lr = LogisticRegression(C=100).fit(X(tr_all), tr_all["top3"])
    for d in (tr_all, te):
        d["p3m"] = lr.predict_proba(X(d))[:, 1]

    # 2) 市場基準の上に残差モデル(3着内)
    cols = feature_cols(False, df)
    d2 = np.sort(tr_all["date"].unique()); v0 = d2[int(len(d2) * 0.85)]
    tr, va = tr_all[tr_all.date < v0], tr_all[tr_all.date >= v0]
    m = lgb.LGBMClassifier(n_estimators=3000, **R)
    m.fit(tr[cols], tr["top3"], init_score=logit(tr["p3m"].values),
          eval_set=[(va[cols], va["top3"])], eval_init_score=[logit(va["p3m"].values)],
          callbacks=[lgb.early_stopping(100, verbose=False)])
    te["p3"] = 1 / (1 + np.exp(-(m.predict(te[cols], raw_score=True) + logit(te["p3m"].values))))
    print(f"3着内 logloss  市場基準={log_loss(te['top3'], te['p3m']):.5f}  モデル={log_loss(te['top3'], te['p3']):.5f}")

    te = te.merge(fuku, on=["race_id", "umaban"], how="left")
    te["ret"] = te["fuku"].fillna(0.0)  # 3着内でなければ0

    print("\n=== 複勝 (100円ずつ購入。回収率1.00=収支ゼロ) ===")
    print("全頭買い          ", roi(te["ret"]))
    print("1番人気           ", roi(te[te.popularity == 1]["ret"]))
    top = te.loc[te.groupby("race_id")["p3"].idxmax()]
    print("モデル1位         ", roi(top["ret"]))
    for mg in (1.05, 1.10, 1.20):
        for mp in (0.0, 0.3):
            b = te[(te.p3 > te.p3m * mg) & (te.p3 >= mp)]
            print(f"p3>市場×{mg} & p3>={mp:.1f}", roi(b["ret"]))
    print("(参考)p3の高い順に分けた回収率:")
    te["bin"] = pd.qcut(te["p3"], 5, labels=False, duplicates="drop")
    for k, g in te.groupby("bin"):
        print(f"   p3 {g.p3.min():.2f}-{g.p3.max():.2f}", roi(g["ret"]))

    print("\n=== ワイド (100円ずつ) ===")
    wmap = {(r, c): v for r, c, v in wide.itertuples(index=False)}
    def wide_roi(rule):
        out = []
        for rid, g in te.groupby("race_id"):
            for x, y in rule(g):
                key = (rid, "-".join(str(n) for n in sorted((int(x), int(y)))))
                out.append(wmap.get(key, 0.0))
        return out
    top2 = lambda col: (lambda g: [tuple(g.nlargest(2, col).umaban)] if len(g) >= 4 else [])
    top3c = lambda col: (lambda g: [(a, b) for i, a in enumerate(g.nlargest(3, col).umaban) for b in list(g.nlargest(3, col).umaban)[i + 1:]] if len(g) >= 4 else [])
    te["pop_score"] = -te["popularity"]
    print("人気上位2頭      ", roi(wide_roi(top2("pop_score"))))
    print("モデル上位2頭    ", roi(wide_roi(top2("p3"))))
    print("モデル上位3頭BOX ", roi(wide_roi(top3c("p3"))))
    print("人気上位3頭BOX   ", roi(wide_roi(top3c("pop_score"))))


if __name__ == "__main__":
    main()
