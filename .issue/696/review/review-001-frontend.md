# PR #715 レビュー — Frontend 観点（Issue #696）

対象差分: `gh pr diff 715`
実装変更ファイル: `EditorModeSwitch.tsx` / `NoteEditor.tsx` / `editorState.ts`（JSDoc のみ）+ テスト2件
照合: `.issue/696/plan.md` / `.issue/696/adr.md` / `ConfirmDialog.tsx` / `WysiwygEditor.tsx` / `wysiwygUnsupportedTags.ts` / `Dialog.tsx`

## 総評

実装は plan.md の設計ステップ・ADR-001〜004 にほぼ一字一句沿っており、AC-1〜AC-8 はすべて実装またはテストで満たされている。コンポーネント設計（reducer は不変、一過性 UI 状態は orchestrator local state）、3段 dispatch の順序（tags seed → ack → setMode）、ConfirmDialog の `subject` 不使用 + `description` への ReactNode 構築、styling 規約準拠（新規 CSS なし・既存パターン踏襲）、a11y（既存 `alertdialog` 流用）いずれも妥当。`pnpm typecheck` クリーン、対象テスト 16 passed。Blocker なし。

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** 二重同意回避が WysiwygEditor の `value` prop の不変性と reducer latch の内部仕様への暗黙結合に依存している
  - 場所: `app/components/note/editor/NoteEditor.tsx:253-275`（`confirmWysiwygSwitch`）/ 結合先 `editorState.ts:510-526` / `WysiwygEditor.tsx:onCreate`
  - 理由: 同意ハンドラの「ack 生存」は、(a) ダイアログが提示した `pending.lostTags` と、(b) WYSIWYG ペイン `onCreate` が `detectUnsupportedTags(value)` で再検出する集合が同一であること、(c) reducer の `setsEqual` 短絡が ack を消さないこと、の3点すべてに依存する。(a) は `latest.contentHtml`（= 切り替え時点の committed HTML）由来、(b) は WysiwygEditor に渡る `value`（同じ committed HTML）由来なので現状は一致する。だが「ダイアログ提示用の集合を別 state（`pendingWysiwygSwitch.lostTags`）に保持し、ペイン側は別途再検出する」という二経路構造のため、将来 WysiwygEditor の検出対象や `value` の供給経路が変わると ack が崩れて二重同意が再発する。これは ADR-004 自身がトレードオフとして認めている既知の脆さであり、PR としては許容範囲だが、堅牢性の観点では「latch の reset-on-change」という reducer 内部実装の知識をハンドラ側が持つ設計に依存している点は明確に弱い結合。
  - 提案: 現状は AC-7 テスト（`noteEditorModeChange.test.tsx` の「switches and acks the in-pane banner when the dialog is confirmed」）で pin 済みかつコメントで結合理由が明示されているため、追加対応は不要。将来的に堅牢化するなら、検出を1箇所（orchestrator）に集約して WysiwygEditor には「検出結果 + ack 済みフラグ」を props で渡し、ペイン側の `onCreate` 再検出を廃止する設計が候補（本 Issue のスコープ外）。本 PR では「この pin テストが落ちたら二重同意リグレッション」という対応関係を維持すれば足りる。

- **[W-002]** `description` 内の `<code>` がベア要素で、最小限のスタイル（等幅・視認性）を持たない
  - 場所: `app/components/note/editor/NoteEditor.tsx:537-547`（`<code>{`<${tag}>`}</code>`）
  - 理由: ダイアログ本文の `<code>` には className が無く、グローバルな `code` セレクタも存在しない（`index.css` の code スタイルは `.note-detail-content` スコープ限定）。そのため失われるタグ名がプレーンテキストと視覚的に区別されない可能性がある。AC-5「失われる要素が一覧で確認できる」はテキスト上は満たすが、`<code>` を使う意図（コード片としての強調）が視覚に反映されない。
  - 提案: 実装は WysiwygEditor 既存バナー（`WysiwygEditor.tsx:496-502`）の `<code>` 描画パターンを忠実に踏襲しており、そのバナーも同じくベア `<code>` で運用されているため、本 PR 単体での逸脱ではない（既存パターンとの一貫性は保たれている）。よって本 Issue では修正不要。ただし「装飾消失警告のタグ一覧が等幅で目立たない」という UX 上の小さな弱点はバナーと共通なので、改善するなら両箇所まとめてフォローアップ（`font-mono` + `bg-surface` 程度の utility 付与）にするのが筋。

#### Notes

- **[N-001]** 状態配置の判断が適切。`pendingWysiwygSwitch` を reducer ではなく `NoteEditor` の `useState` に置く判断（ADR-002）は、editorState を content/mode/autosave/dirty のモデル状態に限定する既存方針と一致しており妥当。`{ lostTags } | null` という「null=閉、非null=開＋表示タグ」の表現は illegal state を排しており型設計として良い。
- **[N-002]** 3段 dispatch の順序依存は正しく実装され、かつ意図が手厚くコメント化されている（`NoteEditor.tsx:256-270`）。`wysiwygUnsupportedDetected`(同一集合 seed) → `wysiwygUnsupportedAck` → `setMode` の順序は ADR-004 のとおりで、reducer の latch（`editorState.ts:521` の `setsEqual` 短絡、`517` の空配列 no-op）と整合する。React のバッチで単一 render に収束する点も正しい。`onClose`（キャンセル）は保留クリアのみで `setMode` しないため AC-4 を満たす。
- **[N-003]** ConfirmDialog の使い方が ADR-001 どおり。`subject` を渡さないことで「削除対象」ラベル + `Trash2` が出ず、`subject===undefined` 分岐で警告アイコン（`AlertTriangle`）+ タイトルが出る経路に乗る（`ConfirmDialog.tsx:128-141`）。`description` への ReactNode 構築（`<p>` + `Fragment` リスト）も適切で、`Fragment key={tag}` はタグ名が一意（`detectUnsupportedTags` が sort 済みの重複なし集合を返す）なので key として安全。`confirmIcon` 未指定・danger 固定の受容も ADR-001 のとおり。
- **[N-004]** a11y は既存 `ConfirmDialog`/`Dialog` の流用で担保。`role="alertdialog"`・`aria-labelledby`(title)・`aria-describedby`(desc) の woven、フォーカストラップ、スクロールロックは `Dialog` 側に実装済み（`Dialog.tsx:171` で `!open` 時 null 返却）。`description` は `pendingWysiwygSwitch !== null` のときのみレンダリングされ、それは `open===true` と同値なので、本文（失われる要素一覧）が `aria-describedby` に確実に織り込まれ読み上げ対象になる。`undefined` フォールバック分岐は到達しないデッドコードだが無害な防御的記述。外側 `<form>` 内配置は ConfirmDialog の submit `stopPropagation`（`ConfirmDialog.tsx:105-115`）で保存フォーム誤送信を防ぐため安全。
- **[N-005]** 新規作成画面（`mode="new"`）は不変。`EditorModeSwitch` の変更は `TABS_EDIT` への1行追加のみで `TABS_NEW`・`surface==="new"` 分岐は無改変。`editorModeSwitch.test.tsx` の「leaves the new surface tab set unchanged (AC-6)」で `[WYSIWYG, FrontMatter, HTML]` を pin しており回帰検出される。タブ並び順 `[ビジュアル, WYSIWYG, FrontMatter, HTML]` は ADR-003 どおりで既定モード(inline)のタブ位置を保持。
- **[N-006]** エッジケースの割り切りが plan と整合。判定対象は `latest.contentHtml`（= `stateRef.current`、committed HTML）で、InlineEditor の debounce 未フラッシュ分は含まれ得ない点を ADR-002/P-001 のとおり割り切っており、コメント（`NoteEditor.tsx:231-240`）にも明記。`contentHtml` が空文字なら `detectUnsupportedTags` が `[]` を返し AC-3 経路（ダイアログ無し即切替）になり、illegal state にならない。
- **[N-007]** テストカバレッジが AC を網羅。AC-2/AC-5（ダイアログ開・タグ表示・切替保留）、AC-3（対応タグのみ即切替）、AC-4（キャンセルでモード維持）、AC-7（同意で切替 + バナー ack 済み・「了解した」ボタン無し）、未保存 confirm → 装飾ダイアログの順序・単一ダイアログ、未保存 confirm キャンセルで切替中止、まで pin されている。`isWysiwygMounted()` を `role="toolbar"][aria-label="書式"]` で判定する手法は堅牢。AC-8 はユニットの in-flight cancel テスト green 維持で担保（manual-test summary 記載）。
