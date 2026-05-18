# ADR — Issue #3: P46 管理者ジョブ監視画面

## ADR-001: 失敗 → pending の `retry` 遷移をドメイン一級として追加する

### Status
Proposed

### Context
spec G3「失敗ジョブは再試行ボタンを表示」を満たすには、`failed` 状態のジョブを再実行可能にする必要がある。既存ドメインには:
- `IngestionJob.startProcessing` / `ExportJob.startProcessing` は `pending` 状態のみ受け付ける
- `markFailed` / `fail` で `failed` に到達した後、再び `pending` に戻す遷移は存在しない
- 再実行用 usecase も存在しない

選択肢:
1. ドメインに `retry(failed → pending)` 遷移を追加する
2. adapter / usecase で DB を直接 `pending` に書き戻す
3. `failed` エンティティを破棄して新規 `IngestionJob` / `ExportJob` を作る

### Decision
選択肢 1。`retry(job: FailedIngestionJob, now): WithEventDrafts<PendingIngestionJob, IngestionEvent>` をエンティティ純粋関数として追加する（export も同様）。

### Consequences
- 良い点:
  - 不変条件（`tempStorageKey === null` のときは retry 不可、`errorCode`/`errorReason`/`preview` リセットなど）を domain 側で型と純粋関数で表現できる
  - `version.next()` / event drafts 発行という既存パターンに完全に乗る
  - usecase / adapter にロジックが漏れない
- トレードオフ:
  - 新規イベント `IngestionEvents.retryRequested` / `ExportEvents.retryRequested` を追加する必要がある
  - 既存ドメインテストへの追加が必要

---

## ADR-002: 再実行は retry 遷移 + Outbox イベント発行までで線を引き、ジョブ実行配線は別 Issue

### Status
Proposed

### Context
現状 `app/worker/cloudflare/handlers.ts` の `handleQueue` は受信したイベントを冪等性ストアにマークして ack するだけで、`runIngestionJob` / `runExportJob` を呼ぶ配線が存在しない。つまり「成功フロー」の実行配線も未整備の状態。

選択肢:
1. retry usecase 内で `runIngestionJob` / `runExportJob` を同期 await する短絡実行を組み込む
2. retry は state 遷移 + Outbox イベント発行までを担い、実行配線は別 Issue とする
3. queue consumer の配線も本 Issue で実装する

### Decision
選択肢 2。`retryIngestionJob` / `retryExportJob` は `failed → pending` 遷移と `IngestionEvents.retryRequested` / `ExportEvents.retryRequested` の Outbox 発行までを担い、queue consumer 側で `runIngestionJob` / `runExportJob` を呼ぶ配線は別 Issue 化する。

### Consequences
- 良い点:
  - 本 Issue（P46 spec 乖離解消）のスコープが明確になる
  - hexagonal の境界を尊重できる（usecase が worker を直接 await しない）
  - 既存 spec / Outbox 契約（at-least-once + idempotent）と一貫
- トレードオフ:
  - 再実行ボタンを押しても実際の処理パイプラインは進まない（`pending` に戻るだけ）
  - manual-test では「pending に戻る」「Outbox に乗る」までを検証
  - UI 上の文言は「再実行を受け付けました」とし、実際の処理進行を強く約束しない
- 補足:
  - queue consumer 配線の不在自体は本 Issue とは独立した別の lockstep 課題なので、Phase 4 で別 Issue を起票する

---

## ADR-003: メディア孤児・ゴミ箱・期限切れエクスポート のセクションは説明文表示に留める

### Status
Proposed

### Context
spec P46 は「メディア孤児クリーンアップ / ゴミ箱自動パージ等の状態」を表示することを要求している。一方、コードベース上は:
- `purgeOrphans` / `purgeTrashOlderThan` / `purgeExpiredExports` の 3 usecase は cron 駆動を想定
- 実行履歴を永続化する仕組みは存在しない（KV / D1 テーブルなし）
- 直近の実行結果を取得する port も存在しない

選択肢:
1. 実行履歴テーブルを新設して状態を永続化し、画面に表示
2. admin が手動キックできるラッパ usecase を追加し、押下時の即時結果を表示
3. 「cron 駆動・実行履歴非保持」を画面に明示し、追加実装はしない

### Decision
選択肢 3。spec 乖離解消（read-only 監視画面の追加）が本 Issue の意図であり、`JobMonitorProvider` 新設や履歴テーブル新設はスコープ越えと判断する。

### Consequences
- 良い点:
  - スコープがコンパクトになり、テスト範囲・レビュー対象が明確
  - DB スキーマ追加なし
  - 将来「実行履歴テーブル」を導入するときの設計余地を残せる
- トレードオフ:
  - 「状態の表示」が説明文どまりになる（数値・最終実行時刻が出ない）
  - **H4 異常系（自動パージジョブの失敗 → 管理者画面にアラート表示）が本 Issue では満たせない**。履歴永続化を前提とする要件のため、Phase 4 で別 Issue「P46 自動パージジョブの失敗アラート（履歴永続化を伴う）」を起票して残課題として明示する。

---

## ADR-004: ジョブ listing は usecase を新設せず page server component から直接 repository を呼ぶ

### Status
Proposed

### Context
admin 横断 listing を行う際、(a) `listIngestionJobsForAdmin` / `listExportJobsForAdmin` の admin 専用 usecase を新設する案と、(b) page server component で `requireAdminUser` を通した後、`loadXxx` から `unitOfWorkProvider.run` 内で直接 `findRecent` を呼ぶ UsersTable パターンを踏襲する案があった。

### Decision
選択肢 (b)。listing は usecase を新設せず UsersTable パターンに揃える。

### Consequences
- 良い点:
  - 既存規約（`loadAdminUsers` が直接 `userRepository.listAll` を呼ぶパターン）と一致
  - `requireAdminUser` と `assertAdmin` の二重チェックを避けられる（page の admin 防衛線で十分）
  - usecase / DTO の追加コスト削減
- トレードオフ:
  - retry のような副作用のあるミューテーションでは依然として usecase + `assertAdmin` を経由する必要がある（境界の対称性が崩れる）。これは UsersTable パターンでも同様（`updateUserStatusFn` は usecase 経由）であり、既存規約と矛盾しない。

---

## ADR-005: `STATUS_ORDER` を共通テーブルで定義し、ingestion / export 横断で `failed` を先頭にピン留め

### Status
Accepted (implementation)

### Context
P46 G3 の「失敗を素早く検知できる」UI 要件を満たすために `failed` 行をテーブル上部にピン留めしたい。
ingestion と export は status union が一部重なる（`failed` / `pending` / `processing` / `cancelled`）が、
全体としては独立した union 型である。

選択肢:
1. ingestion / export それぞれに `STATUS_ORDER` を分離して定義する
2. 両 union の和集合をキーに持つ単一の `STATUS_ORDER` テーブルを定義し、`sortFailedFirst` を共通化する

### Decision
選択肢 2。`STATUS_ORDER` を ingestion union ∪ export union の和集合で定義し、
`sortFailedFirst<T extends { status: IngestionStatus | ExportStatus }>` で両テーブルに使い回す。

### Consequences
- 良い点:
  - "failed が先頭" というポリシーが一箇所に集約される
  - テーブル 2 種のソート挙動を別々に管理しなくて済む（divergence 防止）
- トレードオフ:
  - status union を片方しか持たない場合でも relevant でない値がキーに含まれるが、`Record` の lookup なので副作用なし

---

## ADR-006: `IngestionJob.retry` で `preview` も `null` にリセットする

### Status
Accepted (implementation)

### Context
plan.md は「`errorCode`/`errorReason`/`preview` を `null` リセット」と記載していた。
ただし `failed` 状態は `preview: IngestionPreview | null` を許容しており、`markFailed`（from `previewing`）
で preview を持ち越すケースがある。retry が `pending → pending` の意図的な再スタートであることを踏まえると、
preview を残すと「pending なのに preview がある」という domain 上は型エラーの形（`PendingIngestionJob.preview: null`）になる。

### Decision
plan に従い `preview` を `null` にリセットする。これにより `PendingIngestionJob` の型契約
（`preview: null`）と整合する。preview を保持したい運用要件があれば別途設計する。

### Consequences
- 良い点:
  - 型契約と一致する。型エラーや `as` キャストを必要としない
  - 再生成は queue consumer 配線後に再走するので、preview は新規に作り直される想定で問題ない
- トレードオフ:
  - 過去の preview が即時に閲覧できなくなる（必要なら別途「failed 時点の preview を読む」UI を作る）

---

## ADR-007: routeTree.gen.ts の手動追記

### Status
Accepted (implementation)

### Context
`/admin/jobs` を追加するため `app/routes/admin/jobs.tsx` を新設したが、
`app/routeTree.gen.ts` は TanStack Start の Vite プラグインによる自動生成ファイルで、
通常は `pnpm dev` / `pnpm build` の起動時に更新される。
CI 環境や手動 typecheck 実行時に生成ステップを挟まないと
`createFileRoute('/admin/jobs')` が `keyof FileRoutesByPath` に含まれず型エラーになる。

### Decision
既存の `/admin/metrics` パターンに完全に追随する形で routeTree.gen.ts を手動編集した。
次回 `pnpm dev` / `pnpm build` 実行時に再生成されても差分はゼロになるよう、
全 9 箇所（import / `Route.update` / 3 つの union 型・FileRoutesByPath エントリ / AdminRouteRouteChildren）
を機械的に同期させた。

### Consequences
- 良い点:
  - typecheck がパスし、CI 即座に検証可能
  - dev/build 再生成時に上書きされても等価
- トレードオフ:
  - 機械生成ファイルを手で触ったため、レビュー時に追記内容を確認する必要がある
