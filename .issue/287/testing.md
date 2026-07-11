# 動作確認計画 — Issue #287: inline モード: メディア挿入直後の `<img>` 単体ラッパを編集可能にする

**Issue:** #287
**作成日:** 2026-07-11

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。変更は `app/components/note/editor/InlineEditor.tsx` のフロントエンドのみで、DB スキーマ変更はなし。

### 検証環境の起動

本 Issue の確認はメディアアップロード（presign / finalize の server-function mutation + presigned PUT）を含むため、`pnpm dev`（vite, :3000）は使えない:

- 管理系 mutation が CSRF 403 になる
- presigned アップロードフローは `:8787` same-origin 前提でしか完走しない（`docs/runtime_cloudflare.md`「ローカルでの presigned フロー」）

必ず以下で起動する:

```bash
pnpm build:local && pnpm start   # wrangler dev on http://localhost:8787
```

- `pnpm build:local`（dev エントリ選択）が必須。素の `pnpm build` だと R2 dev プロキシが載らずアップロードが完走しない
- ブラウザは必ず `http://localhost:8787` 表記でアクセスする（`127.0.0.1` は presign オリジン不一致で 403）
- ポートは 8787 固定であること（別ポートへフォールバックしたら 8787 を空けて起動し直す）

DB スキーマが未適用なら:

```bash
pnpm db:migrate
```

ログイン用の管理ユーザー＋セッションを投入（冪等）:

```bash
pnpm seed:dev-admin
```

出力されるセッショントークンを cookie `__Host-session` として注入する（Secure 必須のため `document.cookie` 不可。agent-browser なら `agent-browser cookies set "__Host-session" "<token>" --url http://localhost:8787 --path / --secure --sameSite Lax`）。

型・lint・format の事前確認（CLAUDE.md「After changes」ルール）と自動テスト（本 Issue の pin テストを含む）:

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
pnpm test:unit
```

### デプロイ方法

なし（ローカル検証環境のみで確認できる）。

---

## 前提データ

編集可能な既存ノートが 1 件必要（`inline` モードは既存ノート編集面 `surface === "edit"` にのみ存在する）。

1. `http://localhost:8787` にアクセスしてログイン済み状態であることを確認する
2. 既存ノートが無ければ新規作成する: ノート一覧 → 新規作成（`/notes/new`）→ タイトルと本文（段落テキスト 1〜2 行）を入力 → 保存
3. ノート詳細 → 「編集」（`/notes/{noteId}/edit`）で開くと、編集モードタブ（「ビジュアル」「WYSIWYG」「HTML」）のうち **「ビジュアル」（= inline モード）がデフォルト選択**で開く
4. メディア挿入の操作経路: 本文エディタ下部の `MediaUploader` ドロップゾーン（「画像・動画をドラッグ&ドロップ またはクリックして選択」）に画像ファイル（PNG/JPEG 等、上限サイズ内）をドロップまたはクリック選択する。アップロード進捗バー → 「ノートに挿入しました」の表示後、本文末尾に `<p><img src="/media/<id>" alt=""></p>` が追記される

AC-5 / エッジケース用に、HTML モードで以下の本文を持つノートも 1 件用意する:

```html
<p>先頭の段落</p>
<ul><li><p>リスト内段落</p></li></ul>
<blockquote>直下テキスト<p>入れ子段落</p></blockquote>
<pre><code>code text</code></pre>
<p></p>
<table><tbody><tr><td><br></td></tr></tbody></table>
```

## 確認項目

### 1. メディア挿入直後の `<p><img></p>` が編集可能として decorate される

- **対応する受け入れ基準:** AC-1, AC-2
- **目的:** inline モードのメディア挿入経路（外部 `value` 変更 → resync rebuild）を通った直後に、追記された `<p><img></p>` に `contentEditable=true` が付与されること
- **手順:**
  1. 既存ノートを「編集」で開く（「ビジュアル」タブで開くことを確認）
  2. 本文下部のドロップゾーンから画像をアップロード挿入する
  3. 挿入された画像が本文末尾に表示されることを確認する
  4. DevTools の Elements で挿入された `<p>` を確認する
- **期待結果:**
  - 画像を包む `<p>` に `contenteditable="true"` が付いている
  - `<img>` 自身には `contenteditable` が付いていない
  - 画像の前後（`<p>` 内）をクリックするとキャレットが置ける
- **確認ポイント:** ページ再読み込みなし・挿入「直後」の resync rebuild 経路で decorate されていること（従来はここが編集不可だった）

### 2. 画像前後へのテキスト入力が rollback されず保存される

- **対応する受け入れ基準:** AC-3
- **目的:** decorate された `<p><img></p>` へのテキスト入力が MutationObserver に巻き戻されず、`<img>` 参照とテキスト双方を含む HTML が emit → 自動保存されること
- **手順:**
  1. 確認項目 1 の続きで、画像の直前をクリックしてテキスト（例: `before`）を入力する
  2. 画像の直後をクリックしてテキスト（例: `after`）を入力する
  3. 保存ステータス表示を観察する
- **期待結果:**
  - 入力した文字が即座に巻き戻らずに残る
  - 画像が消えたり移動したりしない
  - 保存ステータスが「保存中... → 保存済み」に遷移する（自動保存が発火）
- **確認ポイント:** IME（日本語かな漢字変換）での入力・確定でも巻き戻らないこと

### 3. 保存 round-trip: `contenteditable` の非漏出とメディア参照の維持

- **対応する受け入れ基準:** AC-4
- **目的:** emit・保存された HTML に編集用 `contenteditable` 属性が漏れず、`/media/<id>` 参照が維持されること
- **手順:**
  1. 確認項目 2 の編集後、保存完了を待つ（または「保存」ボタンを押す）
  2. ノート詳細（読み取り専用ビュー）に戻り、表示を確認する
  3. ページを再読み込みして再度表示を確認する
  4. 再度「編集」で開き、「HTML」タブに切り替えて生 HTML を確認する
- **期待結果:**
  - 読み取り専用ビューで画像と入力テキスト双方が表示される（画像は `/media/<id>` から正常にロード）
  - 再読み込み後も画像・テキストが残っている
  - HTML ソースに `contenteditable` が一切含まれない
  - `<img src="/media/<id>" alt="">` の参照が保たれている（孤児 purge 対象にならない形）
- **確認ポイント:** `<p><img ...>入力テキスト</p>` の構造が保たれていること

### 4. 既存 decorate 規則の回帰なし（inline モードの他ブロック）

- **対応する受け入れ基準:** AC-5
- **目的:** ゲート一般化（純粋コンテナ除外規則への置き換え）で既存の decorate 規則が変わっていないこと
- **手順:**
  1. 前提データの HTML モード作成ノート（リスト・blockquote・pre 入り）を「ビジュアル」タブで開く
  2. DevTools で各要素の `contenteditable` を確認し、実際に編集を試す
- **期待結果:**
  - `<li><p>リスト内段落</p></li>` — 内側 `<p>` は編集可、外側 `<li>` に `contenteditable` は付かない
  - `<blockquote>直下テキスト<p>入れ子段落</p></blockquote>` — `<blockquote>` と内側 `<p>` の両方が編集可
  - `<pre><code>` — 従来どおり編集可（Issue #285 の挙動維持、`Enter` でリテラル改行）
  - `<p></p>`（空段落）— `contenteditable="true"` が付く（本 Issue の一般化の副産物・意図どおり）
- **確認ポイント:** 段落・見出しなど通常ブロックの編集も従来どおり動くこと

## エッジケース・異常系

### 1. `<br>` プレースホルダ付き空ブロックへの入力（rollback の可能性）

- **目的:** plan.md リスク欄の懸念 — 空の `<td><br></td>` 等へ文字入力するとブラウザがプレースホルダ `<br>` を remove し、保守的バッチ rollback（ADR-003 #233）で 1 文字目が即座に巻き戻る可能性 — を実ブラウザで確認する
- **手順:**
  1. 前提データのノートの `<td><br></td>` セルをクリックしてキャレットを置く
  2. 文字を 1 文字入力し、直後の挙動を観察する
  3. 空段落 `<p></p>` でも同様に入力を試す
- **期待結果:**
  - 入力が残れば理想（改善）
  - 1 文字目が即座に巻き戻る場合も、従来（そもそも編集不可）からの**悪化ではない**ことを確認する。巻き戻りが起きる場合はフォローアップ Issue 化を判断する（plan.md リスク欄参照）
  - いずれの場合もセル/段落の構造（タグ）は壊れない

### 2. テキスト入力後の `<img>` Backspace 削除試行（snapshot 巻き戻り範囲）

- **目的:** Element の remove は rollback される既知制約（スコープ外）の確認と、rollback が最後の rebuild 時点の snapshot まで巻き戻るため入力済みテキストが道連れに消えないかの確認（plan.md リスク欄）
- **手順:**
  1. inline モードで画像の後ろにテキストを入力する（自動保存の「保存済み」表示を待たない）
  2. キャレットを画像直後に置き、`Backspace` で `<img>` の削除を試みる
- **期待結果:**
  - `<img>` は削除されず復元される（構造保持・仕様 C2-3 どおり。削除したい場合は HTML モード）
  - 直前に入力したテキストが DOM 上でどこまで巻き戻るかを記録する。最後の rebuild 以降の入力が丸ごと消える実害（挿入直後の編集が全て失われる体験）があれば、snapshot 追従の別 Issue 切り出しを判断する（plan.md リスク欄参照）

### 3. `<img>` をクリック選択して文字入力

- **目的:** ブラウザが選択中の `<img>` を入力文字で置換しようとする操作（Element remove を含む mutation）が rollback され、画像が失われないこと
- **手順:**
  1. inline モードで画像をクリックして選択状態にする
  2. そのまま文字を入力する
- **期待結果:** 画像は消えず復元される（入力は巻き戻る — 既知のトレードオフ）。エディタが以降も操作可能であること

## 既存機能への影響確認

- **`wysiwyg` モードの画像挿入（TipTap 命令経路）** — AC-6。同じノートを「WYSIWYG」タブに切り替え（装飾喪失の確認ダイアログが出たら内容を確認して続行）、ツールバーの画像ボタンまたはエディタ下部のドロップゾーンから画像を挿入 → カーソル位置に挿入され、編集・保存が従来どおり動くこと
- **`html` モードの画像挿入（htmlDraft 追記経路）** — AC-6。「HTML」タブで画像をアップロード → ソース末尾に `<p><img src="/media/<id>" alt="" /></p>` が追記されること
- **diff スコープ** — AC-6 の検証として、変更が `InlineEditor.tsx` + テストファイルのみに閉じていることを `git diff --stat` で確認
- **自動テスト** — `pnpm test:unit` で `inlineEditor.test.tsx`（AC-5 の既存 pin 含む）/ `mediaInsert.test.ts` / `noteEditorImageButtonWiring.test.tsx` / `wysiwygEditorImageButton.test.tsx` が green であること
- **編集ロック / disabled 状態** — 別タブで同じノートの編集を開くなどして disabled になったとき、`<p><img></p>` を含む全ブロックから `contenteditable` が外れて編集不可になること
- **モード切替の往復** — ビジュアル → HTML → ビジュアルと往復しても画像・テキストが保たれ、decorate が再適用されること
