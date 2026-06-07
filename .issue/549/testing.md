# 動作確認計画 — Issue #549: P11 ノート詳細 backend 拡張

**Issue:** #549
**作成日:** 2026-06-07

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

ノート詳細表示のレンダリング変更を実サーバーで見るには、ビルドして wrangler dev で起動する（`docs/test.md` Manual / browser verification 準拠）:

```bash
pnpm build && pnpm start
```

> `pnpm dev`（vite dev）でも可。`pnpm dev` の D1 と `pnpm db:execute:local` / `pnpm seed:dev-admin` の書き込み先は同一ローカル D1。

スキーマ未適用なら先に:

```bash
pnpm db:migrate
```

### シードデータ

認証必須ルート（ノート詳細は auth 画面）の検証は seed スクリプトで管理者ユーザー + セッションを投入する:

```bash
pnpm seed:dev-admin
```

ノート本文・バックリンク・内部リンクは SQL で直接投入するのが速い（`pnpm db:execute:local --file <sql>`）。確認には以下のデータが必要:

- 本文に `[[wikilink]]`（解決済み = `note_internal_links.resolved_note_id` セット、未解決の両方）と `#hashtag` を含むノート
- そのノートを参照する別ノート（バックリンク用）。referrer は**ルート直下**と**多階層ディレクトリ配下**の両方を用意し、`backlink-meta` のディレクトリパス表示（空/多段）を確認
- 本文にコードブロック（`<pre><code>` 内に `#include` や `[[notlink]]`）を含むノート（誤変換されないことの確認用）

セッション cookie は `__Host-session`（Secure 必須）のため、seed が出力するトークンを CDP 経由で注入:

```bash
agent-browser cookies set "__Host-session" "<token>" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. wikilink のピル表示とリンク遷移

- **目的:** 本文の `[[wikilink]]` が surface ピル + 先頭アクセントドットで表示され、解決済みは note 詳細へ遷移すること。
- **手順:**
  1. seed + SQL で解決済み `[[...]]` を含むノートを用意し、詳細ページを開く。
  2. 本文中の wikilink の見た目を main モック（`spec/design/pages/P11-note-detail.html` の `.wikilink`）と並べて確認。
  3. wikilink をクリックして対象ノート詳細（`/notes/$noteId`）へ遷移することを確認。
- **期待結果:** `.wikilink` クラスの `<a>` が surface 背景ピル + `::before` アクセントドット、hover で下線なし。クリックで対象ノートへ。
- **確認ポイント:** 既存 `.note-detail-content a`（accent + 下線）に負けて下線が出ていないか。

### 2. hashtag の accent 表示

- **目的:** 本文の `#hashtag` が accent 色の素テキスト（初期実装では非リンク `<span>`）で表示されること。
- **手順:**
  1. `#tag` を含むノートの詳細ページを開く。
  2. `#hashtag` の表示をモック（`.hashtag`）と照合。
- **期待結果:** `.hashtag` クラスで accent 色。タグ絞り込みルートは未提供のため非リンク。
- **確認ポイント:** `#` を含むがタグでない箇所（コード内など）が誤って色付けされていないか。

### 3. バックリンクカードのディレクトリパス meta 行

- **目的:** バックリンクカードに `backlink-meta`（uppercase ディレクトリパス）+ title + snippet の 3 段が出ること。
- **手順:**
  1. 多階層ディレクトリ配下の referrer を持つノートの詳細ページを開く。
  2. バックリンクカードの meta 行（例: `RESEARCH / 書籍要約`）をモックの `.backlink-meta` と照合。
- **期待結果:** title 上にディレクトリパスが `/` 連結 + uppercase（CSS 由来）で小さく表示。
- **確認ポイント:** ルート直下の referrer では meta 行が出ない（空 segments 非表示）こと。

## エッジケース・異常系

### 1. コードブロック内の誤変換なし

- **目的:** `<pre>`/`<code>` 内の `#include` / `[[notlink]]` がタグ/wikilink 化されないこと。
- **手順:** コードブロックを含むノート詳細を開く。
- **期待結果:** コード内はプレーンのまま。`CodeHighlight` のハイライトも正常に動作し、wikilink/hashtag 要素と干渉しない。

### 2. 未解決 wikilink

- **目的:** `resolved_note_id` が無い `[[title]]` が非リンク（broken 表示）になること。
- **手順:** 未解決リンクを含むノート詳細を開く。
- **期待結果:** ピル風だがリンクではない（クリックで遷移しない）。

## 既存機能への影響確認

- 編集画面（P12）でノート本文の `[[...]]`/`#...` が**生のまま**保持されている（保存 body verbatim 不変）。
- エクスポート（Markdown/HTML）で `[[...]]`/`#...` が textual のまま（export 不変）。
- 自動テスト: `pnpm test:unit && pnpm test:integration` が緑（特に `markdownConverter` verbatim / `htmlSanitizer` passthrough）。

## 確認チェックリスト

- [ ] wikilink が surface ピル + アクセントドットで表示・遷移する
- [ ] hashtag が accent 表示（非リンク）
- [ ] バックリンクカードに meta 行（多階層）が出る / ルート直下では出ない
- [ ] コードブロック内が誤変換されない・CodeHighlight と干渉しない
- [ ] 未解決 wikilink が非リンク
- [ ] 編集画面で本文が verbatim 保持
- [ ] export が textual のまま
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` 通過
- [ ] `pnpm test:unit && pnpm test:integration` 緑
