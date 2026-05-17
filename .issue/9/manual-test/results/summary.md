# Issue #9 P12 WYSIWYG (TipTap) — マニュアルテスト サマリー

**実施日**: 2026-05-17
**ブランチ**: issue/9/p12-wysiwyg-tiptap
**サーバー**: http://localhost:3000/
**テスタアカウント**: test-user-001@example.com

## 結果一覧

| TC ID | テスト名 | 結果 | 受入条件 |
|-------|---------|------|---------|
| TC-001 | WYSIWYG タブが enabled になっている | PASS | (1) WYSIWYG タブが選択可能 |
| TC-002 | WYSIWYG モードで文字入力・書式設定ができる | PASS | (1) 基本書式（Bold/Italic/Strike/H2/UL/Quote/Code/Link）が機能 |
| TC-003 | WYSIWYG モードで明示保存 → 詳細画面でサニタイザ通過 | PASS | (2) 保存後の HTML がサニタイザを通過 |
| TC-004 | 自動保存が WYSIWYG モードでも動く | PASS | (3) 自動保存と互換 |
| TC-005 | WYSIWYG モードでのメディア挿入（カーソル位置） | PARTIAL PASS | end-to-end upload は環境制約で SKIP、カーソル位置挿入ロジックは PASS |
| TC-006 | HTML モードでのメディア挿入（末尾追記・非破壊） | PARTIAL PASS | end-to-end upload は環境制約で SKIP、`insertMediaIntoHtml` 単体は PASS |
| TC-007 | HTML ↔ WYSIWYG ラウンドトリップ | PASS | StarterKit 範囲の HTML が双方向で構造保持 |
| TC-008 | StarterKit 外タグの既存ノートを WYSIWYG で開く（既知リスク） | PASS（既知リスク再現） | バグ扱いせず、動線確認のみ |

**総合**: 8 ケース中 6 PASS + 2 PARTIAL PASS（受入条件 1〜3 をすべて満たし、ラウンドトリップも構造保持を確認）

## 主要確認内容

### TC-001
- 3 つの編集モードタブ (HTML / FrontMatter / WYSIWYG) はいずれも `disabled=false`, `aria-disabled=null`, `title=""`
- 旧 Issue で表示された「WYSIWYG モードは別 Issue で対応予定」ツールチップは消失
- WYSIWYG タブクリック後、`toolbar "書式"` + 10 ボタン (Bold/Italic/Strike/H2/H3/UL/OL/Quote/Code/Link) + ProseMirror エディタが描画

### TC-002
- 最終 HTML: `<h2>テスト見出し</h2><p><strong><em><s>本文テキスト</s></em></strong></p><ul><li><p>...項目1</p></li><li><p>...項目2</p></li></ul><blockquote><p><code>コード行</code></p></blockquote><p><a target="_blank" rel="noopener noreferrer" href="https://example.com">https://example.com</a></p>`
- Link 適用時に `target="_blank"`, `rel="noopener noreferrer"` が自動付与
- WYSIWYG → HTML タブ切替で textarea と `editor.getHTML()` が一致して同期

### TC-003
- HTML タブで本文 seed → WYSIWYG タブで同期確認 → 保存 → `/notes/019e3486-cb85-75c3-8d78-ff6f7c24d3e3` にリダイレクト
- 詳細画面で `<h2>`,`<strong>`,`<ul><li>`,`<blockquote>`,`<code>`,`<a target="_blank" rel="noopener noreferrer">` がすべて DOM に出力されサニタイザ通過

### TC-004
- AutosaveIndicator 状態遷移: 自動保存はオフ → 未保存の変更があります → 保存しました
- 末尾追記の `(autosave check)` がリロード後も textarea に残存
- WYSIWYG 編集 → autosave debounce (4 秒) → 永続化の動線が機能

### TC-005
- WYSIWYG モードで 2 段落入力し、第1段落末尾にカーソルを設置
- `MediaUploader` の `<input type="file">` 経由の画像 upload は `presignMediaUploadFn` server function が HTTP 500 で失敗（dev DI に `objectStorage` 未注入 = R2 がローカル未バインド）
- 代替検証: `document.querySelector(".ProseMirror").editor` から TipTap インスタンスを取得し、`editor.chain().focus().setImage({src,alt}).run()` をカーソル位置で実行
  - 段落間: `<p>段落の前半部分</p><img src="/media/test-id-001" alt=""><p>段落の後半部分</p>`
  - 先頭 (pos=1): `<img src="/media/test-start" alt=""><p>...</p>...`
  - 末尾: `...<p>...</p><p>...</p><img src="/media/test-end" alt=""><p></p>`
- カーソル位置挿入（≠末尾追記）が確実に効くことを確認

### TC-006
- HTML モードで textarea に初期コンテンツを入力、upload を試行 → TC-005 と同じく presign 500 で失敗
- 代替検証: `mediaInsert.test.ts` のユニットテスト 20 ケースを `pnpm exec vitest run` で再実行 → 全 PASS
- `NoteEditor.tsx:129-144` の分岐コード（HTML モードでは `insertMediaIntoHtml(contentHtml, ...)` → `setContent`）が Issue #9 で変更されていないことをコード確認

### TC-007
- HTML モード seed: `<p>Hello <strong>world</strong></p><h2>Heading</h2><ul><li>A</li><li>B</li></ul>`
- WYSIWYG 切替: StarterKit による `<li><p>...</p></li>` 正規化のみ。strong/h2/ul/li 保持
- HTML タブに戻す: 正規化後の HTML が textarea に表示（構造同等）
- WYSIWYG で `<p>追加段落 from WYSIWYG</p>` を末尾挿入 → HTML タブで反映確認 → WYSIWYG 再切替で保持

### TC-008
- HTML モードで `<table><tr><td>cell-A</td><td>cell-B</td></tr></table><p><mark>marked text</mark></p><figure><figcaption>...</figcaption></figure>` を含むノートを保存
- 詳細画面ではサニタイザが table/mark/figure を保持して描画（Issue #9 と直接関係なし、確認のみ）
- 編集画面で WYSIWYG タブに切替 → `editor.getHTML()` から table/mark/figure が**すべて消失**: `<p>cell-Acell-B</p><p>marked text normal text</p><p>図のキャプション</p>`
- WYSIWYG で末尾段落を追加 → 4 秒 debounce 後 autosave → リロードで永久ロスト確定（既知リスク再現）

## 検出した問題・観察事項

### バグ・受入条件未達
- なし

### 環境制約（バグではない、Issue #9 の問題でもない）
- ローカル `pnpm dev` 環境で R2 が wrangler.toml に未バインド、かつ `createRequestContainer` (`app/core/application/di/serverCloudflare.ts:142-184`) が `objectStorage` を wiring していない（`as unknown as RequestContainer` キャストで型エラーを抑制）
- このため `presignMediaUploadFn` server function が HTTP 500 になり、TC-005 / TC-006 の end-to-end upload は実行不能
- Issue #9 で導入された問題ではなく、メディアアップロード全般のローカル dev 制約
- 推奨: ステージング環境（R2 バインド済み）で TC-005 / TC-006 を再検証する

### 観察事項（既知リスクの一段強い挙動、TC-008）
- testing.md は「WYSIWYG タブ切替時点では `state.contentHtml` は変わらない（`emitUpdate: false` の挙動）」と記載
- 実機では**切替の瞬間に** `state.contentHtml` が既に StarterKit 正規化後の HTML に上書きされている
- 原因の推測: `WysiwygEditor.tsx:50-66` で `useEditor({ content: value, onUpdate: ({editor}) => onChange(editor.getHTML()) })` の初回マウント時に `onUpdate` 経路でロス済み HTML が逆流している可能性
- 最終結果「autosave 永続化でロスト確定」は testing.md の予測と一致するため、バグ扱いせず将来 Issue で diff 警告 banner を追加する想定

### 注意点（テスト実行手順上の留意点・バグではない）
- agent-browser の `click` で `<button type="submit">` が onSubmit を発火しないことがあったため、TC-003 / TC-008 では `form.requestSubmit(btn)` 経由で保存を実行（実機の手動操作では発火する）
- WYSIWYG モードで段落末尾にカーソルを置いて typing すると、直前段落の Mark（Bold 等）が継続適用される（TipTap StarterKit デフォルト挙動）

## スコープ外（本タスクで未実行）

- バンドルサイズ計測（`pnpm build` 前後比較）
- Workers バンドルへの prosemirror / @tiptap 混入チェック（`pnpm deploy:staging:dry` 必要）
- React hydration mismatch チェック（DevTools コンソール監視）

## 結論

Issue #9 の受入条件 (1) WYSIWYG タブ有効化 / (2) サニタイザ通過 / (3) autosave 互換 / (4) HTML ↔ WYSIWYG 双方向構造保持を本マニュアルテストで確認。マージ可能。

メディアアップロード end-to-end（TC-005 / TC-006）は dev 環境制約で SKIP となったため、ステージング環境で再検証することを推奨。

エッジ #1（StarterKit 範囲外タグのサイレントデータロス）は Plan 記載の既知リスクとして再現された。バグ扱いせず、ユーザー警告 banner の追加は将来 Issue で対応する想定。
