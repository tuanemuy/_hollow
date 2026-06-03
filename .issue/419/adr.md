# ADR — Issue #419: ボタン/リンクの focus-visible リング統一と disabled opacity 正規化

## ADR-001: focus ring はグローバル `:focus-visible` を正とし、要素単位で付与しない

### Status
Proposed

### Context
Issue 本文は「pillBtn / BTN_* / PILL_BTN / NAV_ITEM / TREE_ITEM_LINK 系はいずれも focus-visible リングを持たない」としていたが、現状コードでは `app/styles/index.css` 165-169 行の base layer に `:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: inherit; }` が存在し（#293/#297 で導入）、全 focusable 要素にリングが統一適用されている。要素ごとに `focus-visible:` を追加するか、グローバル規則を正とするかの選択。

### Decision
グローバル `:focus-visible`（box-shadow 方式）を唯一の focus ring 源泉とする。要素単位の `focus-visible:` ユーティリティは原則撒かない。ブラウザ検証でリングが阻害されている箇所が見つかった場合のみ、阻害要因を除去する形で是正する。円形小要素の `dialogCloseButton`（common）と `NoteCheckbox.tsx` が `focus-visible:outline + outline-offset-2` で override しているのは、円形 32px / 20px に対して offset 付き outline の方が視認性が良いという形状理由の意図的判断（`.issue/354/adr.md` 既出）であり、維持する。

`USER_MENU_ITEM`（layout/styles.ts:44）/ `ACTIONS_MENU_ITEM`（directory/styles.ts:52）は `<button role="menuitem">` でありながら `outline-none` + `focus:bg-surface` を持つ。`outline-none` はネイティブ outline を消すのみで、グローバルリングは `box-shadow` で描かれるため抑止されない。よってこれらの menu item は box-shadow リングと `focus:bg-surface` の背景変化を併せて受け、focus 可視化は十分。`outline-none` の除去も追加付与も行わず現状維持とする（ブラウザ検証でリング表示を確認する）。

### Consequences
- 良い点: SSOT / DRY / CLAUDE.md のスタイリング規約に最も忠実。`--shadow-focus` トークン 1 点で全体を制御できる。
- トレードオフ: box-shadow ベースのリングは `overflow:hidden` 祖先でクリップされうる。検証で確認する。角丸要素（box-shadow + border-radius:inherit）と円形要素（outline + offset）で 2 系統が併存するが、形状での使い分けとして許容。

---

## ADR-002: disabled opacity を `0.55` に正規化しトークン化する

### Status
Proposed

### Context
disabled opacity が実態として 3 値に分散していた: `opacity-50`（admin pill ボタン群）/ `opacity-55`（common pillBtn 等の主要 primitive）/ `opacity-60`（auth・public・admin input 一部）。Issue ゴールは「1 値へ正規化、トークン化できるなら tokens.css 経由」。正規化値と実現手段の選択。

### Decision
正規化値は `0.55` を採用。`app/styles/tokens.css` に `--opacity-disabled: 0.55;` を新設し、`app/styles/index.css` の `@theme inline` で `opacity-disabled` utility に橋渡しする。Tailwind v4 が `--opacity-*` namespace から utility を生成しない場合は、各定数で `disabled:opacity-[var(--opacity-disabled)]` の任意値記法にフォールバックする（どちらも SSOT は tokens.css の 1 値）。実装時に採用した記法を本 ADR に追記する。

### Consequences
- 良い点: 採用箇所最多かつ中心 primitive `pillBtn` の現行値が 0.55 のため、変更点・視覚回帰が最小。値が 1 箇所に集約され将来のデザイン変更が一点修正になる。
- トレードオフ: `opacity-50`→0.55（濃くなる）/ `opacity-60`→0.55（薄くなる）で disabled 表示が僅かに変化する。機能影響なし。

採用記法: `opacity-disabled` utility（theme bridge）。`pnpm build` の生成 CSS で `.disabled\:opacity-disabled:disabled { opacity: var(--opacity-disabled) }`（および aria-disabled / data-[disabled] 各 variant）が出力され、`--opacity-disabled: .55` で解決されることを確認。任意値記法フォールバックは不要。

---

## ADR-003: 正規化対象は disabled 系 state に限り、discarded / pending は据え置く

### Status
Proposed

### Context
`opacity-60` を持つ箇所には disabled 以外の state opacity も含まれる: `IngestionJobRow.tsx` の `data-[discarded]:opacity-60`（破棄済みジョブの淡色化）、`NoteListViews.tsx` の `data-[pending]:opacity-60`（楽観的 UI の保留中淡色化）。これらを正規化対象に含めるか。

### Decision
正規化対象は `disabled:` / `aria-disabled:` と、意味的に disabled な `data-[disabled]:`（`InlineEditor.tsx`）に限る。`data-[discarded]:` / `data-[pending]:` は disabled とは別概念の state opacity であり、本Issueのスコープ外として据え置く。

### Consequences
- 良い点: Issue の「disabled opacity」の語義に忠実。スコープ外改善を巻き込まない。
- トレードオフ: state opacity 全体としては 0.55 と 0.60 が併存し続けるが、意味が異なるため一貫性の問題ではない。
