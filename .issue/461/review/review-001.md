# PR Review #001 — refactor(ui): UIコントロールの寸法ばらつきを横断で正規化 (#461)

**PR:** #470
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning を全修正のため次ラウンドで確認）

---

## Frontend / Styling

#### Blockers
- なし

#### Warnings
- **[W-001]** `BULK_ACTION` の font-size が原型と不一致（`note/list/BulkActionBar.tsx:41`）。高さ・横余白は `h-7 px-3` で原型 `pillBtnSm` に揃ったが、font-size は ADR-001 の機械置換で `text-sm` のまま（原型は `text-xs`）。→ **対応**: ADR-005 に「暗背景バー＋バー内 `BULK_COUNT` との整合のため text-sm を意図的に維持」と記録。

#### Notes（要約）
- 重点置換は全完了: `text-[13px]`/`h-[30px]` grep 0件。チップ系 `gap-[5px]`→`gap-1.5` を3原型＋直書きで解消。
- 意図的差を温存: auth h-11/text-md 無傷、public 大型入力 h-11/h-12・text-[15px] 維持、admin バッジ族・pillBtnSm・navItem py-[7px] 無傷。
- ADR-004（fieldControl textarea 合成）正しい実装、ADR-003（角丸境界ルール）正確、視覚値維持＋冗長 max-sm:text-xs 掃除も適切。
- `h-9` インライン/検索入力群は標準値（任意値ではない）で本PRスコープ外として残すのは妥当。

---

## Design-system / spec 整合性

#### Blockers
- なし

#### Warnings
- **[W-001]** §7.2 が §7「画像・アイコン方針」配下に誤ネスト（`spec/design/index.md`）。font-size/入力欄/チップの3箇条は画像・アイコンと無関係で検索性を損なう。→ **対応**: §7 から出して**無番号トップレベル節**「UI コントロールの寸法ノーマライズ（#461）」へ昇格（§8 a11y が多数クロス参照されているため番号繰り下げは不可。リポジトリ前例 #221 の「番号を落とす」方式に倣う）。
- **[W-002]** §7.2 の入力欄高さ主張「標準フォームと admin の入力欄は 40px に統一」が、残存する h-9 インライン/ツールバー入力（renameInput / NoteListToolbar select / ViewFormDialog inputSm）と整合しない。→ **対応**: 文言を実装の射程（`fieldControl`/`FIELD_INPUT`/admin Form/ユーザー検索）に限定し、インライン編集・ツールバー select は別コホート（h-9）で対象外と明記。

#### Notes（要約）
- ADR-001 トークン不増を確認（tokens.css/index.css 差分0、defaults.ts 無変更）。
- text-[13px] は app/ から完全消滅。ADR-003 角丸統一・ADR-005 バッジ族現状維持・ADR-002 text-[15px] 残置すべて決定どおり。
- 棚卸し表の「統一」項目は全カバー、「意図的差を残す」項目は誤変更なし。

---

## 修正内容（このラウンドで全 Warning 対応）

1. **[Frontend W-001]** ADR-005 に `BULK_ACTION` の text-sm 維持の根拠（暗背景可読性＋バー内整合）を追記。
2. **[Design W-001]** `spec/design/index.md` の §7.2 を無番号トップレベル節へ昇格（番号体系を壊さない）。
3. **[Design W-002]** 入力欄高さの文言を実装射程に限定し、h-9 インライン/ツールバー入力を対象外と明記。

## Design Decisions

ADR-005 に `BULK_ACTION` font-size の判断を追記（既存 ADR の continuation）。新規 ADR は不要。
