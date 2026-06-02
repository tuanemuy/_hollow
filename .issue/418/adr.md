# ADR — Issue #418: テキストリンク装飾を common primitive へ統一する

## ADR-001: `PUBLIC_TEXT_LINK` を common link primitive に含めず据え置く

### Status
Proposed

### Context
#336 plan のインベントリ d は `PUBLIC_TEXT_LINK`(+`_SIGNUP`) を「リンクと pill の中間。別 primitive」と評価していた。本 Issue（g: テキストリンク装飾の統一）の対象に含めるか判断が必要だった。

`PUBLIC_TEXT_LINK` の装飾は `text-sm font-medium text-ink px-2.5 h-9 inline-flex items-center rounded-md transition-colors motion-reduce:transition-none hover:bg-surface` で、g の共通装飾（`text-accent hover:underline hover:[text-underline-offset:3px]`）とは別物の surface-hover pill 風。consumer は `PUBLIC_TEXT_LINK_SIGNUP` 経由の PublicLayout 1 箇所のみ。bare `PUBLIC_TEXT_LINK` は import + `export { PUBLIC_TEXT_LINK };` で再エクスポートされていたが、JSX 直接消費・外部消費者ともに grep で 0 件だった。

### Decision
`PUBLIC_TEXT_LINK` 定数本体は `public/styles.ts` のローカル定数として据え置く。common の `textLink` には含めない。死蔵していた bare 再エクスポート（`PublicLayout.tsx` の import 項目と `export { PUBLIC_TEXT_LINK };`）のみ削除する。

### Consequences
- 良い点: accent 下線リンクと pill 風中間体を混同せず、意匠の境界が明確。視覚回帰ゼロ。死蔵コードを除去。#417 ADR の YAGNI 判断（consumer 1 箇所の中間体に新 primitive を起こさない）と整合。
- トレードオフ: `PUBLIC_TEXT_LINK` は将来 consumer が増えれば改めて primitive 化の検討余地が残る。現状は YAGNI で据え置き。

---

## ADR-002: ノート本文リンク（`.note-detail-content a`）を SSOT 化対象外とする

### Status
Proposed

### Context
ノート本文リンク（`app/styles/index.css` `@layer components` 内 `.note-detail-content a` / `a:hover`）は g の共通装飾と近縁意匠を持つ（accent 色・hover 時 3px offset は共通）。ただし完全な同一ではなく、本文リンクは散文の慣習として `text-decoration: underline` を**常時**持つのに対し、`textLink` は hover 時のみ下線になる点が異なる。SSOT 化の観点では `textLink` と値を共有したいが、`.note-detail-content` 配下の `<a>` は `dangerouslySetInnerHTML` 由来で utility class を付けられない（CLAUDE.md 文書化済み例外 / `.issue/70/adr.md` ADR-002）。

### Decision
`.note-detail-content a` は utility 化せず CSS のまま据え置く。`textLink` の JSDoc に「近縁意匠（accent 色・hover 3px offset は共通、ただし本文リンクは常時下線・`textLink` は hover 時のみ下線）だが dangerouslySetInnerHTML 由来で utility 化不可」と cross-reference 注記するに留め、CSS 側は変更しない。

### Consequences
- 良い点: CLAUDE.md「`.note-detail-content` 以外の例外を増やさない」方針と整合。`color: var(--color-accent)` は既にトークン経由で実質共有済みで、`text-underline-offset: 3px` のためだけに新トークンを起こす過剰さを避けられる。意匠の同一性はドキュメント注記で将来へ伝わる。
- トレードオフ: 装飾値（offset 3px）は `textLink` と CSS の 2 箇所に物理的に残る。ただし両者ともリンク装飾の意匠として安定しており、変更頻度は低い。

---

## ADR-003: `textLink` 合成置換における視覚回帰ゼロの根拠（トークン集合不変 ⇒ 生成 CSS 不変）

### Status
Proposed

### Context
ステップ2で `CALLOUT_ACTION` を `textLink` 合成へ置換すると、class 文字列内で `hover:underline hover:[text-underline-offset:3px]` のトークン位置が `text-accent` 直後・`font-medium` 前へ移動する（`FIELD_LINK` / `AUTH_FOOTER_LINK` はトークン集合・順序とも完全一致で移動なし）。これが視覚回帰を生まないことの根拠を明確にしておく必要がある。

### Decision
3 定数とも置換前後で **class トークン集合を完全一致**させる（追加・削除なし、`CALLOUT_ACTION` のみ順序差）。Tailwind v4 は各 utility の CSS ルールを内部の定義順で 1 回だけ生成し、class 文字列の出現順には依存しない。したがって**トークン集合が不変なら生成 CSS は不変**である。本件は `text-accent`（1 つ）と `hover:*`（別プロパティ）の組み合わせで、同一プロパティの素 utility 同士が新たに競合することはないため、`pillBtnDanger`（#273 ADR-003）/ `pillBtnTall`（#416/#417）で問題になった「同一プロパティの勝敗が生成 CSS 順で決まる／拡大方向のみ勝てる」というカスケード論点はそもそも発生しない。`pnpm build` 前後の生成 CSS diff は、この根拠を裏づける確認手段として実施する（必須ゲートというより念のための裏取り）。

### Consequences
- 良い点: 視覚回帰ゼロの主張がカスケード論に依存せず「トークン集合不変」だけで証明的に成り立つ。将来の読み手が #273/#416 系の制約と混同しない。
- トレードオフ: なし（確認手段として build diff を 1 回回すコストのみ）。


---

## ADR-004: auth インライン本文リンクの `textLink` 集約範囲と、常時下線リンクの据え置き

### Status
Proposed（レビュー round 1 / review-001 W-001・W-002 を受けて追記）

### Context
初稿の実装は名前付き 3 定数（`AUTH_FOOTER_LINK` / `FIELD_LINK` / `CALLOUT_ACTION`）のみを `textLink` 合成へ置換した。しかしレビューで、`SignUpForm`（利用規約・プライバシーポリシー）と `AdminSignUpForm`（同 2 箇所）の計 4 箇所に、`textLink` と**バイト一致**する inline 文字列 `"text-accent hover:underline hover:[text-underline-offset:3px]"` が残存していると指摘された（W-001）。これらは Issue g が解消対象とする「auth 配下のテキストリンク装飾の物理的重複」そのものであり、primitive を導入しながら同じ装飾を JSX に残すと SSOT が部分達成に留まる。

一方 `AdminSignUpForm/index.tsx:176`（通常サインアップへの誘導リンク「こちら」）は `"text-accent underline [text-underline-offset:3px]"` で、`textLink`（hover 時のみ下線）とは異なり**常時下線**の別意匠である（W-002）。

### Decision
- W-001 の 4 箇所は `className={textLink}`（`@/components/common/styles` から import）へ置換し、Issue g を完結させる。完了条件は `grep -rn "text-accent hover:underline" app/` が `common/styles.ts` の定義 1 件のみになること。
- `AdminSignUpForm:176` の常時下線リンクは `textLink` とは別意匠（base 状態で下線あり）のため、本 Issue の対象外として据え置く。`textLink` を当てると hover 前の下線が消えて視覚回帰になる。常時下線リンクの consumer は現状この 1 箇所のみで、新 primitive を起こすほどの重複もないため YAGNI で据え置く。

### Consequences
- 良い点: `textLink` が auth 配下のテキストリンク装飾の真の SSOT になり、Issue g の目的（装飾の物理的重複の集約）を完全達成。視覚回帰ゼロ（4 箇所ともバイト一致の置換）。
- トレードオフ: 常時下線リンク（`AdminSignUpForm:176`）は SSOT 対象外として 1 箇所だけ inline のまま残る。将来同種が増えれば改めて primitive 化を検討する余地がある。
