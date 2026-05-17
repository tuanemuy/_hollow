# 残存課題 — Issue #9

## 1. `pnpm deploy:staging:dry` の pre-existing 失敗（本 Issue 外）

### 内容
`pnpm deploy:staging:dry` が `@vitejs/plugin-rsc` の virtual モジュール (`tanstack-start-manifest:v` / `tanstack-start-injected-head-scripts:v`) 解決エラーで失敗する。

### 原因と影響
- main ブランチでも同様に再現する pre-existing バグ
- 本 Issue の TipTap 導入とは無関係
- testing.md のバンドルサイズ・Workers バンドル混入チェック手順のうち、`dist/worker/` を生成する経路が現状実行不可

### 適用した回避策
- クライアントバンドル (`dist/client/assets/*.js`) を直接 grep して TipTap / ProseMirror が混入していないことを確認 → **混入なし**を確認済み
- SSR バンドル (`dist/server/assets/NoteEditor-*.js`) には RSC アーキテクチャ上 TipTap が含まれるが、Workers script-size 1MB 制限に対し gzip 201KB（全体 977KB）で余裕あり

### フォローアップ
- `deploy:staging:dry` の失敗自体は別 Issue として起票候補
- 本 Issue では PR 作成時に「クライアントバンドル混入なし、SSR バンドルサイズ実測値」を description に記載することで代替

---

## 2. TipTap v3 採用（plan.md は v2.11+ を指定していた）

### 内容
plan.md および ADR-001 は当初 TipTap v2.11+ を前提としていたが、`pnpm add` の peer dep 解決の結果 v3.23.4 に統一された（adr.md ADR-004 参照）。

### 影響
- v3 でも plan が要求する `setContent(value, { emitUpdate: false })` のオブジェクト形式と `immediatelyRender: false` をサポート
- StarterKit v3 は Link を同梱するため `StarterKit.configure({ link: false })` で無効化し、`@tiptap/extension-link` を別途構成する処置を実装
- 実装側で受入条件 (1)(2)(3) はすべて満たされており、機能影響なし

### フォローアップ
不要（ADR-004 で記録済み）

---

## 3. StarterKit 範囲外タグのサイレントデータロス

### 内容
plan.md「リスクと注意点」に記録した既知リスク。`<table>`, `<figure>`, `<mark>`, `<kbd>` 等は WYSIWYG モードに切替えて編集すると autosave で永久に失われる。

### 適用した回避策
- testing.md のエッジケース #1 でマニュアルテスト動線に追加済み
- 既存ノートの大半は `<p>/<h*>/<ul>/<strong>` 主体で実害は限定的

### フォローアップ
- 将来 Issue 候補: 「WYSIWYG モード切替時に未対応タグを検出して警告 banner を出す」
- 本 Issue では実装しない（受入条件外、YAGNI）

---

## 4a. value 同期 effect の正規化副作用（FE-W-004 への対応として）

### 内容
WYSIWYG モード時、TipTap parse 正規化で `editor.getHTML() !== value` の状態が生じうる。`setContent` の自己発火は `lastEmittedHtmlRef` で抑止しているが、TipTap が初回 parse で構造正規化（例: `<li>plain</li>` → `<li><p>plain</p></li>`）した場合、`value` prop は古いまま editor 内が正規化済みになる短い期間が存在する。

### 適用した回避策
- `lastEmittedHtmlRef` を入れて `onUpdate` の自己発火経路を遮断
- 初回マウントで `onChange` が呼ばれない（TC-008 観察事象）ことを `wysiwygEditorOnChange.test.tsx` で自動回帰

### フォローアップ
- カーソルリセットの副作用は受入条件外、`WysiwygEditor.tsx` の JSDoc で文書化済み
- 将来 Issue 候補: モード切替時に未対応タグ検出 → warning banner（FE-W-006 と同根）

---

## 4. メディアアップロード（dev 環境では R2 未バインド）

### 内容
TC-005 / TC-006（WYSIWYG / HTML モードでのメディアアップロード）は dev 環境でアップロード経路が完走できない（`presignMediaUploadFn` が HTTP 500）。

### 原因
- `app/core/application/di/serverCloudflare.ts:142-184` の `createRequestContainer` が `objectStorage` を wiring していない
- `wrangler.toml` (dev) に R2 バインドが無い
- 本 Issue 起因ではなく、事前からの dev 環境制約

### 適用した回避策
- WYSIWYG モードでの `setImage` 経由カーソル位置挿入は別検証（TipTap headless テスト + manual-test の別ステップ）で PASS を確認
- HTML モードの `insertMediaIntoHtml` ユニットテスト 20 ケース PASS、分岐コード不変を確認

### フォローアップ
- ステージング環境（R2 バインドあり）でメディア挿入の end-to-end 動作確認を再実施
- これは Issue #9 のスコープ外の dev 環境課題

---

## 5. 内部リンク補完 UI（タグ・ノート横断 suggest）

### 内容
Issue 本文の「スコープ」に「内部リンク補完 UI も同時検討」と記載されていたが、ADR-002 で本 Issue 外と判断。検討内容は ADR-002 に記録済み。

### フォローアップ
- 別 Issue として起票候補（Phase 4 で実施）: 「P12 内部リンク補完 UI（タグ・ノート横断 suggest）」
- スコープは ADR-002 の「実装方式の評価」表を参照
