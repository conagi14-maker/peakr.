"""本番用: 「市場(オッズ)の確率を土台に、モデルは差だけを学習する」モデルを、全データで学習して保存する。

オッズが出ているレースの予想に使う(市場なしモデルは、市場と食い違う所で自信過剰になるため)。
  python train_resid.py      -> models/win_resid.txt, models/top3_resid.txt, models/resid_params.json
"""
import json

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from common import MODELS
from features import build, feature_cols, load, training_rows
from residual_model import R, logit, market_prob


def main():
    df = training_rows(build(load())).dropna(subset=["odds"]).reset_index(drop=True)
    df["pm"] = market_prob(df)
    cols = feature_cols(False, df)
    dates = np.sort(df["date"].unique())
    v0 = dates[int(len(dates) * 0.85)]
    tr, va = df[df.date < v0], df[df.date >= v0]
    X = lambda d: np.c_[logit(d["pm"].values), np.log(d["field_size"].values)]
    lr = LogisticRegression(C=100).fit(X(tr), tr["top3"])          # 市場の「3着内確率」への換算
    for d in (tr, va):
        d["p3m"] = lr.predict_proba(X(d))[:, 1]
    MODELS.mkdir(exist_ok=True)
    for target, base in (("win", "pm"), ("top3", "p3m")):
        m = lgb.LGBMClassifier(n_estimators=3000, **R)
        m.fit(tr[cols], tr[target], init_score=logit(tr[base].values),
              eval_set=[(va[cols], va[target])], eval_init_score=[logit(va[base].values)],
              callbacks=[lgb.early_stopping(100, verbose=False)])
        (MODELS / f"{target}_resid.txt").write_text(m.booster_.model_to_string())
        print(f"{target}: 木の数 {m.best_iteration_}")
    json.dump({"coef": lr.coef_.tolist(), "intercept": lr.intercept_.tolist(), "cols": cols,
               "trained_until": str(df.date.max())[:10]}, open(MODELS / "resid_params.json", "w"), ensure_ascii=False)
    print("保存: models/*_resid.txt / resid_params.json  学習データ", len(tr), "行 (検証", len(va), "行)")


if __name__ == "__main__":
    main()
