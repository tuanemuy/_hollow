# レビュー: PR #800 / Issue #798 — Test 観点（Round 2 フル再レビュー）

対象テスト:
- `app/components/note/editor/__tests__/wysiwygEditorImageButton.test.tsx`（W-002 で disabled 分岐追加済み）
- `app/components/note/editor/__tests__/mediaUploaderInputRef.test.tsx`
- `app/components/note/editor/__tests__/noteEditorImageButtonWiring.test.tsx`（W-001 解消の新規・配線統合テスト）

実行結果: 3 ファイル green（6 tests passed, 138ms）。harness（happy-dom + `createRoot` + 2×rAF フラッシュ、`serverFnMock` の `useServerFnRouter`/`serverFnChainStub`、`IS_REACT_ACT_ENVIRONMENT`）の踏襲は正しく、`noteEditorModeChange.test.tsx` / `MediaUploader.test.tsx` / `wysiwygEditorOnChange.test.tsx` と一貫。実装側も確認済み（`NoteEditor.tsx:551,563` で `onRequestImage`/`mediaInputRef` を WYSIWYG インスタンスにのみ配線、`WysiwygEditor.tsx:587` の `disabled={isDisabled || onRequestImage === undefined}`）。

## Test

### Blockers

- なし。

### Warnings

- **[W-001] AC-6 の `editor === null`（未準備）分岐だけが依然として未カバー — `wysiwygEditorImageButton.test.tsx`**
  前ラウンド W-002（`disabled === true` 分岐）は新テスト（同ファイル94-121）で解消済み。残る `isDisabled = disabled === true || !isReady`（`WysiwygEditor.tsx:399-400`）のうち `!isReady`（`editor === null`）操作項だけが、画像ボタンに対して明示的に固定されていない。現状の3ケースが踏むのは「ready 後に enabled（happy path, flush 後 `disabled===false`）」「`onRequestImage` 省略」「`disabled===true`」の3経路のみ。`isDisabled` から `!isReady` を落とす退行（＝TipTap マウント前の一瞬ボタンが enabled になる）はどのテストでも検出できない。
  AC-6 が「エディタ未準備（`editor === null`）時は disabled」を明文で要求している以上、これは厳密には AC の一節の未固定。ただし実害は「マウント前の極短時間 enabled になり、押しても `onRequestImage` 経由で安全に動くだけ」で低い。`immediatelyRender:false` により描画直後（rAF フラッシュ前）は `editor===null` で確定するため、**`flushTipTapMount()` を呼ばずに render 直後の `findImageButton()?.disabled === true` を1行 assert する**だけで決定論的に閉じられる（フレークなし）。低コストなので追加を推奨。優先度は低。

### Notes

- **[N-001] W-001（配線統合テスト）の解消は的確で、偽陽性・偽陰性ともに堅い。** `noteEditorImageButtonWiring.test.tsx` は `HTMLElement.prototype.click` を no-op spy 化し、トリガーを `imageButton.dispatchEvent(new MouseEvent("click",{bubbles:true}))` で発火させることで「ボタン自身の `.click()` を spy に載せない → onRequestImage 経由の `mediaInputRef.current.click()` だけが載る」設計を成立させている（173-187行のコメント通り）。`toHaveBeenCalledTimes(1)` で空振り退行（onRequestImage が `.click()` を呼ばない）を、`mock.contexts` に `fileInput` を含む assert で receiver 取り違え（誤インスタンスへ ref 配線）を、それぞれ独立に捕捉。`onRequestImage` を渡し忘れた場合はボタンが disabled になり click が no-op → 0 calls で fail。前ラウンド指摘の「両端を別々に固定するだけ」状態を end-to-end の1本で確実に閉じている。
- **[N-002] 単一インスタンス前提は安全。** wiring テストは `input[type="file"]` を1件想定だが、`NoteEditor` はモード排他で WYSIWYG 時に WYSIWYG の `MediaUploader` のみマウントするため file input は常に1つ（`NoteEditor.tsx:513-566`）。`querySelector` が拾うのは WYSIWYG インスタンス。仮に html/inline 側にも `inputRef` を誤配線する退行が入っても、同時マウントされないため無害であり、テストが取りこぼす害もない。
- **[N-003] フレーク耐性は既存パターン準拠で妥当。** wiring テストは inline → WYSIWYG 切替後に `flushRaf()`（2×rAF）で TipTap 遅延マウントを待ち、`imageButton.disabled === false` と file input 存在を確認してから spy を張る。`<p>foo</p>` のみで decoration-loss ダイアログを回避する前提も `noteEditorModeChange.test.tsx` で実証済みのゲートを踏襲。非同期マウント待ちは確立済み harness と同一で、新規フレーク要因は持ち込んでいない。
- **[N-004] W-002 追加ケースは「disabled かつ click しても発火しない」まで固定しており十分。** `wysiwygEditorImageButton.test.tsx:117-120` で `disabled===true` のボタンを click → `onRequestImage` 未呼び出しを assert。属性だけでなく挙動も押さえている。
- **[N-005] AC-1/2/4/5/7 のカバレッジは過不足なし。** AC-1（`role="toolbar"` 内包・`type=button`・`title`・`aria-pressed`/`data-primary` 不在）と AC-7 は wysiwyg 単体テストで構造アサート、AC-2 は wiring テスト＋ inputRef テストの二段、AC-4/AC-5 は `inputRef` 省略レンダリングで間接固定。className/`TOUCH_TARGET_SQUARE`/44px は単体テスト対象外として除外する判断も妥当（視覚回帰領域）。AC-3/AC-8 は無改修・構造制約で新規テスト不要の扱いが適切。過剰テストなし。
