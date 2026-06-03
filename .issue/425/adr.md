# ADR — Issue #425: styles.ts 外のローカルボタン定義 (admin BTN_PRIMARY_CLASS / landing HERO_BTN_*) を common pill primitive へ統一する

本 Issue は #416（auth `BTN_*` 統一・`pillBtnTall` 新設）のほぼクローン。primitive（`pillBtn` / `pillBtnTall` / `pillBtnPrimary` / `pillBtnDanger`）は #416 で整備済みで、common/styles.ts への新規追加は無い。共通論点は #416 ADR を参照し、ここでは #425 固有の差分を中心に記録する。

---

## ADR-001: admin の duration/ease 明示指定を落として base の素 transition-colors に寄せる（意図的視覚変化・#425 固有）

### Status
Proposed

### Context
admin の `BTN_PRIMARY_CLASS`（および `BTN_BASE`）は `transition-colors` に加えて `duration-[var(--duration-fast)]`（= 120ms）と `ease-[var(--ease-standard)]` を明示指定している。common `pillBtn` base は素の `transition-colors` のみ（Tailwind デフォルトで duration 150ms、timing-function は `cubic-bezier(0.4, 0, 0.2, 1)`）。SSOT へ寄せると admin ボタンの明示 duration/ease が落ちる。landing `HERO_BTN_*` は元々 duration/ease を明示しておらず影響なし。

### Decision
base の素 `transition-colors` に寄せる（明示 duration/ease を再表明しない）。

- **ease は不変**: Tailwind デフォルトの `cubic-bezier(0.4, 0, 0.2, 1)` は `--ease-standard` と同一カーブ。視覚差ゼロ。
- **duration のみ 120ms → 150ms**: 30ms の差は color transition において知覚上ほぼ判別不能。SSOT（~28 ボタン）への統一そのものが目的であり、明示指定を温存すると SSOT 化の意義が薄れる。

視覚回帰ゼロを一点崩す軽微な意図的変化として記録し、ブラウザで確認する。

### Consequences
- 良い点: admin ボタンの transition が全 pill と統一される。明示トークン指定の重複が消える。
- トレードオフ: 厳密には transition duration が 30ms 伸びる（軽微）。回帰ゼロを厳守したい場合は add-on で `duration-[var(--duration-fast)]` を再表明する逃げ道があるが、SSOT 化の趣旨に反するため採らない。

---

## ADR-002: active:scale 押下フィードバックを base 継承で付与する（意図的視覚変化）

### Status
Proposed

### Context
common `pillBtn` base は `active:not-disabled:not-aria-disabled:scale-[0.985]` + `motion-reduce:active:scale-100` を持つが、admin `BTN_PRIMARY_CLASS` / landing `HERO_BTN_*` は押下 scale を持たない。寄せると付く。

### Decision
base 継承で付与する。#416 ADR-003 と同一論点。#273 が共通系 ~28 ボタンに既に付与済みで「全 pill の押下フィードバック統一」が確立済み方針。これらのボタンだけ無いのはむしろ不統一。`motion-reduce:active:scale-100` で reduced-motion は無効化される。

### Consequences
- 良い点: 押下フィードバックが全 pill で統一される。
- トレードオフ: 当該ボタンの挙動が微変化（押下時 0.985 倍）。reduced-motion では無効。

---

## ADR-003: max-sm:min-h-[44px] モバイルタップターゲット下限を base 継承で付与する（意図的 a11y 改善・#425 固有）

### Status
Proposed

### Context
common `pillBtn` base は `max-sm:min-h-[44px]` を持つ（モバイルのタップターゲット最小寸法）。admin `BTN_PRIMARY_CLASS` は h-9（= 36px）で、この下限を持たない。landing `HERO_BTN_*` は h-12（= 48px）で下限以上。

### Decision
base 継承で付与する。admin ボタンは max-sm（モバイル幅）で 36px → 44px に拡張され、タップターゲットの a11y 下限を満たす。landing は h-12 で 48px のため `min-h-[44px]` は inert（実害・実効果なし）。意図的な a11y 改善として記録する。

### Consequences
- 良い点: admin ボタンがモバイルで WCAG タップターゲット下限を満たす。
- トレードオフ: admin ボタンの max-sm 高さが 36px → 44px に変化（デスクトップは h-9 のまま不変）。a11y 改善方向の意図的変化。

---

## ADR-004: aria-disabled 対応は base 継承のみで consumer 側追加はしない（YAGNI）

### Status
Proposed

### Context
common `pillBtn` base は anchor（`<Link>`）向けに `aria-disabled:opacity-disabled aria-disabled:cursor-not-allowed` と `not-aria-disabled:` ガードを内包する（#152 ADR-001）。landing `HERO_BTN_*` は `<Link>` consumer だが現状 `hover:`/`active:` にガードが無く、disabled 表現にも非対応。

### Decision
#416 ADR-004 と同一。base へ寄せるだけで anchor の disabled 表現契約と not-disabled/not-aria-disabled ガードが無償で整う。現状 landing の `<Link>` は disabled/aria-disabled にならないため、consumer 側に `aria-disabled` を新たに付与する作業はしない（YAGNI）。

### Consequences
- 良い点: landing の hover/active ガード欠落（Issue 本文が明記する解消ポイント）が無償で解消され、将来 disabled な `<Link>` が必要になっても base が対応済み。純粋な capability 追加で回帰なし。
- トレードオフ: なし。

---

## ADR-005: DesignTokensForm の ghost destructive を pillBtnDanger に寄せない（視覚回帰回避・#425 固有）

### Status
Proposed

### Context
DesignTokensForm の `BTN_DESTRUCTIVE_CLASS` / `BTN_SM_DESTRUCTIVE_CLASS` は **ghost destructive**:
`bg-transparent text-ink-secondary hover:not-disabled:bg-error-surface hover:not-disabled:text-error`
（通常時は透明背景＋二次テキスト色、hover で初めて error 色になる）。
一方 common `pillBtnDanger` は **filled**:
`data-[danger]:bg-error-surface data-[danger]:text-error data-[danger]:hover:not-disabled:not-aria-disabled:bg-error-surface`
（通常時から error-surface 背景＋error テキストの chip）。
Issue 本文は「`pillBtnDanger`（DesignTokensForm の destructive 相当）も既に common にある」と書くが、実コードを読むと **ghost vs filled で視覚が一致しない**。

### Decision
ghost destructive を `pillBtnDanger` に寄せない（スコープ外とする）。filled へ寄せると通常状態の見た目が transparent → error-surface に変わる**明確な視覚回帰**になる。本 Issue の named scope は「BTN_PRIMARY_CLASS / HERO_BTN_*」であり、視覚回帰ゼロ原則に従って primary のみを寄せる。ghost destructive を SSOT 化したい場合は別途 ghost variant（`pillBtnGhostDanger` 等）の新設が要り、それは本 Issue の範囲外（別フォローアップ）。

### Consequences
- 良い点: DesignTokensForm の destructive 見た目が完全に保たれる（視覚回帰ゼロ）。
- トレードオフ: ghost destructive は SSOT 外のローカル定義として残る。共通化は将来の ghost variant 整備に委ねる。

---

## ADR-006: DesignTokensForm の small/surface 系と BTN_BASE を残置し、primary のみ最小差分で寄せる（スコープ限定・#425 固有）

### Status
Proposed

### Context
DesignTokensForm は `BTN_BASE` を土台に `BTN_CLASS`（surface）/ `BTN_PRIMARY_CLASS`（primary）/ `BTN_DESTRUCTIVE_CLASS`（ghost destructive）を合成し、別途 `BTN_SM_CLASS`（h-7）/ `BTN_SM_DESTRUCTIVE_CLASS` も持つ。`BTN_PRIMARY_CLASS` を抜いた後、残りをどこまで触るかを決める必要がある。

- `BTN_CLASS`（surface, `bg-surface text-ink hover:not-disabled:bg-surface-hover`）は視覚的に pillBtn の surface base と一致する。
- `BTN_SM_CLASS`（h-7 px-3 text-xs）は pillBtn（h-9）と寸法が違い、common に small variant（`pillBtnSm` 等）は未整備。
- `BTN_BASE` は primary を抜いても surface / destructive がなお参照する。

### Decision
**primary（`BTN_PRIMARY_CLASS`）のみを `${pillBtn} ${pillBtnPrimary}` + `data-primary=""` へ寄せ、他は残置する。**

- **surface（`BTN_CLASS`）**: pillBtn と視覚一致するが Issue の named scope 外。スコープを広げず残置。
- **small（`BTN_SM_*`）**: 寸法（h-7）の受け皿が common に無い。寄せると寸法回帰、新設はスコープ拡大。残置。
- **BTN_BASE**: surface / destructive がなお参照するため削除すると壊れる。残置（`BTN_PRIMARY_CLASS` 行のみ削除）。

named scope（BTN_PRIMARY_CLASS / HERO_BTN_*）に忠実に、視覚回帰ゼロで最小差分の寄せに留める。

### Consequences
- 良い点: 視覚回帰ゼロ（surface 寸法一致、small・BTN_BASE は不変）。スコープが Issue の named target に収まる。
- トレードオフ: DesignTokensForm 内で「common pillBtn 系（submit primary）」と「ローカル BTN_BASE 系（surface/destructive/small）」が混在する。surface/small/ghost destructive の SSOT 化は将来フォローアップに残る。
