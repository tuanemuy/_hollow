# ADR — Issue #589: モバイルモック(#536)の実装追従 ③ admin 高密度テーブルのカード化

## ADR-001: カード化方式は「同一 `<table>` を `max-sm:block` でリフロー」に統一

### Status
Proposed

### Context
admin の高密度テーブルを狭幅でカードに畳む方式に 2 案あった。
- (a) mock 通り mobile 専用に `<article>/<dl>` 別マークアップを併存させる（CSS/JS で出し分け or 二重レンダリング）。P46 mobile mock はこの形。
- (b) 同一の `<table>` に Tailwind `max-sm:` を当てて `display:block` でリフローする。P45/P47 mock の desktop 版（`@media max-width`）はこの形。

### Decision
(b) を採用。P47 Metrics が既に (b) で実装済みでありプロジェクト内パターンが一貫する。デスクトップ非回帰が CSS だけで保証され（ランタイム分岐ゼロ、#588 ADR と同思想）、DOM 二重化やビューポート JS 判定を避けられる。P46 mock が別マークアップなのは HTML モックの表現手段であり、結果（カード見出し + 補助属性 + アクション行の縦積み）が等価なら (b) で受け入れ基準を満たす。

### Consequences
- 良い点: desktop 完全非回帰・パターン一貫・実装コスト最小・a11y を実 DOM ラベルで担保しやすい。
- トレードオフ: mock の `job-card-head` 左右配置や `job-err` 背景ボックスなど一部細部は厳密一致しない（受け入れ基準は overflow=0・カード化・タッチ床・トークン経由で、(b) で満たせる）。

---

## ADR-002: セルのラベルは擬似要素ではなく実 DOM `<span>`

### Status
Proposed

### Context
mock は `td[data-label]::before { content: attr(data-label) }` で列ラベルを再現している。`<table>` を `display:block` 化すると thead が隠れて列の意味が失われるため、各補助セルにラベルが必要。

### Decision
擬似要素ではなく実 DOM `<span>`（`hidden max-sm:inline-block`）でラベルを前置する。Metrics の既存実装がこの方式を採っており、スクリーンリーダーがラベルを読めるため a11y で優位。

### Consequences
- 良い点: a11y 向上、既存パターン踏襲、desktop では `hidden` で非表示。
- トレードオフ: JSX にラベル文字列が増える（軽微）。
- **依存関係**: `<thead>` を `max-sm:hidden`（= `display:none`、アクセシビリティツリーから除外）にするため、mobile では span ラベルが SR にとって唯一の列見出しになる。後で `<thead>` を `sr-only` 等に変える場合はラベル span の二重読みに注意。

---

## ADR-005: P43 デザイントークン行はグリッド解除だけでなく値列リフロー + 44px 床まで対応する

### Status
Accepted

### Context
当初計画は P43 を「`grid-cols-[220px_1fr]` に `max-sm:grid-cols-1` を足すだけ。mock も床指定がない」としていたが、これは mock の誤読だった。`spec/design/pages/mobile/P43-admin-tokens.html` を精読すると、`.token-row` は `flex-direction:column` の 3 段縦積み（キー行 / スウォッチ+値入力 / 操作）で、`.token-input` に `min-height:44px`、操作ボタン `.icon-action` に `min-height:44px; width:100%` が明示されている。現実装の値列は `flex items-center gap-2`（スウォッチ + 値入力 + `pillBtnSm` 削除ボタン）が 1 行に収まり、削除ボタンは mobile でも 24px 床。`max-sm:grid-cols-1` だけでは受け入れ基準「カード内タッチターゲットが §3 の床（44px）」を満たさず、220px 列 + 値入力 + ボタンが横並びのまま 320px で溢れる懸念もある。

### Decision
P43 は (a) 行に `max-sm:grid-cols-1`、(b) 値列 `flex items-center gap-2` を `max-sm:flex-wrap` 等で折り返し可能にし削除ボタンを全幅化、(c) キー入力・値入力に mobile 44px 床（`max-sm:h-11` 相当、現状 `h-8`/`h-10`）、(d) 削除ボタンの床回復は ADR-004 の親スコープ `[&>button]:max-sm:min-h-[44px] [&>button]:max-sm:w-full` で行う、まで対応する。P43 は「目視のみ」グループには含めない。

### Consequences
- 良い点: 受け入れ基準のタッチ床と overflow=0 を P43 でも満たす、mock と視覚的に等価な 3 段カードになる。
- トレードオフ: P43 の変更量が当初想定より増えるが、いずれも `max-sm:` 限定で desktop 非回帰。

## ADR-003: ブレークポイントは画面別 mock の desktop 境界に従う

### Status
Proposed

### Context
mock ごとにカード化の境界が異なる（P45/P46 = `max-width:639px`、P47 limits = `max-width:767px`）。揃えるべきか SSOT を尊重すべきか。

### Decision
mock SSOT の境界差をそのまま反映する。P45/P46 は `max-sm`、P47 limits は既存実装の `max-md` を据え置く。

### Consequences
- 良い点: SSOT 忠実、Metrics の既存実装に手を入れない。
- トレードオフ: admin 内でカード化境界が画面により異なるが、mock 通りなので意図的。

---

## ADR-004: カード化行アクションのタッチ床回復は親スコープ `[&>button]:max-sm:` で行う

### Status
Accepted

### Context
既存 `pillBtnSm`（`data-[sm]:max-sm:min-h-0`）は admin の密度優先のため mobile でも 44px 床を打ち消している。一方 mock のカード行アクションは 44px・全幅縦積み（§3 タッチ主体 44px）。当初は `data-[sm]:max-sm:min-h-[44px]` で直接上書きする案だったが、これは打ち消し側（`data-[sm]:max-sm:min-h-0`）とバリアントスタックが完全に同一で specificity が等価になり、勝敗が Tailwind v4 の生成 CSS ソース順に依存してしまう（`styles.ts` の既存 ADR が繰り返し警告するアンチパターン）。

### Decision
アクション行（親）に `[&>button]:max-sm:min-h-[44px] [&>button]:max-sm:w-full [&>button]:max-sm:justify-center` を当てて子ボタンの床を回復する。これは #588 で `app/components/publication/styles.ts` の `LINK_MINI_ROW` が同一課題（カード縦積みで `pillBtnSm` の 44px 床を回復）に採用した確立パターン。`[&>button]:` は子結合子を 1 つ追加するため `data-[sm]:` 単独より specificity が高く、生成順に依存せず確定的に勝つ。各ボタンへの個別付与は不要になり、P45/P46 のアクション行・P46 操作セクション群・P43 操作ボタンを親側だけでカバーできる。desktop の 24px 密度は不変。

### Consequences
- 良い点: §3 タッチ床準拠、desktop 密度は維持、specificity が確定的（生成順非依存）、#588 とパターン一貫、子ボタン無改修。
- トレードオフ: 親が直接の子 `<button>` のみを対象にするため、ボタンが追加のラッパーで包まれている場合はセレクタ調整が必要（実装時に DOM 構造を確認）。

---

## ADR-006: 実装時の細部判断（#589 実装で確定）

### Status
Accepted

### Context / Decision
実装中に下した非自明な判断を記録する。

- **Jobs アクションセルのラッパー追加**: `IngestionRow`/`ExportRow` のアクション `<td>` は `<button>` と結果表示 `<p>`（`summary`）の 2 要素を直接子に持つ。ADR-004 の `[&>button]:` 親スコープを `<td>` 直下に当てると `<td>` の `display:block` 化と縦積み制御が両立しにくいため、内側に `ACTION_ROW_CLASS`（`max-sm:flex max-sm:flex-col max-sm:items-stretch [&>button]:max-sm:…`）の `<div>` を 1 枚追加して囲った。`[&>button]:` はこの div の直接の子ボタンのみ対象、`<p>` は対象外で全幅テキストとして残る。UsersTable は既存の内側 flex `<div>` がそのまま使えたためラッパー追加は不要。
- **P43 値列の折り返しスコープ**: ADR-005 の「スウォッチ+値入力は 1 行維持・削除ボタンは全幅」を、値列 `flex items-center gap-2` に `max-sm:flex-wrap` を足し、値入力の既存 `flex-1`（+ mock 由来の `min-w-0` 相当）でスウォッチ+入力を 1 行目に保持、削除ボタンを `[&>button]:max-sm:w-full` で 2 行目に全幅折り返しさせる形で実現。床回復も同じ親スコープ `[&>button]:max-sm:min-h-[44px]` でまとめた（行アクションと同手法）。
- **入力 44px 床は `max-sm:h-11`**: ADR-005 の「44px 床」は、トークン経由の `h-11`（= 44px）を mobile のみ上書きで付与（既存 `h-8` は desktop で素のまま）。`min-h-[44px]` ではなく `h-11` を選んだのは、`fieldControl` の `h-10 max-sm:min-h-[44px]` と違い token フォームの入力は `h-8` 固定高で `h-11` の方が高さが確定し mock の `min-height:44px` と視覚的に等価なため。

### Consequences
- 良い点: 既存パターン（ADR-004）に一貫、desktop 非回帰、新規 px なし（`h-11`/`w-[84px]` は token・mock 値域）。
- トレードオフ: Jobs アクションセルに div が 1 枚増えるが a11y・ロジックに影響なし。

---

## ADR-007: タッチ床回復は `[&>button]:` 親スコープではなく mobile 限定の `!important` で確定させる（ブラウザ検証で判明）

### Status
Accepted（ADR-004 の手法を上書き）

### Context
ブラウザ目視検証（.issue/589/manual-test）で、ADR-004 の `[&>button]:max-sm:min-h-[44px]` がカード内ボタンの 44px 床を**復元できていない**（実測 26px）ことが判明した。`data-sm` 属性を外すと 44px に戻ることを実機で確認。原因は CSS specificity:
- `pillBtnSm` の床打ち消し `data-[sm]:max-sm:min-h-0` → セレクタ `.<class>[data-sm]` = **(0,2,0)**
- 親スコープ床回復 `[&>button]:max-sm:min-h-[44px]` → セレクタ `.<parent> > button` = **(0,1,1)**

属性セレクタは class 級の重みを持つため (0,2,0) > (0,1,1) となり、打ち消し側が勝つ。ADR-004 が前提とした「子結合子で specificity が上がる」は誤りで、属性セレクタ 1 つには勝てない。同様に P43 入力の `max-sm:h-11`（単一 class (0,1,0)）も `INPUT_CLASS` の `h-10` と同 specificity で生成順に負けて 39px 止まりだった。なお参照元の `publication/styles.ts` `LINK_MINI_ROW`（#588）も buttons が `data-sm` を持つため**同じ潜在バグを抱えている**（本 Issue のスコープ外、Phase 4 で別 Issue 化を検討）。

### Decision
mobile（`max-sm:`）限定で `!important` を付与し、specificity 勝負を回避して確定的に勝たせる。
- アクション行・操作行・P43 値列: `[&>button]:max-sm:min-h-[44px]!`
- P43 キー/値入力: `max-sm:h-11!`

`!important` だが `max-sm:` で囲われているため desktop の高密度ボタン（24px）・入力高には一切影響しない。`styles.ts` の既存 ADR が警告する「同 specificity の生成順依存」を `!important` で明示的に断ち切るのは、容認された確定化手段。

### Consequences
- 良い点: 44px 床が実機で確定（specificity・生成順に非依存）、desktop 非回帰（`max-sm:` スコープ）、ブラウザ検証で実測再確認できる。
- トレードオフ: `!important` の使用。ただし mobile スコープ限定かつ打ち消し対象が明確なため副作用は閉じている。`LINK_MINI_ROW` の同種バグは別 Issue 候補として残す。
