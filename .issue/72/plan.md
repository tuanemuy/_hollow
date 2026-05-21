# 実装計画 — Issue #72: prefers-reduced-motion 対応（motion-reduce バリアント一括導入）

**Issue:** #72
**作成日:** 2026-05-21
**複雑度:** 中〜大規模

---

## 目的

Issue #70 で utility-first 移行した際、UI 全域に増えた `transition-colors` / `active:scale-[0.985]` / `transition-all` / `transition-transform` 等のモーション系 utility に対し、`prefers-reduced-motion: reduce` ユーザー向けの抑制を **Tailwind v4 の `motion-reduce:` バリアントを併用** することで一括導入する。a11y 観点での UX 最低限の対応漏れを解消し、A11y / UX レビュー（`.issue/70/review/review-001.md` N-A-004）の指摘をクローズする。

## スコープ

### 含まれるもの

- `app/components/{auth,layout,note,public}/styles.ts` の utility 定数への `motion-reduce:transition-none` / `motion-reduce:active:scale-100` 併用
- `app/routes/admin/route.tsx` の `ADMIN_BTN_CLASS` ほか inline `transition-*` への併用
- `app/components/admin/*` 配下の inline モーション utility への併用（toggle スイッチの `after:transition-transform` 含む）
- `app/components/{landing,note/list,note/editor,trash,auth,ingestion}` 配下の inline `transition-*` への併用
- `app/routes/login.tsx` の inline `transition-colors`
- ADR-007 を `.issue/72/adr.md` に新規作成し「motion-reduce バリアント方式採用、`@layer base` グローバル抑制方式は不採用」を記録
- `CLAUDE.md` の Styling セクションに 1 行運用ルールを追記

### 含まれないもの

- 機能変更
- 新規 token 追加（既存の `--duration-*` には触れない）
- `backdrop-filter` 系 utility への対応（モーションではなく視覚効果のため WCAG `prefers-reduced-motion` 対象外）
- `tag/styles.ts:15` の `motion-safe:animate-pulse`（既に対応済み、変更不要）
- CI ガードスクリプト / lint ルールの新設（YAGNI、Issue 本文に明示なし）
- spec/design ドキュメント側の更新（spec-sync は別 Issue 範囲）

## 実装ステップ

### 1. ADR-007 の作成

- **対象ファイル:** `.issue/72/adr.md`
- **変更内容:** 「motion-reduce バリアント方式 vs `@layer base` 一括 CSS 方式」のトレードオフを記録、前者を採用と明記
- **理由:** Issue 本文で ADR 判断を要求。ADR-002（`@apply`/handwritten CSS 禁止）との整合性を明文化

### 2. `app/components/layout/styles.ts` への併用

- **対象ファイル:** `app/components/layout/styles.ts`
- **変更内容:**
  - L14 `SEARCH_BOX_INPUT`: `transition-colors` → `transition-colors motion-reduce:transition-none`
  - L20 `PILL_BTN`: `transition-colors` → `transition-colors motion-reduce:transition-none`、`active:scale-[0.985]` → `active:scale-[0.985] motion-reduce:active:scale-100`
  - L23 `ICON_BTN`: `transition-colors` → `transition-colors motion-reduce:transition-none`
  - L42 `NAV_ITEM`: 同上
  - L61 `FIELD_INPUT`: `transition-all` → `transition-all motion-reduce:transition-none`
  - L64 `FIELD_TEXTAREA`: 同上
  - L87 `ROW_ACTIONS_SMALL_PILL`: `transition-colors` → `transition-colors motion-reduce:transition-none`
- **理由:** authenticated app shell 全域で使われる中核定数

### 3. `app/components/auth/styles.ts` への併用

- **対象ファイル:** `app/components/auth/styles.ts`
- **変更内容:** L34 `INPUT`, L41 `REVEAL_BTN`, L53 `BTN_PRIMARY`, L56 `BTN_PRIMARY_INLINE`, L59 `BTN_SECONDARY`, L62 `BTN_SECONDARY_TALL` の `transition-colors` → `transition-colors motion-reduce:transition-none`
- **理由:** 認証フォーム全般

### 4. `app/components/note/styles.ts` への併用

- **対象ファイル:** `app/components/note/styles.ts`
- **変更内容:** L13 `pillBtn`, L30 `fieldControl` の `transition-colors` → `transition-colors motion-reduce:transition-none`
- **理由:** note サーフェスの中核定数

### 5. `app/components/public/styles.ts` への併用

- **対象ファイル:** `app/components/public/styles.ts`
- **変更内容:**
  - L14, L19, L24, L36, L74, L102, L104, L142 の `transition-colors` → `transition-colors motion-reduce:transition-none`
  - L44 `NOTE_ROW`: `transition-[background] duration-[120ms]` → `transition-[background] duration-[120ms] motion-reduce:transition-none`
  - L112 `SEARCH_HIT_ROW`: 同上
  - L138 `GATE_INPUT`: `transition-[border-color,box-shadow] duration-[150ms]` → 末尾に `motion-reduce:transition-none`
- **理由:** 公開ページ（未認証ユーザーが触れる箇所）の網羅

### 6. `app/routes/admin/route.tsx` の修正

- **対象ファイル:** `app/routes/admin/route.tsx`
- **変更内容:** L42 `ADMIN_BTN_CLASS` および L145 inline nav link の `transition-colors duration-[var(--duration-fast)]` → 末尾に `motion-reduce:transition-none` 追加
- **理由:** admin shell の中核定数とインライン両方

### 7. `app/components/admin/*` 配下の inline utility 修正

- **対象ファイル:**
  - `app/components/admin/UsersTable/index.tsx` L34
  - `app/components/admin/PromptsForm/index.tsx` L42, L45, L47
  - `app/components/admin/DesignTokensForm/index.tsx` L23, L30, L34
  - `app/components/admin/LLMSettingsForm/index.tsx` L35, L38, L40
  - `app/components/admin/Jobs/index.tsx` L29
  - `app/components/admin/RegistrationForm/index.tsx` L18, L21, L80
- **変更内容:** `transition-colors` の直後に `motion-reduce:transition-none` を追記。L80 のトグルスイッチは `after:transition-transform` も対象で、`motion-reduce:after:transition-none` を併用（`motion-reduce:` を先頭にする慣用 — ADR-007 / CLAUDE.md 参照。つまみが reduce motion 時に即座に位置切替する挙動になる）
- **理由:** admin 系コンポーネントの inline スタイル

### 8. その他コンポーネントの inline utility 修正

- **対象ファイル:**
  - `app/components/note/list/CalendarView.tsx` L59
  - `app/components/note/list/FilterBar.tsx` L12
  - `app/components/note/list/ListView.tsx` L56
  - `app/components/note/list/TileView.tsx` L38
  - `app/components/note/editor/InternalLinkSuggestPopup.tsx` L51
  - `app/components/landing/LandingPage.tsx` L9, L11, L25, L27, L62, L74, L85
  - `app/components/ingestion/UploadForm.tsx` L15 (`transition-all` → `transition-all motion-reduce:transition-none`)
  - `app/components/trash/TrashList.tsx` L65
  - `app/components/auth/PasswordResetConfirmForm/index.tsx` L148
  - `app/components/auth/AuthHeader/index.tsx` L23
  - `app/routes/login.tsx` L52
- **変更内容:** `transition-colors` の直後に `motion-reduce:transition-none` を追記
- **理由:** 完全網羅。漏れがあるとレビューで再指摘される

### 9. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm build` でビルドが通り、生成 CSS に `@media (prefers-reduced-motion: reduce)` ブロックが含まれることを確認
- 生成 CSS で `active:scale-[0.985]` と `motion-reduce:active:scale-100` のソース順を grep で確認し、`@media (prefers-reduced-motion: reduce)` 内のルールが先発側より後ろに出ていることを目視。仮に specificity 順が逆転していた場合は `motion-reduce:active:scale-100!` (`!important`) を併用する Plan B あり
- ブラウザで Chrome DevTools の Rendering タブ → "Emulate CSS prefers-reduced-motion" → `reduce` で目視確認

## 設計判断

詳細は `.issue/72/adr.md` (ADR-007) を参照。要点:

- **utility 案を採用、`@layer base` 一括 CSS 案は不採用**
- 理由: ADR-002 の「`@apply` 禁止・例外は技術的制約のみ」と整合、`tag/styles.ts:15` の `motion-safe:animate-pulse` 先行例との一貫性、個別オプトアウトの柔軟性、Tailwind JIT がモーション系 utility の使用箇所を静的スキャンで把握できる利点
- トレードオフ: 約 59 箇所への併用追加で行が長くなる。将来の漏れ防止は CI ガードでなく CLAUDE.md 運用ルールで担保

## リスクと注意点

- **Tailwind v4 の `motion-reduce:` 検出:** v4 で安定バリアント。`tag/styles.ts:15` で `motion-safe:` が既にビルド通過しているため `motion-reduce:` も問題なく検出される
- **arbitrary value バリアントとの組み合わせ:** `transition-[background]` などにも `motion-reduce:transition-none` を併用すれば、media query 内で `transition-property: none` が上書きする
- **`active:scale-[0.985]` の上書き:** `motion-reduce:active:scale-100` で正しく抑制される
- **`backdrop-filter` (blur) は対象外:** WCAG `prefers-reduced-motion` の対象は「動き」。視覚効果は別議論
- **CSS バンドルサイズ:** Tailwind JIT が同一バリアントを共有するため増加量は数百バイト程度
- **未認証ユーザー導線（landing / login / public ノート詳細 / share gate）を漏らさない:** 第一印象に直結する箇所のため網羅対応必須

## テスト方針

- **自動テスト:** 追加しない（className 文字列のみの変更、ロジック影響なし）
- **手動確認:**
  - macOS 「視差効果を減らす」ON、または Chrome DevTools の Rendering → Emulate `prefers-reduced-motion: reduce`
  - 主要画面で hover/active 時の transition / scale が即時切替になることを目視確認
  - 重点画面: `/admin` トップ、`/login`, `/register`, `/password-reset`, `/u/:slug`, `/u/:slug/notes/:id`, `/search`, `/share/:token`, landing
  - RegistrationForm の toggle スイッチでつまみが reduce motion 時にトランジションなしで移動することを確認
  - `focus:shadow-focus` のような focus 表示は **transition なし即時表示** で残ること（focus ring 自体が消えてはいけない）も併せて確認

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○ | ○ | × |
| 採用案 | utility 併用 | utility 併用 + CI ガード | `@layer base` 一括 |
| 取り込んだ点 | 全体構造、ADR-002 整合性、CLAUDE.md 運用ルール | 網羅検索結果、トグルスイッチの `after:transition-transform` 対応 | リスク（漏れ可能性）の認識を CLAUDE.md 運用ルールに昇華 |
| 採用しなかった点 | （なし） | CI ガードスクリプト（YAGNI、スコープ外） | `@layer base` 案（ADR-002 と相性悪い、個別オプトアウト不可） |

## レビュー反映

### 修正した点

- **P-001 (実現可能性)**: 「約 48 箇所」→ 「約 59 箇所」へ実測値に修正
- **P-002 (実現可能性)**: ADR-007 の Decision 理由 1 を「ADR-002 の射程内かは議論の余地あり。ただし A 案には別の独立した利点が複数あるため A 案を採用」と表現を緩和（adr.md 側）
- **P-003 (実現可能性)**: ステップ 9 に `active:scale-*` の specificity 順検証ステップを追加、Plan B（`motion-reduce:active:scale-100!`）も明記

### 取り込んだ改善提案

- **S-002 (要件カバレッジ)**: ステップ 8 に各ファイルの具体行番号を明記（実装時の grep 漏れ防止）
- **S-001 (要件カバレッジ)**: CLAUDE.md 運用ルール追記が「Issue 本文に明記なしの ADR-007 派生決定」であることを明確化、PR 説明文にもその旨を記す
- **S-001 (実現可能性)**: variant ordering の慣用化（`motion-reduce:after:transition-none` を採用、CLAUDE.md に明記）
- **S-002 (実現可能性)**: spec/design 整合性メモを ADR-007 Related に追記（adr.md 側）
- **S-003 (実現可能性)**: テスト方針に「focus shadow が消えないこと」を追加

### 見送った提案とその理由

- **S-003 (要件カバレッジ)**: arbitrary value バリアントのフォールバック詳細記述 — ステップ 9 の CSS 検証で実機確認するため重複
- **S-004 (実現可能性)**: `transition-all` を `transition-colors` 等に絞り込む改善 — スコープ外（Issue 本文「機能変更スコープ外」に該当する可能性）。本 Issue では `motion-reduce:` 追加のみに留める
