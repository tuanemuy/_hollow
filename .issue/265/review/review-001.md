# PR Review #001 — domain: extend no-op version/event skipping to User/Directory/Note value-setters

**PR:** #427
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 多数（健全性確認）
- Verdict: **BLOCKED**（Warning 修正のため再レビューへ）→ 修正後に再評価

3レイヤー並列レビュー（Domain / Test / Caller Impact・Event Suppression）。Blocker ゼロ。Warning 4件はすべて本ラウンドで修正。

---

## Domain

#### Blockers
なし

#### Notes
- changeUsername 判定順序（assertMutable → no-op → cooldown → mutate）は ADR-003 と一致。deleted は依然 throw、別 username のクールダウン throw は回帰なし。
- Directory.moveTo: cyclic → same-parent の順序が妥当。same-parent は depth 計算前に return。型保持 OK。
- Note.updateContent: 6フィールド比較が健全。`InternalLinkRef.equals` の resolvedNoteId/displayText 除外は、internalLinkRefs が contentHtml 由来のため安全。`assertEditPermitted` を no-op より前に置くのも正しい。
- `sameOrdered` 実装正しい。イベント抑制は意味論的に妥当。2カテゴリ原則遵守、promote/demote throw 維持も妥当。

## Test

#### Blockers
なし

#### Warnings
- **[W-T-001]** `Note.updateContent` の `resolvedNoteId` 除外契約がテストで固定されていない（`note/entity.test.ts` の no-op テストは resolvedNoteId が一致するケースのみ）。→ **修正済み**: 「resolvedNoteId だけ異なる link ref 再投入 → no-op」テストを追加。
- **[W-T-002]** 順序付き比較（order-sensitive）の契約が未固定。→ **修正済み**: 「同一 tag 集合・順序違い → version+1（no-op にならない）」テストを追加。

#### Notes
- 統合テストの `updated_at` 不変観測は堅牢（users は version 列を持たず updated_at が OCC トークン、text 厳密一致、clock 注入で flaky なし）。
- note lock テスト2件の content 引数追加は正しい修正（lock 経路の version bump 契約を維持しつつ no-op を回避）。
- カバレッジは plan/testing の要求をほぼ網羅。既存 throw テストも維持。

## Caller Impact / Event Suppression

#### Blockers
なし（updateContent no-op で破綻する呼び出し元・購読側なし）

#### Warnings
- **[W-C-001]** Note ユースケース（saveNote/saveNoteDraft/restoreNoteRevision）が no-op 時も無条件に save する。User 系の `next === found.entity` ガードと非対称。ADR の「書き込み回避」主張と実装にギャップ。→ **修正済み**: `saveNoteDraft`（autosave）に `next === found.entity` ガードを追加（Issue 本文の「ユースケース側ガード」要件）。`saveNote` は #158 ADR-002（毎回 revision append）を優先しガードせず、ADR-008 で範囲を明文化。`restoreNoteRevision` は safety-net revision のため対象外。
- **[W-C-002]** Note ユースケース層の no-op 統合テストがない。→ **修正済み**: `saveNoteDraft.integration.test.ts` に「同一内容再保存 → version・updated_at 据置」テストを追加。

#### Notes
- contentUpdated 購読側（handleLinkTargetResolution 等）は at-least-once 再発火に依存せず冪等。イベント抑制は妥当。
- restoreNoteRevision の no-op でも safety-net revision は残り UX のロールバック起点を保持。
- changeUsername の no-op ガードは load-bearing（assertUsernameAvailable が自己除外しないため、ドメイン no-op が同一参照を返すことで自己 username の UsernameTaken 誤発火を防ぐ）。順序変更で整合。
- Directory.moveTo 同一親 no-op は moveDirectory usecase を破綻させない。renameTag は updateContent 前に自前ガードあり。

---

## Design Decisions

- **ADR-008 を追加**: Note ユースケース側ガードは `saveNoteDraft` のみに適用し、`saveNote`/`restoreNoteRevision` は revision 契約（#158 ADR-002 / safety-net）を優先してガードしない。`saveNote` の no-op 便益は「version 据置＋イベント抑制」に留まることを明文化。
