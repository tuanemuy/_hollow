# モバイルモック生成ルール（Issue #536 共通）

各 `spec/design/pages/mobile/{name}.html` を新規生成するときの**絶対遵守ルール**。`plan.md` と併せて読むこと。`spec/design/index.md`（§2.1/2.4/2.5/3/7/8/9）と `spec/design/tokens.md` が SSOT。

## 0. ゴール

対応する desktop モック `spec/design/pages/{name}.html` の **390px モバイル最適版**を作る。デスクトップの縮小版ではなく「モバイルとして成立する」レイアウト・導線にする。出荷済み desktop モックと並べて違和感のないトークン・コンポーネント言語を保つ。

## 1. ファイル / viewport

- 出力先: `spec/design/pages/mobile/{name}.html`（desktop ファイルには絶対に触れない）。
- `<meta name="viewport" content="width=device-width, initial-scale=1">`。
- 基準幅 **390px**、検証域 **320〜430px** で横スクロール非発生。
- `<title>` は desktop のものに「(Mobile)」を付す程度。

## 2. トークン継承（最重要）

- 対応 desktop ファイルの `<style>` 冒頭ブロックを**逐語コピー**する: `* { box-sizing... }` リセット、`:root { ... }` トークン定義（`--color-*`〜`--bp-*` 全部）、`html, body` のリセット、`:focus-visible` 定義。
- **ローカル短縮名（`--bg`, `--ink` 等）は禁止**。正式トークン名のみ使う（`index.md §9`）。
- **新トークンを足さない**。`--text-*` は `clamp()` の fluid スケールで小画面は自動縮小する（`tokens.md §2.2 / #461 ADR-001`）。固定px新トークンを作らない。

## 3. レイアウト変換

- mobile ファイルは **390px をベース実体**にする。desktop が持つ**上方ブレークポイント（`@media (min-width:1024px)` 等の2カラム復帰）は削除**し、単カラムに固定する（drawer 挙動の JS は残す）。
- フォームは**1カラム**。グリッドは縦積み。
- **タップ領域は 44px 床**（`min-height:44px` 等）。admin も mobile では 44 を採る（desktop の `pillBtnSm` 密度＝24は mobile では緩める。文脈差でありデグレではない）。
- ステータスピル等は**SR用テキストを併記**（`index.md §8`）。icon-only ボタンは `<button aria-label="...">`（`§7.1`）。

## 4. シェル別パターン

- **アプリシェル（P10/P11/P12/P13〜P18/P20）**: 左サイドバーを **drawer**（オーバーレイ + `#backdrop` + `#menuBtn` 開閉、desktop の JS パターン流用）。ヘッダーは logo 縮約 + 検索省スペース化 + 主要CTAアイコン化 or **下部固定CTA**。bulk-bar は下端固定の横スクロール許容バー。FilterBar チップ列は横スクロール許可。P12 エディタはツールバー横スクロール、メタは下部 sheet/折りたたみ。
- **設定シェル（P21〜P24）**: 左サイドバーを「設定ナビ drawer」化。セクションカード縦積み、フォーム1カラム、action-row 縦積み/下部固定。
- **公開シェル（P30〜P34）**: 単一カラム + 公開ヘッダー（検索・signup 導線を省スペース化）。本文幅・行間を尊重した読み物最適化。
- **adminシェル（P40〜P47）**: nav strip 横スクロール維持。高密度テーブルは**カード/縦積みへ**（desktop に既にある `thead{display:none}` + `td::before{content:attr(data-label)}` 方式を 390px で確実に効かせる）。メトリクスグリッド1カラム。
- **認証/例外（P01〜P07/P34）**: 元からモバイルファースト単カラム。CTAフルワイド化・ヘッダー縮約・余白調整中心。

## 5. ダイアログ / モーダル

- モバイルは**ボトムシート寄せ**: 画面下端から立ち上がり、上端角丸 `--radius-lg`、`width:100%`、`max-height` 制限 + 内部スクロール、下部に**フルワイド primary CTA**。
- **showcase/state-grid 系**（P10-move-note-dialog, P10-note-picker-dialog, P10-save-view-dialog, common-confirm-dialog, P10-filterbar-popovers）は、desktop 同様に**複数ステートを縦1カラムで並べたカタログ**を維持しつつ、各ダイアログを「実機ボトムシート」見えで描く。これらは静的カタログなので **`aria-modal` の静的付与のみ**で良く、実 Esc/フォーカストラップの JS は足さない。
- **実モーダル**（P13-upload-modal, P13a-upload-modal 等、実際に開閉するもの）は `aria-modal="true"` + Esc/フォーカストラップ想定を維持。
- ダイアログ系で desktop に global mobile fix（44px床）が無いファイルがあるので、**44px床は mobile 側で必ず新設**する。

## 6. 下端固定要素

- bulk-bar（`position:sticky; bottom; z-index:40`）と下部固定CTAを同一下端に置く画面では、`env(safe-area-inset-bottom)` の安全域を確保し、z-index の積層を明示して CTA がバーに隠れないようにする。

## 7. overflow 厳守

- 320 / 390 / 430px で `document.documentElement.scrollWidth <= window.innerWidth`。
- テーブル・コードブロック・横長メディア・FilterBar チップ列の**単体内部スクロールは許可**（その要素を `overflow-x:auto` で囲う）。ページ全体の横 overflow は禁止。
- 長文・長URL・長タグは `overflow-wrap:anywhere` / `word-break` で折り返す（desktop の既存規則を継承）。

## 8. 自己チェック（生成後）

- [ ] `:root` が対応 desktop と一致、正式トークン名のみ、新トークンなし
- [ ] 単カラム固定（上方BP削除）、フォーム1カラム
- [ ] drawer / ボトムシート / 下部固定CTA が該当シェルで表現されている
- [ ] タップ44px床 / icon-only aria-label / SRテキスト併記
- [ ] 390px 想定で横長要素以外がページ幅に収まる構造（横長は内部スクロールで隔離）
- [ ] desktop ファイルを改変していない
