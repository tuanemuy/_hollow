# 動作確認計画 — Issue #162: PurgeOrphans R2 削除失敗時の再試行強化

**Issue:** #162
**作成日:** 2026-05-30

---

## 確認環境

本 Issue は cron 起動の媒体パージ sweep（`app/core/application/media/purgeOrphans.ts`、`app/worker/cloudflare/pruner.ts`）のロジック変更で、ブラウザ操作を伴う UI 変更はない。確認は自動テスト（ユニット + 統合）で行う。

### 検証環境の起動
ブラウザ検証は不要（Web UI 変更なし）。下記の自動テストで挙動を確認する。

```bash
pnpm test:unit          # vitest run（ドメインサービスのリネーム/猶予判定）
pnpm test:integration   # vitest run --config vitest.config.integration.ts（purgeOrphans の再試行・冪等・猶予）
pnpm typecheck          # tsgo（port リネームの追従漏れ検出）
```

### デプロイ方法
なし（検証環境＝自動テストで確認できる）。ステージング pruner への反映が必要になった場合のみ `pnpm deploy:staging:pruner`（本 Issue の確認には不要）。

## 確認項目

### 1. orphan の通常パージ（リグレッション）

- **目的:** 既存挙動が壊れていないこと。
- **手順:**
  1. `pnpm test:integration` を実行。
- **期待結果:** 「24h 以上前の orphan を deleting に遷移し R2 + DB delete で purge 完了」テストが PASS（`purged=1, failed=0`、行が消える）。
- **確認ポイント:** orphan→deleting→purge の通常フローが維持されている。

### 2. 猶予期間内の skip（リグレッション）

- **目的:** 猶予期間内の orphan / deleting は拾わないこと。
- **手順:**
  1. `pnpm test:integration` を実行。
- **期待結果:** 「猶予期間未経過の orphan は skip」「猶予期間内の deleting は skip」テストが PASS（`purged=0, failed=0`、行が残る）。

### 3. R2 削除失敗 → deleting で残存（同一 sweep 内）

- **目的:** 失敗が `failed` に計上され、行が `deleting` で残ること。
- **手順:**
  1. `pnpm test:integration` を実行。
- **期待結果:** `ThrowingObjectStorage` を使うテストで `purged=0, failed=1`、行は `status='deleting'` で残存。

### 4. deleting 行の再試行（本 Issue の主目的）

- **目的:** stuck した `deleting` 行が、猶予期間経過後の次の sweep で再試行され、R2 復旧後に purge 完了すること。
- **手順:**
  1. `pnpm test:integration` を実行。
- **期待結果:**
  - 「猶予期間を過ぎた deleting 行は再試行され purge 完了」テストが PASS。
  - エンドツーエンドの「1 回目 sweep で R2 失敗 → deleting 残存 → クロック進めた 2 回目 sweep で purge 完了」テストが PASS（`purged=1`、行が消える）。

## エッジケース・異常系

### 1. 再試行時の冪等性

- **目的:** resume パスで R2/DB delete が冪等に振る舞うこと（並行 tick 二重処理の許容）。
- **手順:**
  1. deleting 行の再 purge を統合テストで確認する。
- **期待結果:** 二重実行してもデータ破損しない。冪等性の根拠は (a) R2 アダプターの `bucket.delete` が存在しないキーでも成功する（`MediaService.purge` 自体は NotFound を伝播するが、R2 が NotFound を投げない）こと、(b) 並行 tick が同一行を拾っても先行 tick が DB 行を消した後は 1st UoW の `findById` が null を返し purge に進まないこと、の 2 点。

## 既存機能への影響確認

- `findOrphansOlderThan` → `findPurgeableOlderThan` のリネームに伴う参照漏れがないこと（`pnpm typecheck` で担保）。影響箇所: port / D1 アダプター / ドメインサービス / `runExportJob.ts` のインラインスタブ / 各テスト。
- export ユースケース（`runExportJob`）はメディアの purge を呼ばないスタブなので挙動不変。

## 確認チェックリスト

- [ ] `pnpm typecheck` がパス（リネーム追従漏れなし）
- [ ] `pnpm lint` がパス
- [ ] orphan 通常パージ・猶予 skip のリグレッションテスト PASS
- [ ] R2 失敗 → deleting 残存テスト PASS
- [ ] deleting 行再試行テスト（猶予経過後）PASS
- [ ] エンドツーエンド再試行テスト PASS
- [ ] `spec/testcases/media/index.md` の PurgeOrphans「R2 削除失敗」行が新挙動に更新済み
