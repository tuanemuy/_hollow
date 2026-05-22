# PR Review #002 — feat(issue-158): P11 ノート履歴機能 (NoteRevision)

**PR:** #167
**Date:** 2026-05-23
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 2 (Test 層のみ)
- Verdict: **BLOCKED**（Round 3 が必要）

Round 1 の Warning 14 件中、修正対象 10 件はすべて Domain/Application/Adapter/Frontend で APPROVED。Test 層は W-T-001/002/003/004 の対応は OK だが、新規追加テストに 2 件の新規 Warning が発覚。

---

## Domain (Round 2)

### Blockers
なし。

### Warnings
なし。

### Notes
- W-D-003 (`keepCount` JSDoc) は運用文脈付きで明文化済み
- W-D-001 (Notes 級) は migration コメントに記録済み
- Domain は **APPROVED** 相当

---

## Application (Round 2)

### Blockers
なし。

### Warnings
なし。

### Notes
- W-A-001 (`+1 row` 訂正): 実装と JSDoc が完全に一致
- W-A-002 (defensive コメント): WHY を 3 点で簡潔に明示、CLAUDE.md 規約に沿う
- Application は **APPROVED** 相当

---

## Adapter (Round 2)

### Blockers
なし。

### Warnings
なし。

### Notes
- W-I-002 (`Number.MAX_SAFE_INTEGER` 置換): SQLite LIMIT (64bit signed) で安全範囲内、意図明示
- Adapter は **APPROVED** 相当

---

## Frontend (Round 2)

### Blockers
なし。

### Warnings
なし。

### Notes
- W-F-001 (レイアウト統一): `inline-flex` → `flex` で見た目に崩れなし、`flex-wrap gap-2` が機能
- W-F-002 (search prop 除去): 詳細ルートは `validateSearch` なし、import 整理含めて完了
- 「履歴一覧に戻る」 Link が `NOTE_HISTORY_SEARCH` 維持しているのは正当
- Frontend は **APPROVED** 相当

---

## Test (Round 2)

### Blockers
なし。

### Warnings

- **[W-T-005]** Live-lock test が壁時計依存で 2026-05-23T00:10:00Z 以降に失敗する
  - 場所: `app/core/application/note/__tests__/restoreNoteRevision.integration.test.ts:322-330`
  - 理由: `TZ = "2026-05-23T00:00:00.000Z"` 起点で `expiresAt = TZ + 10min` を直接 INSERT。一方 `restoreNoteRevision` は `container.clock.now()`（`SystemClock` = 壁時計）を `EditLock.isLive` に渡す。`expiresAt > now` が崩れた瞬間に `EditLockedByOther` が throw されず `expect.fail()` で必ず失敗する。
  - 提案: 既存 `editLock.integration.test.ts:165-166` パターン同様、`Date.now()` 相対で組み立てる。

- **[W-T-006]** 新規テストファイルが biome の format/organizeImports に違反
  - 場所: `app/core/application/note/__tests__/restoreNoteRevision.integration.test.ts:10-13`
  - 理由: `@/core/application/errors` が `@/core/domain/error` の後ろに配置されている（organize-imports 順序違反）+ 複数行 import 形式
  - 提案: imports 順序を `@/core/application/__tests__/helpers` → `@/core/application/errors` → `@/core/domain/...` に並び替え、単一行に整形

### Notes
- W-T-001 対応: 3 ケース追加が spec/testcases/note の未カバー領域を埋めている
- エラー型分離 (Forbidden / NotFound / BusinessRuleError) が usecase 実装意図と一致
- `oldestRevisionId` helper の再利用、`expect.fail` + `try/catch` パターンが既存ケースと一貫
- report.md は testing.md チェックリスト 18 項目すべてに対応、PASS と AUTO の分離が明示的
- E5 final-state 再撮影の waiver (ADR-009 後の JSX パスが型保証) は妥当
- OCC 衝突ケースは transitive guarantee (`Note.updateContent` 既存テスト) で明示済み

---

## Design Decisions

Round 2 で新規の ADR 級判断はなし。Round 1 の修正が網羅的に取り込まれていることを 4 視点で確認。

---

## Round 3 への申し送り

- W-T-005: timestamp を Date.now() 相対に修正済み (commit time fixup)
- W-T-006: imports 順序を修正済み、`pnpm exec biome check --write` PASS 確認済み
- 修正範囲は test ファイル 1 箇所のみ。他レイヤーへの波及なし、Round 3 は Test 視点のみで終了見込み
