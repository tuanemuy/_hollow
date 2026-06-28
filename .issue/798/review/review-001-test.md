# レビュー: PR #800 / Issue #798 — Test 観点

対象テスト:
- `app/components/note/editor/__tests__/wysiwygEditorImageButton.test.tsx`（新規）
- `app/components/note/editor/__tests__/mediaUploaderInputRef.test.tsx`（新規）

実行結果: 両ファイル green（4 tests passed）。harness（happy-dom + `createRoot` + 2×rAF フラッシュ、`serverFnMock` の router/chain stub）の踏襲は正しく、既存 `wysiwygEditorOnChange.test.tsx` / `MediaUploader.test.tsx` と一貫している。

## Test

### Blockers

- なし。

### Warnings

- **[W-001] NoteEditor の配線（AC-2 の本体）が未カバー — `app/components/note/editor/NoteEditor.tsx`（テスト不在）**
  本機能の load-bearing な結線は NoteEditor 側にある: `onRequestImage = () => mediaInputRef.current?.click()` と、`mediaInputRef` を **WYSIWYG の `MediaUploader` にだけ** 渡すこと（html/inline には渡さない）。今回の2テストは「WysiwygEditor のボタン → `onRequestImage` 発火」「`MediaUploader` の `inputRef` → input への配線」という両端を別々に固定するが、両者を繋ぐ NoteEditor の結線そのものは一切触れていない。よって「`inputRef` を間違ったインスタンスに渡す」「`onRequestImage` を渡し忘れる」「`onRequestImage` の実装が `.click()` を呼ばない形に退行」といった回帰は、どのテストでも検出できない（=偽陰性リスク）。
  plan/AC-2 は「happy-dom 制約でダイアログ起動は検証不能」とするが、これは正確には *ダイアログが開くこと* が検証不能なだけで、`input.click()` が **呼ばれること自体は spy で観測可能**（happy-dom は `HTMLInputElement.prototype.click` を持つ）。既に `noteEditorModeChange.test.tsx`（`app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`）が NoteEditor 全体を happy-dom で描画し全 server-fn をモックする harness を確立しているため、wysiwyg モードで NoteEditor を描画 → file input の `.click` を spy → `button[aria-label="画像"]` をクリック → spy が呼ばれたことを assert、という end-to-end の固定が現実的に書ける。proxy 2本に加えてこの1本を足すと AC-2 が機械的に閉じる。提案: NoteEditor 統合テストを1ケース追加。

- **[W-002] AC-6 の `disabled` / `editor===null` 分岐が未カバー — `wysiwygEditorImageButton.test.tsx:77-92`**
  実装の判定は `disabled={isDisabled || onRequestImage === undefined}`（`isDisabled = disabled === true || !isReady`）。テストは `onRequestImage === undefined` 分岐のみ（しかも `disabled={false}` かつ editor 準備済み）を固定しており、`disabled={true}` 経路と editor 未準備（`editor === null`）経路を一切踏んでいない。AC-6 は「エディタ未準備 / `disabled` 時はボタン disabled」も要求しているので、条件式から `isDisabled` を落とす退行が素通りする。提案: `onRequestImage` を渡しつつ `disabled={true}` で描画 → ボタン disabled、の1ケースを追加（editor 未準備分岐まで欲しければマウントフラッシュ前の状態も固定可能だが、最低限 `disabled` 経路を1本）。

### Notes

- **[N-001] アサーションは「存在チェック止まり」になっておらず意味がある。** クリック→`toHaveBeenCalledTimes(1)`、`inputRef.current` が実 DOM ノードと `toBe` 一致、AC-7 は `aria-pressed`/`data-primary` の不在を明示否定（リンクボタンからのコピペ退行を捕捉）。happy path で `button.disabled === false` を assert しているため、マウント未フラッシュ（editor 未準備）なら失敗する＝editor-ready 経路も暗黙に保証されており、偽陽性になりにくい。
- **[N-002] AC-5 の退行検出が低コストで適切。** `inputRef` 省略時も `input[type="file"]` が描画されることを固定（`mediaUploaderInputRef.test.tsx:80-88`）。`input[type="file"]` セレクタは堅牢で、plan が古く（現コードの `MediaUploader` は既に dropzone/`done`/drag-drop を含むが plan は「未導入」と記述）ても影響を受けない。テスト自体は正。
- **[N-003] モック戦略は妥当。** `inputRef` 配線テストは server-fn を実行しないため `useServerFnRouter` + `serverFnChainStub` で import 時の top-level chain を捌くだけに留め、`URL.createObjectURL` 等のスタブも不要。アップロード実行を持ち込まない判断は plan 通りでスコープ過不足なし。WysiwygEditor 側は `wysiwygEditorOnChange.test.tsx` 同様 `@tanstack/react-start` をモックせず実 `useServerFn` で通しており、既存方針と一致。
- **[N-004] AC-1 の styling/icon は未アサート（`EDITOR_TOOLBAR_BTN` / `TOUCH_TARGET_SQUARE` / `ImageIcon`）だが許容範囲。** className 直アサートは脆く、構造属性（`type`/`title`/`role="toolbar"` 内包/`aria-label`）の方が意味的で、そちらは押さえられている。タッチ面 44px は視覚回帰の領域で単体テスト向きではない。
- **[N-005] AC-3/AC-4/AC-8 の扱いは妥当。** AC-3（フロー無改修）は既存テスト緑で担保、AC-4 は `inputRef` 省略レンダリングで任意性を間接固定、AC-8（ref-as-prop / `useImperativeHandle` 不使用）は構造制約で直接のテスト対象外。いずれも新規テストで無理に検証しない判断は適切。
