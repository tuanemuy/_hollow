# ADR — Issue #633: モバイルボタンのサイズ整合性改善

## ADR-001: 指針からタッチターゲットの具体 px 値を撤廃し、意図 + WCAG 参照に改める

### Status
Accepted

### Context
`spec/design/index.md`（§3 / §7.1 / 寸法ノーマライズ節 / 行225）が「タッチで押し間違えない」という意図ではなく `44 × 44px` / `24 × 24px` という具体 px 値と `max-sm:min-h-[44px]` という具体実装手段を SSOT として規定していた。この値が実装・モックの各所に直書きで散在し、整合性が取りづらくなっていた（Issue #633 の根本原因）。

過去の判断 #292(ADR-003)・#425(ADR-003)・#589(ADR-007) はいずれもこの「指針が px を持つ」前提の上に積まれている。

### Decision
指針本文から具体 px 値と実装手段の明示を撤廃する。残すのは:
- 意図: 「タッチで押し間違えないターゲットを確保する」。
- WCAG 二段の考え方と**条文番号への参照**（譲れない床 = 2.5.8 Target Size (Minimum) AA、望ましい目標 = 2.5.5 Target Size (Enhanced) AAA）。具体 px は条文が規定する値に委ね、指針本文には書かない。
- 適用方針: タッチ主体（モバイル / `pointer: coarse`）では目標を確保し、デスクトップ専用の密度優先 UI（admin 等）は床を許容する（AA 未満は不可）。
- 実装手段は「モバイルのタッチ床を共通化して一箇所で管理する」とだけ述べ、指針本文に実装側の定数名（`TOUCH_TARGET` 等の固有名詞）は書かない。spec はプロジェクトの正（SSOT）であり、実装が spec を参照する向きが本来。spec が実装の定数名に依存すると定数リネームで spec が陳腐化するため、依存方向を逆転させない。

### Consequences
- 良い点: 指針が値を持たなくなり、値の SSOT が実装側の定数1点（`common/styles.ts` の `TOUCH_TARGET`）に集約される。指針と実装の二重管理が解消。spec → 実装の依存方向も保たれる。
- トレードオフ: WCAG 条文番号を読者が引かないと具体値がわからない。ただし「意図のみ示す」という Issue ゴールに合致し、条文参照で根拠は保てる。

---

## ADR-002: ボタン実高を input(`h-10`=40px) に統一する（案2）

### Status
Accepted

### Context
desktop で `fieldControl`(input) は `h-10`(40px)、`pillBtn` は `h-9`(36px) で 4px ずれ、横並びで下端が不揃いだった。モバイルでは一律 `min-h-[44px]` 床により `pillBtn` が 36→44(8px) 膨張し密度が崩れていた。#461（寸法ノーマライズ）は input 40 / ボタン 36 の二系統を許容していた。

選択肢:
- 案1: 実高据え置き（h-9）、床を定数化のみ。SSOT 化は満たすが 4px ずれ・膨張は残る。
- 案2: `pillBtn` を `h-10`(40px) に上げ input と揃える。
- 案3: `min-h` 床を撤廃し padding ベースで実高44を出す。padding 方式は文字数・折返しで高さが揺れ整合が逆に崩れ、全ボタンの padding を mobile 分岐する大改修。

### Decision
案2 を採用（ユーザー確認済み）。`pillBtn` を `h-10`(40px) に統一。`pillBtnIcon` は正方形維持のため `w-9`→`w-10`。タッチ床は WCAG AAA 目標として `min-h-[44px]` を共通定数で維持（モバイル膨張は 40→44 の4pxに圧縮）。

`pillBtnTall`(h-12)・auth(`h-11`)・public ヒーロー(h-12)・admin 高密度(`h-7`) は役割差として据え置き。`fieldControl` は `h-10` 据え置き。

### Consequences
- 良い点: desktop 4px ずれ解消、モバイル膨張幅の圧縮、input とボタンの標準高さ統一。
- トレードオフ: 全アプリのピルボタン高さが 36→40 に変わる視覚変更。#461 の「input 40 / ボタン 36」二系統の判断を上書きする（`spec/design/index.md` の寸法ノーマライズ節を「input とボタンの標準高さを `h-10` に統一」へ改訂）。

---

## ADR-003: 小型ボタンの「44px 床解除」を opt-in に反転する（案C）

### Status
Accepted

### Context
`pillBtnSm` は base で `data-[sm]:max-sm:min-h-0` により床を解除していた（admin 密度優先のため、#292 ADR-005）。その結果、カードなどで床を復元したい場面で specificity 衝突が起き、`[&>button]:max-sm:min-h-[44px]!` の `!important` 床回復（#589 ADR-007）が増殖していた。例外が「散在する床解除」と「散在する !important 回復」の二重構造になっていた。

### Decision
案C を採用（ユーザー確認済み）。床解除を base から外し、**デフォルトの小型ボタンはモバイルで44床を持つ**。admin の高密度行アクションなど *デスクトップ密度を取りたい文脈でのみ*、明示的な `pillBtnSmDense`（床解除を含む opt-in 変種）を付与する。`!important` 床回復群（Jobs / UsersTable / DesignTokensForm）を撤去する。

**`pillBtnSm` / `pillBtnSmDense` の確定契約**:
- `pillBtnSm` = `"data-[sm]:h-7 data-[sm]:px-3 data-[sm]:text-xs"`（床解除トークン `data-[sm]:max-sm:min-h-0` を**除去**）。
- `pillBtnSmDense` = `pillBtnSm` のサイズ変種 ＋ `data-[sm]:max-sm:min-h-0`（床解除トークンの所在をここ1箇所に集約）。
- どちらも `data-[sm]:` 変種で発火するため、消費側は `data-sm=""` を**必ず維持**する（属性を外すと `data-[sm]:h-7` 等のサイズ変種ごと無効化される）。CLAUDE.md の data-* 規約（statically-on は `data-x=""`）に従う。
- specificity: 新デフォルト小型ボタンは base 床 (0,1,0) のみで競合相手が消えるため生成順依存に陥らない。`pillBtnSmDense` の `data-[sm]:max-sm:min-h-0` (0,2,0) は base (0,1,0) に確定的に勝つ（ADR-007 が `!important` を要した「同一バリアントスタック同士の衝突」とは構造が異なり、`!important` 撤去が成立する）。

### Consequences
- 良い点: 例外が「散在する床解除 + 散在する !important 回復」から「明示的な密度 opt-in 1種」に集約。`!important` 負債を撤去でき、ネットの複雑度が下がる。
- 波及（非 admin の `pillBtnSm` 消費者）: `identity/styles.ts`（`BTN_SM` / `BTN_SM_DANGER`）と `publication/PublishSettings` の `pillBtnSm` 利用箇所は、モバイルで 36→44 に膨張する。これは案C が意図する正しい挙動（これらは admin ではなくタッチ主体の文脈）であり、`pillBtnSmDense` には切り替えない。
- 潜在バグ解消: `publication/styles.ts` の `LINK_MINI_ROW` が #589 ADR-007 で抱えていた「`[&>button]:max-sm:min-h-[44px]` が `data-[sm]:max-sm:min-h-0` に負ける latent bug」は、床解除トークンが消えることで base 床が普通に効くようになり自動解消する。冗長化した床回復は撤去する。
- トレードオフ: admin 行アクション側の呼び出し数箇所に `pillBtnSmDense` 付与が必要。付与漏れがあるとその箇所がモバイルで44に膨張する（実機検証で確認）。
- WCAG: `pillBtnSm` h-7=28px は AA 床24を満たすため、密度 opt-in 側も AA は維持。

---

## ADR-004: 実装中に確定した細部判断

### Status
Accepted

### Context
Step 2 / Step 3b の実装中、plan / 既存 ADR で具体形が未確定だった2点について判断を下した。

### Decision

1. **`pillBtnIcon` の `min-w` 床は定数化せずインライン維持**: `pillBtnIcon` のタッチ床は `data-[icon]:max-sm:min-w-[44px]` のように `data-[icon]:` バリアントで包む必要がある（icon-only のときだけ正方形床を足す構造）。`TOUCH_TARGET_SQUARE`（= `max-sm:min-w-[44px] max-sm:min-h-[44px]`、バリアント接頭辞なし）をそのまま展開すると `data-[icon]:` スコープが外れ、かつ `min-h` は base `pillBtn` の `TOUCH_TARGET` と二重になる。したがって `pillBtnIcon` の `min-w` 床は定数参照に置き換えず、`data-[icon]:max-sm:min-w-[44px]` のインライン記述を維持する（44px の SSOT は `TOUCH_TARGET_SQUARE` 側に集約され、pillBtnIcon はそれに整合する値を持つ、という関係）。`WysiwygEditor` / `dialogCloseButton` 等の「バリアント接頭辞を持たない正方形ボタン」は `TOUCH_TARGET_SQUARE` をそのまま参照する。

2. **admin `DesignTokensForm` の高密度 input は床を解除（撤去）**: 旧実装の `INPUT_CLASS ... h-8 max-sm:min-h-[44px]!`（`!important` 床回復）について、admin はデスクトップ密度優先（§3 で AA 床まで許容）であり、行アクションボタンを `pillBtnSmDense`（モバイルでも `h-7` 密度維持＝床解除）に揃えた。整合のため同じ行の高密度 input（`h-8`=32px）もモバイル床を撤去し（`max-sm:min-h-[44px]!` を削除）、admin の高密度を一貫させる。`h-8`=32px は AA 床24を満たすため WCAG 上も妥当。

### Consequences
- `pillBtnIcon` の `min-w` がインラインに残るが、値は `TOUCH_TARGET_SQUARE` と一致し、`data-[icon]:` スコープを壊さない。
- admin `DesignTokensForm` の input/ボタンがモバイルでも高密度を保ち、admin 全体（Jobs / UsersTable / DesignTokensForm）で密度方針が一貫する。AA 床は維持。
