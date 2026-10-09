"""馬(車)と騎手(操縦者)の実力を同時に推定するレーティング。

各レースで 勝ちスコア s_i = h_i + j_i + g*h_i*j_i を softmax して勝率にし、結果との差で
h(馬)とj(騎手)を同時に更新する(オンライン学習)。レース前の値だけを使うのでリークしない。
騎手の評価が「強い馬に乗っただけ」の分を除いた純粋な腕になるのが狙い。
  python ratings.py            # パラメータ探索と、騎手/馬の寄与の分析
"""
import itertools

import numpy as np
import pandas as pd
from sklearn.metrics import log_loss

from common import DATA
from features import build, load, training_rows

RATINGS_CSV = DATA / "ratings.csv"


def run(df, lr_h=0.1, lr_j=0.02, g=0.0, lam_h=0.0, lam_j=0.0, ret_state=False, lr_hc=0.0, lr_jc=0.0, lr_t=0.0, lr_p=0.0):
    """df: 日付→race_id順。返り値: 各行のレース前の h, j, 勝率p。"""
    race = pd.factorize(df["race_id"])[0]
    hid = pd.factorize(df["horse_id"])[0]
    jid = pd.factorize(df["jockey_id"].fillna("?"))[0]
    y = df["win"].values.astype(float)
    tid = pd.factorize(df["trainer_id"].fillna("?"))[0]
    T = np.zeros(tid.max() + 1)
    pk = pd.factorize(df["trainer_id"].astype(str) + "|" + df["jockey_id"].astype(str))[0]  # 厩舎×騎手の相性
    P = np.zeros(pk.max() + 1)
    pt = np.zeros(len(df))
    H, J = np.zeros(hid.max() + 1), np.zeros(jid.max() + 1)
    # 条件別の上乗せ: 馬×(芝ダ,距離帯) / 騎手×競馬場
    hck = pd.factorize(df["horse_id"].astype(str) + "|" + df["surface"].astype(str) + "|" + df["dist_bucket"].astype(str))[0]
    jck = pd.factorize(df["jockey_id"].astype(str) + "|" + df["place"].astype(str))[0]
    HC, JC = np.zeros(hck.max() + 1), np.zeros(jck.max() + 1)
    phc, pjc = np.zeros(len(df)), np.zeros(len(df))
    bounds = np.flatnonzero(np.diff(race)) + 1
    starts, ends = np.r_[0, bounds], np.r_[bounds, len(df)]
    ph, pj, pp = np.zeros(len(df)), np.zeros(len(df)), np.zeros(len(df))
    for a, b in zip(starts, ends):
        h, j = H[hid[a:b]], J[jid[a:b]]
        hc, jc = HC[hck[a:b]], JC[jck[a:b]]
        t = T[tid[a:b]]
        s = h + j + g * h * j + hc + jc + t + P[pk[a:b]]
        e = np.exp(s - s.max())
        p = e / e.sum()
        ph[a:b], pj[a:b], pp[a:b], phc[a:b], pjc[a:b], pt[a:b] = h, j, p, hc, jc, t
        d = y[a:b] - p
        H[hid[a:b]] = (1 - lam_h) * h + lr_h * d * (1 + g * j)
        J[jid[a:b]] = (1 - lam_j) * j + lr_j * d * (1 + g * h)
        HC[hck[a:b]] = hc + lr_hc * d
        JC[jck[a:b]] = jc + lr_jc * d
        T[tid[a:b]] = t + lr_t * d
        P[pk[a:b]] += lr_p * d
    return (ph, pj, pp, H, J, hid, jid) if ret_state else (ph, pj, pp, phc, pjc, pt)


def prep():
    df = training_rows(build(load())).reset_index(drop=True)
    return df


def main():
    df = prep()
    cut = np.sort(df.date.unique())[int(df.date.nunique() * 0.4)]
    ev = (df.date >= cut).values  # 評価は後ろ60%(最初の40%はレーティングの立ち上がり)
    y = df["win"].values
    uni = 1 / df.groupby("race_id")["win"].transform("size").values
    print(f"評価行 {ev.sum()}  一様(全馬同じ)の logloss={log_loss(y[ev], uni[ev]):.5f}")
    if df["odds"].notna().all():
        inv = 1 / df.odds.clip(lower=1)
        pm = (inv / inv.groupby(df.race_id).transform("sum")).values
        print(f"市場(オッズ)の logloss={log_loss(y[ev], pm[ev]):.5f}")

    def ll(**kw):
        return log_loss(y[ev], np.clip(run(df, **kw)[2][ev], 1e-6, 1 - 1e-6))

    print("\n[1] 馬だけ / 騎手だけ / 馬+騎手 (logloss: 小さいほど良い)")
    res = {}
    for lr_h in (0.05, 0.1, 0.2):
        res[("horse", lr_h)] = ll(lr_h=lr_h, lr_j=0.0)
    for lr_j in (0.01, 0.03, 0.06):
        res[("jockey", lr_j)] = ll(lr_h=0.0, lr_j=lr_j)
    for k, v in sorted(res.items(), key=lambda x: x[1]):
        print("  ", k, round(v, 5))
    bh = min(v for k, v in res.items() if k[0] == "horse")
    best_h = [k for k, v in res.items() if v == bh][0][1]
    best = (9, None)
    for lr_h, lr_j in itertools.product((0.1, 0.2), (0.01, 0.03, 0.06)):
        v = ll(lr_h=lr_h, lr_j=lr_j)
        print("   馬+騎手", (lr_h, lr_j), round(v, 5))
        best = min(best, (v, (lr_h, lr_j)))
    print(f"→ 馬のみ最良 {bh:.5f}  →  馬+騎手 最良 {best[0]:.5f} {best[1]}  (騎手を加えた改善 {bh - best[0]:+.5f})")

    lr_h, lr_j = best[1]
    print("\n[2] 『馬の力が高いほど騎手の影響が増幅する』(掛け算の項 g) の検証")
    for g in (0.0, 0.1, 0.3, 0.6):
        print(f"   g={g}: logloss={ll(lr_h=lr_h, lr_j=lr_j, g=g):.5f}")

    ph, pj, pp, H, J, hid, jid = run(df, lr_h=lr_h, lr_j=lr_j, ret_state=True)
    nh = np.bincount(hid); nj = np.bincount(jid)
    sd_h = np.sqrt(np.average(H[nh >= 5] ** 2, weights=nh[nh >= 5]))
    sd_j = np.sqrt(np.average(J[nj >= 50] ** 2, weights=nj[nj >= 50]))
    print(f"\n[3] 実力のばらつき(対数オッズ尺度のSD): 馬 {sd_h:.3f} / 騎手 {sd_j:.3f}  (大きいほど勝敗への影響が大きい)")
    out = pd.DataFrame({"jockey_id": df["jockey_id"], "J": J[jid], "n": nj[jid]}).drop_duplicates("jockey_id")
    names = df.drop_duplicates("jockey_id").set_index("jockey_id")["jockey"]
    top = out[out.n >= 300].sort_values("J", ascending=False)
    top["name"] = top.jockey_id.map(names)
    print("   騎手レーティング上位8:", [(r.name, round(r.J, 2), r.n) for r in top.head(8).itertuples()])
    print("   同下位5:", [(r.name, round(r.J, 2), r.n) for r in top.tail(5).itertuples()])

    pd.DataFrame({"race_id": df.race_id, "horse_id": df.horse_id, "rate_h": ph, "rate_j": pj,
                  "rate_sum": ph + pj, "p_rate": pp}).to_csv(RATINGS_CSV, index=False)
    print(f"\n保存: {RATINGS_CSV} (best lr_h={lr_h}, lr_j={lr_j})")


def refresh():
    """毎日の更新用: 探索済みの最良パラメータで ratings.csv を作り直す(数十秒)。"""
    df = prep()
    ph, pj, pp, _, _, pt = run(df, lr_h=0.8, lr_j=0.06, lr_t=0.04)
    pd.DataFrame({"race_id": df.race_id, "horse_id": df.horse_id, "rate_h": ph, "rate_j": pj, "rate_t": pt,
                  "rate_sum": ph + pj + pt, "p_rate": pp}).to_csv(RATINGS_CSV, index=False)
    print(f"ratings.csv を更新: {len(df)}行 / {df.race_id.nunique()}レース")


if __name__ == "__main__":
    import sys
    refresh() if "--refresh" in sys.argv else main()
