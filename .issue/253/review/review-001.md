# PR Review #001 — feat(issue/253): regenerateIngestionPreview の LLM 再駆動を復活させる

**PR:** #318
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 多数（良い点）
- Verdict: **BLOCKED**（Warning を解消するまで）

レビューレイヤー: Domain / Application / Frontend / Test（中〜大規模のため4レイヤー並列）

---

## Domain層

### Blockers
なし

### Notes
- 戻り型 `PendingIngestionJob` 変更は型安全。判別共用体の全フィールド（status/preview/errorCode/errorReason/savedAsNoteId/regenerationCount/version/updatedAt）を正しく設定。
- illegal state を型で排除する設計を破壊していない。`previewing→pending` は既存 `pending` 状態（create/retry 到達先）への新経路追加のみで遷移グラフに矛盾なし。
- `regenerationCount` インクリメント・上限ガード（MAX=5）・`ingestion.regenerated` event draft 維持。cap バイパスなし。
- WHY コメント（なぜ pending か）が ADR 参照付きで明記され CLAUDE.md 方針に合致。

## Application層

### Blockers
なし

### Notes
- `ingestion.regenerated` の case fall-through は retry と完全同型で安全。`{ jobId }` cast → VO 構築 → `runIngestionJob`。
- payload の `regenerationCount` を dispatch が無視し `jobId` のみ使うのは正しい（真実源は DB の最新 entity）。
- ADR-004（#57）を覆した記録・JSDoc が実装と一致。skip 例示を `ingestion.previewAttached` に差し替え済み。
- at-least-once 冪等性（再配信は `isPending` で no-op）・OCC は retry と同パターン、新リスクなし。
- 既存 dispatch ルーティング（export/note/view 等）への破壊なし。

## Frontend層

### Blockers
なし

### Warnings
- **[W-F1]** `IngestionJobRow.onRegenerate`（既存コード）は入口の二重押下ガード `if (isPending) return;` が無く、`setError(null)` を成功後に置いており、`IngestionPreviewForm.onRegenerate`（入口ガード + 冒頭 setError(null)）と不揃い。
  - 場所: `app/components/ingestion/IngestionJobRow.tsx:125-135`
  - 理由: 同一操作の2実装でエラークリアのタイミングと二重押下抑止の堅牢性が揃っていない。`disabled={isPending}` で実害は小さいが一貫性に欠ける。
  - 提案: `IngestionPreviewForm` と同形に揃える（入口ガード + 冒頭 setError(null)）。→ **本ラウンドで修正**
- **[W-F2]** 再生成後の `waiting` ポーリングで fatal error（notFound/business）が起きると `select` view（最初のドロップゾーン）へ戻り、編集対象を見失う UX になり得る。
  - 場所: `app/components/ingestion/UploadDialog.tsx:240-243`
  - 理由: 初回アップロードでは妥当だが、再生成は「既存ジョブ編集中」コンテキスト。ただしジョブはキューに永続化されており消失しない。fatal 自体が稀。
  - 提案: 必須ではない（レビュアーも「許容範囲」と明記）。出し分けは waiting view machine 全体に波及するため本 PR では見送り、progress.md に記録。→ **見送り（progress.md 記録）**

### Notes
- `onRegenerate` は計画ステップ4 / レビュー履歴 S-102 を正確に満たす（入口ガード + setError(null) + useTransition + try/catch + 成功時 routerInvalidate → onRegenerated）。全ボタン `disabled={isPending}`。
- `onRegenerated(jobId)` → `waiting` 再遷移の配線は型・フィールドとも正しく ADR-003 のモーダル内完結が成立。`useCallback` でメモ化。
- React 19 / TanStack Start 規約準拠（useServerFn、server function は middleware + validateInput）。
- アクセシビリティ良好（アイコン aria-hidden、可視ラベル「再生成」、role=alert/status）。styling 規約準拠（PILL_BTN 流用、ハンドコード CSS なし）。

## Test層

### Blockers
なし

### Warnings
- **[W-T1]** `UploadDialog` の `onRegenerated → waiting` 再遷移にテストが無い。
  - 場所: `app/components/ingestion/__tests__/UploadDialog.test.tsx`（変更なし）
  - 理由: 本 PR の UI 振る舞いの核心（再生成押下 → `editing` から `waiting` 再遷移 → ポーリングで `editing` 復帰）が view machine レベルで未テスト。ADR-003 自体が「`UploadDialog.test.tsx` に regenerate → waiting の新ケース追加が要る」と明記しているのに未追加。手動テスト TC-1 で代替されているが回帰ガードが欠落。
  - 提案: `UploadDialog.test.tsx` に「`editing` で再生成 → `waiting` に戻りポーリング再開」ケースを追加（既存ポーリング検証パターンを再利用）。→ **本ラウンドで修正**

### Notes
- dispatch regression guard の反転（skip→route）は正しく `ingestion.regenerated → runIngestionJob` を検証。skip 代表例を実在の `ingestion.previewAttached` に差し替え。
- integration テストの `processing→pending` 更新・テスト名同期は妥当（usecase 単体は dispatch 非経由）。
- entity/property の3段 walk（regenerate→startProcessing→attachPreview）は型安全かつ検証意図（count 単調増加・cap 到達）を保持。
- `IngestionPreviewForm.test.tsx` の再生成ボタン新規テストは適切な範囲（存在・クリック・onRegenerated 発火・commit/discard 非呼出）。

---

## Design Decisions

特になし（ADR-001〜005 は計画・実装時に記録済み）。

## 対応方針

- **W-T1（修正）**: `UploadDialog.test.tsx` に regenerate → waiting 再遷移ケースを追加。
- **W-F1（修正）**: `IngestionJobRow.onRegenerate` を `IngestionPreviewForm` と同形に揃える。
- **W-F2（見送り）**: waiting view machine 全体に波及し Issue 意図外のため本 PR では見送り、progress.md に記録。
