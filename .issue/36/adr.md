# ADR — Issue #36: P12 内部リンク補完 UI

## ADR-001: Mention ノード化せずプレーンテキスト挿入

### Status
Proposed

### Context
Issue 本文・ADR-002（Issue #9）では「`[[note-title]]` を Mention ノードに置換」「`[[...]]` ↔ Mention ノードの双方向変換（ProseMirror Input Rule + parseHTML）」と書かれていた。一方、Issue #36 の受入条件は「候補を選択すると `[[note-title]]` 相当のテキストが入力され、サーバー側 `INTERNAL_LINK_PATTERN` でバックリンクとして抽出される」のみで、Mention ノードという DOM/AST 表現が必要かは明示されていない。

Mention ノード化のコスト:
- `parseHTML` / `renderHTML` のラウンドトリップ実装（~80 行）
- `<span data-internal-link>` 属性を保持するため `HtmlSanitizer` の allow-list 拡張（セキュリティ表面積の拡大）
- 保存 → 再読込での round-trip 不整合リスク（属性が剥がれた時の挙動）
- 編集中→保存→再読込で Mention ノードが復元できなければ、テキスト編集と挙動が分かれて UX 二重化

選択肢:
1. Mention ノード方式（ADR-002 原案、`renderHTML` で `<span data-internal-link>...</span>` を出力）
2. **プレーンテキスト挿入方式**（Mention 拡張は Suggestion plugin の host としてのみ利用、`command` で `editor.insertContent("[[title]]")`）
3. `@tiptap/suggestion` だけ導入し Mention 拡張を使わない（プラグイン自体を低レベル API として直接組み立てる）

### Decision
**選択肢 2: Mention 拡張は Suggestion host として使い、ノードは挿入せずプレーンテキストで `[[title]]` / `#name` を `command` 経由で挿入する。**

`Mention.configure({ suggestion: { command: ({ editor, range, props }) => editor.chain().deleteRange(range).insertContent(text).run() } })` の形で、Mention の `addNode` / `addAttributes` を活かさず、`suggestion` フィールドだけ利用する。これにより:
- ProseMirror Schema は変更なし
- 保存時の `getHTML()` 出力に Mention ノード由来の構造は一切含まれない
- `HtmlSanitizer` の allow-list は変更不要
- サーバー側 `extractMetadataFromHtml` (`INTERNAL_LINK_PATTERN`) はテキストのまま抽出できる

選択肢 3（`@tiptap/suggestion` 単独）は理論的に最小だが、公式ドキュメント・コミュニティサンプルの大半が Mention 拡張経由の利用例である。低レベル API 直叩きは v3 → v4 マイグレーション時の互換性リスクが大きいため不採用。

### Consequences
- 良い点:
  - 実装行数の削減（~80 行の parseHTML/renderHTML が不要）
  - サニタイザ・サーバー側パイプラインを破壊しない
  - HTML モード ↔ WYSIWYG モード切替で `[[...]]` テキストが両モードで同じ姿に
  - 受入条件「`[[note-title]]` 相当のテキストが入力される」を直接満たす
- トレードオフ:
  - 候補表示直後に該当テキストが editor 内でハイライト等のリッチ表示にならない（Mention ノードならスタイル付与可能）— 受入条件外なので許容
  - ユーザーが手打ちで `[[xxx]]` を入力した場合に Input Rule で Mention ノードに変換する自動補正は無い（既存挙動と同じ＝そのまま保存）

---

## ADR-002: タグ候補は `#tagname` 形式で挿入する

### Status
Proposed

### Context
Issue 本文は「選択時 `[[note-title]]` を Mention ノードに置換」と書くがタグ候補の出力形式は未指定。`[[tagname]]` で統一する案と、既存 `TagService.extractFromHtml` の `HASHTAG_PATTERN = /#([^\s#<>"'`]+)/g` に合わせる案がある。

`[[tagname]]` で出力した場合:
- サーバー側 `INTERNAL_LINK_PATTERN` がマッチし、`kind=title` の internal link として note 検索を試みる
- 該当する note が存在しなければ "broken link" 扱い（`resolvedNoteId === null`）になる
- ドメインモデル上「タグは note ではない」ため意図と乖離する

`#tagname` で出力した場合:
- 既存 `TagService.extractFromHtml` が拾い、`note_tags` テーブルに自動で紐づく
- ドメインモデルと完全整合

### Decision
**タグ候補は `#tagname` 形式で挿入する。**

`formatInternalLinkInsertion({ kind: "tag", name })` は `#${name}` を返す。後置スペース（`#name ` 末尾の半角スペース）は `command` 側で `${insertion} ` として付与し、`HASHTAG_PATTERN` の終端マッチ条件（`[^\s#<>"'\`]+`）が必ず成立するようにする。

### Consequences
- 良い点:
  - 既存タグ抽出パイプラインに乗る
  - 「ノート＝バックリンク」「タグ＝note_tags」のドメイン分離が UI 層から崩れない
- トレードオフ:
  - Issue 本文の「タグ・ノート横断 suggest」の見た目（候補リスト）と、選択後の挿入形式（note=`[[]]`, tag=`#`）が非対称になる — ポップアップで kind アイコン（"N" / "#"）を表示してユーザーが事前にわかるようにする

---

## ADR-003: tippy.js を使わず ReactRenderer + 自前ポップアップ

### Status
Proposed

### Context
多くの TipTap Mention/Suggestion サンプルは `tippy.js` をポップアップ配置ライブラリとして使う。本プロジェクトは現状 tippy.js を依存に持たない。

選択肢:
1. tippy.js を追加（+5KB gzip、API は安定）
2. **`ReactRenderer` + `document.body.appendChild` で自前配置**

`ReactRenderer` は `@tiptap/react` に同梱され、追加 npm 依存なしで React コンポーネントを ProseMirror plugin の DOM フックに接続できる。座標は `props.clientRect()` から `getBoundingClientRect()` ベースで計算可能。

### Decision
**選択肢 2: ReactRenderer + 自前配置。`position: absolute` で `getBoundingClientRect().bottom + 4` の位置にポップアップを表示する。**

### Consequences
- 良い点:
  - 追加 npm 依存ゼロ
  - 自前のスタイル / a11y 属性を完全制御
- トレードオフ:
  - ビューポート端での自動反転（top に出すか bottom に出すか）等の機能は無い — 受入条件外
  - 横スクロールや zoom 時の追従は最低限のみ

---

## ADR-004: `notes.title` の case-insensitive 検索は `lower(title)` 関数式 LIKE

### Status
Proposed

### Context
タグ側は `name_normalized` カラムで lower 化・NFKC 化済みのため、prefix LIKE がそのまま B-tree index に乗る。一方 `notes.title` には対応する normalize カラムが無い。

選択肢:
1. **`lower(notes.title)` の関数式 LIKE** — スキーマ変更不要、index 最適化されない
2. `notes` テーブルに `title_normalized` カラムを追加し migration を作成 — index 最適化されるがスコープ拡大
3. case-sensitive のまま割り切る — UX 劣化（日本語ノートでは元々大小区別なし）

### Decision
**選択肢 1: `lower(title)` 関数式 LIKE。新規 index は追加しない。**

判断根拠:
- owner_id + status = active の既存 filter で大半のヒットを絞れる（オーナーごとの active note 数は通常数百〜数千オーダー）
- WYSIWYG タイピング由来の検索なので同時実行数は低い
- 実測でレイテンシ問題が出たら別 Issue で `title_normalized` カラム + 専用 index を検討

### Consequences
- 良い点:
  - migration 不要、本 Issue のレビュー範囲が縮まる
  - 既存 `notes` テーブル運用への影響ゼロ
- トレードオフ:
  - 所有ノート数が極端に多いユーザーで遅延の可能性 → 監視対象として progress.md に記録（出たら別 Issue 化）

---

## ADR-006: D1 LIKE クエリは raw `sql` + `ESCAPE '\\'` 句で書く

### Status
Proposed

### Context
drizzle-orm の `like(col, pattern)` ヘルパは `ESCAPE` 句を発行しない。一方 SQLite の `LIKE` はデフォルトでエスケープ文字を持たず、`ESCAPE '<char>'` を明示しないとパターン中の `\%` / `\_` がリテラル一致にならず、ワイルドカード扱いされる。

既存 `tagRepository.findByOwner` は `escapeLikePattern` を呼んだ上で `like(col, pattern)` を使っており、結果として「`\` をエスケープ文字として書いているのに SQLite が認識しない」という潜在 bug を抱えている。実用上はタグ名に `%` / `_` が含まれることがほぼないため顕在化していないが、本 Issue で同じ仕組みを note title 検索にも使う以上、このギャップを残せない。

`app/core/adapters/d1/searchIndex.ts` では既に `sql\`... LIKE ${pat} ESCAPE '\\'\`` 形式で正しく実装されている。

### Decision
**D1 LIKE クエリは drizzle の `like()` ヘルパではなく raw `sql\`${col} LIKE ${pattern} ESCAPE '\\'\`` を使う。** `escapeLikePattern` の出力が確実に機能するよう ESCAPE 句を必須化する。本 Issue で導入する `searchByTitlePrefix` / `searchByNamePrefix` の両方に適用し、副次的に既存 `tagRepository.findByOwner` の同じ穴も同じ修正で塞ぐ。

### Consequences
- 良い点:
  - `escapeLikePattern` が SQLite で正しく機能する
  - `searchIndex.ts` と LIKE 表現が統一される
  - 既存 `tagRepository.findByOwner` の潜在 bug を本 Issue で副次的に修正
- トレードオフ:
  - drizzle の型推論が `like()` ヘルパほど効かない（raw sql は string 扱い）
  - 既存 `tagRepository.findByOwner` の SQL 変更による既存テストへの破壊リスク → integration test を回して緑のまま通ることを実装時に確認

---

## ADR-007: `escapeLikePattern` を `helpers.ts` に集約

### Status
Proposed

### Context
`escapeLikePattern` は現状 `tagRepository.ts` の module-private 関数。本 Issue で `noteRepository.ts` でも使う必要があり、選択肢は (a) `noteRepository.ts` に複製、(b) `helpers.ts` に移動して共有。

複製は plan の初稿で「scope 拡大回避」のため採用していたが、(1) 4 行とはいえ「LIKE escape 規則の単一の真実の源」を分散させる、(2) ADR-006 で既存 `tagRepository` の LIKE 書き方を変更することになり、ついでに helpers 化するほうが diff として整合的、(3) CLAUDE.md の「重複回避」原則とも整合、という理由で見直し。

### Decision
**`escapeLikePattern` を `app/core/adapters/d1/repositories/helpers.ts` に移動して export する。** `tagRepository.ts` / `noteRepository.ts` 双方ともそこから import。`searchIndex.ts` の同名 module-private 関数（`escapeLikePattern(raw: string)`）も将来は同じ helper を使うべきだが、`searchIndex.ts` は本 Issue のスコープと別経路（FTS）なのでここではノータッチ。

### Consequences
- 良い点:
  - LIKE escape 規則が `helpers.ts` の単一定義
  - `mapDbError` と同じ場所に置くことで「LIKE 系のヘルパー全部 helpers.ts」と一貫
- トレードオフ:
  - `tagRepository.ts` の import が増える（極小）

---

## ADR-008: NoteTitle に `[`/`]`/`|` を含むノートは候補から除外

### Status
Proposed

### Context
`NoteTitle` value object は `trim` + `max length 200` のみを制約し、`[`/`]`/`|` の含有を禁止していない。一方サーバー側 `INTERNAL_LINK_PATTERN = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g` はこれら 3 文字を境界として使う。

例: title が `foo|bar` のノートを選択して `[[foo|bar]]` をテキスト挿入すると、パーサは target=`foo`, display=`bar` と解釈し、実際の `foo|bar` というノートを解決できない（破綻リンク）。

選択肢:
1. **候補から除外** — usecase で title をフィルタ
2. `[[id|title]]` 形式（`UUID_V7_PATTERN` で target を id に分岐するパーサが既にあればそれを使う）
3. リスクとして文書化、対処しない

### Decision
**選択肢 1: usecase 内で title が `[` / `]` / `|` のいずれかを含むノートを候補から除外する。** 該当ノート数は実用上 0 〜極少。「破綻リンクを未然に防ぐ」価値のほうが「該当ノートを候補に出す」価値より高い。

該当ノートはユーザーが手動で `[[id|title]]` 形式または別の参照方法で挿入する必要があるが、これは元々 `INTERNAL_LINK_PATTERN` の仕様によるものでありエディタ側の責任ではない。

### Consequences
- 良い点:
  - 補完経由で挿入されるリンクが必ず正しく resolve される
  - usecase 内の数行で完結（フィルタロジック 1 行）
- トレードオフ:
  - `[` / `]` / `|` を含む title のノートは補完候補に出ない（実用上ほぼ問題なし）
  - ユーザーへの「なぜこのノートが候補に出ないのか」フィードバックは無い（progress.md でリスクとして記録）

---

## ADR-005: Suggestion 結果順序は note 優先・tag 後置の deterministic order

### Status
Proposed

### Context
note と tag の候補をマージする際、ランキング戦略（ヒット頻度・更新日・編集距離など）を入れるか、固定順にするか選択。

ランキング戦略の問題:
- integration test の安定性が損なわれる（順序がデータの何かに依存する）
- スコアリングロジック自体が新たなドメイン判断になる（要件外）
- マイクロベンチで悪化する可能性

### Decision
**note 優先・tag 後置の deterministic order。各セクション内は title / name の asc + id の asc。limit はマージ後にカット。**

### Consequences
- 良い点:
  - integration test を順序固定で書ける
  - ユーザーが `[[` でリンク先を求める時のメンタルモデル（まずノート）と一致
- トレードオフ:
  - タグの方が頻繁にヒットするユースケースで note 候補で枠が埋まる可能性 → kind を popup の見た目で区別するので致命的ではない
