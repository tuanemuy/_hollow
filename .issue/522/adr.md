# ADR — Issue #522: WYSIWYGエディターのフォーカス枠線・余白・ビジュアル編集UIを改善する

## ADR-007: フォーカス表現はコンテナに一本化し、内側 contenteditable のリングを打ち消す

### Status

Proposed

### Context

`app/styles/index.css` の `@layer base` に全画面共通の `:focus-visible { box-shadow: var(--shadow-focus); }` がある。Tiptap/ProseMirror はコンテナ div（`EditorContent`）の内側に `contenteditable` な `.ProseMirror` を描画するため、入力すると `.ProseMirror` がフォーカスを得てこのグローバルルールにマッチし、コンテナ枠線の内側に 4px リングが出る（=二重枠）。`[&_.ProseMirror]:outline-none` は outline しか消さないためリング（box-shadow）が残る。InlineEditor の `.note-detail-content`（同じく contenteditable）も同症状。

選択肢:

1. グローバル `:focus-visible` ルール自体を変更する（例: contenteditable を除外）。
2. コンテナ側でフォーカスを表現し、内側要素のリングを `shadow-none` で打ち消す（コンポーネント内で完結）。

### Decision

選択肢 2 を採用する。

- コンテナ（`EditorContent` / `.note-detail-content` ホスト）に `focus-within:shadow-focus` を付与し、トークン化されたフォーカスリングを「枠線と同じ要素」の外周に一段だけ出す。`focus-within:border-accent` と組み合わせて枠線色も変える。
- 内側 contenteditable のリングを打ち消す。WysiwygEditor はフォーカス可能要素が `.ProseMirror` 本体なので `[&_.ProseMirror]:focus-visible:shadow-none`。InlineEditor はホスト `<section>` 自身は contenteditable ではなく、allow-list された子ブロック（`<p>`/`<h2>`/`<li>` 等）がフォーカスを得るため、子孫を対象とする `[&_:focus-visible]:shadow-none`（= `.note-detail-content :focus-visible`）で打ち消す。`outline-none` は維持。

グローバルルール（選択肢 1）は変更しない。理由: `:focus-visible` は全画面のフォーカス可視化の SSOT であり、ここを触ると入力・ボタン・メニュー等のフォーカス表現に広く影響する。Issue #522 のスコープ（エディター本文のディテール）を超える。

### Consequences

- 良い点: フォーカス表現が `--shadow-focus` トークンに統一され、`public/styles.ts` / `tag/styles.ts` の `focus:shadow-focus` と一貫する。変更がエディターコンポーネント内に閉じ、全画面への波及がない。二重枠が解消する。
- トレードオフ: 内側リングの打ち消しを各エディターで明示する必要がある（グローバル側で一括除外しないため、将来別の contenteditable を足すと同じ打ち消しが要る）。Issue スコープと安全性を優先し許容する。

---

## ADR-008: InlineEditor の先頭/末尾 margin リセットは `.note-detail-content[data-editing]`（編集ホスト限定）の CSS で行う

### Status

Proposed

### Context

WysiwygEditor は Tailwind 任意セレクタ（`[&_.ProseMirror>:first-child]:mt-0` 等）で先頭/末尾の margin をリセットできる。一方 InlineEditor の本文は `.note-detail-content` で、`dangerouslySetInnerHTML` 由来の子要素にユーティリティ class を付けられない（ADR-002 / Issue #70 の「ユーティリティファーストの唯一の例外」）。

ここで問題になるのが `.note-detail-content` の共有範囲。調査の結果、このクラスは **7 箇所**で使われている: `NoteDetail`（読み取り）/ `NoteRevisionDetail`（リビジョン履歴）/ `HtmlEditor`（生 HTML 編集）/ `PublicNoteDetail`（公開ページ）/ `LegalDocument`（利用規約等）/ `InlineEditor`（インライン編集）ほか。`@layer components` に無条件で `.note-detail-content > :first-child { margin-top: 0 }` を足すと、編集 UI 以外の公開ページ・法務文書・リビジョン差分表示の先頭/末尾余白まで変わってしまう。これは Issue #522 の「含まれないもの（読み取り専用 NoteDetail の本文表示の変更）」と矛盾する。

### Decision

余白リセットを **InlineEditor の編集ホストだけにスコープ**する。InlineEditor ホストに静的マーカー属性 `data-editing`（`data-editing=""`、ADR-003 の「静的に有効な属性」規約）を付与し、`@layer components` に次を追加する:

```css
.note-detail-content[data-editing] > :first-child { margin-top: 0; }
.note-detail-content[data-editing] > :last-child { margin-bottom: 0; }
```

`[data-editing]` を持つのは InlineEditor ホストのみなので、読み取り系 6 箇所には一切波及しない。specificity は class+attr+pseudo = 0,0,3,0 で、要素型ルール `.note-detail-content h2`（0,0,1,1）/ `p`（0,0,1,1）に勝つため先頭 h2/h3 の `margin-top`・末尾 p の `margin-bottom` を確実に 0 にできる。これは新規の `@apply` ベース component class の追加ではなく、既存 `.note-detail-content` 例外への属性スコープ付き通常 CSS プロパティ追記であるため、ADR-002 が禁じる「新規例外の増設」には当たらない。

### Consequences

- 良い点: WysiwygEditor と InlineEditor で上下余白が視覚的に揃う。余白リセットが編集中の本文だけに閉じ、読み取りページ・法務文書・リビジョン履歴への副作用がゼロ。Issue の宣言スコープと厳密に一致する。既存例外の枠内に収まり、規約違反を増やさない。
- トレードオフ: InlineEditor ホストに表示に直接寄与しないマーカー属性 `data-editing` が増える。ただし状態スタイルを `data-*` で表現する既存規約（ADR-003）に沿っており、コストは小さい。

---
