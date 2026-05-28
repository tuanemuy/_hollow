# Hollow デザイン方針

「**Apple Calm**」をベースに、Hollow のすべての画面を設計する。
個別のトークン定義は [`spec/design/tokens.md`](./tokens.md) を参照。本ファイルは数値で表現できない判断基準・原則を扱う。

---

## 1. 全体のトーン

> 「静かな書斎」— 内容に集中できる、装飾を引いた白い画面。

- **白基調 × 余白**: ベースは `#ffffff`。区切りは線ではなくスペーシングで作る。線が必要なときは限りなく薄いヘアラインを使う。
- **アクセントはニュートラルなグレースケール一色** (`oklch(37.1% 0 0)`)。色相は持たず明度のみで表現することで、コンテンツの色味を邪魔しない。彩度の高い差し色を増やさない。
- **タイポグラフィは軽く、間隔はわずかにタイト**。日本語混在でも端正に見える `Helvetica Neue / Arial / Hiragino Kaku Gothic ProN / Hiragino Sans / Meiryo` のチェーン。
- **角丸はコンテンツ系で 12px、ピル系で完全な丸**。中間の値は避け、リズムを揃える。
- **シャドウは原則使わない**。ドロップダウンやモーダルなど「浮く」要素のみ控えめに使う。

このトーンは、ノートを書く・読む・整理するという核の体験の邪魔をしないことを最優先する。プロダクト紹介ページではなく "デイリーに長く使う道具" として設計する。

---

## 2. レイアウト原則

### 2.1 グリッド

- **3 つのレイアウトモード**を画面横幅に応じて切り替える:
  1. (base〜md) 単カラム: ヘッダー + コンテンツ。サイドバーは drawer (オーバーレイ + バックドロップ)。
  2. (lg) 2 カラム: サイドバー (固定 `--sidebar-width`) + 主コンテンツ。
  3. (lg + ノート詳細系) 3 カラム: サイドバー + 主コンテンツ (`--content-max`) + 右メタレール (`--meta-rail-width`)。
- 主コンテンツ領域は `max-width: var(--content-max)` (= 760px) を超えて広げない。広いウィンドウでは余白で受け止める。
- **非対称は使わない**。視覚バランスはセンタリング + 左寄せの組み合わせで作る。

### 2.2 余白

- ページ上下の余白は `--space-12 〜 --space-16`、セクション間は `--space-8 〜 --space-10`、行内は `--space-2 〜 --space-3` を基準。
- 「線で区切るくらいなら 1 段大きい余白を入れる」が原則。
- カードのパディングは `--space-4 〜 --space-6`。詰め込みすぎないが、無駄な広さも避ける。

### 2.3 ヘッダー

- 高さ `--header-height` (64px)、`position: sticky; top: 0`、半透明 + `backdrop-filter: blur(20px)` で背後を透かす（Apple 系の象徴的振る舞い）。
- 下線ボーダーは入れず、スクロール時のみ薄いヘアラインを表示する（細かい挙動は実装時に検討）。

---

## 3. レスポンシブ戦略

- **モバイルファースト**。`(base)` で読みやすい単カラム → 段階的に拡張。
- **ブレークポイントごとの主な変化**:
  - `base` (〜640px): サイドバー drawer、フィルタは横スクロール許可、メタ情報は本文の前後に縦積み、検索バーは header 内で省スペース化。
  - `sm` (≥640px): 余白を一段拡大、ノート行のメタ情報を 1 行に納める、ヘッダー右側のアイコンを展開。
  - `md` (≥768px): フィルタバーの折り返しを抑制。タブレット縦想定。
  - `lg` (≥1024px): サイドバー常時表示、ノート詳細で右メタレール表示、3 カラム構成に切替。
  - `xl` (≥1280px): コンテンツが中央寄せされる視覚バランスの最終形。
  - `2xl` (≥1536px): 余白のみ追加。カラム構成は変えない。
- **タッチターゲット**: ボタン・リンクを含むタップ可能領域は最小 `44 × 44px` を確保する（ピル/icon-btn は 36px だが、`padding` または `min-height: 44px` のラッパで領域を担保）。
- **スティッキー要素**: ヘッダーは常時 sticky、ノート詳細の右メタレールは `lg` 以上でのみ sticky。モバイルではスクロール追従させない。
- **横スクロールの禁止**: テーブル・コードブロック・横長メディアの単体スクロールは許可、ページ全体の横スクロールは絶対に発生させない (`overflow-x: hidden` を `body` に必要なら適用)。

---

## 4. インタラクション

- **ホバーは "薄く色が変わる" だけ**: `--color-surface` → `--color-surface-hover`、または `var(--color-ink) → var(--color-accent)` 程度。スケールアップ・シャドウ濃化のような派手な変化はしない。
- **トランジションは速め**: `--duration-fast: 120ms` を基本に、視覚に "もたつき" を感じさせない。
- **タッチデバイスではホバーに依存しない**: 重要な操作はクリック/タップで完結し、ホバー時のみ出現する UI（ツールチップ補助は許容するが、操作トリガにはしない）を作らない。`@media (hover: hover)` でホバー専用効果を限定する。
- **フォーカス**: `:focus-visible` のみで `--shadow-focus` を表示。マウスクリック時には出さない。
- **ロード状態**: スピナーよりもスケルトン (`--color-surface` の矩形 + 微パルス) を優先。スピナー多用は雑然と感じさせるため避ける。
- **アニメーション**: 装飾的なものは入れない。状態遷移を伝えるための補助のみ。`prefers-reduced-motion: reduce` 時は全 transition を 0ms にする。

---

## 5. タイポグラフィ運用

- **見出しは "軽量＋タイト字間"**: ページタイトル / ノートタイトルは `--weight-regular` (400)、`--tracking-tightest`、`--text-3xl`。本文中の `h1/h2/h3` は `--weight-medium`〜`--weight-semibold`。
- **本文は 16px (`--text-base`)、`--leading-relaxed`** (= 1.7)。日本語が密に並んでも息苦しくないように。
- **モノスペースはコード以外で使わない**。ID やタイムスタンプを敢えてモノスペースにする Linear 系の演出は採用しない（Apple Calm の柔らかさを保つため）。
- **絵文字はサイドバーや UI 装飾には使わない**（Notion 系の演出を避ける）。本文内のユーザー入力は当然そのまま表示する。

---

## 6. ノート本文（P11 / P31）の GitHub Markdown スタイル

ユーザーが書いた / アップロードした内容のレンダリングは **GitHub README のレイアウト規約** を踏襲する。
ただしフォント・色・行間・余白はトークンに合わせて Apple Calm に揃える。具体的には以下:

| GitHub | Hollow (Apple Calm) | 補足 |
|--------|--------------------|------|
| `font-family: system-ui` | `--font-sans` | 同方向、より厳密にフォールバック制御 |
| H1/H2 に bottom border | H2 のみに `1px solid --color-hairline` の極細線 | H1 はノートタイトルと衝突するため使わない。本文内 H1 は無線で軽量化 |
| body line-height 1.5 | `--leading-relaxed (1.7)` | 日本語の可読性のため広げる |
| `<code>` `rgba(175,184,193,0.2)` | `--color-surface` `+ --radius-xs (4px)` | 角を少し丸く |
| `<pre>` `#f6f8fa + 6px radius` | `--color-surface + --radius-lg (12px)` | ボーダーは付けない |
| blockquote `0.25em solid #d1d9e0` | `3px solid --color-hairline-strong` | テキストは `--color-ink-secondary` |
| table 縞 + 全周ボーダー | 横ヘアラインのみ、外周ボーダーなし | Apple Calm の "borderless" 原則を踏襲 |
| `<a>` ブルー | `--color-accent`（無彩色アクセント） | ホバー時のみアンダーライン (`text-underline-offset: 3px`) |
| `<img>` 角なし | `--radius-lg (12px)` | キャプションは `--color-ink-tertiary` |
| GitHub task list | `--color-accent` の塗りつぶし + 白チェック | チェックボックスは `--radius-xs` (5px相当) |
| `#hashtag` (なし) | `--color-accent` の素テキスト（チップ化しない） | 軽量に保つ |
| `[[wikilink]]` (なし) | `--color-surface` のピル + 先頭にアクセント色ドット | 内部リンクであることを視覚で示す |

GitHub の "構造" は維持し、"質感" を Apple 系に翻訳する、という考え方。

---

## 7. 画像・アイコン方針

- **アイコン**: 線画系・1.5px ストロークの SF Symbols 風 (Phosphor / Lucide のような線画ライブラリで代用可)。塗り潰しアイコンや 2 トーンアイコンは使わない。サイズは 16/20/24px の 3 段階。色は `currentColor`。
- **イラスト**: 空状態 (empty state) のみ、グレースケール + 1 色アクセントの線画イラスト。多色・キャラクター系イラストは避ける。
- **ノート本文の画像**: `border-radius: --radius-lg`、`width: 100%; height: auto;`。ノート本文内の画像はフルブリードにせず、本文幅 (`--content-max`) に収める。
- **アバター**: 円形 (`--radius-full`)、グラデーション (`linear-gradient(135deg, #c9d3df 0%, #8e99a8 100%)`) のフォールバック。
- **`object-fit: cover` を既定** にし、トリミングが顔や重要要素を切らないアスペクト比 (16/9, 4/3, 1/1) を選ぶ。
- **画像読み込み**: `loading="lazy"` を基本、`decoding="async"`。`srcset` は将来導入する画像最適化レイヤーに合わせて空欄でも可（MVP では未対応）。

### 7.1 アイコン運用ガイドライン

- **使用ライブラリ**: `lucide-react` を `app/components/common/Icon.tsx` ラッパー経由で使用する。生 `lucide-react` を直接 import したり `import * as Icons from "lucide-react"` の barrel import を行ったりしない（tree-shake が効かなくなる）。
- **使う場面**: 主要アクションボタン（ヘッダーのナビゲーション、ノート一覧ツールバー、一括操作バー、行アクション、ノート詳細アクション、確認ダイアログのアイキャッチ、空状態のアイキャッチ、管理画面セクションヘッダ）にはアイコン+テキストで表示する。**空状態のアイキャッチについては** 認証済み側の `EMPTY_STATE`（`layout/styles.ts`）を使う箇所を対象とし、公開側の `EMPTY_LIST`（`public/styles.ts`）は将来の対応とする（#231 の初期スコープ外）。
- **使わない場面**: 本文（Markdown 描画領域）、チップ内部、サイドバーのセクションタイトル、絵文字代替の単なる装飾。情報伝達に不要な「賑やかし」を増やさない。
- **a11y 契約**:
  - 「アイコン+テキスト」のボタンでは、アイコンは装飾扱い（`Icon` の `label` 未指定 → `aria-hidden="true"`）にしてテキスト側で accessible name を担う。
  - 「アイコンのみ」のボタンでは、`<button>` 側に `aria-label` を必ず付け、`Icon` 側は装飾扱い（`label` 未指定）のままにする。`Icon` を `<button>` の唯一の子にして `Icon.label` を渡すと accessible name が二重になるため避ける。
- **サイズの選び方**: テキスト併用 / インラインは `size={16}`（デフォルト）。アイコンのみボタン・確認ダイアログのアイキャッチは `size={20}`。空状態のアイキャッチは `size={24}`。
- **配色**: 親要素の `text-*` トークン（`text-ink` / `text-ink-secondary` / `text-ink-tertiary` / `text-warning` 等）を継承する（`currentColor`）。
- **`className` の使い方**: `Icon` の `className` には ①色用の `text-*` トークン、②レイアウト用補助クラス（`absolute` / `left-*` / `top-*` / `translate-*` / `pointer-events-none` / `block` / `mx-auto` / `mb-*` 等）を渡してよい。一方で `w-*` / `h-*` / `size-*` のような寸法ユーティリティは渡さない（寸法の真実は `size` prop の SSOT）。空状態のアイキャッチには `EMPTY_STATE_ICON` 定数（`layout/styles.ts`）を使う。

---

## 8. アクセシビリティ

- **コントラスト**: WCAG AA 以上 (本文 4.5:1、UI 3:1)。
  - `--color-ink` (#1d1d1f) on `--color-bg` (#fff) = 17.3:1 ✅
  - `--color-ink-secondary` (#6e6e73) on `--color-bg` = 5.0:1 ✅
  - `--color-ink-tertiary` (#86868b) on `--color-bg` = 3.6:1 → 本文では使わず、補助情報・プレースホルダー専用
  - `--color-accent` (`oklch(37.1% 0 0)`) on `--color-bg` = 9.3:1 ✅（無彩色アクセント、リンク・UIとも AAA 相当）
- **フォーカス**: すべてのインタラクティブ要素で `:focus-visible` 時に `--shadow-focus` を表示。outline はリセットしない実装（`outline-offset` で代替可）。
- **キーボード操作**: モーダル/Drawer のフォーカストラップ、`Escape` でクローズ。Tab 順は DOM 順。
- **代替テキスト**: 装飾的アイコンは `aria-hidden="true"`、意味を持つ場合は `aria-label`。
- **動きの抑制**: `@media (prefers-reduced-motion: reduce)` で `transition-duration: 0.01ms` をすべての transition / animation に適用。
- **スクリーンリーダー**: ステータスピル (Private / Link / Public) はアイコン色だけでなくテキストでも識別できるようにする。

---

## 9. 実装上の取り決め

- すべての HTML 試作 (`spec/design/pages/*.html`) は単一ファイルでブラウザ表示可能にする。CSS はインライン (`<style>`)、依存は不要。
- `:root` のトークンは [`spec/design/tokens.md`](./tokens.md) の「ルート定義の最終形」をそのままコピーして使う。
- ローカル変数 (`--bg`, `--ink` などドラフト時の短縮名) は使わず、トークンの正式名 (`--color-bg` 等) を使う。
- 各ページの構造的な共通要素（ヘッダー、サイドバー、ドロワー開閉スクリプト）は **画面ごとに同じマークアップ** を貼る。Phase 3 の段階ではコンポーネント化しない（あくまで設計の HTML プロトタイプ）。
- レスポンシブは `min-width` ベース。例外として、グローバルな mobile fix（44px タップ領域の確保等）や、特定のブレークポイント範囲のみに適用したいスタイルでは `max-width` メディアクエリも使用してよい。
- **アップロードモーダル**（P13 主動線）は `app/components/common/Dialog.tsx` primitive と既存 `MoveNoteDialog` / `SaveViewDialog` 等のパターンに準拠する。モーダル UI のビジュアルモックは [`pages/P13-upload-modal.html`](./pages/P13-upload-modal.html) に置き、フォールバックページは [`pages/P13-upload.html`](./pages/P13-upload.html) として並列に残す。

---

## フィードバック・エラー表示原則（#221）

- **インタラクションの即時 feedback**: 非同期処理を伴うボタンは押下直後に disabled + ローディング状態を出す。スケルトンを優先し、スピナーは避ける。
- **バックグラウンド進捗**: 取り込み・エクスポート等のジョブは client polling で進捗を可視化する。間隔は active job がある間は 1.5〜4 秒、無い間は 16 秒以上に伸ばす（負荷とフレッシュ感のバランス）。
- **`aria-live`**: 状態遷移・完了・失敗の通知は `aria-live="polite"`（通常）／`assertive`（エラーで即時通知が必要な場合のみ）を使う。
- **エラー文言**:
  - サーバーからは `SerializedError`（`kind`-tagged union + `code`）が届く。UI 側は **`app/core/presentation/errorDisplay.ts`** のマッピングを単一の真実とし、`displayError(error)` / `displayJobErrorCode(code)` 経由でのみ文言化する。
  - 文言は「何が起きたか + 何をすればいいか」の 2 部構成。例: 「このファイル形式には対応していません。HTML / Markdown / Office / PDF / 画像 / 音声 形式でお試しください」。
  - 内部 stack / 原文 message / 内部 errorCode は **絶対に UI に出さない**（presentation 層の `redactForClient` で system/unknown を遮蔽、business code はマッピングテーブル経由のみ）。
- **トースト基盤**: 現状はコンポーネント内 `aria-live` 領域で局所通知する。グローバルトーストはフォローアップ課題として保留。

---

## 10. スコープ外

本デザインフェーズでは扱わない:

- **ダークモード** (将来 `[data-theme="dark"]` で導入予定。トークン定義の延長で対応可能な構造にしてある)。
- **テーマ切替の管理画面 (P43) の運用設計** (P43 自体はデザイン対象だが、ユーザーがトークンを変更したときのプレビュー機構や検証は別フェーズ)。
- **印刷用スタイル**。
- **国際化 (言語切替 UI)**。
- **モーション凝った演出**。Apple Calm のトーンを守るため、装飾アニメーションは入れない。

---

## 11. 参照

- [`spec/design/tokens.md`](./tokens.md) — CSS カスタムプロパティの正準定義
- [`spec/design/drafts/draft-4-apple-calm-list.html`](./drafts/draft-4-apple-calm-list.html) — 採用方向性 (P10 リスト) のドラフト
- [`spec/design/drafts/draft-4-apple-calm-detail.html`](./drafts/draft-4-apple-calm-detail.html) — 採用方向性 (P11 詳細) のドラフト
- [`spec/pages/index.md`](../pages/index.md) — 全画面の機能仕様
- [`spec/scenario/index.md`](../scenario/index.md) — シナリオ
