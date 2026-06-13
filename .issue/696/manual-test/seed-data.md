# Issue #696 ブラウザ検証用シードデータ

WYSIWYG モード切り替え（装飾消失警告ダイアログ）の動作確認に必要なシードデータの記録。

対象: `http://localhost:3000`（ローカル dev サーバー、D1 マイグレーション適用済み）

## 実行した準備作業

1. `pnpm seed:dev-admin` を実行し、開発用管理者アカウント + 有効セッションをローカル D1 に投入（冪等。既存の owned データは保持される）。
2. dev-admin（`owner_id = 01950000-0000-7000-8000-000000000001`）のディレクトリを確認。ルートディレクトリ `019e9845-7d00-76d2-9276-b1771d744df1`（depth 0）が存在することを確認し、テストノートの配置先に使用。
3. テストノート2件を D1 に直接 INSERT（`wrangler d1 execute hollow-local-d1 --local --file`）。`notes.directory_id` は NOT NULL + FK(restrict) のため上記ルートディレクトリに紐付け。`id` は UuidV7Generator の検証パターン（version=7 / variant=[89ab]）に適合する固定値を使用。
4. INSERT 結果を SELECT で検証（slug `test-696-%` の2件が active で存在）。
5. 編集画面ルート `app/routes/_app/notes/$noteId/edit.tsx` の存在を確認。

既存データは上書き・削除していない（テストノートは新規 id のみ、INSERT 前の DELETE は同一 id に対する冪等化目的）。

## ログインアカウント情報

dev-admin の認証は **パスワードではなくセッション Cookie** で行う（`pnpm seed:dev-admin` はパスワードを発行しない）。

| 項目 | 値 |
|------|----|
| email | `dev-admin@example.com` |
| username | `dev-admin` |
| role | `admin`（active） |
| 認証方法 | セッション Cookie の注入 |
| Cookie 名 | `__Host-session` |
| Cookie 値（token） | `dev-admin-session-token` |

`__Host-session` は Secure-only のため `document.cookie` では設定できない。CDP / agent-browser 経由で注入する:

```
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:3000 --path / --secure --sameSite Lax
```

注入後 `http://localhost:3000/` にアクセスすれば dev-admin として認証済み。

## 投入したノート

owner: dev-admin / directory: ルート（`019e9845-7d00-76d2-9276-b1771d744df1`）/ status: active / version: 0 / front_matter: `{}`

### (a) WYSIWYG 非対応タグを含むノート

| 項目 | 値 |
|------|----|
| ケース | (a) 非対応タグあり |
| noteId | `01960696-0000-7000-8000-000000000001` |
| title | `[test-696] WYSIWYG 非対応タグを含むノート` |
| slug | `test-696-unsupported` |
| 編集画面URL | `/notes/01960696-0000-7000-8000-000000000001/edit` |

contentHtml:

```html
<section><p>これはセクション内の段落です。</p></section><table><thead><tr><th>項目</th><th>値</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr></tbody></table><p>通常の<strong>段落</strong>も含みます。</p>
```

非対応タグ: `section`, `table`, `thead`, `tr`, `th`, `tbody`, `td`（いずれも `WYSIWYG_SUPPORTED_TAGS` に含まれない）。`detectUnsupportedTags` はアルファベット順で `[section, table, tbody, td, th, thead, tr]` を返すため、WYSIWYG タブ押下時に `role="alertdialog"` の警告が出るはず。

### (b) 対応タグのみのノート

| 項目 | 値 |
|------|----|
| ケース | (b) 対応タグのみ |
| noteId | `01960696-0000-7000-8000-000000000002` |
| title | `[test-696] 対応タグのみのノート` |
| slug | `test-696-supported` |
| 編集画面URL | `/notes/01960696-0000-7000-8000-000000000002/edit` |

contentHtml:

```html
<p>これは<strong>太字</strong>と<em>斜体</em>を含む段落です。</p><p><a href="https://example.com">リンク</a>も含みます。</p>
```

使用タグ: `p`, `strong`, `em`, `a`（すべて `WYSIWYG_SUPPORTED_TAGS` に含まれる）。WYSIWYG タブ押下で警告なしに即切り替わるはず。

## 設定した環境変数

このシード作業では新規の環境変数は設定していない（`pnpm seed:dev-admin` / `wrangler d1 execute --local` のみ使用）。dev サーバー起動に必要な `.dev.vars`（`SECRET_BOX_MASTER_KEY` 等）は既存セットアップに依存。

## 問題と対処

- `wrangler` が直接 PATH に無かったため `pnpm exec wrangler ...` で実行した。シードスクリプト自体は `pnpm seed:dev-admin` / `pnpm db:execute:local` 経由で正常動作。
- dev-admin にはパスワードが無いため、ブラウザ検証はセッション Cookie 注入で認証する（UI のログインフォームは使わない）。
