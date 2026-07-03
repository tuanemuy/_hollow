# 実装計画 — Issue #723: P12 エディターモックを FrontMatter 下部常設レイアウトに追従

**複雑度:** 小規模（P12 エディターモックのデザイン追従。デスクトップ `spec/design/pages/P12-editor.html` + モバイル `spec/design/pages/mobile/P12-editor.html`）

## 目的

#697（PR #722）でノート編集画面の **FrontMatter モードタブを廃止し、メタデータ編集領域（FrontMatter エディタ）を本文エディタの下に常設**した。CLAUDE.md 上 `spec/design` はデザインの SSOT なので、実装後の姿にモックを追従させ、乖離を解消する。

## 現状分析（調査済み）

Issue 本文は執筆時点の行番号（966-969 / 651）を挙げているが、その後 #776（commit `15446b65`「残りの不完全 role=tablist を APG 準拠化」）が同ファイルを触り、行番号がずれている。現時点（HEAD）の実際の乖離は以下:

| Issue のやりたいこと | 現状 | 対応 |
| --- | --- | --- |
| 編集モードタブから `FrontMatter` を除去 | **#776 で対応済み**。`mode-tabs`（L1088-1090）は既に `WYSIWYG / HTML` のみで、`FrontMatter タブ表記は #697 で削除済み` コメントも付いている | 対応不要（変更しない） |
| メタデータ編集領域（FrontMatter）を本文エディタの下に常設配置した姿として描画 | **未対応**。モックは `editor-body-panel`（本文＋メディア）→ `link-suggest`（本文補完サンプル）→ `save-row` で終わり、下部メタデータ領域が一切描画されていない | **本 Issue の主作業。下部メタデータ領域を新規描画** |
| 「別タブ排他」前提のコメントを「下部常設」へ更新 | **未対応**。L651 に `FrontMatter は別タブ排他のため、WYSIWYG ビューには FrontMatter パネルを置かない。` が残存 | **コメントを下部常設前提に書き換え** |

### 実装（追従先）の姿

- `EditorModeSwitch.tsx`: `TABS_NEW = [WYSIWYG, HTML]` / `TABS_EDIT = [ビジュアル(inline), WYSIWYG, HTML]`。FrontMatter はタブでなくなった。
- `NoteEditor.tsx` L573-593: `FrontMatterEditor` を本文パネル（`editor-body-panel`）の**直後・保存アクションの前**に常設マウント。
- `FrontMatterEditor.tsx`:
  - `<section aria-label="メタデータ">`（`mt-4 rounded-lg border border-hairline bg-surface-elevated p-5`）
  - ヘッダー行: `生編集（JSON）` トグルボタン（`pillBtn`, `aria-pressed`）+ `aria-live` エラー領域
  - 構造モード（デフォルト `structured`）: `<datalist>`（SUGGESTED_KEYS = date/description/title/slug）+ キー行（`frontMatterRow`: キー入力 + 値入力 + `削除` ボタン）+ キー追加行（新キー入力 + `キーを追加`、`mt-2 pt-3 border-t border-hairline`）
  - `styles.ts` L57 の JSDoc が「mock structured `.meta-field` rows」と参照 → モック側のクラス名は `.meta-field` を用いて styles.ts ↔ モックの相互参照を成立させる

## 設計

モックは Tailwind ではなく素の CSS クラス + デザイントークン（`:root` の CSS 変数）で書かれている。既存の命名規則（`.mode-tabs` / `.tag-input` / `.link-suggest` 等）に倣い、下部メタデータ領域を以下の構造で追加する。実装コンポーネントを新規発明せず、`FrontMatterEditor.tsx` の**構造モード表示を静的スナップショット**として忠実に写す。

### 追加する DOM（`editor-body-panel` の直後、`link-suggest` の後・`save-row` の前）

```
<section class="meta-panel" aria-label="メタデータ">     ← FrontMatterEditor <section aria-label="メタデータ">
  <div class="meta-panel-head">
    <button class="pill-btn" aria-pressed="false">生編集（JSON）</button>   ← 構造/生トグル
    <div aria-live="polite" aria-atomic="true"></div>                      ← エラー領域（正常時は空）
  </div>
  <datalist>date/description/title/slug</datalist>
  <div class="meta-field"> キー入力 + 値入力 + 削除ボタン </div>  × 数行（date, title, description のサンプル）
  <div class="meta-add-row"> 新キー入力 + キーを追加ボタン </div>
</section>
```

- サンプルキーは本文（Q2 計画）と整合する現実的な値（例: `date: 2026-04-01`, `description: ...`, `slug: q2-plan`）にする。
- `.meta-field` は `frontMatterRow`（`flex flex-wrap items-start gap-2` / `max-sm` で `flex-col`）に対応させる。
- 入力欄は既存の `.tag-input` / `.dir-dropdown-search` のフォームトーン（`--color-bg` 背景、`--color-hairline` ボーダー、focus で accent）に馴染ませる。キー入力は `font-mono`。

### CSS（`.link-suggest` 群の近く、または新セクションとして追加）

`.meta-panel` / `.meta-panel-head` / `.meta-field` / `.meta-key` / `.meta-value` / `.meta-add-row` を新規定義。全て既存トークンのみ使用（新トークンは定義しない）。

## 実装ステップ

1. **L651 コメント修正**: `.link-suggest` の説明コメントから「FrontMatter は別タブ排他のため、WYSIWYG ビューには FrontMatter パネルを置かない。」を削除し、`.link-suggest` 自体の説明のみ残す（FrontMatter は下部常設になったため、この排他前提の記述は誤り）。
2. **メタデータ領域 CSS 追加**: `.meta-panel` ほかのスタイルをトークンベースで定義。
3. **メタデータ領域 DOM 追加**: `editor-body-panel` の後（`link-suggest` の後・`save-row` の前）に `<section class="meta-panel" aria-label="メタデータ">` を挿入。`FrontMatterEditor.tsx` の構造モードを忠実に再現。実装との対応を示す参照コメント（`#697` / `FrontMatterEditor.tsx`）を付ける。
4. **モバイル確認**: 既存の `@media` セクションに `.meta-field` のスタック（`flex-col`）が効くよう確認・必要なら追記。

## 受け入れ基準

| ID | 基準 | 検証 |
| --- | --- | --- |
| AC-1 | 編集モードタブに `FrontMatter` が存在しない（既に満たすが回帰していないこと） | モックを開き `mode-tabs` が `WYSIWYG / HTML` のみ |
| AC-2 | 本文エディタ領域の下にメタデータ（FrontMatter）編集領域が常設描画されている | モックを開き `editor-body-panel` の下に `meta-panel` セクションが見える |
| AC-3 | メタデータ領域が `FrontMatterEditor.tsx` の構造モード（トグル + キー行 + キー追加行）を反映している | 生編集トグル・キー/値行・キー追加行が揃っている |
| AC-4 | 「別タブ排他」前提のコメント（L651）が下部常設に沿った記述へ更新されている | L651 付近に排他前提の記述が残っていない |
| AC-5 | 新トークンを定義せず既存デザイントークンのみで馴染んでいる | `:root` に追加がない／既存クラスと視覚的に一貫 |

## モバイルモック（`spec/design/pages/mobile/P12-editor.html`）

デスクトップと違い #776 の APG 化がモバイルには及んでおらず、**FrontMatter タブが L1114 に残存**（`<button class="mode-tab" role="tab">FrontMatter</button>`）。Issue の乖離バレット「モードタブに FrontMatter ボタンが残っている」に完全一致するため、Issue の意図（P12 エディター画面の追従）に含める。

- **タブ**: L1114 の `FrontMatter` ボタンを除去 → `WYSIWYG / HTML`（デスクトップと同じ新規セットに合わせる）。
- **メタデータ領域**: `link-suggest` の後・`</main>` 前に FrontMatter 構造モードのスナップショットを追加。
- **命名の注意**: モバイルモックは `.meta-field` を「場所/タグ」のラベル付きフィールド（`.meta-disclosure` 内）に既に使用中。衝突を避けるため、FrontMatter 領域は両モックとも `.fm-panel` / `.fm-row` / `.fm-add`（front-matter 専用の接頭辞）で命名する。
- モバイルの `save-bar` は fixed。メタデータ領域はスクロール内（`editor-wrap` 内）に置く。

## スコープ・リスク

- **スコープ内**: `spec/design/pages/P12-editor.html`（デスクトップ）+ `spec/design/pages/mobile/P12-editor.html`（モバイル）。同一の P12 エディター画面の 2 モック。
- **スコープ外**: React 実装（既に #697 で完了）、他ページのモック。
- **既知の pre-existing 不整合**: デスクトップモック本文は「編集中の既存ノート」（保存済み2分前・本文あり）を描いているのにタブが新規セット（`WYSIWYG/HTML`、`ビジュアル` なし）。これは #776 由来の別問題で本 Issue のスコープ外。触らない（モバイルも同様に新規セットへ揃えるに留める）。
- **リスク**: 低。静的 HTML モックのみ。ランタイム・ビルドへの影響なし。
