# Issue #697 マニュアルテスト用シードデータ

対象: ノート編集画面 `/notes/$noteId/edit`（FrontMatterモード廃止＋メタデータ下部常設）
作成日: 2026-06-13
DB: ローカル D1（`hollow-local-d1` / `.wrangler/state/v3/d1/`）— 本番非対象。

## 実行した準備作業

1. `CLAUDE.md` / `README.md` / `.issue/697/testing.md` を読み、必要な前提データを整理。
2. `app/components/note/editor/wysiwygUnsupportedTags.ts` を確認し、WYSIWYG非対応タグ（`section` / `table` など、`WYSIWYG_SUPPORTED_TAGS` 外）を把握。
3. `pnpm seed:dev-admin`（`scripts/seed-dev-admin.mjs`）を実行し、開発用管理者アカウント＋有効セッションを投入（冪等）。
4. `pnpm db:execute:local` で既存データ（ディレクトリ・ノート）を確認。すでに編集可能なノートと FrontMatter 付きノートが存在することを確認。
5. 不足していた「WYSIWYG非対応タグを含むノート」（エッジケース2用）を1件、固定 ID で直 INSERT（既存データは一切削除・上書きせず、新規 ID のみ追加）。

既存 seed の仕組み（`seed:dev-admin`）を優先利用し、ノートは「既存テストデータ＋不足分1件のみ追加」とした。新規作成画面（`/notes/new`）への委譲は不要（直 INSERT が単純なため）。

## テストで使用するアカウント

| 項目 | 値 |
|------|----|
| メール | `dev-admin@example.com` |
| ユーザー名 | `dev-admin` |
| ロール | admin（active） |
| セッショントークン | `dev-admin-session-token` |
| user_id | `01950000-0000-7000-8000-000000000001` |

パスワードログインは未設定（このアカウントは `accounts` に password レコードを持たない）。認証はセッション cookie の注入で行う。cookie 名は `__Host-session`（Secure-only のため `document.cookie` 不可、CDP で注入）:

```
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

`pnpm seed:dev-admin` は冪等。再実行しても所有データ（ノート・ディレクトリ）は保持される。

## サーバー / ポート

- 開発サーバーは `http://localhost:3000` と `http://localhost:3001` の両方が応答（いずれも 200）。同一ローカル D1 を参照。
- 本タスク指定は 3001（issue/697 用）、`testing.md` 記載は 3000。どちらでも同じシードが見える。

## 投入・確認したシードデータ

### 投入したノート（今回新規 INSERT、1件）

| 項目 | 値 |
|------|----|
| noteId | `01950000-0672-7000-8000-000000000697` |
| slug | `wysiwyg-unsupported-697` |
| title | テスト #697: WYSIWYG非対応タグを含むノート |
| directory | ルート直下（`01950000-0000-7000-8000-000000000658`） |
| front_matter | `{}`（空） |
| 本文 | `<section>` と `<table>` を含む HTML（WYSIWYG非対応タグ） |
| 用途 | エッジケース2: WYSIWYG切替時の装飾消失警告（ConfirmDialog）確認 |

編集画面: `/notes/01950000-0672-7000-8000-000000000697/edit`

### 既存の利用可能ノート（DB に存在、削除・変更なし）

dev-admin 所有のアクティブノートは合計 21 件。テストに有用なもの:

| 用途 | noteId | slug | title | 備考 |
|------|--------|------|-------|------|
| FrontMatter 付き | `019ebe30-17ac-75e1-a9c9-a0ea8efae572` | `note` | 京都旅行プラン（編集済み） | `front_matter_json = {"status":"edited","reviewer":"tc-004"}`。下部メタデータ領域に既存キーが表示される確認用 |
| FrontMatter なし | `01950000-0000-7000-8000-000000000201` 〜 `...000214` | `test-note-01` 〜 `14` | Test Note 01〜14 | 空状態（メタデータ領域が空表示）の確認用 |
| 階層あり | `01950000-0672-7000-8000-000000000012` | `hierarchical-note` | テスト: 階層ありノート | ディレクトリ配下 |
| ルート直下 | `01950000-0672-7000-8000-000000000013` | `root-level-note` | テスト: ルート直下ノート | |

## testing.md の前提データとの対応

- ログイン可能なユーザー: dev-admin（セッション cookie 注入） — OK
- 編集できるノートが複数件: 21 件 — OK
- FrontMatter を持つノート1件: `019ebe30-17ac-75e1-a9c9-a0ea8efae572` — OK（既存）
- WYSIWYG非対応タグを含むノート1件: `01950000-0672-7000-8000-000000000697` — OK（今回追加）

## 問題・注意点

- なし。本番データへの影響なし（直 INSERT は新規固定 ID のみ、既存行は不変）。
- 再シードする場合は `/tmp` の SQL ではなく、本ファイルの INSERT 文を流用すること（`DELETE FROM notes WHERE id = '01950000-0672-7000-8000-000000000697'` で冪等化済み）。
