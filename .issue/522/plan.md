# 実装計画 — Issue #522: WYSIWYGエディターのフォーカス枠線・余白・ビジュアル編集UIを改善する

**Issue:** #522
**作成日:** 2026-06-09
**複雑度:** 中〜大規模（フロントエンド・スタイリングのみ。設計判断あり）

---

## 目的

ノート編集の WYSIWYG（ビジュアル編集）エディター（`WysiwygEditor`）のフォーカス枠線・上下余白・編集中インタラクション（キャレット/選択範囲）の粗さを解消し、編集体験のディテールを整える。CLAUDE.md の Styling 規約（ユーティリティファースト、トークン SSOT）に準拠する。

## スコープ

### 含まれるもの

- 二重枠（フォーカス時にコンテナ枠線より内側に出るリング）の解消
- エディター内の上下余白を視覚的に揃える（先頭/末尾ブロック要素の margin リセット）
- ビジュアル編集中のフォーカス枠・キャレット・選択範囲の表現の洗練
- 上記をデザイントークン・既存スタイル方針に準拠させる
- 同種の症状を持つ `InlineEditor`（`.note-detail-content` ホスト）への一貫した適用

### 含まれないもの

- ツールバー・タイトル入力・モードタブ等、エディター本文以外の UI 改修
- `HtmlEditor`（生 HTML 編集）のスタイル変更
- 読み取り専用の `NoteDetail`（公開ページ）本文表示の変更（編集中の見え方が対象）
- 新規 Tiptap 拡張の追加や挙動変更
- `:focus-visible` グローバルルール自体の仕様変更（影響範囲が全画面に及ぶためスコープ外）

## 二重枠の原因分析

`app/styles/index.css` の `@layer base` に以下のグローバルルールがある:

```css
:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);   /* 0 0 0 4px oklch(...) のリング */
  border-radius: inherit;
}
```

`WysiwygEditor` の構造は「`EditorContent`（`border-hairline` + `focus-within:border-accent` のコンテナ div）の内側に、Tiptap が `.ProseMirror`（`contenteditable` = フォーカス可能要素）を描画する」というもの。

- エディターに入力すると `.ProseMirror` がフォーカスを得て **`:focus-visible` にマッチ** → `box-shadow: var(--shadow-focus)` の 4px リングが付く。これがコンテナ枠線の内側に出る「もう一段の枠」の正体。
- `[&_.ProseMirror]:outline-none` は **outline しか消していない**（box-shadow は別プロパティ）ため、このリングは残る。Issue 本文の「outline は消しているはずなのに枠が出る」という観察と完全に一致する。
- 同じグローバルルールは `InlineEditor` の `.note-detail-content`（`contenteditable` section）にも作用するため、InlineEditor でも同種の二重枠が出る。

**最有力（ほぼ確定）:** グローバル `:focus-visible` の `box-shadow: var(--shadow-focus)` が `.ProseMirror` に効いている。
他の仮説（UA の focus-visible デフォルト outline / Tiptap が別要素を生成 / `.ProseMirror:focus` 専用スタイル）は、コードベースに該当定義が無く、グローバルルールで全症状を説明できるため棄却。

**方針:** 二重枠は「コンテナ側でフォーカスを表現し、内側 `.ProseMirror` の box-shadow リングを無効化する」ことで解消する。コンテナの `focus-within:border-accent`（枠線色変化）に加え、`focus-within:shadow-focus`（コンテナ外周のリング）でフォーカスを表現すると、トークン化されたフォーカス表現（`--shadow-focus`）を「枠線と一致する位置（=コンテナ自身）」に一本化できる。内側 `.ProseMirror` のリングは打ち消す。

## 実装ステップ

### 1. `WysiwygEditor` の `EditorContent` でフォーカス表現をコンテナに一本化し、内側リングを無効化する

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx:577`
- **変更内容:**
  - `.ProseMirror` の box-shadow リングを打ち消す: `[&_.ProseMirror]:focus-visible:shadow-none` を追加（フォーカス時限定で打ち消し、将来 `.ProseMirror` 配下に別の box-shadow が来ても潰さない）。`outline-none` は維持。
    - 記法確定: Tailwind v4 では stacked variant の `focus-visible:` は `[&_.ProseMirror]` が生成するセレクタの subject（最右の `.ProseMirror`）に付くため、`[&_.ProseMirror]:focus-visible:shadow-none` と `[&_.ProseMirror:focus-visible]:shadow-none` は同一セレクタ（`.parent .ProseMirror:focus-visible`）にコンパイルされる。可読性の高い前者に一本化する（レビュー S-001）。
    - カスケード: `shadow-none`（`@layer utilities`）はグローバル `:focus-visible`（`@layer base`）に **レイヤー順で常に勝つ**（specificity 不問）。打ち消しは確実。
  - フォーカス表現をコンテナに移す: 既存の `focus-within:border-accent` に加え `focus-within:shadow-focus` を付与し、コンテナ外周にトークン化されたリングを表示。
  - リングの角と枠線を一致させるため、`transition-[border-color,box-shadow]` を付与して枠線色＋リングが滑らかに出るようにする（既存の `public/styles.ts` の input が `transition-[border-color,box-shadow]` を使う前例に倣う）。`motion-reduce:transition-none` も付ける。
- **理由:** 二重枠の解消（受け入れ基準1）。フォーカス枠を「コンテナ＝枠線と同じ要素」に一致させ、内側の重複リングを消す。`--shadow-focus` トークンを使うことで他の入力系（`focus:shadow-focus` を使う `public/styles.ts`, `tag/styles.ts`）と表現を統一する。

### 2. `WysiwygEditor` 本文の先頭/末尾ブロック要素の margin をリセットして上下余白を揃える

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx:577`
- **変更内容:** `EditorContent` の className に以下を追加:
  - 先頭子要素の margin-top リセット: `[&_.ProseMirror>:first-child]:mt-0`
  - 末尾子要素の margin-bottom リセット: `[&_.ProseMirror>:last-child]:mb-0`
- **理由:** 現状 `[&_p]:my-2` / `[&_h2]:mt-6` / `[&_h3]:mt-5` が先頭ブロックにも margin-top を付け、`p-4`（padding-top 16px）に加算されて上部だけ余白が広く見える（受け入れ基準2）。先頭は mt-0、末尾は mb-0 にすることで `p-4` の 16px と視覚的な上下余白を一致させる。`.ProseMirror>` の直下子セレクタにすることで、リスト内のネスト要素やブロック内段落には影響させない。

### 3. ビジュアル編集中のキャレット・選択範囲の表現を洗練する

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx:577`
- **変更内容:** `EditorContent` の className に以下を追加:
  - キャレット色をアクセントに: `[&_.ProseMirror]:caret-accent`（Tailwind v4 は `caret-*` を color トークンから生成する。`accent` は既存トークン）。
  - 選択範囲の色をトークン化: Tailwind v4 のビルトイン `selection:` バリアントを用い `[&_.ProseMirror]:selection:bg-accent-surface` で `.ProseMirror` 配下の選択ハイライトを `--color-accent-surface` にする。`selection:` バリアントは `::selection` を内部で生成するため、生の `[&_::selection]` 任意セレクタより安全・確実。`--color-accent-surface`（淡いグレー）は UA デフォルトの青より本プロダクトのモノクロ基調に馴染む。
- **理由:** 編集中のキャレット/選択範囲の見え方を洗練（受け入れ基準3）。トークン化された色（`accent` / `accent-surface`）で表現することで規約準拠（受け入れ基準4）。`ProseMirror-selectednode` / `ProseMirror-gapcursor` は本エディターの拡張構成（StarterKit ベース、画像はインライン img）では日常編集で前面に出にくいため、まずは caret/selection の整えに集中する（過剰スコープを避ける）。

### 4. `InlineEditor` のフォーカス表現と余白を `WysiwygEditor` と一貫させる（読み取りページに波及させない）

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx:833`、`app/styles/index.css` の `.note-detail-content`
- **変更内容:**
  - フォーカス枠の二重化解消: `.note-detail-content` ホストも `contenteditable` で `:focus-visible` の内側リングが出るため、`focus-within:shadow-focus`（＋既存 `focus-within:border-accent`）をホストに付け（WysiwygEditor と同じ表現）、ホスト自身の `:focus-visible` リングは `focus-visible:shadow-none` ユーティリティで打ち消す。
  - 余白（**編集ホスト限定にスコープ**）: `.note-detail-content > * + *`（隣接 margin-top）は先頭要素には付かないが、`h2`/`h3` の個別 `margin-top`（index.css:213/223）と `p` の `margin-bottom`（index.css:198）が先頭/末尾に残る。`.note-detail-content` は **7 箇所**（`NoteDetail` / `NoteRevisionDetail` / `HtmlEditor` / `PublicNoteDetail` / `LegalDocument` / `InlineEditor` ほか）で共有されるため、無条件の先頭/末尾リセットは公開ページ・法務文書・リビジョン履歴の本文表示まで変えてしまい、本Issueの「含まれないもの（読み取り専用 NoteDetail の本文表示の変更）」と矛盾する（レビュー P-001）。
    - そこで **InlineEditor ホストにだけ静的マーカー属性 `data-editing` を付与**し（`data-editing=""`、ADR-003 の「静的に有効な属性」規約）、`@layer components` に `.note-detail-content[data-editing] > :first-child { margin-top: 0 }` / `.note-detail-content[data-editing] > :last-child { margin-bottom: 0 }` を追加する。これで余白リセットは編集中の本文だけに閉じ、読み取り系 6 箇所には一切波及しない。
    - specificity: `.note-detail-content[data-editing] > :first-child`（class+attr+pseudo = 0,0,3,0）は要素型ルール `.note-detail-content h2`（0,0,1,1）/ `p`（0,0,1,1）に勝つため、先頭 h2/h3 の `margin-top`・末尾 p の `margin-bottom` を確実に 0 にできる（レビュー P-002）。
- **理由:** WysiwygEditor と InlineEditor は隣接モードで見た目が揃うべき（一貫性）。子要素にユーティリティを付けられない（ADR-002 例外）ため CSS 側でリセットするが、属性スコープで編集ホストに限定することで読み取りページへの副作用ゼロを保証する。新規 `@apply` やコンポーネント class の新設ではなく、既存 `.note-detail-content` 例外への通常 CSS プロパティ追記であり、ADR-002 が禁じる「新規例外の増設」には当たらない。

### 5. 反映と検証

- `pnpm typecheck && pnpm lint:fix && pnpm format` を実行し、Tailwind の任意セレクタ記法（`[&_...]`）が Biome/型でエラーにならないことを確認する。
- ブラウザでビジュアル編集モードに入り、二重枠・上下余白・キャレット/選択範囲を目視確認（testing.md 参照）。

## 設計判断

詳細は `adr.md` を参照。

- **ADR-007:** フォーカス表現はコンテナ（枠線と同じ要素）に `focus-within:shadow-focus` で一本化し、内側 `.ProseMirror`（および `.note-detail-content`）の `:focus-visible` box-shadow リングを `shadow-none` で打ち消す。グローバル `:focus-visible` ルール自体は変更しない（全画面影響を避ける）。
- **ADR-008:** `InlineEditor` の先頭/末尾 margin リセットは `.note-detail-content[data-editing]`（編集ホスト限定スコープ）に対する CSS で行い、読み取り系 6 箇所への波及を防ぐ。`.note-detail-content` は ADR-002 の既存例外であり、属性スコープ付きの通常 CSS プロパティ追記は新規例外の増設には当たらない。
- トークン: `--shadow-focus` / `accent` / `accent-surface` はいずれも既存。**新規トークンの追加は不要**（`tokens.css` / `@theme inline` への追記なし）。

## リスクと注意点

- **`selection:` バリアントは確実にコンパイルされる:** Tailwind v4 の `selection:` は `&::selection, & *::selection` を生成し、`[&_.ProseMirror]:selection:bg-accent-surface` は `.ProseMirror::selection, .ProseMirror *::selection` を確実に出す（`bg-accent-surface` も `@theme inline` ブリッジ済みで生成される）。コンパイル不成立のフォールバックは不要。実ブラウザ差（特に Safari の contenteditable 内 `::selection` の `background` 適用挙動）だけ dev で目視確認する（レビュー S-003）。
- **`focus-visible:shadow-none` でリングを打ち消す影響:** フォーカス時限定に絞るため、`.ProseMirror` 内のコードブロック等が将来 box-shadow を持っても潰さない。打ち消し自体はカスケードレイヤーで確実（utilities > base）。
- **`.note-detail-content` の margin リセットは編集ホスト限定:** `[data-editing]` 属性スコープにより、読み取り系 6 箇所（`NoteDetail` / `NoteRevisionDetail` / `HtmlEditor` / `PublicNoteDetail` / `LegalDocument` ほか）には波及しない。InlineEditor の本文だけが対象。読み取りページの目視は一応行うが、`[data-editing]` を持たないため変化しないことの確認が目的。
- **`focus-within:shadow-focus` のトランジション:** `EditorContent` は `min-h-[320px]` の大きな矩形で、4px リングが外周に出る。`transition-[border-color,box-shadow]` を付けるので体感が重くないか dev で確認する（`motion-reduce:transition-none` も付与、レビュー S-002）。
- **SSR:** 変更は純粋な className/CSS/静的属性のみ。サーバー/クライアント差異やハイドレーションへの影響なし。
- **`focus-within` の連鎖:** ツールバーのボタンにフォーカスが移ったときコンテナの `focus-within` は外れる（ツールバーは別 div）。期待挙動どおり（編集本文にフォーカスがある間だけリング表示）。

## テスト方針

`testing.md` 参照。要点:

- ノート編集画面でビジュアル編集モードに切り替え、本文クリックで（a）二重枠が出ないこと（b）コンテナ外周にトークン化リングが一段だけ出ること、を確認。
- 本文先頭が見出し/段落いずれの場合も上下余白が `p-4` と視覚的に揃うこと。
- テキスト選択時のハイライト色・キャレット色がアクセント基調になること。
- インライン編集モードでも同様に揃うこと。読み取りページ（公開ノート）の本文表示が崩れないこと。

## レビュー履歴

### 1周目（自己検証）

**検証・修正した点**:

- 二重枠の原因をコードで確定: グローバル `:focus-visible { box-shadow: var(--shadow-focus) }`（index.css 168-172）が `.ProseMirror` contenteditable に効いていることを grep で確認。`[&_.ProseMirror]:outline-none` が outline しか消さない点も裏取り済み。
- 任意子セレクタ記法（`[&_...>:first-child]`）の前例を確認: `app/components/view/SavedViewsList/styles.ts` の `[&>*:last-child]:self-center` が既存利用。記法リスクを低減。
- 選択範囲の指定を生の `[&_::selection]` から Tailwind v4 ビルトイン `selection:` バリアント（`[&_.ProseMirror]:selection:bg-accent-surface`）に変更。コンパイルの確実性が高い。
- `--shadow-focus` / `accent` / `accent-surface` がいずれも既存トークンであることを確認 → 新規トークン追加不要を確定。
- InlineEditor も同じグローバルルールで同症状が出ることを確認し、`.note-detail-content`（ADR-002 例外）での余白リセット方針を ADR-008 に記録。新規例外の増設には当たらないと整理。

**未解決**: なし。

### 2周目（2視点並列レビュー: 要件カバレッジ / アーキ・リスク）

**修正した点**:

- **[P-001]**（アーキ視点・要修正）: `.note-detail-content` が読み取りページ・法務文書・リビジョン履歴を含む **7 箇所**で共有されている事実が判明。`@layer components` への無条件 margin リセットは公開ページ等まで変えてしまい、本Issueの「含まれないもの（読み取り専用 NoteDetail の本文表示の変更）」と矛盾する。→ ステップ4・ADR-008 を改訂し、InlineEditor ホストに静的マーカー属性 `data-editing` を付与、`.note-detail-content[data-editing] > :first-child/:last-child` に**スコープを限定**。読み取り系への副作用ゼロを保証する設計に変更。
- **[P-002]**（アーキ視点）: 先頭/末尾リセットの specificity が要素型ルール（`.note-detail-content h2` 等）に勝つことを未検証だった。→ `[data-editing]` 属性を含むセレクタ（0,0,3,0）が要素型ルール（0,0,1,1）に勝つことを明記。
- **[S-001]**（アーキ視点）: `[&_.ProseMirror]:focus-visible:shadow-none` と `[&_.ProseMirror:focus-visible]:shadow-none` は同一セレクタにコンパイルされると確認 → 前者に一本化、迷いの記述を削除。
- **[S-002]**: 大きなコンテナでの box-shadow トランジション体感をリスク・テストに追記。
- **[S-003]**: `selection:` のフォールバック記述は過剰だったため削除し、実ブラウザ差（Safari contenteditable）の確認に置換。

**取り込んだ改善提案**: S-001 / S-002 / S-003（上記）。要件カバレッジ視点は「問題点ゼロ」、S-001/S-002 は確認観点の補強として反映。

**見送った提案**: なし。

**終了判定**: 要件カバレッジ視点は問題点ゼロ。アーキ視点の P-001/P-002 を反映済みで、残るは確認観点のみ。スタイリング限定の contained な Issue であり収束したため、レビューループを終了する（実装後の動作確認で実適用を検証）。
