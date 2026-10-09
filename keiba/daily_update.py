"""毎日の更新ルーティン。Claudeのスケジュールタスクから呼ぶ(Windowsのタスクは使わない)。

  python daily_update.py --detach     # 切り離して開始し、すぐ戻る(Claudeのタスクはこれを呼ぶ)
  python daily_update.py --status     # 進み具合を表示(JSON)
  python daily_update.py --wait 8     # 今日のレポートができるまで最大8分待つ(できたら READY と表示)
  python daily_update.py --detach --report-only   # 収集が実行中でも、出馬表の予想とレポートだけを作り直す
  python daily_update.py              # その場で最後まで実行(手動用)
  python daily_update.py --retrain    # 月曜以外でも再学習を含める

二重起動しない(ロックファイル)。PCが止まるなどで途中で止まっても、次に呼ばれたとき最初から安全にやり直せる
(収集・血統は取得済みを飛ばして再開する)。進み具合は data/pipeline_status.json に書く。

流れ(結果データが4日以上遅れているときは、先にレポートを出してから長い収集を行う):
  [通常]   ①収集(最大60分) ②これからのレースの出馬表と予想 ③レポート ④血統 ⑤レーティング ⑥検査 (⑦月曜は再学習)
  [遅れ大] ①これからのレースの出馬表と予想 ②レポート ③収集(最大150分) ④血統 ⑤レーティング ⑥検査 (⑦月曜は再学習)
"""
import argparse
import datetime as dt
import json
import os
import subprocess
import sys

import pandas as pd

from common import DATA, RACES_CSV, ROOT

STATUS = DATA / "pipeline_status.json"
LOCK = DATA / "pipeline.lock"
LOG = DATA / "daily_log.txt"


def now_s():
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def pid_alive(pid: int) -> bool:
    try:
        out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True).stdout
        return str(pid) in out
    except Exception:
        return False


def read_status() -> dict:
    try:
        return json.load(open(STATUS, encoding="utf-8"))
    except Exception:
        return {}


def write_status(**kw):
    s = read_status()
    s.update(kw)
    s["updated_at"] = now_s()
    json.dump(s, open(STATUS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def running_pid():
    if LOCK.exists():
        try:
            pid = int(LOCK.read_text().strip())
            if pid_alive(pid):
                return pid
        except ValueError:
            pass
    return None


def data_lag_days() -> int:
    try:
        last = pd.read_csv(RACES_CSV, usecols=["date"]).date.max()
        return (dt.date.today() - dt.date.fromisoformat(last)).days
    except Exception:
        return 999


def run(log, title, args):
    log.write(f"\n=== {title} {now_s()}\n")
    log.flush()
    write_status(stage=title, stage_started_at=now_s())
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
    # 子の処理は、独立した処理グループ・窓なしで動かす(外からのCtrl+C等の中断信号で巻き添えにならないように)
    p = subprocess.run([sys.executable, *args], cwd=ROOT, env=env, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
                       creationflags=0x08000000 | 0x00000200)
    tail = "\n".join(p.stdout.strip().splitlines()[-12:])
    log.write(tail + f"\n(終了コード {p.returncode})\n")
    log.flush()
    return p.returncode


def pipeline(a):
    if a.report_only:  # レポートだけ(実行中の収集とは独立。ロックは使わない)
        with open(LOG, "a", encoding="utf-8") as log:
            log.write(f"\n##### レポートのみ 開始 {now_s()}\n")
            write_status(report_only_started_at=now_s())
            ok = True
            for title, args in (("(レポートのみ)出馬表取得と予想", ["upcoming.py", "--days", str(a.up_days), "--ped-limit", str(a.ped_limit)]),
                                ("(レポートのみ)レポート作成", ["report.py"])):
                ok = run(log, title, args) == 0 and ok
            if ok:
                write_status(report_ready_at=now_s())
            log.write(f"##### レポートのみ 終了 {now_s()} ({'成功' if ok else '失敗'})\n")
        return
    lag = data_lag_days()
    catchup = lag >= 4
    with open(LOG, "a", encoding="utf-8") as log:
        log.write(f"\n##### 開始 {now_s()}  結果データの遅れ {lag}日 ({'遅れ大: 先にレポート' if catchup else '通常'})\n")
        # 今日すでにレポートができていれば、遅れ大モードでは作り直さない(中断後の再開で同じ工程を繰り返さないため)
        ready_today = str(read_status().get("report_ready_at") or "")[:10] == dt.date.today().isoformat()
        write_status(run_started_at=now_s(), report_ready_at=read_status().get("report_ready_at") if (ready_today and catchup) else None,
                     finished_at=None, lag_days=lag, mode="catchup" if catchup else "normal", failed=[])
        failed = []

        def step(title, args, tries=2):
            for k in range(tries):  # 外部要因で中断されても、やり直す(収集・血統は取得済みを飛ばして再開する)
                if run(log, title if k == 0 else f"{title}(やり直し{k})", args) == 0:
                    return
            failed.append(title)
            write_status(failed=failed)

        def step_collect(title, minutes):
            """収集は時間の予算内で、中断されたら続きから繰り返す。正常終了(時間上限に達した場合を含む)で終える。"""
            end = dt.datetime.now() + dt.timedelta(minutes=minutes)
            bad = 0
            while dt.datetime.now() < end and bad < 3:
                left = (end - dt.datetime.now()).total_seconds() / 60
                if run(log, title if bad == 0 else f"{title}(続きから)", ["collect.py", "--max-minutes", f"{left:.1f}"]) == 0:
                    return
                bad += 1
            if bad >= 3:
                failed.append(title)
                write_status(failed=failed)

        def report_stage():
            step("これからのレースの出馬表取得と予想", ["upcoming.py", "--days", str(a.up_days), "--ped-limit", str(a.ped_limit)])
            step("レポート作成", ["report.py"])
            if "レポート作成" not in failed and "これからのレースの出馬表取得と予想" not in failed:
                write_status(report_ready_at=now_s())

        if catchup:
            if not ready_today:
                report_stage()
            step_collect("レース結果の収集(遅れを取り戻す)", a.collect_min_catchup)
        else:
            step_collect("レース結果の収集", a.collect_min)
            report_stage()
        step("血統の収集(新しい馬)", ["collect_pedigree.py", "--max-minutes", str(a.ped_min)])
        step("レーティング更新", ["ratings.py", "--refresh"])
        step("データ検査", ["validate.py"])
        if a.retrain or dt.date.today().weekday() == 0:   # 月曜は週1回の再学習
            step("再学習: 市場なしモデル", ["train.py"])
            step("再学習: 市場との時系列検証", ["residual_model.py"])
            step("再学習: 市場込みモデル(本番用)", ["train_resid.py"])
            step("狙い目などの基準と実績", ["selection_params.py"])
        write_status(stage="完了", finished_at=now_s(), failed=failed)
        log.write(f"##### 終了 {now_s()} (失敗した工程: {failed or 'なし'})\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--detach", action="store_true", help="切り離して開始し、すぐ戻る")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--wait", type=float, default=None, help="今日のレポートができるまで最大N分待つ")
    ap.add_argument("--retrain", action="store_true", help="再学習(月曜は自動で行う)")
    ap.add_argument("--up-days", type=int, default=4, help="何日先までの出馬表を取るか")
    ap.add_argument("--ped-limit", type=int, default=200)
    ap.add_argument("--collect-min", type=float, default=60)
    ap.add_argument("--collect-min-catchup", type=float, default=150)
    ap.add_argument("--ped-min", type=float, default=30)
    ap.add_argument("--report-only", action="store_true", help="出馬表の予想とレポートだけ作る")
    ap.add_argument("--worker", action="store_true", help="(内部用) 実処理")
    a = ap.parse_args()
    DATA.mkdir(exist_ok=True)

    if a.wait is not None:
        import time as _t
        end = _t.time() + a.wait * 60
        ready = False
        while True:
            s = read_status()
            ready = str(s.get("report_ready_at") or "")[:10] == dt.date.today().isoformat()
            if ready or _t.time() >= end:
                break
            _t.sleep(20)
        s["running_pid"] = running_pid()
        s["lag_days"] = data_lag_days()
        print("READY" if ready else "WAITING")
        print(json.dumps(s, ensure_ascii=False, indent=1))
        return

    if a.status:
        s = read_status()
        s["running_pid"] = running_pid()
        s["lag_days"] = data_lag_days()
        print(json.dumps(s, ensure_ascii=False, indent=1))
        return

    pid = None if a.report_only else running_pid()
    if pid and not a.worker:
        print(json.dumps({"started": False, "reason": f"すでに実行中(PID {pid})", **read_status()}, ensure_ascii=False))
        return

    if a.detach and not a.worker:
        cmd = [sys.executable, str(ROOT / "daily_update.py"), "--worker"] + [x for x in sys.argv[1:] if x != "--detach"]
        flags = 0x00000008 | 0x00000200   # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP(呼び出し元が終わっても続く)
        p = subprocess.Popen(cmd, cwd=ROOT, creationflags=flags, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, close_fds=True)
        if not a.report_only:
            LOCK.write_text(str(p.pid))
            write_status(stage="開始待ち", run_started_at=now_s(), finished_at=None)  # report_ready_at は消さない(今日の分を再利用するため)
        print(json.dumps({"started": True, "pid": p.pid}, ensure_ascii=False))
        return

    if a.report_only:
        pipeline(a)
        return
    LOCK.write_text(str(os.getpid()))
    try:
        pipeline(a)
    finally:
        try:
            if LOCK.exists() and LOCK.read_text().strip() == str(os.getpid()):
                LOCK.unlink()
        except Exception:
            pass


if __name__ == "__main__":
    main()
