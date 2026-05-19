# ADR — Issue #70: 全体スタイリングを Tailwind CSS v4 に移行

## ADR-001: `@theme inline` を使い tokens.css の SSOT を維持

### Status
Proposed

### Context
Tailwind v4 では `@theme` ブロックに CSS 変数を書くことで Tailwind utility が自動生成される。本プロジェクトでは既に `app/styles/tokens.css` が `--color-*` / `--space-*` / `--text-*` 等のトークンを定義しており、`spec/design/tokens.md` がこの SSOT を明示している。

選択肢:
- A) `tokens.css` の `:root { ... }` を `@theme { ... }` 直書きに置換し中間レイヤーを排除（シンプル）
- B) `tokens.css` は SSOT として残し、`index.css` で `@theme inline { --color-accent: var(--color-accent); ... }` のブリッジ層を作る

### Decision
B を採用する。`@theme inline` 構文は CSS 変数を即座に解決して utility に解決するため、`tokens.css` を SSOT として維持しつつ Tailwind utility が `var(--color-*)` を参照する形に統一できる。

### Consequences
- 良い点: `tokens.css` と `spec/design/tokens.md` の SSOT 関係が維持される。トークンの命名規約（セマンティック名 `--color-accent-hover` 等）を Tailwind 側の機械的命名と分離できる
- トレードオフ:
  - `index.css` にブリッジ用の冗長な記述が必要（一覧として読めるため許容範囲）
  - `--text-*` のように Tailwind 既定命名と衝突するトークンは `text-base` 等の utility 既定値を上書きする。現状はプロジェクト内で Tailwind utility 自体ほぼ未使用のため衝突は実質ゼロ。将来 `@tailwindcss/typography` 等のプラグイン導入時に `text-base` が `clamp()` で動くことが問題になったら、独自命名（例: `--text-body`）に逃して `text-body` カスタム utility にする選択肢を残す

---

## ADR-002: `@apply` ベースの component class を原則作らない

### Status
Proposed

### Context
Tailwind では繰り返される utility 列を `@apply` で component class にまとめる方法がある。一方で Issue #68 / #70 の根本問題は「コンポーネントは class を当てているのに CSS 側で未定義」というギャップであり、CSS ファイルに class を残すこと自体が再発リスク。

選択肢:
- A) 同一 utility 列が N 箇所以上繰り返される場合は `@apply` で component class を残す（保守性視点）
- B) `@apply` を一切使わず、全て utility を inline 展開。繰り返しは React コンポーネント抽出で吸収（シンプルさ・再発防止視点）

### Decision
B を採用する。Issue の主旨「utility-first 統一」「孤児クラス問題の構造的解消」に従い、CSS ファイル自体を削除する。繰り返しは既存 React コンポーネント（`PillButton` 等）で吸収する既存パターンに任せる。

例外: `.strength[data-level="N"] .strength-segment:nth-child(-n + N)` のような子孫 + nth-child の組み合わせは React 側のループで `data-active={n <= level}` を割り当てて utility で表現できるため、CSS に残さない。

### 明示例外: `.note-detail-content` の prose スタイル

`NoteDetail.tsx` (admin プレビュー) と `HtmlEditor.tsx` (編集中プレビュー) が `dangerouslySetInnerHTML={{ __html: note.contentHtml }}` でサーバー側生成 HTML を挿入する。生成 HTML 内の `h1`/`h2`/`h3`/`p`/`a`/`code`/`pre`/`blockquote`/`ul`/`ol`/`li`/`li::marker`/`img` には Tailwind utility を付与できないため、`.note-detail-content` 配下の子孫セレクタは `index.css` の `@layer components` に残す。

これは恣意的な「便利だから残す」ではなく、技術的制約による明示例外。

`public.css` (475-578) と `app.css` (507-540) に重複定義が存在するため、移行時に `app.css` 側を正準として `@layer components` に集約する。

`@tailwindcss/typography` の導入は本 Issue のスコープ外（プラグイン追加は別判断）。

### その他の例外条件

これ以外で `@apply` / component class を残す場合は PR 説明に根拠を明記する。

### Consequences
- 良い点: CSS ファイルが完全に消える（tokens.css + index.css のみ残る）。孤児クラス問題が構造的に再発しない
- トレードオフ: 同一 utility 列の重複は React コンポーネント抽出で吸収する必要がある（既存パターンの延長）

---

## ADR-003: 状態 class は `data-*` 属性 + Tailwind variant で表現する

### Status
Proposed

### Context
既存のセマンティック class には `pill-btn primary` / `field has-error` / `note-tile is-selected` / `dropzone dragover` のような状態 class が多数ある。これらは Tailwind utility に展開するとき、条件式で utility 文字列を組み立てる方式と、`data-*` 属性 + variant の方式がある。

選択肢:
- A) 三項演算等で条件付き utility 文字列を組む（`${isPrimary ? 'bg-accent' : 'bg-surface'}`）
- B) `data-*` 属性を付けて Tailwind の `data-[state]:` variant で表現（`data-primary={isPrimary || undefined}` + `data-[primary]:bg-accent`）

### Decision
B を採用する。

理由:
- Tailwind JIT は静的解析で utility を抽出するため、三項演算で組まれた文字列も追えるが、`data-*` variant の方が「どの状態にどんなスタイルが当たるか」が宣言的で読みやすい
- 既存 CSS の `.pill-btn.primary` のようなクラス追記パターンと意味的に近い
- DOM 上で状態が `data-*` として可視化されるため動作確認・E2E でも扱いやすい

### Consequences
- 良い点: 宣言的・読みやすい・JIT に確実に検出される
- トレードオフ:
  - `data-primary={isPrimary || undefined}` のように、`false` を渡すと属性が付いてしまうため `undefined` フォールバックが必要（React/JSX 側の慣用パターン）。
  - `""` を渡すと属性は付くが値が空で「あり」と評価されるため、boolean 以外を渡すケースは要注意。
  - 繰り返しが多くなったら 1 関数だけ `dataAttr(v) => v ? "" : undefined` 相当のヘルパを導入してもよい（本 PR では導入せず、必要になったら別 Issue）。

---

## ADR-004: 単一 PR で一括移行（コミット粒度は分割）

### Status
Proposed

### Context
Issue 本文の「アプローチ」セクションで一括移行（単一 PR）が明示されている。移行途中の半端な状態（一部 utility / 一部手書き）を残さないことが優先される。

### Decision
単一 PR で全移行を完了する。ただしコミットは以下の粒度で分割し、各コミットが「画面が壊れない」中間状態を保つ:

1. `@theme inline` ブリッジ導入 + `@layer base` 移植（CSS は残したまま）
2. `components/admin` の className 置換
3. `components/note` (editor/wysiwyg/front-matter) の className 置換
4. `components/public` の className 置換
5. その他 `components/**`（auth/identity/landing/layout/media/directory/tag/trash/view/publication/ingestion/export） の className 置換
6. `routes/**` の className 置換
7. 手書き CSS ファイル削除 (`app.css` / `theme.css` / `admin.css` / `public/public.css`)
8. `CLAUDE.md` 規約追記

### Consequences
- 良い点: レビュー時に「どこからどこまでが何のための変更か」が追える。万一 revert が必要になっても粒度ごとに戻せる
- トレードオフ: 各コミットで動作する状態を維持するため、CSS の削除はコミット 7 まで遅らせる必要がある

---
