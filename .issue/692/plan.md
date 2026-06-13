# 実装計画 — Issue #692: input/エディタのフォーカス表現を見直す（全体リング廃止・caret-only / グローバル4pxリングの細線化）

**Issue:** #692
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

ボーダーレスな「書く面」要素（エディタ本文・タイトル）から箱型フォーカスリングを外し caret + 選択色（caret-only）でフォーカスを示す。あわせてアプリ全体の input に効くグローバルトークン `--shadow-focus` を WCAG 充足を保ったまま細線化（4px→2px）し、モック `P12-editor.html` も同方針に揃える。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | WysiwygEditor / InlineEditor の wrapper から `focus-within:shadow-focus` と `focus-within:border-accent` が外れ、フォーカス時に編集領域全体を囲む箱リングが描画されない（caret + 選択色のみ） | Issue 論点1 | 1 |
| AC-2 | タイトル入力（`titleInput`）にフォーカスしても四角い箱リングが出ない（caret-only）。本文フォーカス挙動と一貫している | Issue 論点2 | 2 |
| AC-3 | グローバル `:focus-visible` の `--shadow-focus` が 2px 相当に細線化され、通常の input 系（`fieldControl` 等）のフォーカスが新トークンで描画される | Issue 論点3 / AC | 3 |
| AC-4 | 細線化後のリングが WCAG 2.4.7 / 2.4.11 を満たす（**白背景・surface 背景の両方**に対し概ね 3:1 以上のコントラスト、十分な太さ・領域）。数値根拠を ADR に記録 | Issue a11y 注記 | 3, ADR-002 |
| AC-5 | **トークン定義（`tokens.css` SSOT）と `spec/design/tokens.md`（226 / 535 行の値定義、および 311 行 prose の caret-only 例外）の `--shadow-focus` を新値に同期し、直値複製のある全 105 モック HTML（`spec/design/pages/**`。内訳: PC 55 + mobile 49 + drafts 1）の `:root` `--shadow-focus` 直値も一括で新値へ同期する**。加えて `P12-editor.html` の `.editor` / `.title-input` に caret-only の `:focus-visible` 上書きが入る | AC | 1, 3, 4, ADR-003 |
| AC-6 | `--shadow-focus` を直値で複製している `auth/styles.ts` の error-focus 影が新トークンと整合する（4px の取り残しが無い） | 調査で発見した波及 | 5 |
| AC-7 | 通常 input（`fieldControl` / public TOKEN_INPUT・検索・フォーム input / tag 入力 / auth input）のフォーカスが各画面で破綻しないことを確認し、**確認した画面・input をチェックリストとして testing.md / マニュアルテストに記録**する | AC | 6 |
| AC-8 | caret-only / 細線化値の方針判断が `.issue/692/adr.md` に記録される | AC | ADR |
| AC-9 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通る | AC | 7 |

## スコープ

### 含まれないもの
- **ビジュアルエディタの border 撤去（`border-hairline` / `rounded-md` / `p-4`）は #689 で扱う。** 本Issueは同一 wrapper の `focus-within:*` クラスのみを触る。border 撤去とは独立に適用できるよう、border 系クラスには手を付けない（連動の注意は「リスクと注意点」に記載）。
- 選択色（`selection:bg-accent-surface` = `oklch(97% 0 0)`）の見直し。caret-only の「選択色」は既存トークンをそのまま使う。
- input の角丸・配色・hover などフォーカス可視性以外のスタイル。
- `:focus-visible` の outline 方式（`focus-visible:outline-accent`）を使う list/menu 系コンポーネント（box-shadow ではなく outline を使っており `--shadow-focus` 非依存。今回の細線化の影響を受けない）。

## 調査結果

- 関連ファイル:
  - `app/styles/tokens.css:120` — `--shadow-focus: 0 0 0 4px oklch(37.1% 0 0 / 0.28)`（SSOT、細線化対象）
  - `app/styles/index.css:107` — `@theme inline` での `--shadow-focus` ブリッジ（Tailwind `shadow-focus` ユーティリティの供給元）
  - `app/styles/index.css:174-178` — グローバル `:focus-visible { outline:none; box-shadow: var(--shadow-focus); border-radius: inherit }`
  - `app/components/note/editor/WysiwygEditor.tsx:576` — wrapper に `focus-within:border-accent focus-within:shadow-focus`。内側 ProseMirror は既に `[&_.ProseMirror]:focus-visible:shadow-none` + `caret-accent` + `selection:bg-accent-surface` を持つ
  - `app/components/note/editor/InlineEditor.tsx:863` — markdown/HTML モードの同等 wrapper。**同じ `focus-within:border-accent focus-within:shadow-focus` + 内側 `[&_:focus-visible]:shadow-none` + `caret-accent`**。Issue本文では明示されていないが P12 の「書く面」変種であり caret-only 方針の対象
  - `app/components/note/editor/styles.ts:15-16` — `titleInput`。`rounded-*` 指定なし → グローバル `border-radius: inherit` が 0 を継ぎ四角い箱リング
  - `app/components/common/styles.ts:266` — `fieldControl`（標準 input、グローバル `:focus-visible` 経由でリングを受ける）
  - `spec/design/pages/P12-editor.html:183-187`（グローバル `:focus-visible`）, `:468-487`（`.title-input`）, `:707-711`（`.editor`）, `:117`（`--shadow-focus`）
  - `spec/design/tokens.md:226, 304-311, 535` — トークン表とフォーカスリング節（SSOT のミラー、要更新）
- `--shadow-focus` / `shadow-focus` の消費者（細線化の影響範囲）:
  - グローバル `:focus-visible`（`index.css`）→ outline を持たない全フォーカス要素（`fieldControl` 含む）
  - `app/components/public/styles.ts:202`（search）, `:299`（TOKEN_INPUT `focus-within:shadow-focus`）, `:346`（form input）
  - `app/components/tag/styles.ts:75, 144`（tag 入力 `focus:shadow-focus`）
  - `app/components/auth/styles.ts:40` — **`--shadow-focus` を直値 `0_0_0_4px_oklch(37.1%_0_0_/_0.28)` で複製**（error+focus 時）。トークン変更に追従しないので個別修正が必要
  - 除去対象: WysiwygEditor / InlineEditor wrapper（`focus-within:shadow-focus`）
  - 非対象: `app/components/admin/Dashboard/index.tsx:94` は success ステータスドットの装飾影（focus 無関係）
- **モック側の `--shadow-focus` 直値複製（grep で確定）**:
  - `spec/design/pages/**` の HTML は計 **107 ファイル**。うち `--shadow-focus: 0 0 0 4px oklch(37.1% 0 0 / 0.28)` を `:root` に直値定義し `box-shadow: var(--shadow-focus)` で消費しているのは **105 ファイル**（define=consume=105、死んだ定義ゼロ）。**内訳: PC top-level 55 + `mobile/` 49 + `drafts/P10-header-refined.html` 1**。残り2件（`drafts/P10-header-options.html` / `drafts/P10-toolbar-options.html`）は `--shadow-focus` を持たないため対象外。
  - **drafts の扱い（スコープ判断）**: `drafts/P10-header-refined.html` は探索用ドラフトだが、29 行で `--shadow-focus` を直値定義し 35 行のグローバル `:focus-visible` で実際に消費している。SSOT 一括同期の趣旨（トークン値の乖離を残さない）に沿い、機械置換のコストが極小なため**同期対象に含める**（除外する積極的理由がない）。構造的上書きは不要。判断根拠は ADR-003。
  - `tokens.md` 冒頭の「値はこのファイルを正として各画面に反映する」設計どおり、トークンが各ページに複製されている。**P12 のみ更新すると残り 104 ページが旧 4px のまま実装と乖離する**ため、トークン直値の全モック同期をステップ1に含める。caret-only の構造的上書き（`.editor`/`.title-input` の `:focus-visible` 打ち消し）は書く面を持つ P12 のみで良い。
  - **置換単位（手順の明確化）**: 105 件のうち 11 件（admin 系 P42〜P46 の PC/mobile）は `--shadow-md: …; --shadow-focus: 0 0 0 4px …;` と複数トークンを1行に連結している。行単位置換だと同一行の他トークンを巻き込んで壊すため、**値文字列 `0 0 0 4px oklch(37.1% 0 0 / 0.28)` 単位のサブストリング置換**で行う（行頭・行末に依存しない）。残り 94 件は単独行。なお実装側 `auth/styles.ts` は `_` 区切り（`0_0_0_4px_…`）で別表記なので、モックのスペース区切りと一括置換対象を取り違えない。
  - `spec/design/tokens.md` の 226 行（トークン表）・535 行（mobile 用 `:root`）にも 4px が存在（要同期）。311 行の「すべてのインタラクティブ要素に共通適用」prose には書く面=caret-only 例外を1行足す（要同期、ドキュメント乖離防止）。
- **`.note-detail-content`（handwritten CSS 例外）との干渉なし**: `app/styles/index.css:189-` の `@layer components .note-detail-content` ブロックには focus / caret / box-shadow / outline の指定が一切無い（grep 済み）。InlineEditor wrapper が `note-detail-content` を併用していても、`focus-within:shadow-focus` 削除は例外側と干渉しない。
- **ダークモード／カラースキームは非該当**: `app/styles/` に `prefers-color-scheme` / `.dark` / `data-theme` / `color-scheme` のテーマ分岐は存在しない（grep 済み）。accent も無彩（`oklch(37.1% 0 0)`）で配色は単一。ダークモード考慮は不要。
- **詳細度の担保（caret-only 打ち消し）**: グローバル `:focus-visible` は `@layer base`（`index.css:174-178`）で `box-shadow: var(--shadow-focus)` を当てている。Tailwind の `focus-visible:shadow-none` は `@layer utilities` で生成され、(1) カスケードレイヤー順で base に勝ち、(2) `.focus-visible\:shadow-none:focus-visible`（class + pseudo-class）はバラの `:focus-visible`（pseudo-class のみ）より詳細度も高い。よって打ち消しは確実に効く見込み。実装時にブラウザで実検証する（ステップ2）。
- あるべきアーキテクチャ:
  - フロント/スタイルのみの変更。ドメイン〜アダプター層は不変。
  - Styling 規約（CLAUDE.md）: `tokens.css` が SSOT、`index.css` の `@theme inline` がブリッジ。**トークン値変更は `tokens.css` の `--shadow-focus` を変えれば `@theme inline` 経由で `shadow-focus` ユーティリティ・グローバル `:focus-visible` の両方に波及する**（ブリッジ自体は `var()` 参照なので編集不要）。`spec/design/tokens.md` はミラーなので手で同期する。
  - data-* 規約・breakpoint 二重定義は本変更では非該当（shadow トークンは `var()` 参照可能、`@media` 内 `var()` 制約に該当しない）。
- 既存実装の状態:
  - エディタ wrapper の `focus-within:shadow-focus` は内側 ProseMirror の caret-only フォーカスを「打ち消す」二重表現になっており、モック（`.editor` は静的表示で箱リングを持たない原稿キャンバス）と乖離。本Issueで caret-only に寄せる。
  - `titleInput` は `rounded-*` 欠落でグローバル inherit-0 の四角リングが出る。モックの `.title-input` も同様に箱リングが出る設計（静的なので実害は見えにくい）なので、実装・モック両方を caret-only 上書きに揃える。
  - グローバル `--shadow-focus` は 4px と太く、かつ現状 `oklch(37.1% 0 0 / 0.28)` を白背景に合成すると実効コントラストが約 1.6:1 と **既に WCAG 2.4.11 の 3:1 を満たしていない**（既存の弱点）。雑に 2px へ薄くすると更に悪化するため、細線化と同時にコントラストを引き上げる（ADR-002）。
- 依存関係:
  - グローバルトークン変更はアプリ全画面の input フォーカスに波及。outline 方式の list/menu 系は非影響。
  - #689（border 撤去）と同一 wrapper を編集するため、マージ順序により衝突可能性あり。

## 設計

### ドメインモデルへの影響
なし（スタイルのみ）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

3つの変更カテゴリに整理する。

1. **書く面の caret-only 化（エディタ本文・タイトル）**
   - WysiwygEditor / InlineEditor wrapper: `focus-within:border-accent` と `focus-within:shadow-focus` を削除。内側の `caret-accent` / `selection:bg-accent-surface` / `[&_.ProseMirror]:focus-visible:shadow-none`（InlineEditor は `[&_:focus-visible]:shadow-none`）はそのまま残しフォーカスを示す。`transition-[border-color,box-shadow]` は #689 の border 撤去で扱うため**本Issueでは触らない**（box-shadow トランジションが残っても無害）。
   - `titleInput`: グローバル `:focus-visible` の箱リングを `focus-visible:shadow-none` で打ち消す。caret は OS/ブラウザ既定 + 既存テキスト色で示す（必要なら `caret-accent` を付与してエディタ本文と一貫させる）。

2. **グローバル `--shadow-focus` の細線化（input 系）**
   - `tokens.css` の `--shadow-focus` を 4px → 2px に。コントラスト確保のため alpha/色を見直す（ADR-002 で確定値を決定）。第一候補は不透明な accent を使う `0 0 0 2px var(--color-accent)`（accent = `oklch(37.1% 0 0)`、白背景に対し約 8.9:1 で 3:1 を大幅に満たす）。`@theme inline` ブリッジ・グローバル `:focus-visible` ルールは `var()` 参照なので編集不要。
   - `spec/design/tokens.md` の `--shadow-focus`（226 / 535 行）を実装と同値に同期。

3. **直値複製の追従**
   - `auth/styles.ts:40` の error+focus 影 `0_0_0_4px_oklch(37.1%_0_0_/_0.28)` を新トークン値に合わせて 2px 化（error 枠の `inset 0 0 0 1px var(--color-error)` は維持）。

4. **モック同期**
   - `P12-editor.html` に `.editor:focus-visible { box-shadow: none }` / `.title-input:focus-visible { box-shadow: none }`（caret-only）の上書きを追加。`--shadow-focus`（117 行）を実装と同値に更新。

## 実装ステップ

横断トークン（`--shadow-focus`）の細線化を先頭に寄せ、全 input の見た目を先に確定させてから個別の caret-only / 直値追従を当て、最後に確認する順序にする（確認の手戻りを減らす。arch-risk S-004）。

### 1. `--shadow-focus` を細線化（横断トークン・先行）
- **対象ファイル:** `app/styles/tokens.css`（120 行）, `spec/design/tokens.md`（226 / 311 / 535 行）, `spec/design/pages/**`（直値複製のある全 105 モック HTML = PC 55 + mobile 49 + drafts 1）
- **変更内容:** ADR-002 で確定した値（第一候補 `0 0 0 2px var(--color-accent)`、フォールバック `0 0 0 2px oklch(37.1% 0 0 / 0.85)`）に更新。`@theme inline` ブリッジ・グローバル `:focus-visible` ルールは `var()` 参照のため編集不要。`tokens.md` のトークン表（226）・mobile `:root`（535）を同値に同期し、**section 10 の prose（311 行「すべてのインタラクティブ要素に共通適用」）に「ただし書く面（エディタ本文・タイトル）はリング非適用＝caret-only の例外」を1行足す**（実装との乖離防止。arch-risk S-003）。**全 105 モックの `:root` `--shadow-focus` 直値も同じ新値へ一括置換**（drafts の `P10-header-refined.html` も含む）。置換は**値文字列 `0 0 0 4px oklch(37.1% 0 0 / 0.28)` 単位のサブストリング置換**で行う（admin 系 11 件は他トークンと同一行に連結しているため、行単位置換は不可。arch-risk S-001 / coverage S-001）。caret-only の構造的上書きは P12 のみ。同期スコープ・drafts を含める判断は ADR-003。
- **理由:** アプリ全体の input リングを 4px→2px に細線化しつつ WCAG 2.4.7 / 2.4.11 を満たす。SSOT・ミラー・全モックを一度に同値化して以降の乖離を防ぐ（論点3 / AC-4 / AC-5）。

### 2. エディタ wrapper を caret-only 化
- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`（576 行）, `app/components/note/editor/InlineEditor.tsx`（863 行）
- **変更内容:** 両 wrapper の className から `focus-within:border-accent` と `focus-within:shadow-focus` を削除。内側の caret/selection/`focus-visible:shadow-none` 系クラスと border/rounded/padding 系クラス（#689 の領分）はそのまま残す。**本文側は実際にフォーカスを受けるのが内側要素（WysiwygEditor は ProseMirror が `[&_.ProseMirror]:focus-visible:shadow-none` を持つ）なので、`focus-within:shadow-focus` の削除だけで完結し、wrapper 側への `focus-visible:shadow-none` 追加は不要**（タイトルとは機序が違う。arch-risk S-003）。
- **機序差の補記（WysiwygEditor と InlineEditor は同一でない）:** 両者の caret-only 成立機序は別物。WysiwygEditor は wrapper(div) が非編集で内側 `.ProseMirror` が contenteditable 本体。一方 **InlineEditor は host(`<section ref={hostRef}>`) 自身が contenteditable ではなく（`applyEditable`（274 行）が `if (el === host) continue;`（280 行）で host を除外し、allow-list された子孫ブロックのみ editable にする）、host は tabindex/contenteditable を持たずフォーカス不能**。そのため `focus-within:shadow-focus` 削除後、host にはグローバル `:focus-visible` の箱リングが付かず（host が focus を受けない）、子孫の `:focus-visible` は子孫セレクタ `[&_:focus-visible]:shadow-none` が打ち消す。結論（削除だけで caret-only 成立）は両者同じだが機序が異なるため、実検証時は「host にも子孫にも箱リングが出ない」両方を見る（arch-risk S-002）。
- **干渉確認:** `.note-detail-content`（InlineEditor 併用）には focus/caret/box-shadow 指定が無いことを確認済みで干渉しない（調査結果参照。arch-risk P-003）。
- **理由:** 480px の編集領域全体に当たる箱リングを廃し、内側 ProseMirror が既に持つ caret-only フォーカスを唯一の表現にする（論点1）。

### 3. タイトル入力を caret-only 化
- **対象ファイル:** `app/components/note/editor/styles.ts`（13 行付近）
- **変更内容:** `titleInput`（`<input>`、グローバル `:focus-visible` を直接受ける）にグローバル箱リングを打ち消す `focus-visible:shadow-none` を追加。エディタ本文と一貫させるため `caret-accent` を付与。JSDoc コメント（12-13 行の「focus framing is out of scope here / global :focus-visible 委譲」記述）を caret-only 方針に更新。
- **打ち消しの詳細度確認（必須）:** `focus-visible:shadow-none`（`@layer utilities` + class&pseudo-class）がグローバル `:focus-visible`（`@layer base`、`index.css:174-178`）の `box-shadow` を**実際に上書きできること**をブラウザで確認する。理屈上はレイヤー順・詳細度とも勝つ（調査結果「詳細度の担保」）。万一勝てない場合は `[&:focus-visible]:shadow-none`（詳細度引き上げ）→ それでも不可なら `focus-visible:!shadow-none` の順で対処し、`!important` 使用時は ADR-002 に許容根拠を1行残す。
- **理由:** `rounded-*` 欠落で出る四角い箱リングを当てず、書く面として caret-only に統一（論点2）。

### 4. モック `P12-editor.html` に caret-only 上書きを追加
- **対象ファイル:** `spec/design/pages/P12-editor.html`（PC版）, `spec/design/pages/mobile/P12-editor.html`（あれば）
- **変更内容:** `.editor:focus-visible { box-shadow: none }` と `.title-input:focus-visible { box-shadow: none }` を追加（caret-only）。`--shadow-focus` の直値はステップ1の一括置換で既に新値（重複作業を避ける）。
- **補記（機序差）:** モックの `.editor` は contenteditable、`.title-input` は `<input>` で、いずれも**要素自身が `:focus-visible` を直接受ける**（実装の外側 wrapper の `focus-within` とは構造が異なる）。そのためモック側は要素自身の `:focus-visible` 上書き、実装側は wrapper の `focus-within` 削除、と手段が分かれる（arch-risk S-003）。
- **理由:** モックも同じ箱リング挙動なので caret-only を反映し、実装とモックの一致を保つ（AC-5）。

### 5. 直値複製（auth）の追従修正
- **対象ファイル:** `app/components/auth/styles.ts`（40 行）
- **変更内容:** `INPUT` の `data-[error]:focus-visible:shadow-[inset_0_0_0_1px_var(--color-error),0_0_0_4px_oklch(37.1%_0_0_/_0.28)]` は **error 枠（inset）と外側リング（4px）を1つの box-shadow shorthand で合成**している。`var(--shadow-focus)` を1レイヤーだけ差し込む連結は Tailwind 任意値の `_` 区切りでは破綻しやすいので、**最初から「直値を新トークンと同一の太さ・色に手で揃える」を本線**とする（`var()` 連結は採用しない前提）。すなわち外側リングを `0_0_0_2px_var(--color-error)`（error 文脈なので error 色のリング、ADR-003 で確定）に置換し、inset の error 枠は維持。
- **理由:** トークン変更に追従しない 4px の取り残しを防ぎ、太さ・色の両方を整合させる（AC-6 / arch-risk P-001）。

### 6. 各画面のフォーカス確認（記録あり）
- **対象:** `fieldControl` を使う各フォーム、public（search:202 / TOKEN_INPUT:299 / form input:346）、tag 入力（75 / 144）、auth input（40）。白背景 input と surface 背景 input の両方を含める。
- **変更内容:** コード変更なし。新トークンでリングが破綻しない（潰れ・はみ出し・コントラスト不足が無い）ことを目視確認し、**確認した画面・input をチェックリスト化して testing.md / マニュアルテストに残す**（AC-7 の検証可能性を担保。coverage S-001）。
- **理由:** グローバルトークン変更の波及確認（AC-7）。

### 7. 静的検査
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **理由:** AC-9。

## 設計判断

- ADR-001: 書く面要素（エディタ本文・タイトル）を caret-only にする（箱リングを当てない）。InlineEditor を含める根拠も記載。
- ADR-002: `--shadow-focus` の細線化確定値（第一候補＋フォールバック1案）と WCAG 2.4.7 / 2.4.11 充足の数値根拠（白・surface 両背景）。詳細度打ち消しの note も記載。
- ADR-003: グローバルトークン変更の影響範囲、モック直値複製の同期スコープ（全 105 モック = PC 55 + mobile 49 + drafts 1、+ tokens.md の値定義・prose）、サブストリング置換の根拠、drafts を含める判断、直値複製（auth）の太さ・色の追従方針。
- ADR-004: #689（border 撤去）との連動・非干渉方針。
- ADR-005: `.note-detail-content` 例外との非干渉・ダークモード非該当の確認。

詳細は `.issue/692/adr.md`。

## リスクと注意点

- **#689 との衝突:** WysiwygEditor / InlineEditor の同一 className を両Issueが編集する。本Issueは `focus-within:*` の削除のみ、#689 は `border-hairline` / `rounded-md` / `p-4` の削除に限定し、互いの担当クラスに触れない。マージ順序によりコンフリクトしうるので後発側で手解決する想定。
- **グローバル波及:** `--shadow-focus` 変更は全画面の input に効く。outline 方式（list/menu）は非影響だが、box-shadow 方式の全 input を確認する（ステップ6）。
- **既存の WCAG 未達:** 現行 4px リングが既に約 1.6:1 で 2.4.11 未達。細線化と「同時に」コントラストを上げないと退行する。薄くするだけの対応は不可。
- **直値複製の見落とし:** `auth/styles.ts` の 4px 直値はトークンに追従しない。修正漏れると error+focus 時だけ太い 4px が残る。
- **caret-only の可視性:** マウス/タップ起因では従来も `:focus-visible` 非適用。キーボードで書く面に入った際 caret + 選択色のみで十分視認できるか確認（ProseMirror の caret は `caret-accent` で着色済み）。

## テスト方針

- 手動/ブラウザ: P12 でビジュアル/markdown 両モードに Tab/クリックで入り、編集領域全体の箱リングが消え caret が見えることを確認。タイトル入力に Tab で入り四角い箱リングが出ないことを確認（`focus-visible:shadow-none` の打ち消しが効いているか＝詳細度の実検証も兼ねる）。
- 各画面の通常 input に Tab で入り、2px リングが視認でき潰れないことを確認。**確認対象を以下のチェックリストで testing.md / マニュアルテストに記録**（AC-7）:
  - auth INPUT（`auth/styles.ts:40`、surface→focus 時 bg-bg。error+focus 時の合成リングも確認）
  - public search（`public/styles.ts:202`、surface 背景）
  - public TOKEN_INPUT（`public/styles.ts:299`、bg 背景・`focus-within`）
  - public form input（`public/styles.ts:346`、white 背景）
  - tag 入力 ×2（`tag/styles.ts:75,144`、surface 背景）
  - `fieldControl`（`common/styles.ts:266`、グローバル `:focus-visible` 経由）
- a11y: 細線化後リングのコントラストが **白背景（`--color-bg`）と surface 背景（`#f5f5f7`）の両方**で 3:1 以上であることを ADR-002 の計算で担保（必要なら DevTools/コントラストツールで実測）。リングは要素外側に出るため隣接背景はページ地（多くは白系）だが、surface カード内 input ではリングが surface に隣接するため両方を見る。
- ダークモード: 本リポジトリにテーマ分岐（`prefers-color-scheme` / `.dark` 等）が存在しないため非該当（確認不要）。
- 静的: `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目

**修正した点（coverage 視点）**:
- **P-001（モック同期の漏れ）**: grep で `spec/design/pages/**` の 105 ファイル全部が `:root` に `--shadow-focus` 4px を直値複製していることを確定。AC-5 を「トークン定義（tokens.css SSOT）＋ tokens.md＋全 105 モック HTML を新値に同期」へ具体化。ステップ1（トークン細線化）に全モック一括置換を含め、同期スコープを ADR-003 に明記。caret-only の構造的上書きは P12 のみと線引き。

**取り込んだ改善提案（coverage 視点）**:
- **S-001**: AC-7 に「確認画面・input をチェックリスト化して testing.md / マニュアルテストに記録」を追加。テスト方針に対象 input（auth / public search・TOKEN_INPUT・form / tag ×2 / fieldControl）を列挙。
- **S-002**: ADR-002 の確定値を1つに絞り込み（第一候補 `0 0 0 2px var(--color-accent)`、フォールバックは alpha 0.85 の1案のみ）。Apple Calm トーンとの衝突時の逃げ道を1段だけに限定。

**修正した点（arch-risk 視点）**:
- **P-001（auth 直値複製）**: error 枠（inset）と外側リングの box-shadow shorthand 合成を確認。ステップ5 / ADR-003 で `var()` 連結を不採用とし、直値を手で揃える本線に格下げ。色の追従方針（error 文脈なのでリングを error 色 `0_0_0_2px_var(--color-error)`）を確定。
- **P-002（caret-only 打ち消しの詳細度）**: グローバル `:focus-visible` が `@layer base`、Tailwind `focus-visible:shadow-none` が `@layer utilities`＋class&pseudo-class でレイヤー順・詳細度とも勝つことを確認。ステップ3 にブラウザ実検証と、勝てない場合の代替（`[&:focus-visible]:shadow-none` → `!shadow-none`）を明記。ADR-002 に `!important` 許容根拠の note を追加。
- **P-003（note-detail-content 干渉）**: grep で `.note-detail-content` ブロックに focus/caret/box-shadow/outline 指定が無いことを確認。ステップ2・調査結果・ADR-005 に非干渉を記録。

**取り込んだ改善提案（arch-risk 視点）**:
- **S-001**: WCAG コントラスト根拠を白背景・surface 背景の両方で明示計算（白 ~6.8:1 / surface ~6.3:1）。AC-4・テスト方針も両背景に拡張。
- **S-002**: ダークモード非該当を grep で確認し、調査結果・テスト方針・ADR-005 に1行明記。
- **S-003**: モック `.editor`（contenteditable）と `.title-input`（input）が要素自身で `:focus-visible` を受ける機序と、実装側 wrapper の `focus-within` 削除との手段差をステップ4・ADR-001 に補記。InlineEditor を含める根拠も ADR-001 に追記。
- **S-004**: 実装ステップを「トークン細線化を先頭」に並べ替え（旧3→新1）。横断トークンを先に確定させ確認の手戻りを減らす順序に。

**見送った提案とその理由**:
- なし（両視点の問題点・改善提案をすべて取り込み）。

### 2周目

**取り込んだ修正（両視点共通）**:
- **[両視点 P-001] モック「105」の内訳と drafts の扱い**: grep で内訳を再確認（`spec/design/pages/**` の HTML 計 107、`--shadow-focus` 4px を define=consume するのは 105 = PC 55 + mobile 49 + drafts 1）。1件の `drafts/P10-header-refined.html`（29 行定義 / 35 行消費）を同期対象に**含める**判断を採用（SSOT 一括同期の趣旨に沿い、消費している以上除外すると乖離が残る。機械置換コストは極小）。AC-5・調査結果・ステップ1・ADR-003 に内訳（PC 55 + mobile 49 + drafts 1）と drafts を含める根拠を明記。残り2件の drafts は `--shadow-focus` 非定義のため対象外。
- **[両視点 S-001] サブストリング置換の明記**: 105 件中 11 件（admin 系 P42〜P46 の PC/mobile）が複数トークンを1行に連結しているため、置換は**値文字列 `0 0 0 4px oklch(37.1% 0 0 / 0.28)` 単位のサブストリング置換**で行う旨を調査結果・ステップ1・ADR-003 に明記（行単位置換は連結行を壊すため不可）。
- **[arch S-002] InlineEditor の caret-only 機序差の補記**: 実コード（`applyEditable` 280 行 `if (el === host) continue;`）で確認。InlineEditor は host(`<section>`) 自身がフォーカス不能で、子孫セレクタ `[&_:focus-visible]:shadow-none` が打ち消す別機序。結論（削除だけで成立）は WysiwygEditor と同じだが機序が異なる点をステップ2・ADR-001 に1〜2行補記。
- **[arch S-003] tokens.md prose の例外追記**: section 10（311 行「すべてのインタラクティブ要素に共通適用」）に「書く面=caret-only 例外」を1行足す旨を AC-5・調査結果・ステップ1・ADR-003 に明記（値だけ同期して prose を放置するとドキュメント乖離が残るため）。

**見送った提案とその理由**:
- なし（両視点の問題点・改善提案をすべて取り込み）。

**収束判定**:
- 2周目: 両視点とも残課題は軽微なドキュメント明確化のみで反映済み、計画は実装着手可能。
