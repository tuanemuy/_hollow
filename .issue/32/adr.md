# ADR — Issue #32: 内部リンク参照フィルタの新規入力 UI (P11 詳細からの導線)

## ADR-001: chip タイトル resolver は実装する / 失敗時は UUID 8 文字断片にフォールバック

### Status
Proposed

### Context
Issue 本文のスコープ 3 つ目「chip 表示でノートタイトルも見えるよう resolver の検討」は文言上「検討」だが、同時に「現状は UUID 断片のみ」という欠点認識を明示している。実装する / しない / 一部実装 の選択肢があり、本 Issue で扱うか別 Issue 化するかの判断が必要。

### Decision
本 Issue で chip タイトル resolver を **実装する**。実装失敗時（不正 ID / 他人のノート / 存在しない / 空 title）は既存の UUID 8 文字断片表示にサイレントフォールバックし、「不明なノート」等の追加 UI 文言は導入しない。

### Consequences
- 良い点:
  - Issue 本文の欠点認識を解消できる（P11 経由 / URL 直叩き / SavedView 復元の全経路で chip にタイトルが出る）
  - 失敗時の fallback はゼロ追加コードで既存挙動と一致するため UX 回帰なし
  - resolver は単一の thin loader (`loadReferencingNoteTitle`) に閉じるためレビュー単位が小さい
- トレードオフ:
  - `referencingNoteId` 指定時のホームページ SSR で `findById` 1 クエリが追加。MVP 規模では無視できる
  - 他人のノート ID を URL に直接入れた場合、chip は UUID 断片表示で残り listing は 0 件。情報漏れはないが UX としてはやや奇妙な状態（ADR-006 の方針と一貫）

---

## ADR-002: タイトル解決は `noteRepository.findById` 直叩き

### Status
Proposed

### Context
chip タイトル resolver の実装にあたって、(a) `getNoteDetail` usecase を再利用 (b) port に新規メソッド (`getNoteSummary` 等) を追加 (c) loader 内で `unitOfWorkProvider.run` を経由した `noteRepository.findById` 直叩き、の 3 案がある。

### Decision
案 (c) を採用。`app/components/note/loaders.ts` の既存 `loadPublishStateForNote`（行 386 付近、`publicationStateRepository.findById` 直叩き）パターンに揃え、`unitOfWorkProvider.run` で `noteRepository.findById` を呼び、ownerId 一致チェックを loader 内で行う。失敗系は try/catch でまとめて `{ title: null }` フォールバック。

### Consequences
- 良い点:
  - port / application 層への追加なし。hexagonal の依存方向と既存 port 表面を維持
  - `getNoteDetail` を呼ぶ案より軽量（後者は `findReferrers` + directory path 計算まで走る）
  - 既存 `loadPublishStateForNote` パターンと一貫し、読み手の予測可能性が高い
- トレードオフ:
  - 案 (a) なら ownership check の重複実装を避けられたが、findReferrers 等の不要処理コストが上回る
  - 案 (b) なら usecase 層に明示的な API が生え将来再利用しやすいが、本 Issue 単独では過剰投資（YAGNI）

---

## ADR-003: FilterBar の note picker UI は本 Issue では実装しない

### Status
Proposed

### Context
Issue 本文に「必要に応じて FilterBar に note picker UI も追加検討」とあるが、picker を実装するには note 一覧の検索・選択 UX（モーダル / autocomplete / 候補件数表示など）を組む必要があり、Issue #8 ADR-006 もこれをスコープアウトしていた。

### Decision
本 Issue では note picker UI を **実装しない**。「P11 詳細からの導線」「chip タイトル resolver」の 2 機能で完結させ、picker は独立した別 Issue として起票候補に残す。

### Consequences
- 良い点:
  - PR レビュー単位が小さく保たれる
  - picker UX 設計判断（candidate fetch ストラテジ、虫眼鏡入力位置、autocomplete のキー操作）を本 Issue に持ち込まない
  - Issue 本文の「必要に応じて」「検討」のワーディングを尊重
- トレードオフ:
  - FilterBar 単独起動状態（P11 を経由せず URL 直叩きもしない）からは依然として参照フィルタを開始できない。ただし「P11 → 一覧」「URL コピー」「SavedView 復元」の 3 経路で起動可能なので実用上は許容範囲

---

## ADR-004: 新リンクは `NoteMetaPanel` のバックリンクセクションに設置

### Status
Proposed

### Context
新リンク「このノートを参照しているノート一覧を見る」をどこに置くか。候補は (a) `NoteMetaPanel` の backlinks 行内、(b) `NoteActions` ツールバー、(c) `NoteDetail` 直下の独立リンク。

### Decision
案 (a) `NoteMetaPanel` の backlinks `<dd>` 内、件数表示の直下に配置する。

**リンク文言を pin**: 「このノートを参照しているノート一覧を見る」（spec/pages/index.md P11「内部リンク先 / バックリンクのナビゲーション」要件に整合）。

**backlinks 0 件のときも常時表示する**: クリック先で「該当なし」が出るだけで動作として valid。さらに本リンクは「P11 から URL を生成して共有する」「SavedView の起動経路として保存する」用途でも使えるため、件数ゼロでもリンク自体には固有価値がある。条件分岐を入れない方が読み手の認知コストも下がる。

### Consequences
- 良い点:
  - 「バックリンク（このノートが参照しているノート群）」と「参照しているノート一覧（このノートを参照しているノート群）」は意味的に対になり、視覚的に近接配置することで UX 的に発見しやすい
  - `NoteMetaPanel` は pure presentational なので副作用なく Link 1 行追加で済む
  - spec/pages/index.md P11「内部リンク先 / バックリンクのナビゲーション」要件と適合
- トレードオフ:
  - `NoteActions` 側に置けば「ノート操作の集約点」感はあるが、`NoteActions` は編集 / 公開 / 移動 / 複製 / 削除など状態変更系で、ナビゲーション系リンクとは性格が異なるため適切でない
  - backlinks 0 件のときもリンクを常時表示する判断（条件分岐を入れない、YAGNI）。0 件遷移先で「該当なし」が出るだけで挙動として valid

---

## ADR-005: 任意 props は spread 構文で通す（`exactOptionalPropertyTypes` 対応）

### Status
Accepted

### Context
`referencingNoteTitle` を `HomePage` → `NoteList` → `FilterBar` で透過的に中継するにあたって、`HomePage` / `NoteList` 側の props 型は本当に optional（受け取ったときだけ下流に渡す）として `referencingNoteTitle?: string | null` と定義した。
このプロジェクトは `tsconfig.json` で `exactOptionalPropertyTypes: true` を有効化しているため、`<Child referencingNoteTitle={undefined} />` のように `undefined` を直接渡すと「Type 'undefined' is not assignable to type 'string | null'」エラーになる。
案: (a) 型を `string | null | undefined` に揃える、(b) 親で `referencingNoteTitle ?? null` に正規化して常に渡す、(c) `undefined` のときだけ spread で取り除く。

### Decision
案 (c) を採用。`{...(referencingNoteTitle !== undefined ? { referencingNoteTitle } : {})}` で `undefined` のときは property 自体を渡さない。

### Consequences
- 良い点:
  - 各層の props 型は本来意図した「受け取らないこともある」セマンティクスを保てる
  - `string | null | undefined` のような 3 状態に拡張せず、null 1 つで「未解決 / 解決失敗」を表現できるシンプルさを維持
  - `referencingNoteTitle ?? null` で「未指定」と「解決失敗」を潰すと、将来 3 状態 UI（例: skeleton vs fallback）を導入する余地が消えるが、spread なら現状制約なく型だけ広げれば済む
- トレードオフ:
  - 親の JSX が spread 構文で 1 段 indent 深くなり可読性がわずかに落ちる（biome が自動 format した結果）
  - 案 (a) の方が JSX は素直だが、optional の本来の意味（property 自体の有無）を破壊する
