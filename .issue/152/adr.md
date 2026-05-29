# ADR — Issue #152: disabled 中の hover utility 無効化を pill button ファミリーに横断適用

## ADR-001: `pillBtn` 系の hover 抑制を `:disabled` と `[aria-disabled]` の両方に効かせる

### Status
Accepted

### Context
Issue #152 は disabled なボタンで hover による視覚変化が残る問題の解消を求める。素朴な対応はコードベースの確立済みコンベンション `hover:not-disabled:<util>`（= `:not(:disabled)`）に揃えることだが、`pillBtn` には固有事情がある:

- `pillBtn` は `<button>` だけでなく `<Link>`（アンカー）にも適用される（`note/history/NoteRevisionRestorePanel.tsx:70` の `<Link className={pillBtn}>`）。
- アンカー要素は `:disabled` 疑似クラスを持てない。disabled 表現は `aria-disabled="true"` で行う。`pillBtn` が `aria-disabled:opacity-55 aria-disabled:cursor-not-allowed` を併記しているのはこのため。

したがって `hover:not-disabled:` だけでは、`aria-disabled` で無効化されたアンカー pill の hover 色変化が残り、Issue の要件（「disabled なボタンに hover した時、視覚的な色変化が起きないこと」）を満たせない。

選択肢:
- (A) `not-disabled:` のみ — アンカーの aria-disabled ケースが取りこぼれる。不採用。
- (B) `not-disabled:not-aria-disabled:` を併用 — `:disabled` と `[aria-disabled="true"]` の両方で hover を抑制。採用。
- (C) `disabled:hover:<base色> aria-disabled:hover:<base色>` で base 色を hover 時に再表明して打ち消す — 各 utility（bg/text/scale）ごとに再表明が必要で冗長。(B) がコンパイル不可だった場合のフォールバックとしてのみ採用。

### Decision
`aria-disabled:` スタイルを契約として持つ定数（`pillBtn` / `pillBtnPrimary` / `pillBtnDanger`）には `not-disabled:` に加えて `not-aria-disabled:` を併用する。
常に `<button>` で `aria-disabled:` 契約を持たない定数（`dialogCloseButton` / `EDITOR_TOOLBAR_BTN`）は `not-disabled:` のみとする（過剰な variant を付けない）。

Tailwind v4 が `not-aria-disabled:`（`not-*` variant × 組み込み `aria-disabled` variant の合成）を生成できることは `pnpm build` の生成 CSS で確認する。生成されない場合は選択肢 (C) にフォールバックする。

### Consequences
- 良い点: button / anchor どちらの disabled 表現でも hover 色変化が確実に止まる。`aria-disabled:opacity-55` という既存契約と hover 抑制の対象が一致し、半端な修正にならない。
- トレードオフ: class 文字列がやや長くなる。`not-aria-disabled:` はコードベース初出のため build 検証が必須。
- WHY が非自明なため `pillBtn` の JSDoc に 1 行追記して根拠を残す。

---
