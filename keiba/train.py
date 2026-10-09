"""学習: 単勝(1着)/複勝(3着内)/着順ランキング の3モデル + 回収率シミュレーション。

  python train.py              # オッズ無し(妙味探し向け・推奨)
  python train.py --use-odds   # オッズ/人気を特徴量に含める
"""
import argparse

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import log_loss, ndcg_score, roc_auc_score

from common import DATA, MODELS
from features import build, feature_cols, load, training_rows

P = dict(random_state=0, deterministic=True, force_row_wise=True, learning_rate=0.03, num_leaves=31, min_child_samples=40, subsample=0.8, subsample_freq=1,
         colsample_bytree=0.8, verbose=-1)


def split_by_date(df, tr=0.7, va=0.85):
    dates = np.sort(df["date"].unique())
    a, b = dates[int(len(dates) * tr)], dates[int(len(dates) * va)]
    return df[df.date < a], df[(df.date >= a) & (df.date < b)], df[df.date >= b]


def roi(df, p, label):
    """p: 推定確率。単勝100円ずつ購入した場合の回収率。"""
    d = df.assign(p=p).dropna(subset=["odds"])
    out = {}
    top = d.loc[d.groupby("race_id")["p"].idxmax()]
    out["top1"] = (top["win"].mean(), (top["win"] * top["odds"]).mean())
    fav = d[d["popularity"] == 1]  # 基準: 1番人気を毎回買う
    out["1番人気"] = (fav["win"].mean(), (fav["win"] * fav["odds"]).mean())
    ev = d[d["p"] * d["odds"] > 1.2]
    if len(ev):
        out["EV>1.2"] = (len(ev), (ev["win"] * ev["odds"]).mean())
    print(f"  [{label}] 単勝ROI(1.0=収支ゼロ):", {k: tuple(round(x, 3) for x in v) for k, v in out.items()})


def norm(df, p):
    """レース内で勝率の合計を1にそろえる"""
    s = pd.Series(p, index=df.index)
    return (s / s.groupby(df["race_id"]).transform("sum")).values


def ev_table(df, p, label, ths=(1.0, 1.1, 1.2, 1.3, 1.5, 2.0)):
    d = df.assign(p=p).dropna(subset=["odds"])
    rows = []
    for th in ths:
        b = d[d["p"] * d["odds"] > th]
        rows.append((th, len(b), round(b["win"].mean(), 3) if len(b) else None,
                     round((b["win"] * b["odds"]).mean(), 3) if len(b) else None))
    print(f"  [{label}] EV閾値別(閾値, 購入数, 的中率, 回収率):")
    for r in rows:
        print("     ", r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--use-odds", action="store_true")
    ap.add_argument("--jra-2024", action="store_true", help="脚質の試験用: JRA 2024年のみで学習・評価")
    ap.add_argument("--drop", nargs="*", default=[], help="除外する特徴量(比較用)")
    ap.add_argument("--style", action="store_true", help="脚質特徴量を使う(標準は使わない)")
    a = ap.parse_args()
    df = build(load())
    cols = [c for c in feature_cols(a.use_odds, df, use_style=a.style) if c not in a.drop]
    if "has_ped" in df:
        print(f"血統取得済み: {df.has_ped.mean():.1%} の出走行")
    df = training_rows(df)  # 取消/除外のみ除く。競走中止などは負けとして残す
    if a.jra_2024:
        df = df[(df.circuit == "JRA") & (df.date.dt.year == 2024)]
    tr, va, te = split_by_date(df)
    print(f"rows train/valid/test = {len(tr)}/{len(va)}/{len(te)}  features={len(cols)}  odds={a.use_odds}")
    MODELS.mkdir(exist_ok=True)
    tag = "odds" if a.use_odds else "noodds"
    cb = [lgb.early_stopping(50, verbose=False)]

    probs = {}
    for target in ["win", "top3"]:
        m = lgb.LGBMClassifier(n_estimators=1000, **P)
        m.fit(tr[cols], tr[target], eval_set=[(va[cols], va[target])], callbacks=cb)
        p = m.predict_proba(te[cols])[:, 1]
        probs[target] = p
        jra = (te["circuit"] == "JRA").values  # 脚質データがあるのはJRA 2024のみなのでJRA単独でも評価
        print(f"   JRAのみ: AUC={roc_auc_score(te[target][jra], p[jra]):.4f}  n={jra.sum()}")
        if target == "win":
            m_win = m
        print(f"{target}: AUC={roc_auc_score(te[target], p):.4f}  logloss={log_loss(te[target], p):.4f}"
              f"  (base logloss={log_loss(te[target], np.full(len(te), tr[target].mean())):.4f})")
        (MODELS / f"{target}_{tag}.txt").write_text(m.booster_.model_to_string())
    roi(te, probs["win"], "win-model")
    if not a.use_odds:  # 狙い目の基準を実績で確かめるため、テスト期間の予想を保存
        te[["race_id", "umaban", "odds", "popularity", "win", "top3", "rank", "circuit", "date", "place", "field_size"]]             .assign(p_win=probs["win"], p_top3=probs["top3"]).to_pickle(DATA / "test_preds_noodds.pkl")
    # 較正: 検証期間でisotonic回帰(レース内正規化した確率 → 実際の勝率)
    from sklearn.isotonic import IsotonicRegression
    pv = norm(va, m_win.predict_proba(va[cols])[:, 1])
    iso = IsotonicRegression(out_of_bounds="clip", y_min=1e-4).fit(pv, va["win"])
    pt = norm(te, iso.predict(norm(te, probs["win"])))
    ev_table(va, norm(va, iso.predict(pv)), "検証期間(閾値選び用・較正に使ったので甘め)")
    ev_table(te, pt, "テスト期間(較正後)")

    # ランキング: 正解度 1着=3,2着=2,3着=1
    def rk(d):
        d = d.sort_values(["date", "race_id"])
        return d, d.groupby("race_id", sort=False).size().values
    tr, gtr = rk(tr); va, gva = rk(va); te, gte = rk(te)
    lab = lambda d: (4 - d["rank"].fillna(99)).clip(lower=0).astype(int)
    r = lgb.LGBMRanker(n_estimators=1000, **P)
    r.fit(tr[cols], lab(tr), group=gtr, eval_set=[(va[cols], lab(va))], eval_group=[gva],
          eval_at=[3], callbacks=cb)
    s = r.predict(te[cols])
    nd = [ndcg_score([lab(g)], [s[i]], k=3) for _, g in te.groupby("race_id", sort=False)
          for i in [te.index.get_indexer(g.index)] if len(g) > 1]
    print(f"ranker: NDCG@3={np.mean(nd):.4f}")
    (MODELS / f"rank_{tag}.txt").write_text(r.booster_.model_to_string())

    imp = pd.Series(r.feature_importances_, cols).sort_values(ascending=False)
    print("重要度上位:", dict(imp.head(8)))


if __name__ == "__main__":
    main()
