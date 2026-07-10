# レビュー — PR #822 / Issue #818（P12 エディターのモバイル最適化）

観点: **Frontend**（コンポーネント設計・状態管理・アクセシビリティ・UX）
対象コミット: `origin/main...HEAD`
検証: `pnpm vitest run TagsInput / DirectoryTreeSelect / directoryTreeModel` → 69 passed

## 受け入れ基準の確認（Frontend 観点）

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 下部固定バー（`max-sm:fixed`、`sm` はトップバー内） | OK | `styles.ts:83` `editorActions` に `max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:ml-0 … max-sm:[&>button]:flex-1`、`sm` は `ml-auto inline-flex`。単一 DOM（`NoteEditor.tsx:463-487`）で二重描画なし（ADR-003） |
| AC-2 backdrop + safe-area + 下部余白 96px | OK | `supports-[backdrop-filter]:max-sm:[backdrop-filter:var(--header-blur)]` + `-webkit-` 併記、`max-sm:pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]`。フォーム `NoteEditor.tsx:443` `max-sm:pb-[calc(96px+env(safe-area-inset-bottom))]` |
| AC-3 メタ折りたたみ（useState/DOM保持/aria、`sm` 常時展開） | OK | `metaOpen` useState 初期 `false`（`NoteEditor.tsx:153`）、body は DOM 保持で CSS 開閉、`sm:block` で desktop 常時展開 |
| AC-4 ツリー行/キャレット/検索/タグ×寸法統一・44px 床 | OK | `dirTreeItem`/`dirTreeItemNew` に `max-sm:min-h-[44px]`、`dirDropdownSearch` `h-10 max-sm:min-h-[44px]`、`tagChipRemove` `h-4 w-4`（床なし＝意図）、新規名入力も同定数流用 |
| AC-5 本文 overflow-wrap | OK | WYSIWYG `[&_.ProseMirror]:[overflow-wrap:anywhere] break-words`、HTML textarea `[overflow-wrap:anywhere] break-words`、Inline は `note-detail-content`（#791 適用済） |
| AC-6 `APP_MAIN` `max-sm:px-4` | OK（本レビュー範囲外だが確認済） | 差分に含まれる（layout/styles.ts） |
| AC-7 本文 `min-h` の vh 相対 | OK | 3ファイルとも `min-h-[52vh] sm:min-h-[480px]`（モバイルファースト順、source-order 依存なし。WYSIWYG 内側 ProseMirror も `min-h-[calc(52vh-2rem)] sm:min-h-[440px]`） |
| AC-8 回帰なし | OK | 既存テスト 69 緑。desktop DOM/レイアウト不変を確認（下記 N-003） |

---

### Frontend

#### Blockers
なし

#### Warnings

- **[W-001]** 新規抽出した純関数 `resolveDirectoryLabel` にユニットテストが無い
  - 場所: `app/components/note/editor/directoryTreeModel.ts:179` / `app/components/note/editor/__tests__/directoryTreeModel.test.ts`
  - 理由: 本関数は preview（`NoteEditor`）と trigger（`DirectoryTreeSelect`）の**パス解決を一元化するため純関数に抽出**（arch S-007）されたもので、同ファイル JSDoc も「テスト可能にするための分離」を謳う。しかし `visibleDirectoryOptions` / `searchMatchSet` / `clampActiveIndex` / `nextActiveIndex` には `describe` があるのに、`resolveDirectoryLabel` だけテストが無い。preview と trigger の唯一の SSOT なので、分岐（pending name 優先 / 選択パス / 未発見 id → emptyLabel / null → emptyLabel）が後の変更で崩れても検知できない。
  - 提案: `directoryTreeModel.test.ts` に `describe("resolveDirectoryLabel")` を追加し、4 分岐＋「pending が directoryId より優先」ケースを固定する（実装の等価性は N-001 で確認済みなので、いま追加すれば回帰ガードになる）。

#### Notes

- **[N-001]** `resolveDirectoryLabel` 抽出は旧 `triggerLabel` 導出と挙動等価（良い refactor）
  - 場所: `DirectoryTreeSelect.tsx:124` / `directoryTreeModel.ts:179-191`
  - 旧: `pending ? "新規: …" : (selected!=null ? selected.path : "ディレクトリを選択")`。`selected = directoryId===null ? null : tree.find(id)`。
  - 新: `pending → "新規: …"`、`directoryId!==null && found → found.path`、else `emptyLabel`。未発見 id が emptyLabel に落ちる挙動も含めて一致。preview 側は `emptyLabel="未設定"`、trigger 側は `"ディレクトリを選択"` で唯一の差分＝引数、という設計どおり。二重管理の解消として妥当。

- **[N-002]** モバイルで保存/キャンセルの DOM 順・フォーカス順が視覚位置（画面下部固定）と乖離する
  - 場所: `NoteEditor.tsx:463-487`（`editorActions` は `editorTopbar` 内＝タイトル入力より前）
  - 理由: 単一 DOM を `max-sm:fixed` で下部へ切り離す方式（ADR-003 / `BulkActionBar` 準拠）の必然として、モバイルでは保存/キャンセルがタイトル・本文より**前**に読み上げ・Tab 到達される。既存の `BulkActionBar` で確立済みのトレードオフであり本 PR 固有の欠陥ではないが、SR/キーボード利用時に「本文より先にアクションへ来る」点は把握しておく価値がある（本 Issue で新たに直す対象ではない）。

- **[N-003]** メタ折りたたみの `data-open` 配置と desktop 不変性は正しい
  - 場所: `NoteEditor.tsx:535-539` / `styles.ts:98,123`
  - `data-open` は `data-[open]:max-sm:block` を消費する `metaBody` 自身に付与（ADR-004）。特異度も `data-[open]:max-sm:block`（class+attr）が `max-sm:hidden`（class のみ）に勝つため mobile 展開が確実に効く。desktop は別メディアクエリの `sm:block` で常時展開。ラッパー 2 段（`metaDisclosure`/`metaBody`）はいずれも desktop クラスが全て `max-sm:` 限定＝素の block で、かつ `metaDisclosure` は flex アイテム（BFC 確立）なので子の `mb-*` が外へ漏れず、既存の縦間隔（DirPicker `mb-3` / tags `mb-5`）が保存される。desktop レイアウト回帰なし。

- **[N-004]** キャレット再配置は行選択タップを奪わない（arch S-001 準拠）
  - 場所: `DirectoryTreeSelect.tsx:316`
  - `absolute top-1/2 -translate-y-1/2 py-2`（幅は据え置き、`left:${indent}px`、`z-10`）。タップ拡大は縦のみで、横は icon 16px 幅のまま。行ラベルは `paddingLeft:${indent+22}` で始まり w-full なので、`[indent, indent+16]` の縦帯だけが「展開」、他は「選択」に正しく振り分く。旧 `top-1.5` → `top-1/2` の変更は 44px 化した行での縦センタリング改善であり、`indent` 計算（`8+depth*16`）は不変。既存テストは role/aria ベース（className 非依存）のため非退行。

- **[N-005]** a11y 対応は妥当
  - `metaSummary` は `type="button"`（`<form>` 内 submit 誤発火防止・`NoteEditor.tsx:516`）、`aria-expanded={metaOpen}` + `aria-controls="editor-meta-body"`、body に `id="editor-meta-body"`。summary は `sm:hidden`、body は `sm:block` なので desktop では summary が非表示＝aria 状態が SR に露出しないのも整合。キャレット回転は `<span data-open>` ラッパー（ADR-005、装飾なので a11y 影響なし）。タグ × の `aria-label`（`${name} を削除`）不変で `TagsInput.test.tsx` の `button[aria-label$="を削除"]` セレクタは非退行。

- **[N-006]** （参考・本 PR 対象外）`dirRowPillInput`（`styles.ts:132`）は現在どこからも参照されていないデッドコード。ただし本 PR の導入ではなく #712 時点で既に未使用のため、本 Issue のスコープ外。将来のクリーンアップ候補としてのみ記載。
