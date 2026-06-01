# PR Review #002 — feat(#46): findReferrers の結果上限制御（LIMIT/OFFSET 化）

**PR:** #404
**Date:** 2026-06-01
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 1（F-W-001 の再評価 — フロント単体テスト不在）
- Notes: 多数（Round1 修正 2 件・disposition 2 件の妥当性を確認）
- Verdict: **BLOCKED**（Warning 1 件を修正のため）

Round1 の doc 修正 2 件と disposition の妥当性を 2 視点で再検証。Adapter+UseCase+Port 視点は全クリーン（disposition 妥当・Approve 相当）。Test+Frontend 視点が F-W-001 の disposition 根拠の事実誤認を指摘。

---

## Adapter + Performance + Use Case + Domain Port

#### Blockers / Warnings
なし

#### Notes（要点）
- **A-W-001 修正は正確**: Pass1 コメントの「referrer filter is fully captured by `fromIds`」が実装と一致、保守上の混乱を解消。
- **U-W-001 修正は正確**: port JSDoc の tie-break=id DESC（order 非依存）が `sortNoteRowsBy` / SQL `desc(notes.id)` と整合。
- **A-W-002 disposition 妥当（再提起せず）**: `Promise.all` 並列化済み、UoW 内 read は tx 非共有で安全、全件 hydrate 回避が支配的。
- **U-W-002 disposition 妥当（再提起せず）**: cross-owner resolution は domain service（`service.ts:239,250`）が構造的に禁止。port JSDoc + ADR-003 の前提明記で十分、禁止状態の seed テストは誤解を招く。
- 後方互換パス（opts 省略）が main 版と逐語等価。スコープ（getBacklinks/export/stub）無変更を確認。

---

## Test + Frontend

#### Blockers
なし

#### Warnings
- **[T-W-001]** F-W-001 の disposition 根拠「component 単体テストの仕組みが無い」が**事実誤認**で据え置き不可
  - 場所: `app/components/note/detail/NoteMetaPanel.tsx`（テスト対象）／前例 `app/components/note/list/__tests__/NoteListViews.test.tsx`
  - 理由: プロジェクトには `happy-dom` + `createRoot`/`act` + `vi.mock("@tanstack/react-router")` の確立済み component 単体テスト基盤が存在（`app/components/...` 配下に 18 本）。`NoteMetaPanel` は純粋表示コンポーネントで、本 PR 唯一の挙動変更（`backlinks.length` → `backlinkCount`）を低コストで直接担保できる。
  - 提案: `NoteListViews.test.tsx` の手法で `NoteMetaPanel.test.tsx` を追加し、`backlinkCount={7}` / `backlinks=[5件]` で footer「（7 件）」（≠5）、0 件時「なし」+「（0 件）」を assert。
  - → **修正済み**: `app/components/note/detail/__tests__/NoteMetaPanel.test.tsx` を新規追加（3 ケース、全 green）。①件数が総数(7)を示し preview 件数(5)ではない + inline 5 件 ②0 件時「なし」+「（0 件）」 ③各 backlink title 描画。前例の `@vitest-environment happy-dom` / `vi.mock` / `createRoot`+`act` を踏襲。

#### Notes（要点）
- 追加テスト全 green（adapter+usecase 75 件 + component 3 件）。
- adapter テストの seed 前提（`seedManyNotes` の updatedAt 単調・id 単調、chunk 境界 90 跨ぎの 150/120 件）を実コードで裏取り。
- usecase テストが preview 上限(5)と総数(8)の独立・0/3 件 count・trashed 母集合一致を担保。
- フロント差分は最小妥当（footer 1 行 + props 透過）、RSC/TanStack Start 規約準拠。

---

## Design Decisions

新規の設計判断なし。F-W-001 は disposition を撤回し、確立済みパターンで component 単体テストを追加する方針に変更。
