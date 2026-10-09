"""「流れ」に基づく買い方の検証(例: 同じ競馬場で1番人気が3連続で負けた後に1番人気を買う)。

ルール = (流れの種類) × (連続回数L以上) × (系列の単位) × (買う対象: 1/2/3番人気の単勝)
偶然の出方を知るため、レースの結果をシャッフルして「全ルールのうち最良」の分布も出す。
  python sequence_strategies.py
"""
import itertools

import numpy as np
import pandas as pd

from features import build, load, training_rows

MIN_N = 300


def race_table():
    df = training_rows(build(load())).dropna(subset=["odds", "popularity"])
    df = df.assign(ret=df["win"] * df["odds"])
    out = {}
    for k in (1, 2, 3):
        s = df[df.popularity == k].drop_duplicates("race_id").set_index("race_id")["ret"]
        out[f"ret{k}"] = s
    rt = pd.DataFrame(out).dropna()
    meta = df.drop_duplicates("race_id").set_index("race_id")[["date", "place", "race_no", "circuit"]]
    win_pop = df[df["rank"] == 1].drop_duplicates("race_id").set_index("race_id")["popularity"]
    rt = rt.join(meta).join(win_pop.rename("win_pop"), how="left").dropna(subset=["win_pop"])
    rt["place"] = rt["place"].astype(str)
    rt["fav_lost"] = (rt["win_pop"] != 1).astype(int)
    rt["fav_won"] = 1 - rt["fav_lost"]
    rt["upset"] = (rt["win_pop"] >= 5).astype(int)  # 5番人気以下が勝った
    return rt.sort_values(["place", "date", "race_no"]).reset_index()


def prev_streak(flag: np.ndarray, groups) -> np.ndarray:
    """各行の時点で『直前までの連続回数』(flagが1の連続。グループ内の並び順で数える)。
    グループが行の上で連続していなくても正しく数える(グループ内の通し番号で計算)。"""
    s = pd.Series(np.asarray(flag))
    g = pd.Series(np.asarray(groups))
    pos = s.groupby(g).cumcount()                       # グループ内の何番目か
    last_zero = pos.where(s == 0, -1).groupby(g).cummax()  # 直近で flag=0 だった位置
    cur = np.where(s == 1, pos - last_zero, 0)          # flag=1 の連続回数(自分を含む)
    return pd.Series(cur).groupby(g).shift(1).fillna(0).values


def streak_columns(rt, outcome):
    """outcome: {'fav_lost':..} 配列dict。返り値: {(流れ,系列): 連続回数配列}"""
    g_day = rt["date"].astype(str) + "_" + rt["place"]
    g_meet = rt["place"]
    res = {}
    for ev in ("fav_lost", "fav_won", "upset"):
        for name, g in (("同日同場", g_day), ("同場通算", g_meet)):
            res[(ev, name)] = prev_streak(outcome[ev], g.values)
    return res


def rule_rois(rt, ret, streaks, Ls=(1, 2, 3, 4, 5, 6)):
    rows = []
    for (ev, ser), st in streaks.items():
        for L in Ls:
            m = st >= L
            for k in (1, 2, 3):
                r = ret[k][m]
                if len(r) >= MIN_N:
                    rows.append(dict(流れ=ev, 系列=ser, L=L, 買う=f"{k}番人気", n=len(r),
                                     roi=r.mean(), se=r.std() / np.sqrt(len(r))))
    return pd.DataFrame(rows)


def main():
    rt = race_table()
    ret = {k: rt[f"ret{k}"].values for k in (1, 2, 3)}
    out = {e: rt[e].values for e in ("fav_lost", "fav_won", "upset")}
    base = {k: ret[k].mean() for k in ret}
    print(f"レース数 {len(rt)}  基準(毎レース買う) 1番人気 {base[1]:.3f} / 2番人気 {base[2]:.3f} / 3番人気 {base[3]:.3f}")
    print("1番人気が負ける確率:", round(rt.fav_lost.mean(), 3))

    st = streak_columns(rt, out)
    obs = rule_rois(rt, ret, st)
    obs["z"] = obs.apply(lambda r: (r.roi - base[int(r["買う"][0])]) / r.se, axis=1)
    print(f"\nルール数 {len(obs)} (購入{MIN_N}回以上)")
    print("--- 回収率が高い順 上位12 (基準との差のz値つき) ---")
    print(obs.sort_values("roi", ascending=False).head(12).round(3).to_string(index=False))

    # 例: 1番人気が連続で負けた後に1番人気を買う
    print("\n--- ご提案の例: 『同日同場で1番人気がL連続で負けた後』に1番人気を買う ---")
    ex = obs[(obs.流れ == "fav_lost") & (obs.系列 == "同日同場") & (obs.買う == "1番人気")]
    print(ex.round(3).to_string(index=False))
    ex = obs[(obs.流れ == "fav_lost") & (obs.系列 == "同場通算") & (obs.買う == "1番人気")]
    print("(同場通算)"); print(ex.round(3).to_string(index=False))

    # 偶然の分布: 各競馬場内でレース結果をシャッフル(流れの構造は維持)
    rng = np.random.default_rng(0)
    best_roi, best_z = [], []
    cols = ["ret1", "ret2", "ret3", "fav_lost", "fav_won", "upset"]
    for it in range(100):
        perm = np.arange(len(rt))
        for pl, ix in rt.groupby("place").indices.items():
            perm[ix] = rng.permutation(ix)
        sh = rt[cols].values[perm]
        r2 = {k: sh[:, k - 1] for k in (1, 2, 3)}
        o2 = {"fav_lost": sh[:, 3], "fav_won": sh[:, 4], "upset": sh[:, 5]}
        t = rule_rois(rt, r2, streak_columns(rt, o2))
        if len(t):
            z = (t.roi - t["買う"].str[0].astype(int).map(base)) / t.se
            best_roi.append(t.roi.max()); best_z.append(z.max())
    print(f"\n[偶然の水準] 結果をシャッフルしても、全ルールのうち最良の回収率は 中央値{np.median(best_roi):.3f} "
          f"(90%点 {np.percentile(best_roi, 90):.3f}, 最大 {max(best_roi):.3f}) / 最良z値は中央値{np.median(best_z):.2f}")
    top = obs.sort_values("roi", ascending=False).iloc[0]
    print(f"[実際の最良] 回収率{top.roi:.3f} z={top.z:.2f}  →  シャッフルでこれ以上が出る割合: "
          f"{np.mean(np.array(best_roi) >= top.roi):.2f} (回収率) / {np.mean(np.array(best_z) >= top.z):.2f} (z)")
    obs.to_csv("sequence_rules.csv", index=False, encoding="utf-8-sig")


if __name__ == "__main__":
    main()
