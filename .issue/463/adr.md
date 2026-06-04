# ADR — Issue #463: 設定画面スタイリング + UserMenu フォーカス挙動

## ADR-001: UserMenu の `focus:` → `focus-visible:` 化と danger 行の併記

**コンテキスト**
`UserMenu` はメニューを開くと roving-tabindex により先頭項目へプログラム的に
`.focus()` する（`UserMenu.tsx`）。`USER_MENU_ITEM` は `focus:bg-surface` を
持っていたため、マウスで開いた瞬間に先頭「設定」がグレーにハイライトされていた。

**決定内容**
`focus:bg-surface` を `focus-visible:bg-surface` に変更し、同時に
`data-[danger]:focus-visible:bg-error-surface` を併記した。`UserMenu.tsx` の
オートフォーカスロジックは変更していない。

**理由**
`focus-visible:` はキーボード操作時のみ発火するため、マウス由来の初期フォーカスでは
ハイライトされない（WAI-ARIA メニューの初期フォーカス契約は維持）。danger 項目
（ログアウト）は `focus` 用背景を持たず `data-[danger]:hover:bg-error-surface` のみ
だったため、単純置換ではキーボードでの矢印移動時にハイライトが消える。2 段スタック
variant（`data-[danger]:focus-visible:`）は単一 `focus-visible:` より後にソートされ
決定的に勝つ（`auth/styles.ts` INPUT / ADR-003 と同根拠）ので、クラス文字列上は
`focus-visible:bg-surface` の後に併記した。

## ADR-002: 設定画面の共有スタイル定数を `identity/styles.ts` に新設

**コンテキスト**
4 つの設定フォームとレイアウト route で共通のユーティリティ文字列を使う。

**決定内容**
`app/components/identity/styles.ts` を新設し、`common/styles.ts` の primitive
（`field`/`fieldControl`/`fieldLabel`/`fieldTextarea`/`formError`/`pillBtn`/
`pillBtnPrimary`）を import して合成。`layout/styles.ts` はアプリシェル専用で
意味的に別なので流用しない。

**理由**
`auth/styles.ts` と同じ慣習。`/settings` はシェルを継承しないトップレベル
サーフェスなので、レイアウト定数は独自に持つのが整合的。

## ADR-003: 入力欄は `common/fieldControl` 系を採用（auth `INPUT` の error バリアントは使わない）

**コンテキスト**
デザイン HTML は `.input` を `border-hairline-strong bg-bg` で表現するが、
実装には admin（`fieldControl` 系）と auth（`INPUT`、`data-[error]` 完備）の
2 系統がある。

**決定内容**
入力欄は `common/styles.ts` の `fieldControl`（`bg-surface` + `focus:border-accent`）
を SSOT として採用。auth `INPUT` の `data-[error]` バリアントは使わない。

**理由**
admin/auth 横断の実装一貫性を優先（plan.md ステップ2の指針）。各フォームは入力欄に
`data-error` 属性を付けておらず、エラーは `<p role="alert">`（`FIELD_ERROR`）で
既に表示しているため、入力欄自体の error バリアントは不要。

## ADR-004: サブナビ active 配色のブレークポイント出し分け

**コンテキスト**
デザイン P21 ではサブナビの active 配色がブレークポイントで異なる
（mobile 横スクロール時 active=`bg-ink text-white`、`lg:` 縦レール時
active=`bg-surface text-ink`）。`layout/styles.ts` の `NAV_ITEM`
（`aria-[current=page]:bg-surface` 単一）は流用できない。

**決定内容**
`SETTINGS_NAV_ITEM` で `max-lg:` / `lg:` バリアントを使い、新規 `@media` を
書かずに出し分けた。CLAUDE.md 規約に合わせ `data-active={active||undefined}` も
付与（`aria-current` は既存維持）。

**理由**
新規 `@media` を書くと `--breakpoint-*` の重複定義に触れる必要が出る。
`max-lg:`/`lg:` バリアントなら既存の breakpoint 設定をそのまま使える
（`layout/styles.ts` の `APP_SIDEBAR` と同方針）。

## ADR-005: Page.tsx の h1 を `sr-only` で保持

**コンテキスト**
layout 側の大見出し「設定」＋各 Page の `<h1>`＋フォーム内 `<h2>` が三重見出しに
なり、スタイルを当てると視覚的に破綻する。

**決定内容**
各 Page の `<h1>` に `className="sr-only"` を直書きし、視覚的に隠しつつページごとに
1 つ保持。h2 への降格はしない。`SR_ONLY` 共有定数はコードベースに存在せず
`sr-only` クラス直書きが既存慣習。

**理由**
二重見出しの視覚的破綻を避けつつ、ページごとに h1 を 1 つ保持して文書アウトラインの
a11y を維持する。h2 への降格はフォーム内 h2 と重複見出しが並びアウトラインが破綻する。

## ADR-006: route のサブナビを `<ul>/<li>` から `<Link>` 直置きへ

**コンテキスト**
既存 route は `<nav><ul><li><Link>` 構造。デザインは `<nav>` に `<a>` を直接並べる
flex レイアウト（admin route の `ADMIN_NAV` も同様）。

**決定内容**
`<ul>/<li>` を外し、`<nav>` 直下に `<Link>` を flex で並べる構造へ変更した。

**理由**
横スクロール pill 列 / 縦レールの両レイアウトを `flex` で素直に表現でき、
admin route のサブナビと構造が揃う。a11y は `<nav aria-label>` で担保される。
