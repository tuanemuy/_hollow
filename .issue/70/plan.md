# 実装計画 — Issue #70: 全体スタイリングを Tailwind CSS v4 に移行（utility-first 統一）

**Issue:** #70
**作成日:** 2026-05-19
**複雑度:** 中〜大規模

---

## 目的

現状の「コンポーネント側はセマンティック class（`wysiwyg-editor` / `pill-btn` / `front-matter-editor` 等）を当てているが、実体は手書き CSS（合計約 4,400 行）に分散している」構造を解消し、Tailwind CSS v4 の utility-first に単一パラダイムへ統一する。

Issue #68 で顕在化した「クラスは付けているが CSS 側で未定義」というギャップを構造的に排除する。

## スコープ

### 含まれるもの

- `app/components/**/*.tsx` / `app/routes/**/*.tsx` の `className` を Tailwind utility に inline 展開
- `app/styles/{app,theme,admin}.css` および `app/components/public/public.css` の手書きルールの撤去
- `app/styles/index.css` を「Tailwind エントリ + tokens.css ブリッジ + 最小グローバルベース」に整理
- `tokens.css` の CSS 変数を `@theme inline` で Tailwind utility にブリッジ
- `CLAUDE.md` Frontend 節に utility-first 規約を追記

### 含まれないもの

- 既存挙動・既存機能の変更（純粋なスタイリングのリライト）
- 新しいデザイントークン体系の導入（`spec/design/tokens.md` の SSOT は維持）
- レスポンシブ・アクセシビリティ仕様の変更（既存と同等の維持は必須）
- `spec/design/drafts/` 配下のモック HTML の更新
- `@tailwindcss/typography` 等の追加プラグイン導入
- Biome の `useSortedClasses` プラグイン有効化

## 現状把握

- 手書き CSS: `app.css` (1,151) + `theme.css` (1,139) + `admin.css` (887) + `public/public.css` (1,038) = 4,215 行（tokens.css 178 行を除く）
- `tokens.css` は SSOT として `--color-*` / `--space-*` / `--text-*` / `--radius-*` / `--shadow-*` / `--font-*` / `--bp-*` / `--ease-*` / `--duration-*` を網羅
- コンポーネント側で使われるユニーク class 約 357 種、`className` 出現箇所 約 871
- 多用クラス: `pill-btn` (56) / `form-error` (27) / `field` (21) / `admin-btn` (16) など
- ダークモード切替は未実装（`data-theme` / `prefers-color-scheme` の使用なし）
- 非単純セレクタ: `theme.css` の `.strength[data-level="N"] .strength-segment:nth-child(-n + N)` が唯一
- `app.css` 内の `.admin-shell` スコープは `:root` と同値で二重定義

## 実装ステップ

### 1. `app/styles/index.css` を `@theme inline` ブリッジ + 最小ベースに再構築

- **対象ファイル:** `app/styles/index.css`
- **変更内容:**
  - `@import "tailwindcss";` を残す
  - `@import "./tokens.css";` を残す（SSOT 維持）
  - `@theme inline { ... }` ブロックを追加し、tokens.css の CSS 変数を Tailwind v4 命名規約 (`--color-*` / `--spacing-*` / `--font-*` / `--text-*` / `--radius-*` / `--shadow-*` / `--breakpoint-*` / `--ease-*` / `--duration-*` / `--leading-*` / `--tracking-*` / `--font-weight-*`) にブリッジ
    - 例: `--spacing-4: var(--space-4);` で `p-4` / `gap-4` 等を駆動
    - 例: `--breakpoint-sm: var(--bp-sm);` で Tailwind の `sm:` variant を駆動
    - `--radius-pill: var(--radius-pill);` で `rounded-pill` をカスタム utility として登録
  - `@layer base { ... }` で `html` / `body` / `button` / `a` / `:focus-visible` のリセット系（tokens.css 末尾にある約 30 行）を維持
  - `@import "./theme.css";` `@import "./app.css";` `@import "../components/public/public.css";` を削除
- **理由:** `@theme inline` は CSS 変数を utility 名に解決しつつ tokens.css の SSOT を破壊しない。`@theme` 直書きにすると SSOT が tokens.css から失われるため `inline` を採用。

### 2. tokens.css 末尾のグローバルベースを `@layer base` に移植

- **対象ファイル:** `app/styles/tokens.css` / `app/styles/index.css`
- **変更内容:** `tokens.css` の `:root { --... }` 部分は SSOT としてそのまま残し、末尾の `html, body { ... }` / `button { ... }` / `a { ... }` / `:focus-visible { ... }` / `*, *::before, *::after { box-sizing: border-box; }` を `index.css` の `@layer base { ... }` に移す
- **理由:** Tailwind v4 の `@theme` は utility 生成のためのもの。ベース要素のリセットは `@layer base` 経由が公式パターン。

### 3. コンポーネントの className を Tailwind utility へ inline 展開

- **対象ファイル:** `app/components/**/*.tsx`（90 ファイル）、`app/routes/**/*.tsx`（44 ファイル）
- **変更内容:**
  - 357 種のセマンティック class を、対応する手書き CSS ルールを読みながら Tailwind utility 文字列に展開
  - 状態 class（`primary` / `active` / `has-error` / `is-selected` / `dragover` 等）は **`data-*` 属性化** + Tailwind の `data-[state=active]:` バリアントで表現
    - 例: `<button className={`pill-btn ${isPrimary ? 'primary' : ''}`} />` → `<button data-primary={isPrimary || undefined} className="inline-flex items-center gap-2 px-4 h-9 rounded-pill bg-surface text-ink text-sm transition-colors hover:bg-surface-hover data-[primary]:bg-accent data-[primary]:text-white" />`
  - `clsx`/`tv()` 等の class ユーティリティは新規導入しない（テンプレートリテラルのまま、差分最小化）
  - 進行順序: `components/admin` → `components/note`(editor/wysiwyg) → `components/public` → 他 → `routes`（最頻クラスから攻め、状態 class の置換パターンを早期に確立）
- **理由:** Issue が utility-first 統一を明示し、再発防止のため `@apply` での component class 化は原則しない。状態 class は `data-*` 化することで JIT が静的に検出できるようにする。

### 4. 残置を最小化（`@apply` は原則使わない）

- **方針:** `@apply` を使った component class 抽出は **原則行わない**（Issue の utility-first 統一に従い、CSS ファイル自体を消すため）
- **明示的な例外 — `.note-detail-content` の prose スタイル:**
  - `NoteDetail.tsx` / `HtmlEditor.tsx` が `dangerouslySetInnerHTML` でサーバー側生成 HTML（`note.contentHtml`）を挿入しており、本文内の `h1`/`h2`/`h3`/`p`/`a`/`code`/`pre`/`blockquote`/`ul`/`ol`/`li`/`li::marker`/`img` には utility を付与できない
  - `public.css` (475-578) と `app.css` (507-540) に重複定義あり。両方のルール群を **`index.css` の `@layer components { .note-detail-content { ... } .note-detail-content > * + * { ... } ... }` に集約して残す**
  - 重複ルールは `app.css` 側に寄せたものに統一（admin プレビュー / public 詳細で同じ見た目）
  - この例外は ADR-002 に明記
- **その他の子孫セレクタ:** `.strength[data-level="N"] .strength-segment:nth-child(-n + N)` のような既知のものは React 側のループで `data-active={n <= level}` を割り当てて utility で表現する。CSS に残さない
- **理由:** 「class 当てるが CSS 未定義」問題の再発を構造的に防ぐ。一方で `dangerouslySetInnerHTML` 配下は技術的に utility 化できないため明示例外として境界を明確にする

### 5. 手書き CSS ファイルの削除と関連 `?url` import の除去

- **対象ファイル:**
  - `app/styles/app.css`（削除）
  - `app/styles/theme.css`（削除）
  - `app/styles/admin.css`（削除）
  - `app/components/public/public.css`（削除）
  - `app/routes/admin/route.tsx`（`import adminCss from "../../styles/admin.css?url"` と `head().links` 内の `{ rel: "stylesheet", href: adminCss }` を削除）
- **変更内容:**
  - ステップ 3 完了後、対応する `className` がすべて utility 化された段階で一括削除
  - `admin.css` 削除前に `app/routes/admin/route.tsx` の `?url` import を取り除く（取り除かないと build エラー）。`__root.tsx` の `index.css?url` は引き続き必要なため残す
- **理由:** Issue の完了基準「手書きルールが撤去されている」を満たす。`?url` import を放置すると build に失敗する

### 6. `admin-shell` スコープの扱い

- **対象ファイル:** `app/components/admin/**/*.tsx` 配下
- **変更内容:** `app.css` 内の `.admin-shell` 配下の上書きは `:root` と同値だったため、`admin-shell` クラス自体は装飾なしのレイアウト用ラッパー（または削除）として扱う。子の `admin-*` 系 class は通常の utility に展開
- **理由:** 同一トークン値の二重定義であり、Tailwind 移行で意味を失う

### 7. CLAUDE.md への規約追記

- **対象ファイル:** `CLAUDE.md`
- **変更内容:** Frontend 節に以下を追記
  - 「スタイリングは Tailwind v4 utility-first。`className` には utility のみを書く」
  - 「デザイントークンは `app/styles/tokens.css` の CSS 変数を SSOT とし、`index.css` の `@theme inline` で Tailwind utility にブリッジする。新しいトークンは `tokens.css` に追加し、必要に応じて `@theme inline` も拡張する」
  - 「状態スタイルは `data-*` 属性 + `data-[state]:` バリアントで表現する。`@apply` ベースの component class は原則作らない」
- **理由:** 移行後の規約を成文化し、新規追加で同じ歪みが再発しないようにする

### 8. 自動検証 + 孤児クラス検証

- **変更内容:**
  - `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm build` を全て通す
  - Issue #68 で挙がった `wysiwyg-editor` / `wysiwyg-toolbar` / `wysiwyg-unsupported-banner` / `pill-btn` / `field` / `front-matter-editor` 等のセマンティック class が残っていないことを grep で確認: `rg "(wysiwyg-(editor|toolbar|unsupported-banner)|pill-btn|front-matter-editor|admin-btn|field\\b|note-tile|chip)" app/` の結果が空（または `.note-detail-content` 系の意図的な残置のみ）であることを確認
- **理由:** Issue の完了基準 #5 #6 を満たす

## 設計判断

詳細は `adr.md` を参照。

- **ADR-001:** `@theme inline` を使い tokens.css の SSOT を維持
- **ADR-002:** `@apply` ベースの component class を原則作らない
- **ADR-003:** 状態 class は `data-*` 属性 + Tailwind variant で表現
- **ADR-004:** 単一 PR で一括移行（コミットは粒度分割）

## リスクと注意点

- **巨大 diff:** 871 箇所の `className` 書き換え + 4,200 行の CSS 削除。レビュー負荷大だが Issue 方針通り単一 PR
- **継承や特異度に依存していた装飾の見落とし:** `.field input` のような子孫セレクタや、`*` リセットで効いていた箇所を取りこぼす恐れ。手書き CSS を読みながら 1 クラスずつ対応表を作って置換する
- **動的 class の取りこぼし:** 三項演算や文字列連結による条件 class は静的解析で見つけにくい。`data-*` 化することで JIT が確実に検出できる状態にする
- **`clamp()` ベースの `--text-*`:** Tailwind の `text-base` 既定を上書きする形で `@theme inline` を流す。優先順位を確認
- **`:focus-visible` のグローバル `box-shadow`:** `@layer base` に残し、Tailwind の `focus-visible:` variant と衝突しないことを確認
- **`backdrop-filter` の `@supports not` フォールバック（`public-header` 等）:** `supports-[backdrop-filter]:` variant で再現する。再現できない場合は最小の `@layer utilities` で残す
- **記事本文 prose 系 (`.note-detail-content`):** ステップ 4 の明示例外として `@layer components` に残す（ADR-002 参照）
- **`clamp()` ベースの `--text-*` を Tailwind 既定の `text-base` 等に上書きする際の影響:** `--text-base` を直接上書きすると Tailwind の他箇所での `text-base` 使用にも影響する。本プロジェクトでは現状 Tailwind utility 自体ほぼ未使用のため衝突は実質ゼロだが、将来的に独自命名（`--text-body` 等）に逃す選択肢を ADR に記録
- **`:focus-visible` のグローバル `box-shadow`:** `@layer base` に置くことで Tailwind の utility（`focus-visible:ring-0` 等）より優先順位が低くなる。utility 側で打ち消し可能であることを利用箇所の確認時に検証

## テスト方針

### 自動

- `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build` がグリーン
- 既存 unit/integration テストはスタイル非依存のため、回帰は通常発生しない想定

### 手動

- manual-test は本実装ではスキップ（ユーザー指示）
- 代替として、移行中に各ステップで `pnpm dev` 起動して主要画面を目視確認することは推奨（テストレポートは作成しない）

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○（具体性が最高） | △（取り込み） | △（取り込み） |
| `@theme inline` | ○ | ○ | × (`@theme` 直書き案) |
| `@apply` の扱い | 不採用 | 閾値超えで残す | 一切使わない |
| 取り込んだ点 | 統計データ・data-* バリアント・ベース実装手順 | コミット分割戦略・CLAUDE.md 規約追記 | `@apply` を一切使わない原則 |
| 不採用 | — | 一時 docs/tailwind-migration-map.md・check-orphan-classes スクリプト（スコープ外） | `@theme` 直書き（SSOT を壊す） |

## レビュー反映

### 修正した点

- **[P-001/review1]** `app/routes/admin/route.tsx` の `admin.css?url` import を削除するステップを 5 に追加。`__root.tsx` の `index.css?url` は残す
- **[P-002/review1]** Issue #68 で挙がったセマンティック class が utility 化されていることを grep で確認するステップを 8 に追加
- **[P-001/review2]** `.note-detail-content` の prose スタイル（`dangerouslySetInnerHTML` 配下で utility 化不可）を ADR-002 の明示例外として `@layer components` に残す扱いをステップ 4 に明記、ADR-002 を改訂
- **[P-002/review2]** `clamp()` ベース `--text-*` を Tailwind 既定の `text-base` 上書きする際の影響をリスク欄に追記、ADR に独自命名への退避経路を記録
- **[P-003/review2]** `:focus-visible` の優先順位（`@layer base` 配置によって utility より低い順位になる点）をリスク欄に明記

### 取り込んだ改善提案

- **[S-002/review2]** `data-*` 属性の `undefined` フォールバックパターンの罠を ADR-003 の Consequences に追記

### 見送った提案とその理由

- **[S-001/review1]** spec/manual-tests/ スキップ根拠を ADR で正当化 → スキップはユーザー明示指示であり、PR description で根拠を述べる方が適切（ADR は技術判断、PR description は運用判断）
- **[S-001/review2]** コミット中間状態での visual 二重適用の運用注記 → ADR-004 のコミット粒度で「各コミットで動作する状態を維持」と明記済みのため重複
- **[S-002/review1]** `@tailwindcss/typography` 導入の再検討 → 本 Issue では prose スタイルが手書き CSS 1 箇所に集約済みで、`@layer components` に残す例外で十分。プラグイン導入はスコープ拡大のため見送り（必要なら別 Issue）
- **[S-003/review2]** スクリーンショット差分手順 → manual-test スキップ指示と整合させるため、本 PR では実施しない
