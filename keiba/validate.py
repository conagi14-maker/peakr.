"""データ検証。収集時(collect.py)と事後監査(python validate.py [--fix])の両方で使う。

問題のあるレースは collect では保存せず data/rejected.log に記録、
--fix では races/results から除外する(次回 collect で再取得される)。"""
import re
import sys

import pandas as pd

from common import EXCLUDE_PLACES, RACES_CSV, RESULTS_CSV

SEX = set("牡牝セ")


def num(x):
    try:
        v = float(str(x).replace(",", ""))
        return None if v != v else v
    except ValueError:
        return None


def time_sec(s):
    m = re.fullmatch(r"(\d+):(\d{2}(?:\.\d)?)", str(s).strip())
    return int(m[1]) * 60 + float(m[2]) if m else None


def validate_race(race: dict, rows: list[dict]) -> list[str]:
    """返り値: 問題点のリスト(空なら合格)。値は文字列でもfloatでも可。"""
    p = []
    rid = str(race["race_id"])
    if rid[4:6] in EXCLUDE_PLACES:
        return ["対象外の競馬場(ばんえい)"]
    if not re.fullmatch(r"\d{12}", rid):
        p.append("race_id形式不正")
    if str(race["date"])[:4] != rid[:4]:
        p.append(f"日付とrace_idの年が不一致 {race['date']}/{rid}")
    if race.get("surface") not in ("芝", "ダ", "障"):
        p.append(f"surface不正 {race.get('surface')}")
    dist = num(race.get("distance"))
    if dist is None or not 800 <= dist <= 4500:
        p.append(f"distance不正 {race.get('distance')}")
    if not race.get("going") or str(race.get("going")) == "nan":
        p.append("馬場状態が取得できていない")

    n = len(rows)
    if n < 4:
        p.append(f"出走頭数が少なすぎる n={n}")
        return p
    um = [num(r.get("umaban")) for r in rows]
    if None in um or len(set(um)) != n:
        p.append("馬番が欠損または重複")
    elif max(um) > 30 or min(um) < 1:
        p.append("馬番が範囲外")
    if any(not r.get("horse_id") or str(r.get("horse_id")) == "nan" for r in rows):
        p.append("horse_id欠損")
    if any(not r.get("jockey_id") or str(r.get("jockey_id")) == "nan" for r in rows):
        p.append("jockey_id欠損")
    if len({str(r.get("horse_id")) for r in rows}) != n:
        p.append("同一馬が重複")

    ranks = sorted(x for x in (num(r.get("rank")) for r in rows) if x is not None)
    if not ranks or ranks[0] != 1:
        p.append("1着がいない(全頭取消/中止などレース不成立)")
    else:  # 同着を許す競技方式の順位(1,2,2,4...)になっているか
        if any(x != ranks.index(x) + 1 for x in ranks):
            p.append(f"着順が連続していない {ranks}")
        if ranks[-1] > n:
            p.append("着順が頭数を超えている")

    for r in rows:
        tag = f"馬番{r.get('umaban')}"
        if r.get("sexage") and (str(r["sexage"])[0] not in SEX or not 2 <= (num(str(r["sexage"])[1:]) or 0) <= 30):
            p.append(f"{tag} 性齢不正 {r['sexage']}")
        w = num(r.get("weight_carried"))
        if w is None or not 40 <= w <= 65:
            p.append(f"{tag} 斤量不正 {r.get('weight_carried')}")
        o = num(r.get("odds"))
        if num(r.get("rank")) is not None and (o is None or o < 1.0):
            p.append(f"{tag} オッズ不正 {r.get('odds')}")
        b = re.match(r"(\d+)\(", str(r.get("body", "")))
        if b and not 300 <= int(b[1]) <= 700:
            p.append(f"{tag} 馬体重不正 {r['body']}")
        l = num(r.get("last3f"))
        if l is not None and race.get("surface") != "障" and not 28 <= l <= 90:
            p.append(f"{tag} 上り3F不正 {l}")

    # 整合性: 単勝オッズが最も低い馬が1番人気のはず(列ずれ検知)
    od = [(num(r.get("odds")), num(r.get("popularity"))) for r in rows]
    od = [(o, q) for o, q in od if o is not None and q is not None]
    if len(od) >= 4:
        if min(od)[1] != 1 and sorted(od)[0][1] > 2:
            p.append("オッズと人気が矛盾(列ずれの疑い)")
    # 単勝オッズの逆数の合計は 1/(1-控除率) ≒ 1.25 付近になるはず(全出走馬のオッズがある場合)
    inv = [1 / max(o, 1.0) for o, _ in od]
    if len(od) == n and not 1.10 <= sum(inv) <= 1.40:
        p.append(f"オッズの逆数合計が異常 {sum(inv):.2f}")
    # 勝ち時計の妥当性
    win = [r for r in rows if num(r.get("rank")) == 1]
    t = time_sec(win[0].get("time")) if win else None
    if t and dist and not 10.0 <= dist / t <= 20.0:
        p.append(f"勝ち時計が不自然 {win[0].get('time')} / {dist}m")
    return p[:10]


def audit(fix: bool):
    if not RACES_CSV.exists():
        print("データなし")
        return
    races = pd.read_csv(RACES_CSV, dtype=str).fillna("")
    res = pd.read_csv(RESULTS_CSV, dtype=str).fillna("")
    bad = {}
    if races.race_id.duplicated().any():
        print(f"races重複 {races.race_id.duplicated().sum()}件")
        bad.update({r: ["races重複"] for r in races.race_id[races.race_id.duplicated()]})
    dup = res.duplicated(["race_id", "umaban"])
    if dup.any():
        bad.update({r: ["results重複"] for r in res.race_id[dup]})
    for r in set(res.race_id) ^ set(races.race_id):
        bad[r] = ["racesとresultsの片方にしか存在しない"]
    grouped = {k: g.to_dict("records") for k, g in res.groupby("race_id")}
    for race in races.to_dict("records"):
        probs = validate_race(race, grouped.get(race["race_id"], []))
        if probs:
            bad.setdefault(race["race_id"], []).extend(probs)
    print(f"検査 {len(races)} レース / {len(res)} 行 → 問題あり {len(bad)} レース")
    for rid, pr in list(bad.items())[:20]:
        print(" ", rid, "; ".join(pr[:3]))
    if fix and bad:
        races[~races.race_id.isin(bad)].to_csv(RACES_CSV, index=False)
        res[~res.race_id.isin(bad)].to_csv(RESULTS_CSV, index=False)
        print(f"{len(bad)} レースを除外しました。collect.py を再実行すると再取得されます。")
    elif bad:
        print("--fix を付けると除外します。")


def audit_payouts():
    """払戻と結果の突き合わせ: 1着馬の単勝払戻 = 単勝オッズ×100、複勝は3着内の頭数分あるか。"""
    from common import PAYOUTS_CSV
    if not PAYOUTS_CSV.exists():
        return
    pay = pd.read_csv(PAYOUTS_CSV, dtype=str).fillna("")
    res = pd.read_csv(RESULTS_CSV, dtype=str)
    res["rank"] = pd.to_numeric(res["rank"], errors="coerce")
    res["odds"] = pd.to_numeric(res["odds"], errors="coerce")
    nwin = res[res["rank"] == 1].groupby("race_id").size()
    win = res[res["rank"] == 1].copy()
    win["combo"] = win["umaban"].astype(float).astype(int).astype(str)
    t = pay[pay.bet == "単勝"].merge(win[["race_id", "combo", "odds"]], on=["race_id", "combo"], how="left")
    t["payout"] = pd.to_numeric(t["payout"], errors="coerce")
    t["dead_heat"] = t.race_id.map(nwin).fillna(1) > 1   # 1着同着は払戻が分割されオッズ×100と一致しない
    bad = t[~t.dead_heat & ((t.odds.isna()) | ((t.payout - t.odds * 100).abs() > 1))]
    print(f"[払戻照合] 単勝 {len(t)}件(うち1着同着 {int(t.dead_heat.sum())}件は除外)中 不一致 {len(bad)}件")
    for _, r in bad.head(10).iterrows():
        print("  ", r.race_id, "払戻", r.payout, "オッズ×100", r.odds * 100 if r.odds == r.odds else None)
    # 複勝: 8頭以上は3着まで、5〜7頭は2着まで(同着は着順タイで数える)
    starters = res[res["odds"].notna() | res["rank"].notna()].groupby("race_id").size()
    k = starters.map(lambda n: 3 if n >= 8 else (2 if n >= 5 else 0))
    rk = res.merge(k.rename("k"), left_on="race_id", right_index=True)
    exp = rk[rk["rank"] <= rk["k"]].groupby("race_id").size()
    fuku = pay[pay.bet == "複勝"].groupby("race_id").size()
    cmp = pd.concat([fuku.rename("fuku"), exp.rename("exp")], axis=1).dropna()
    print(f"[払戻照合] 複勝の件数が想定(頭数と同着から計算)と違うレース: {(cmp.fuku != cmp.exp).sum()} / {len(cmp)}")

if __name__ == "__main__":
    audit("--fix" in sys.argv)
    audit_payouts()
