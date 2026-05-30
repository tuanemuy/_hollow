# 動作確認計画 — Issue #109: queue consumer の processing 中断ジョブが自動再走できない（LLMRateLimitError 後の塩漬け）

**Issue:** #109
**作成日:** 2026-05-30

---

## 確認環境

本 Issue の変更は queue consumer / domain 状態機械の内部挙動であり、ブラウザから直接トリガーできる UI 動線が無い（`LLMRateLimitError` での pipeline 中断 → redelivery 自動再走は、LLM provider の rate limit と queue redelivery が揃って初めて起きる経路で、画面操作からは再現できない）。したがって検証の主体は自動テスト（domain unit test + worker integration test）になる。

### 検証環境の起動

自動テストで検証する。

```bash
pnpm typecheck          # 型整合（domain 遷移追加・usecase catch 変更）
pnpm test:unit          # domain unit test / property test（rollbackToPending）
pnpm test:integration   # handlers.integration.test.ts（自動再走の E2E 証明）
```

`pnpm test` で unit → integration を一括実行できる。

### デプロイ方法

なし（自動テストで確認できる。ステージング反映が必要な場合は別途 `pnpm deploy:staging:consumer` だが、本 Issue の確認には不要）。

## 確認項目

### 1. domain: `rollbackToPending` 遷移

- **目的:** `processing → pending` への巻き戻しが正しく動き、再走に必要なフィールドを保持することを確認する。
- **手順:**
  1. `pnpm test:unit` を実行する。
  2. `app/core/domain/ingestion/__tests__/entity.test.ts` の `rollbackToPending` ケースが PASS することを確認する。
- **期待結果:** `processing → pending` で version+1、`preview`/`errorCode`/`errorReason`/`savedAsNoteId` が null、`tempStorageKey`/`regenerationCount` が保持され、`eventDrafts` が空。非 `processing` 状態からの呼び出しは `BusinessRuleError(InvalidStateForRollback)`。
- **確認ポイント:** `tempStorageKey` が null 化していないこと（再走に必須）。property test の往復不変条件（`startProcessing → rollbackToPending → startProcessing` で version が +1, +1, +1 と単調増加）。

### 2. worker integration: LLMRateLimitError 後の自動再走（最重要）

- **目的:** `LLMRateLimitError` で中断したジョブが redelivery で自動的に再走し、`previewing` に到達することを E2E で確認する。
- **手順:**
  1. `pnpm test:integration` を実行する。
  2. `app/worker/cloudflare/__tests__/handlers.integration.test.ts` の「LLMRateLimitError 後の自動再走（Issue #109）」テスト（旧「既知の限界 regression guard」を反転更新したもの）が PASS することを確認する。
- **期待結果:**
  - 1回目配信: `suggestMetadata` に注入した `LLMRateLimitError` で retry outcome、idempotency stamp なし、ジョブ status は **`pending`**（rollback の証明）。
  - redelivery: 再 dispatch で `isPending` を通過し LLM が再度呼ばれ、2回目（rate limit 解除）で最終 status が **`previewing`** に到達し stamp + ack される。
- **確認ポイント:** 1回目後の status が `processing` ではなく `pending` であること。redelivery で `suggestMetadata` が再度呼ばれていること（自動再走の核心）。

## エッジケース・異常系

### 1. 並行遷移時の rollback skip

- **目的:** rollback 時に既にジョブが `processing` でない（discard/markFailed 済み）場合、rollback を skip して無限 retry にならないことを確認する。
- **手順:**
  1. domain/usecase unit test の該当ケース（rollback の `isProcessing` 再確認で skip）が PASS することを確認する。
- **期待結果:** rollback skip 時は元の `LLMRateLimitError` を rethrow するが、次回 redelivery は入口 `isPending` ガードで no-op に縮退し `handled` outcome で stamp・drain される（`retry` ループにならない）。

## 既存機能への影響確認

- **既存の dispatch / stamp 順序（#57 ADR-003）:** 変更しない。`pnpm test:integration` で `handlers.integration.test.ts` の他ケース（正常 dispatch / handled・skipped・retry の分類）が全て PASS することを確認する。
- **`runExportJob`:** 変更しない。export 系の integration / unit test が PASS することを確認する。
- **admin retry / regenerate path:** `rollbackToPending` は既存遷移に追加するのみ。`retry`/`regenerate` の既存テストが PASS することを確認する。

## 確認チェックリスト

- [ ] `pnpm typecheck` が通る
- [ ] `pnpm test:unit` で `rollbackToPending` の domain/property test が PASS
- [ ] `pnpm test:integration` で「LLMRateLimitError 後の自動再走」テストが PASS（1回目 `pending` → redelivery で `previewing` 到達）
- [ ] 既存の dispatch / stamp / export / retry / regenerate テストが全て PASS（リグレッションなし）
- [ ] `pnpm lint:fix && pnpm format` 後に差分が安定
