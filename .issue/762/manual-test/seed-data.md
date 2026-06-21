# Manual Test — Seed Data / Environment Setup (Issue #762)

**作成日:** 2026-06-21
**対象:** HTML 編集モードで本文を整形表示し保存時に minify する（`.issue/762/testing.md` 全確認項目 + エッジケース + 既存機能影響）

## 対象 DB について

操作対象はローカル D1（`hollow-local-d1`、`.wrangler/state/v3/d1`）のみ。リモート（staging / production）には一切触れていない。本番データへの影響なし。手動 SQL の直書きはせず、既存の seed スクリプト（`scripts/seed-dev-login.mjs`）を使用。検証用の SQL は読み取り専用。

## 実行した準備作業

| 手順 | コマンド | 結果 |
| --- | --- | --- |
| 1. `.dev.vars` 確認 | （既存ファイルあり） | コピー不要。既に存在し、必要キーが揃っている（後述）。 |
| 2. ローカル D1 マイグレーション適用 | `pnpm db:migrate` | `✅ No migrations to apply!`（既に最新。冪等で問題なし）。 |
| 3. ログイン可能なテストユーザー投入 | `node scripts/seed-dev-login.mjs`（= `pnpm` 直叩き相当） | 成功（idempotent）。`/login` フォームで実ログインできる member ユーザーを投入。 |
| 4. 投入確認（読み取りのみ） | `pnpm db:execute:local <verify.sql>` | users / accounts 各 1 行を確認（下記）。 |

> 注: `package.json` には `seed:dev-login` の npm script は無い（`seed:dev-admin` のみ）。本テストでは `node scripts/seed-dev-login.mjs` を直接実行する。

### マイグレーション

`pnpm db:migrate` = `wrangler d1 migrations apply hollow-local-d1 --local`。今回は適用済みで `No migrations to apply!`。Issue #762 はフロントエンド（エディタの整形/minify）変更が主で、DB スキーマ変更を伴わないため新規マイグレーションは無い。

## ログイン方法・テストアカウント情報

`seed-dev-admin`（セッション注入のみ）ではなく、**実 `/login` フォームでログインできる** `seed-dev-login` を使う。理由: 本テストは「ノートエディタを開いて HTML タブで本文を編集・保存する」一連のユーザー操作の検証であり、通常のログイン経路でセッションを張るのが自然なため。

| 項目 | 値 |
| --- | --- |
| ログイン URL | `http://localhost:3000/login` |
| email（ログイン識別子） | `dev-login@example.com` |
| password | `DevPassw0rd!2024` |
| username | `dev-login` |
| role | `member`（active: email_verified=1 / banned=0 / deleted_at=NULL） |
| user id | `01950000-0000-7000-8000-000000000010`（有効な UUIDv7） |
| account id | `01950000-0000-7000-8000-000000000011`（provider_id=`credential`） |

### ログイン手順（ブラウザ / agent-browser）

1. `pnpm dev` でサーバー起動（http://localhost:3000）— ※起動はメイン側で実施
2. `http://localhost:3000/login` を開く
3. email に `dev-login@example.com`、password に `DevPassw0rd!2024` を入力して送信
4. ログイン後、ノート一覧（`/notes` 等）へ遷移できればログイン成功

> セッションクッキーは `__Host-session`（Secure-only）。実フォームログインなのでクッキー注入は不要。POST を伴うため、後述の「ポート / CSRF」を満たすこと（vite の 3000 で完結するため通常は問題なし）。

### 投入確認結果（読み取り SQL の抜粋）

```
users:    id=01950000-...-000000000010, email=dev-login@example.com, username=dev-login,
          role=member, email_verified=1, banned=0, deleted_at=null
accounts: id=01950000-...-000000000011, user_id=01950000-...-000000000010,
          provider_id=credential
```

## 設定した環境変数（キー名のみ）

`.dev.vars` は**既存ファイルを利用**（新規コピー・追記なし）。含まれるキー:

- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SECRET_BOX_MASTER_KEY`
- `ADMIN_SETUP_TOKEN`
- `ADMIN_LLM_PROVIDER`
- `ADMIN_LLM_MODEL`
- `ADMIN_LLM_API_KEY`

本 Issue の検証（エディタの整形/minify・保存・モード往復）に追加の環境変数は不要。LLM / Speech 等の外部キーは本テストに関係しない。

## HTML タブ検証用ノートの作成手順

testing.md は「ある程度ネスト構造のある本文（見出し・リスト・段落・リンク・`<pre>`/`<code>`・内部リンク `[[...]]` を含む）を持つノート」を要求する。seed では用意できないため、**ログイン後に新規ノートを HTML タブで手入力 → 保存**して作る。

### エディタのモードタブ仕様（重要）

`app/components/note/editor/EditorModeSwitch.tsx` より:

- **新規作成（`/notes/new`）**: タブは **WYSIWYG / HTML** の 2 つのみ（`inline`「ビジュアル」タブは無い）。
- **既存ノート編集（`/notes/{noteId}/edit`）**: タブは **ビジュアル（inline）/ WYSIWYG / HTML** の 3 つ。

→ 確認項目1〜3・エッジケースは新規作成画面でも開始できるが、**確認項目5（HTML ⇄ WYSIWYG ⇄ inline 往復）は inline タブが必要なので、一度保存して編集画面（`/notes/{noteId}/edit`）で実施する**こと。

### 手順

1. ログイン後、`http://localhost:3000/notes/new` を開く（または一覧から「新規ノート」）
2. タイトルに `HTML整形テスト` などを入力
3. モードタブを **HTML** に切り替える（タブの `role="tablist"` aria-label=「編集モード」、ボタンラベルは「HTML」）
4. 「本文（HTML）」の `<textarea>` に下記のネスト構造を持つ本文を貼り付ける
5. 手動保存（保存ボタン）→ 保存後に編集画面 `/notes/{noteId}/edit` を開くと、ビジュアル / WYSIWYG / HTML の 3 タブで往復検証ができる

### 貼り付け用の検証本文（見出し・リスト・段落・リンク・pre/code・内部リンク `[[...]]` を網羅）

```html
<h2>検証用の見出し</h2>
<p>これは段落です。<a href="https://example.com">外部リンク</a> と <a href="https://example.org">隣接リンク</a> の語間スペースが保持されるか確認します。</p>
<h3>リスト</h3>
<ul>
  <li>項目その1</li>
  <li>項目その2
    <ul>
      <li>ネストした子項目</li>
    </ul>
  </li>
</ul>
<h3>コードブロック（ホワイトスペース有意）</h3>
<pre><code>function greet(name) {
    if (name) {
        return "Hello, " + name;
    }
    return "Hello";
}</code></pre>
<h3>内部リンク</h3>
<p>内部リンクのプレースホルダ [[別のノート]] が破壊されず保持されることを確認します。</p>
```

この本文には testing.md が要求する要素がすべて含まれる:

- 見出し（`<h2>`/`<h3>`）・段落（`<p>`）・リスト（ネストした `<ul>/<li>`）
- リンク（隣接する 2 つの `<a>` で語間スペース保持を確認 — AC-5）
- `<pre>/<code>` のインデント付きコード（ホワイトスペース有意 — AC-4）
- 内部リンク `[[別のノート]]`（プレースホルダ保持 — AC-6）

### 各確認項目での使い方の対応

- **確認項目1（整形表示）**: 上記を保存 → リロード → HTML タブに入ると、ブロックごとに改行・インデントされて `<textarea>` に表示される。
- **確認項目2・3（手動/自動保存で minify 永続化）**: HTML タブで一部編集 → 保存 →（自動保存は無操作で待つ）→ リロード前の DB/レスポンス上の `contentHtml` が改行・インデント無しの minified であること。`pnpm db:execute:local` で `SELECT content_html FROM notes WHERE ...` を読み取り確認可。
- **確認項目4（ホワイトスペース/語間/内部リンク保持）**: `<pre>/<code>` のインデント、隣接 `<a>` の語間スペース、`[[...]]` が往復で保持されること。
- **確認項目5（モード往復）**: 編集画面で inline ⇄ HTML、WYSIWYG ⇄ HTML を往復。整形由来の余分な改行/インデントが他モードに漏れないこと。
- **エッジケース1（壊れた HTML）**: HTML タブに `<div><p>未完成` のような閉じタグ欠落断片を入力 → 整形失敗でも `<textarea>` が空にならず編集継続できること。

## 問題・注意点

- **npm script 名**: `seed:dev-login` は `package.json` に未登録。`node scripts/seed-dev-login.mjs` を直接実行する（`seed:dev-admin` は script あり）。
- **新規作成画面に inline タブが無い**: 確認項目5（inline 往復）は必ず「保存後の編集画面」で行う。新規画面のみで完結させようとすると inline タブが見つからず詰まる。
- **ポート / CSRF（POST 系）**: `pnpm dev`（vite）は 3000 で起動し、ログイン・ノート保存もすべて 3000 上で完結するため通常は CSRF 問題なし。`wrangler.toml` の `APP_URL=http://localhost:8787` は `pnpm start`（wrangler dev, 8787）側の値で、vite 経路には影響しない。万一保存 POST が 403 になる場合のみ `.dev.vars` に一時的に `APP_URL=http://localhost:3000` を足して `pnpm dev` を再起動（検証後に戻す）。
- **本テストでサーバーは未起動**: 本ドキュメントの範囲はサーバー起動前の準備（マイグレーション・seed・手順整備）まで。`pnpm dev` 起動はメイン側で実施。

## 準備完了チェックリスト

- [x] `.dev.vars` 確認済み（既存・必要キー充足、コピー不要）
- [x] ローカル D1 マイグレーション最新（`No migrations to apply!`）
- [x] ログイン可能な member ユーザー投入済み（`dev-login@example.com` / `DevPassw0rd!2024`）
- [x] 投入を読み取り SQL で確認済み（users / accounts 各 1 行）
- [x] HTML タブ検証用ノートの作成手順・貼り付け本文を確定
- [ ] `pnpm dev` 起動（メイン側で実施）→ ログイン → 上記本文でノート作成 → 各確認項目を実施
