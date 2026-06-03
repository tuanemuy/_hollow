# ADR — Issue #442: styles.ts 外に残るローカルボタン定義（ghost destructive / small / surface / HEADER_CTA）を common へ統一

本 Issue は #425 のフォローアップで、#425 が「視覚一致する受け皿が無い」として据え置いた SSOT 外ローカルボタン定義を回収する。共通の許容変化（active:scale 付与・transition duration 落ち・anchor ガード整備）は #416/#425 ADR を踏襲し、ここでは #442 固有の新 variant 設計判断を中心に記録する。

---

## ADR-001: `pillBtnGhostDanger` で base の active 背景を error-surface に上書きする（押下グレー回帰の回避）

### Status
Proposed

### Context
common に新設する ghost destructive variant は、元のローカル定義（`bg-transparent text-ink-secondary hover:not-disabled:bg-error-surface hover:not-disabled:text-error`）を `data-[ghost-danger]:` 化して再現する。一方 base `pillBtn` は
`active:not-disabled:not-aria-disabled:bg-surface-hover`（押下時にグレーの surface-hover を塗る）を持つ。ghost-danger に hover の error-surface 上書きだけを足すと、押下中（`:active`）に base の `bg-surface-hover` が当たり、赤(error-surface)が一瞬グレーに打ち消される視覚回帰になる。元のローカル定義は active 指定を持たず（押下色変化なし）、base 継承の active グレーは元には無かった挙動。

### Decision
`pillBtnGhostDanger` に `data-[ghost-danger]:active:not-disabled:not-aria-disabled:bg-error-surface` と `…:text-error` を含め、押下時も error 系を維持する。variant utility は base の素 active utility より生成 CSS 順で後に並ぶため後勝ちする（#273 ADR-003 と同じ機構）。これにより hover も active も error-surface + error text で一貫し、押下グレー回帰を防ぐ。

最終的な定義:
```
data-[ghost-danger]:bg-transparent
data-[ghost-danger]:text-ink-secondary
data-[ghost-danger]:hover:not-disabled:not-aria-disabled:bg-error-surface
data-[ghost-danger]:hover:not-disabled:not-aria-disabled:text-error
data-[ghost-danger]:active:not-disabled:not-aria-disabled:bg-error-surface
data-[ghost-danger]:active:not-disabled:not-aria-disabled:text-error
```

### Consequences
- 良い点: 押下時もグレーに化けず error 色を維持。ghost-danger が common SSOT に乗り、DesignTokensForm / PromptsForm の 4 ローカル定義（うち PromptsForm の 2 つは文字列同一）を 1 variant に集約できる。
- トレードオフ: 元のローカル定義は active 色を持たなかったため、push 時に hover 色（error-surface）が active でも続く点は微変化。ただし hover と同色なのでマウス操作上ほぼ判別不能。`active:scale` 付与とあわせ ADR-002 で許容として記録。生成 CSS とブラウザ（押下保持）で後勝ちを確認する。

---

## ADR-002: ghost destructive / HEADER_CTA に base 継承で付く active:scale を許容する（意図的視覚変化）

### Status
Proposed

### Context
base `pillBtn` は `active:not-disabled:not-aria-disabled:scale-[0.985]` + `motion-reduce:active:scale-100` を持つ。DesignTokensForm / PromptsForm の ghost destructive ローカル定義および landing `HEADER_CTA` は押下 scale を持たない。common へ寄せると base 継承で付く。

### Decision
base 継承で付与する。#416 ADR-003 / #425 ADR-002 と完全に同一論点。#273 で共通系 ~28 ボタンに付与済みで「全 pill の押下フィードバック統一」が確立済み方針であり、これらのボタンだけ無いのはむしろ不統一。`motion-reduce:active:scale-100` で reduced-motion は無効化。

### Consequences
- 良い点: 押下フィードバックが全 pill で統一される。
- トレードオフ: 当該ボタンの押下挙動が微変化（0.985 倍）。reduced-motion では無効。

---

## ADR-003: `pillBtnSm` は縮小方向のため `data-[sm]:` variant 化する（生成 CSS 順の制約）

### Status
Proposed

### Context
DesignTokensForm の `BTN_SM_CLASS` は h-7 / px-3 / text-xs。base `pillBtn` は h-9 / px-4 / text-sm。#416 ADR-005 は「size add-on を素 utility で重ねられるのは拡大方向のみ。縮小方向は素 utility では base より前に出て負け、`data-[…]:` variant 化が必須」とした。`pillBtnTall`（拡大方向）は素 utility で成立したが、small は縮小方向。

### Decision
`pillBtnSm` を `data-[sm]:` 駆動 variant とする（`data-[sm]:h-7 data-[sm]:px-3 data-[sm]:text-xs`）。本 Issue 着手時の生成 CSS（`dist/client/assets/index-D3uRbCpB.css`）でバイトオフセットを実測し、縮小方向が負けることを確認した:
- `.h-7`(15225) < `.h-9`(15289) — 素 `h-7` は base `h-9` より前に出て負ける。
- `.px-3`(26931) < `.px-4`(27018) — 素 `px-3` は base `px-4` より前に出て負ける。
- text は `.text-sm`(30282) < `.text-xs`(30466) で素 `text-xs` は一見勝つが、これは現ビルドのクラス集合に依存する不安定な並びであり、`data-[sm]:text-xs` で variant 化すれば集合に依らず確実に勝つ。

したがって 3 プロパティすべてを `data-[sm]:` 化する。

注記（stale build）: 上記オフセットは着手時ビルドの**素 utility**（h-*, px-*, text-*）の値で、これらは安定しているため流用できる。ただし当該ビルドは data-variant pill 機構の導入前で `data-[primary]` / `data-[danger]` / `active:scale` を生成 CSS に含まない。**新設する data-variant（`data-[ghost-danger]:active:…` / `data-[sm]:*`）の後勝ちはこの旧 CSS で検証できない**ため、必ず `pnpm build` のフレッシュ CSS で確認する（手順 6）。

### Consequences
- 良い点: #416 ADR-005 の縮小方向制約の初の実適用。縮小サイズが SSOT に乗り、再利用可能になる。`data-[sm]:` 化で生成 CSS 順に依存せず確実に後勝ち。
- トレードオフ: small variant は素 utility add-on にできず variant 必須（#416 ADR-005 が予告した通り）。`gap` は `pillBtnTall` 同様に上書きしない（base `gap-1.5` はテキストのみボタンで無害、#416 ADR-001）。

---

## ADR-004: `pillBtnSm` で base のモバイルタップ下限 `max-sm:min-h-[44px]` を打ち消す（small ボタン膨らみ回帰の回避）

### Status
Proposed

### Context
base `pillBtn` は `max-sm:min-h-[44px]`（モバイル幅のタップターゲット最小高さ、#425 ADR-003）を持つ。small ボタンは h-7（28px）で、これに min-h-44px が当たるとモバイル幅で 28px → 44px に膨らむ。元の `BTN_SM_CLASS` は min-h を持たず、行内に 2 つの h-8 input と並ぶ密なレイアウトに収まっていたため、44px への膨らみは明確な視覚回帰になる。

### Decision
`pillBtnSm` に `data-[sm]:max-sm:min-h-0` を含め、small ボタンに限ってタップ下限を打ち消す。素 utility での実測は `.min-h-0`(16073) < `.min-h-[44px]`(16108) で、素 `min-h-0` は base に**負ける**（ADR-003 の h-7/px-3 と同じ縮小方向の罠）。`data-[sm]:max-sm:` の variant スタック（data 属性 + ブレークポイント）は variant 層（`max-sm` 層は実測 60050 帯）に出るため base 素 utility 帯（15000〜30000）より後に並び後勝ちする。`pnpm build` のフレッシュ CSS で確認する。

a11y 観点では h-7 のタップターゲットが 44px を下回るが、(1) これらは密な行内補助操作（行の削除/既定に戻す）で元々 28px、(2) 元のローカル定義も min-h を持たなかった、(3) 本 Issue は SSOT 化が目的で a11y 改善はスコープ外、のため元の寸法を保つことを優先する。タップ下限の底上げは別途検討事項とする。

### Consequences
- 良い点: small ボタンがモバイルで元の h-7（28px）を保ち、視覚回帰ゼロ。
- トレードオフ: small ボタンはモバイルタップ下限（44px）を満たさない。ただし元から満たしておらず本 Issue で悪化はしない。a11y 改善は将来の別 Issue に委ねる。

---

## ADR-005: ローカル定義が持っていた duration/ease 明示指定を落として base の素 transition-colors に寄せる（意図的視覚変化）

### Status
Proposed

### Context
DesignTokensForm の `BTN_BASE` / `BTN_SM_CLASS` と PromptsForm の `BTN_GHOST_CLASS` / `BTN_DESTRUCTIVE_CLASS` は `duration-[var(--duration-fast)]`（120ms）と `ease-[var(--ease-standard)]` を明示指定している。common `pillBtn` base は素の `transition-colors`（Tailwind デフォルト 150ms / `cubic-bezier(0.4,0,0.2,1)`）。寄せると明示指定が落ちる。

### Decision
base の素 `transition-colors` に寄せる。#425 ADR-001 と完全に同一論点・同一結論。ease は `--ease-standard` と Tailwind デフォルトが同一カーブで視覚差ゼロ。duration は 120ms → 150ms の 30ms 差で color transition では知覚困難。SSOT 化が目的であり明示指定の温存は意義を薄める。

### Consequences
- 良い点: transition が全 pill で統一され、明示トークン指定の重複が消える。
- トレードオフ: 厳密には transition duration が 30ms 伸びる（軽微）。回帰ゼロ厳守なら add-on で再表明する逃げ道はあるが SSOT 化の趣旨に反するため採らない。
