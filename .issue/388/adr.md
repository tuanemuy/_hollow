# ADR — Issue #388: ディレクトリ移動UIのスケーラビリティ改善 / パス先頭スラッシュ重複の修正

## ADR-001: 移動先ディレクトリ選択 UI を「検索フィルタ付き＋階層インデント表示の単一選択リスト」にする

### Status
Proposed

### Context
移動先ディレクトリ選択は3箇所（`MoveNoteDialog`/`DirectoryPicker`/`MoveDirectoryDialog`）で `<select><option>` ＋ `"  ".repeat(depth)` の空白インデントで実装されている。ディレクトリ数・階層が増えると一覧性が崩れ、スクリーンリーダーは先頭空白を読み飛ばすため階層が伝わらない。代替案:

- **A. 完全な展開/折りたたみツリー**（sidebar の `DirectoryTree.tsx` 流、`role="tree"`）
- **B. 検索フィルタ付き single-select リスト**（`NotePickerDialog.tsx` 流、combobox+listbox、`aria-level` で階層保持）
- **C. 外部ライブラリ（コンボボックス/ツリー）導入**

### Decision
B を採用する。理由:
- 移動先選択は「探して1つ選んで確定」する単発操作で、常設ナビゲーションである sidebar tree（A）の展開/折りたたみ状態管理はオーバースペック。
- `NotePickerDialog` という Dialog 内 combobox+listbox の完成パターンが既にあり、キーボード操作・`aria-activedescendant`・IME-safe Enter・`aria-live` ステータスを再利用できる。
- `FlatDirectory` が既に `path` を持つため、`path`（例 `/Documents/Work`）をオプションの読み上げテキストとして表示すれば、祖先連鎖がスクリーンリーダーに伝わる（A の利点を低コストで取り込める）。視覚インデントは `depth` から算出する。
  - 注意: `role="option"` は `aria-level` をサポートしないため付与しない。階層段数の機械可読化は `role="tree"`/`treeitem`（= A 案）が必要になるが、それはオーバースペックとして却下した。listbox 方式では `path` 表示で「階層が伝わる」要件を満たす。
- C は不要。内製パターンで要件を満たせ、CLAUDE.md も外部依存追加を推奨しない。

### Consequences
- 良い点: 件数増に強い（検索で即絞り込み）。スクリーンリーダーで path により祖先連鎖が伝わる。既存パターン再利用で実装・保守コストが低い。
- トレードオフ: 完全なツリーの「親をたどって視覚的に展開」する操作感は失われるが、検索フィルタがそれを補う。極端な件数での仮想スクロールは本 Issue では実装しない（別 Issue 候補）。

---

## ADR-002: 汎用ピッカー1つに集約し、ダイアログ固有の事情は呼び出し側で吸収する

### Status
Proposed

### Context
3ダイアログにはそれぞれ固有の事情がある: `MoveDirectoryDialog` は cyclic 除外（`getDescendantIds`/`excludeSubtree`）と root の「（ルート）」ラベル、`DirectoryPicker` は「既存選択 vs 新規作成」の二択構造。これらをピッカー内部に取り込むと汎用性が崩れる。

### Decision
ピッカー（`DirectorySelectField`）は「与えられた options を表示・検索・単一選択する」責務に限定し、フィルタ/除外/root合成は持たせない。各固有事情は呼び出し側で処理する:
- cyclic 除外: `MoveDirectoryDialog` が `excludeSubtree` 済みの配列を渡す（SSOT は backend `assertNotCyclicMove`、UI はミラー）。
- root ラベル: `includeRootOption?: { id; label }` prop で先頭に合成。
- 二択構造: `DirectoryPicker` は新規作成入力部を従来どおり保持し、選択側だけピッカーに置き換える。

### Consequences
- 良い点: ピッカーが純粋な表示・選択責務に保たれ、3箇所で再利用できる。`getDescendantIds`/`excludeSubtree` の SSOT を崩さない。
- トレードオフ: 呼び出し側に options 構築ロジックが残るが、それは各ダイアログ固有の関心事であり適切な配置。

---

## ADR-003: パスを文字列連結ではなくセグメント配列で組み立てる

### Status
Proposed

### Context
`flattenDirectoryTree` は `path = ${parentPath}/${node.name}` と無条件にスラッシュを前置していた。root の `name` が空文字のため、`walk(root, "")` → `path="/"`、その子 → `path="//Work"` と先頭スラッシュが重複していた。

### Decision
祖先 `name` のセグメント配列を引き回し、空セグメントを除外して `"/" + segments.join("/")` で組み立てる。`node.name === ""` の場合は祖先セグメントをそのまま引き継ぐ（root 自身は `path="/"`）。

### Consequences
- 良い点: 空セグメント起因の重複・末尾スラッシュを構造的に排除。root 配下が `/Documents/Work` で表示される。
- トレードオフ: なし。出力する他フィールド（`depth`/`id`/`parentId`/`name`）は不変で、消費側2箇所への影響は期待挙動の範囲内。回帰防止のユニットテストを追加する。

---

## ADR-004: ピッカーの「選択中」表示と option 内2段表示（実装時判断）

### Status
Accepted

### Context
`<select>` は選択値を常時 inline 表示するが、combobox+listbox は検索入力に query が入るため「いま何が選ばれているか」がフィルタ中に視認しづらい。また option 内で `name`（主）と `path`（補助・階層伝達）の両方を出す必要がある。

### Decision
- 検索入力の上に「選択中: {primary}（{path}）」のサマリ行を出す（`value !== null` 時のみ）。これは a11y ではなく見た目の補助で、確定値が常に見える `<select>` の利点を埋める。
- option は2段組（主テキスト＝`name`、なければ `path`／補助テキスト＝`path`）。root（`name===""`）と `includeRootOption` 合成行は補助テキストなしの単段。
- 視覚インデントは `paddingLeft = 12 + depth*16` の inline style。`depth` 由来の動的値で Tailwind の任意値クラスにすると JIT が拾えないため style 属性を使用（トークン色は一切いじらない）。

### Consequences
- 良い点: フィルタ中も選択状態が見え、階層が `path` 表示で SR にも伝わる。
- トレードオフ: inline `paddingLeft` は唯一の非ユーティリティ指定だが、動的 `depth` 起因で不可避（クラス文字列ではない）。

---
