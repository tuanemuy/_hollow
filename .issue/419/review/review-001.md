# PR Review #001 — refactor(a11y/ui): disabled opacity 正規化と focus-visible リング統一 (#419)

**PR:** #440
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 11
- Verdict: **BLOCKED**（Warning 2件 — 完了条件は Blocker 0 かつ Warning 0）

レビューレイヤー: Frontend/Styling 規約準拠、a11y/スコープ/視覚回帰 の 2 視点を並列実施。

---

## Frontend / Styling

#### Blockers
- なし

#### Warnings
- なし

#### Notes（要約）
- トークン定義位置・@theme inline bridge が CLAUDE.md 規約に完全準拠（tokens.css の Motion 直後に `/* State */` 新設、index.css の Duration 直後に bridge）。
- `opacity-disabled` utility が Tailwind v4 で 3 variant（disabled/aria-disabled/data-[disabled]）とも正しく生成されることをビルド CSS で実機確認。
- 全 disabled opacity 箇所の置換が漏れなく完了（14 ファイル、計 23 箇所）。grep ヒットは据え置き 2 件のみ（※ただし a11y 視点が `app/routes` の漏れを検出 → W-001）。
- `GATE_SUBMIT` は pillBtn 合成で独自 opacity を持たず、pillBtn 経由で自動統一（plan の記述は軽微な誤認だが実装は正しい）。
- 要素単位 `focus-visible:` の追加なし（ADR-001 準拠）。spec/design/tokens.md の mirror も一致。

## a11y / スコープ / 視覚回帰

#### Blockers
- なし

#### Warnings
- **[W-001]** disabled opacity 正規化のスコープ漏れ — `app/routes/admin/route.tsx:43`（`ADMIN_BTN_CLASS`）が `disabled:opacity-50` のまま残存。
  - 理由: 検証 grep が `app/components` 限定だったため `app/routes/` 配下が網から漏れた。admin pill ボタンと同型で、admin 画面に 0.5 と 0.55 が併存し本Issueが解消すべき不一致がここだけ残る。
  - 緩和: 適用先が `<Link>`（アンカー）2 箇所のみで `:disabled` 擬似クラスにマッチせず実害は現状ゼロ。
  - 提案: `disabled:opacity-disabled` に統一。検証 grep を `app/` 全体に拡大。
- **[W-002]** ブラウザ検証（report.md）が ADR 自身が最大リスクとした overflow クリップ／menu item を未カバー（public フォームのみ検証）。
  - 理由: testing.md 確認項目1・ADR-001 Consequences が「box-shadow リングが overflow:hidden 祖先でクリップされうる、検証で確認する」と自認していたが、nav/tree/menu item を検証していない。リングの有無は一般化できるがクリップの有無は要素レイアウト依存で一般化できない。
  - 提案: 認証必須ページ（admin サイドバー nav・ツリー・user menu）でリング非クリップを確認。

#### Notes（要約）
- menu item の `outline-none` がリングを抑止しない判断は技術的に正しい（リングは box-shadow 由来）。menu panel に overflow-hidden なし。
- disabled opacity 0.55 のコントラスト懸念なし（WCAG 1.4.3 は disabled を除外）。
- 据え置き 2 件（discarded/pending）の境界が ADR-003 どおり保たれている。`InlineEditor` の `data-[disabled]` を対象に含めた判断も妥当。
- トークン化はビルド CSS で裏取り済み。

---

## 対応

- **W-001**: 修正済み。`app/routes/admin/route.tsx:43` を `disabled:opacity-disabled` に統一。plan.md ステップ9 の検証 grep を `app/` 全体に拡大（根本原因の是正）。
- **W-002**: 解消済み。admin 検証済みユーザーのセッションを dev D1 に投入し認証ページを検証（検証後シード削除）。admin nav / app サイドバー（`overflow-y-auto`）/ user menu いずれも focus リングが `--shadow-focus` で描画されクリップされないこと、admin disabled ボタンが全て opacity 0.55 であることを確認（report.md 「追加検証」参照）。

## Design Decisions

このラウンドで新規の設計判断なし（既存 ADR-001/002/003 の妥当性が両視点で確認された）。
