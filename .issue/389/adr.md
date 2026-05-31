# ADR — Issue #389: ノート一覧ビューのUI改善

## ADR-001: `thumbnailUrl` フィールドを DTO / projection / loaders から除去する

### Status
Accepted

### Context
タイル表示のサムネイル枠を廃止すると、`note.thumbnailUrl` を実際に読む箇所は `TileView.tsx` のみで、それも消える。`thumbnailUrl` は以下に存在する:

- `app/core/application/dto/note.ts` の `NoteListItemDTO`
- `app/core/application/note/view.ts` の `toNoteListItem` projection
- `app/components/note/loaders.ts` の `OwnedNoteCommon`
- producer 各所（`listNotesByOwner` / `listNotesInDirectory` / `listUserPublicNotes` / loaders 検索パス）

全 producer が `thumbnailUrl: null` をハードコードしており、値を埋める実装は存在しない。`loaders.ts` のコメントは「将来の検索インデックス拡張用に共通形状へ残す」意図を記すが、実態は全パスで埋まらないデッドフィールド。Issue 本文も「他に使われていなければ projection からの除去も検討」と明示。

選択肢:
1. フロント（TileView）からの参照だけ消し、DTO/projection には null フィールドを残す
2. DTO / projection / loaders から完全除去する

### Decision
**選択肢2（完全除去）を採る。** 常に `null` のフィールドを残すと、将来 `!== null` 分岐のような誤実装を誘発し、型安全優先（CLAUDE.md 原則「Make illegal states unrepresentable」）に反する。YAGNI に照らしても、サムネイルを実装する際に改めて Issue 単位で型を再導入する方が筋が良い。

### Consequences
- 良い点: デッドフィールドが消え、型がドメインの実態と一致する。誤った null 分岐の余地がなくなる。
- トレードオフ: 将来サムネイルを復活させる際、DTO / projection / loaders への再追加（5ファイル）が必要。ただし挙動変化のない `null` リテラル削除のみなので除去コストは低く、`UserPublicTop` は不参照のため安全。

---

## ADR-002: visibility 系ユーティリティの共通化先を新規 `list/styles.ts` にする

### Status
Accepted

### Context
`CHIP_BASE` / `visibilityChipClass` / `visibilityLabel` が `ListView.tsx` と `TileView.tsx` に完全重複している。共通化先の候補は (a) 既存 `listSelectors.ts`、(b) 新規 `list/styles.ts`。

### Decision
**新規 `list/styles.ts` に集約する。** `listSelectors.ts` は冒頭 JSDoc で「React 非依存の純粋ロジック（reducer / day grouping / URL 変換）置き場」と定義されており、UI utility 文字列の置き場ではない。CLAUDE.md の Styling 規約は「繰り返す utility 文字列は module-scoped 定数へ集約」とし、`public/styles.ts` 等のドメイン配下 `styles.ts` を確立パターンとして挙げている。`list/styles.ts` 新設がこれに一貫する。`common/styles.ts` の汎用 `chip` は visibility 別の色分けを持たないため流用不可。

なお純粋関数 `formatDate` は utility 文字列ではないため `styles.ts` ではなく `listSelectors.ts`（純粋ロジック置き場）へ移す。

### Consequences
- 良い点: 重複が解消し、Styling 規約に沿った置き場になる。3 ビューで色分けチップを共有できる。
- トレードオフ: 新規ファイルが 1 つ増える。

---

## ADR-003: TileView のタグ折り返し

### Status
Accepted

### Context
TileView はグリッドカード内の限られた幅にメタ行（タグ・公開チップ・更新日時）を収める。ListView と同じ `flex flex-wrap` を踏襲したが、タグ文字列は半角スペース連結された 1 つの `<span>` であり、長いタグ名が `flex` 子要素として幅をはみ出す余地がある（ListView は横幅が広く顕在化しにくい）。

### Decision
タグの `<span>` に `min-w-0 break-words` を付与し、カード幅を超えるタグ名は折り返すようにした。ListView 側はレイアウト変更を最小化する方針（plan.md ステップ2の指示）に従い既存スタイルのまま据え置く。

### Consequences
- 良い点: 狭いタイル幅でもタグがカードからはみ出さない。
- トレードオフ: ListView と TileView のタグ `<span>` で `min-w-0 break-words` の有無が分かれる。グリッドの幅制約という TileView 固有の事情に対する局所対応。

---
