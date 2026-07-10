# レビュー — PR #822 / Issue #818（P12 エディターのモバイル最適化）2周目

観点: **Frontend**（コンポーネント設計・状態管理・アクセシビリティ・UX）
対象: `gh pr diff 822`（`origin/main...HEAD`）
検証: `pnpm vitest run directoryTreeModel.test.ts` → **20 passed**（1周目 69 → 新規 `resolveDirectoryLabel` 6 ケース追加を含む）

## 前回 W-001（純関数のテスト欠落）の解消確認

**解消済み。** `directoryTreeModel.test.ts:178-216` に `describe("resolveDirectoryLabel")` が追加され、1周目 W-001 が要求した全分岐を固定している。

| 分岐 | テスト | 実装（`directoryTreeModel.ts:179-191`） |
|---|---|---|
| null id + pending なし → emptyLabel | L179-185（`未設定` と `ディレクトリを選択` の 2 caller ぶんを網羅） | `return emptyLabel` |
| pending name → `新規:` prefix | L187-191 | `if (pendingDirectoryName !== null) return \`新規: …\`` |
| 選択トップレベル → path | L193-197 | `found.path` |
| 選択ネスト → path | L199-203 | `found.path` |
| **pending が directoryId より優先** | L205-209 | pending 分岐が先 |
| 未発見 id → emptyLabel | L211-215 | `found === undefined` で fall-through |

分岐カバレッジは実装と過不足なく一致し、preview（`NoteEditor`）と trigger（`DirectoryTreeSelect`）の唯一の SSOT が回帰ガードで固定された。2 caller が `emptyLabel` のみで分岐する設計（arch S-007）もテストが明示している（L181-184 のコメント）。W-001 のクローズは妥当。

## 受け入れ基準（Frontend 観点）再確認

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 下部固定バー / `sm` はトップバー内 | OK | `styles.ts:83` `editorActions` = `ml-auto inline-flex … max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:ml-0 … max-sm:[&>button]:flex-1`。単一 DOM（`NoteEditor.tsx:463-487`、二重描画なし・ADR-003） |
| AC-2 backdrop + safe-area + 96px 余白 | OK | `supports-[backdrop-filter]:max-sm:[backdrop-filter:var(--header-blur)]` + `-webkit-` 併記、`max-sm:pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]`。form `NoteEditor.tsx:443` `max-sm:pb-[calc(96px+env(safe-area-inset-bottom))]` |
| AC-3 メタ折りたたみ（useState/DOM保持/aria） | OK | `metaOpen` useState 初期 `false`（`NoteEditor.tsx:153`）、body は DOM 保持で CSS 開閉、`sm:block` で desktop 常時展開 |
| AC-4 寸法統一・44px 床 | OK | `dirTreeItem`/`dirTreeItemNew` `max-sm:min-h-[44px]`、`dirDropdownSearch` `h-10 max-sm:min-h-[44px]`、`tagChipRemove` `h-4 w-4`（床なし=意図・S-005） |
| AC-5 overflow-wrap | OK | WYSIWYG `[&_.ProseMirror]:[overflow-wrap:anywhere] break-words`、HTML textarea 同、Inline は `note-detail-content`（#791 適用済） |
| AC-6 `APP_MAIN` `max-sm:px-4` | OK | `layout/styles.ts` 差分に含む（本レビュー範囲外・確認のみ） |
| AC-7 本文 min-h vh 相対 | OK | 3 ファイルとも `min-h-[52vh] sm:min-h-[480px]`（モバイルファースト順）。WYSIWYG 内側 ProseMirror も `min-h-[calc(52vh-2rem)] sm:min-h-[440px]` |
| AC-8 回帰なし | OK | 純関数テスト緑。desktop DOM/レイアウト不変（`sm:` 分岐で担保） |

---

### Frontend

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** W-001 の追加テストは旧 `triggerLabel` 導出と挙動等価を正しくカバー
  - 場所: `__tests__/directoryTreeModel.test.ts:178-216` / `DirectoryTreeSelect.tsx:124-129`
  - trigger 側は `resolveDirectoryLabel(tree, directoryId, pendingDirectoryName, "ディレクトリを選択")`、preview 側（`NoteEditor.tsx:427-432`）は同関数を `emptyLabel="未設定"` で呼ぶだけの差。テストは両 `emptyLabel` 値・pending 優先・未発見 id fallback を固定しており、二重管理解消（arch S-007）の回帰ガードとして十分。良い修正。

- **[N-002]** メタ summary `<button>` のアクセシブルネームが preview テキストのみ（任意の a11y 強化余地）
  - 場所: `NoteEditor.tsx:515-534`
  - summary ボタンは Folder アイコン（label 無し=装飾）+ preview span + ChevronDown（label 無し=装飾）で構成され、支援技術に露出する名前は preview テキストだけ。折りたたみ・未設定・タグ無しの初期状態では accessible name が「未設定」となり、「この操作が場所とタグを開く」ことを名前からは伝えない（`aria-expanded`/`aria-controls` で状態と関連先は担保済み）。disclosure summary が内容をそのまま名前にするのは一般的で機能欠落ではないため Warning にはしないが、`aria-label="場所とタグ"` 等を足すと mobile SR 利用時の目的伝達が明確になる。モバイル専用（`sm:hidden`）で desktop には非露出のため影響範囲は限定的。

- **[N-003]** キャレット再配置は行選択タップを奪わない（arch S-001 準拠・再確認）
  - 場所: `DirectoryTreeSelect.tsx:316-317`
  - `absolute top-1/2 -translate-y-1/2 py-2`（幅は icon 16px 幅のまま、`left:${indent}px`、`z-10`）。当たり判定は縦のみ 32px 拡大で横は据え置き。option 行は `paddingLeft:${indent+22}`（`DirectoryTreeSelect.tsx:339`）でラベル/フォルダアイコンが始まるため、`[indent, indent+16]` の縦帯のみ「展開」、残りは「選択」に正しく振り分く。44px 化した行での縦センタリング改善であり取り違いなし。

- **[N-004]** メタ折りたたみの `data-open` 配置・desktop 不変性・DOM 保持は正しい
  - 場所: `NoteEditor.tsx:535-539` / `styles.ts:98,123`
  - `data-open={metaOpen || undefined}` は `data-[open]:max-sm:block` を消費する `metaBody` 自身に付与（ADR-004、`styles.ts:120-121` の why コメントあり）。特異度も `data-[open]:max-sm:block`（class+attr）が `max-sm:hidden`（class のみ）に source-order 非依存で勝つ。desktop は別メディアクエリ `sm:block` で常時展開＝summary（`sm:hidden`）非表示で aria 状態も非露出。body は DOM 保持の CSS 開閉なので DirectoryPicker/TagsInput の Popover/候補 state を壊さない。キャレット回転は `<span data-open>` ラッパー（ADR-005、装飾）。

- **[N-005]** 保存フローの単一 DOM 化に非退行
  - 場所: `NoteEditor.tsx:463-487`
  - 保存/キャンセルは `editorActions` 内の単一ブロックのまま `max-sm:fixed` で mobile 下部へ切り離す方式（ADR-003）。`saveDisabled`/`isPending`/`creatingDirectory` によるラベル・`disabled`・`aria-busy` 分岐が一箇所に留まり、二重描画による状態不整合・二重 submit は無い。`type="submit"`/`type="button"` の区別も保持。

- **[N-006]** モバイルで保存/キャンセルの DOM 順が視覚位置（画面下部）と乖離（1周目 N-002 の再掲・本 PR 固有欠陥ではない）
  - `editorActions` は `editorTopbar` 内＝タイトル入力より前にあり、`max-sm:fixed` で視覚のみ下部へ移る。mobile では SR/Tab 到達が本文より先にアクションへ来るが、これは `BulkActionBar` で確立済みの同型トレードオフで本 Issue の修正対象外。
