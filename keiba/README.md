# 競馬予想モデル (JRA + NAR)

netkeiba(db.netkeiba.com)の結果を差分収集 → LightGBMで3種類のモデルを学習 → 出馬表から予想。
**個人利用の範囲で。** アクセス間隔は `common.py` の `SLEEP`(1.5秒)。短くしないでください。

## 手順
```bash
pip install -r requirements.txt
python collect.py --start 2022-01-01 --end 2024-12-31   # 初回バックフィル(数時間〜。途中で止めても再開可)
python train.py                                          # オッズ無し=妙味探し向け(推奨)
python train.py --use-odds                               # オッズ込み=的中率重視
python predict.py <race_id> [--date YYYY-MM-DD]          # 出馬表から予想
```
## 3つのモデル
| 目的 | モデル | 出力 |
|---|---|---|
| 単勝(1着) | LGBMClassifier | p_win |
| 複勝(3着内) | LGBMClassifier | p_top3 |
| 着順ランキング | LGBMRanker(LambdaRank) | rank_score |

`predict.py` は `EV = p_win × 単勝オッズ` も表示(1超えで期待値プラス**の可能性**)。

## ルーティン収集 (Windowsタスクスケジューラ)
`python collect.py` を引数なしで実行すると「前回の続き〜昨日」だけ追加します。毎朝1回で十分。
```powershell
schtasks /create /tn "keiba-collect" /sc daily /st 06:00 /tr "python C:\...\keiba\collect.py"
```
## 注意
- 特徴量は全てレース前の情報のみ(リーク防止)。検証は日付順の時系列分割。
- 回収率は必ず `train.py` のテスト期間ROIで確認。控除率(約20-25%)があり、1.0超えは容易でない。
- 出馬表パース(predict.py)はHTML構造依存。変更されたら `fetch_entries` を直す。

## データの正確性チェック
- `collect.py` は保存前に全レースを `validate.py` で検査し、不正なら保存せず `data/rejected.log` に記録(次回再試行)。
  検査内容: 馬番の重複/欠損、1着の有無と着順の連続性(同着対応)、斤量・馬体重・オッズ・上り3Fの範囲、
  オッズと人気の整合(列ずれ検知)、勝ち時計と距離の整合、馬場/距離の取得漏れ、日付とrace_idの年の一致。
- 事後監査: `python validate.py`(問題の一覧) / `python validate.py --fix`(問題レースを除外→collectで再取得)。
- 対象外: ばんえい(帯広)。全頭取消などのレース不成立は保存しない。
- 学習前に `python validate.py` を必ず実行すること。

## 毎日の自動運用 (2026-10〜)
- Windowsタスク `keiba-daily` が毎朝6:00に `daily_update.py` を実行(PCが止まっていた場合は起動後に実行)。
- 流れ: ①前日までの結果収集(結果+払戻+賞金+通過順位) ②新しい馬の血統 ③レーティング更新 ④データ検査 ⑤(月曜)再学習
  ⑥出馬表の取得と予想(`upcoming.py`: 今日〜3日先。予想は `data/predictions_log.csv` に記録) ⑦レポート(`report.py` → `data/report_latest.md`)
- 収集は1回2時間まで。未取得の期間(2025年〜)は数日かけて追いつく。ログ: `data/daily_log.txt`
- 手動実行: `python daily_update.py` / 予想だけ: `python upcoming.py` / レポートだけ: `python report.py`
- 予想は、オッズ発表済みなら「市場込み」(train_resid.py)、未発表なら「市場なし・参考」(過信しやすい)。

## レポートの閲覧(スマホ・他PC)
- Windowsタスク `keiba-daily` は 03:30 開始。`data/report_latest.html`(スマホ向け)と `data/report_latest.md` を作る。
- Claudeのスケジュールタスク `keiba-morning-report`(毎朝7:30頃)が、HTMLを claude.ai のArtifact(専用・非共有)に再公開し、要点をスマホへ通知する。
- 手動: `python report.py`(md+html)。HTMLだけ: `python report_html.py`。
