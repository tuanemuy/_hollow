# Review 001 — Frontend (PR #800 / Issue #798)

**対象:** WYSIWYG toolbar の「画像」ボタンを `MediaUploader` に配線する
**レビュー日:** 2026-06-28
**観点:** Frontend（コンポーネント責務・props 契約・ref パターン・styling・a11y・モード別挙動）
**結論:** 計画（AC-1〜AC-8）に忠実な最小変更。ブロッカーなし。実装は ADR-001/002 の (A) ref-as-prop 方式に沿い、既存 `editorRef` 流儀と完全に同型。`MediaUploader` の dropzone マージ（#797）により AC-6 の「アップロード中 no-op」の発生機序が plan/ADR の記述（disabled による no-op）からずれている点だけ確認推奨。

---

## Frontend

### Blockers

なし。

AC-1〜AC-8 を実装と突き合わせた結果はいずれも満たされている:

- **AC-1**: `WysiwygEditor.tsx:582-591` 画像ボタン。`type="button"` / `aria-label="画像"` / `title="画像"` / `className={EDITOR_TOOLBAR_BTN}`（`TOUCH_TARGET_SQUARE` を内包）/ `<Icon icon={ImageIcon} size={20} />` / `role="toolbar"`（`editorToolbar`、line 551）内 / リンクボタン直後（モック順）。
- **AC-2/AC-8**: `NoteEditor.tsx:152-153` で `mediaInputRef`＋`onRequestImage`、`563` で WYSIWYG 用 `MediaUploader` にのみ `inputRef`、`551` で `WysiwygEditor` に `onRequestImage`。`MediaUploader.tsx:53` の `inputRef?: React.RefObject<HTMLInputElement | null>` は `editorRef`（`WysiwygEditor.tsx:99`）と同型。`useImperativeHandle`/`forwardRef` 不使用。
- **AC-3**: `onMediaInsert`（`NoteEditor.tsx:199-227`）/ `mediaInsert.ts` は無改修。挿入フロー不変。
- **AC-4**: `{contentHtml, onInsert, disabled}` 契約は不変。`inputRef` は直交する任意項目。
- **AC-5**: html（`520-524`）/ inline（`536-540`）の `MediaUploader` には `inputRef` を渡さず、画像ボタンは WYSIWYG ツールバーにのみ存在。
- **AC-6**: 画像ボタン `disabled={isDisabled || onRequestImage === undefined}`（`isDisabled = disabled === true || !isReady`）でエディタ未準備/disabled 時に無効化。
- **AC-7**: `aria-pressed`/`data-primary` を持たない単発アクション（既存 buttons 配列／リンクボタンと差別化）。

### Warnings

- **[W-001]** AC-6「アップロード中はボタン経由でも何も起きない」の **発生機序が plan/ADR の記述と食い違っている**（コードは正しいが要確認）。
  - 場所: `app/components/note/editor/MediaUploader.tsx:135-194, 231-262, 340-379`（dropzone と `uploading` 分岐）/ `.issue/798/plan.md:22,133` / `.issue/798/adr.md:28`
  - 理由: plan/ADR は「現状コードは可視 `<input>`、状態機械 `idle|uploading|error`、dropzone 未導入。アップロード中は **入力が `disabled` のため** `.click()` が no-op」を前提にしている。だが実際の `MediaUploader` は #797 の dropzone（`DROPZONE`、drag&drop、`done` 状態）が既にマージ済みで、`uploading` の間は dropzone（＝`<input ref={inputRef}>`）自体が**アンマウント**される（`377` の三項で `uploading` 時は進捗 UI、それ以外で `dropzone`）。よってアップロード中は `mediaInputRef.current` が `null` になり、`onRequestImage = () => mediaInputRef.current?.click()` が no-op になる。最終的な UX（アップロード中はボタンが見た目 enabled でもクリック無反応）は plan の「既知の許容事項」と一致し**機能上の問題はない**が、no-op の理由は「disabled 入力」ではなく「ref が null（入力が未マウント）」に変わっている。
  - 提案: コード変更は不要。手動/QA で「メディアアップロード進行中に画像ボタンをクリックしても二重起動が起きない」ことを実機で1回確認しておくこと（`testing.md` のエッジケース1相当）。あわせて plan/ADR の「disabled のため no-op」の記述が現コードの機序とずれている旨をレビュー記録に残し、将来 input を hidden 化する際の前提（ADR-001 の `.click()` 依存）として引き継ぐ。

### Notes

- **[N-001]** 責務分担が既存構図と完全に同型。capability（`MediaUploader`）→ 仲介（`NoteEditor` オーケストレーター、`mediaInputRef`/`onRequestImage` を保持・配布）→ トリガー（`WysiwygEditor`）の三分割が、既存 `tiptapEditorRef`/`editorRef` の「親が ref を持ち子へ配る」パターンを踏襲。新パターンをコードベースに持ち込んでいない（CLAUDE.md 原則に合致）。
- **[N-002]** `mediaInputRef = useRef<HTMLInputElement>(null)` の戻り型 `RefObject<HTMLInputElement | null>` がプロップ型と厳密一致。`onRequestImage` は `useCallback(..., [])` で安定参照。`WysiwygEditor` の `onRequestImage?` は任意プロップで、省略時はボタンが disabled になる graceful fallback（テストで固定）。
- **[N-003]** ref の null 安全性は構造で担保。画像ボタンは WYSIWYG ツールバーにのみ存在し、`inputRef` も WYSIWYG 用 `MediaUploader` にのみ接続。モード切替アンマウント時は React が `.current` を null に戻すため stale ポインタにならない（`make illegal states unrepresentable` の精神）。
- **[N-004]** lucide `Image` × tiptap `Image`（`@tiptap/extension-image`, `WysiwygEditor.tsx:4`）の名前衝突を `ImageIcon` エイリアス＋理由コメント（`23-24, 736-738`）で回避。プロジェクトのコメント規約（why コメントを残す）にも合致。
- **[N-005]** styling 規約準拠。共通定数 `EDITOR_TOOLBAR_BTN` を流用（`common/styles.ts` へ移す必要なし＝既に同ファイル内 hoist 済み）。`EDITOR_TOOLBAR_BTN` の JSDoc は `data-[primary]:` を `aria-pressed` 状態表現と説明するが、画像ボタンはトグルでないため `data-primary` を一切付けず該当 variant は不活性のまま——AC-7 と整合した正しい使い方。新規 CSS / `@apply` の追加なし。
- **[N-006]** テスト2件は既存 happy-dom harness（`wysiwygEditorOnChange.test.tsx`）と同形式。`wysiwygEditorImageButton.test.tsx` はボタン存在・`role="toolbar"` 内・`type`/`title`・`aria-pressed`/`data-primary` 不在・enabled・クリックで `onRequestImage` 発火・省略時 disabled を固定（AC-1/2/6/7）。`mediaUploaderInputRef.test.tsx` は `inputRef.current` が `<input type="file">` を指すこと＋省略時も入力が描画されること（AC-2/4/5 の機械的回帰）を固定。既存 harness も `@tanstack/react-start` を未モックで `useServerFn` を通すため、画像ボタンテストの未モックも同パターンで整合。
- **[N-007]（スコープ外）** ツールバー（`role="toolbar"`）は roving tabindex / 矢印キーナビ未実装で、追加ボタンも Tab フォーカス可能なまま。これは本Issue以前からの状態でボタン1個追加による劣化はない。ARIA APG 厳密準拠は別Issue。
- **[N-008]** 変更は `WysiwygEditor`/`NoteEditor`/`MediaUploader` の3コンポーネント＋テスト2件に閉じ、`onMediaInsert`/`mediaInsert.ts`/server-fn/reducer は不変。スコープ規律が守られている。
</content>
</invoke>
