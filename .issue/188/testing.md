# 動作確認計画 — Issue #188: eventRelayWorker のトップレベル `crypto.randomUUID()` で staging/production デプロイが全滅

**Issue:** #188
**作成日:** 2026-05-23

---

## 確認環境

本 Issue の変更は **Cloudflare Workers のビルド・デプロイ経路** のみが対象で、ブラウザ UI への影響はない。

### 検証環境の起動

ブラウザ UI 経由の確認は不要（worker 内部の diagnostic id 生成タイミング変更のみ）。ローカルでの挙動確認が必要な場合のみ:

```bash
pnpm dev
```

### デプロイ方法

ローカルでの静的検証（実 deploy 不要、Cloudflare アカウントなしで完結）:

```bash
pnpm deploy:staging:all:dry
```

実 deploy 確認は本 PR マージ後に GitHub Actions の `Deploy (staging)` ワークフロー実走で行う。

## 確認項目

### 1. テスト・型チェック・lint が通る

- **目的:** リファクタリングで既存テストが壊れていないことを確認
- **手順:**
  1. `pnpm typecheck`
  2. `pnpm lint`
  3. `pnpm test:unit`
- **期待結果:** すべて成功
- **確認ポイント:** `inlineRelayTrigger.test.ts` で `workerId: "inline-dev"` を明示している経路が引き続きパスすること

### 2. ビルド成果物にトップレベル `crypto.randomUUID()` が残っていない

- **目的:** Cloudflare Workers の global-scope validation を通過する形になっていることを静的に検証
- **手順:**
  1. `pnpm deploy:staging:all:dry` を実行（ビルド + dry-run）
  2. `grep -nE '^[[:space:]]*crypto\.randomUUID\(\)' dist/server/index.js dist/relay/index.js dist/consumer/index.js dist/pruner/index.js dist/dlq/index.js dist/indexer/index.js dist/worker/index.js 2>/dev/null` を実行
- **期待結果:** どのビルド成果物にも裸の `crypto.randomUUID()` 文（= モジュールトップレベル呼び出し）が現れない
- **確認ポイント:** ハンドラ内部の呼び出し（`foo = crypto.randomUUID()` のように関数スコープに包まれた行）は許容。トップレベル statement のみ NG

### 3. `claimed_by` が tick 単位の新しい挙動になる

- **目的:** ロジック変更後も `workerId` の流れが outbox レコードまで到達することを確認
- **手順:** `pnpm test:integration` を実行
- **期待結果:** `eventRelayWorker.integration.test.ts` 含む統合テストがすべて通る
- **確認ポイント:** UoW + outbox の往復で `claimed_by` 列が文字列として書かれていることが確認できれば十分（具体値の安定性は仕様外）

## エッジケース・異常系

### 1. `options.workerId` を明示的に渡したケース

- **目的:** デフォルトフォールバックの変更が、外部から `workerId` を渡す経路を壊していないか
- **手順:** `pnpm test:unit` で `inlineRelayTrigger.test.ts` を実行
- **期待結果:** `workerId: "inline-dev"` を明示する経路が引き続き通る

## 既存機能への影響確認

- Outbox relay / queue consumer / pruner / dlq / indexer 各 worker のビルドは独立。dry-run で全部成功すること

## 確認チェックリスト

- [ ] `pnpm typecheck` が成功
- [ ] `pnpm lint` が成功
- [ ] `pnpm test:unit` が成功
- [ ] `pnpm test:integration` が成功
- [ ] `pnpm deploy:staging:all:dry` が成功
- [ ] ビルド成果物に裸のトップレベル `crypto.randomUUID()` が残っていない
- [ ] PR マージ後の `Deploy (staging)` ワークフローが成功（フォローアップ）
