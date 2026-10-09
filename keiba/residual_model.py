"""市場(オッズ)の確率を土台に、「市場との差」だけを学習するモデルの時系列検証。

  python residual_model.py            # 新特徴量(クラス/馬場バイアス)あり
  python residual_model.py --no-new   # 新特徴量なし(比較用)
評価はすべて学習に使っていない区間(5分割の2〜5番目)。市場の確率より logloss が下がれば
「市場が織り込んでいない情報」を捉えられている証拠。
"""
import argparse

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import log_loss

from features import build, feature_cols, load, training_rows
from train import P, norm

R = dict(P, learning_rate=0.02, num_leaves=15, min_child_samples=200, reg_lambda=10.0)


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def market_prob(df):
    inv = 1.0 / df["odds"].clip(lower=1.0)
    return (inv / inv.groupby(df["race_id"]).transform("sum")).values


def walk_forward(df, cols, folds=5):
    dates = np.sort(df["date"].unique())
    cut = [dates[int(len(dates) * i / folds)] for i in range(folds)] + [dates[-1] + np.timedelta64(1, "D")]
    out = []
    for k in range(1, folds):
        tr_all = df[df.date < cut[k]]
        te = df[(df.date >= cut[k]) & (df.date < cut[k + 1])]
        d2 = np.sort(tr_all["date"].unique())
        v0 = d2[int(len(d2) * 0.85)]
        tr, va = tr_all[tr_all.date < v0], tr_all[tr_all.date >= v0]
        m = lgb.LGBMClassifier(n_estimators=3000, **R)
        m.fit(tr[cols], tr["win"], init_score=logit(tr["pm"].values),
              eval_set=[(va[cols], va["win"])], eval_init_score=[logit(va["pm"].values)],
              callbacks=[lgb.early_stopping(100, verbose=False)])
        raw = m.predict(te[cols], raw_score=True) + logit(te["pm"].values)
        out.append(te.assign(p=norm(te, 1 / (1 + np.exp(-raw))), fold=k))
        print(f"  fold {k}: {len(te)} rows, trees={m.best_iteration_}", flush=True)
    return pd.concat(out)


def roi(b):
    if len(b) == 0:
        return "   -   "
    r = b["win"] * b["odds"]
    return f"{r.mean():.3f}±{r.std() / np.sqrt(len(b)):.3f} (n={len(b)})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-new", action="store_true")
    ap.add_argument("--no-rating", action="store_true")
    a = ap.parse_args()
    df = training_rows(build(load())).dropna(subset=["odds"]).reset_index(drop=True)
    df["pm"] = market_prob(df)
    cols = feature_cols(False, df, use_new=not a.no_new, use_rating=not a.no_rating)  # 市場は土台に入れるので特徴量にオッズは入れない
    pr = walk_forward(df, cols)
    pr.to_pickle(f"data/oos_residual_{'old' if a.no_new else 'new'}.pkl")

    print(f"\n=== 市場との差を学習 (新特徴量={'なし' if a.no_new else 'あり'}, 特徴量{len(cols)}個) ===")
    ll_m, ll_r = log_loss(pr["win"], pr["pm"]), log_loss(pr["win"], pr["p"])
    print(f"logloss  市場={ll_m:.5f}  モデル={ll_r:.5f}  改善={ll_m - ll_r:+.5f} (正ならモデルが市場より良い)")
    top = pr.loc[pr.groupby("race_id")["p"].idxmax()]
    print("1番人気        ", roi(pr[pr.popularity == 1]))
    print("モデル1位      ", roi(top))
    for th in (1.0, 1.1, 1.2, 1.3, 1.5):
        print(f"EV>{th}        ", roi(pr[pr.p * pr.odds > th]))
    for th in (1.1, 1.2, 1.3):
        print(f"EV>{th}&勝率>=10%", roi(pr[(pr.p * pr.odds > th) & (pr.p >= 0.10)]))
    print("--- 競馬場種別 ---")
    for c, g in pr.groupby("circuit"):
        t = g.loc[g.groupby("race_id")["p"].idxmax()]
        print(c, "1番人気", roi(g[g.popularity == 1]), "| モデル1位", roi(t), "| EV>1.1&10%", roi(g[(g.p * g.odds > 1.1) & (g.p >= 0.10)]))


if __name__ == "__main__":
    main()
