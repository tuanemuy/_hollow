# 動作確認計画 — Issue #595: P40 ダッシュボード backend 新設（24h チャート + 最近のアクティビティ）

**Issue:** #595
**作成日:** 2026-06-17

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

```bash
pnpm db:generate                 # Drizzle schema から新規マイグレーション SQL を生成（activity_log / ingestion_burst_log を追加した場合）
pnpm db:migrate                  # ローカル D1 (hollow-local-d1) にマイグレーションを適用
pnpm seed:dev-admin              # 決定的な admin ユーザー + セッション（token: dev-admin-session-token）を投入
pnpm dev                         # vite dev (workerd) を http://localhost:3000 で起動
```

- `/admin` は admin 権限が必要。`seed:dev-admin` が投入する admin セッション（cookie に `dev-admin-session-token`）でアクセスする。
- **チャート（PR-A）** は `ingestion_jobs` テーブルからの read-time 集計なので、ingestion ジョブのシードがあれば `pnpm dev` 単体で即描画される。
- **最近のアクティビティ（PR-B）** は outbox → relay → queue → consumer の projection を経て `activity_log` に書かれる。`pnpm dev`（workerd + miniflare queues）でイベントパイプラインが回る前提。回らない/projection が遅延する場合は、イベント発生操作（後述）後に数秒待つか、consumer worker のローカル実行手順を確認する（要確認: ローカルで relay/consumer を手動 tick する標準コマンドが README/package.json に無いため、`pnpm dev` のキュー処理に依存）。

### シードデータ

- admin: `pnpm seed:dev-admin`（冪等）。
- チャート確認用の ingestion ジョブ / アクティビティ確認用イベント（新規ユーザー・アップロード・ジョブ失敗・設定変更）は、ブラウザ操作または `pnpm db:execute:local --file <sql>` で投入する。manual-test 実行時に時刻を直近 24h 内に散らしたシード SQL を用意する。

### デプロイ方法

検証環境（ローカル D1 + `pnpm dev`）のみで確認できるため、ステージング/本番へのデプロイは本確認には不要。
（参考: ステージング反映は `pnpm db:apply:staging` でマイグレーション適用 → `pnpm deploy:staging:all`。本確認では使わない。）

## 確認項目

### 1. 直近 24 時間チャート（アップロード系列）が実データで描画される

- **対応する受け入れ基準:** AC-1, AC-3
- **目的:** `ingestion_jobs` の hourly 集計が直近 24 バケットで正しく描かれる
- **手順:**
  1. 直近 24h 内の複数時間帯に `created_at` を持つ ingestion ジョブをシードする（一部時間帯は 0 件にする）
  2. admin セッションで `/admin` を開く
  3. 「直近 24 時間」セクションのアップロード sparkline を確認する
- **期待結果:** 投入した時間帯にピーク、0 件の時間帯は平坦（0）として連続した 24 バケットで描かれる
- **確認ポイント:** 0 件の時間帯が「取得失敗」ではなく平坦線（0）で正直に描かれること（AC-3 の null と 0 の区別）

### 2. LLM 系列の扱いが虚偽表示にならない

- **対応する受け入れ基準:** AC-2
- **目的:** LLM 呼び出しの記録源が無い場合、LLM 系列を描かない/既存 scalar カードの挙動が変わらない
- **手順:**
  1. `/admin` を開く
  2. LLM 関連のチャート系列・既存「LLM 呼び出し (24h)」metric-card の表示を確認する
- **期待結果:** A-1 の確定結果に従い、記録源が無ければ LLM hourly 系列は描かれない。既存 scalar カードは #545 と同じ表示（『取得失敗』）のまま変化しない
- **確認ポイント:** ダミー数値の LLM 系列が描かれていないこと

### 3. 最近のアクティビティが実イベントから記録・表示される

- **対応する受け入れ基準:** AC-4, AC-5, AC-6
- **目的:** 各種イベントが activity_log に projection され、4 列（時刻・種類・対象・詳細）が実データで埋まる
- **手順:**
  1. 新規ユーザー登録（`user.created`）、アップロード（`ingestion.created`）、ジョブ失敗（`ingestion.failed`）、admin 設定変更（登録制御 / LLM 設定 / プロンプト等）を発生させる
  2. projection 反映を数秒待ち、`/admin` の「最近のアクティビティ」テーブルを確認する
- **期待結果:** 発生させたイベントが occurredAt 降順で行表示され、各列（対象=ハンドル名等 / 詳細=エラー要約・設定種別等）が実データで埋まる
- **確認ポイント:** 種類タグ（info/warning/error/success）が種別に対応。対象・詳細が ID 直書きや空文字でなく人間可読であること（AC-5）

### 4. 設定変更が活動行として記録される（書き込み側）

- **対応する受け入れ基準:** AC-6
- **目的:** 棚卸しで emit 対象とした全 adminSettings 変更系 usecase が活動行を生む
- **手順:**
  1. `/admin` 配下で登録制御の切り替え・LLM 設定更新・プロンプトテンプレート更新などを順に実行する
  2. 「最近のアクティビティ」に各操作が「設定変更」種別で現れることを確認する
- **期待結果:** emit 対象とした各設定変更が漏れなく活動行になる
- **確認ポイント:** plan B-6 の棚卸しで「emit する」とした usecase がすべて行を生み、「emit しない」とした操作が行を生まないこと

### 5. 導線（「期間を変更」「すべて見る」）が虚偽表示にならない

- **対応する受け入れ基準:** AC-8
- **目的:** 遷移先が無い導線をリンクとして描かない
- **手順:** `/admin` でチャート/アクティビティ各セクションの導線を確認する
- **期待結果:** 遷移先を実装していない導線はリンクとして描かれない（クリックできる死んだリンクが無い）

## エッジケース・異常系

### 1. アクティビティが空（リリース直後 / バックフィル無し）

- **目的:** イベント未発生時の空状態 UI
- **手順:** `activity_log` を空のまま `/admin` を開く（projection 前 / 新規環境）
- **期待結果:** 「アクティビティはまだありません」等の honest な空状態が出て、「すべて見る」リンクは非表示。空状態メッセージと導線が二重表示にならない（AC-8 / C-1 共存ケース）

### 2. チャート取得失敗

- **目的:** 系列取得が失敗したときの degrade
- **手順:** provider が系列を `null` で返す状況を再現する（集計クエリ失敗を擬似）
- **期待結果:** 当該系列が「取得失敗」プレースホルダになり、ページ全体は落ちない（partial-failure 契約、AC-3）

### 3. 同一イベント二重配信での冪等性

- **目的:** at-least-once 配信で活動行が二重化しない
- **手順:** 同一 `eventId` のイベントを 2 回 dispatch させる（または同操作の再配信を待つ）
- **期待結果:** activity_log に行が 1 つだけ（`event_id` unique による冪等、AC-7）。大量アップロード集約も二重計上しない

## 既存機能への影響確認

- **既存 4 metric-card（userCount / storage / uploadsToday / llmCallsToday）**: D1 provider 差し替え後も scalar は `null` 固定で、#545 時点の表示（『取得失敗』）から変化しないこと（回帰確認）。
- **ingestion ジョブ実行**: `dispatchDomainEvent` の `ingestion.created` fan-out 追加後も `runIngestionJob` の既存ジョブ実行が壊れないこと（アップロード → ジョブ完了が従来どおり動く）。
- **他 consumer**: 新規イベント type（`instance_settings.updated` 等）が他の consumer で `default: skipped` され、既存の検索インデックス・SavedView 等の projection に影響しないこと。
- **pruner**: 既存の `outbox_events` 刈り込みが従来どおり動き、新規 prune（`ingestion_burst_log` 24h / `activity_log` 90 日）が追加で動くこと。
