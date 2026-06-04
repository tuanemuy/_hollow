# 動作確認計画 — Issue #482: export usecase の id 入力契約を string に統一する

**Issue:** #482
**作成日:** 2026-06-05

---

## 確認環境

本 Issue は挙動変更を伴わない型レベルのリファクタ。一次の安全網は型検査と既存テストスイート。手動確認は補助的。

### 検証環境の起動

```bash
pnpm db:apply:local   # ローカル D1 にマイグレーション適用（未適用時のみ）
pnpm dev              # vite dev（Cloudflare ランタイム）でローカルサーバー起動
```

シードが必要な場合:

```bash
pnpm seed:dev-admin   # 開発用 admin ユーザーを投入
```

### デプロイ方法

なし（検証環境のみで確認できる。型レベルのリファクタのためステージング/本番反映は不要）。

## 確認項目

### 1. 型検査が通る

- **目的:** presentation から `@/core/domain/export/valueObject` の `ExportJobId` import が消え、4 usecase の入力型が変わっても型が破綻しないこと。
- **手順:**
  1. `pnpm typecheck`
- **期待結果:** エラーなく完了する。
- **確認ポイント:** presentation（`$jobId.tsx`/`Page.tsx`/`loader.ts`/`ExportForm/action.ts`）に domain `ExportJobId` 参照が残っていないこと（`grep -rn "domain/export/valueObject" app/routes app/components` が空）。

### 2. 既存テストが全て green

- **目的:** 入力契約の変更で worker 経由の runExportJob・retry・cancel/download/get の挙動が変わっていないこと。
- **手順:**
  1. `pnpm test`
- **期待結果:** unit + integration が全て PASS。
- **確認ポイント:**
  - `dispatchDomainEvent.test.ts`: `export.job.requested`/`export.job.retryRequested` が `runExportJob` にルーティングされる、空 `exportJobId` で `runExportJob` が呼ばれず warn が 1 回ログされ outcome が handled（worker レベル検証が温存されていること）。
  - `handlers.integration.test.ts`: worker 経由の export 実行。
  - `retryExportJob.integration.test.ts`: 既存パターンが引き続き通ること。

### 3. lint/format

- **手順:**
  1. `pnpm lint:fix && pnpm format`
- **期待結果:** 差分が出ない or 自動整形のみ。

## エッジケース・異常系

### 1. 空 jobId（worker 経路）

- **目的:** 空文字の `exportJobId` ペイロードが worker の `ExportJobId.create()` で弾かれ、runExportJob まで到達しないこと（検証位置を worker に残した設計が機能しているか）。
- **手順:** `dispatchDomainEvent.test.ts` の該当ケースで担保。手動では不要。
- **期待結果:** runExportJob 未呼び出し・warn ログ・outcome handled。

## 既存機能への影響確認（任意の手動確認）

- エクスポートジョブ詳細ページ（`/exports/$jobId`）が従来どおり表示される。
- エクスポートのキャンセル・ダウンロード（`ExportForm`）が従来どおり動作する。
- admin のジョブ retry（既存パターン）に影響がないこと。

## 確認チェックリスト

- [ ] `pnpm typecheck` がエラーなく通る
- [ ] presentation に `domain/export/valueObject` の `ExportJobId` 参照が残っていない
- [ ] `pnpm test`（unit + integration）が全て PASS
- [ ] `dispatchDomainEvent.test.ts` の空 jobId 検証が PASS（worker 検証の温存）
- [ ] `pnpm lint:fix && pnpm format` で不要な差分が出ない
- [ ] （任意）エクスポート詳細ページ表示・cancel/download が従来どおり
