# シードデータ — Issue #556 ブラウザ検証

**作成日:** 2026-06-08
**サーバー:** http://localhost:3000（dev / ローカル D1）

## ログイン情報

- username: `dev-admin` / email: `dev-admin@example.com` / role: admin(active)
- セッション cookie（Secure-only のため CDP 注入が必要）:
  ```
  agent-browser --session <s> cookies set "__Host-session" "dev-admin-session-token" \
    --url http://localhost:3000 --path / --secure --sameSite Lax
  ```

## 投入ノート

| ノート | id | visibility | 本文トークン | 期待表示 |
|---|---|---|---|---|
| A（公開・wikilink+hashtag+code, owner=dev-admin＝auth ノートD 兼） | `01956000-0000-7000-8000-0000000000a1` | public | `[[ノートB]]`(→B解決済), `[[ノートC]]`(→C解決済/private), `#design`, `<pre><code>`内に`#include`/`[[notlink]]` | 公開: wikilink→`/notes/public/...`ピル, `#design`=非リンク。auth: `#design`→`/?tagNames=["design"]`リンク。code内は生 |
| B（公開・リンク先） | `01956000-0000-7000-8000-0000000000b1` | public | なし | 通常表示 |
| C（private・リンク先） | `01956000-0000-7000-8000-0000000000c1` | private | なし | 公開ルートで NotFound（存在秘匿） |
| A のリビジョン（旧版） | rev `01956000-0000-7000-8000-0000000000r1` / note `...a1` | — | `[[ノートB]]`(現行ref で解決), `[[古い参照]]`(現行ref に無し→未解決), `#design`, code内`[[notlink]]` | `[[ノートB]]`→ピル, `[[古い参照]]`=未解決`<span data-unresolved>` degrade, `#design`=auth リンク, code内は生 |

タグ `design`（id `...t1`）+ `note_tags` で A に紐付け済み（`#design` 絞り込みが実データを返す）。

## URL

- 公開ノートA詳細: `/notes/public/01956000-0000-7000-8000-0000000000a1`
- 公開ノートB詳細: `/notes/public/01956000-0000-7000-8000-0000000000b1`
- 公開ノートC（NotFound 期待）: `/notes/public/01956000-0000-7000-8000-0000000000c1`
- auth ノートA詳細: `/notes/01956000-0000-7000-8000-0000000000a1`
- 過去版詳細: `/notes/01956000-0000-7000-8000-0000000000a1/history/01956000-0000-7000-8000-0000000000r1`

## 過去版を開く UI 動線

ノート詳細 → 「⋯」メニュー（`NoteActionsMenu`）→「履歴」→ `/notes/$id/history` 一覧 → リビジョン行クリック。直リンクも可。

## 注意

- `pnpm db:execute:local <path>`（スクリプト末尾に `--file` 含むため `--file` 二重指定不可）。
- 公開ルートの NotFound は TanStack Start 仕様で HTTP 200 シェル内描画。本文・存在は露出しない。
- 本文は RSC でクライアント描画されるため、ピル/hashtag の実描画はブラウザでの確認が必須（curl 初期 HTML には出ない）。
- シード SQL: `/tmp/seed556.sql`（INSERT only / `OR IGNORE` で再実行安全）。
