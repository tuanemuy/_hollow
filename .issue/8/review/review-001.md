# PR Review #001 — feat(note): P10 visibility & internal-link reference filters

**PR:** #28
**Date:** 2026-05-17
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 14（domain/app 2, adapter 4, frontend 4, test 6 — 重複統合済み）
- Notes: 多数
- Verdict: **BLOCKED**（Warning 多数のため修正サイクル必要）

---

## Domain / Application

### Blockers
なし

### Warnings
- **[A-W-001]** count 乖離（既知、ADR-009）。PR 説明に別 Issue リンク追加推奨
- **[A-W-002]** `Map<NoteId, PublicationVisibility>` に型を狭める余地 (`listNotesByOwner.ts:72`)

### Notes
- ADR-002 セマンティクスが port JSDoc に明示されている
- ドメイン跨ぎ import は既存逆方向 (publication → NoteId) と対称
- N+1 回避が usecase で 1 回の `findByNoteIds` で完結

---

## Adapter / Infrastructure

### Blockers
なし

### Warnings
- **[I-W-001]** `wantsPrivate=true` で `ownerRows` を unbounded `inArray(notes.id, [...])` で渡す。D1 のバインド数上限（~100）で owner ノート増加時に失敗のリスク。ADR-003 に明記＋フォロー Issue 起票
- **[I-W-002]** `resolveVisibilityCandidates` の `ownerRows` が `status` フィルタを見ない。後段で絞られるため結果は正しいが、ゴミ箱含む候補が無駄に膨らむ
- **[I-W-003]** integration test に status / dateRange との AND 合成ケース無し
- **[I-W-004]** `findByNoteIds` 単体テストが無い（ids=[] 早期 return、欠損 id 省略）

### Notes
- `intersectIdSets` の最小集合からループ最適化は plan より良い実装
- `wantsPrivate=true && notWanted.length === 0` の早期 return が良い
- SQL injection はパラメータバインディングで防御済み

---

## Frontend

### Blockers
なし

### Warnings
- **[F-W-001]** `view/schema.ts` の `visibilityFilter` は受理するが `actions.ts` で破棄される。schema が嘘をついている。コメントで「ADR-007 参照、永続化は別 Issue」明記または schema 側削除
- **[F-W-002]** `listSelectors.viewQueryToSearch` の `visibilityFilter` 復元は死コード（DTO 側で永続化されないため）。死コードのコメント明記または削除
- **[F-W-003]** `clearAll` が `viewId` を暗黙的に落とす。挙動として妥当だが PR 説明に明記
- **[F-W-004]** `actions.ts:48` の `as NoteId | null` は redundant cast（usecase 側で as NoteId 変換、ここは誤情報）

### Notes
- `NoteId.create` の transport boundary 検証は CLAUDE.md 例外条項に該当し正当
- baseSearch マージ順序 `{...restored, ...search}` は explicit URL fields が SavedView を override する正しい方向
- SavedView 経由で tagNames は復元されない既存の非対称性（別 Issue 候補）

---

## Test

### Blockers
なし

### Warnings
- **[T-W-001]** `visibility: ['private','unlisted','public']` の全選択ケース（早期 return path）未カバー
- **[T-W-002]** owner スコープのリーク回帰テスト無し（別 owner の note が混ざらない検証）
- **[T-W-003]** `intersectIdSets` が空集合になる早期 return path 未カバー
- **[T-W-004]** seed の counter がモジュールスコープ（並列実行時の id 衝突懸念）
- **[T-W-005]** 2 axis 組合せ（visibility+referencingNoteId のみ等）テスト省略
- **[T-W-006]** `listNotesByOwner` の「行あり private + 行なし private + public + unlisted」4 種混在ケース未カバー

### Notes
- plan の 8 ケース骨格はカバー
- `Set` ベース集合比較と配列順序比較を使い分け
- `beforeEach` の DB クリーンで冪等性担保

---

## Design Decisions

このラウンドで判明した「`visibilityFilter` の死コード問題」は ADR-007 の縮小決定（visibility 永続化は別 Issue）と整合するが、コード上は「半端実装」になっており保守者を欺く。次ラウンドで対処:
- `view/schema.ts` から `visibilityFilter` 削除（受理するなら永続化する、しないなら受理しない）
- `listSelectors.viewQueryToSearch` の visibility 復元コード削除（または「ADR-007: visibility 永続化未実装、別 Issue 待ち」のコメント明記）
- `viewQueryEquals` の visibility 比較も同様に整理

各 Warning への対応方針は review-001 統合修正セッションで実施。
