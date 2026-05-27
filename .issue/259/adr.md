# ADR — Issue #259: プレビュー編集モーダルの情報設計改善

## ADR-001: FrontMatter 折りたたみに `<details>` ネイティブ要素を採用

### Status
Accepted

### Context
critique H-1 で「FrontMatter は折りたたみ化して初心者の負荷を下げる」という方針が示された。実装の選択肢:

1. **React state による開閉**: `useState<boolean>` + `<button onClick>` + `aria-expanded` + 子要素の `hidden`
2. **`<details>` / `<summary>` ネイティブ要素**: ブラウザネイティブのトグル

### Decision
`<details>` / `<summary>` を採用する。

### Consequences
- 良い点:
  - キーボード操作（Space / Enter で開閉）と ARIA 状態がブラウザ実装でカバーされる
  - 追加 state なしで、開閉状態はモーダル閉時にリセットされる（毎回デフォルト閉から始まる）
  - JSX の階層が浅く、コード量が少ない
- トレードオフ:
  - スタイリングが OS / ブラウザの marker（三角形）に依存する。`list-none` + 自前の caret（`::before` / `::-webkit-details-marker`）で揃える必要がある
  - フォーカスリングと focus-visible のスタイルを `<summary>` に明示的に当てる必要がある（focus-within も併用）

---

## ADR-002: `AiSuggestionBadge` をローカルコンポーネントに留める

### Status
Accepted

### Context
critique H-2 の「AI 提案」バッジは 4 つのフィールドで再利用する。配置の選択肢:

1. **`IngestionPreviewForm.tsx` モジュールスコープ内のローカル関数コンポーネント**
2. **`app/components/common/` へ昇格**

### Decision
ローカル関数コンポーネント `AiSuggestionBadge` として `IngestionPreviewForm.tsx` 内に置く。

### Consequences
- 良い点:
  - 現状はこの 1 モーダルでしか使わない。`common/` に置くと「どこで使う想定なのか」が曖昧になり、将来同じ概念だが文脈の違うバッジが追加されたときにここを真似て肥大化するリスクがある
  - 変更は 1 ファイル内で完結し、レビュー範囲が狭くなる
- トレードオフ:
  - 別の AI 提案 UI（例: タイトル候補ピッカー、推論ジョブの再生成ボタン）が登場したときに重複が出る可能性がある。その時点で `common/` 昇格を ADR で再判断する（YAGNI）

---

## ADR-003: 編集判定は「初期 LLM 提案値との一致比較」で行う（`dirty` フラグは持たない）

### Status
Accepted

### Context
「ユーザーが編集したかどうか」の判定方法の選択肢:

1. **参照値比較**: 初期値（LLM 提案）を `useMemo` で保持し、現在の state と比較する
2. **`dirty` フラグ**: 最初の `onChange` で `true` に切り替え、以降は固定

### Decision
参照値比較を採用する。

### Consequences
- 良い点:
  - ユーザーが編集後に元の LLM 提案値と完全に一致する文字列に戻した場合、バッジが再表示される。critique H-2 の「自分で入力したのか / 提案を採用したのか」を見分けたいというユーザー意図に対して、「結果的に提案と同じ値になった」状態を「提案採用」とみなすほうがユーザーの直感に合う
  - 余分な state（`dirty` フラグ）が要らない
- トレードオフ:
  - タグの場合、`"alpha, beta"` と `"alpha,beta"` のような表記揺れで差分判定がブレる。critique は「未編集時に AI 提案であることを示す」のが主目的で、編集後の挙動は副次的なので、簡便なテキスト完全一致で十分。気にする必要があれば将来 `parseTagInput` 結果の正規化比較に切り替える
  - FrontMatter は `formatInitialFrontMatterJson` で整形した文字列を初期値にする。ユーザーが意味的に同じ JSON だが文字列としては違う形に編集した場合、編集扱いになる。これも問題にならない（むしろ "意図的にフォーマットを変えた = 編集" は妥当）
