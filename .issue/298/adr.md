# ADR — Issue #298: rounded グレー背景パネルと Button 背景色が同化している

## ADR-001: 衝突解消はパネル側を `bg-surface-elevated` へ昇格する（ボタン側は変えない）

### Status
Accepted

### Context

`bg-surface`(#f5f5f7) のパネル上に、同じく `bg-surface` をデフォルト背景に持つ `pillBtn`・チップ・`fieldControl` が乗り、デフォルト（hover 前）状態で境界が消失している。Issue の修正方針候補は 3 つ:

1. Button のデフォルト背景を別トークンに分離
2. パネル側のボーダー強調（`border-hairline` → `border-hairline-strong`）
3. Button の hover 背景をデフォルトに繰り上げる

調査で判明した制約:

- `pillBtn`（`app/components/common/styles.ts`）は約 28 ファイル・白ページ上の大多数のボタンが参照する SSOT。デフォルト背景を変えると、衝突していない大多数の画面（白背景上のボタン）に視覚回帰が波及する。
- `spec/design/tokens.md` は `--color-surface`(#f5f5f7) を「入力欄・ボタン背景」、`--color-surface-elevated`(#fbfbfd) を「浮上カード」と**用途を明記**している。つまり「カード状パネル＝elevated、ボタン/入力＝surface」がトークン設計上の本来の使い分け。
- 実際に衝突しているのは 3 つのノートパネルのみ（admin `DesignTokensForm` は `bg-bg`(白) カードで衝突なし）。

### Decision

**候補1の変形として、衝突している 3 パネルの背景を `bg-surface` → `bg-surface-elevated` へ昇格する**。`pillBtn` 等のボタン側デフォルト背景は変更しない。

- 候補1（原文: ボタン背景を変える）を採らない理由: 波及が約 28 ファイルに及び、衝突していない白背景画面に回帰が出る。
- 候補2（ボーダー強調）を併用しない理由: 3 パネルはすでに `border-hairline` を持ち、明度差が付けば境界は十分回復する。tokens.md §6「区切りは原則ヘアラインで」を超えてボーダーを強める必要がない。回帰最小化のため単独施策に絞る。
- 候補3（hover をデフォルト化）を採らない理由: ホバー状態 (`bg-surface-hover`) がデフォルトになるとインタラクションの affordance（ホバーで色が変わるフィードバック）を失う。
- 明度の向き: surface(#f5f5f7) より elevated(#fbfbfd) は**明るい**。Apple Calm は「カードがほんのり浮上＝より明るい」が自然で、パネル昇格はデザイン方針に合致（白 > elevated（カード）> surface（カード上のコントロール）の階調）。

### Consequences

- 良い点:
  - 波及は 3 ファイルのパネル背景クラスのみ。全画面ボタンへの影響ゼロ。
  - tokens.md の `surface-elevated`=「浮上カード」用途定義に実装を寄せる規約整合の修正。
  - 新トークン不要（既存 `bg-surface-elevated` ユーティリティへの付け替えのみ）。
- トレードオフ:
  - elevated と surface の明度差は約 4% と控えめ。境界はヘアラインと併せて担保する。極端な低コントラスト環境ではブラウザ確認で見え方を検証する。

---

## ADR-002: admin `DesignTokensForm` は対応しない（Issue 記載が実装と乖離）

### Status
Accepted

### Context

Issue 本文は影響箇所として `app/components/admin/DesignTokensForm/index.tsx` の「`CARD_CLASS` + `pillBtn` 併用」を挙げている。

### Decision

調査の結果、`CARD_CLASS`（L39）は `border border-hairline rounded-lg p-5 bg-bg mb-5` で背景は **`bg-bg`（白）**。`bg-surface` ではない。白カード上の `bg-surface`(#f5f5f7) ボタンは既に明度差があり衝突していないため、**本 Issue では対応しない**。

### Consequences

- 良い点: 過剰修正を避け、衝突していない画面に不要な変更を入れない。
- トレードオフ: Issue 本文の記載と実装の乖離。本 ADR と plan.md のスコープ欄に明記し、レビュー時の誤判定を防ぐ。
