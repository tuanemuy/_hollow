# ADR — Issue #417: public 画面のボタン系統を common へ統一する

## ADR-001: GATE_SUBMIT を `pillBtnTall`（h-12）へ寄せる

### Status
Accepted

### Context
`GATE_SUBMIT` は旧 `w-full h-11 mt-2 ... text-[15px]` の full-width accent 送信ボタン。common 合成へ寄せる際、サイズを base `pillBtn`(h-9) のままにするか、`pillBtnTall`(h-12 px-8 text-md) を採るかが論点。GATE_INPUT は `h-11` のため、送信ボタンを h-12 にすると input より 4px 高くなる。

### Decision
`pillBtnTall` を採用し `${pillBtn} ${pillBtnTall} ${pillBtnPrimary} w-full mt-2` とする。auth surface は #416 で同型の full-width accent 送信ボタンを `BTN_PRIMARY = ${pillBtn} ${pillBtnTall} ${pillBtnPrimary} w-full` に統一済みで、しかも auth `INPUT` は `h-11`・送信ボタンは `h-12`。本 gate と同じ「input h-11 + submit h-12」の縦リズムが auth で既に確立・マージされており、それに揃えるのが SSOT として一貫する。`text-[15px]`→`text-md` も #416 と同じ意図的差分。`mt-2` は size/variant と非競合の固有差分として末尾に残す。なお `text-md` は font-size のみで line-height ペアを持たないため合成時の line-height は base `text-sm`(≈1.43) が残る（#416 ADR-005 [W-001]）が、`h-12 inline-flex items-center` の単一行中央寄せのため auth 同様 gate でも視覚的に無害。

### Consequences
- 良い点: auth と完全に同じ合成パターンになり、accent 送信ボタンの SSOT が public/auth 横断で揃う。
- トレードオフ: GATE_SUBMIT 高さが h-11→h-12（4px 増）。auth に同型先例があり許容範囲。ブラウザで gate フォームの縦リズムを確認する。
- `pillBtnTall` の素 utility（h-12/px-8/text-md）が base（h-9/px-4/text-sm）を上書きできるかは生成 CSS 順依存（#416 ADR-005 の「拡大方向のみ勝てる」制約）。h-9→h-12 は拡大方向なので成立するが `pnpm build` で確認する。

---

## ADR-002: press scale / disabled ガードの新規付与を意図的差分として受容

### Status
Accepted

### Context
common `pillBtn` には `active:scale-[0.985]`（+ `motion-reduce:active:scale-100`）の押下フィードバックと、`disabled:opacity-55`・`aria-disabled:*`・`not-disabled:not-aria-disabled:` の hover/active 抑止ガードが内包される。旧 public 3 定数にはこれらが（全部または一部）欠落していた。#336 ADR-002 はまさにこの「public への新規視覚変化」を避けるために据え置きを選んだ。

### Decision
press scale・disabled ガードの新規付与を受け入れる。これは #336 ADR-002 が本 Issue（#417）へ切り出した残務そのものであり、#273 ADR-001 / #416 ADR-002,003 が authenticated/auth surface で確立した統一方針を public へ展開する。GATE_SUBMIT の `disabled:opacity-60`→`disabled:opacity-55` も同方針の軽微変化。

加えて、primary ボタン（SEARCH_FORM_BUTTON / GATE_SUBMIT）には `pillBtnPrimary` 経由で **press 時に `bg-accent-pressed`（accent より暗い背景色）への変化** も新規付与される。旧 public primary ボタンは `hover:bg-accent-hover` のみで active 背景色を持たなかったため、これも意図的差分。scale と異なり色変化は reduced-motion で無効化されないが、押下中のみの一過性の暗色化であり、統一方針（#273/#416 の primary press feedback）の一部として受容する。

### Consequences
- 良い点: public ボタンの挙動が common と一致し、press feedback・disabled 表現が無償で整う。umbrella #336 のボタン統一が完結する。
- トレードオフ: 未認証ユーザーに新規の押下アニメが見える（reduced-motion では無効）。意図的差分として受容し、ブラウザ検証で確認する。

---

## ADR-003: danger variant・consumer 側 aria-disabled は追加しない（YAGNI）

### Status
Accepted

### Context
common には `pillBtnDanger`（`data-[danger]:` variant）と、anchor 向けの `aria-disabled:*` ガードがある。public ボタンに append すべきか。

### Decision
追加しない。grep の結果 public に danger pill consumer は存在せず、disabled 状態の public `<Link>` も存在しない。`pillBtnDanger` の append・consumer への `aria-disabled` 追加は将来 public で実際に必要になるまで足さない。#416 ADR-004 の YAGNI 判断を踏襲。base `pillBtn` の `aria-disabled:` 契約は consumer が将来 `aria-disabled` を付けた時点で無償で機能する。

### Consequences
- 良い点: 余計な variant を public 定数に持ち込まず、現状の需要に最小一致。
- トレードオフ: 将来 public に破壊操作 pill / disabled Link が必要になったら、その時点で `pillBtnDanger` append・`aria-disabled` 付与を行う。base 側が対応済みなので追加は局所的で済む。

---

## ADR-004: SEARCH_FORM_BUTTON は配置を垂直中央寄せ化して `max-sm:min-h-[44px]` 回帰を構造的に解消する

### Status
Accepted

### Context
base `pillBtn` は `max-sm:min-h-[44px]`（モバイルのタップ領域確保）を持つ。`SEARCH_FORM_BUTTON` は `SEARCH_FORM_INPUT`(`h-12`=48px) 内に旧 `absolute right-1.5 top-1.5`(6px 固定オフセット) で配置される。モバイル幅でボタン高さが 44px に膨らむと固定オフセットのままでは 6+44=50px となり input 下端を 2px はみ出す。旧定数は `min-h` を持たず、これは非意図的回帰になりうる。

当初の対策案「定数末尾に `max-sm:min-h-0` を append して base の `max-sm:min-h-[44px]` を打ち消す」は **不採用**。レビューで指摘されたとおり、`min-h-0` は `min-h-[44px]` に対し縮小方向（0 < 44px）であり、#416 ADR-005 が明文化した「size 系素 utility が base を上書きできるのは拡大方向のみ。縮小方向は生成 CSS 順で base より前に出て負ける」制約にそのまま該当する（ビルド済み CSS でも `.min-h-0` が `.min-h-[44px]` より前に出力されることを実測確認）。打ち消しは機能しない公算が高い。

### Decision
回帰は「打ち消し」ではなく **配置の垂直中央寄せ化** で構造的に解消する。consumer 側の配置を `top-1.5`（固定オフセット）から `top-1/2 -translate-y-1/2`（垂直中央寄せ）へ変更する。中央配置なら、ボタン高さが 36px(PC) でも 44px(モバイル, min-h 発火) でも `h-12`(48px) の input 内に常に収まり（44px 中央配置で上下 2px 余白）、固定オフセットのような片側はみ出しが起きない。中央寄せは同ファイルの `SEARCH_FORM_ICON`（`top-1/2 -translate-y-1/2`）で既に確立済みのパターンであり、新規概念を持ち込まない。

### Consequences
- 良い点: CSS カスケード順と戦わず、ボタン高さに依存しない堅牢な配置になる。base 合成（press feedback / disabled ガード / accent variant の SSOT 化）を維持したまま回帰を解消でき、Issue のゴール（common 寄せ）を後退させない。
- トレードオフ: モバイルでボタンが 44px に膨らむと中央寄せでも input 高さ 48px の大半を占める。視覚的に窮屈に見えないかをモバイル幅で実機確認する（崩れではなく見た目の最終確認）。
