# 実装計画 — Issue #9: P12 本格 WYSIWYG エディタ導入 (TipTap)

**Issue:** #9
**作成日:** 2026-05-17
**複雑度:** 中〜大規模

---

## 目的

P12 ノートエディタの WYSIWYG モードを本格実装し、`EditorModeSwitch` の WYSIWYG タブを enabled にする。Issue #1 の Phase 4 follow-up — ADR-002 で「HTML モード + sanitized preview で代替」とした暫定対応を、TipTap を採用してリプレースする。

## スコープ

### 含まれるもの

- TipTap を採用（ユーザー指示）。`@tiptap/react` + `@tiptap/pm` + `@tiptap/starter-kit` + `@tiptap/extension-link` + `@tiptap/extension-image` を導入
- `WysiwygEditor.tsx` を `HtmlEditor.tsx` と同じ I/O 契約 (`{ value, onChange, disabled }`) で新規実装
- `editorState.ts` の `EditorMode` を `"wysiwyg-disabled"` → `"wysiwyg"` に置換し、`setMode` の no-op ガードを撤去
- `EditorModeSwitch` の WYSIWYG タブを enabled 化
- `NoteEditor.tsx` のモード分岐に `state.mode === "wysiwyg"` ブランチを追加し、WYSIWYG モードでも `MediaUploader` を共存させる
- メディア挿入の WYSIWYG 内対応 — `MediaUploader` のアップロード完了時に TipTap エディタコマンド (`editor.chain().focus().setImage(...).run()`) でカーソル位置に挿入。`<img src="/media/<id>">` 形式を維持（ADR-009 整合）
- 既存 ADR-002 のステータスを Superseded に更新
- 単体テスト: `editorState.test.ts` の `wysiwyg-disabled` 関連を `wysiwyg` 想定に書き換え
- バンドルサイズの確認（`pnpm deploy:staging:dry`）

### 含まれないもの

- **内部リンク補完 UI（タグ・ノート横断 suggest）** — 別 Issue へ切り出す。理由は「設計判断」ADR-002 参照
- 既存ノートの `<table>` 等を WYSIWYG で開いたときの完全ラウンドトリップ保証（StarterKit が解さないタグは別途扱いが必要）— リスクとして文書化し、必要なら後続 Issue
- WysiwygEditor の本格的な React コンポーネントテスト（jsdom + ProseMirror セットアップコストが高い） — マニュアルテストで担保
- リアルタイム協調編集、履歴 / リビジョン UI（既存方針どおり別 Issue）

---

## 実装ステップ

### 1. 依存追加

- **対象ファイル:** `package.json`, `pnpm-lock.yaml`
- **変更内容:**
  - `pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image`
- **理由:** TipTap は ProseMirror をラップする宣言的 API。`@tiptap/pm` は peer 集約パッケージ。クライアントバンドルにのみ載るので Workers の 1MB script-size には影響しない（後でビルドサイズ確認）

### 2. EditorMode 型と reducer 更新

- **対象ファイル:** `app/components/note/editor/editorState.ts`
- **変更内容:**
  - `export type EditorMode = "html" | "frontMatter" | "wysiwyg"` に変更（`wysiwyg-disabled` を撤去）
  - `setMode` ケースの `if (action.mode === "wysiwyg-disabled") return state;` ガードを削除
  - JSDoc の「`wysiwyg-disabled`」関連の記述を削除し、ADR-002 言及を更新
- **理由:** 受入条件「WYSIWYG タブが enabled になる」を型レベルで満たす

### 3. EditorModeSwitch を enabled 化

- **対象ファイル:** `app/components/note/editor/EditorModeSwitch.tsx`
- **変更内容:**
  - `TABS` の `wysiwyg-disabled` エントリを `{ mode: "wysiwyg", label: "WYSIWYG" }` に置換
  - `Tab` 型から `disabled?: boolean; title?: string;` フィールドを撤去し、`disabled === true` のクリック抑止・aria-disabled 属性・`<button disabled>` も削除（disabled タブの概念自体が不要に）
  - JSDoc の ADR-002 言及を「P12 (Issue #9) で解消」に更新
- **理由:** 受入条件「WYSIWYG タブが enabled になる」の直接表現。disabled タブが存在しなくなるので Tab 型からその概念を消すと意図が明確になる

### 4. WysiwygEditor.tsx を新規作成

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx` (新規)
- **変更内容:**
  - 先頭に `"use client"`
  - import: `import type { Editor } from "@tiptap/react"` で型を統一（`@tiptap/core` からは import しない）
  - Props: `Readonly<{ value: string; onChange: (html: string) => void; disabled?: boolean; editorRef?: React.RefObject<Editor | null> }>` — `HtmlEditor` と同一 I/O 契約 + `editorRef` で親（NoteEditor）からエディタコマンドを呼べるようにする。React 19 で `MutableRefObject` は deprecated なので `RefObject<T | null>` を使用
  - `useEditor({ extensions: [StarterKit, Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }), Image.configure({ inline: false, allowBase64: false })], content: value, editable: !disabled, onUpdate: ({ editor }) => onChange(editor.getHTML()), immediatelyRender: false })`
  - **immediatelyRender: false** は React 19 / RSC ハイドレーション不整合を避けるための必須設定（TipTap v2 推奨）
  - 外部 value 変化への同期: `useEffect(() => { if (!editor) return; if (editor.getHTML() !== value) editor.commands.setContent(value, { emitUpdate: false }); }, [editor, value])` — 第2引数で `onUpdate` 発火を抑止し無限ループを防ぐ。**TipTap v2.11+ のオブジェクト形式シグネチャ**を前提とするため、`package.json` で `"@tiptap/react": "^2.11.0"` 以上を指定すること
  - `editorRef` 連携（null フォールバックを明示）: `useEffect(() => { if (!editorRef) return; editorRef.current = editor ?? null; return () => { editorRef.current = null; }; }, [editor, editorRef])`
  - 簡素なツールバー（Bold / Italic / Strike / H2 / H3 / UL / OL / Quote / Code / Link）を `editor.chain().focus().toggleXxx().run()` で実装。**各 `<button>` に `disabled={disabled || !editor}` を付与**して視覚フィードバックを担保
  - `disabled` 状態の反映: `useEffect(() => editor?.setEditable(!disabled), [editor, disabled])`
  - 内側に `<EditorContent editor={editor} />`
- **理由:** `HtmlEditor` と Props を揃えることで `NoteEditor.tsx` の差し込みが最小化。`editorRef` でメディア挿入時のエディタコマンド呼出を可能に

### 5. NoteEditor.tsx に WYSIWYG ブランチ追加

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:**
  - 上部 import に `WysiwygEditor` と `useRef`, `import type { Editor } from "@tiptap/react"`（または `@tiptap/core`）を追加
  - `const tiptapEditorRef = useRef<Editor | null>(null);` を追加
  - `onMediaInsert` を WYSIWYG モード対応に拡張:
    ```ts
    const onMediaInsert = useCallback(
      (nextHtml: string, insertion: { id: string; url: string }) => {
        if (state.mode === "wysiwyg" && tiptapEditorRef.current) {
          tiptapEditorRef.current
            .chain()
            .focus()
            .setImage({ src: `/media/${insertion.id}`, alt: "" })
            .run();
          // onUpdate が走り contentHtml が同期される
          dispatch({ type: "mediaInsertionAdded", insertion });
        } else {
          dispatch({ type: "setContent", value: nextHtml });
          dispatch({ type: "mediaInsertionAdded", insertion });
        }
      },
      [state.mode],
    );
    ```
  - モード分岐: `state.mode === "wysiwyg"` 用ブロックを追加し、`<WysiwygEditor value={state.contentHtml} onChange={(v) => dispatch({ type: "setContent", value: v })} disabled={isPending} editorRef={tiptapEditorRef} />` + `<MediaUploader ... />` を並べる
  - JSDoc の "Out of scope" から `Full WYSIWYG (TipTap / Lexical, ADR-002)` を削除
- **理由:** 既存の `state.contentHtml` 単一ソース・autosave・editLock・submit を無改修で再利用する最小変更。メディア挿入は WYSIWYG モードでは TipTap エディタコマンド経由でカーソル位置に挿入（HTML モードは現行どおり末尾追記）

### 6. 既存テスト更新 + WYSIWYG サニタイザ整合の単体テスト追加

- **対象ファイル:**
  - `app/components/note/editor/__tests__/editorState.test.ts` (修正)
  - `app/components/note/editor/__tests__/wysiwygSanitizerIntegration.test.ts` (新規)
- **変更内容:**
  - `editorState.test.ts`:
    - 既存の `it("setMode no-ops on \`wysiwyg-disabled\`", ...)` テスト（L243-250）を **削除**
    - 代わりに `it("setMode transitions to wysiwyg", ...)` を追加し、`setMode("wysiwyg")` で `mode` が遷移し dirty を立てないことを確認
    - 型レベルで `EditorMode` が `"wysiwyg-disabled"` を含まなくなるので、影響箇所をすべて `wysiwyg` に書き換える
  - `wysiwygSanitizerIntegration.test.ts` (新規、jsdom 不要、軽量):
    - `Editor` を `headless` モードで構築（`new Editor({ extensions: [...], content: "...", element: undefined })`）。jsdom が要らない range の限定的な使い方
    - 以下を確認:
      1. StarterKit + Image + Link の出力 HTML（B/I/Strike/H2/UL/OL/Quote/Code/Link/Image）が `HtmlSanitizer.sanitize()` を通過後も同等の構造で残ること（`removed` が空であること）
      2. `editor.chain().setImage({ src: "/media/abc123", alt: "" }).run()` 後の `editor.getHTML()` が `src="/media/abc123"` を保持し、サニタイザの `MEDIA_ID_FROM_URL` 正規表現で `abc123` が抽出できること（ADR-009 整合）
    - jsdom 環境で動かない場合は **vitest の `environment: "happy-dom"` をテストファイル冒頭の `// @vitest-environment happy-dom` で指定**するか、それでも厳しい場合は最小ケース 1 件に縮小する
- **理由:**
  - 型変更に追従（既存テスト破壊を明示）
  - 受入条件 (2)「保存後 HTML がサニタイザを通過」と ADR-009「`/media/<id>` 形式維持」の自動回帰を1テストで担保する

### 7. ADR の記録

- **対象ファイル:** `.issue/9/adr.md` (新規), `.issue/1/adr.md`
- **変更内容:**
  - `.issue/9/adr.md` に以下を新規記載: ADR-001 (TipTap 選定), ADR-002 (内部リンク補完UIの後回し), ADR-003 (メディア挿入の連携方式)
  - `.issue/1/adr.md` の ADR-002 を `Status: Superseded by Issue #9` に更新（ファイル存在する場合のみ）
- **理由:** 設計判断の記録

### 8. 静的検証・テスト・ビルド

- **コマンド:**
  - `pnpm typecheck && pnpm lint:fix && pnpm format`
  - `pnpm test:unit`
  - `pnpm build` でクライアントバンドルが破綻しないことを確認
  - `pnpm deploy:staging:dry` で Workers バンドル(`dist/worker/`)が 1MB 圧縮以下であることを確認。さらに `dist/worker/` の内容を grep して **`prosemirror-*` や `@tiptap/*` モジュールが Workers バンドルに混入していない**ことを確認（混入していたら `"use client"` 境界違反）
  - `du -sh dist/client/_build/assets/` でクライアントバンドル増分を計測し、PR description に「導入前 → 導入後（差分）」で記載

---

## 設計判断

詳細は `.issue/9/adr.md` 参照。

- **ADR-001 TipTap を採用**: ユーザー指示。Lexical はAPIが命令型寄り・エコシステム浅、素 ProseMirror はセットアップコスト高。StarterKit が既存 `HtmlSanitizer` 許可リストとほぼ一致
- **ADR-002 内部リンク補完UIは別Issueへ**: タグ/ノート横断 suggest は (a) `@tiptap/extension-mention` + `@tiptap/suggestion`、(b) 候補取得 usecase の新設、(c) listNotesByOwner / tag 検索の再設計が必要で、本Issueスコープを大幅超過。受入条件にも含まれない
- **ADR-003 メディア挿入は WYSIWYG モード時のみ TipTap コマンド経由**: HTML モードは既存 `insertMediaIntoHtml` を維持。WYSIWYG モードは `editor.chain().focus().setImage({ src: "/media/<id>" }).run()` でカーソル位置挿入。`<img src="/media/<id>">` 形式を堅持してサニタイザの `MEDIA_ID_FROM_URL` と `MediaService.reconcileRefs` を破壊しない

---

## リスクと注意点

- **Cloudflare Workers バンドルサイズ**: TipTap + ProseMirror はクライアントバンドル側のみ（`"use client"` 配下）。Workers script-size 1MB には影響しないが、初回ページロードに 100KB 級の増分。`pnpm deploy:staging:dry` で `dist/worker/` を実測し PR description に記載。**Workers バンドルに `prosemirror-*` / `@tiptap/*` が混入していないこと**も grep で確認
- **RSC ハイドレーション**: TipTap の `useEditor` は `immediatelyRender: false` を必ず指定（v2 で React 19 RSC 互換のため必要）。これを怠ると hydration mismatch が発生
- **value 同期の無限ループ**: 外部 `value` 更新時に `setContent` を呼ぶが、`emitUpdate: false` を必須。さらに `editor.getHTML() !== value` の等価判定で skip
- **初回 HTML → WYSIWYG 切替でのサイレントデータロス（重要）**: StarterKit + Link + Image 範囲外のタグ（`<table>`, `<figure>`, `<mark>`, `<kbd>` 等）はサニタイザ通過済みでも TipTap が parse できず黙って落ちる。`setContent(..., { emitUpdate: false })` で初回は `state.contentHtml` 自体は変わらないが、**ユーザーが WYSIWYG モードで何か編集した瞬間に `editor.getHTML()` が新しい `contentHtml` となり、autosave が走って drop された要素が永久に失われる**（受入条件 (3) との衝突可能性）。既存ノートの大半は `<p>/<h*>/<ul>/<strong>` 主体なので実害は限定的だが、以下で軽減:
  - マニュアルテストに「table / figure / mark / kbd を含む HTML を作成 → WYSIWYG タブに切替 → そのまま編集 → HTML タブで内容差分を確認」を必ず含める
  - 完全防御（diff 警告 banner / 切替前確認ダイアログ）は本 Issue ではスコープ外。**将来 Issue として切り出す候補**として progress.md に記録
- **モード切替時のラウンドトリップ**: HTML モードで打った生 HTML → WYSIWYG タブ切替 → ProseMirror schema にマップ → HTML タブに戻すと整形される可能性。受入条件外なので警告は出さない（YAGNI）
- **既存テスト破壊**: `editorState.test.ts` L243-250 の `setMode no-ops on \`wysiwyg-disabled\`` テストは削除必須（型レベルで `wysiwyg-disabled` リテラルが消えるためコンパイル不能になる）
- **`onMediaInsert` での editorRef null**: `tiptapEditorRef.current === null`（エディタ未マウント等）の場合、WYSIWYG モードでも HTML 末尾追記の else ブランチに落ちる。エディタは外部 value 同期で末尾追記の `<img>` を取り込むので動作はするが、カーソル位置でなく末尾になる。`MediaUploader` 自体を `<MediaUploader disabled={state.mode === "wysiwyg" && !tiptapEditorRef.current} />` で抑止することも検討（実装時に判断、副作用なければ採用）

---

## テスト方針

### 単体テスト（修正のみ）

- `editorState.test.ts`: `EditorMode` 型変更に追従。`setMode` での `wysiwyg` 切替テストを追加
- `WysiwygEditor` 本体は React + ProseMirror jsdom 統合のセットアップコストが高いためテスト対象外。マニュアルテストで担保

### 既存テストの非破壊性

- `mediaInsert.test.ts` / `autosaveLogic.test.ts` / `editLockLogic.test.ts` は contentHtml 文字列に依存しているのみで影響なし

### 静的検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`

### マニュアルテスト

- `testing.md` 参照。WYSIWYG タブ切替、文字入力、太字/H2/リスト/リンク、メディア挿入、autosave、明示保存、HTML ↔ WYSIWYG ラウンドトリップ

### バンドルサイズ確認

- `pnpm build` 成功 + `pnpm deploy:staging:dry` で `dist/worker/` サイズが 1MB 圧縮以下

---

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○ | × | △ |
| 取り込んだ点 | TipTap 選定の比較理由、`/media/<id>` 形式維持、`immediatelyRender: false`、Tableのリスク言及、ADR-002 Superseded 更新、バンドルサイズ確認手順 | 既存テスト方針の踏襲（薄い React UI テスト）、`editorState.test.ts` の更新方針 | メディア挿入連携の最小化方針（WYSIWYG モード時のみ TipTap コマンドに分岐）、内部リンク補完UIの完全後回し判断、Image を `inline: false, allowBase64: false` で設定 |

エージェント2の `extensions/` ディレクトリ集約・シリアライザ抽出は将来性として有用だが、Issue スコープ（受入条件3つ）から見ると過剰設計のため見送り。シンプルな単一 `WysiwygEditor.tsx` 内に拡張配列を持たせ、必要になった時点で抽出するアプローチを採用。

---

## レビュー反映

### 修正した点

- **[実現可能性 P-001]**: Step 6 に「既存テスト `editorState.test.ts` L243-250 の `setMode no-ops on \`wysiwyg-disabled\`` を **削除**」を明示。代わりに `setMode wysiwyg` 遷移テストを追加
- **[実現可能性 P-002]**: Step 4 の Props 型を `React.MutableRefObject` → `React.RefObject<Editor | null>` に変更。`import type { Editor } from "@tiptap/react"` で統一
- **[実現可能性 P-003]**: Step 4 の `editorRef` 連携 useEffect に null フォールバック（`editor ?? null`）と早期 return ガードを明示
- **[実現可能性 P-004]**: Step 4 で TipTap v2.11+ のオブジェクト形式 `setContent(value, { emitUpdate: false })` を採用することと、`package.json` で `^2.11.0` 以上を指定することを明記
- **[実現可能性 P-005] + [カバレッジ S-001/S-002]**: Step 6 に新規テストファイル `wysiwygSanitizerIntegration.test.ts` を追加。`HtmlSanitizer.sanitize()` 通過と `/media/<id>` 形式保持を自動回帰
- **[実現可能性 P-006]**: 「リスクと注意点」に「初回 HTML → WYSIWYG 切替でのサイレントデータロス」を新規セクションで詳述。マニュアルテストに該当動線を追加
- **[実現可能性 P-007]**: 「リスクと注意点」に `onMediaInsert` での `editorRef null` 時の挙動を明示
- **[実現可能性 S-002]**: Step 8 で `dist/worker/` 内に `prosemirror-*` / `@tiptap/*` が混入していないかの grep 確認を追加
- **[実現可能性 S-006] + [カバレッジ S-003]**: Step 3 で Tab 型から `disabled?` / `title?` フィールド自体を撤去。Step 4 でツールバーボタンに `disabled={disabled || !editor}` 付与を明示
- **[カバレッジ P-001]**: ADR-002 を拡張し、内部リンク補完UIの「比較検討内容」を Context に追記（次のセクションで実施）
- **[カバレッジ P-002]**: ADR-001 に「評価結果」セクションを追加（次のセクションで実施）

### 取り込んだ改善提案

- **[カバレッジ S-001/S-002]**: WysiwygEditor の sanitizer 通過＋`/media/<id>` 保持テストを 1 ファイルに集約して追加
- **[カバレッジ S-003]**: Tab 型から disabled?/title? を撤去
- **[実現可能性 S-002]**: Workers バンドル混入チェック
- **[実現可能性 S-004]**: 既存ノートでの未対応タグ問題のマニュアルテスト動線を明示
- **[実現可能性 S-006]**: ツールバーボタンに `disabled` 属性

### 見送った提案とその理由

- **[実現可能性 S-001] tsgo 互換性の早期スパイク**: 実装時に `pnpm typecheck` で初期確認するだけで十分。問題が出たら ADR に追記
- **[実現可能性 S-004] バンドルサイズ定量基準（再検討閾値の事前設定）**: 受入条件には数値目標がなく、PR description で実測値を提示することで判断委ねる方針を維持
- **[カバレッジ S-004] 未対応タグ parse 損失の検出ガード**: 「リスクと注意点」に「将来 Issue として切り出す候補」と記載済み。本 Issue では実装しない（YAGNI、受入条件外）
