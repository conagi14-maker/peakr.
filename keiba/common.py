"""共通: HTTP取得・パス・競馬場コード"""
import time
from pathlib import Path

import requests

ROOT = Path(__file__).parent
DATA = ROOT / "data"
MODELS = ROOT / "models"
RACES_CSV = DATA / "races.csv"      # 1レース1行
RESULTS_CSV = DATA / "results.csv"  # 1出走馬1行
PAYOUTS_CSV = DATA / "payouts.csv"  # 払戻(race_id, bet, combo, payout, pop)
PASSING_CSV = DATA / "passing.csv"  # 通過順位(race_id, umaban, passing)。脚質の元データ

UA = {"User-Agent": "Mozilla/5.0 (personal research; keiba-model)"}
SLEEP = 1.5  # 秒。相手サーバーへの負荷配慮のため短くしないこと

EXCLUDE_PLACES = {"65"}  # 帯広(ばんえい)は競技が別物なので対象外
JRA_PLACES = {f"{i:02d}" for i in range(1, 11)}  # 01札幌..10小倉


def circuit_of(race_id: str) -> str:
    return "JRA" if race_id[4:6] in JRA_PLACES else "NAR"


_session = requests.Session()
_session.headers.update(UA)


def fetch(url: str, retries: int = 3) -> str:
    """netkeiba系はEUC-JP。礼儀として毎回スリープする。"""
    for i in range(retries):
        try:
            r = _session.get(url, timeout=20)
            time.sleep(SLEEP)
            if r.status_code == 200:
                r.encoding = r.apparent_encoding or "euc-jp"
                return r.text
        except requests.RequestException:
            time.sleep(SLEEP * (i + 2))
    raise RuntimeError(f"fetch failed: {url}")
