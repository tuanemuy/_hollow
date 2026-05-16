# UI コンポーネント定義

Hollow の UI を構成するコンポーネントの正準定義。
`tokens.md` が「色・寸法・タイポの語彙」を定義するのに対し、本ドキュメントは「その語彙で組み立てたコンポーネントの形」を定義する。

実装は **React + CSS Modules / Tailwind ではなく素の CSS クラス** を前提とする。
各画面 (`spec/design/pages/*.html`) は本ファイルで定義された CSS クラスのみを使って組み立てる。
画面固有のコンポーネントクラスを新規定義してはならない（命名重複と寸法ずれの根因になるため）。

トークンは追加しない。ハードコードされた数値（14px、30px、28px など）はコンポーネント側に閉じ込め、画面側からは class 名のみで参照させる。

---

## 0. 設計原則

- **クラス命名は BEM 風 modifier**: `.btn` / `.btn-sm` / `.btn-primary`。React 側では `<Button variant="primary" size="sm">` のように props で抽象化し、内部で class 名を組み立てる。
- **size と variant は直交**: 任意の size と任意の variant を組み合わせ可能にする（例: `.btn-sm.btn-danger-soft`）。
- **トークン参照の徹底**: コンポーネント定義内では `var(--*)` を経由する。例外として、本ドキュメントに登場するハードコード値（14px, 30px 等）はコンポーネント固有の固定値として許容する。
- **モバイル時の最小タップターゲット 44px** は `@media (max-width: 639px)` のグローバル fix で吸収する（各コンポーネントが個別に対応しない）。

---

## 1. Button — `.btn`

### React シグネチャ

```tsx
type ButtonProps = {
  variant?: "default" | "primary" | "ghost" | "danger" | "dangerSoft" | "destructive";
  size?: "form-lg" | "form-md" | "md" | "sm" | "xs";
  block?: boolean;          // 横幅 100%
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;
```

### サイズ

| size | height | padding | font / weight | radius | 用途 |
|------|--------|---------|---------------|--------|------|
| `form-lg` | 48px | `0 var(--space-8)` (min-width 200px) | `--text-md` / medium | pill | フォームの送信ボタン（アカウント作成、ログイン、保存）。1 画面に 1 つだけ。 |
| `form-md` | 44px | `0 var(--space-6)` | `--text-sm` / medium | pill | フォームの副ボタン（戻る、再送）。`form-lg` と縦に並ぶ。 |
| `md` (default) | 36px | `0 var(--space-4)` | `--text-sm` / medium | pill | 標準。ヘッダ右の「新規」、ツールバー、モーダル内など。 |
| `sm` | 32px | `0 14px` | `--text-sm` / medium | pill | リスト行の常時表示アクション、ブラックリスト解除、設定行内アクション。 |
| `xs` | 28px | `0 10px` | `--text-xs` / medium | `--radius-sm` | リスト hover で出現する小アクション（編集／統合／ブラックリスト等）。pill ではなく角丸にして「行内に紛れる」印象を出す。 |

### バリアント

| variant | 背景 | 文字 | hover | 用途 |
|---------|------|------|-------|------|
| `default` | `--color-surface` | `--color-ink` | `--color-surface-hover` | 中性ボタン |
| `primary` | `--color-accent` | `#fff` | `--color-accent-hover` | 主操作（保存・送信・新規）|
| `ghost` | 透明 | `--color-ink` | `--color-surface` | カード内・ヘッダ内の軽量ボタン |
| `danger` | `--color-error` | `#fff` | やや暗い赤 | 取り返しのつかない操作の確定（削除確定、アカウント削除）|
| `dangerSoft` | 透明 | `--color-error` | `--color-error-surface` | 危険操作だが頻度が低い・トーンを抑えたい場面（セッション失効、トークン無効化）|
| `destructive` | 透明 | `--color-ink-secondary` | `--color-error-surface` + 文字 `--color-error` | リスト hover で出る「ブラックリスト」「削除」など。通常時はトーンを抑え、hover で赤を見せる |

### CSS

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  border: none;
  cursor: pointer;
  transition: var(--transition-bg);
}
.btn:hover { background: var(--color-surface-hover); }
.btn:active { background: var(--color-hairline); }

/* sizes */
.btn-form-lg {
  height: 48px;
  padding: 0 var(--space-8);
  min-width: 200px;
  font-size: var(--text-md);
}
.btn-form-md {
  height: 44px;
  padding: 0 var(--space-6);
}
.btn-sm  { height: 32px; padding: 0 14px; }
.btn-xs  {
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
}

/* variants */
.btn-primary {
  background: var(--color-accent);
  color: #fff;
}
.btn-primary:hover  { background: var(--color-accent-hover); }
.btn-primary:active { background: var(--color-accent-pressed); }

.btn-ghost {
  background: transparent;
}
.btn-ghost:hover  { background: var(--color-surface); }
.btn-ghost:active { background: var(--color-surface-hover); }

.btn-danger {
  background: var(--color-error);
  color: #fff;
}
.btn-danger:hover  { background: #b03535; }
.btn-danger:active { background: #9c2f2f; }

.btn-danger-soft {
  background: transparent;
  color: var(--color-error);
}
.btn-danger-soft:hover { background: var(--color-error-surface); }

.btn-destructive {
  background: transparent;
  color: var(--color-ink-secondary);
}
.btn-destructive:hover {
  background: var(--color-error-surface);
  color: var(--color-error);
}

/* layout modifier */
.btn-block { width: 100%; }

/* mobile tap target */
@media (max-width: 639px) {
  .btn,
  .btn-sm,
  .btn-xs {
    min-height: 44px;
  }
}
```

### 使用例

```html
<!-- ヘッダの主操作 -->
<button class="btn btn-primary">
  <svg ...>...</svg>
  新規
</button>

<!-- フォーム送信 -->
<button class="btn btn-form-lg btn-primary btn-block">アカウントを作成</button>

<!-- リスト行 hover で出る編集 -->
<button class="btn btn-xs">編集</button>

<!-- リスト行 hover で出るブラックリスト化 -->
<button class="btn btn-xs btn-destructive">ブラックリスト</button>
```

### Do / Don't

- ❌ `.pill-btn` / `.btn-primary`（フォーム用）/ `.text-action` などの旧クラスを新規に使わない。すべて `.btn-*` 系に統合する。
- ❌ `.btn-xs` を pill にしない。リストに紛れる用途で radius-sm 固定。
- ❌ ページ側で `height` や `padding` を上書きしない。サイズが合わない場合は size modifier を選び直す。

---

## 2. IconButton — `.icon-btn`

### React シグネチャ

```tsx
type IconButtonProps = {
  variant?: "filled" | "ghost";
  size?: "md" | "sm";
  tone?: "default" | "accent";    // 編集ブロック内など accent-ink を使いたい場合
  "aria-label": string;            // 必須
  children: ReactNode;             // SVG
} & ButtonHTMLAttributes<HTMLButtonElement>;
```

### サイズ・バリアント

| 組み合わせ | サイズ | 背景 | 用途 |
|-----------|--------|------|------|
| `filled` × `md` | 36×36 | `--color-surface` | デフォルト。ツールバー、カード右上など |
| `ghost` × `md` | 36×36 | 透明（hover で surface） | ヘッダのハンバーガー、行 kebab、編集パネルの閉じる、ディレクトリ kebab |
| `filled` × `sm` | 30×30 | `--color-surface` | 管理画面テーブルの行内アイコン |
| `ghost` × `sm` | 30×30 | 透明（hover で surface） | リスト hover で出るアイコンアクション（trash の編集・復元・削除） |

radius はすべて `--radius-full`。

### CSS

```css
.icon-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-ink);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: var(--transition-bg);
}
.icon-btn:hover  { background: var(--color-surface-hover); }
.icon-btn:active { background: var(--color-hairline); }

/* variants */
.icon-btn-ghost {
  background: transparent;
}
.icon-btn-ghost:hover  { background: var(--color-surface); }
.icon-btn-ghost:active { background: var(--color-surface-hover); }

/* tones */
.icon-btn-accent {
  color: var(--color-accent-ink);
}
.icon-btn-accent.icon-btn-ghost:hover {
  background: rgba(255, 255, 255, 0.6);   /* accent-surface 上で使う想定 */
}

/* sizes */
.icon-btn-sm {
  width: 30px;
  height: 30px;
}

/* mobile tap target */
@media (max-width: 639px) {
  .icon-btn,
  .icon-btn-sm {
    min-width: 44px;
    min-height: 44px;
  }
}
```

### 使用例

```html
<!-- ヘッダのハンバーガー -->
<button class="icon-btn icon-btn-ghost" aria-label="メニュー">
  <svg>...</svg>
</button>

<!-- 行内 kebab（モバイル） -->
<button class="icon-btn icon-btn-ghost" aria-label="操作メニュー">
  <svg>... kebab ...</svg>
</button>

<!-- 編集パネルの閉じる（accent-surface 上） -->
<button class="icon-btn icon-btn-ghost icon-btn-accent" aria-label="編集を閉じる">
  <svg>... × ...</svg>
</button>

<!-- 行内アイコンアクション（trash の復元・削除） -->
<button class="icon-btn icon-btn-ghost icon-btn-sm" aria-label="復元">
  <svg>...</svg>
</button>
```

### Do / Don't

- ❌ `border-radius: 50%` と書かない（`--radius-full` を使う）。
- ❌ `.menu-btn` / `.row-kebab` / `.editing-close` / `.icon-action` / `.btn.icon-only` などの旧クラスを新規に使わない。すべて `.icon-btn-*` で表現可能。
- ✅ SVG のサイズは内側で 14〜20px。アイコンサイズは画面側で `width="16" height="16"` のように直接指定する。

---

## 3. ListRow — `.list-row`

### React シグネチャ

```tsx
type ListRowProps = {
  columns: string;                         // grid-template-columns をそのまま渡す
  actionMode?: "hover" | "always" | "kebab-mobile";
  density?: "default" | "compact";
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

type ListRowActionsProps = {
  children: ReactNode;
};
```

### 用途

「区切り線 + 1 行 = 1 アイテム」のリスト UI。カード型ではなくテーブル風の密度を取りたいときに使う。
- 採用: タグ管理 (P18), ゴミ箱 (P17), ノート一覧 (P10/P30), セッション (P22), トークン (P43)
- 不採用: 管理画面の高密度テーブル（P45 など）は素の `<table>` に `.table` クラスを当てる別系統で扱う

### アクション表示モード

| mode | 挙動 | 用途 |
|------|------|------|
| `hover` | デスクトップ: hover で opacity 0→1。モバイル: アクション非表示 + `icon-btn-ghost` の kebab に集約 | タグ管理、ノート一覧、ゴミ箱（行数が多く、視覚ノイズを抑えたい） |
| `always` | デスクトップ・モバイルとも常時表示 | 設定画面のセッション行、トークン一覧（行数が少なく、アクションを目立たせたい） |
| `kebab-mobile` | デスクトップ: 常時表示。モバイル: kebab に集約 | 中間。デスクトップで読み流したい場合 |

### CSS

```css
.list-row {
  display: grid;
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-4) var(--space-3);
  border-bottom: 1px solid var(--color-hairline);
  transition: var(--transition-bg);
}
.list-row:first-of-type { border-top: 1px solid var(--color-hairline); }
.list-row:hover { background: var(--color-surface); }

.list-row-compact {
  padding: var(--space-3) var(--space-3);
  gap: var(--space-3);
}

/* アクション領域 */
.list-row-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

/* mode: hover */
.list-row-actions-hover {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-standard);
}
.list-row:hover .list-row-actions-hover,
.list-row:focus-within .list-row-actions-hover {
  opacity: 1;
}

/* mode: hover のモバイル時は kebab に集約 */
.list-row-kebab { display: none; }

@media (max-width: 1023px) {
  .list-row-actions-hover { display: none; }
  .list-row-kebab { display: inline-flex; }
}
```

カラム数（`grid-template-columns`）は画面ごとに異なるため、props として渡し、HTML 側はインライン style で適用する。React 実装では `style={{ gridTemplateColumns: columns }}` で渡す。HTML モックでも `style="grid-template-columns: 1fr 100px 160px auto;"` のように行内 style で書く（クラスにせず、画面ごとの個別性として受け入れる）。

### モバイル時のカラム再定義

モバイルでは多くの場合 1 カラム（タイトル + サブテキスト + 右端アクション）に潰す。これも画面側でメディアクエリ + インライン style ではなくクラス上書きで対応する：

```html
<div class="list-row" style="grid-template-columns: 1fr 100px 160px auto;">
  ...
</div>
```

```css
/* 画面側 CSS ではなく、コンポーネント側にデフォルト崩しを用意する */
@media (max-width: 1023px) {
  .list-row {
    grid-template-columns: 1fr auto !important;
  }
  .list-row > .list-row-meta { display: none; }
}
```

`.list-row-meta` は「モバイルで非表示にしてよい列」のマーカー。タグの件数や最終使用日のような補助情報を包む。

### 使用例

```html
<!-- タグ行（hover アクション） -->
<div class="list-row" style="grid-template-columns: 1fr 100px 160px auto;">
  <span class="tag-name">#research</span>
  <span class="list-row-meta tag-count">42 件</span>
  <span class="list-row-meta tag-last">最終: 今日 14:32</span>
  <span class="list-row-actions list-row-actions-hover">
    <button class="btn btn-xs">編集</button>
    <button class="btn btn-xs">統合</button>
    <button class="btn btn-xs btn-destructive">ブラックリスト</button>
  </span>
  <button class="icon-btn icon-btn-ghost list-row-kebab" aria-label="操作メニュー">
    <svg>...</svg>
  </button>
</div>

<!-- ブラックリスト行（常時表示アクション） -->
<div class="list-row" style="grid-template-columns: 1fr 1fr auto;">
  <span class="blacklist-tag">#todo</span>
  <span class="list-row-meta">2026/03/12 にブラックリスト化 · 元 142 件</span>
  <button class="btn btn-sm">ブラックリストから除外</button>
</div>
```

### Do / Don't

- ❌ `.tag-row` / `.blacklist-row` / `.trash-row` / `.note-row` / `.session-row` などの画面固有クラスを新規に作らない。
- ❌ `padding` を画面側で上書きしない。`compact` modifier で対応。
- ❌ アクションの hover-reveal を画面側で再実装しない。`list-row-actions-hover` を使う。

---

## 4. Segmented — `.segmented`

### React シグネチャ

```tsx
type SegmentedProps = {
  variant?: "default" | "translucent";  // accent-surface 上では translucent
  ariaLabel?: string;
  children: ReactNode;
};

type SegmentedItemProps = {
  active?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;
```

### CSS

外側 radius は `--radius-md`（8px）、内側 active の radius は既存トークンの `--radius-sm`（6px）に統一する（旧実装の 7px ハードコードを廃止）。

```css
.segmented {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: 2px;
  display: inline-flex;
}

.segmented-item {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-ink-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: var(--transition-default);
}
.segmented-item:hover:not(.active) { color: var(--color-ink); }
.segmented-item.active {
  background: var(--color-bg);
  color: var(--color-ink);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04);
}

/* variant: accent-surface 上で使う半透明背景 */
.segmented-translucent {
  background: rgba(255, 255, 255, 0.6);
}
```

### 使用例

```html
<div class="segmented" role="tablist" aria-label="並び順">
  <button class="segmented-item active">利用件数</button>
  <button class="segmented-item">名前</button>
  <button class="segmented-item">最終使用</button>
</div>

<!-- 編集パネル内（accent-surface 上） -->
<div class="segmented segmented-translucent" role="tablist" aria-label="操作モード">
  <button class="segmented-item active">編集</button>
  <button class="segmented-item">統合</button>
</div>
```

### Do / Don't

- ❌ `.mode-switch` を新規に作らない。`.segmented-translucent` で表現する。
- ❌ 外側 radius を `9px` と書かない。`--radius-md` を使う。

---

## 5. FilterChip — `.filter-chip`

### React シグネチャ

```tsx
type FilterChipProps = {
  active?: boolean;
  iconLeft?: ReactNode;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;
```

### 用途

ノート一覧やパブリックトップなどで使う「絞り込みピル」。
表示用のタグチップ（クリックできない、密度の高い小さい pill）は別概念として `.tag-chip` を切り、混同しない。

### CSS

```css
.filter-chip {
  height: 30px;
  padding: 0 13px;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: var(--transition-bg);
}
.filter-chip:hover { background: var(--color-surface-hover); }
.filter-chip.active {
  background: var(--color-accent-surface);
  color: var(--color-accent-ink);
}

@media (max-width: 639px) {
  .filter-chip { min-height: 44px; }
}
```

### 表示用タグチップ（`.tag-chip`）

```css
.tag-chip {
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-ink-secondary);
  font-size: var(--text-xs);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
```

クリックできない読み取り専用の表示用なので `<span>` で出す。

---

## 6. Tabs（アンダーライン式） — `.tabs`

### React シグネチャ

```tsx
type TabsProps = {
  ariaLabel?: string;
  children: ReactNode;
};
type TabProps = {
  active?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;
```

### 用途

セクション全体を切り替える大きめのタブ（管理画面のジョブ別タブなど）。
`.segmented` がオプションの並列選択（並び順、モードなど）であるのに対し、`.tabs` はページ内コンテンツの切替を担う。

### CSS

```css
.tabs {
  display: inline-flex;
  gap: var(--space-6);
  border-bottom: 1px solid var(--color-hairline);
}
.tab {
  height: 42px;
  padding: 0 2px;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-ink-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: var(--transition-color);
}
.tab:hover { color: var(--color-ink); }
.tab.active {
  color: var(--color-ink);
  border-bottom-color: var(--color-accent);
}
```

---

## 7. 旧クラス → 新クラス 移行マッピング

各画面を書き換える際の置換表。

### ボタン

| 旧 | 新 | 備考 |
|----|----|------|
| `.pill-btn` | `.btn` | 同義 |
| `.pill-btn.primary` | `.btn.btn-primary` | |
| `.btn` (管理画面) | `.btn` | 名前は同じだが定義を統合 |
| `.btn.sm` (管理画面) | `.btn.btn-sm` | |
| `.btn-primary` (認証フォーム) | `.btn.btn-form-lg.btn-primary` | 48px |
| `.btn-secondary` (認証フォーム) | `.btn.btn-form-md` | 44px。P02 の 44px を正準とする |
| `.btn-sm` (P17 / 30px / radius-sm) | `.btn.btn-sm` または `.btn.btn-xs` | 文脈で使い分け |
| `.btn-sm` (P18 / 32px / radius-sm) | `.btn.btn-sm` | |
| `.btn-sm` (P21-24 / 32px / radius-pill) | `.btn.btn-sm` | |
| `.btn-sm.subtle` | `.btn.btn-sm.btn-ghost` | |
| `.btn-sm.danger-text` | `.btn.btn-sm.btn-danger-soft` | |
| `.btn-sm.destructive` | `.btn.btn-sm.btn-destructive` | |
| `.btn-sm.primary` | `.btn.btn-sm.btn-primary` | |
| `.text-action` | `.btn.btn-xs` | リスト hover の小ボタン |
| `.text-action.destructive` | `.btn.btn-xs.btn-destructive` | |

### アイコンボタン

| 旧 | 新 |
|----|----|
| `.icon-btn` | `.icon-btn` |
| `.menu-btn` | `.icon-btn.icon-btn-ghost` |
| `.row-kebab` | `.icon-btn.icon-btn-ghost.list-row-kebab` |
| `.editing-close` | `.icon-btn.icon-btn-ghost.icon-btn-accent` |
| `.icon-action` (P17) | `.icon-btn.icon-btn-ghost.icon-btn-sm` |
| `.btn.icon-only` (P45) | `.icon-btn.icon-btn-sm` |
| `.dir-menu-trigger` (P10) | `.icon-btn.icon-btn-ghost` + ホバー出現は `.list-row-actions-hover` 相当を別途 |

### リスト行

| 旧 | 新 |
|----|----|
| `.tag-row` / `.blacklist-row` | `.list-row` |
| `.trash-row` | `.list-row` |
| `.note-row` | `.list-row` |
| `.session-row` | `.list-row` |
| `.token-row` | `.list-row` |
| `.row-actions` | `.list-row-actions` (+ `.list-row-actions-hover` if hover-reveal) |

### セグメンテッド

| 旧 | 新 |
|----|----|
| `.segmented` / `.segmented button` | `.segmented` / `.segmented-item` |
| `.mode-switch` (P18) | `.segmented.segmented-translucent` |

### チップ

| 旧 | 新 |
|----|----|
| `.chip` (h30、クリック可) | `.filter-chip` |
| `.chip` (h24、表示用 / P20) | `.tag-chip` |

---

## 8. React 実装ガイド

各コンポーネントは `app/components/ui/` 配下に配置する想定。

```
app/components/ui/
  Button.tsx
  IconButton.tsx
  ListRow.tsx
  Segmented.tsx
  FilterChip.tsx
  TagChip.tsx
  Tabs.tsx
```

### 例: Button

```tsx
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";
import { cn } from "@/lib/cn"; // class 結合ユーティリティ

type ButtonSize = "form-lg" | "form-md" | "md" | "sm" | "xs";
type ButtonVariant = "default" | "primary" | "ghost" | "danger" | "dangerSoft" | "destructive";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  type?: "button" | "submit" | "reset";
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
};

const SIZE_CLASS: Record<ButtonSize, string | null> = {
  "form-lg": "btn-form-lg",
  "form-md": "btn-form-md",
  md: null,
  sm: "btn-sm",
  xs: "btn-xs",
};

const VARIANT_CLASS: Record<ButtonVariant, string | null> = {
  default: null,
  primary: "btn-primary",
  ghost: "btn-ghost",
  danger: "btn-danger",
  dangerSoft: "btn-danger-soft",
  destructive: "btn-destructive",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "default", size = "md", block, iconLeft, iconRight, type = "button", className, children, ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn("btn", SIZE_CLASS[size], VARIANT_CLASS[variant], block && "btn-block", className)}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  ),
);
Button.displayName = "Button";
```

### 例: ListRow

```tsx
import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  columns: string;
  compact?: boolean;
  children: ReactNode;
};

export function ListRow({ columns, compact, className, style, children, ...rest }: Props) {
  const inlineStyle: CSSProperties = { gridTemplateColumns: columns, ...style };
  return (
    <div className={cn("list-row", compact && "list-row-compact", className)} style={inlineStyle} {...rest}>
      {children}
    </div>
  );
}

export function ListRowActions({ revealOnHover, children }: { revealOnHover?: boolean; children: ReactNode }) {
  return (
    <span className={cn("list-row-actions", revealOnHover && "list-row-actions-hover")}>{children}</span>
  );
}

export function ListRowMeta({ children }: { children: ReactNode }) {
  return <span className="list-row-meta">{children}</span>;
}
```

### 例: 使用イメージ（タグ管理）

```tsx
<ListRow columns="1fr 100px 160px auto">
  <span className="tag-name"><span className="hash">#</span>research</span>
  <ListRowMeta>42 件</ListRowMeta>
  <ListRowMeta>最終: 今日 14:32</ListRowMeta>
  <ListRowActions revealOnHover>
    <Button size="xs">編集</Button>
    <Button size="xs">統合</Button>
    <Button size="xs" variant="destructive">ブラックリスト</Button>
  </ListRowActions>
  <IconButton variant="ghost" className="list-row-kebab" aria-label="操作メニュー">
    <KebabIcon />
  </IconButton>
</ListRow>
```

---

## 9. 移行作業の進め方

1. **本ドキュメントの CSS を `spec/design/_components.css`（仮）として外出し** — 全画面共通の base CSS。各画面 HTML の `<style>` 先頭で `@import` する想定でもよいが、HTML モックの単体プレビューを壊さないため、当面は各画面に手動で挿入する。
2. **画面ごとに置換** — 1 画面ずつ移行マッピング表に従って書き換え、`agent-browser` でスクリーンショット比較。
3. **完了画面から順次レビュー** — 視覚回帰がないことを確認しつつ進める。

実装側（React）は別途、本ドキュメントを正準として `app/components/ui/*` を作成する。
