# PR Review #001 — feat: モバイルモック(#536)の実装追従 ③ admin 高密度テーブルのカード化（P40〜P47）

**PR:** #602
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 11
- Verdict: **BLOCKED**（Warning 全潰し方針のため）

---

## Frontend・デザイン準拠

#### Blockers
なし

#### Notes
- [N-001] モック追従良好（P45/P46/P43 とも視覚的に等価、ADR-001 の同一テーブルリフロー方針どおり）。
- [N-002] desktop 非回帰完全（全変更 `max-sm:` 内、`min-w-[880/920px]` 据え置き + `max-sm:min-w-0` 打ち消し）。
- [N-003] タッチ床 `!important` 付与漏れなし（4箇所 + P43 入力直付け）。report.md 実測と一致。
- [N-004] スコープは見た目のみ（ロジック/DTO/server-fn 不変）。空状態 colSpan 分岐・Jobs アクション div ラッパー（ADR-006）も適切。
- [N-005] 参照元 `LINK_MINI_ROW`（#588）の同種潜在バグはスコープ外（ADR-007 / progress.md で別 Issue 候補）。

**結論: APPROVED。**

## Styling規約・a11y

#### Blockers
なし

#### Warnings
- **[W-001]** リトライ結果サマリ `<p>` の `text-right` が mobile カードで右寄せのまま残る
  - 場所: `app/components/admin/Jobs/index.tsx`（IngestionRow / ExportRow のアクションセル内 結果 `<p>`）
  - 理由: アクションセルを全幅縦積みカードにした一方、結果テキストだけ desktop 由来 `text-right` を保持 → カード内で視線基準が揃わない。
  - 提案: `max-sm:text-left` を付与（`text-right` は `sm:` 以上の既存挙動に限定）。
- **[W-002]** `!important`（`]!`）が初導入で `styles.ts` の既存方針（`data-[…]:` variant で生成順確定）と逆向き
  - 場所: `Jobs`/`UsersTable`/`DesignTokensForm` の床回復箇所、根本は `common/styles.ts` の `pillBtnSm`
  - 理由: 方針転換のため、対向注記がないと後続実装者が `LINK_MINI_ROW` 流（`!important` なし）を再生産し同じ 26px バグを踏む。ADR-007 の判断自体は妥当。
  - 提案: `common/styles.ts` の `pillBtnSm` JSDoc に「親スコープで 44px 床を回復する際は `[&>button]:max-sm:min-h-[44px]!`（mobile 限定 `!important`）を使う」旨を 1 文追記（実装変更不要・ドキュメントのみ）。

#### Notes
- [N-001] トークン逸脱なし（`w-[84px]`/`min-h-[44px]` は既存値域）。
- [N-002] a11y 堅実（thead `display:none` を実 `<span>` ラベルで代替）。
- [N-003] 空状態 colSpan の `display:block` 化問題を `EMPTY_CELL_CLASS` で正しく処理。
- [N-004] data-* 規約違反なし。
- [N-005] 重複は plan.md Step5 の許容範囲（各ファイル定数化、新規 styles.ts なし）。
- [N-006] desktop 非回帰は CSS だけで担保。

---

## 対応方針

- **W-001 / W-002 ともこの PR で修正**（同ファイル内・軽微）。
- W-001: Jobs の結果サマリ `<p>` に `max-sm:text-left`。
- W-002: `common/styles.ts` `pillBtnSm` JSDoc に対向注記を追記。

## Design Decisions

特になし（ADR-007 で `!important` 採用は記録済み）。
