# 実装計画 — Issue #233: ノート編集のデフォルトモードを仕様に揃える（新規=WYSIWYG / 既存=テキストノード単位編集）

**Issue:** #233
**作成日:** 2026-05-28
**複雑度:** 中〜大規模

---

## 目的

`spec/idea.md:9` と `spec/scenario/authoring.md` C2 で定義された「新規=WYSIWYG / 既存=テキストノード単位編集（構造保持）」をエディタのデフォルト挙動として実装する。新エディタモード `"inline"` を追加し、既存ノート編集時はレンダリング済み HTML のテキスト保持ブロック要素（`<p>`/`<h1-6>`/`<li>`/`<td>`/`<th>`/`<blockquote>`/`<figcaption>`/`<caption>`/`<dt>`/`<dd>`）を `contentEditable` で編集可能にしつつ、構造変化を MutationObserver でロールバックする。

## スコープ

### 含まれるもの

- `EditorMode` を `"html" | "frontMatter" | "wysiwyg" | "inline"` の 4 種類に拡張
- `createInitialEditorState` に `surface: "new" | "edit"` を導入し、新規→`wysiwyg`・既存→`inline` をデフォルト初期 mode に切替
- 新規コンポーネント `InlineEditor.tsx`: レンダリング済み HTML の「テキスト保持ブロック要素」を `contentEditable=true` にし、その内部インライン要素（`<strong>`/`<em>`/`<a>` 等）を含めてテキスト編集可能にする実装
- `EditorModeSwitch.tsx` の `surface` 別出し分け（新規: `wysiwyg/frontMatter/html`、既存: `inline/frontMatter/html`）
- `inline` モード初期化失敗時の `html` モードへのフォールバック（`onInitFailed`）
- モード切替時、未保存変更がある場合の確認ダイアログ（`window.confirm`） — 対象遷移ペアは Issue 完了条件記載の `inline ⇄ html`、`wysiwyg ⇄ html`、ならびに `inline ⇄ frontMatter`、`wysiwyg ⇄ frontMatter`、`frontMatter ⇄ html` を含む全モード切替（dirty 検出の対象を狭める根拠が仕様に無いため、未保存状態であれば全切替で確認する）
- 既存テスト更新（mode 関連 assert）+ 新規テスト追加（`inline` の構造保持・ペースト・キー操作・フォールバック・空ボディ・モード往復）

### 含まれないもの

- `inline` モードでのブロック挿入・削除 UI（仕様 C2-3 で「タグ削除や入れ替えは別 UI を用意」と明示。本 Issue では構造保持のみ実装）
- TipTap WYSIWYG の拡張サポート（Issue #77/#78/#79/#80 で個別管理）
- モード切替確認ダイアログの独自モーダル化（`window.confirm` で十分。UX 強化は別 Issue）
- 「破棄」選択時の autosave キャンセル・ロールバック（in-flight な autosave をどう扱うかは別 Issue で扱う）
- domain / application / adapter 層の変更（保存契約は `contentHtml: string` のまま不変）
- メディア挿入直後の `<img>` 単体ラッパの編集可能化（C4 拡張の別 Issue）

## 実装ステップ

### 1. `EditorMode` の拡張と初期 mode の分岐を `editorState.ts` に入れる

- **対象ファイル:** `app/components/note/editor/editorState.ts`
- **変更内容:**
  - `EditorMode` を `"html" | "frontMatter" | "wysiwyg" | "inline"` に拡張
  - `EditorInit`（`createInitialEditorState` の引数型）に `surface: "new" | "edit"` を**必須**として追加
  - `createInitialEditorState` の `mode` 初期値を `init.surface === "new" ? "wysiwyg" : "inline"` に
  - `setMode` reducer は既存どおり任意の `EditorMode` 受理（追加ロジックなし）
  - ファイル冒頭 JSDoc に Issue #233・仕様 C1/C2 への参照を追記
  - **他の `mode` 網羅判定箇所の追跡**: 実装着手時に `rg '"wysiwyg"|"html"|"frontMatter"' app/components/note/editor/` で全箇所を列挙し、`"inline"` を考慮する必要のある分岐を全て更新する（`useAutosave.ts` の WYSIWYG ゲート、`NoteEditor.tsx` の三項連鎖、テスト群）
- **理由:** 仕様の「新規=WYSIWYG / 既存=テキストノード単位編集」を満たす唯一の状態起点。surface を init に持たせて初期 mode 決定ロジックを 1 箇所に集約し、テストで `surface → mode` の対応を pin できるようにする。

### 2. `NoteEditor.tsx` から surface を渡し、`inline` モードを描画する

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:**
  - `createInitialEditorState` に `surface: props.mode === "new" ? "new" : "edit"` を渡す
  - `state.mode === "inline"` の分岐を追加して新規 `<InlineEditor>` を描画
  - `<MediaUploader>` を `inline` モードでも併設（C4 アップロード経路維持）
  - `EditorModeSwitch` 呼び出しに `surface` プロップを追加
  - モード切替 `onChange` を以下の順序で処理する関数に差し替え:
    1. **blur**: 既存の `document.activeElement.blur()` パス（FrontMatter 編集中の pending 確定）をまず実行
    2. **dirty 判定**: blur 後に `state.dirtyKeys.size > 0`、`state.autosave.kind === "saving"`、`state.autosave.kind === "error"` のいずれかなら → `window.confirm('未保存の変更があります。保存せずに切り替えますか？')` を出す
    3. **confirm 結果**: `false` ならディスパッチを行わずキャンセル。`true` なら `dispatch({ type: "setMode", mode })`
  - **既存の Issue #230 ADR-003（blur 順序）**との競合を避けるため、blur → dirty 再評価 → confirm → dispatch の順序を必ず守る
- **理由:** 完了条件「モード切替が動作・未保存時は確認ダイアログ」「新規=wysiwyg / 既存=inline」を満たす。

### 3. `EditorModeSwitch.tsx` を surface 出し分けに対応させる

- **対象ファイル:** `app/components/note/editor/EditorModeSwitch.tsx`
- **変更内容:**
  - `EditorModeSwitchProps` に `surface: "new" | "edit"` を追加
  - `TABS` を surface で出し分け:
    - `new`: `wysiwyg` / `frontMatter` / `html`
    - `edit`: `inline` / `frontMatter` / `html`
  - `inline` モードのラベルは「ビジュアル」（仕様 C2-4 の「ビジュアル ⇄ HTML」に合わせる）
  - `wysiwyg` のラベルは既存どおり「WYSIWYG」
- **理由:** 仕様 C2-4 のラベル一致と、シナリオごとの妥当なタブ集合を反映。

### 4. `InlineEditor.tsx` を新規実装する

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx`（新規）
- **公開 props:** `{ value: string; onChange: (html: string) => void; disabled?: boolean; onInitFailed?: () => void }`（`HtmlEditor` / `WysiwygEditor` と整合）
- **変更内容（DOM 同期戦略）:**

  #### 4-1. 編集可能化アルゴリズム（許可リストブロック方式）
  - **テキスト保持ブロック要素の許可リスト**（タグ名・小文字）: `p`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `li`, `td`, `th`, `blockquote`, `figcaption`, `caption`, `dt`, `dd`
  - `<pre>` は許可リストから除外（ADR-002 参照）
  - 上記許可リストにマッチした要素に `contentEditable=true` を付与（その内部のインライン要素 `<strong>`/`<em>`/`<a>`/`<code>` 等は親の contentEditable を継承して編集可能になる）
  - **ネスト時の挙動**: `<li><p>foo</p></li>` のような構造では、外側の `<li>` と内側の `<p>` が両方許可リストに該当するが、`contentEditable=true` は内側の `<p>` だけに付与する（外側はテキスト直接子を持たないため editable にしない）
  - **混在子のケース**: `<blockquote>foo<p>bar</p></blockquote>` のように許可リスト要素がテキスト直接子と許可リスト子孫を両方持つ場合は、外側 (`<blockquote>`) と内側 (`<p>`) の**両方**に `contentEditable=true` を付与する。これにより外側のテキスト "foo" も編集可能になる（仕様 C2-2 適合）。HTML5 仕様で `contentEditable=true` がネストしても害がないため安全
  - **判定ロジック**: 各許可リスト要素 `el` について、`el.childNodes` を走査し、`Node.TEXT_NODE`（空白のみのテキストは除く）が含まれていれば editable に。テキスト直接子が無く許可リスト子孫のみなら editable にしない
  - ホスト要素自身は `contentEditable=false`

  #### 4-2. 初期マウント手順（順序厳守）
  1. `new DOMParser().parseFromString(value, "text/html")` で `<body>` を取得
  2. **空ボディ判定**: `body.childNodes.length === 0 && value.trim() === ""` の場合は「空ノートとして空のホスト要素のまま inline モードを継続」（フォールバックしない）
  3. **パース失敗判定**: 例外発生 / `body` が `null` / `value.trim() !== "" && body.childNodes.length === 0` のいずれか → `onInitFailed?.()` を一度だけ呼んで早期 return（`useRef<boolean>` で多重呼び出しガード）
  4. **スナップショット取得**: `body.cloneNode(true)` を `snapshotBodyRef` に保持（ロールバック用）
  5. **ホスト要素へ移動**: `host.replaceChildren(...Array.from(body.childNodes))` でノードを移動（`body` は空になる）
  6. **編集可能化**: ホスト要素を walker で走査し、許可リスト要素に `contentEditable=true` を付与
  7. **イベントリスナ装着**: `keydown`、`paste`、`compositionstart`/`compositionend`、`input`
  8. **`MutationObserver` 開始**: `{ subtree: true, childList: true, characterData: true, attributes: true, characterDataOldValue: false }`

  #### 4-3. `MutationObserver` ロールバック（IME・テキストノード許可ハイブリッド）
  - **基本方針**: ADR-003 のハイブリッド方式
  - **`characterData`**: 常に通す（テキスト編集の本流）
  - **`childList`**: 以下のいずれかなら通す（それ以外を 1 件でも含むバッチはロールバック）
    - (a) `isComposingRef.current === true`（IME 入力中）
    - (b) `target.nodeType === Node.ELEMENT_NODE && (target as Element).isContentEditable === true` かつ `addedNodes` / `removedNodes` のすべてが `nodeType === Node.TEXT_NODE`（Backspace 結合・insertText 等）。`isContentEditable` プロパティは祖先継承を DOM 標準で評価するため、許可リストブロック要素配下の判定がワンライナーで済む
  - **`attributes`**: `isComposingRef.current === true` なら通す、それ以外はロールバック
  - **`compositionend`**: 確定時の処理順序は以下を厳守:
    1. `observer.takeRecords()` で残レコードを flush
    2. `host.innerHTML` と `snapshotBodyRef` 由来 HTML の構造を比較
    3. ズレがあればロールバック実行
    4. **最後に** `isComposingRef.current = false` に倒す（順序を逆にすると、`compositionend` 直後の最終 `input` 由来 childList 通知が誤検知でロールバックされる可能性がある）
  - **ロールバック実行**:
    1. `observer.disconnect()`
    2. `observer.takeRecords()` でキュー破棄
    3. `host.replaceChildren()` でホストを空に
    4. `snapshotBodyRef.cloneNode(true)` を新たに作成して `host` に `append`（毎回新規 clone で 2 回目以降のロールバック耐性を確保）
    5. 編集可能化を再付与（ホストを再走査）
    6. `observer.observe(host, options)` で再開
  - **`compositionend` ハンドラ**: IME 確定時、`host.innerHTML` と `snapshotBodyRef` の構造（タグ・属性のシリアライズ結果）を比較し、構造が変化していたらロールバック実行

  #### 4-4. `keydown` ハンドラ
  - `Enter` / `Tab` を `preventDefault`（IME 中は除外: `event.isComposing === true` なら通す）
  - `Backspace` / `Delete`: 通す（MutationObserver が childList 変化を rollback するため、構造が壊れたら自動復元される）

  #### 4-5. `paste` ハンドラ
  - `event.preventDefault()` → `event.clipboardData.getData("text/plain")` を取得
  - `document.getSelection()?.getRangeAt(0)` を `Range.insertNode(document.createTextNode(...))` で挿入

  #### 4-6. シリアライズ・`onChange`
  - leaf 要素の `input` イベントで debounce（50ms 程度、`setTimeout` ベース）後に `host.innerHTML` を `onChange` に渡す
  - `lastEmittedHtmlRef.current = host.innerHTML` を発火直前に更新
  - `isComposingRef.current === true` の間は発火を抑止し、`compositionend` 時に確定値で発火

  #### 4-7. 外部 `value` 変更との同期
  - `useEffect([value])` 内で `value === lastEmittedHtmlRef.current` なら自己発火由来として早期 return
  - 外部由来なら: `observer.disconnect()` → `host.replaceChildren()` → 初期マウント手順 (1)〜(8) の (3)以降を再実行 → `observe()` 再開

  #### 4-8. `disabled` 対応
  - `disabled === true` のとき: ホスト要素に `data-disabled=""` 属性、全 `contentEditable=true` 要素を `false` に倒す
  - Tailwind の `data-[disabled]:opacity-60 data-[disabled]:cursor-not-allowed` 等で視覚抑制

  #### 4-9. クリーンアップ
  - `useEffect` の cleanup で `observer.disconnect()`、イベントリスナ全解除、`host.replaceChildren()`、debounce タイマー clearTimeout
  - React 19 StrictMode 二重マウント対策として、すべての副作用を effect 内に閉じ、レンダ関数中で DOM 操作しない

  #### 4-10. SSR ハイドレーション
  - ホスト要素は `<div ref={hostRef} />` の空コンテナとしてレンダ。DOM 注入は `useEffect` 内のみで hydration mismatch を回避

  #### 4-11. スタイル
  - ホスト要素には `className="note-detail-content"` を付与（`app/styles/index.css` の既存 `@layer components` を再利用）
  - **正当性**: `InlineEditor` のホスト要素には Tailwind utility を付与できるが、ホストに注入される HTML 子孫（既存ノートの `<p>`/`<h2>`/...）には class を後付けできないため、子孫スタイルだけ `.note-detail-content` を再利用する。これは `.issue/70/adr.md` ADR-002 の documented exception の精神に沿う

- **理由:** Issue 完了条件「`inline` モードでブロック構造が変更されない」「初期化失敗時は `html` モードへ安全にフォールバック」、および仕様 C2-2「装飾済みの要素はその意匠を保ったままインラインで文字を編集」を満たす唯一の構造。

### 5. `NoteEditor` の `onMediaInsert` を `inline` 対応に拡張

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** `state.mode === "inline"` の場合は既存の文字列追記経路（`dispatch({ type: "setContent", value: nextHtml })`）を使う。TipTap 命令経路には流さない
- **理由:** 既存テスト/動線を壊さない最小変更。`InlineEditor` の `useEffect([value])` 同期によって新メディアが DOM に反映される。

### 6. `onInitFailed` を `NoteEditor` で受けて `html` モードへフォールバック

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** `<InlineEditor onInitFailed={() => dispatch({ type: "setMode", mode: "html" })} />`
- **理由:** Issue 完了条件「`inline` モード初期化失敗時は `html` モードへ安全にフォールバック」。

### 7. テスト追加

- **対象ファイル:**
  - 修正: `app/components/note/editor/__tests__/editorState.test.ts`
  - 修正: `app/components/note/editor/__tests__/autosaveLogic.test.ts`
  - 新規: `app/components/note/editor/__tests__/inlineEditor.test.tsx`
- **変更内容:**
  - `editorState.test.ts`:
    - 既存 `expect(s.mode).toBe("html")` 系を `surface: "new"` → `"wysiwyg"`、`surface: "edit"` → `"inline"` に分けて assert
    - `setMode` で `inline` ⇄ `html` ⇄ `wysiwyg` のいずれにも遷移できるテストを追加
    - `setMode` が dirty / autosave を保つ不変条件を新モード `"inline"` でも確認
  - `autosaveLogic.test.ts`: `state.mode === "inline"` でも `shouldFlushAutosave` が他条件 OK のときに `true` を返すことを pin
  - `inlineEditor.test.tsx`（happy-dom + `createRoot` + `act`、`wysiwygEditorOnCreateDetect.test.tsx` と同じ枠組み）:
    1. **構造保持**: `<table><tr><td>foo</td></tr></table>` を渡すと DOM 上に `<table>` が残り、`<td>` のみ `contentEditable=true`
    2. **インライン装飾保持**: `<p>foo <strong>bar</strong> baz</p>` で `<p>` が `contentEditable=true`、内部の `<strong>` が編集後も保持される（仕様 C2-2 のキー検証）
    3. **キー操作の構造維持**: `Enter` を leaf 上で押しても `host.innerHTML` の構造が変わらない
    4. **`childList` 変化の rollback**: `<td>` から子要素を強制削除しても snapshot から復元される
    5. **ペースト**: `<script>` を含む HTML をペーストしても DOM の childList が変化しない（テキスト化される）
    6. **不正 HTML フォールバック**: パース失敗を擬似する value で `onInitFailed` が一度だけ呼ばれる
    7. **空ボディ**: `value === ""` の場合は `onInitFailed` を呼ばずホスト要素を空のまま継続
    8. **外部 `value` 同期**: 外部 `value` 変更時に DOM が再構築され、`MutationObserver` 由来の `onChange` 自己発火が起きない
    9. **モード往復**: `vi.spyOn(window, "confirm").mockReturnValue(true)` を使い、`NoteEditor` レベルで `inline → html → inline` を切替できる回帰テスト（`NoteEditor.tsx` の `__tests__` に追加検討）
- **理由:** 完了条件「既存テストが通る + 新モード用のテストを追加」を満たす。

### 8. JSDoc / コメント整備

- **対象ファイル:** `editorState.ts` 冒頭 JSDoc、`InlineEditor.tsx` 冒頭 JSDoc
- **変更内容:** 新モード `"inline"` の存在理由（仕様 C2-2/3、構造保持の不変条件、許可リストブロック方式）と、`inline` モード固有の「初期化失敗 → html フォールバック」契約、`onInitFailed` の呼出条件を明文化
- **理由:** CLAUDE.md「ライブラリレベル JSDoc on exported APIs is welcome」、ADR の参照系統を維持。

## 設計判断

詳細は `.issue/233/adr.md` を参照。要約:

- **ADR-001**: `surface: "new" | "edit"` を `EditorInit` に持たせて初期 mode 決定を `editorState.ts` に集約
- **ADR-002**: `inline` モードの編集可能化は「テキスト保持ブロック要素の許可リスト方式」（`p`/`h1-6`/`li`/`td`/`th`/`blockquote`/`figcaption`/`caption`/`dt`/`dd`）。内部インライン要素は親の contentEditable を継承して編集可能
- **ADR-003**: 構造変化のロールバックは「`characterData` のみ常時許可、`childList`/`attributes` は IME 中のみ許可」のハイブリッド方式
- **ADR-004**: モード切替時の確認ダイアログは `window.confirm` で実装。発動条件は `dirty || autosave === "saving" || autosave === "error"`。順序は blur → dirty 再評価 → confirm → dispatch
- **ADR-005**: `inline` モードの `onMediaInsert` は文字列追記経路（TipTap 命令を流さない）
- **ADR-006**: `inline` モードに autosave ゲートを追加しない
- **ADR-007**: `note-detail-content` 流用は `.issue/70/adr.md` ADR-002 の documented exception の精神に沿う（ホスト子孫 HTML に class を後付けできないため）

## リスクと注意点

- **React 19 StrictMode 二重マウント**: `InlineEditor` の `useEffect` クリーンアップを徹底し、`observer.disconnect()` と DOM 初期化を行う必要がある
- **SSR ハイドレーション**: DOM 注入は `useEffect` 内のみ。サーバーでパース→注入すると hydration mismatch
- **`MutationObserver` の再帰**: ロールバック書き戻し自体が `MutationRecord` を生むため、必ず `disconnect()` → `takeRecords()` → 書き戻し → `observe()` の順序を守る
- **`MutationObserver` のスナップショット再利用**: ロールバック時は `snapshotBodyRef.cloneNode(true)` を毎回新規作成して append（同一ノードを 2 回 append できないため）
- **IME（日本語入力）**: `compositionstart` / `compositionend` 中の `input` イベントは中間状態。`isComposingRef` true 中は `childList`/`attributes` 変化も猶予し、`compositionend` で構造検証
- **`detectUnsupportedTags` との関係**: `inline → wysiwyg` 手動切替時は既存の WYSIWYG 側 onCreate 検出（ADR-005, Issue #37）がそのまま動く
- **初期化失敗フォールバックの競合**: `onInitFailed` で `setMode('html')` を呼んだ直後に `InlineEditor` がアンマウントされる。`useRef<boolean>` で `onInitFailed` の二重呼出をガード
- **モード切替確認の autosave 競合**: `window.confirm` で「破棄」しても in-flight な autosave のキャンセル/ロールバックは本 Issue では実装しない（別 Issue）。発動条件に `autosave.kind === "error"` を含めることで、失敗中の dirty 状態でも確認を出す
- **既存テスト破壊**: `editorState.test.ts` の `mode` assert を全件 surface に応じた値へ更新する必要がある
- **`window.confirm` のテスト**: happy-dom はデフォルトで `confirm` が `false` を返す。テストでは `vi.spyOn(window, "confirm").mockReturnValue(true/false)` を使う

## テスト方針

- **ユニット（vitest）**:
  - `editorState.test.ts` 更新で `surface` ベースの初期 mode を pin
  - `autosaveLogic.test.ts` で `inline` モードが autosave ゲートを素通りすることを pin
  - `inlineEditor.test.tsx`（happy-dom）で構造保持・インライン装飾保持・キー操作・ペースト・フォールバック・空ボディ・外部 value 同期を検証
- **typecheck / lint / format**: `pnpm typecheck && pnpm lint:fix && pnpm format`
- **手動検証**: `/notes/new` で WYSIWYG 初期表示、既存ノートを `/notes/$noteId/edit` で開くと `inline` 初期表示、`<table>` を含む既存ノートで構造保持、モード切替時に未保存変更があると confirm ダイアログ
- **既存テスト**: `pnpm test:unit` グリーン

## レビュー履歴

### 1周目

**修正した点（要件カバレッジ視点）**:
- **[P-001]** モード切替確認ダイアログのトリガ条件を明示。blur → dirty 再評価 → confirm → dispatch の順序を固定し、Issue #230 ADR-003 と整合させた（実装ステップ 2）
- **[P-002]** 空ボディは `onInitFailed` を呼ばずに `inline` モードを継続する仕様を ADR-002 / 実装ステップ 4-2 に明記

**修正した点（アーキ・リスク視点）**:
- **[P-001]** 「leaf 要素単位の contentEditable」が仕様 C2-2 違反になる問題を受け、許可リストブロック方式（`p`/`h1-6`/`li`/`td`/`th`/`blockquote`/`figcaption`/`caption`/`dt`/`dd`）に方針転換。ADR-002 を全面改訂
- **[P-002]** MutationObserver の許可リストを「characterData 常時 + childList/attributes は IME 中のみ許容」のハイブリッドに変更。`compositionend` で構造検証する手順を明示（ADR-003 / 実装ステップ 4-3）
- **[P-003]** `replaceChildren` と `cloneNode` の順序を明示。ロールバック時は毎回 `snapshotBodyRef.cloneNode(true)` を作り直す方針を明文化（実装ステップ 4-2 / 4-3）
- **[P-004]** `note-detail-content` 流用の正当性を ADR-007 として追加（`.issue/70/adr.md` ADR-002 の参照系統を維持）
- **[P-005]** モード切替確認の発動条件に `autosave.kind === "error"` を追加（実装ステップ 2 / ADR-004）

**取り込んだ改善提案**:
- **[S-001（req）]** `EditorMode` 網羅判定箇所の grep フォローを実装ステップ 1 に追加
- **[S-002（req）]** Issue 完了条件の「動作」を「未保存検出時 confirm、確定後切替」と明示
- **[S-003（req）]** テストケース 5 を「childList 変化が起きない」観点に寄せ、XSS 観点と分離
- **[S-002（arch）]** モード往復テストケース（テストケース 9）を追加
- **[S-003（arch）]** `window.confirm` モック方針をリスク欄に明記

**見送った提案とその理由**:
- **[S-001（arch）]** `surface` のオプショナル化は見送り（暗黙デフォルトに引きずられるリスク + 既存テスト 8 箇所の更新は問題ない規模）
- **[S-004（arch）]** `setMode` の reducer に confirm フラグを持たせるリファクタは見送り（現案でも reducer は pure に保たれており、副作用は `NoteEditor` レイヤーに閉じ込められているため過剰）
- **[S-005（arch）]** メディア挿入直後の `<img>` 編集可能化は Issue C4 拡張として別 Issue（スコープ外）

### 2周目

**修正した点（要件カバレッジ視点）**:
- 問題点ゼロ・改善提案なしの報告。修正なし

**修正した点（アーキ・リスク視点）**:
- **[P-001]** ADR-003 の Decision と Consequences 末尾の細分化ロジックの矛盾を解消。Decision を「`characterData` 常時 + `childList` の許可条件として (a) IME 中 (b) テキストノードのみの add/remove を明示」に統合。実装ステップ 4-3 にも同じロジックを反映

**取り込んだ改善提案**:
- **[S-001]** ADR-002 に `<pre>` を許可リストから除外する判断と理由を Consequences として明記
- **[S-002]** 混在子（`<blockquote>foo<p>bar</p></blockquote>`）のケースで「外側と内側の両方を editable にする」判断を ADR-002 / 実装ステップ 4-1 に明文化

**見送った提案とその理由**:
- **[S-003]** debounce 値 50ms の整合性確認は実装段階で `useAutosave` の値と比較して fix する（plan 段階では仮値として 50ms を残す。実装時の判断項目とする）

### 3周目

**修正した点（要件カバレッジ視点）**:
- 問題点ゼロ・改善提案なしの報告。修正なし

**修正した点（アーキ・リスク視点）**:
- 問題点ゼロ。改善提案 [S-001 arch]（`isComposingRef` リセット順序）と [S-002 arch]（装飾要素削除制約）と [S-003 arch]（`isContentEditable` プロパティ使用）を反映:
  - 実装ステップ 4-3 に `compositionend` の処理順序（`takeRecords()` → 構造比較 → ロールバック → `isComposingRef=false`）を追記
  - 実装ステップ 4-3 の `target` 判定を `(target as Element).isContentEditable === true` に簡素化
  - ADR-003 Consequences に装飾要素削除の制約を明記

**3周目終了**: 要件カバレッジ・アーキ両視点ともに問題点ゼロを確認、レビューループ完了。
