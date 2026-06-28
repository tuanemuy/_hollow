# Review 002 — Frontend (PR #800 / Issue #798)

**対象:** WYSIWYG toolbar の「画像」ボタンを `MediaUploader` に配線する
**レビュー日:** 2026-06-28
**ラウンド:** round-2（フル再レビュー / ゼロベース）
**観点:** Frontend（コンポーネント責務・props 契約・ref パターン・styling・a11y・モード別挙動・前ラウンド W-001 整合）
**結論:** 計画（AC-1〜AC-8）に忠実な最小変更。**ブロッカーなし。** 前ラウンド W-001（ドキュメントの no-op 機序ズレ）はソース・3ドキュメント・テスト全てで dropzone 版に整合済み。`onRequestImage` → `mediaInputRef.current?.click()` → dropzone 内 file input の結線は現物で正しく機能し、新規 E2E 結線テストで proxy 固定済み（6 テスト緑を確認）。唯一の留意点は、この W-001 整合修正（plan/adr/testing.md＋新規結線テスト）が **作業ツリー上で未コミット**で、`gh pr diff 800`（＝公開 PR / CI が見る差分）には未反映であること（W-001）。

---

## Frontend

### Blockers

なし。

AC-1〜AC-8 を現物コードと突き合わせた結果はいずれも満たされている:

- **AC-1**: `WysiwygEditor.tsx:582-591` 画像ボタン。`type="button"` / `aria-label="画像"` / `title="画像"` / `className={EDITOR_TOOLBAR_BTN}`（`TOUCH_TARGET_SQUARE` を内包, `:137`）/ `<Icon icon={ImageIcon} size={20} />` / `role="toolbar"`（`editorToolbar`, `:551`）内 / リンクボタン（`:570-581`）直後のモック順。
- **AC-2/AC-8**: `NoteEditor.tsx:152-153` で `mediaInputRef = useRef<HTMLInputElement>(null)` ＋ `onRequestImage = useCallback(() => mediaInputRef.current?.click(), [])`、`:563` で WYSIWYG 用 `MediaUploader` にのみ `inputRef`、`:551` で `WysiwygEditor` に `onRequestImage`。`MediaUploader.tsx:53` の `inputRef?: React.RefObject<HTMLInputElement | null>` は `editorRef`（`WysiwygEditor.tsx:99`）と同型。`useImperativeHandle`/`forwardRef` 不使用。
- **AC-3**: `onMediaInsert`（`NoteEditor.tsx:199-227`）/ `mediaInsert.ts` は無改修。挿入フロー不変。
- **AC-4**: `{contentHtml, onInsert, disabled}` 契約は不変。`inputRef` は直交する任意項目（`MediaUploader.tsx:44-54`）。
- **AC-5**: html（`NoteEditor.tsx:520-524`）/ inline（`:536-540`）の `MediaUploader` には `inputRef` を渡さず、画像ボタンは WYSIWYG ツールバーにのみ存在。
- **AC-6**: 画像ボタン `disabled={isDisabled || onRequestImage === undefined}`（`isDisabled = disabled === true || !isReady`, `:400`）。アップロード中 no-op は「`uploading` 時に dropzone（＝`<input ref={inputRef}>`）ごとアンマウントされ進捗 UI に差し替わる」（`MediaUploader.tsx:377`）→ `mediaInputRef.current` が null → `.click()` が no-op、加えて `runUpload` 先頭の uploading ガード（`:136`）で二重起動防止。**現物（dropzone 版）の機序と一致**。
- **AC-7**: `aria-pressed`/`data-primary` を持たない単発アクション（既存 buttons 配列／リンクボタンと差別化、`:582-591`）。

### Warnings

- **[W-001]** 前ラウンド W-001 の整合修正と新規結線テストが **作業ツリー上で未コミット**のため、公開 PR の差分に未反映。
  - 場所: working tree の `M .issue/798/adr.md` / `M .issue/798/plan.md` / `M .issue/798/testing.md` / `M app/components/note/editor/__tests__/wysiwygEditorImageButton.test.tsx` / `?? app/components/note/editor/__tests__/noteEditorImageButtonWiring.test.tsx`（`git status` 確認済み）。一方コミット済み HEAD（`84ced1f3`）＝`gh pr diff 800` が返す差分は **旧版**（adr.md「dropzone は未導入（#795/PR #797 未マージ）」、plan.md「可視の `<input>` を直接描画」「入力は `disabled || uploading` で無効化」など）のまま。
  - 理由: 本レビューは作業ツリー（修正済み・正）を対象に評価しており内容は正しいが、このままコミット/プッシュしないと、CI・他レビュアー・将来の `git blame` が見るのは旧版のドキュメント（dropzone 化前の前提＝前ラウンドで指摘された no-op 機序ズレが残ったまま）と、結線を E2E で固定する `noteEditorImageButtonWiring.test.tsx` の欠落になる。すなわち W-001 の修正自体が PR に**載らない**。
  - 提案: 上記 5 ファイル（doc 3 + test 2）を本ブランチにコミットしてプッシュする。コミット後に `gh pr diff 800` で adr.md/plan.md/testing.md が dropzone 版になり、新規結線テストが差分に含まれることを確認すること。コード変更（ソース 3 ファイル）は既にコミット済みで正しい。

### Notes

- **[N-001]** 前ラウンド W-001（no-op 機序が「disabled 入力」→「ref が null（uploading 時に dropzone ごとアンマウント）」へ）の整合は、内容としては完全に解消済み。`plan.md:22,38,133` / `adr.md:20,28,32,42,45` / `testing.md`（uploading 二重起動節・html/inline の dropzone 言及）いずれも現物コードに一致。残るのはコミット状態のみ（W-001）。
- **[N-002]** 結線の現物動作を確認: dropzone 版では非 uploading 状態の file input が `DROPZONE` の `[&_input[type=file]]:hidden`（`common/styles.ts:554`）で `display:none`。プログラム的 `.click()` は CSS 可視性に依らず発火するため、画像ボタン → `onRequestImage` → `mediaInputRef.current.click()` → 隠れた file input でダイアログが開く、という「hidden input + ボタン起動」の標準パターンが成立。dropzone マージ（#797）でこの結線が壊れていないことを確認。
- **[N-003]** 新規 `noteEditorImageButtonWiring.test.tsx` は round-1 が「proxy として確認推奨」とした結線（`onRequestImage` 解決先が WYSIWYG `MediaUploader` の `<input type="file">`）を `NoteEditor` 全体を通して固定する良い追加。`HTMLElement.prototype.click` を spy し、ツールバーボタンは `dispatchEvent` で起動（spy に自己クリックが乗らない）→ spy 呼び出し 1 回・`mock.contexts` に file input、で受け手まで検証しており堅牢。`wysiwygEditorImageButton.test.tsx` も AC-6 の「handler あり＋`disabled=true` でも disabled」ケースを追加して disabled 判定を独立に固定。**6 テスト緑を実行確認**（wysiwyg/noteEditorWiring/mediaUploaderInputRef の 3 ファイル）。
- **[N-004]** 責務分担が既存構図と同型。capability（`MediaUploader`）→ 仲介（`NoteEditor` が `mediaInputRef`/`onRequestImage` を保持・WYSIWYG にのみ配布）→ トリガー（`WysiwygEditor`）の三分割が `tiptapEditorRef`/`editorRef` の「親が ref を持ち子へ配る」パターンを踏襲。`useImperativeHandle`/`forwardRef` を新規導入せず CLAUDE.md 原則に合致。ref の null 安全性は「画像ボタンは WYSIWYG にのみ存在し inputRef も WYSIWYG `MediaUploader` にのみ接続」という構造で担保（モード切替・uploading アンマウント時は React が `.current` を null 化）。
- **[N-005]** styling/a11y 規約準拠。`EDITOR_TOOLBAR_BTN`（`WysiwygEditor.tsx:137`）を同ファイル内で流用（既に hoist 済みのため `common/styles.ts` へ移す必要なし）。新規 CSS / `@apply` 追加なし。`data-primary` を付けないため該当 variant は不活性のまま＝AC-7 と整合。`ImageIcon` エイリアス＋理由コメント（`:22-24`）で lucide `Image` × tiptap `Image`（`:4`）の名前衝突を回避。
- **[N-006]（既知の許容事項）** アップロード進行中、画像ボタンは見た目 enabled のまま（`isDisabled` は uploading を見ない）だがクリックは no-op になる短時間ウィンドウが残る。`MediaUploader` の uploading 状態をボタンへ伝播させない（契約を増やさない）ための意図的トレードオフで、ADR-002／リスク節・testing.md エッジケース 1 に明文化済み。本文下のアップローダー UI に進捗が出るため致命的でなく、バグではない。
- **[N-007]（スコープ外）** ツールバー（`role="toolbar"`）は roving tabindex / 矢印キーナビ未実装で追加ボタンも Tab フォーカス可能なまま。本Issue以前からの状態でボタン 1 個追加による劣化はない。ARIA APG 厳密準拠は別Issue。
- **[N-008]** 変更ソースは `WysiwygEditor`/`NoteEditor`/`MediaUploader` の 3 コンポーネント＋テストに閉じ、`onMediaInsert`/`mediaInsert.ts`/server-fn/reducer は不変。スコープ規律が守られている。
