# PR Review #001 — refactor: address PR #7 residual warnings (Issue #13)

**PR:** #73
**Date:** 2026-05-19
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 14（同一テーマで重複している指摘あり）
- Notes: 20
- Verdict: **BLOCKED (Warning解消が必要)**

---

## Frontend

### Blockers
なし

### Warnings

- **[FE-W-001]** `useAutosave` の `inFlightRef.current = null` レースコンディション懸念
  - 場所: `app/components/note/editor/useAutosave.ts:216-223`
  - 理由: effect cleanup 後に古い `.finally` が走ると、新しい effect の `inFlightRef.current = p2` を上書きする可能性
  - 提案: `if (inFlightRef.current === p) inFlightRef.current = null;` で自分が立てた promise の時だけ null にする

- **[FE-W-002]** `useMemo` の入力に `as EditorState` キャスト
  - 場所: `app/components/note/editor/useAutosave.ts:144-153`
  - 理由: 5 フィールドしか持たないオブジェクトを `as EditorState` 強制。将来 `snapshotForSubmit` が他フィールドを参照すると silent に壊れる
  - 提案: `snapshotForSubmit` の引数型を `Pick<EditorState, "title" | "contentHtml" | "frontMatter" | "tagInput" | "directoryId">` に絞る

- **[FE-W-003]** `ConfirmDialog` が `aria-describedby` を持たない
  - 場所: `app/components/common/ConfirmDialog.tsx:61-73`
  - 理由: WAI-ARIA `alertdialog` は `aria-labelledby` と `aria-describedby` の両方が推奨
  - 提案: `useId()` で `descId` 生成、`description !== undefined` のとき付与

- **[FE-W-004]** `/trash` リンクで `{ page: 1, limit: 20 }` リテラルが残存
  - 場所: `app/components/layout/Sidebar.tsx:106`, `app/components/note/detail/NoteActions.tsx:90`
  - 理由: ADR-001 の「集約による単一更新点」と同じ動機で `TRASH_SEARCH` 定数化が望ましい
  - 提案: スコープ外、別 Issue で OK（HOME_SEARCH と同じパターン）

### Notes

- 全体的に discriminated union の narrowing が型レベルで保たれている良い設計
- `HOME_SEARCH satisfies Pick<>` でスキーマ整合性を担保
- `abortableSleep` の AbortError 握りつぶしと cleanup は正しい
- ConfirmDialog の `variant=danger` 切替は既存 dialog の作法と整合

---

## Type & Architecture

### Blockers
なし

### Warnings

- **[TA-W-001]** `validateSearch` 統一による `ZodError` の serialize 経路が `kind: "unknown"` フォールバック
  - 場所: `app/routes/index.tsx:132` および他全 `validateSearch` 採用ルート
  - 理由: `validateInput` 経由なら `kind: "validation"` + fieldErrors だが、`schema.parse(search)` の素 `ZodError` は `CodedError` を継承していないため `unknown` kind になる
  - 提案: ADR-001 Consequences に「ZodError は `unknown` kind にフォールバック」を明記、または `validateSearch` 用の Zod→SerializedValidationError 変換ユーティリティを追加（既存 `validateInput` のロジック流用可）

- **[TA-W-002]** `HOME_SEARCH.limit` と `noteListSearchSchema.limit` のデフォルトが独立した別定数
  - 場所: `app/components/auth/links.ts:21-24`, `app/components/note/schema.ts:85`, `app/core/presentation/pagination.ts:7`
  - 理由: `HOME_SEARCH = { limit: PAGINATION_DEFAULT_LIMIT }` だが `noteListSearchSchema.limit` のデフォルトは `NOTE_LIST_LIMIT_DEFAULT`。値が偶然一致しているだけで型担保 (satisfies) ではランタイム値の整合は保証されない
  - 提案: `HOME_SEARCH` を schema 側の定数 (`NOTE_LIST_LIMIT_DEFAULT`) に揃える、または `noteListSearchSchema.parse({})` から派生させる

- **[TA-W-003]** `ListView` の search 経路 narrowing が `"updatedAt" in note` ランタイムチェック頼み
  - 場所: `app/components/note/list/ListView.tsx:56-57`
  - 理由: `props.notes.map((note) => ...)` 内で `note` が union のまま narrow されず、`isFilter && "updatedAt" in note` の二重チェックに
  - 提案: `if (props.kind === "search") { return <ul>...search render...</ul>; }` 早期分岐に揃え、CalendarView と同じ構造に

- **[TA-W-004]** `CalendarView` search ブランチの `notes: readonly never[]` が不自然
  - 場所: `app/components/note/list/CalendarView.tsx:14-17`
  - 理由: 呼び出し側で `<CalendarView notes={[]} kind="search" />` と空配列強制になる
  - 提案: `Props = ... | Readonly<{ kind: "search" }>` で notes を search ブランチから除外

- **[TA-W-005]** ADR-002 の文面が「cross-domain import は発生しない」と誤導
  - 場所: `.issue/13/adr.md:66`, `app/components/publication/schema.ts:2`
  - 理由: `BULK_NOTE_IDS_MAX` は `@/components/note/constants` から import されており、ADR の文面と実態が一致していない
  - 提案: ADR-002 のメモを「`visibilitySchema` は再 import 不要。`BULK_NOTE_IDS_MAX` のみ note/constants から import するが、これはドメイン概念ではなくフロントエンド共有定数のため許容範囲」に修正

### Notes

- presentation 層への閉じ込めが完了（domain/usecase/dto には漏出 0 件）
- validateSearch 規約統一は全 10 ルートで揃った
- bulkVisibilitySchema 移動とテスト追従が完璧
- TrashList の `kind !== "filter"` throw は適切な防衛

---

## Code Quality & Test

### Blockers
なし

### Warnings

- **[CQ-W-001]** `ConfirmDialog` の `variant="default"` ブランチが dead code
  - 場所: `app/components/common/ConfirmDialog.tsx:42-52, 85`
  - 理由: 6 箇所すべてが `variant="danger"` を指定。default 分岐は未使用
  - 提案: variant Prop 削除、または使われるまで Prop 自体を削除（YAGNI）

- **[CQ-W-002]** `cancelLabel` も未利用拡張点
  - 場所: `app/components/common/ConfirmDialog.tsx:19, 41`
  - 理由: 全 6 箇所がデフォルト「キャンセル」のまま
  - 提案: 削除推奨、残すなら JSDoc で i18n 用途明示

- **[CQ-W-003]** `ListView` の kind 分岐複雑（TA-W-003 と同じ）
  - 場所: `app/components/note/list/ListView.tsx:46-57`
  - 提案: `if (props.kind === "search") return ...` 早期分岐

- **[CQ-W-004]** `OwnedNoteSearchItem` が `OwnedNoteCommon` の純粋エイリアス
  - 場所: `app/components/note/loaders.ts:62-67`
  - 理由: フィールド差分ゼロで `OwnedNoteFilterItem` (拡張型) も代入可能、narrowing 困難の遠因
  - 提案: JSDoc 強化で「現状同形のため `kind` 判別必須」と明示、または `OwnedNoteCommon & { readonly _kind?: "search" }` ブランド化（後者は YAGNI）

- **[CQ-W-005]** `prev as Partial<NoteListSearch>` キャストが 7 箇所以上に散在
  - 場所: `app/components/note/list/FilterBar.tsx:65,77,89,102,114`, `NoteListToolbar.tsx:35,50`, `DisplayModeSwitch.tsx:30-31`
  - 理由: WHY コメントはあるが類似コードが散らばっている
  - 提案: 必須ではない。`HOME_SEARCH` と同じ場所に updater ヘルパを置けば追従漏れを 1 箇所で防げる（フォローアップ Issue でも OK）

### Notes

- abortableSleep の握りつぶしポリシーが正しい
- publication テスト 4 ケースが note からの 1:1 移植で完璧
- runDelete/runTrash/runDiscard/runPurge の命名が一貫
- HOME_SEARCH satisfies で型担保
- TODO/FIXME 新規追加ゼロ

---

## Design Decisions

このラウンドで見つかった重要な設計判断:

- **TA-W-001 (ZodError 経路)**: ADR-001 で「`ZodError` 一本化」と書いたが、実際は `unknown` kind にフォールバックする。これは既存の他 9 ルートも同じ挙動なので、本 Issue 起因ではなく既存規約に倣う形。ADR-001 に注記を追加する形で対応する。
- **TA-W-002 (HOME_SEARCH 値整合)**: `satisfies` での型担保はランタイム値整合を保証しない。`noteListSearchSchema.parse({})` から派生させるのが理想だが、`noteListSearchSchema` の他 optional フィールドが `undefined` で埋まる戻り型と `HOME_SEARCH` の必須型 (`Pick<>`) を合わせる手間がある。最小修正は `HOME_SEARCH.limit` を `NOTE_LIST_LIMIT_DEFAULT` を参照する形に揃える。

## 修正方針

- 即時修正対象: FE-W-001, FE-W-002, FE-W-003, TA-W-001 (ADR記述追加), TA-W-002, TA-W-003 (= CQ-W-003), TA-W-004, TA-W-005 (ADR記述修正), CQ-W-001, CQ-W-002, CQ-W-004 (JSDoc 強化)
- 別 Issue: FE-W-004 (TRASH_SEARCH), CQ-W-005 (updater ヘルパ — 必須ではない & スコープ外)
