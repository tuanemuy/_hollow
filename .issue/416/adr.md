# ADR — Issue #416: auth ボタン系統 (BTN_*) を common pill primitive へ統一する

## ADR-001: 縦長サイズを common の size add-on variant として切り出す

### Status
Proposed

### Context
auth の `BTN_PRIMARY` / `BTN_PRIMARY_INLINE` / `BTN_SECONDARY_TALL` は `h-12`、`BTN_SECONDARY` は `h-11`。common `pillBtn` の base 寸法は `h-9`。SSOT 化にあたり、寸法差を (a) auth 固有の合成に寸法をベタ書きする、(b) common 側に size add-on variant を切り出す、のどちらで扱うか。

### Decision
(b) を採る。common に `pillBtnTall`（`h-12 px-8 text-md`）を新設し、`${pillBtn} ${pillBtnTall} ${pillBtnPrimary}` の合成で表現する。#273 ADR-001 補足が「別サイズが要れば common 側 variant で足す」を既定方針にしており、その縦長版にあたる。`BTN_SECONDARY`(h-11) は死蔵で削除するため、足すサイズは h-12 一種で済む。`w-full`(PRIMARY) / `min-w-[200px]`(INLINE, TALL) はレイアウト固有差分として各定数の合成末尾に残す。

`gap` は add-on に含めない。base `pillBtn` は `gap-1.5` を持つが、(1) `gap-0` を足しても gap utility は数値昇順で CSS 出力されるため base `gap-1.5` より前に出て後勝ちできず（#273 ADR-003 の罠）、(2) auth ボタンは全てテキストのみ（flex 子要素なし）で `gap-1.5` は視覚的に無害。したがって `gap-0` は「効かない上書き」かつ「不要な指定」なので入れない。

### Consequences
- 良い点: 縦長 pill が common SSOT に乗り、auth 以外でも再利用可能になる。狭い住所での再多系統化を防ぐ。
- トレードオフ: `pillBtnTall` の同一プロパティ素 utility（h-12/px-8/text-md）が base（h-9/px-4/text-sm）を上書きできるかは生成 CSS 順依存（#273 ADR-003 の既知挙動）。`pnpm build` の生成 CSS で後勝ちを確認する。後勝ちしない場合は `data-[tall]:` variant 化でフォールバックする（ADR-005 の制約も参照）。

---

## ADR-002: disabled opacity を 60 から base の 55 へ寄せる（意図的視覚変化）

### Status
Proposed

### Context
auth `BTN_*` は `disabled:opacity-60`、common `pillBtn` base は `disabled:opacity-55`。視覚回帰ゼロを厳守するなら add-on で `disabled:opacity-60` を再表明する必要があるが、SSOT 化の意義が薄れる。

### Decision
base の `opacity-55` に寄せる。透過率差 5% は知覚上ほぼ判別不能であり、umbrella #336 が掲げる「disabled opacity の 55/60 統一」の方向に合致する。視覚回帰ゼロを一点崩す意図的変化として本 ADR に記録し、testing.md でブラウザ確認する。

### Consequences
- 良い点: disabled 表現が全 pill で統一される。
- トレードオフ: 厳密には視覚回帰（軽微）。回帰ゼロを厳守したい場合は add-on で `disabled:opacity-60` を再表明する逃げ道がある。

---

## ADR-003: active:scale 押下フィードバックを base 継承で付与する（意図的視覚変化）

### Status
Proposed

### Context
common `pillBtn` base は `active:not-disabled:not-aria-disabled:scale-[0.985]` + `motion-reduce:active:scale-100` を持つが、auth `BTN_*` は押下アニメを持たない。寄せると auth ボタンにも押下 scale が付く。

### Decision
base 継承で付与する。#273 が共通系 ~28 ボタンに既に付与済みで「全 pill の押下フィードバック統一」が確立済み方針。auth ボタンだけ無いのはむしろ不統一。`motion-reduce:active:scale-100` で reduced-motion は無効化される。軽微な意図的視覚変化として記録する。

### Consequences
- 良い点: 押下フィードバックが全 pill で統一される。
- トレードオフ: auth ボタンの挙動が微変化（押下時 0.985 倍）。reduced-motion では無効。

---

## ADR-004: aria-disabled 対応は base 継承のみで consumer 側追加はしない（YAGNI）

### Status
Proposed

### Context
common `pillBtn` base は `<a>`(=`<Link>`) 向けに `aria-disabled:opacity-55 aria-disabled:cursor-not-allowed` と `not-aria-disabled:` ガードを内包する（#152 ADR-001）。auth `BTN_*` は `disabled:` のみで anchor の disabled 表現に非対応。auth には `<Link>` consumer が多数ある。

### Decision
base へ寄せるだけで anchor の disabled 表現契約が無償で整う。現状 auth の `<Link>` consumer は一つも disabled/aria-disabled にならない（grep で `aria-disabled` 出現ゼロを確認）ため、consumer 側に `aria-disabled` を新たに付与する作業はしない（YAGNI）。

### Consequences
- 良い点: auth 系の積年の弱点（anchor の disabled 非対応）が無償で解消され、将来 disabled な `<Link>` が必要になっても base が対応済み。回帰なし（純粋な capability 追加）。
- トレードオフ: なし。

---

## ADR-005: size add-on を素 utility で重ねられるのは「拡大方向」のみという制約

### Status
Proposed

### Context
ADR-001 で `pillBtnTall` を素 utility（`h-12 px-8 text-md`）の add-on として base に重ねる。同一プロパティの素 utility 同士は Tailwind の生成 CSS 順（class 文字列順ではない）で勝敗が決まる（#273 ADR-003）。`pillBtnPrimary`/`pillBtnDanger` が `data-[primary]:`/`data-[danger]:` と variant 化されているのはこの問題への対処であり、素 utility のまま重ねる本 add-on がなぜ成立するのかを明文化しないと、将来別サイズを足すとき同じ罠を踏む。

### Decision
`pillBtnTall` の各 utility が後勝ちする理由を 2 種類に区別して記録する（生成 CSS のバイトオフセット実測に基づく）:

- **spacing スケール（h-*, px-*）**: 標準 spacing は数値昇順で出力される（h-9 < h-12、px-4 < px-8）。したがって「base より**大きい**値の add-on は後に出て後勝ち」する。逆に **base より小さい値（縮小方向）の size add-on は base より前に出て負ける** — 縮小サイズが必要になったら素 utility では足りず `data-[size]:` variant 化が必須。
- **カスタムトークン（text-md）**: base 側の `text-sm` も add-on 側の `text-md` も `@theme inline`（`index.css`）由来のカスタムトークン。後勝ちは「標準 vs カスタム」ではなく、同じ `@theme inline` ブロック内で `--text-md` が `--text-sm` より後に宣言されている順序による（生成 CSS で `.text-sm` < `.text-md` を実測確認）。数値の大小には依存しないが、宣言順に依存する点に注意。

本 Issue の `pillBtnTall` は h-12/px-8（いずれも拡大方向）＋ text-md（カスタムトークン）なので素 utility のまま安全。これは `pnpm build` の生成 CSS で確認する。

### Consequences
- 良い点: 「size add-on を素 utility で足してよいのは拡大方向のみ」という非自明な制約が明文化され、#273 ADR-003 の教訓の正しい一般化になる。将来の縮小サイズ追加時の事故を防ぐ。
- トレードオフ: 縮小方向の size variant が必要になった場合は素 utility では実現できず variant 化が要る（本 Issue の範囲外）。
