# PR Review #001 — feat(public): P30 ユーザー公開ページをデザインモックに一致させる

**PR:** #653
**Date:** 2026-06-12
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 14
- Notes: 38
- Verdict: **BLOCKED**（Warning 修正のため再レビューへ。Blocker は 0）

## レイヤー別ファイル

- Use Case / Domain: review-001-usecase-domain.md（B: 0 / W: 3）
- Adapter / Infrastructure: review-001-adapter-infra.md（B: 0 / W: 1）
- Frontend: review-001-frontend.md（B: 0 / W: 5）
- Test: review-002-test.md（B: 0 / W: 5）※ファイル名は連番ズレ（reviewer が 002 を採番）。内容は Round 1 のもの。

## 指摘一覧（Warning）

### Use Case / Domain
- [W-001] `NoteOwnerFilters.noteIds` 追加の既存呼び出し回帰をテストで確認 — `app/core/domain/note/ports/noteRepository.ts`
- [W-002] `publishedRange?: DateRange` の型契約（inclusive 正規化は presentation で吸収）を明示 — `listUserPublicNotes.ts`
- [W-003] projection の null フォールバックの意図コメント — `listUserPublicNotes.ts`

### Adapter / Infrastructure
- [W-001] `listSortedWithinCandidates` の published_at 型ナローイング前提の明示 — `publicationStateRepository.ts:323-326`

### Frontend
- [W-001] PROFILE_NAME margin の plan 記述曖昧（実装は正） — `styles.ts`
- [W-002] formatNoteDate.ts 冒頭コメントの UTC/local TZ 記述曖昧 — `formatNoteDate.ts`
- [W-003] `PublicNoteItem.publishedAt: null` 契約の根拠未明示 — `PublicNoteViews.tsx`
- [W-004] `formatRelativeDate()` の Date 引数 TZ 契約が implicit — `formatNoteDate.ts`
- [W-005] `groupNotesByDay` 第3引数デフォルト（なぜ updatedAt か）の JSDoc — `listSelectors.ts`

### Test
- [W-001] `formatRelativeDate` の「昨日」判定が runner TZ 依存 → now を明示して決定化 — `formatNoteDate.test.ts`
- [W-002] both-undefined → undefined テストが形式的 — `publicDateRange.test.ts`
- [W-003] noteColumn path の期間後 notes が public かつ published_at non-null である assert 欠落 — `listUserPublicNotes.integration.test.ts`
- [W-004] period patch の不正日付 rejection 方針コメント — `PublicTopControls.test.tsx`
- [W-005] `groupNotesByDay` デフォルト（updatedAt）後方互換の明示テスト追加 — `listSelectors.test.ts`

## 仕分け

全 Warning を「このPRで直す」に仕分け（すべて変更ファイル内・低コスト・建設的）。コメント追加は CLAUDE.md 規約（非自明な WHY のみ・自明な言い換えはしない）に沿って取捨選択する。
