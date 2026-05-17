# ADR — Issue #9: P12 本格 WYSIWYG エディタ導入 (TipTap)

## ADR-001: WYSIWYG エディタライブラリに TipTap を採用する

### Status
Proposed

### Context
P12 ノートエディタの WYSIWYG モードを本格実装するにあたり、ライブラリを選定する必要がある。候補は TipTap、Lexical、ProseMirror（生）。Issue 本文では「比較検討」と書かれているが、ユーザーから「TipTap を想定」と明示的に指示されている。

評価軸:
- React 19 / RSC 互換性
- Cloudflare Workers クライアントバンドルへの影響
- 既存 `HtmlSanitizer` 許可リストとのスキーマ整合（出力 HTML が round-trip すること）
- ProseMirror エコシステム上の拡張可能性
- ドキュメント・学習コスト

### Decision
**TipTap (v2 系) を採用する。**

具体パッケージ:
- `@tiptap/react` — React 19 互換の `useEditor` フック・`EditorContent` コンポーネント
- `@tiptap/pm` — ProseMirror 本体の peer 集約（重複排除）
- `@tiptap/starter-kit` — paragraph / heading (H1-6) / list / blockquote / codeBlock / bold / italic / strike / code / history / hardBreak / hr などの基本ノードをまとめて提供
- `@tiptap/extension-link` — `<a>` 用（`href`, `rel`, `target` をサニタイザ許可リストと整合）
- `@tiptap/extension-image` — `<img>` 用（`src`, `alt` のみ。`/media/<id>` 形式を維持）

採用しない比較対象:
- **Lexical** — Facebook 製で性能優位だが、命令型 API + 自前 Node 設計の学習コスト高、TanStack Start / RSC での採用事例が少ない
- **素の ProseMirror** — 設定の柔軟性は最大だがツールバー・拡張を一から書く必要があり、Issue スコープを超える

### Consequences
- 良い点:
  - StarterKit の生成する HTML（`<p>`, `<h1-6>`, `<ul>`, `<ol>`, `<li>`, `<blockquote>`, `<pre><code>`, `<strong>`, `<em>`, `<s>`, `<code>`, `<a>`, `<img>`）が既存 `HtmlSanitizer` 許可リストとほぼ一致 → 保存パイプラインを破壊しない
  - `useEditor` フックで宣言的に構成。RSC との境界は `"use client"` で明示
  - 拡張プラグイン経由で将来 Mention / Table / CodeBlockLowlight / Image-resize 等を追加可能
- トレードオフ:
  - クライアントバンドルに ~100KB gzip 級の増分（TipTap + ProseMirror core + 拡張3つ）。Workers script-size 1MB には影響しないが、初回ページロードは増える。`pnpm deploy:staging:dry` で実測して PR description に記載
  - StarterKit が解さないタグ（`<table>`, `<figure>`, `<mark>`, `<kbd>` 等）は parseHTML で落ちる可能性。既存ノートの大半は影響なしだが、リスクとして文書化

### 評価結果（Issue 本文「比較検討」「バンドルサイズ評価」「RSC 互換性検証」への回答）

**ライブラリ比較（要約）**:

| 観点 | TipTap | Lexical | 素 ProseMirror |
|------|--------|---------|----------------|
| React 19 互換 | ○ (`@tiptap/react`) | ○ (`@lexical/react`) | △ (自前統合) |
| 宣言的 API | ○ | × (命令型寄り) | × |
| StarterKit | ○ (既存サニタイザ許可と一致) | × (自前 Node 設計) | × |
| エコシステム | ○ (拡張群が豊富) | △ (FB 主導、新興) | ○ (基盤として最強だが低レイヤ) |
| 学習コスト | 低 | 中〜高 | 高 |
| **採否** | **採用** | 不採用 | 不採用 |

**バンドルサイズ影響評価（事前見積もり）**:
- 追加パッケージ:
  - `@tiptap/react` + `@tiptap/pm` + `@tiptap/starter-kit` + `@tiptap/extension-link` + `@tiptap/extension-image`
- 予想増分: ~100KB gzip（実測は PR 時に `pnpm build` 後の `dist/client/_build/assets/` を `du -sh` で計測）
- Workers script-size への影響: **ゼロ**（`"use client"` 配下なのでクライアントバンドルのみ。`pnpm deploy:staging:dry` の `dist/worker/` を grep して `prosemirror-*` / `@tiptap/*` が混入していないことを確認）
- 受入閾値: 数値目標は受入条件に無いが、200KB gzip 超えなら遅延ロード検討（本 PR では適用しない）

**React 19 RSC 互換性検証チェックリスト**:
- [x] `WysiwygEditor.tsx` に `"use client"` を明示
- [x] `useEditor({ immediatelyRender: false })` を必須設定（v2 で React 19 SSR 互換のため）
- [x] `useEditor` が return する `Editor` 型を `import type` で読み込み（実行時 import は client 配下に閉じる）
- [x] サーバーエントリ（`app/server.cloudflare.ts`）からは TipTap を一切 import しない
- [x] `<EditorContent>` は SSR 時に空 `<div>` を出すので hydration mismatch を起こさない
- [x] `editor.commands.setContent(value, { emitUpdate: false })` で外部 value 同期時の無限ループを抑止

---

## ADR-002: 内部リンク補完 UI (タグ・ノート横断 suggest) は本 Issue のスコープ外とする

### Status
Proposed

### Context
Issue #9 のスコープに「内部リンク補完 UI（タグ・ノート横断 suggest）も同時検討」と記載されている。一方、受入条件は (1) WYSIWYG タブが enabled になる、(2) 保存後 HTML がサニタイザ通過、(3) 自動保存と互換 — の3点のみで、補完 UI の完成度は受入条件に含まれない。

#### 検討（「同時検討」要件への回答）

**実装方式の評価**:

| 実装要素 | 概要 | 規模感 |
|---------|------|-------|
| TipTap 拡張 | `@tiptap/extension-mention` + `@tiptap/suggestion` を導入。`char: "[["` をトリガに設定して `[[...]]` 既存パターンと整合させる | バンドル増分 ~20KB gzip、設定ファイル ~50 行 |
| 候補取得 server fn | `searchInternalLinkTargetsFn`（noteTitle prefix + tagName prefix の和集合、自分のノートのみ）。usecase 層に `searchInternalLinkTargets` を新設 | application 層: ~80 行、server fn: ~30 行 |
| Repository クエリ | `noteRepository.searchByTitlePrefix(ownerId, query, limit)` と `tagRepository.searchByNamePrefix(ownerId, query, limit)` を adapter に追加（D1 LIKE クエリ） | adapter 層: ~60 行 × 2、テスト含む |
| 補完ポップアップ UI | 候補リスト表示、↑↓Enter/Esc、選択時 `[[note-title]]` を Mention ノードに置換 | React コンポーネント: ~120 行、@tiptap/suggestion の renderer 統合 |
| `[[...]]` ↔ Mention ノードの双方向変換 | parseHTML で `[[note-title]]` をテキスト → Mention ノードに変換する Input Rule、renderHTML で `<a href="/notes/<id>" data-internal-link="true">...</a>` を出力 | 拡張定義: ~80 行、ProseMirror Input Rule + parseHTML |
| 既存 `extractInternalLinkRefs` 整合 | サーバー側 `INTERNAL_LINK_PATTERN` は `[[...]]` テキストを対象。Mention ノードを出力後も `data-internal-link` 属性付き `<a>` に対するサーバー側パーサ追加が必要かも要検討 | 設計判断 1〜2 件、ADR 追加 |

**合計工数見積もり**: 別 PR 1〜2 件分（200〜500 行規模）

**バンドル増分予測**: `@tiptap/extension-mention` + `@tiptap/suggestion` で ~20KB gzip 追加。本 Issue の ~100KB に対し追加で 20% 増。

**スコープ判断の結論**:
- 候補取得・補完UI・ProseMirror Input Rule 拡張は、TipTap 本体導入とは独立した別軸の労力
- 既存 `[[note-title]]` テキストパターン → サーバー `INTERNAL_LINK_PATTERN` のバックリンク抽出ロジックを破壊しない最低限のサポートは、本 Issue でテキスト入力時に温存される（既存 HtmlEditor と同等の UX）
- よって本 Issue では「補完 UI 抽象レイヤすら導入しない」を選択。後続 Issue で全体を1パスで実装するほうがコードレビュー単位として自然

### Decision
**内部リンク補完 UI は本 Issue から除外し、別 Issue として後続切り出す。**

本 Issue では:
- `[[note-title]]` のプレーンテキスト入力は引き続きサポート（既存サニタイザが素通しするため動作変わらず）
- TipTap の `Link` 拡張で URL 形式の手動入力リンク（`/notes/<id>`, 外部 URL）はサポート

切り出す別 Issue:
- タイトル案: "P12 内部リンク補完 UI（タグ・ノート横断 suggest）"
- スコープ: `@tiptap/extension-mention` + `@tiptap/suggestion` 導入、候補取得 server fn、ポップアップ UI、`[[...]]` ↔ Mention ノードの双方向変換

### Consequences
- 良い点:
  - 本 PR の変更量を抑え、受入条件達成に集中できる
  - バンドル増分を最小限に保てる（`@tiptap/extension-mention` + `@tiptap/suggestion` ぶんを追加しない）
  - application 層の usecase 追加を別 Issue で独立検討できる
- トレードオフ:
  - ユーザーが内部リンクを入力する際はテキストで `[[...]]` か手動 URL を打つ必要がある（既存 HtmlEditor と同等の UX）

---

## ADR-003: メディア挿入は WYSIWYG モード時のみ TipTap エディタコマンド経由でカーソル位置に挿入する

### Status
Proposed

### Context
既存の `MediaUploader` はアップロード完了時に `insertMediaIntoHtml(state.contentHtml, { id })` を呼び、HTML 文字列の末尾に `<p><img src="/media/<id>" alt="" /></p>` を追記する設計（ADR-009 で `/media/<id>` 形式を必須化）。

WYSIWYG モードに移行する際、メディア挿入の連携方式に複数の選択肢がある:
1. WYSIWYG モードでも `insertMediaIntoHtml` で文字列追記し、外部 `value` 同期で TipTap に反映（最小変更だが、末尾追記固定で UX が劣る）
2. WYSIWYG モード時のみ TipTap の `editor.chain().focus().setImage(...).run()` を使ってカーソル位置に挿入（UX 改善、ただし NoteEditor 側の分岐が増える）
3. MediaUploader 自体を TipTap 認識化（再利用性が下がる、HTML モードへの影響）

### Decision
**選択肢 2 を採用する。**

実装:
- `WysiwygEditor.tsx` の Props に `editorRef?: React.MutableRefObject<Editor | null>` を追加
- `NoteEditor.tsx` で `useRef<Editor | null>(null)` を保持し、`<WysiwygEditor editorRef={tiptapEditorRef} />` で渡す
- `onMediaInsert` を:
  ```ts
  if (state.mode === "wysiwyg" && tiptapEditorRef.current) {
    tiptapEditorRef.current
      .chain().focus()
      .setImage({ src: `/media/${insertion.id}`, alt: "" })
      .run();
    dispatch({ type: "mediaInsertionAdded", insertion });
  } else {
    dispatch({ type: "setContent", value: nextHtml });
    dispatch({ type: "mediaInsertionAdded", insertion });
  }
  ```
- `MediaUploader` 本体には改修不要（`onInsert(nextHtml, insertion)` の `nextHtml` は WYSIWYG モードでは捨てられるが、HTML モード用に計算ロジックは残す）

`<img src="/media/<id>">` 形式は両モードで維持し、サニタイザの `MEDIA_ID_FROM_URL = /\/media\/([0-9a-z-]+)/i` と `MediaService.reconcileRefs` の保護を破壊しない。

### Consequences
- 良い点:
  - WYSIWYG モードでカーソル位置にメディアが挿入される自然な UX
  - HTML モードの既存挙動・テストを一切壊さない
  - `MediaUploader` / `mediaInsert.ts` には触らず、責任を `NoteEditor` の orchestrator 層に閉じ込める
  - `<img src="/media/<id>">` 形式の保護が両モードで担保される
- トレードオフ:
  - `NoteEditor` に `tiptapEditorRef` と分岐ロジックが入る（条件分岐は1箇所のみで局所的）
  - `MediaUploader.onInsert` で `nextHtml` を毎回計算するが WYSIWYG では捨てられる（負荷は無視できる小ささ）

---

## ADR-004: TipTap のバージョンを v3.23.x で統一する（plan.md の v2.11+ 指定からの変更）

### Status
Accepted

### Context
plan.md / レビューメモは `@tiptap/react@^2.11.0` を指定していた（`setContent(content, { emitUpdate: false })` のオブジェクト形式シグネチャが v2.11+ で利用可能なため）。

実装時 `pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image` を実行したところ、各パッケージのデフォルト解決バージョンが以下のように **混在**した:

- `@tiptap/react`: 2.27.2（v2 系の最終）
- `@tiptap/pm` / `@tiptap/starter-kit` / `@tiptap/extension-link` / `@tiptap/extension-image`: 3.23.4

`@tiptap/react@2.x` の peer dependency は `@tiptap/core@^2.7.0` / `@tiptap/pm@^2.7.0` で、v3 系コアと組み合わせると pnpm が「unmet peer dependency」を警告し、ランタイムでも `@tiptap/core` の二重ロードや API 差で破綻する懸念があった。

選択肢:
1. すべて v2 系に揃える（`@tiptap/starter-kit@^2`, `@tiptap/extension-image@^2` 等を明示指定）
2. すべて v3 系に揃える（`@tiptap/react@^3` にアップグレード）

### Decision
**選択肢 2: すべて v3.23.x に揃える。**

理由:
- v3 系も `setContent(content, options)` のオブジェクト形式シグネチャを持つ（型定義 `SetContentOptions` を確認: `emitUpdate?: boolean`, `parseOptions?: ParseOptions`, `errorOnInvalidContent?: boolean`）。plan.md が v2.11+ を要求した本質（`emitUpdate: false` の指定）は v3 でも満たされる
- v3 系の `useEditor` も `immediatelyRender: false` をサポート（型定義に明示）
- v3 系の StarterKit は Link を **既定で同梱**する（v2 では別パッケージ）。本実装では `StarterKit.configure({ link: false })` で無効化し、別途 `@tiptap/extension-link` を明示構成して `openOnClick: false` / `rel="noopener noreferrer"` 等のセキュリティ属性を制御
- StarterKit が Image を含まない点は v2 / v3 共通。`@tiptap/extension-image` の追加は引き続き必要
- React 19 サポートも v3 系で問題ない（依存ツリーが Tiptap → React 19 ピアを許容）

`package.json` の最終バージョン指定:
```
"@tiptap/react": "^3.23.4"
"@tiptap/pm": "^3.23.4"
"@tiptap/starter-kit": "^3.23.4"
"@tiptap/extension-link": "^3.23.4"
"@tiptap/extension-image": "^3.23.4"
```

### Consequences
- 良い点:
  - peer dependency 警告ゼロ、`@tiptap/core` が単一ロード
  - StarterKit v3 が含む `gapcursor` / `dropcursor` / `trailingNode` / `undoRedo` 等の改善を自動で享受
  - v3 系は今後のメンテナンス対象なので長期保守性が良い
- トレードオフ:
  - plan.md / レビューメモの記述（`"@tiptap/react": "^2.11.0"`）と差分が発生。本 ADR で正規化
  - StarterKit と extension-link の二重登録に注意（`StarterKit.configure({ link: false })` で対処済み）

---

## ADR-005: WYSIWYG サニタイザ整合テストの実行環境に happy-dom を採用する

### Status
Accepted

### Context
Step 6 の `wysiwygSanitizerIntegration.test.ts` は TipTap の headless `Editor` を構築して `getHTML()` の出力を `HtmlSanitizer.sanitize()` に通す。TipTap v3 の `Editor` クラスは内部で `document` / `window` のグローバルを参照する（ProseMirror の DOM Parser / Serializer 経路）ため、Vitest の既定 `environment: "node"` では構築自体が失敗する。

plan.md は「jsdom 環境が必要なら `// @vitest-environment happy-dom` の指定を試す。happy-dom も使えなければ jsdom を試す」と記載している。

### Decision
- `happy-dom` を devDependencies に追加し、当該テストファイルの先頭に `// @vitest-environment happy-dom` を付与
- 既定の `node` 環境はそのまま維持（他のユニットテストは DOM を必要としない）

happy-dom を採用した理由: jsdom より軽量で、TipTap / ProseMirror が必要とする DOM API（`document`, `DOMParser`, `Node`, `Range`, `Selection`）を十分カバーする。Vitest 公式も推奨候補に挙げている。

### Consequences
- 良い点:
  - 既存テスト基盤を壊さない（ファイル単位のオプトインのみ）
  - jsdom より軽量で CI 時間への影響が小さい
- トレードオフ:
  - 新規 devDependency が 1 件増える（happy-dom）
  - 将来 WYSIWYG 周りのテストを増やす際は同様に `@vitest-environment happy-dom` を付与する必要がある
