# 動作確認計画 — Issue #3: P46 管理者ジョブ監視画面の実装

**Issue:** #3
**作成日:** 2026-05-18

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:apply:local   # ローカル D1 にマイグレーション（idx_ij_updated_at / idx_export_jobs_updated_at）を適用
pnpm dev              # 開発サーバー起動（Vite via Cloudflare workerd）
```

ブラウザで起動 URL（既定 `http://localhost:3000` 付近、vite が出力する URL）を開き、admin 権限のユーザーでサインインしたうえで `/admin/jobs` にアクセスして確認する。

### デプロイ方法

ステージング・本番への反映は本Issueの動作確認では行わない（検証環境で確認可能）。デプロイが必要になった場合は以下を使用:

```bash
pnpm deploy:staging               # ステージング環境への反映
pnpm db:apply:staging             # ステージング D1 へマイグレーション適用
```

## 確認項目

### 1. /admin/jobs ナビと初期表示

- **目的:** ナビゲーションに「ジョブ監視」が追加され、`/admin/jobs` ページが描画されることを確認。
- **手順:**
  1. admin ユーザーで `/admin` を開く。
  2. ナビに「ジョブ監視」が表示されていることを確認。
  3. クリックして `/admin/jobs` に遷移する。
- **期待結果:**
  - ページが 200 で描画される。
  - 「取り込みジョブ」「エクスポートジョブ」「メディア孤児クリーンアップ」「ゴミ箱自動パージ」「期限切れエクスポート artifact」のセクションが見える。
  - 後者 3 セクションは「cron で自動実行・実行履歴は保持していません」相当の説明文が表示される。
- **確認ポイント:** 既存の admin ページと同じ `admin-shell` / `admin-section` のスタイルが当たっていること。

### 2. 取り込みジョブ一覧の表示

- **目的:** 全ユーザー横断で ingestion ジョブが新しい順に表示され、failed が先頭に来ることを確認。
- **手順:**
  1. 異なる 2 ユーザーで、それぞれ ingestion ジョブを 1 件以上作成（任意の手段、例えば bulk upload）。少なくとも 1 件は failed 状態にする（temp storage error などを発生させるか、シードで直接 failed を作る）。
  2. `/admin/jobs` を再読込。
- **期待結果:**
  - 取り込みジョブテーブルに両ユーザーのジョブが混在して表示される。
  - failed 行が先頭に表示される。
- **確認ポイント:**
  - 行に `jobId` / `ownerId` / `status` / `errorCode` / `updatedAt` が表示される。
  - 行数が 50 件以内に収まっている（limit 50 のクランプ）。

### 3. エクスポートジョブ一覧の表示

- **目的:** 全ユーザー横断で export ジョブが新しい順に表示され、failed が先頭に来ることを確認。
- **手順:**
  1. 異なる 2 ユーザーで export ジョブを 1 件以上作成（少なくとも 1 件は failed）。
  2. `/admin/jobs` を再読込。
- **期待結果:** 確認項目 2 と同様、export テーブル側で確認。
- **確認ポイント:** export 特有のフィールド（`format`, `scope` 等）が読み取れる。

### 4. 失敗 ingestion ジョブの再実行

- **目的:** 失敗ジョブの再実行ボタンで `pending` に戻ること、Outbox に retryRequested イベントが乗ることを確認。
- **手順:**
  1. failed 状態の ingestion ジョブを 1 件用意。
  2. `/admin/jobs` の取り込みジョブテーブルで該当行の「再実行」ボタンをクリック。
- **期待結果:**
  - ボタン押下時に `useTransition` で disabled になる。
  - 「再実行を受け付けました」相当のフィードバックが表示される。
  - 一覧が再読込され、当該ジョブの状態が `pending` に変わり failed セクションから消える。
- **確認ポイント:**
  - DB（`wrangler d1 execute tanstack-start-template-d1 --local --command "SELECT * FROM outbox_events ORDER BY id DESC LIMIT 10;"`）で `ingestion.retryRequested` イベントが追加されていること。

### 5. 失敗 export ジョブの再実行

- **目的:** 確認項目 4 の export 版。
- **手順:** failed の export ジョブで「再実行」ボタンをクリック。
- **期待結果:** 確認項目 4 と同様、`export.job.retryRequested` イベントが Outbox に乗る。
- **確認ポイント:** retry 後の `progress` / `completedAt` / `failedNoteIds` がリセットされていること。

### 6. 非 admin ユーザーのアクセス拒否

- **目的:** 一般ユーザーで `/admin/jobs` が拒否されることを確認。
- **手順:**
  1. 一般ユーザーでサインイン。
  2. `/admin/jobs` にアクセス。
- **期待結果:** admin レイアウトの「アクセスできません」エラー画面が表示される（既存の `errorComponent` 経路）。
- **確認ポイント:** 既存の `/admin/users` 等と同じ 403 経路で扱われる。

### 7. 既存 admin ページの非破壊

- **目的:** 本変更で他の admin ページが壊れていないことを確認。
- **手順:**
  1. `/admin`, `/admin/llm`, `/admin/prompts`, `/admin/design`, `/admin/registration`, `/admin/users`, `/admin/metrics` を順に開く。
- **期待結果:** すべて従来通り表示される。
- **確認ポイント:** ナビの並び順が想定通り（`/admin/metrics` の直後に `/admin/jobs`）。

## エッジケース・異常系

### 1. failed 以外への再実行押下

- **目的:** UI 上は失敗行にしかボタンが出ないが、ボタンが出ない状態のジョブで誤ってサーバ fn を叩いた場合の挙動。
- **手順:** DevTools で `pending` ジョブの id に対し `retryIngestionJobFn` を直接叩く（任意、リスクテスト）。
- **期待結果:** `BusinessRuleError('INGESTION_INVALID_STATE_FOR_RETRY')` 相当が `displayError` で可読な日本語に変換されて表示される。

### 2. 同時 retry（OCC 衝突）

- **目的:** 複数 admin が同時に同じ failed job を retry した場合、片方が ConflictError になることを確認（オプション）。
- **手順:** 2 タブで同じ failed job の再実行ボタンをほぼ同時に押下。
- **期待結果:** 片方が成功（pending に戻る）、もう片方は `ConflictError` 相当のメッセージが表示される。最終的な状態は `pending` で確定。

### 3. tempStorageKey が null の failed ingestion

- **目的:** 物理 blob が消えている前提のジョブで再実行を拒否することを確認。
- **手順:** シードで `status='failed'` かつ `temp_storage_key IS NULL` のジョブを 1 件作る。`/admin/jobs` で再実行を押下。
- **期待結果:** `BusinessRuleError('INGESTION_NO_TEMP_STORAGE_FOR_RETRY')` が `displayError` で表示される。

## 既存機能への影響確認

- `/admin/metrics`（利用状況メトリクス）— 本 Issue の変更で壊れない（同一レイアウトを再利用）。
- `/admin/users` の「ユーザー停止 / 復帰」操作 — admin 認可ヘルパー (`assertAdmin`) を共有しているので動作確認。
- `ingestion_jobs` / `export_jobs` テーブルへの read アクセス — 新 index 追加は既存 query を壊さない（index 追加のみで列追加なし）。

## 確認チェックリスト

- [ ] `/admin/jobs` ナビが表示され、遷移できる
- [ ] 取り込みジョブが全ユーザー横断・failed 先頭で表示される
- [ ] エクスポートジョブが全ユーザー横断・failed 先頭で表示される
- [ ] クリーンアップ 3 セクションが説明文で表示される
- [ ] 失敗 ingestion の再実行で `pending` に戻り Outbox にイベントが乗る
- [ ] 失敗 export の再実行で `pending` に戻り Outbox にイベントが乗る
- [ ] 非 admin で 403 エラー画面
- [ ] 既存 admin ページが従来通り動く
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` がパス
- [ ] `pnpm test:unit && pnpm test:integration` がパス
