# デザイントークン

Hollow の UI で使用する CSS カスタムプロパティの正準定義。
方向性は **Apple Calm**（apple.com / iCloud 系のミニマリズム + GitHub Markdown 互換の本文表示）。

すべての画面 (`spec/design/pages/*.html`) でこのトークンを参照する。値の追加・変更はこのファイルを正としてから各画面に反映する。

---

## 1. カラー

### 1.1 ブランド / アクセント

| 用途 | プロパティ | OKLCH |
|------|-----------|-------|
| Primary (Accent) | `--color-accent` | `oklch(37.1% 0 0)` |
| Accent hover | `--color-accent-hover` | `oklch(43.9% 0 0)` |
| Accent pressed | `--color-accent-pressed` | `oklch(26.9% 0 0)` |
| Accent surface (淡背景) | `--color-accent-surface` | `oklch(97% 0 0)` |
| Accent ink (淡背景上文字) | `--color-accent-ink` | `oklch(26.9% 0 0)` |
| Accent surface hover | （ホバー値） | `oklch(92.2% 0 0)` |

ブランドカラーは無彩色のグレースケール（Neutral）を主体に使う。色相は持たず、明度のみで階調を作ることで、コンテンツの色味を邪魔せず、普遍的でタイムレスなトーンを保つ。彩度の高い別アクセントは追加しない。

### 1.2 ニュートラル / インク

| 用途 | プロパティ | HEX | OKLCH |
|------|-----------|-----|-------|
| Page BG | `--color-bg` | `#ffffff` | `oklch(1 0 0)` |
| Surface (淡グレー、入力欄・ボタン背景) | `--color-surface` | `#f5f5f7` | `oklch(0.967 0.002 286.4)` |
| Surface hover | `--color-surface-hover` | `#ececef` | `oklch(0.942 0.003 286.4)` |
| Surface elevated (浮上カード) | `--color-surface-elevated` | `#fbfbfd` | `oklch(0.989 0.001 286.4)` |
| Ink primary | `--color-ink` | `#1d1d1f` | `oklch(0.241 0.005 286.0)` |
| Ink secondary | `--color-ink-secondary` | `#6e6e73` | `oklch(0.515 0.005 286.4)` |
| Ink tertiary | `--color-ink-tertiary` | `#86868b` | `oklch(0.612 0.005 286.0)` |
| Hairline (区切り線、標準) | `--color-hairline` | `rgba(60,60,67,0.12)` | — |
| Hairline strong (区切り線、強) | `--color-hairline-strong` | `rgba(60,60,67,0.18)` | — |

ニュートラルは「ほぼ無彩色 + ごくわずかな寒色寄り」。50/100/200… の段階スケールは持たず、上記の固定 8 段階で十分。

### 1.3 セマンティック

| 用途 | プロパティ | HEX |
|------|-----------|-----|
| Success | `--color-success` | `#1f8f3a` |
| Success surface | `--color-success-surface` | `#e6f4ea` |
| Warning | `--color-warning` | `#a8580b` |
| Warning surface | `--color-warning-surface` | `#fdf3e7` |
| Error | `--color-error` | `#c43e3e` |
| Error surface | `--color-error-surface` | `#fbebeb` |
| Info | `--color-info` | `var(--color-accent)` |

セマンティックカラーも淡色を使い、強い赤・黄を多用しない。

### 1.4 公開ステータス用

| 状態 | プロパティ | HEX |
|------|-----------|-----|
| Private dot | `--color-status-private` | `#86868b` |
| Link-only dot | `--color-status-link` | `#a8580b` |
| Public dot | `--color-status-public` | `#1f8f3a` |

ピル＋小ドットの組み合わせで使用する。

### 1.5 コードハイライト（本文内）

| トークン | プロパティ | HEX |
|---------|-----------|-----|
| Keyword | `--code-keyword` | `#aa3e3e` |
| String | `--code-string` | `#2a8c4f` |
| Comment | `--code-comment` | `var(--color-ink-tertiary)` |
| Function | `--code-function` | `#5b3da1` |
| Number | `--code-number` | `#1d6fd6` |

GitHub Markdown 風の本文レンダリングでも、配色は Apple 側に寄せたやや低彩度のセットを使う。

---

## 2. タイポグラフィ

### 2.1 フォントファミリー

```css
--font-sans:
  "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN",
  "Hiragino Sans", Meiryo, sans-serif;

--font-mono:
  "SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
  Consolas, "Liberation Mono", "Courier New", monospace;

--font-heading: var(--font-sans);
--font-body: var(--font-sans);
```

見出しと本文で別フォントは使わない（Helvetica Neue / Hiragino Kaku Gothic ProN を基準にサンセリフ統一）。Google Fonts はロードしない方針（システムフォント前提）。本文中の `<code>` / `<pre>` のみ `--font-mono`。

### 2.2 サイズスケール

`clamp(min, fluid, max)` で流動的に変化させる。

| プロパティ | 値 | 用途 |
|-----------|----|----|
| `--text-xs` | `clamp(11px, 0.7vw + 9px, 12px)` | キャプション、メタ、ステータス |
| `--text-sm` | `clamp(12px, 0.8vw + 10px, 13px)` | 補助テキスト、ラベル |
| `--text-base` | `clamp(14px, 1vw + 11px, 16px)` | 本文（ノートの本文は 16px 基準） |
| `--text-md` | `clamp(15px, 1vw + 12px, 17px)` | リスト行のタイトル等 |
| `--text-lg` | `clamp(17px, 1.2vw + 13px, 19px)` | h3 |
| `--text-xl` | `clamp(20px, 1.4vw + 14px, 24px)` | h2、セクション見出し |
| `--text-2xl` | `clamp(24px, 2vw + 16px, 30px)` | h1（本文内） |
| `--text-3xl` | `clamp(22px, 4vw, 40px)` | ページタイトル / ノートタイトル |
| `--text-mono` | `clamp(12.5px, 0.6vw + 11px, 13.5px)` | code / pre |

UI 部分の標準サイズは `--text-sm` または `--text-md`。本文（ノートレンダリング部）は `--text-base` を 16px に固定し、可読性を優先する。

### 2.3 ウェイト

| プロパティ | 値 | 用途 |
|-----------|----|----|
| `--weight-regular` | 400 | 本文、補助テキスト |
| `--weight-medium` | 500 | UI ラベル、ナビ active |
| `--weight-semibold` | 600 | h2 / h3、強調 |
| `--weight-light` | 300 | ロゴ、巨大タイトル（オプション） |

Apple 風の「軽量見出し」が肝。`--text-3xl` の見出しは `--weight-regular` で使う（draft の `font-weight: 400` 系）。

### 2.4 行間・字間

| プロパティ | 値 | 用途 |
|-----------|----|----|
| `--leading-tight` | `1.2` | 大見出し |
| `--leading-snug` | `1.35` | h2 / h3 |
| `--leading-normal` | `1.5` | UI 一般 |
| `--leading-relaxed` | `1.7` | 本文（ノート） |
| `--tracking-tightest` | `-0.022em` | 巨大タイトル |
| `--tracking-tighter` | `-0.014em` | h2 |
| `--tracking-tight` | `-0.008em` | h3 |
| `--tracking-normal` | `-0.003em` | 本文・UI |

字間を「ほんの少しタイト」にすることが Apple Calm の印象差を生む。

---

## 3. スペーシング

4px ベース。`--space-X` の数値部分はピクセルではなく段階インデックス。

| プロパティ | 値 | 用途目安 |
|-----------|----|---------|
| `--space-0` | `0` | — |
| `--space-1` | `4px` | アイコンとラベル間 |
| `--space-2` | `8px` | 行間、小ギャップ |
| `--space-3` | `12px` | 行内ギャップ |
| `--space-4` | `16px` | カード内パディング |
| `--space-5` | `20px` | カードパディング、列ギャップ |
| `--space-6` | `24px` | セクション内 |
| `--space-8` | `32px` | セクション間（小） |
| `--space-10` | `40px` | セクション間（中） |
| `--space-12` | `48px` | セクション間（大） |
| `--space-16` | `64px` | ページ上下マージン |
| `--space-20` | `80px` | ヒーロー領域 |

UI の標準パディングは `--space-4`〜`--space-6`、ページ全体の上下余白は `--space-12`〜`--space-16` を基準にする。

---

## 4. レイアウト

```css
--container-max: 1280px;
--container-padding: clamp(16px, 4vw, 32px);

--sidebar-width: 260px;         /* lg 以上で常時表示 */
--meta-rail-width: 260px;       /* lg 以上で右レール表示 */

--content-max: 760px;           /* ノート本文の読みやすい行長 */
--header-height: 64px;
```

`--content-max: 760px` は GitHub のリーダブル幅（約 76 行）と Apple 系の読み物 UI の中間。ノート詳細ではこれを上限とし、それ以上にコンテンツが広がらないようにする。

---

## 5. ボーダー半径

| プロパティ | 値 | 用途 |
|-----------|----|----|
| `--radius-xs` | `4px` | インライン code、小タグ |
| `--radius-sm` | `6px` | 小ボタン、小チップ |
| `--radius-md` | `8px` | ナビ項目、カード（小） |
| `--radius-lg` | `12px` | カード、コードブロック、画像 |
| `--radius-xl` | `16px` | モーダル、大カード |
| `--radius-pill` | `980px` | ピルボタン、検索バー、ステータスピル |
| `--radius-full` | `9999px` | アバター、ドット |

「カードのコーナーは少しだけ大きめ (12px)、ピルは完全な丸」が Apple Calm の指紋。

---

## 6. シャドウ

シャドウは最小限。ホバー / 浮上が必要な要素のみ。

| プロパティ | 値 | 用途 |
|-----------|----|----|
| `--shadow-none` | `none` | デフォルト |
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.04)` | 浮上カード（控えめ） |
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.06)` | ドロップダウン |
| `--shadow-md` | `0 8px 24px rgba(0,0,0,0.08)` | モーダル、ポップオーバー |
| `--shadow-focus` | `0 0 0 4px oklch(37.1% 0 0 / 0.28)` | フォーカスリング |

ベース UI はシャドウなし。区切りはヘアラインで作る。

---

## 7. トランジション

```css
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--ease-decel: cubic-bezier(0, 0, 0.2, 1);
--ease-accel: cubic-bezier(0.4, 0, 1, 1);

--duration-fast: 120ms;
--duration-base: 180ms;
--duration-slow: 280ms;

--transition-default: all var(--duration-base) var(--ease-standard);
--transition-bg: background-color var(--duration-fast) var(--ease-standard);
--transition-color: color var(--duration-fast) var(--ease-standard);
```

UI のホバー・フォーカスは `--duration-fast` で素早く反応させる。

---

## 8. ブレークポイント

| 名前 | 最小幅 | メディアクエリ | このプロジェクトでの主な切り替え |
|------|--------|----------------|------------------------------|
| (base) | 0 | （未指定） | サイドバーは drawer、メタ情報は本文下に縦積み |
| `sm` | 640px | `@media (min-width: 640px)` | 一部の余白を拡大、リストのメタ情報を 1 行化 |
| `md` | 768px | `@media (min-width: 768px)` | フィルタバーの折り返しを抑制 |
| `lg` | 1024px | `@media (min-width: 1024px)` | サイドバー常時表示、ノート詳細の右メタレールを表示 |
| `xl` | 1280px | `@media (min-width: 1280px)` | コンテンツ最大幅で中央寄せ |
| `2xl` | 1536px | `@media (min-width: 1536px)` | 余白増加のみ（カラム構成は変えない） |

```css
--bp-sm: 640px;
--bp-md: 768px;
--bp-lg: 1024px;
--bp-xl: 1280px;
--bp-2xl: 1536px;
```

CSS カスタムプロパティはメディアクエリ条件式で評価できないため、メディアクエリ自体には数値リテラルを書く。

---

## 9. ヘッダー（透過＋ blur）

Apple Calm の象徴的な要素。

```css
--header-bg: rgba(255,255,255,0.85);
--header-blur: saturate(180%) blur(20px);
--header-border: 1px solid var(--color-hairline);
```

`position: sticky; top: 0;` で固定し、`backdrop-filter: var(--header-blur)` を適用する。`backdrop-filter` 非対応環境では `--header-bg` を不透明 `#ffffff` にフォールバック（`@supports not (backdrop-filter: blur(1px))`）。

---

## 10. フォーカスリング

```css
:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
  border-radius: inherit;
}
```

すべてのインタラクティブ要素に共通適用する。クリック / タップ起因では表示しない（`:focus-visible` のみ）。

---

## 10.5 チェックボックス / 選択状態の視覚

「**フォームの選択肢としてのチェックボックス**」と「**リストの複数選択 UI**」を視覚的に分離する。混同すると、選択操作のたびにフォーム入力中のような硬さが出てしまうため。

### A. フォーム用チェックボックス（ネイティブ）

利用規約への同意、ログイン情報の保存、削除確認など、**「フォームの一項目として on/off を入力する」**用途では、ブラウザのネイティブ描画をそのまま使う。`accent-color` でブランドカラーに寄せるだけに留めて、`appearance: none` のカスタム描画はしない。理由:

- OS / ブラウザのアクセシビリティ機能（ハイコントラスト、フォーカスインジケータ等）に乗れる
- ユーザーが慣れ親しんだ操作感がそのまま使える
- 設計コストとメンテナンスを抑えられる

```css
.checkbox-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--color-accent);
  flex-shrink: 0;
  cursor: pointer;
}
```

### B. リスト複数選択用インジケータ（カスタム）

ノート一覧・ファイル一覧・テーブル行などで「複数の項目を選んで一括操作する」場合は、フォーム用チェックボックスとは違う視覚要素を使う。Apple Mail / Photos / Files で採用されている **円形の選択インジケータ** に揃える。

仕様:

- 円形 20px、ホバー時のみ表示（デフォルトは `opacity: 0`）
- 未選択: 透明背景 + hairline 枠
- ホバー: 枠色 `var(--color-ink-secondary)`
- 選択: アクセントカラーで塗りつぶし + 白いチェック SVG（`opacity: 1` で常時表示）

```css
.select-indicator {
  width: 20px; height: 20px;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--color-hairline-strong);
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-standard),
              background-color var(--duration-fast) var(--ease-standard),
              border-color var(--duration-fast) var(--ease-standard);
}
.row:hover .select-indicator { opacity: 1; }
.select-indicator:hover { border-color: var(--color-ink-secondary); }
.select-indicator.checked {
  opacity: 1;
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}
```

### 例外: 管理画面テーブル

管理画面の `P45 ユーザー管理` のような**密度の高いテーブル**では、円形インジケータより一般的な四角チェックボックスの方が「テーブル UI のコンベンション」として馴染む。この場合はネイティブの `<input type="checkbox">` を `accent-color` だけで色付けする A 案を採用する。リストカード型 UI（P10 など）は B 案、テーブル型 UI（P45 など）は A 案、と覚える。

### ラベル併設時のレイアウト

フォーム用チェックボックスは複数行ラベル（規約同意文、警告文、説明など）と横並びになることが多い。**必ず `align-items: flex-start`** を指定し、1 行目の高さに揃える。チェックボックス側に `margin-top: 2px` を加えると活字との視覚的位置がより合う。

```css
.checkbox-row {
  display: flex;
  align-items: flex-start;     /* ← center にしない */
  gap: var(--space-3);
  cursor: pointer;
}
.checkbox-row input[type="checkbox"] { margin-top: 2px; }
```

---

## 10.6 アイコン / 視覚要素 + 複数行コンテンツの整列

リスト行・カード・カラウト・セッション行などで、左端のアイコン（または 24〜40px 程度のサムネ・アバター・ステータスドット）の右側にタイトル + サブテキスト（2 行以上）を並べる場合、**`align-items: center` にしない**。複数行のテキストを縦中央に寄せると、アイコンが「タイトルとサブテキストの隙間」に浮いて見えてバランスを崩す。

正しい設定は次のいずれか:

- フレックス: `align-items: flex-start`
- グリッド: `align-items: start`

必要に応じてアイコン側に `margin-top: 2〜4px` を足し、視覚的にタイトル 1 行目のベースラインに揃える。

```css
.row-with-icon {
  display: flex;
  align-items: flex-start;     /* ← center にしない */
  gap: var(--space-3);
}
.row-with-icon .icon { margin-top: 2px; }
```

逆に、コンテンツが**確実に 1 行**（`white-space: nowrap` で省略するなど）の場合は `center` でよい。判断軸は「テキストが折り返す / 縦に積まれる可能性があるかどうか」。

---

## 11. ルート定義の最終形（コピペ用）

```css
:root {
  /* Color: brand */
  --color-accent: oklch(37.1% 0 0);
  --color-accent-hover: oklch(43.9% 0 0);
  --color-accent-pressed: oklch(26.9% 0 0);
  --color-accent-surface: oklch(97% 0 0);
  --color-accent-ink: oklch(26.9% 0 0);

  /* Color: neutral */
  --color-bg: #ffffff;
  --color-surface: #f5f5f7;
  --color-surface-hover: #ececef;
  --color-surface-elevated: #fbfbfd;
  --color-ink: #1d1d1f;
  --color-ink-secondary: #6e6e73;
  --color-ink-tertiary: #86868b;
  --color-hairline: rgba(60,60,67,0.12);
  --color-hairline-strong: rgba(60,60,67,0.18);

  /* Color: semantic */
  --color-success: #1f8f3a;
  --color-success-surface: #e6f4ea;
  --color-warning: #a8580b;
  --color-warning-surface: #fdf3e7;
  --color-error: #c43e3e;
  --color-error-surface: #fbebeb;
  --color-info: var(--color-accent);

  /* Color: publish status */
  --color-status-private: #86868b;
  --color-status-link: #a8580b;
  --color-status-public: #1f8f3a;

  /* Color: code */
  --code-keyword: #aa3e3e;
  --code-string: #2a8c4f;
  --code-comment: var(--color-ink-tertiary);
  --code-function: #5b3da1;
  --code-number: #1d6fd6;

  /* Typography */
  --font-sans: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
  --font-mono: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  --font-heading: var(--font-sans);
  --font-body: var(--font-sans);

  --text-xs: clamp(11px, 0.7vw + 9px, 12px);
  --text-sm: clamp(12px, 0.8vw + 10px, 13px);
  --text-base: clamp(14px, 1vw + 11px, 16px);
  --text-md: clamp(15px, 1vw + 12px, 17px);
  --text-lg: clamp(17px, 1.2vw + 13px, 19px);
  --text-xl: clamp(20px, 1.4vw + 14px, 24px);
  --text-2xl: clamp(24px, 2vw + 16px, 30px);
  --text-3xl: clamp(22px, 4vw, 40px);
  --text-mono: clamp(12.5px, 0.6vw + 11px, 13.5px);

  --weight-light: 300;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;

  --leading-tight: 1.2;
  --leading-snug: 1.35;
  --leading-normal: 1.5;
  --leading-relaxed: 1.7;

  --tracking-tightest: -0.022em;
  --tracking-tighter: -0.014em;
  --tracking-tight: -0.008em;
  --tracking-normal: -0.003em;

  /* Spacing */
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;

  /* Layout */
  --container-max: 1280px;
  --container-padding: clamp(16px, 4vw, 32px);
  --sidebar-width: 260px;
  --meta-rail-width: 260px;
  --content-max: 760px;
  --header-height: 64px;

  /* Radius */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 980px;
  --radius-full: 9999px;

  /* Shadow */
  --shadow-none: none;
  --shadow-xs: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.06);
  --shadow-md: 0 8px 24px rgba(0,0,0,0.08);
  --shadow-focus: 0 0 0 4px oklch(37.1% 0 0 / 0.28);

  /* Motion */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-decel: cubic-bezier(0, 0, 0.2, 1);
  --ease-accel: cubic-bezier(0.4, 0, 1, 1);
  --duration-fast: 120ms;
  --duration-base: 180ms;
  --duration-slow: 280ms;
  --transition-default: all var(--duration-base) var(--ease-standard);
  --transition-bg: background-color var(--duration-fast) var(--ease-standard);
  --transition-color: color var(--duration-fast) var(--ease-standard);

  /* Header */
  --header-bg: rgba(255,255,255,0.85);
  --header-blur: saturate(180%) blur(20px);

  /* Breakpoints (参照用) */
  --bp-sm: 640px;
  --bp-md: 768px;
  --bp-lg: 1024px;
  --bp-xl: 1280px;
  --bp-2xl: 1536px;
}
```

---

## 12. ダークモード / 管理画面のテーマ拡張

スコープ外。本フェーズでは扱わない。
将来導入する場合は `[data-theme="dark"]` で `:root` の値を上書きする方針のみ確定（実装はしない）。

P43 管理: デザイントークン設定画面 で、ユーザーがインスタンス単位で上書きできるトークンを定義する想定。上書き対象は本ファイルの「Color: brand」「Color: neutral (Surface 系)」「Radius」「Typography (`--font-sans`)」「Color: code」の各セクションを想定する。
