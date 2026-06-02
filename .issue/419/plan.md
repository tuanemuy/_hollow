# 実装計画 — Issue #419: ボタン/リンクの focus-visible リング統一と disabled opacity (55/60) 正規化（#336 フォローアップ）

**Issue:** #419
**作成日:** 2026-06-03
**複雑度:** 中〜大規模

---

## 目的

全ボタン/リンクに一貫した focus-visible リングを付与し、disabled opacity を 1 値へ正規化する（トークン化できるなら `tokens.css` 経由）。a11y 横断課題（umbrella #336 の子）。

## 前提認識（重要）

Issue 本文は #336 plan 作成時点の認識（「pillBtn / BTN_* / PILL_BTN / NAV_ITEM / TREE_ITEM_LINK 系はいずれも focus-visible リングを持たない」）に基づくが、**現状コードでは `app/styles/index.css` 165-169 行のグローバル `:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: inherit; }` 規則（#293/#297 で導入）で、全 focusable 要素にフォーカスリングが既に統一適用されている**。

したがって本Issueの実体は次の2点になる:

1. **focus ring**: グローバル規則が全ボタン/リンクに実際に効いていることをブラウザ検証し、阻害されている箇所があれば是正する（新規に要素単位の `focus-visible:` を撒くのは SSOT/DRY 違反なので原則しない）。
2. **disabled opacity**: 実態は 3 値（`opacity-50` / `opacity-55` / `opacity-60`）に分散。これを 1 値（`0.55`）へ正規化し、`tokens.css` にトークン化する。

## スコープ

### 含まれるもの
- グローバル focus ring の全ボタン/リンク適用の検証 + 欠落是正（あれば）
- `disabled:` / `aria-disabled:` / 意味的に disabled な `data-[disabled]:` の opacity を `0.55` に正規化
- `--opacity-disabled` トークンを `tokens.css` に新設、`@theme inline` で橋渡し（または任意値記法で SSOT 参照）
- `spec/design/tokens.md` への反映

### 含まれないもの
- #331（disabled 中の hover 無効化を pill 以外へ適用）— 別Issue
- `data-[discarded]:opacity-*`（破棄済みジョブ）、`data-[pending]:opacity-*`（楽観的UI 保留中）— disabled とは別概念の state opacity。正規化対象外
- focus ring の方式変更（box-shadow → outline 等）や新トークン新設 — `--shadow-focus` が既に SSOT として機能

## 実装ステップ

### 1. focus ring のグローバル適用を検証
- **対象ファイル:** 検証のみ（`app/styles/index.css` の `:focus-visible` 規則）
- **変更内容:** dev サーバを起動し Tab キーで pillBtn / 各 BTN_* / PILL_BTN / NAV_ITEM / TREE_ITEM_LINK / public 系リンクへフォーカス移動。`box-shadow: var(--shadow-focus)` のリングが各形状（pill / md / full）で `border-radius: inherit` に追従して表示されることを目視。**`USER_MENU_ITEM`（layout/styles.ts:44）と `ACTIONS_MENU_ITEM`（directory/styles.ts:52）も検証対象に含める** — 両者は `<button role="menuitem">` でありながら `outline-none` + `focus:bg-surface` を持つが、グローバルリングは `box-shadow` 由来で `outline-none` では抑止されないため、box-shadow リングは表示されるはず（roving tabindex + `focus:bg-surface` と併存）。
- **理由:** グローバル規則が既にあるため、欠落を証明できない限り要素ごとに `focus-visible:` を足すのは規約違反。

### 2. （検証で欠落が出た場合のみ）欠落箇所を是正
- **対象ファイル:** 欠落が出た要素の styles 定数
- **変更内容:** 第一候補は阻害要因（誤った `outline-none` 等）の除去。要素単位で足す必要があれば `dialogCloseButton` / `NoteCheckbox.tsx` と同じ `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`（円形は `focus-visible:outline-offset-2`）パターンに揃える。
- **理由:** 既存の2 override パターンに合わせ新方式を増やさない。ボタン/リンクは `outline-none` を持たないため通常は是正不要の見込み。

### 3. disabled opacity トークンを `tokens.css` に新設
- **対象ファイル:** `app/styles/tokens.css`
- **変更内容:** 末尾付近（Motion / Breakpoints セクションの近傍）に新規 `/* State */` コメントブロックを追加し `--opacity-disabled: 0.55;` を定義。tokens.css には既存の "State" セクションが無いため新設する。
- **理由:** CLAUDE.md「token は tokens.css が SSOT」。散在値を 1 箇所に集約。

### 4. Tailwind 側でトークンを利用可能にする
- **対象ファイル:** `app/styles/index.css` の `@theme inline` ブロック
- **変更内容:** `--opacity-disabled: var(--opacity-disabled);` を追加し `opacity-disabled` utility を生成。
- **理由:** CLAUDE.md「@theme inline で bridge」。
- **裏取り済み:** Tailwind v4 の opacity utility は `themeKeys: ["--opacity"]` を参照する正規 namespace のため、`--opacity-disabled` から `opacity-disabled` utility が生成され `opacity: 0.55` を素の値で出力する（`@theme` 経路では 0–1→% 変換は走らない）。**第一候補（theme bridge）がそのまま通る**。万一生成されなければ `disabled:opacity-[var(--opacity-disabled)]` の任意値記法にフォールバック（どちらも SSOT は tokens.css）。実装時に採用記法を ADR に確定記録。

### 5. 全 disabled/state opacity を正規化値へ置換
`opacity-55`（値据え置き・トークン参照化）:
- `app/components/common/styles.ts`（pillBtn の disabled/aria-disabled、dialogCloseButton、fieldControl）
- `app/components/layout/styles.ts`（USER_MENU_ITEM）
- `app/components/directory/styles.ts`（ACTIONS_MENU_ITEM）
- `app/components/view/SavedViewsList/styles.ts`（textAction, fixBtn, renameInput）
- `app/components/note/editor/WysiwygEditor.tsx`（toolbar btn）
- `app/components/note/list/BulkActionBar.tsx`

`opacity-60` → `0.55`（見た目が僅かに変わる）:
- `app/components/auth/styles.ts`（CALLOUT_ACTION）
- `app/components/public/styles.ts`（GATE_SUBMIT）
- `app/components/admin/LLMSettingsForm/index.tsx`（disabled input）
- `app/components/note/editor/InlineEditor.tsx`（`data-[disabled]:` — 意味的に disabled なので対象）

`opacity-50` → `0.55`（admin pill ボタン群）:
- `app/components/admin/DesignTokensForm/index.tsx`、`Jobs/index.tsx`、`LLMSettingsForm/index.tsx`（btn 2箇所）、`PromptsForm/index.tsx`（3箇所）、`RegistrationForm/index.tsx`、`UsersTable/index.tsx`

- **変更内容:** 各 `disabled:opacity-50/55/60`・`aria-disabled:opacity-55`・意味的 `data-[disabled]:opacity-60` を `disabled:opacity-disabled`（または `disabled:opacity-[var(--opacity-disabled)]`）に統一。
- **理由:** disabled opacity の 1 値正規化（Issue ゴール）。

### 6. スコープ外 state opacity の据え置き
- **対象:** `IngestionJobRow.tsx`（`data-[discarded]:opacity-60`）、`NoteListViews.tsx`（`data-[pending]:opacity-60`）
- **変更内容:** 据え置き。ADR に「disabled opacity の正規化対象は disabled / aria-disabled / 意味的 data-[disabled] に限る」と境界を明記。
- **理由:** discarded / pending は disabled とは別概念の state。スコープ外。

### 7. spec/design ドキュメントへ反映
- **対象ファイル:** `spec/design/tokens.md`
- **変更内容:** `--opacity-disabled` を追記。focus ring §10 は既に「全インタラクティブ要素共通」と記載済みのため変更不要。
- **理由:** tokens.md は tokens.css の mirror（SSOT 整合）。

### 8. ADR を記録
- **対象ファイル:** `.issue/419/adr.md`
- **変更内容:** (a) focus ring はグローバル `:focus-visible` で統一済みであり要素単位付与はしない判断 + 円形小要素の outline override 維持理由、(b) disabled opacity を 0.55 に正規化・トークン化した判断と採用記法、(c) discarded/pending を対象外とした境界。

### 9. 検証
- `pnpm typecheck && pnpm lint:fix && pnpm format` → `pnpm test`
- `grep -rn "opacity-50\|opacity-55\|opacity-60" app/`（`app/components` 限定でなく `app/` 全体 — `app/routes/` 配下の style 定数も対象）で、**据え置き対象 2 件（`IngestionJobRow.tsx` の `data-[discarded]:opacity-60`、`NoteListViews.tsx` の `data-[pending]:opacity-60`）のみがヒットし、それ以外の disabled 系 opacity は残存 0 件**であることを確認（「0 件」ではなく「据え置き 2 件のみ」が期待値）。
- ブラウザ目視: disabled ボタンの淡色統一、Tab フォーカスでリング表示。

## 設計判断

詳細は `.issue/419/adr.md` を参照。要約:
- focus ring はグローバル `:focus-visible` box-shadow を正とし要素単位で撒かない。円形小要素のみ outline override 維持。
- disabled opacity 正規化値は `0.55`（採用箇所最多・中心 primitive pillBtn の現行値・回帰最小）。
- トークン化する（`--opacity-disabled`）。Tailwind utility 生成が不確実なら任意値記法へフォールバック。

## リスクと注意点
- `outline-none` 競合: `USER_MENU_ITEM`（layout:44）/ `ACTIONS_MENU_ITEM`（directory:52）は `<button role="menuitem">` でありながら `outline-none` を持つが、グローバルリングは `box-shadow` 由来のため `outline-none` では抑止されず、リングは表示される（是正不要）。input 系の `outline-none` も同様にリングは box-shadow が担う。よって focus ring を阻害する要因は無い。
- 視覚回帰: 50→55（濃く）/ 60→55（薄く）で disabled 表示が僅かに変化。機能影響なし。admin / auth / public を目視。
- Tailwind トークン解決: `opacity-disabled` utility が v4 で生成されない可能性 → 任意値記法へフォールバック。
- `box-shadow` focus ring は `overflow:hidden` 祖先でクリップされうる。検証時にツリー/ナビの巡回で確認。
- ダークモード定義は無い（単一 `:root`）。考慮不要。
- スコープ逸脱注意: discarded / pending の opacity を巻き込まない。

## テスト方針
- 自動: `pnpm typecheck && pnpm lint:fix && pnpm format` → `pnpm test`。
- 取りこぼし検査: `grep -rn "opacity-50\|opacity-55\|opacity-60" app/components`。
- 手動（ブラウザ）: Tab 巡回で各形状のリング表示、各画面の disabled ボタン淡色統一を目視。

## レビュー履歴

### 1周目
**修正した点**:
- [P-001 / S-001]（両視点が指摘）: 計画の「ボタン/リンク定数に outline-none は無い」が事実誤認だった。`USER_MENU_ITEM`（layout:44）/ `ACTIONS_MENU_ITEM`（directory:52）は `<button role="menuitem">` でありながら `outline-none` を持つ。ただしグローバルリングは `box-shadow` 由来で `outline-none` では抑止されないため、リングは表示され是正不要。リスク欄の文言を実態へ修正し、ステップ1の検証対象にこの 2 つを明示追加、ADR-001 に menu item の扱いを追記。
- [S-002]（両視点が指摘）: ステップ9 の grep ガードを「残存 0 件」から「据え置き 2 件（discarded/pending）のみヒット、それ以外 0 件」へ修正。
- [S-003]（アーキ視点）: tokens.css に "State" セクションが存在しないため、ステップ3 を「新規 `/* State */` ブロックを追加」と具体化。

**取り込んだ改善提案**:
- [アーキ視点の裏取り]: Tailwind v4 ソースで `--opacity` が正規 theme namespace と確認できたため、ステップ4 を「第一候補（theme bridge）がそのまま通る」と更新。任意値記法はフォールバック扱い。

**見送った提案とその理由**:
- なし（全指摘を反映）。

### 終了
両視点ともに設計判断レベルの問題点はゼロ（要修正指摘は記述の正確性のみ）で、1周目で全て反映済みのため、レビューループを 1 周で終了。

