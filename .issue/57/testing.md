# 動作確認計画 — Issue #57: queue consumer から runIngestionJob / runExportJob を呼ぶ配線が未整備

**Issue:** #57
**作成日:** 2026-05-21

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:apply:local   # ローカル D1 にマイグレーションを適用
pnpm dev              # 開発サーバー起動（Vite via Cloudflare workerd, queue consumer は wrangler 経由で同居）
```

ブラウザで起動 URL（vite が出力する URL）を開き、認証済みユーザーでログインしてからファイルアップロード / エクスポート機能を実行する。queue consumer のログは `pnpm dev` の出力に流れる。

### 自動テスト

```bash
pnpm test:unit                # dispatchDomainEvent などの unit test
pnpm test:integration         # handleQueue / IdempotencyStore.hasProcessed の integration test
pnpm typecheck                # ConsumerContainer 型の整合性確認
pnpm lint && pnpm format:check
```

### デプロイ方法

ステージング・本番への反映は本Issueの動作確認では行わない（検証環境で確認可能）。デプロイが必要になった場合は以下を使用:

```bash
pnpm db:apply:staging         # ステージング D1 マイグレーション
pnpm db:apply:production      # 本番 D1 マイグレーション
```

（本 Issue は schema 変更を含まないため D1 マイグレーションは不要だが、デプロイ自体は通常のフローに従う）

## 確認項目

### 1. ingestion ジョブが queue 経由で自動消化される

- **目的:** `ingestion.created` イベントを受信した queue consumer が `runIngestionJob` を起動し、`pending` ジョブが `processing → previewing` または `failed` に遷移することを確認する。
- **手順:**
  1. 認証済みユーザーでログイン
  2. 任意のファイル（例: テキストファイル）をアップロード（`uploadFile` usecase が走る画面 / API を実行）
  3. アップロード完了直後、`/admin/jobs` または該当ジョブの詳細画面で IngestionJob のステータスを確認
  4. 数秒以内にステータスが `pending` から進んでいる（`processing` / `previewing` / `failed` のいずれか）ことを確認
- **期待結果:** ジョブが自動的に進行している（手動操作なしで `pending` から先に進む）
- **確認ポイント:** queue consumer のログに `[queue] received ingestion.created` 相当の行があり、`runIngestionJob` 呼び出しに対応するエラーログが出ていないこと

### 2. ingestion 再試行が queue 経由で実行される

- **目的:** `ingestion.retryRequested` イベントを受信した queue consumer が `runIngestionJob` を再度起動し、`failed` → `pending` → `processing` のフルサイクルが動くことを確認する。
- **手順:**
  1. `failed` 状態の IngestionJob を用意（前項で意図的に失敗させるか、既存の failed ジョブを利用）
  2. `/admin/jobs` から該当ジョブの「再実行」ボタンを押下（または `retryIngestionJob` を呼ぶ画面操作）
  3. ステータスが `failed` から `pending` に切り替わることを確認
  4. 数秒以内にさらに `processing` 以降の状態へ進んでいることを確認
- **期待結果:** 再実行ボタン押下後、自動的に処理が再走する（Issue #57 以前は `pending` のまま塩漬けになっていた）
- **確認ポイント:** queue consumer のログに `ingestion.retryRequested` 受信と dispatch が記録されていること

### 3. export ジョブが queue 経由で自動消化される

- **目的:** `export.job.requested` イベントを受信した queue consumer が `runExportJob` を起動し、`pending` ジョブが `processing` 以降に遷移することを確認する。
- **手順:**
  1. 認証済みユーザーでログイン
  2. エクスポート機能を実行（例: ノートを HTML / Markdown / PDF / Bulk でエクスポート）
  3. エクスポートジョブの一覧（または該当ジョブ詳細）でステータスを確認
  4. 数秒以内にステータスが `pending` から進んでいる（`processing` / `completed` / `failed`）ことを確認
- **期待結果:** ジョブが自動的に進行する
- **確認ポイント:** queue consumer のログに `export.job.requested` 受信と `runExportJob` 呼び出しが記録されていること

### 4. export 再試行が queue 経由で実行される

- **目的:** `export.job.retryRequested` イベントが queue 経由で `runExportJob` を起動することを確認する。
- **手順:**
  1. `failed` 状態の ExportJob を用意
  2. `/admin/jobs` から該当ジョブの「再実行」を押下
  3. ステータスが `failed` → `pending` → `processing` と遷移することを確認
- **期待結果:** 再実行が自動的に走り、`pending` で止まらない
- **確認ポイント:** queue consumer のログに `export.job.retryRequested` 受信と dispatch が記録されていること

### 5. 非 dispatch イベントは従来通り stamp + ack のみで終わる

- **目的:** `note.trashed` / `publication.changed` などの dispatch 対象外イベントが、配線変更後も従来通り stamp + ack のみで処理されることを回帰確認する。
- **手順:**
  1. ノートをゴミ箱に入れる操作を実行（`note.trashed` イベントが発火する）
  2. queue consumer のログを確認
- **期待結果:** `processed_events` に stamp が入っているだけで、ingestion / export usecase が呼ばれていない
- **確認ポイント:** ログに `runIngestionJob` / `runExportJob` 呼び出しが**ない**こと

## エッジケース・異常系

### 1. 既処理イベントの redelivery 時に dispatch が再走しない

- **目的:** `IdempotencyStore.hasProcessed` による dedup が正しく機能し、同一 event ID の redelivery で usecase が二重実行されないことを確認する。
- **手順:**
  1. 任意の `ingestion.created` イベントを処理させ、ジョブが `processing` 以降まで進んだことを確認
  2. 同一 event ID で意図的に再配信を発生させる（手動操作が難しい場合は integration test での担保で代替）
- **期待結果:** 2 回目の配信は `hasProcessed=true` で早期 ack され、`runIngestionJob` が呼ばれない
- **確認ポイント:** ログに `[queue] skipping redelivery` が記録されること

### 2. ジョブが既に消えている場合（NotFoundError）の挙動

- **目的:** dispatch 対象のジョブ行が削除済みの場合、`NotFoundError` が `handled` 扱いになり queue 上は完了することを確認する。
- **手順:**
  1. IngestionJob を作成し、`ingestion.created` イベントが outbox に積まれた状態で、ジョブ行を直接 DB から削除（テスト環境向けの手動操作）
  2. queue consumer が当該イベントを処理した際の挙動を確認
- **期待結果:** `message.retry()` ではなく `message.ack()` で処理が終了する。queue が retry でループしない
- **確認ポイント:** `processed_events` に stamp が残ること、ログに `INGESTION_JOB_NOT_FOUND` 等のエラーが記録されつつも ack されていること

### 3. dispatch 中の throw（LLMRateLimitError 含む）で retry path が機能する

- **目的:** `LLMRateLimitError` のような retry 可能エラーが throw されたとき、`message.retry()` 経路に乗り、stamp が**残らない**（次回 redelivery で再 dispatch される）ことを確認する。
- **手順:** integration test で担保する（手動再現は困難）
- **期待結果:** `processed_events` に stamp が入らず、queue が再配信を行う
- **確認ポイント:** integration test の `dispatch retry path` ケースが green

## 既存機能への影響確認

- **既存の `handleQueue` テスト「acks redelivered without re-running」**: stamp が post-dispatch に動いたため、テストの assertion を `hasProcessed` 経由に更新。observable behavior（同一 event ID で usecase が二重実行されない）は維持。
- **既存の queue consumer ログ出力**: `[queue] received` / `[queue] skipping redelivery` のメッセージ形式は維持する。
- **`note.trashed` などの非 dispatch イベント**: 挙動不変（stamp + ack のみ）。

## 確認チェックリスト

- [ ] `pnpm test:unit` が green
- [ ] `pnpm test:integration` が green
- [ ] `pnpm typecheck` が green
- [ ] `pnpm lint && pnpm format:check` が green
- [ ] ingestion ジョブが自動消化される（確認項目 1）
- [ ] ingestion 再試行が動く（確認項目 2）
- [ ] export ジョブが自動消化される（確認項目 3）
- [ ] export 再試行が動く（確認項目 4）
- [ ] 非 dispatch イベントは挙動不変（確認項目 5）
- [ ] redelivery で usecase が二重実行されない（エッジケース 1）
- [ ] NotFoundError 時は ack（エッジケース 2）
- [ ] retry path が機能する（エッジケース 3、integration test で担保）
