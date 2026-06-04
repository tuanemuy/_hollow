# PR Review #002 — refactor(dto): DTO ブランド型を廃止しプリミティブ string に置き換える

**PR:** #480
**Date:** 2026-06-04
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6（W-001 修正の妥当性 + 全体クリーン結論の再確認）
- Verdict: **APPROVED**

W-001（ラウンド1）はコミット `7b51b0c` で解消。1ラウンドクリーンで完了条件達成。

---

## Round 2 Review

### Blockers
なし

### Warnings
なし

### Notes
- [N-001] W-001 修正は妥当（9 ファイル・+99/−127）。LHS が DTO 由来 string のアンラップだけを素参照化。アサーション強度は不変。テストケース削除・skip 追加なし。
- [N-002] domain 由来キャストの誤削除なし（厳密確認）。`promptOverride.structure/metadata as unknown as string`（domain PromptText）、`findById(... as Parameters<...>)`、`getNoteRevision.integration.test.ts:90/123`（domain NoteId）は全て残存。`:123` は LHS（DTO string）のみ剥がし RHS（domain）維持の正しい非対称処理。
- [N-003] `repairSavedView.test.ts` の `findById` キャスト削除は正しい（`SavedViewRepository` の `TId` はデフォルト `string` のため旧キャストは no-op）。
- [N-004] ラウンド1 のクリーン結論は不変。domain 層差分ゼロ、入力ブリッジ単一 `as` 維持、export presentation の domain ブランドキャスト残存、`.create()` 入力検証無傷。
- [N-005] スコープ外ファイルの残存キャスト（trashLifecycle/saveNote/backfill 等の domain ブランド由来 100+ 件）は main と件数完全一致で regression ではない。本 Issue の対象外。
- [N-006] `pnpm typecheck` green。挙動変更・スコープ逸脱なし。

---

## Design Decisions

特になし。
