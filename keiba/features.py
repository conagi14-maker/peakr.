"""特徴量生成。全て「そのレースより前」の情報だけで作る(リーク防止)。"""
import re

import numpy as np
import pandas as pd

from common import DATA, PASSING_CSV, RACES_CSV, RESULTS_CSV

PED_CSV = DATA / "pedigree.csv"
RATINGS_CSV = DATA / "ratings.csv"

PRIOR_WIN, PRIOR_TOP3, K = 0.07, 0.21, 20  # 少数サンプルを平均へ寄せる平滑化


def load() -> pd.DataFrame:
    races = pd.read_csv(RACES_CSV, dtype={"race_id": str, "place": str})
    res = pd.read_csv(RESULTS_CSV, dtype={"race_id": str, "horse_id": str, "jockey_id": str, "trainer_id": str})
    return clean(res.merge(races, on="race_id"))


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df["rank"] = pd.to_numeric(df["rank"], errors="coerce")  # 中止・除外はNaN
    for c in ["odds", "popularity", "weight_carried", "last3f", "distance", "umaban", "waku"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["sex"] = df["sexage"].str[0]
    df["age"] = pd.to_numeric(df["sexage"].str[1:], errors="coerce")
    bw = df["body"].astype(str).str.extract(r"(\d+)\(([+-]?\d+)\)")
    df["body_weight"] = pd.to_numeric(bw[0], errors="coerce")
    df["body_diff"] = pd.to_numeric(bw[1], errors="coerce")
    df["field_size"] = df.groupby("race_id")["umaban"].transform("count")
    df["dist_bucket"] = df["distance"] // 400
    add_class(df)
    return df.sort_values(["date", "race_id", "umaban"]).reset_index(drop=True)


def training_rows(df: pd.DataFrame) -> pd.DataFrame:
    """学習・評価に使う行。出走取消/除外(オッズも着順も無い)だけ除き、競走中止・失格など
    (着順なし・オッズあり)は「負け」として残す。結果を見て脱落馬を消すと、残った馬の確率が
    実際より高く見積もられる(先読みバイアス)ため。"""
    return df[df["rank"].notna() | df["odds"].notna()]


def race_class(name) -> tuple:
    """レース名 -> (クラス区分, 序列数値, 年齢条件)。序列は同一サーキット内での大小の目安。"""
    n = "" if name is None or name != name else str(name)
    age = re.search(r"(\d)歳(以上)?", n)
    age_c = (age[1] + ("+" if age[2] else "")) if age else "none"
    for pat, grp, lv in [(r"\(GI\)|\(JpnI\)", "G1", 9), (r"\(GII\)|\(JpnII\)", "G2", 8),
                         (r"\(GIII\)|\(JpnIII\)", "G3", 7), (r"\(L\)|\(OP\)|オープン", "OP", 6),
                         (r"3勝", "3win", 5), (r"2勝", "2win", 4), (r"1勝", "1win", 3),
                         (r"未勝利", "maiden", 1), (r"新馬", "debut", 0)]:
        if re.search(pat, n):
            return grp, lv, age_c
    m = re.match(r"^([ABC])(\d)", n) or re.search(r"([ABC])(\d)", n)
    if m:  # 地方の格付け(A>B>C、数字は組)
        base = {"A": 9, "B": 6, "C": 3}[m[1]]
        return f"NAR_{m[1]}", base - min(int(m[2]), 3) * 0.1, age_c
    if re.search(r"特別|賞|杯|記念|S$|ステークス", n):
        return "special", 5, age_c
    return "other", 4, age_c


def add_class(df):
    cls = df["race_name"].map(race_class) if "race_name" in df.columns else pd.Series([("other", 4, "none")] * len(df), index=df.index)
    df["class_group"] = [c[0] for c in cls]
    df["class_level"] = [c[1] for c in cls]
    df["age_cond"] = [c[2] for c in cls]


def _rate(df, keys, col, prior, k=K):
    g = df.groupby(keys)[col]
    n = g.cumcount()
    s = g.cumsum() - df[col]
    return (s + k * prior) / (n + k)


def _rate_by_race(df, key, col, prior):
    """騎手/調教師用。同一レースに複数頭出ている場合、同レースの結果を含めない
    (レース単位で集計してから累積→自レース分を引く)。"""
    keys = [key] if isinstance(key, str) else list(key)
    a = (df.groupby(keys + ["race_id"], sort=False)
         .agg(date=("date", "first"), s=(col, "sum"), n=(col, "size")).reset_index()
         .sort_values(keys + ["date", "race_id"]))
    g = a.groupby(keys)
    a["prior_s"] = g["s"].cumsum() - a["s"]
    a["prior_n"] = g["n"].cumsum() - a["n"]
    a["rate"] = (a["prior_s"] + K * prior) / (a["prior_n"] + K)
    cols = keys + ["race_id"]
    return df[cols].merge(a[cols + ["rate"]], on=cols, how="left")["rate"].values


def _window_rate(df, key, col, days, prior, k=10):
    """直近days日(当日は含めない)の成績。返り値: (平滑化した率, 件数) の配列(dfの行順)。"""
    keys = [key] if isinstance(key, str) else list(key)
    a = (df.groupby(keys + ["race_id"], sort=False)
         .agg(date=("date", "first"), s=(col, "sum"), n=(col, "size")).reset_index()
         .sort_values(keys + ["date", "race_id"]).reset_index(drop=True))
    rate, cnt = np.full(len(a), np.nan), np.zeros(len(a))
    dates = a["date"].values.astype("datetime64[D]")
    for ix in a.groupby(keys).indices.values():
        d = dates[ix]
        cs = np.r_[0, np.cumsum(a["s"].values[ix])]
        cn = np.r_[0, np.cumsum(a["n"].values[ix])]
        e = np.searchsorted(d, d, side="left")                           # 当日より前
        st = np.searchsorted(d, d - np.timedelta64(days, "D"), side="left")
        S, N = cs[e] - cs[st], cn[e] - cn[st]
        rate[ix], cnt[ix] = (S + k * prior) / (N + k), N
    cols = keys + ["race_id"]
    a["rate"], a["cnt"] = rate, cnt
    m = df[cols].merge(a[cols + ["rate", "cnt"]], on=cols, how="left")
    return m["rate"].values, m["cnt"].values


LEFT_PLACES = {"04", "05", "07", "35", "42", "43", "45"}  # 新潟・東京・中京 / 盛岡・浦和・船橋・川崎(コース表記で確認済み)


def turn_of(place, surface, distance):
    """回り方向: L=左 R=右 S=直線(新潟芝1000m)。競馬場ごとの固定情報。"""
    if str(place) == "04" and surface == "芝" and distance == 1000:
        return "S"
    return "L" if str(place) in LEFT_PLACES else "R"


def _past_mean(x, key, df):
    """keyごとの『自分より前』の平均(xがNaNの行は数えない)。"""
    f0, n1 = x.fillna(0.0), x.notna().astype(float)
    g0 = f0.groupby(key).cumsum() - f0
    g1 = n1.groupby(key).cumsum() - n1
    return (g0 / g1.where(g1 > 0)).values


def add_speed(df):
    """スピード指数: 同条件(競馬場×芝ダ×距離×馬場)の『過去の勝ち時計』との差を標準化。大きいほど速い。
    基準は過去のレースだけから作る(リークなし)。"""
    t = df["time"].astype(str).str.extract(r"^(\d+):(\d+(?:\.\d+)?)$")
    df["time_sec"] = pd.to_numeric(t[0], errors="coerce") * 60 + pd.to_numeric(t[1], errors="coerce")
    cond = (df["place"].astype(str) + "|" + df["surface"].astype(str) + "|" + df["distance"].astype(str)
            + "|" + df["going"].astype(str))
    w = df[(df["rank"] == 1) & df["time_sec"].notna()].assign(cond=cond)
    w = (w.groupby("race_id", sort=False).agg(date=("date", "first"), cond=("cond", "first"), t=("time_sec", "mean"))
         .reset_index().sort_values(["date", "race_id"]))
    g = w.groupby("cond")
    n = g.cumcount()
    S, Q = g["t"].cumsum() - w["t"], (w["t"] ** 2).groupby(w["cond"]).cumsum() - w["t"] ** 2
    mu = S / n.where(n >= 5)
    sd = np.sqrt(np.maximum(Q / n.where(n >= 5) - mu ** 2, 0.09))  # 標準偏差の下限0.3秒
    w["mu"], w["sd"] = mu, sd
    df = df.merge(w[["race_id", "mu", "sd"]], on="race_id", how="left")
    df["speed"] = ((df["mu"] - df["time_sec"]) / df["sd"]).clip(-6, 6)
    return df.sort_values(["date", "race_id", "umaban"]).reset_index(drop=True)


def build(df: pd.DataFrame) -> pd.DataFrame:
    """df: clean()済み。出走前のレース(rank=NaN)を含めても同じ手順で特徴量が出る。"""
    df = df.copy()
    # --- 馬と騎手の同時レーティング(ratings.py) ---
    if RATINGS_CSV.exists() and "rate_sum" not in df.columns:
        rt = pd.read_csv(RATINGS_CSV, dtype={"race_id": str, "horse_id": str}).drop_duplicates(["race_id", "horse_id"])
        df = df.merge(rt, on=["race_id", "horse_id"], how="left")
    if "rate_sum" in df.columns:  # 外から渡された場合(出走前の予想)も同じ列を作る
        df["rate_rel"] = df["rate_sum"] - df.groupby("race_id")["rate_sum"].transform("mean")
        df["rate_j_rel"] = df["rate_j"] - df.groupby("race_id")["rate_j"].transform("mean")
    # --- 脚質(通過順位があるレースのみ。無いものはNaN) ---
    if PASSING_CSV.exists() and "passing" not in df.columns:
        ps = pd.read_csv(PASSING_CSV, dtype=str).drop_duplicates(["race_id", "umaban"])
        ps["umaban"] = pd.to_numeric(ps["umaban"], errors="coerce")
        df = df.merge(ps, on=["race_id", "umaban"], how="left")
    if "passing" in df.columns:
        first = pd.to_numeric(df["passing"].astype(str).str.extract(r"^(\d+)")[0], errors="coerce")
        df["early_pos"] = first / df["field_size"]  # 最初のコーナー位置/頭数 (小さいほど前)
    df["win"] = (df["rank"] == 1).astype(float)
    df["top3"] = (df["rank"] <= 3).astype(float)
    df["rank_f"] = df["rank"]

    df["n_runs"] = df.groupby("horse_id").cumcount()
    df["horse_win_rate"] = _rate(df, "horse_id", "win", PRIOR_WIN)
    df["horse_top3_rate"] = _rate(df, "horse_id", "top3", PRIOR_TOP3)
    for keys, name in [(["horse_id", "surface"], "horse_surface"), (["horse_id", "dist_bucket"], "horse_dist")]:
        df[f"{name}_top3"] = _rate(df, keys, "top3", PRIOR_TOP3)
    for who in ["jockey_id", "trainer_id"]:
        df[f"{who[:-3]}_win_rate"] = _rate_by_race(df, who, "win", PRIOR_WIN)
        df[f"{who[:-3]}_top3_rate"] = _rate_by_race(df, who, "top3", PRIOR_TOP3)

    # --- 騎手: 条件別の得意不得意 ---
    for keys, name in [(["jockey_id", "surface"], "jockey_surface"), (["jockey_id", "dist_bucket"], "jockey_dist"),
                       (["jockey_id", "place"], "jockey_place")]:
        df[f"{name}_top3"] = _rate_by_race(df, keys, "top3", PRIOR_TOP3)
    # --- 馬×騎手の相性 ---
    prev_j = df.groupby("horse_id")["jockey_id"].shift()
    df["jockey_changed"] = np.where(prev_j.isna(), np.nan, (prev_j != df["jockey_id"]).astype(float))
    df["pair_n"] = df.groupby(["horse_id", "jockey_id"]).cumcount()  # このコンビでの過去騎乗数
    df["pair_top3_rate"] = _rate(df, ["horse_id", "jockey_id"], "top3", df["horse_top3_rate"], k=3)
    df["pair_lift"] = df["pair_top3_rate"] - df["horse_top3_rate"]  # 相性: コンビでの複勝率 - 馬単独の複勝率
    df["jockey_up"] = df["jockey_top3_rate"] - df.groupby("horse_id")["jockey_top3_rate"].shift()  # 騎手の格上げ/格下げ

    # --- 血統(取得済みの馬のみ。未取得はNaN) ---
    if PED_CSV.exists():
        ped = pd.read_csv(PED_CSV, dtype=str).drop_duplicates("horse_id")
        df = df.drop(columns=[c for c in ped.columns if c != "horse_id" and c in df.columns])                .merge(ped, on="horse_id", how="left").sort_values(["date", "race_id", "umaban"]).reset_index(drop=True)
        for who, idc in [("sire", "sire_id"), ("damsire", "damsire_id"), ("ss", "ss_id")]:
            df[f"{who}_top3"] = _rate_by_race(df, idc, "top3", PRIOR_TOP3)
            df[f"{who}_surface_top3"] = _rate_by_race(df, [idc, "surface"], "top3", PRIOR_TOP3)
            df[f"{who}_dist_top3"] = _rate_by_race(df, [idc, "dist_bucket"], "top3", PRIOR_TOP3)
        df["sire_win_rate"] = _rate_by_race(df, "sire_id", "win", PRIOR_WIN)
        df["has_ped"] = df["sire_id"].notna().astype(float)
        for c in ["sire_id", "damsire_id"]:  # 主要種牡馬はカテゴリとしても使う(少数は'other')
            top = df[c].value_counts().head(60).index
            df[f"{c}_cat"] = df[c].where(df[c].isin(top), "other").astype("category")

    g = df.groupby("horse_id")
    df["prev_rank3"] = g["rank_f"].transform(lambda s: s.shift().rolling(3, min_periods=1).mean())
    df["prev_last3f3"] = g["last3f"].transform(lambda s: s.shift().rolling(3, min_periods=1).mean())
    df["prev_rank1"] = g["rank_f"].shift()
    df["days_since"] = g["date"].diff().dt.days
    df["prev_body_weight"] = g["body_weight"].shift()

    # --- 調教師・厩舎 ---
    df["stable_region"] = df["trainer"].astype(str).str.extract(r"^\[(.)\]")[0].fillna("他")  # 東/西(JRA所属) 地(地方)
    for keys, name in [(["trainer_id", "surface"], "trainer_surface"), (["trainer_id", "dist_bucket"], "trainer_dist"),
                       (["trainer_id", "place"], "trainer_place")]:
        df[f"{name}_top3"] = _rate_by_race(df, keys, "top3", PRIOR_TOP3)
    df["trainer_win90"], df["trainer_n90"] = _window_rate(df, "trainer_id", "win", 90, PRIOR_WIN)   # 直近3か月の調子
    df["trainer_top3_90"], _ = _window_rate(df, "trainer_id", "top3", 90, PRIOR_TOP3)
    df["trainer_form"] = df["trainer_top3_90"] - df["trainer_top3_rate"]                              # 通算との差=好調/不調
    rest = pd.cut(df["days_since"], [-1, 14, 35, 90, 9999], labels=False).astype(float).fillna(4)  # 休養明けの区分(4=初出走)
    df["rest_bucket"] = rest
    df["trainer_rest_top3"] = _rate_by_race(df.assign(rest=rest), ["trainer_id", "rest"], "top3", PRIOR_TOP3)
    df["tj_top3"] = _rate_by_race(df, ["trainer_id", "jockey_id"], "top3", PRIOR_TOP3)               # 厩舎×騎手の組合せ
    df["tj_n"] = df.groupby(["trainer_id", "jockey_id"]).cumcount()
    # --- スピード指数(最速タイム系) ---
    df = add_speed(df)
    g = df.groupby("horse_id")
    df["speed_prev"] = g["speed"].shift()
    df["speed_best"] = g["speed"].transform(lambda s: s.shift().cummax())
    df["speed_avg3"] = g["speed"].transform(lambda s: s.shift().rolling(3, min_periods=1).mean())
    df["speed_best_rel"] = df["speed_best"] - df.groupby("race_id")["speed_best"].transform("mean")
    df["speed_avg3_rel"] = df["speed_avg3"] - df.groupby("race_id")["speed_avg3"].transform("mean")
    # --- 人気に対する結果 = 期待に応えているか(調子): 馬・騎手・調教師 ---
    inv = 1.0 / df["odds"].clip(lower=1.0)
    df["pm_mkt"] = inv / inv.groupby(df["race_id"]).transform("sum")                 # 市場の見立ての勝率
    fitm = df["pm_mkt"].notna() & (df["date"] < df["date"].quantile(0.4)) & (df["rank"].notna() | df["odds"].notna())
    from sklearn.linear_model import LogisticRegression
    lg = lambda p: np.log(np.clip(p, 1e-6, 1 - 1e-6) / (1 - np.clip(p, 1e-6, 1 - 1e-6)))
    Xm = np.c_[lg(df["pm_mkt"].fillna(0.1).values), np.log(df["field_size"].values)]
    lr3 = LogisticRegression(C=100).fit(Xm[fitm.values], df.loc[fitm, "top3"])
    df["p3_mkt"] = np.where(df["pm_mkt"].notna(), lr3.predict_proba(Xm)[:, 1], np.nan)   # 市場の見立ての3着内確率
    rank_eff = df["rank"].where(df["rank"].notna(), df["field_size"]).where(df["odds"].notna())  # 競走中止は最下位扱い
    df["gap"] = (df["popularity"] - rank_eff) / df["field_size"]                      # +: 人気以上の結果 / -: 人気を下回った
    df["sur_win"] = (df["win"] - df["pm_mkt"]).where(df["pm_mkt"].notna())
    df["sur_top3"] = (df["top3"] - df["p3_mkt"]).where(df["pm_mkt"].notna())
    gh = df.groupby("horse_id")
    for c in ("gap", "sur_win", "sur_top3"):
        df[f"h_{c}3"] = gh[c].transform(lambda s: s.shift().rolling(3, min_periods=1).mean())
        df[f"h_{c}5"] = gh[c].transform(lambda s: s.shift().rolling(5, min_periods=2).mean())
    under = (df["gap"] < 0).astype(float).where(df["gap"].notna())
    run = under.groupby(df["horse_id"]).cumsum() - under.groupby(df["horse_id"]).cumsum().where(under == 0).groupby(df["horse_id"]).ffill().fillna(0)
    df["h_under_streak"] = run.groupby(df["horse_id"]).shift().fillna(0)                 # 直前までの『人気を下回った』連続回数
    for who, col in (("jockey_id", "j"), ("trainer_id", "t")):
        for c in ("gap", "sur_top3", "sur_win"):
            df[f"{col}_{c}_30d"], _ = _window_rate(df.assign(_v=df[c].fillna(0.0)), who, "_v", 30, 0.0, k=10)
    # --- 組み合わせの調子: この組み合わせは、市場の期待以上の結果が出やすいか ---
    d0 = df.assign(_t3=df["sur_top3"].fillna(0.0), _w=df["sur_win"].fillna(0.0))
    df["pair_sur_top3"] = _rate(d0, ["horse_id", "jockey_id"], "_t3", 0.0, k=3)          # 馬×騎手
    df["pair_sur_win"] = _rate(d0, ["horse_id", "jockey_id"], "_w", 0.0, k=3)
    df["tj_sur_top3"] = _rate_by_race(d0, ["trainer_id", "jockey_id"], "_t3", 0.0)      # 厩舎×騎手
    df["tj_sur_win"] = _rate_by_race(d0, ["trainer_id", "jockey_id"], "_w", 0.0)
    for keys, name in [(["jockey_id", "place"], "js_place"), (["jockey_id", "dist_bucket"], "js_dist"),
                       (["jockey_id", "surface"], "js_surface"), (["trainer_id", "place"], "tp_place"),
                       (["trainer_id", "surface"], "tp_surface"), (["trainer_id", "dist_bucket"], "tp_dist")]:
        df[f"{name}_sur"] = _rate_by_race(d0, keys, "_t3", 0.0)
    df["pair_sur_comb"] = df["pair_sur_top3"] * np.log1p(df["pair_n"])                    # 乗り慣れているほど信頼
    # --- 類似条件の過去レース(同じ競馬場×芝ダ×距離)の傾向: 内外・年齢・馬場ごとの「勝ち超過」(均等なら0) ---
    cond = df["place"].astype(str) + "|" + df["surface"].astype(str) + "|" + df["distance"].astype(str)
    pos3 = pd.cut(df["umaban"] / df["field_size"], [0, 0.34, 0.67, 1.01], labels=False).astype(float)
    exc = (df["win"] - 1.0 / df["field_size"]).fillna(0.0)
    d1 = df.assign(_c=cond, _p=pos3, _e=exc, _a=df["age"].clip(2, 9))
    df["an_pos_exc"] = _rate_by_race(d1, ["_c", "_p"], "_e", 0.0)
    df["an_pos_going_exc"] = _rate_by_race(d1.assign(_g=df["going"].astype(str)), ["_c", "_g", "_p"], "_e", 0.0)
    df["an_age_exc"] = _rate_by_race(d1, ["_c", "_a"], "_e", 0.0)
    df["an_sex_exc"] = _rate_by_race(d1, ["_c", "sex"], "_e", 0.0)
    df["an_cond_n"] = d1.groupby("_c")["race_id"].transform(lambda s: s.map({r: i for i, r in enumerate(pd.unique(s))}) + 1)  # 類似レースの蓄積数(目安)
    # --- レースのペース(結果から見た前後半のバランス)。前走までのペースで過去走を評価し直す ---
    wm = (df["rank"] == 1) & df["time_sec"].notna() & df["last3f"].notna() & (df["distance"] > 600) & (df["surface"].astype(str) != "障")
    wr = df[wm].assign(cond=df["place"].astype(str) + "|" + df["surface"].astype(str) + "|" + df["distance"].astype(str))
    wr["fade_w"] = (wr["last3f"] / 600) / ((wr["time_sec"] - wr["last3f"]) / (wr["distance"] - 600))
    wr = wr.groupby("race_id", sort=False).agg(date=("date", "first"), cond=("cond", "first"), fw=("fade_w", "mean")).reset_index()
    wr = wr.sort_values(["date", "race_id"])
    cg = wr.groupby("cond")
    cn = cg.cumcount()
    wr["fw_prior"] = (cg["fw"].cumsum() - wr["fw"]) / cn.where(cn >= 5)
    wr["race_pace_rel"] = wr["fw"] - wr["fw_prior"]      # +: 前半が速く後半が落ちる(ハイペース) / -: スロー
    df = df.merge(wr[["race_id", "race_pace_rel"]], on="race_id", how="left").sort_values(["date", "race_id", "umaban"]).reset_index(drop=True)
    gp = df.groupby("horse_id")
    df["prev_pace_rel"] = gp["race_pace_rel"].shift()
    df["pace_avg3"] = gp["race_pace_rel"].transform(lambda s: s.shift().rolling(3, min_periods=1).mean())
    hi = df["race_pace_rel"] > 0.0
    df["speed_hi_pace"] = _past_mean(df["speed"].where(hi), df["horse_id"], df)       # 速い流れのレースでの、この馬のスピード
    df["speed_slow_pace"] = _past_mean(df["speed"].where(~hi & df["race_pace_rel"].notna()), df["horse_id"], df)
    df["pace_pref"] = df["speed_hi_pace"] - df["speed_slow_pace"]                      # +: 速い流れに強い
    df["kick_pace_adj"] = (df["last3f"] - df.groupby("race_id")["last3f"].transform("median")) + 40 * df["race_pace_rel"]                    # 上がりの速さをペースで補正(スローの末脚は割引)
    df["kick_pace_adj3"] = df.groupby("horse_id")["kick_pace_adj"].transform(lambda s: s.shift().rolling(3, min_periods=1).mean())
    # --- 騎手の時計: 馬の普段のスピード指数との差(=騎手だけの効果)と、条件別の最速 ---
    delta = df["speed"] - df["speed_avg3"]                                       # この騎乗での上振れ/下振れ
    dv, dn = delta.fillna(0.0), delta.notna().astype(float)
    sj, nj = dv.groupby(df["jockey_id"]).cumsum() - dv, dn.groupby(df["jockey_id"]).cumsum() - dn
    df["jockey_speed_gain"] = sj / (nj + 30)                                     # 平滑化(騎乗が少ない騎手は0に寄せる)
    cond_j = df["place"].astype(str) + "|" + df["surface"].astype(str) + "|" + (df["distance"] // 200).astype(str)
    df["jockey_best_speed_cond"] = df["speed"].groupby([df["jockey_id"], cond_j]).transform(lambda s: s.shift().cummax())
    df["jockey_best_speed_all"] = df["speed"].groupby(df["jockey_id"]).transform(lambda s: s.shift().cummax())
    df["jockey_speed_gain_rel"] = df["jockey_speed_gain"] - df.groupby("race_id")["jockey_speed_gain"].transform("mean")
    # --- スタミナ指標 ---
    dist = df["distance"]
    pace1 = (df["time_sec"] - df["last3f"]) / (dist - 600).where(dist > 600)
    pace2 = df["last3f"] / 600
    fade = (pace2 / pace1).where(df["surface"].astype(str) != "障")      # 大きいほど終盤に失速
    df["fade_rel"] = fade - fade.groupby(df["race_id"]).transform("median")
    df["kick_rel"] = df["last3f"] - df.groupby("race_id")["last3f"].transform("median")  # 小さいほど末脚が強い
    g = df.groupby("horse_id")
    df["stamina_fade3"] = g["fade_rel"].transform(lambda s: s.shift().rolling(3, min_periods=1).mean())
    df["kick3"] = g["kick_rel"].transform(lambda s: s.shift().rolling(3, min_periods=1).mean())
    # --- 展開(ペース)予想: 各馬の前半の速さ(タイム-上がり3F)を過去から推定し、出走メンバーの構成からペースを見積もる ---
    pace1_rel = pace1 - pace1.groupby(df["race_id"]).transform("median")           # 小さいほど前半が速い(前に行く)
    df["pace1_rel"] = pace1_rel.where(df["surface"].astype(str) != "障")
    g = df.groupby("horse_id")
    df["early3"] = g["pace1_rel"].transform(lambda s: s.shift().rolling(3, min_periods=1).mean())
    df["early_rank_pct"] = df.groupby("race_id")["early3"].rank(pct=True)          # 0に近い=メンバー中で最も前に行きそう
    q = df["early3"].quantile(0.25)
    front = (df["early3"] <= q).astype(float).where(df["early3"].notna())
    df["n_front_like"] = front.groupby(df["race_id"]).transform("sum")              # 前に行きたい馬の頭数(ペースが速くなる目安)
    df["front_share_like"] = df["n_front_like"] / df["field_size"]
    df["field_early_mean"] = df.groupby("race_id")["early3"].transform("mean")
    df["early_vs_field"] = df["early3"] - df["field_early_mean"]
    df["pace_pressure_x_kick"] = df["n_front_like"] * (-df["kick3"])               # 速いペースほど、末脚型に有利になる想定
    df["pace_pressure_x_early"] = df["n_front_like"] * df["early_rank_pct"]        # 前に行く馬が多い中で、自分も前に行く馬は不利
    # --- レースのクラス(格)の変化と、そのクラスでの実績 ---
    df["prev_class_level"] = g["class_level"].shift()
    df["class_move"] = df["class_level"] - df["prev_class_level"]                  # +なら昇級、-なら降級
    df["class_max_past"] = g["class_level"].transform(lambda s: s.shift().cummax())  # これまでに走った最高のクラス
    df["class_vs_max"] = df["class_level"] - df["class_max_past"]
    df["horse_class_top3"] = _rate(df, ["horse_id", "class_group"], "top3", df["horse_top3_rate"], k=3)
    df["horse_class_n"] = df.groupby(["horse_id", "class_group"]).cumcount()       # そのクラスでの出走経験
    df["class_rate"] = _rate_by_race(df, ["class_group", "circuit"], "top3", PRIOR_TOP3)
    df["pace_fit"] = (df["n_front_like"] - df["n_front_like"].median()) * df["pace_pref"]  # 前に行く馬が多い(=速い流れ)ほど、速い流れに強い馬が有利
    df["dist_change"] = dist - g["distance"].shift()                       # 距離延長(+)/短縮(-)
    df["dist_vs_avg"] = dist - g["distance"].transform(lambda s: s.shift().expanding().mean())
    dcls = pd.cut(dist, [0, 1399, 1799, 9999], labels=["short", "mid", "long"]).astype(str)
    for c in ("short", "mid", "long"):
        df[f"speed_{c}"] = _past_mean(df["speed"].where(dcls == c), df["horse_id"], df)
    df["stamina_idx"] = df["speed_long"] - df["speed_short"]               # 長距離での速さ - 短距離での速さ
    df["speed_at_class"] = np.select([dcls == "short", dcls == "mid", dcls == "long"],
                                     [df["speed_short"], df["speed_mid"], df["speed_long"]], np.nan)
    # --- 回り方向(右/左)の適性 ---
    df["turn"] = [turn_of(p, s, d) for p, s, d in zip(df["place"].astype(str), df["surface"].astype(str), df["distance"])]
    df["horse_turn_top3"] = _rate(df, ["horse_id", "turn"], "top3", df["horse_top3_rate"], k=3)
    df["turn_pref"] = df["horse_turn_top3"] - df["horse_top3_rate"]
    df["turn_same_prev"] = np.where(g["turn"].shift().isna(), np.nan, (g["turn"].shift() == df["turn"]).astype(float))
    df["age_rel"] = df["age"] - df.groupby("race_id")["age"].transform("mean")                       # 相手より若い/高齢
    # --- 年齢・間隔別の「勝ちやすさ」(全馬の過去実績を、そのレース以前だけで集計) ---
    df["age_c"] = df["age"].clip(2, 9)
    df["rest_bin"] = pd.cut(df["days_since"], [-1, 7, 14, 21, 28, 42, 56, 90, 180, 99999], labels=False).astype(float).fillna(9)
    for keys, name in [(["age_c"], "age"), (["age_c", "sex"], "age_sex"), (["age_c", "surface"], "age_surface"),
                       (["age_c", "dist_bucket"], "age_dist"), (["age_c", "circuit"], "age_circuit")]:
        df[f"{name}_top3"] = _rate_by_race(df, keys, "top3", PRIOR_TOP3)
    df["age_win"] = _rate_by_race(df, ["age_c"], "win", PRIOR_WIN)
    for keys, name in [(["rest_bin"], "rest"), (["rest_bin", "age_c"], "rest_age"), (["rest_bin", "class_group"], "rest_class"),
                       (["rest_bin", "surface"], "rest_surface")]:
        df[f"{name}_top3"] = _rate_by_race(df, keys, "top3", PRIOR_TOP3)
    df["rest_win"] = _rate_by_race(df, ["rest_bin"], "win", PRIOR_WIN)
    df["horse_rest_top3"] = _rate(df, ["horse_id", "rest_bin"], "top3", df["horse_top3_rate"], k=3)  # この馬の同じ間隔での成績
    df["horse_rest_pref"] = df["horse_rest_top3"] - df["horse_top3_rate"]
    df["age_x_rest"] = df["age_top3"] * df["rest_top3"]
    # --- 馬の生涯の何戦目か(データは2022年以降。デビュー戦から追えている馬だけ正確) ---
    first_cls = df.groupby("horse_id")["class_group"].transform("first")
    df["career_known"] = (first_cls == "debut").astype(float)
    df["career_n"] = df["n_runs"].where(df["career_known"] == 1)           # 生涯出走数(不明はNaN)
    # --- 騎手のその日の何レース目か(出走表は前日に確定するので、その日の総騎乗数は事前に分かる) ---
    jd = df.groupby(["jockey_id", "date"])
    df["jr_nth"] = jd.cumcount()
    df["jr_total"] = jd["race_id"].transform("size")
    df["jr_left"] = df["jr_total"] - df["jr_nth"] - 1
    df["jr_wins_today"] = jd["win"].cumsum() - df["win"]
    df["is_last_race"] = (df["race_no"] == df.groupby(["date", "place"])["race_no"].transform("max")).astype(float)
    df["races_in_day"] = df.groupby(["date", "place"])["race_no"].transform("max")
    # --- 馬の体格 ---
    bw = df["body_weight"]
    gbw = df.groupby("horse_id")["body_weight"]
    df["bw_avg_past"] = gbw.transform(lambda s: s.shift().expanding().mean())          # この馬の平常体重
    df["bw_dev"] = bw - df["bw_avg_past"]                                              # 平常体重との差(太め残り/絞れ)
    df["bw_dev_pct"] = df["bw_dev"] / df["bw_avg_past"]
    df["bw_avg3"] = gbw.transform(lambda s: s.shift().rolling(3, min_periods=1).mean())
    df["bw_vs_avg3"] = bw - df["bw_avg3"]
    df["bw_growth"] = bw - gbw.transform("first")                                      # 初見からの成長(若駒向け)
    df["bw_rel_race"] = bw - df.groupby("race_id")["body_weight"].transform("mean")    # 相手より大きいか
    df["burden"] = df["weight_carried"] / bw * 100                                     # 斤量/馬体重(体格に対する負担)
    df["bw_pct_sex"] = bw.groupby([df["sex"], df["circuit"]]).rank(pct=True)           # 同性・同サーキット内の大きさの順位
    df["bw_std_horse"] = gbw.transform(lambda s: s.shift().expanding().std())          # 体重の振れ幅(安定度)
    df["bw_best_gap"] = bw - df["bw_avg_past"].where(df["bw_avg_past"].notna())        # 平均との差(別名: 勝った時の体重との比較用)
    won_bw = bw.where(df["rank"] == 1)
    df["bw_win_avg"] = won_bw.groupby(df["horse_id"]).transform(lambda s: s.shift().expanding().mean())  # 勝った時の平均体重
    df["bw_vs_win"] = bw - df["bw_win_avg"]                                            # 勝った時の体重との差
    prev_t = g["trainer_id"].shift()
    df["trainer_changed"] = np.where(prev_t.isna(), np.nan, (prev_t != df["trainer_id"]).astype(float))  # 転厩

    # --- 当日の馬場バイアス: 同じ日・競馬場・芝ダートの「これまでのレース」で上位3頭が内外どちらに偏ったか ---
    df["pos_ratio"] = df["umaban"] / df["field_size"]  # 小さいほど内
    dev = (df["pos_ratio"] - df.groupby("race_id")["pos_ratio"].transform("mean")) * df["top3"]
    rl = (df.assign(dev=dev).groupby("race_id", sort=False)
          .agg(date=("date", "first"), place=("place", "first"), surface=("surface", "first"),
               race_no=("race_no", "first"), dev=("dev", "sum"), n=("top3", "sum")).reset_index()
          .sort_values(["date", "place", "surface", "race_no"]))
    gb = rl.groupby(["date", "place", "surface"])
    rl["day_bias_sum"] = gb["dev"].cumsum() - rl["dev"]
    rl["day_bias_races"] = gb.cumcount()
    rl["day_bias_pos"] = rl["day_bias_sum"] / (rl["day_bias_races"] * 3 + 3)  # 少数レースは0へ収縮
    df = df.merge(rl[["race_id", "day_bias_pos", "day_bias_races"]], on="race_id", how="left")
    df["bias_fit"] = (df["pos_ratio"] - 0.5) * df["day_bias_pos"]  # 正: 今日の傾向に合った枠
    df = df.sort_values(["date", "race_id", "umaban"]).reset_index(drop=True)

    # --- 脚質: 過去の位置取りの平均 + 同じレースの相手の脚質構成 ---
    if "early_pos" in df.columns:
        g2 = df.groupby("horse_id")["early_pos"]
        df["style_pos"] = g2.transform(lambda s: s.shift().rolling(5, min_periods=1).mean())
        df["style_rel"] = df["style_pos"] - df.groupby("race_id")["style_pos"].transform("mean")
        df["style_rank_pct"] = df.groupby("race_id")["style_pos"].rank(pct=True)
        front = (df["style_pos"] < 0.25).astype(float).where(df["style_pos"].notna())
        df["n_front"] = front.groupby(df["race_id"]).transform("sum")  # 逃げ・先行タイプの頭数(ペース想定)
        df["front_share"] = df["n_front"] / df["field_size"]
        df["n_known_style"] = df["style_pos"].notna().groupby(df["race_id"]).transform("sum")

    # レース内での相対値(相手関係)
    for c in ["horse_top3_rate", "prev_rank3", "weight_carried"]:
        df[f"{c}_rel"] = df[c] - df.groupby("race_id")[c].transform("mean")

    for c in ["circuit", "surface", "going", "sex", "place", "weather", "class_group", "age_cond", "stable_region", "turn"]:
        df[c] = df[c].astype("category")
    return df


BASE = ["distance", "field_size", "umaban", "waku", "weight_carried", "age", "body_weight", "body_diff",
        "n_runs", "horse_win_rate", "horse_top3_rate", "horse_surface_top3", "horse_dist_top3",
        "jockey_win_rate", "jockey_top3_rate", "trainer_win_rate", "trainer_top3_rate",
        "prev_rank3", "prev_last3f3", "prev_rank1", "days_since", "prev_body_weight",
        "horse_top3_rate_rel", "prev_rank3_rel", "weight_carried_rel",
        "jockey_surface_top3", "jockey_dist_top3", "jockey_place_top3",
        "jockey_changed", "pair_n", "pair_top3_rate", "pair_lift", "jockey_up",
        "class_group", "class_level", "age_cond",
        "pos_ratio", "day_bias_pos", "day_bias_races", "bias_fit",
        "stable_region", "trainer_surface_top3", "trainer_dist_top3", "trainer_place_top3", "trainer_win90",
        "trainer_n90", "trainer_top3_90", "trainer_form", "trainer_rest_top3", "tj_top3", "tj_n", "trainer_changed",
        "circuit", "surface", "going", "sex", "place"]
SPEED = ["speed_prev", "speed_best", "speed_avg3", "speed_best_rel", "speed_avg3_rel", "stamina_fade3", "kick3",
         "dist_change", "dist_vs_avg", "speed_short", "speed_mid", "speed_long", "stamina_idx", "speed_at_class",
         "turn", "horse_turn_top3", "turn_pref", "turn_same_prev", "age_rel"]
STABLE = ["stable_region", "trainer_surface_top3", "trainer_dist_top3", "trainer_place_top3", "trainer_win90",
          "trainer_n90", "trainer_top3_90", "trainer_form", "trainer_rest_top3", "tj_top3", "tj_n", "trainer_changed"]
AGEREST = ["age_top3", "age_sex_top3", "age_surface_top3", "age_dist_top3", "age_circuit_top3", "age_win",
           "rest_top3", "rest_age_top3", "rest_class_top3", "rest_surface_top3", "rest_win", "rest_bin",
           "horse_rest_top3", "horse_rest_pref", "age_x_rest"]
DAY = ["career_known", "career_n", "jr_nth", "jr_total", "jr_left", "jr_wins_today", "race_no", "is_last_race", "races_in_day"]
BODY = ["bw_dev", "bw_dev_pct", "bw_vs_avg3", "bw_growth", "bw_rel_race", "burden", "bw_pct_sex", "bw_std_horse",
        "bw_vs_win"]
PACE = ["early3", "early_rank_pct", "n_front_like", "front_share_like", "field_early_mean", "early_vs_field",
        "pace_pressure_x_kick", "pace_pressure_x_early"]
CLASSX = ["prev_class_level", "class_move", "class_max_past", "class_vs_max", "horse_class_top3", "horse_class_n", "class_rate"]
JSPEED = ["jockey_speed_gain", "jockey_best_speed_cond", "jockey_best_speed_all", "jockey_speed_gain_rel"]
PACE2 = ["prev_pace_rel", "pace_avg3", "speed_hi_pace", "speed_slow_pace", "pace_pref", "kick_pace_adj3", "pace_fit"]
FORM = ["h_gap3", "h_gap5", "h_sur_win3", "h_sur_win5", "h_sur_top33", "h_sur_top35", "h_under_streak",
        "j_gap_30d", "j_sur_top3_30d", "j_sur_win_30d", "t_gap_30d", "t_sur_top3_30d", "t_sur_win_30d"]
COMBO = ["pair_sur_top3", "pair_sur_win", "tj_sur_top3", "tj_sur_win", "js_place_sur", "js_dist_sur", "js_surface_sur",
         "tp_place_sur", "tp_surface_sur", "tp_dist_sur", "pair_sur_comb"]
ANALOG = ["an_pos_exc", "an_pos_going_exc", "an_age_exc", "an_sex_exc", "an_cond_n"]
BASE = BASE + [c for c in ANALOG if c not in BASE]
BASE = BASE + [c for c in COMBO if c not in BASE]
BASE = BASE + [c for c in FORM if c not in BASE]
BASE = BASE + [c for c in PACE2 if c not in BASE]
BASE = BASE + [c for c in JSPEED if c not in BASE]
BASE = BASE + [c for c in CLASSX if c not in BASE]
BASE = BASE + [c for c in PACE if c not in BASE]
BASE = BASE + [c for c in BODY if c not in BASE]
BASE = BASE + [c for c in DAY if c not in BASE]
BASE = BASE + [c for c in AGEREST if c not in BASE]
BASE = BASE + [c for c in SPEED if c not in BASE]  # スピード・スタミナ・回り・年齢差
NEW = ["class_group", "class_level", "age_cond", "pos_ratio", "day_bias_pos", "day_bias_races", "bias_fit"]
MARKET = ["odds", "popularity"]  # 市場情報。入れると精度は上がるが「市場の写し」になり妙味が消える


PED = ["sire_top3", "sire_surface_top3", "sire_dist_top3", "damsire_top3", "damsire_surface_top3",
       "damsire_dist_top3", "ss_top3", "ss_surface_top3", "ss_dist_top3", "sire_win_rate", "has_ped",
       "sire_id_cat", "damsire_id_cat"]


STYLE = ["style_pos", "style_rel", "style_rank_pct", "n_front", "front_share", "n_known_style"]


RATE = ["rate_h", "rate_j", "rate_t", "rate_sum", "p_rate", "rate_rel", "rate_j_rel"]


def feature_cols(use_odds: bool, df: pd.DataFrame = None, use_style: bool = False, use_new: bool = True,
                 use_rating: bool = True, use_stable: bool = True, use_speed: bool = True):
    cols = [c for c in BASE if (use_new or c not in NEW) and (use_stable or c not in STABLE) and (use_speed or c not in SPEED)] + (MARKET if use_odds else [])
    if use_rating and df is not None and "rate_sum" in df.columns:
        cols += RATE
    if use_style and df is not None and "style_pos" in df.columns:
        cols += STYLE
    if df is not None and "sire_top3" in df.columns:  # 血統データがあるときだけ使う
        cols += PED
    return cols
