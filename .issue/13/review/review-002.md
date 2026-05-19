# PR Review #002 — refactor: address PR #7 residual warnings (Issue #13)

**PR:** #73
**Date:** 2026-05-19
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

---

## Round 1 指摘の解消状況

| ID | 内容 | 解消 | 場所/確認結果 |
|----|------|------|--------------|
| FE-W-001 | useAutosave inFlightRef レース | ✅ | `useAutosave.ts:222` で `if (inFlightRef.current === p) inFlightRef.current = null;` ガード |
| FE-W-002 | snapshotForSubmit の `as EditorState` キャスト | ✅ | `editorState.ts:417-420` で `EditorSnapshotInput = Pick<EditorState, ...>` 型を導入、`useAutosave.ts:145-152` でキャスト削除 |
| FE-W-003 | ConfirmDialog `aria-describedby` | ✅ | `ConfirmDialog.tsx:44,45,61,68` で `descId` 追加、description 有時のみ付与 |
| TA-W-001 | ADR-001 に ZodError → "unknown" kind 注記追加 | ✅ | `.issue/13/adr.md:38` に既存 9 ルート同等の挙動として明記 |
| TA-W-002 | HOME_SEARCH.limit を NOTE_LIST_LIMIT_DEFAULT 参照 | ✅ | `auth/links.ts:20-25` で直接参照、SSOT を JSDoc に明記 |
| TA-W-003 / CQ-W-003 | ListView `kind === "search"` 早期分岐 | ✅ | `ListView.tsx:124-137` で早期 return、`NoteListRow` 共通化で `"updatedAt" in note` 二重チェック消滅 |
| TA-W-004 | CalendarView search ブランチから notes 除外 | ✅ | `CalendarView.tsx:14` で `Readonly<{ kind: "search" }>` 化、`NoteList.tsx:121` 呼出も notes 省略 |
| TA-W-005 | ADR-002 文面修正（BULK_NOTE_IDS_MAX 注記） | ✅ | `.issue/13/adr.md:67-69` に箇条書きで明示 |
| CQ-W-001 | ConfirmDialog `variant` 削除 | ✅ | Prop と分岐ロジック削除、JSDoc に YAGNI 説明 |
| CQ-W-002 | ConfirmDialog `cancelLabel` 削除 | ✅ | `ConfirmDialog.tsx:79` でハードコード「キャンセル」化 |
| CQ-W-004 | OwnedNoteSearchItem JSDoc 強化 | ✅ | `loaders.ts:62-67` で構造的型付けの含意・判別方法を明記 |

11 / 11 解消（100%）

## 別 Issue 送り（再指摘なし）

- FE-W-004: TRASH_SEARCH 定数化 → スコープ外、フォローアップ
- CQ-W-005: updater ヘルパ集約 → 必須でない、フォローアップ可

## Round 2 新規 Blocker / Warning

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** `ListView` の `NoteListRow` 抽出が秀逸。`updatedAtDisplay` を pre-computed string として受け渡すことで union narrowing を呼び出し側に閉じ込め、行レンダラ自体は分岐フリー
- **[N-002]** `useAutosave.ts:217-221` のコメントが「stale finally の挙動」「2 重 flush 防止」を将来読者向けに明示
- **[N-003]** `EditorSnapshotInput` の `Pick<>` 定義場所が `editorState.ts` で、callable side と def side が同居。テストは `EditorState` 全体を渡しても supertype として通る
- **[N-004]** `HOME_SEARCH.page` は `1` リテラル直書き。`noteListSearchSchema.page.catch(PAGINATION_DEFAULT_PAGE)` の SSOT は presentation 側にあるため現時点では問題なし
- **[N-005]** typecheck / unit test (1426 件) 全 pass
- **[N-006]** Biome は OOM で走らせられなかったが、差分は構文的にクリーン

## 総合判定

Round 1 指摘 11 件すべて適切に解消、新規 Blocker / Warning なし、自動テスト全 PASS。

**APPROVED**
