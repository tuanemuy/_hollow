# 動作確認計画 — Issue #556: wikilink/hashtag 表示レンダリングの横展開とタグ導線

**Issue:** #556
**作成日:** 2026-06-08

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

表示レンダリングの変更を実サーバーで見るには、ビルドして wrangler dev で起動する（`docs/test.md` Manual / browser verification 準拠）:

```bash
pnpm build && pnpm start
```

> `pnpm dev`（vite dev）でも可。`pnpm dev` の D1 と `pnpm db:execute:local` / `pnpm seed:dev-admin` の書き込み先は同一ローカル D1。

スキーマ未適用なら先に:

```bash
pnpm db:migrate
```

### シードデータ

- 認証必須ルート（auth ノート詳細・過去版閲覧）の検証は seed スクリプトで管理者ユーザー + セッションを投入する:

  ```bash
  pnpm seed:dev-admin
  ```

- ノート本文・内部リンク・リビジョン・公開設定は SQL で直接投入する（`pnpm db:execute:local --file <sql>`）。確認には以下のデータが必要:
  - 本文に `[[wikilink]]`（解決済み = `note_internal_links.resolved_note_id` セット、未解決の両方）と `#hashtag` を含むノート
  - 上記ノートを **public 公開**にしたもの（`/notes/public/$noteId` で開けること）
  - 解決先が **private なまま** の `[[wikilink]]` を含む公開ノート（公開ページからリンクが出ても踏むと NotFound になることの確認用）
  - 上記ノートのリビジョン（過去版）を 1 件以上（過去版閲覧の確認用）
  - 本文にコードブロック（`<pre><code>` 内に `#include` や `[[notlink]]`）を含むノート（誤変換されないことの確認用）

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. 公開ノート詳細の wikilink/hashtag レンダリング

- **目的:** 公開ノート詳細で `[[wikilink]]` がピル表示でリンク化され、`#hashtag` が accent 表示（非リンク）になること。auth 詳細との非対称が解消されること。
- **手順:**
  1. `[[解決済み wikilink]]` と `#tag` を含む public ノートを用意し、未ログイン状態で `/notes/public/$noteId` を開く
  2. wikilink のピルをクリックする
  3. hashtag の表示を確認する
- **期待結果:**
  1. `[[...]]` が surface ピル（アクセントドット付き）でリンク表示、`#tag` が accent 素テキスト（非リンク `<span>`）で表示される（生テキスト `[[...]]` / `#...` が残らない）
  2. wikilink が **`/notes/public/$noteId`**（公開ルート）に遷移する（auth ルート `/notes/$id` には飛ばない）
  3. hashtag はクリックできない（公開側は非リンク）
- **確認ポイント:** 公開ページから auth ルートへ匿名ユーザーが誘導されないこと。

### 2. 公開ノートの private wikilink は踏むと NotFound

- **目的:** 解決先が private なままの公開ノート wikilink がリンク表示されても、踏むと安全に 404 になり存在を露出しないこと。
- **手順:**
  1. 解決先ノートを private のまま残した `[[wikilink]]` を含む public ノートを開く
  2. その wikilink を踏む
- **期待結果:** `/notes/public/$id` が NotFound 表示（存在の有無も秘匿）になり、private ノートの内容・存在が露出しない。
- **確認ポイント:** リンク自体は出る（見た目は解決済み）が踏むと 404 という安全側 degrade。

### 3. auth ノート詳細の hashtag タグ絞り込み導線

- **目的:** auth ノート詳細の `#hashtag` がリンク化され、クリックでタグ絞り込み一覧に遷移し**実際に絞り込まれる**こと。
- **手順:**
  1. seed したユーザーでログインし、`#tag` を含むノートの詳細 `/notes/$noteId` を開く
  2. hashtag のリンクをクリックする
  3. 遷移先 URL とノート一覧の絞り込み状態を確認する
- **期待結果:**
  1. hashtag が `<a class="hashtag">` でリンク表示される
  2. クリックで home `/` に遷移し、URL が `?tagNames=["tag"]`（JSON 配列エンコード形式）になる
  3. ノート一覧が当該タグで**実際に絞り込まれている**（タグ未指定の全件 home に着地しない）
- **確認ポイント:** スカラー形式 `?tagNames=tag` だと絞り込みが黙って無効化される失敗モード。実際に絞り込まれることを必ず確認。

### 4. 過去版閲覧（リビジョン詳細）の wikilink/hashtag レンダリング

- **目的:** 過去版閲覧で `[[wikilink]]` / `#hashtag` がマークアップ化され、現行ノートの refs で解決リンク化されること。
- **手順:**
  1. ログイン状態で `[[wikilink]]` / `#tag` を含むノートの過去版（リビジョン詳細）を開く
  2. wikilink / hashtag の表示を確認する
- **期待結果:** 過去版本文の `[[...]]` がピル表示（現行 refs と一致すれば `/notes/$id` リンク・不一致なら未解決 `<span>`）、`#tag` がリンク表示（auth サーフェス）になる。生テキストが残らない。
- **確認ポイント:** 現行 refs と過去版トークンが一致しない場合に誤ったノートへ飛ばず、未解決表示に degrade すること。

## エッジケース・異常系

### 1. コードブロック内の誤変換なし（全サーフェス）

- **目的:** 公開・過去版でもコードブロック内の `#include` / `[[notlink]]` が変換されず、`CodeHighlight` と干渉しないこと。
- **手順:**
  1. コードブロック（`<pre><code>`）に `#include` / `[[notlink]]` を含むノートを public 公開し、`/notes/public/$noteId` と過去版で開く
- **期待結果:** コードブロック内のハッシュ・角括弧が生のまま表示され、シンタックスハイライトが正常に当たる。

## 既存機能への影響確認

- **auth ノート詳細（#549 既存）:** wikilink ピル・hashtag が #549 と同じ表示で、hashtag がリンク化されてもクリックで正しく絞り込まれること（後方互換）。
- **法務ページ:** `/legal/...` 等の静的本文が従来どおり表示され、変化がないこと（対象外・横展開していない）。
- **編集画面・export:** 保存 body（`contentHtml`）が verbatim のまま（`[[...]]` / `#...` が編集サーフェス・export で生テキストとして保持）であること。

## 確認チェックリスト

- [ ] 公開ノート詳細で wikilink がピル + public ルートへリンク、hashtag が非リンク accent 表示
- [ ] 公開ノートの private wikilink を踏むと NotFound（存在露出なし）
- [ ] auth ノート詳細で hashtag リンクをクリックすると `?tagNames=["tag"]` で実際に絞り込まれる
- [ ] 過去版閲覧で wikilink/hashtag がマークアップ化され、不一致時は未解決 degrade
- [ ] 全サーフェスでコードブロック内が誤変換されず CodeHighlight 干渉なし
- [ ] auth 詳細（#549 既存）・法務ページ・編集/export に退行なし
