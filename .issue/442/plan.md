# 実装計画 — Issue #442: styles.ts 外に残るローカルボタン定義（ghost destructive / small / surface / HEADER_CTA）を common へ統一（#336 フォローアップ）

**Issue:** #442
**作成日:** 2026-06-03
**複雑度:** 中〜大規模

---

## 目的

#425 のフォローアップ。styles.ts 外に残る SSOT 外のローカルボタン定義（A. ghost destructive / B. small / C. surface / D. landing HEADER_CTA）を common pill primitive へ寄せきり、ボタンの SSOT 化を完了させる。A・B は common に新 variant（`pillBtnGhostDanger` / `pillBtnSm`）を新設してから寄せる。C・D は既存 primitive で寄せられる軽微なもの。寄せきると DesignTokensForm の `BTN_BASE` / `BTN_SM_*` ローカル定義と landing `HEADER_CTA` が消える。視覚回帰は #416/#425 同様に生成 CSS とブラウザで確認する。

## スコープ

### 含まれるもの
- common `app/components/common/styles.ts` に **2 つの新 variant** を新設（既存 JSDoc スタイルに揃える）:
  - `pillBtnGhostDanger`（`data-[ghost-danger]:` 駆動の ghost destructive）
  - `pillBtnSm`（`data-[sm]:` 駆動の縮小サイズ）
- DesignTokensForm の以下を common へ寄せる:
  - `BTN_CLASS`（surface）→ 素の `pillBtn`（C）
  - `BTN_DESTRUCTIVE_CLASS`（ghost destructive h-9）→ `${pillBtn} ${pillBtnGhostDanger}` + `data-ghost-danger=""`（A）
  - `BTN_SM_DESTRUCTIVE_CLASS`（ghost destructive h-7）→ `${pillBtn} ${pillBtnGhostDanger} ${pillBtnSm}` + `data-ghost-danger="" data-sm=""`（A+B 合成）
  - 上記により参照が消えた `BTN_BASE` / `BTN_SM_CLASS` を削除
- PromptsForm の `BTN_GHOST_CLASS` / `BTN_DESTRUCTIVE_CLASS`（両方 ghost destructive h-9・文字列同一）→ `${pillBtn} ${pillBtnGhostDanger}` + `data-ghost-danger=""`（A）
- landing `HEADER_CTA`（accent pill h-9）→ `${pillBtn} ${pillBtnPrimary}` + `data-primary=""`（D・`pillBtnTall` なしの h-9 版）

### 含まれないもの
- 既存の `pillBtnPrimary` / `pillBtnDanger` / `pillBtnTall` 等の挙動変更（参照のみ）
- DesignTokensForm / PromptsForm / LandingPage 内のボタン以外の要素（INPUT_CLASS / CARD_CLASS / HEADER_LINK 等）への手入れ
- filled danger（`pillBtnDanger`）の利用箇所変更（本 Issue の対象は ghost destructive であり filled とは別物）
- **本 Issue が列挙しない他ファイルの SSOT 外ローカルボタン定義**（`app/components/admin/UsersTable/index.tsx` / `Jobs/index.tsx` の `BTN_SM_CLASS`＝surface small、`LLMSettingsForm/index.tsx` の `BTN_CLASS`＝surface h-9）。#442 本文の named scope（DesignTokensForm / PromptsForm / LandingPage の4対象）外。本 Issue で新設する `pillBtnSm`（surface small も `${pillBtn} ${pillBtnSm}` で表現可）・素 `pillBtn`（surface）が受け皿になるため、#336 umbrella の次フォローアップとして Phase 4 で起票候補にする。

## 実装ステップ

### 1. common に `pillBtnGhostDanger` を新設（A の受け皿）

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:** `pillBtnDanger` の直後に、`data-[ghost-danger]:` 駆動の ghost destructive variant を追加する。

  ```ts
  /**
   * Append for ghost-danger pill button — drives "data-ghost-danger" variant.
   *
   * Unlike `pillBtnDanger` (a *filled* chip: error-surface background at rest),
   * this is a *ghost* destructive button — transparent at rest with secondary
   * ink text, turning to error-surface + error text only on hover/active. Used
   * for low-emphasis destructive actions (reset / delete rows) where a
   * permanently red chip would be too loud.
   *
   * Apply as `` `${pillBtn} ${pillBtnGhostDanger}` `` with `data-ghost-danger=""`,
   * mirroring `pillBtnDanger`. The `data-[ghost-danger]:` variant is required
   * for the same reason as `pillBtnDanger`: same-property utilities are resolved
   * by Tailwind's generated-CSS order, not class-string order, so variant
   * utilities (which sort after base utilities) win deterministically over the
   * base `bg-surface` / `text-ink`. See `.issue/273/adr.md` ADR-003.
   *
   * The base's `active:…:bg-surface-hover` is also overridden here
   * (`data-[ghost-danger]:active:…:bg-error-surface`) so that pressing the
   * button does not momentarily flash the gray base hover/active color over the
   * error-surface — see `.issue/442/adr.md` ADR-001.
   */
  export const pillBtnGhostDanger =
    "data-[ghost-danger]:bg-transparent data-[ghost-danger]:text-ink-secondary data-[ghost-danger]:hover:not-disabled:not-aria-disabled:bg-error-surface data-[ghost-danger]:hover:not-disabled:not-aria-disabled:text-error data-[ghost-danger]:active:not-disabled:not-aria-disabled:bg-error-surface data-[ghost-danger]:active:not-disabled:not-aria-disabled:text-error";
  ```

- **理由:** 元のローカル定義（`bg-transparent text-ink-secondary hover:not-disabled:bg-error-surface hover:not-disabled:text-error`）を `data-[ghost-danger]:` 化して再現する。base の `bg-surface`/`text-ink` を確実に上書きするには variant 化が必須（#273 ADR-003）。base には `active:not-disabled:not-aria-disabled:bg-surface-hover` があり、押下時に hover の error-surface をグレーで打ち消す回帰が出るため、active bg/text も error 系へ上書きする（ADR-001）。元のローカル定義に無かった `active:scale-[0.985]` は base 継承で付くが、#425 ADR-002 と同じ扱いで許容（ADR-002 に記録）。

### 2. common に `pillBtnSm` を新設（B の受け皿）

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:** `pillBtnTall` の直後に、`data-[sm]:` 駆動の縮小サイズ variant を追加する。

  ```ts
  /**
   * Small size add-on for pill buttons — drives "data-sm" variant.
   *
   * Overrides the base `h-9 / px-4 / text-sm` with `h-7 / px-3 / text-xs` and
   * cancels the base mobile tap-target floor (`max-sm:min-h-[44px]`).
   *
   * Unlike `pillBtnTall` (an enlarging add-on usable as plain utilities), this
   * is a *shrinking* size, so plain utilities lose: same-property utilities are
   * resolved by generated-CSS order, and the smaller `h-7` / `px-3` sort
   * *before* the base `h-9` / `px-4` and therefore cannot override them. The
   * `data-[sm]:` variant sorts after the base utilities and wins
   * deterministically. See `.issue/416/adr.md` ADR-005 (shrink-direction
   * constraint) and `.issue/442/adr.md` ADR-003.
   *
   * `gap` is intentionally not overridden (the base `gap-1.5` is harmless for
   * text-only small buttons; mirrors `pillBtnTall`, #416 ADR-001).
   *
   * Apply by appending after the other variants, e.g.
   * `` `${pillBtn} ${pillBtnGhostDanger} ${pillBtnSm}` `` with
   * `data-ghost-danger="" data-sm=""`.
   */
  export const pillBtnSm =
    "data-[sm]:h-7 data-[sm]:px-3 data-[sm]:text-xs data-[sm]:max-sm:min-h-0";
  ```

- **理由:** 元の `BTN_SM_CLASS`（h-7 px-3 text-xs）を再現する。縮小方向のため素 utility では後勝ちできず（生成 CSS 実測で `.h-7`(15225)<`.h-9`(15289)、`.px-3`(26931)<`.px-4`(27018) を確認＝負ける）、`data-[sm]:` 化が必須。base の `max-sm:min-h-[44px]` は h-7（28px）に対し膨らみ回帰になる（元の `BTN_SM_CLASS` は min-h を持たない）ため `data-[sm]:max-sm:min-h-0` で打ち消す（ADR-004）。

### 3. DesignTokensForm のローカル定義を common へ寄せ、`BTN_BASE`/`BTN_SM_CLASS` を削除

- **対象ファイル:** `app/components/admin/DesignTokensForm/index.tsx`
- **変更内容:**
  - import を更新: `pillBtn, pillBtnPrimary` に `pillBtnGhostDanger, pillBtnSm` を追加。
  - 定数定義（32-40 行）の `BTN_BASE` / `BTN_CLASS` / `BTN_DESTRUCTIVE_CLASS` / `BTN_SM_CLASS` / `BTN_SM_DESTRUCTIVE_CLASS` を削除する。
  - C（surface, 291 行「＋ トークンを追加」`<button>`）: `className={BTN_CLASS}` → `className={pillBtn}`（素の pillBtn = surface base と視覚一致）。
  - A（ghost destructive h-9, 301 行「すべてリセット」`<button>`）: `className={BTN_DESTRUCTIVE_CLASS}` → `className={`${pillBtn} ${pillBtnGhostDanger}`}` + `data-ghost-danger=""` を付与。
  - A+B（ghost destructive h-7, 275 行 行内「削除/既定に戻す」`<button>`）: `className={BTN_SM_DESTRUCTIVE_CLASS}` → `className={`${pillBtn} ${pillBtnGhostDanger} ${pillBtnSm}`}` + `data-ghost-danger="" data-sm=""` を付与。
- **理由:** surface/ghost-danger/small が全て common に移るため `BTN_BASE` の参照が消え削除できる（#425 ADR-006 が「将来フォローアップ」とした回収）。これでこのファイルからローカルボタン定義が消える（submit primary は #425 で既に寄せ済み）。
- **注意:** ADR-001（duration/ease 落ち）と同様、寄せると `BTN_BASE` が持っていた `duration-[var(--duration-fast)] ease-[var(--ease-standard)]` の明示指定が落ち base の素 `transition-colors` になる（#425 ADR-001 と同一の許容変化）。本 Issue でも ADR に記録する。

### 4. PromptsForm の ghost destructive 2 定数を common へ寄せる

- **対象ファイル:** `app/components/admin/PromptsForm/index.tsx`
- **変更内容:**
  - import を更新: `pillBtn, pillBtnPrimary` に `pillBtnGhostDanger` を追加。
  - 定数定義（78-81 行）の `BTN_GHOST_CLASS` / `BTN_DESTRUCTIVE_CLASS` を削除する（両者は文字列完全同一の ghost destructive h-9）。
  - 「この項目をリセット」`<button>`（233 行 `className={BTN_GHOST_CLASS}`）→ `className={`${pillBtn} ${pillBtnGhostDanger}`}` + `data-ghost-danger=""`。
  - 「すべてのプロンプトをリセット」`<button>`（306 行 `className={BTN_DESTRUCTIVE_CLASS}`）→ 同上。
- **理由:** 両定数とも DesignTokensForm の ghost destructive h-9 と同一視覚で、新 `pillBtnGhostDanger` で完全に表現できる。文字列同一の 2 定数を 1 つの common variant に集約することで SSOT 化と重複解消。
- **注意:** ステップ 3 と同じ duration/ease 落ちが発生（#425 ADR-001 と同一の許容変化）。

### 5. landing `HEADER_CTA` を common primary へ寄せる

- **対象ファイル:** `app/components/landing/LandingPage.tsx`
- **変更内容:**
  - `HEADER_CTA` 定数（27-28 行）を削除する。
  - ヘッダーの「アカウント作成」`<Link>`（118 行 `className={HEADER_CTA}`）→ `className={`${pillBtn} ${pillBtnPrimary}`}` + `data-primary=""`。
  - import は既に `pillBtn, pillBtnPrimary` を含むため追加不要。
- **理由:** `HEADER_CTA`（h-9 px-4 rounded-pill bg-accent text-white hover:bg-accent-hover）は h-9 の accent pill であり、`HERO_BTN_*`（h-12, `pillBtnTall` 付き）の h-9 版。`pillBtnTall` を付けない `${pillBtn} ${pillBtnPrimary}` がちょうど h-9 accent pill になる。これで landing から SSOT 外の accent pill 定義が消える。
- **注意:** base 継承で `active:scale-[0.985]`・`gap-1.5`・`max-sm:min-h-[44px]`・anchor 向け `aria-disabled` ガード等が付く（#425 ADR-002/003/004 と同一の許容変化・capability 追加）。`HEADER_CTA` は hover ガード（`not-disabled:not-aria-disabled:`）が無かったが base 継承で整う（#425 ADR-004 と同じく回帰なしの capability 追加）。

### 6. 検証（typecheck / lint / format / 生成 CSS / ブラウザ）

- `pnpm typecheck && pnpm lint:fix && pnpm format` を実行。
- `pnpm build` で生成 CSS を作り、新 variant の data-* utility が base utility より後に出ること（後勝ち）を確認する。特に `data-[ghost-danger]:active:…:bg-error-surface` が base の `active:…:bg-surface-hover` を上書きできるか、`data-[sm]:h-7`/`px-3`/`text-xs` が base を上書きできるか、`data-[sm]:max-sm:min-h-0` が `max-sm:min-h-[44px]` を打ち消せるかを確認する。
- ブラウザで各ボタンの通常 / hover / active / disabled / モバイル幅を目視確認する（testing.md 参照）。

## 設計判断

詳細は `.issue/442/adr.md` を参照。

- **ADR-001:** `pillBtnGhostDanger` で base の `active:…:bg-surface-hover` を `data-[ghost-danger]:active:…:bg-error-surface` で上書きし、押下時のグレー打ち消し回帰を防ぐ。
- **ADR-002:** ghost destructive / HEADER_CTA に base 継承で付く `active:scale-[0.985]` 等は #425 ADR-002 と同じ扱いで許容。
- **ADR-003:** `pillBtnSm` は縮小方向のため `data-[sm]:` variant 必須（#416 ADR-005 の制約を生成 CSS 実測で再確認）。
- **ADR-004:** `pillBtnSm` で base の `max-sm:min-h-[44px]` を `data-[sm]:max-sm:min-h-0` で打ち消す（small ボタンの膨らみ回帰回避）。
- **ADR-005:** duration/ease 明示落ち（DesignTokensForm / PromptsForm のローカル定義が持っていた `duration-fast`/`ease-standard`）は #425 ADR-001 と同一の許容変化。

## リスクと注意点

- **生成 CSS 順依存（最重要）:** 新 variant の後勝ちは class 文字列順でなく生成 CSS 順で決まる。data-* variant utility は素 utility の後に並ぶため原理上勝つはずだが、`pnpm build` の実 CSS で必ず確認する。負ける場合は #273/#416 の方針どおり variant のセレクタ強化で対処。
- **`text-md` line-height 非ペア問題は本 Issue では無関係:** `pillBtnSm` は `text-xs` を使う。base の `text-sm` も variant の `text-xs` も同じく line-height プロパティを宣言する（`line-height:var(--tw-leading,var(--text-*--line-height))`、実値未定義なので `normal` 相当に解決）ため、`data-[sm]:text-xs` が base の line-height を完全に上書きでき、片側だけ残留する宣言は生じない。#416 ADR-005[W-001] が問題視した `text-md` は font-size のみで line-height 宣言を吐かないケースであり、本件とは構造が逆（残留問題は起きない）。
- **active flash 回帰（ghost-danger）:** base の active bg を上書きしないと押下時グレーが一瞬出る。ADR-001 で active bg/text を error 系に上書きして対処。生成 CSS とブラウザ（マウス押下保持）で確認必須。
- **min-h 打ち消し（small）:** `data-[sm]:max-sm:min-h-0` が `max-sm:min-h-[44px]` を後勝ちできるか（同一プロパティ min-height、variant 化で勝つはず）をモバイル幅で確認。
- **disabled 状態:** ghost destructive ボタンは `disabled` 時に元は `disabled:opacity-disabled disabled:cursor-not-allowed` を持つ。base `pillBtn` も同じ `disabled:opacity-disabled disabled:cursor-not-allowed`（opacity-55）を持つため回帰なし。DesignTokensForm 行内ボタン・各リセットボタンは `disabled` 条件で頻繁に無効化されるため、disabled 表示を必ず確認する。
- **data-* 属性形式:** 本 Issue の variant は静的に常時オンなので `data-ghost-danger=""` / `data-sm=""`（静的オン形式、ADR-003 / CLAUDE.md Styling 規約）が正しい。`data-x={value || undefined}` は使わない。

## テスト方針

- 自動: `pnpm typecheck`・`pnpm lint:fix`・`pnpm format`・`pnpm test:unit`（既存テストの非回帰）。
- 生成 CSS: `pnpm build` 後、新 variant の後勝ちをバイトオフセットで確認。
- ブラウザ: testing.md の手順で DesignTokensForm（surface「＋追加」/ ghost「すべてリセット」/ 行内 small ghost「削除・既定に戻す」）、PromptsForm（「この項目をリセット」/「すべてのプロンプトをリセット」）、landing ヘッダー「アカウント作成」の通常 / hover / active / disabled / モバイル幅を目視確認。寄せ前後でスクリーンショット比較。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスクの2視点）

**確認した点（問題点ゼロ）**:
- 要件カバレッジ: A（ghost destructive 4 箇所）/ B（small）/ C（surface + BTN_BASE 削除）/ D（HEADER_CTA）すべて計画に網羅。スコープ外の改善なし。
- 削除対象定数の参照を全数確認: `BTN_BASE` は BTN_CLASS/BTN_DESTRUCTIVE_CLASS のみが参照（両方置換）→ 削除安全。`BTN_SM_CLASS` は BTN_SM_DESTRUCTIVE_CLASS のみが参照（置換）→ 削除安全。**standalone な small 非破壊ボタンは存在しない**ため `pillBtnSm` は常に `pillBtnGhostDanger` と合成される（設計と一致）。各 className の call site も 1 対 1 で確認。
- アーキ整合: data-* 駆動 variant + 生成 CSS 順での後勝ち（#273/#416 機構）に厳密準拠。`data-ghost-danger=""`/`data-sm=""` の静的オン形式が CLAUDE.md Styling 規約どおり。
- ghost destructive の call site は全て `<button>`（`not-aria-disabled:` ガードは inert・回帰なし）、HEADER_CTA は `<Link>` だが `pillBtnPrimary` は既に HERO_BTN_PRIMARY（`<Link>`）で実証済み。

**修正/補強した点**:
- ADR-003 の `text-xs` 順序記述を実測値（`.text-sm` < `.text-xs`）に基づいて正確化（font-size は素 utility でも勝つが、集合依存の不安定な並びのため variant 化で確実化する旨を明記）。h-7/px-3 は素 utility で負ける（実測 `.h-7`<`.h-9`, `.px-3`<`.px-4`）ため variant 必須は確定。

両視点とも問題点ゼロで終了。

### 2周目（メイン側 2視点並列レビュー — 要件カバレッジ / アーキ・リスク）

**両視点とも問題点ゼロ（要修正レベルの欠陥なし）。** 取り込んだ改善提案:
- アーキ S-001（事実誤認の是正・結論不変）: line-height 残留が起きない**真の機序**を正確化。「base の `text-sm` も variant の `text-xs` も line-height プロパティを宣言するので `data-[sm]:text-xs` が完全上書きでき片側残留が生じない」。#416 が問題視した `text-md`（font-size 単独・line-height 非宣言）とは構造が逆である旨をリスク注記に反映。
- アーキ S-002: 着手時ビルドが data-variant 機構導入前の stale build であり、新 variant の後勝ち検証にはオフセット流用不可（fresh build 必須）である旨を ADR-003 に注記。
- アーキ S-003: ADR-004 に `.min-h-0`(16073) < `.min-h-[44px]`(16108) の実測を追加（素 `min-h-0` は負ける＝ variant 必須の論拠を ADR-003 と同粒度に）。
- 要件 S-001（スコープ外の追跡）: 他3ファイル（UsersTable / Jobs の `BTN_SM_CLASS`、LLMSettingsForm の `BTN_CLASS`）に同種の SSOT 外定義が残る。本 Issue named scope 外として「含まれないもの」に明記し、`pillBtnSm` / 素 `pillBtn` が受け皿になるため Phase 4 で #336 フォローアップ起票候補とする。

**見送った提案**: なし（全提案が in-scope の品質補強または追跡明記で取り込み）。

両視点とも問題点ゼロのため 2周目で終了。
