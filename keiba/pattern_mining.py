"""結果論からの「回収率1超えパターン探し」と、その本当の再現性の検証。

期間を3分割:  探索(前60%) → 選別(次20%) → 最終テスト(後20%, 条件選びに一切使わない)
  1) 探索期間で、条件の組合せ(最大3属性)ごとに単勝回収率を計算 → 1.0超のパターンを集める
  2) そのパターンを「選別期間」で再確認 → まだ1.0超のものだけ残す
  3) 残ったパターンに従って買った場合の最終テスト期間の回収率 = 本当の成績
  python pattern_mining.py
"""
import itertools

import numpy as np
import pandas as pd

from features import build, load, training_rows

DIMS = {  # すべてレース前に分かる情報
    "競馬場": "place", "芝ダ": "surface", "距離": "dist_bucket", "クラス": "class_group",
    "頭数": "fs", "人気": "pop", "オッズ帯": "ob", "性": "sex", "馬場": "going", "年齢条件": "age_cond",
}
MIN_N = 300


def prep():
    df = training_rows(build(load())).dropna(subset=["odds"]).reset_index(drop=True)
    df["ret"] = df["win"] * df["odds"]
    df["fs"] = pd.cut(df.field_size, [0, 8, 12, 99], labels=["~8", "9-12", "13~"]).astype(str)
    df["pop"] = pd.cut(df.popularity, [0, 1, 2, 3, 6, 9, 99], labels=["1", "2", "3", "4-6", "7-9", "10~"]).astype(str)
    df["ob"] = pd.cut(df.odds, [0, 2, 4, 8, 16, 50, 9999], labels=["<2", "2-4", "4-8", "8-16", "16-50", "50~"]).astype(str)
    for c in ["place", "surface", "dist_bucket", "class_group", "sex", "going", "age_cond"]:
        df[c] = df[c].astype(str)
    codes = {}
    for name, col in DIMS.items():
        codes[name] = pd.factorize(df[col])[0].astype(np.int64)
    return df, codes


def key_of(codes, ds):
    k = np.zeros(len(next(iter(codes.values()))), dtype=np.int64)
    for name in ds:
        k = k * 64 + codes[name]
    return k


def candidates(df, codes, mask, min_roi=1.0):
    out = {}
    for r in (1, 2, 3):
        for ds in itertools.combinations(DIMS, r):
            k = key_of(codes, ds)[mask]
            g = pd.DataFrame({"k": k, "ret": df["ret"].values[mask]}).groupby("k").ret.agg(["mean", "size", "std"])
            g = g[(g["size"] >= MIN_N) & (g["mean"] > min_roi)]
            out[ds] = g
    return out


def roi_str(r):
    return "-" if len(r) == 0 else f"{r.mean():.3f}±{r.std() / np.sqrt(len(r)):.3f} (n={len(r)})"


def flagged(df, codes, cand_keys):
    """cand_keys: {ds: set(keys)} のいずれかに当てはまる行"""
    f = np.zeros(len(df), dtype=bool)
    for ds, ks in cand_keys.items():
        if ks:
            f |= np.isin(key_of(codes, ds), list(ks))
    return f


def main():
    df, codes = prep()
    dates = np.sort(df.date.unique())
    c1, c2 = dates[int(len(dates) * 0.6)], dates[int(len(dates) * 0.8)]
    disc, sel, test = (df.date < c1).values, ((df.date >= c1) & (df.date < c2)).values, (df.date >= c2).values
    print(f"探索 {disc.sum()}行 / 選別 {sel.sum()}行 / 最終テスト {test.sum()}行")
    print(f"全馬券の回収率 探索:{roi_str(df.ret[disc])} 選別:{roi_str(df.ret[sel])} テスト:{roi_str(df.ret[test])}")

    cand = candidates(df, codes, disc)
    n_pat = sum(len(g) for g in cand.values())
    n_tested = sum(1 for _ in cand)  # 属性の組合せ数
    print(f"\n[1] 探索期間で回収率>1.0 (購入{MIN_N}件以上)のパターン: {n_pat}個 (調べた属性の組合せ {n_tested} 通り)")

    ck = {ds: set(g.index) for ds, g in cand.items()}
    f1 = flagged(df, codes, ck)
    print(f"    探索期間(自分で選んだ期間なので甘い): {roi_str(df.ret[disc & f1])}")
    print(f"[2] 選別期間での成績(これは本当の再現性の目安): {roi_str(df.ret[sel & f1])}")
    print(f"    最終テストでの成績: {roi_str(df.ret[test & f1])}")

    # 選別期間でも>1.0だったものだけ残す
    surv = {}
    for ds, g in cand.items():
        k = key_of(codes, ds)[sel]
        s = pd.DataFrame({"k": k, "ret": df.ret.values[sel]}).groupby("k").ret.agg(["mean", "size"])
        s = s[(s["size"] >= 100) & (s["mean"] > 1.0)]
        surv[ds] = set(g.index) & set(s.index)
    n_surv = sum(len(v) for v in surv.values())
    f2 = flagged(df, codes, surv)
    print(f"\n[3] 選別期間でも1.0超だったパターン: {n_surv}個")
    print(f"    選別期間(自分で選んだので甘い): {roi_str(df.ret[sel & f2])}")
    print(f"    ★最終テスト(本当の成績): {roi_str(df.ret[test & f2])}")

    # 共通点: 残ったパターンに含まれる属性値の頻度
    from collections import Counter
    cnt = Counter()
    names = list(DIMS)
    inv = {}
    for name, col in DIMS.items():
        inv[name] = dict(zip(codes[name], df[col].values))
    for ds, ks in surv.items():
        for k in ks:
            vals = []
            kk = k
            for name in reversed(ds):
                vals.append((name, inv[name][kk % 64]))
                kk //= 64
            for v in vals:
                cnt[v] += 1
    print("\n[4] 生き残りパターンに多く出る属性値(上位15):", cnt.most_common(15))


if __name__ == "__main__":
    main()
