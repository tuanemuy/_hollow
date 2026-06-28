# 実装計画 — Issue #798: feat(note): WYSIWYG toolbar の「画像」ボタンを MediaUploader に配線する

**Issue:** #798
**作成日:** 2026-06-28
**複雑度:** 中〜大規模

---

## 目的

WYSIWYG 書式ツールバーに「画像」ボタンを追加し、クリックで本文下の `MediaUploader` のファイル選択（hidden ではなく現状の可視 `<input type="file">`）をトリガーして、既存のアップロード→挿入フローに乗せる。コンポーネント間連携を `MediaUploader` の props 契約 `{contentHtml, onInsert, disabled}` を壊さずに設計する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | WYSIWYG モードのツールバーに「画像」ボタンが表示される（lucide `ImageIcon`、`EDITOR_TOOLBAR_BTN` スタイル、`aria-label`/`title`="画像"、`type="button"`、モバイルで `TOUCH_TARGET_SQUARE` の 44px タッチ面、`role="toolbar"` 内） | Issue本文 / P12モック ~1072-1074 / 既存 a11y 規約 | 3 |
| AC-2 | 「画像」ボタンをクリックすると同一エディタ本文下の `MediaUploader` のファイル選択ダイアログ（`<input type="file">` の click）が開く（※自動テストでは happy-dom 制約によりダイアログ起動そのものは検証不能なため、`onRequestImage` の発火 + `inputRef.current` が `<input type="file">` を指す配線を proxy として固定し、ダイアログ起動は手動/ブラウザで確認する） | Issue本文 | 1,2,3 |
| AC-3 | ファイルを選択すると既存の presign→PUT→finalize→`setImage` 挿入フローがそのまま走り、WYSIWYG ではカーソル位置に画像が挿入される（`onMediaInsert` の wysiwyg 分岐は無改修） | Issue本文（スコープ外＝フロー不変） | なし（`onMediaInsert`/`mediaInsert.ts` を一切触らない＝無改修であることが本質。既存テスト緑で担保） |
| AC-4 | `MediaUploader` の props 契約 `{contentHtml, onInsert, disabled}` は変更されない（追加するのは契約と直交する任意の `inputRef` のみ） | Issue本文「props 契約を壊さない」 | 1 |
| AC-5 | HTML / inline モードは挙動不変（ツールバー自体が無いため画像ボタンも無く、各モードの可視 `MediaUploader` が従来どおり直接の入口） | Issue本文「モード別に整理」 | 2,3 |
| AC-6 | エディタ未準備（`editor === null`）/ `disabled` 時は画像ボタンが disabled。アップロード中はボタン経由でも何も起きない（入力が `disabled` のため `.click()` が no-op） | 既存 disabled 規約 | 3（ボタン disabled 判定）/ アップロード中 no-op は既存 `MediaUploader` の disabled 挙動に依存し step 1 は ref 接続のみ＝無改修 |
| AC-7 | 画像ボタンはトグルではなく単発アクションのため `aria-pressed` / `data-primary` を持たない（リンク以外の状態を持たない操作ボタン） | 既存ツールバー a11y パターン | 3 |
| AC-8 | コンポーネント間連携は既存 `editorRef` と同型の ref-as-prop（`React.RefObject<HTMLInputElement \| null>`）で実装し、コードベースに無い `useImperativeHandle` / `forwardRef` を新規導入しない（`UploadDialog` / `IngestionPreviewForm` の file input ref プロップ受けと同型） | Issue本文「連携方法の設計」 / ADR-001 | 1,2 |

## スコープ

### 含まれないもの
- メディアアップロードのフロー自体（presign→PUT→finalize、`insertMediaIntoHtml`、`onMediaInsert` の挿入ロジック）の変更。本Issueは「ツールバー → 既存 MediaUploader への配線」のみ。
- `MediaUploader` の UI 刷新（dropzone / preview / `done` 状態 / `DROPZONE` 共有定数）。これらは #795 / PR #797 の範囲で、本リポジトリには未導入。現状コード（可視 `<input>`、状態機械 `idle | uploading | error`）を正とする。可視入力を hidden 化することもしない。
- HTML / inline ツールバーへの画像ボタン追加。これらのモードにはツールバーが存在しない。

## 調査結果

- 関連ファイル:
  - `app/components/note/editor/WysiwygEditor.tsx` — TipTap ベースの WYSIWYG ペイン。`role="toolbar" aria-label="書式"` の書式ツールバーを内包。現状ボタンは Bold/Italic/Strike/H2/H3/UL/OL/Quote/Code（`buttons` 配列）+ Link（個別レンダー）。**画像ボタンは無い**。ツールバーボタン共通スタイル定数 `EDITOR_TOOLBAR_BTN` がこのファイル内にある。`onAddLink` が「ツールバー上の単発アクション」ハンドラの先行例。`editorRef?: React.RefObject<Editor|null>` を「ref をプロップとして渡し子が `.current` を設定する」形で親へ公開済み（＝本Issueの連携で踏襲すべき既存パターン）。
  - `app/components/note/editor/NoteEditor.tsx` — オーケストレーター。3モード（html/inline/wysiwyg）それぞれの本文編集 UI 直下に `MediaUploader` をマウント。`tiptapEditorRef = useRef<Editor|null>` を保持し WYSIWYG ペインへ渡す。`onMediaInsert` がモード別に挿入先を振り分け、wysiwyg では `tiptapEditorRef.current.chain().focus().setImage(...)`。
  - `app/components/note/editor/MediaUploader.tsx` — props `{contentHtml, onInsert, disabled}`。可視の `<input id={inputId} type="file" accept="image/*,video/*">` を直接描画。状態機械は `idle | uploading | error`。入力は `disabled || state.kind === "uploading"` で無効化。
  - `app/components/note/editor/mediaInsert.ts` — `insertMediaIntoHtml`（HTML 文字列末尾に `<p><img src="/media/<id>">` を追記）。無改修。
  - `app/components/common/Icon.tsx` — lucide ラッパー。`size` は 16/20/24、`strokeWidth=1.5`。ボタンの唯一の可視子要素のときは `label` を省略し `aria-label` を親 `<button>` に置く規約（既存ツールバーボタンと同じ）。
  - `app/components/common/styles.ts` — `TOUCH_TARGET_SQUARE`（モバイル 44px 角）、`field`/`fieldLabel`。`DROPZONE` は**未導入**。
  - `spec/design/pages/P12-editor.html`（~1072-1074）— ツールバー末尾、リンクボタンの直後に「画像」ボタン（rect+circle+polyline の画像アイコン）。本Issueはこのモック順を踏襲。
  - 既存テスト harness: `__tests__/wysiwygEditorOnChange.test.tsx` 等は `// @vitest-environment happy-dom` + `react-dom/client` の `createRoot` + `requestAnimationFrame` 2回フラッシュで TipTap の遅延マウント（`immediatelyRender:false`）を待つ。`MediaUploader` 専用テストは現状無し。
- あるべきアーキテクチャ（CLAUDE.md / styling 規約）:
  - フロントのみの変更。utility-first、状態は `data-*` 属性、繰り返しユーティリティはモジュールスコープ定数へ hoist。
  - コンポーネント間の命令的連携は「ref をプロップとして渡す」既存 `editorRef` パターンが正（コードベースに `useImperativeHandle`/`forwardRef` の使用例は無い → 新パターン導入は避ける）。React は 19.2 系で ref を通常プロップとして受け取れる。
  - a11y: `role="toolbar"`、各ボタンに `aria-label` + `title`、`type="button"`、モバイルタッチ面 `TOUCH_TARGET_SQUARE`。
- 既存実装の状態: モックにはツールバー画像ボタンがあるが実装には無く、未配線。本Issueでこの乖離を解消する。アップロードフロー・挿入ロジックは既にあり、無改修で再利用できる。
- 依存関係: 変更は `WysiwygEditor` / `NoteEditor` / `MediaUploader` の3コンポーネントに閉じる。`onMediaInsert` / `mediaInsert.ts` / server-fn / reducer は不変。`lucide-react` の `ImageIcon`（`Image` は tiptap の Image 拡張と名前衝突するためエイリアス名 `ImageIcon` を使用）。

## 設計

レイヤーはフロントエンドのみ。責務・props 契約・状態の所在から設計する。

### ドメインモデルへの影響
なし（UI 配線のみ。ドメイン・値オブジェクト・ポートに変更なし）。

### ユースケース / アプリケーションロジック
なし（既存の presign/finalize server-fn と `onMediaInsert` をそのまま再利用）。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

責務分担:
- **MediaUploader**（capability の保持者）— ファイル選択 UI とアップロード状態機械を所有。新たに「自分の `<input>` への参照を親へ公開する」だけを担う。`{contentHtml, onInsert, disabled}` 契約は不変、直交する任意プロップ `inputRef?: React.RefObject<HTMLInputElement | null>` を追加して `<input ref={inputRef}>` に配線（既存の `editorRef` / `UploadDialog` の `fileInputRef` / `IngestionPreviewForm` の `titleInputRef` と同型）。
- **NoteEditor**（オーケストレーター）— 共有の `mediaInputRef = useRef<HTMLInputElement>(null)` を保持。WYSIWYG モードでマウントする `MediaUploader` にだけ `inputRef` を渡す。`onRequestImage = useCallback(() => mediaInputRef.current?.click(), [])` を定義し `WysiwygEditor` へ渡す。トリガーとアップローダーを仲介する所在はここ（既存 `tiptapEditorRef`/`editorRef` と同じ「親が ref を持ち子へ配る」構図）。
- **WysiwygEditor**（トリガーの設置場所）— 任意プロップ `onRequestImage?: () => void` を受け取り、ツールバーのリンクボタン直後に「画像」アクションボタンを描画。`onClick={() => onRequestImage?.()}`。トグルではないので `aria-pressed`/`data-primary` は付けない。`disabled={isDisabled || onRequestImage === undefined}`。

連携方式は **(A) 親が file input への ref を保持し、ツールバーの画像ボタンが `.click()` を呼ぶ** を採用（既存 `editorRef` パターン踏襲、`{contentHtml, onInsert, disabled}` を壊さない、新パターン不要）。トレードオフは `adr.md` ADR-001 / ADR-002 を参照。

モード別の整理:
- **wysiwyg**: ツールバーあり → 画像ボタン設置・`MediaUploader` の picker へ配線。挿入は既存 `onMediaInsert` の wysiwyg 分岐（`setImage` でカーソル位置）。
- **html / inline**: ツールバー自体が無い → 画像ボタンも置かない。各モードの可視 `MediaUploader` が従来どおり直接の入口（無改修）。
- 結論: **画像ボタンは WYSIWYG ツールバーにのみ置く**（ツールバーが WYSIWYG 専用のため）。`mediaInputRef` は wysiwyg マウント時のみ接続され、画像ボタンがクリック可能なときは必ず対応する入力が存在する（モード切替でアンマウントされると React が `current` を null に戻すため stale ポインタにならない）。

## 実装ステップ

内側（capability 提供）→ 仲介 → トリガー設置の順。

### 1. MediaUploader に input ref を公開する任意プロップを追加

- **対象ファイル:** `app/components/note/editor/MediaUploader.tsx`
- **変更内容:**
  - `MediaUploaderProps` に `inputRef?: React.RefObject<HTMLInputElement | null>` を追加（`{contentHtml, onInsert, disabled}` はそのまま）。型は既存の file input ref プロップ受け（`UploadDialog` の `fileInputRef`、`IngestionPreviewForm` の `titleInputRef`）と同型の `RefObject` 形に揃える。JSDoc に「親がツールバー等から file 選択を起動するための参照。アップロード UI 自体は変更しない」旨を1行追記。
  - 関数引数で `inputRef` を受け取り、既存の `<input id={inputId} ...>` に `ref={inputRef}` を付与。
- **理由:** 「ファイル選択を開く」操作の SSOT は input 要素自体。親がそれを参照できれば `.click()` で起動できる。`useImperativeHandle` を使わず、既存 `editorRef` の ref-as-prop 流儀に揃える。

### 2. NoteEditor で ref を保持し、トリガーを配線

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:**
  - `const mediaInputRef = useRef<HTMLInputElement>(null);` を追加（`tiptapEditorRef` の近く）。
  - `const onRequestImage = useCallback(() => mediaInputRef.current?.click(), []);` を追加。
  - WYSIWYG ブロックの `<MediaUploader ...>` に `inputRef={mediaInputRef}` を渡す（html/inline の `MediaUploader` には渡さない）。
  - 同ブロックの `<WysiwygEditor ...>` に `onRequestImage={onRequestImage}` を渡す。
- **理由:** トリガー（ツールバー）とアップローダー（本文下）は兄弟。両者を束ねるのはオーケストレーターの責務。WYSIWYG にのみ配線することでモード別挙動の差異を所在で表現する。

### 3. WysiwygEditor のツールバーに画像ボタンを追加

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`
- **変更内容:**
  - lucide import に `ImageIcon` を追加（`Image` は tiptap の `@tiptap/extension-image` と衝突するためエイリアス名 `ImageIcon` を使用）。
  - `WysiwygEditorProps` に `onRequestImage?: () => void;` を追加（JSDoc で「ツールバー画像ボタン → 親 MediaUploader の file 選択起動」を明記）。
  - 関数引数に `onRequestImage` を追加。
  - ツールバーのリンクボタン直後（モック順）に「画像」ボタンを個別レンダー: `type="button"`、`aria-label="画像"`、`title="画像"`、`className={EDITOR_TOOLBAR_BTN}`、`disabled={isDisabled || onRequestImage === undefined}`、`onClick={() => onRequestImage?.()}`、子に `<Icon icon={ImageIcon} size={20} />`。`aria-pressed` / `data-primary` は付けない（単発アクション）。
- **理由:** ツールバーは WYSIWYG にのみ存在。リンクボタンと同じ「個別レンダーの単発アクション」パターンに揃える（`buttons` 配列はトグル前提で `isActive` を要求するため画像は配列に入れない）。

### 4. テスト

- **対象ファイル:** `app/components/note/editor/__tests__/wysiwygEditorImageButton.test.tsx`（新規）、必要なら `app/components/note/editor/__tests__/mediaUploaderInputRef.test.tsx`（新規）
- **変更内容:**
  - WysiwygEditor: 既存 happy-dom harness を流用。`onRequestImage={vi.fn()}` で描画 → マウントフラッシュ → `button[aria-label="画像"]` が存在し、クリックで `onRequestImage` が呼ばれることを検証。`onRequestImage` 省略時はボタンが disabled であることも確認。
  - MediaUploader: `inputRef` に渡した ref の `.current` が描画後 `<input type="file">` 要素を指すこと（配線の回帰）を検証。`inputRef` 省略時も従来どおり `<input type="file">` が描画されること（html/inline での無改修＝AC-5 の機械的な退行検出）も併記する。server-fn 依存があるためアップロード実行はテストしない（モック不要な ref 配線のみ）。
- **理由:** AC-1/AC-2/AC-6 の回帰固定。AC-5（html/inline 不変）は MediaUploader が `inputRef` 無しでも従来描画されることを軽く固定して機械的に守る。フロー本体は無改修なので既存テストで担保。

### 5. 品質ゲート

- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行し、関連テストを走らせる。
- **理由:** CLAUDE.md の変更後手順。

## 設計判断

- ADR-001: コンポーネント間連携方式に (A) 親が file input ref を保持 → ツールバーボタンが `.click()` を採用（B: imperative handle / C: dropzone scroll+focus との比較）。
- ADR-002: トリガー挙動を「ファイル選択ダイアログを開く」に決定（scroll+focus dropzone との比較。現状 UI に dropzone が無いため）。
詳細は `adr.md`。

## リスクと注意点

- `lucide-react` の `Image` は tiptap の Image 拡張 import と名前衝突する。必ずエイリアス名 `ImageIcon`（lucide が公式に export 済みを確認）を使う。
- `MediaUploader` の `inputRef` を3モード全てに渡すと、非アクティブモードのアンマウント済みインスタンスとの間で ref が競合し得る。WYSIWYG インスタンスにのみ渡し、画像ボタンも WYSIWYG にのみ置くことで「クリック可能時は必ず対応 input が存在」を保証する。
- アップロード中の二重起動: 入力は `disabled || uploading` で無効化されるため、disabled な input への `.click()` は no-op。ツールバーボタン側で uploading 状態を別途追う必要はない（追うと契約が増える）。ボタンの disabled はエディタ準備状態のみで判定。
- 既知の許容事項（バグではない）: 上記の結果、アップロード中は画像ボタンが「見た目 enabled だがクリックしても no-op」になる短時間ウィンドウが生じる。`MediaUploader` の uploading 状態をボタンへ伝播させない（契約を増やさない）ための意図的なトレードオフであり、本文下のアップローダー UI に進捗/エラーが表示されるため致命的ではない。後続のレビュー/QA が「バグではない」と判断できるよう明文化しておく（ADR-002 と整合）。
- `{contentHtml, onInsert, disabled}` 契約厳守: 追加プロップ `inputRef` はこの3つと直交する任意項目に留め、既存呼び出し（html/inline）は無改修で通ること。

## テスト方針

- 単体（happy-dom + createRoot）: WysiwygEditor の画像ボタン存在・クリック発火・省略時 disabled（AC-1/AC-2/AC-6/AC-7）。
- 単体: MediaUploader の `inputRef` が `<input type="file">` を指す配線回帰（AC-2/AC-4）。加えて `inputRef` 省略時も従来どおり `<input type="file">` が描画されることを固定し、html/inline の無改修を機械的に検出（AC-5）。
- 既存テスト（wysiwygEditorOnChange / mediaInsert 等）が緑のまま＝フロー無改修の確認（AC-3/AC-5）。
- 手動/ブラウザ: WYSIWYG で画像ボタン → ファイル選択 → カーソル位置に挿入。html/inline でツールバー・画像ボタンが無いこと。
- `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

- 1周目: 両視点とも問題点ゼロ。改善提案 coverage S-001〜S-004 / arch-risk S-001〜S-003 を全件反映してループ終了。
