# PR Review #002 — Issue #226 follow-up refactor (Issue #255)

**PR:** #266
**Date:** 2026-05-28
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数
- Verdict: **APPROVED**

---

## Frontend / Components

### Blockers
なし

### Warnings
なし

### Notes
- W-F-001〜W-F-005 すべて round 2 で解消
  - W-F-001 (admin/Jobs leak): Issue #268 起票・ADR-001 に "Scope limitation" 追記
  - W-F-002/003: `useServerFnRouter` を overload 化、未マッチ時 throw で `undefined` 戻り排除
  - W-F-004: ADR-002 で `_test-utils/` 配置の判断を記録
  - W-F-005: `directoryTree.ts` JSDoc から "server-only" の誤記を訂正
- ヘルパー再設計は production `useServerFn` シグネチャと互換。`pnpm typecheck` / `pnpm test:unit` (128 files / 2527 tests) green
- `IngestionJobRow` / `UploadDialog` の `as unknown as string` キャスト削除は副次効果として型安全性向上
- 新規問題の混入なし

### 軽微な観察（指摘レベル未満）
- `directoryTree.ts:11` の英文 JSDoc がやや読みづらい（意味は通る）

---

## Test

### Blockers
なし

### Warnings
なし

### Notes
- W-T-001 解消: overload で `(fn: unknown) => T` に絞り、未マッチは throw、fallback 渡しで明示的に許容
- W-T-002 解消: `serverFnChainStub` JSDoc に対応スコープ（property-access + call chain のみ）と除外ケース（`.bind` / `.call` / `Symbol.iterator` / `then`）を明記
- W-T-003 解消: `useServerFnRouter` JSDoc で `entries[i][0]` の `ref` 意味を明確化
- 3 テストファイル green、識別子ベース dispatch が意図通り動作
- `pnpm typecheck` / `pnpm test:unit` / `pnpm test:integration` すべて pass

---

## Design Decisions

- ADR-001 に "Scope limitation: admin/Jobs 経路は本 PR スコープ外" を追記し、フォローアップ Issue #268 で対応
- ADR-002 を新規追加: `app/components/_test-utils/` 配置の選定理由を記録
