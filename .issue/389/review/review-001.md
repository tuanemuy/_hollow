# PR Review #001 — ノート一覧ビューのUI改善

**PR:** #393
**Date:** 2026-06-01
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 9
- Verdict: **BLOCKED**（W-002 / W-003 を修正、W-001 は根拠付き現状維持 → 再レビューで確認）

---

## Frontend

#### Blockers
なし

#### Warnings
- **[W-001]** タイルのメタ行のセパレータ `·` 運用が ListView と非対称（チップ直後の `·`・日時が折り返し時に行末/行頭で孤立しうる）
  - 場所: `app/components/note/list/TileView.tsx`
  - 対応: **根拠付きで現状維持**。manual-test（`アーカイブ参考` タイルで日時が次行に折り返すケース含む）で `·` の孤立・実害は出ず、ListView のメタ行（`tag · chip`）と区切り文字のリズムを揃える意図がある。inline セパレータの行末 `·` は許容範囲の typographic 挙動。検証済み UI を崩すリスクを避け、変更しない。
- **[W-002]** タグ `<span>` の `break-words` はハイフン/スペースのない長大1トークンを割れず、最大50文字タグではみ出す余地
  - 場所: `app/components/note/list/TileView.tsx`
  - 対応: **修正**（`[overflow-wrap:anywhere]` で確実に折り返す。ADR-003 を更新）

#### Notes
- [N-001] 罫線の二重表示解消は適切（`divide-y` + `border-t` 削除、選択/hover/空状態と干渉なし）
- [N-002] 共通化先 `list/styles.ts` は `public/styles.ts` の確立パターンに沿う。重複は完全解消、`formatDate` 移設も循環 import なし
- [N-003] 更新日時の右カラム集約は正しい（モバイル幅でも消えず重複なし）
- [N-004] `CHIP_BASE` の export は未使用だが `public/styles.ts` 慣習に沿う（lint 緑）
- [N-005] スコープ外: `note/detail/NoteActions.tsx` にも `visibilityLabel` 別定義があるが描画方式が異なり本 PR 対象外（将来一元化の余地）

## Application / DTO

#### Blockers
なし

#### Warnings
- **[W-003]** spec ドキュメント `spec/usecases/index.md:78` の `NoteListItemDTO` 定義に `thumbnailUrl: string | null;` が残存
  - 理由: ADR-001 で「DTO から完全除去」を決定したが spec が実装と乖離。SSOT として誤った前提を再導入しかねない
  - 対応: **修正**（該当行を削除）

#### Notes
- [N-006] thumbnailUrl はコード側で漏れなく除去（DTO/projection/loaders/3 usecase、grep 0件、typecheck 緑）
- [N-007] 副作用なし（`NoteListItemDTO`/`OwnedNoteCommon`/`DisplayedNote` の他消費者・search adapter・DB スキーマに thumbnail 参照なし）
- [N-008] 除去後の宙に浮いたコメント残骸なし、JSDoc 整合良好
- [N-009] レイヤー境界健全（projection は application 層に閉じる）、ADR-001 方針通り

---

## Design Decisions

ADR-003（TileView のタグ折り返し）を W-002 対応に合わせて `break-words` → `[overflow-wrap:anywhere]` に更新する。

## 修正方針

W-001 / W-002 / W-003 はいずれも変更ファイル内・同テーマで完結する軽微な指摘のため、本 PR ですべて修正する（後回しなし）。
