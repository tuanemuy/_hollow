# Manual-test seed (Issue #232)

Issue #232（ディレクトリ操作のための独立UI）の動作確認 (`.issue/232/testing.md`) で
使用するローカル D1 のシード状態を記録する。

## 環境

- プロジェクトルート: `/Users/hikaru/github.com/tuanemuy/hollow`
- ローカル D1: `hollow-local-d1`（`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`）
- dev server コマンド: `pnpm dev`
- dev server ポート: **`http://localhost:3000`**（`vite.config.cloudflare.ts` で固定。testing.md は 5173 と書かれているが実際は 3000）

## 事前準備（完了済み）

### 1. マイグレーション適用

```bash
pnpm db:migrate
# = wrangler d1 migrations apply hollow-local-d1 --local
```

`0011_note_revisions.sql` までの全 11 マイグレーション適用済み。

### 2. ベースラインアカウント（既存）

`.manual-test/2026-05-17/seed.sql` が過去に適用済みで、12 アカウントが
そのまま残っている。今回はこれを破棄せず流用する（破壊的 TC が無いため、
reseed.sh は不要）。

なお `.manual-test/2026-05-17/reseed.sh` は D1 バインディング名が
`tanstack-start-template-d1`（旧）のままで現行 `hollow-local-d1` と
不整合（再生成の必要があるが、本 Issue の動作確認には影響しない）。

### 3. Issue #232 用シードデータ

`/Users/hikaru/github.com/tuanemuy/hollow/.issue/232/manual-test/seed.sql` を
`pnpm db:execute:local` 経由で投入済み。投入内容は下記「投入したシードデータ」を参照。

```bash
pnpm db:execute:local .issue/232/manual-test/seed.sql
```

再投入安全（全 `INSERT OR IGNORE`）。

## 投入したシードデータ

### users / accounts / directories (root)

`.manual-test/2026-05-17/seed.sql` 由来。今回は変更していない。

| テーブル | 件数 (全体) | 備考 |
|---|---|---|
| `users` | 17 | うち baseline `existing-user` を本 Issue で使用 |
| `accounts` (provider=credential) | baseline 全件 | パスワードハッシュ済み |
| `directories` (root, depth=0) | baseline 全件 | 各オーナーごと 1 件ずつ |

### Issue #232 で追加した行（`.issue/232/manual-test/seed.sql`）

すべて `existing-user`（`01938f00-0000-7000-8000-0000000000a1`）の所有。

#### directories（3 件追加）

| name | slug | id | parent_id | depth |
|---|---|---|---|---|
| `Foo` | `foo` | `01938f02-0000-7000-8000-000000000001` | root (`...0000a3`) | 1 |
| `Bar` | `bar` | `01938f02-0000-7000-8000-000000000002` | root | 1 |
| `Baz` | `baz` | `01938f02-0000-7000-8000-000000000003` | root | 1 |

#### notes（2 件追加, 親=`Foo`）

| title | slug | id | directory |
|---|---|---|---|
| `Foo配下の検証用ノート 1` | `note-foo-1` | `01938f02-0000-7000-8000-000000000101` | `Foo` |
| `Foo配下の検証用ノート 2` | `note-foo-2` | `01938f02-0000-7000-8000-000000000102` | `Foo` |

用途:
- `Foo` … エッジケース #1（名前重複検証用の親） / DirectoryPicker からの操作の対象
- `Bar` / `Baz` … サイドバーツリー描画 / 移動先候補 / キーボードナビ検証
- 配下ノート 2 件 … TC #6（削除確認ダイアログの文言検証）と TC #7（削除実行 → ゴミ箱）

## テストで使用するアカウント

ログインに使うのは `existing-user` の 1 つだけで十分。

| 項目 | 値 |
|---|---|
| email | `existing@example.com` |
| password | `Password123!` |
| username | `existing-user` |
| role | `member` |
| user.id | `01938f00-0000-7000-8000-0000000000a1` |
| root directory id | `01938f00-0000-7000-8000-0000000000a3` |

予備（必要に応じて）:
- `admin@example.com` / `Password123!`（role=admin）
- `mailowner@example.com` / `Password123!`

パスワードハッシュ方式: PBKDF2-HMAC-SHA256 / 600,000 iter / 16B salt /
`pbkdf2-sha256-v1$<iter>$<salt-b64>$<hash-b64>`（`credentialStore.ts` 準拠）。

## 環境変数（`.dev.vars` の確認結果）

`/Users/hikaru/github.com/tuanemuy/hollow/.dev.vars` 存在。下記キーが定義されている
（値は本ドキュメントには記載しない）:

| キー | 用途 |
|---|---|
| `BETTER_AUTH_SECRET` | better-auth のセッション署名鍵 |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `SECRET_BOX_MASTER_KEY` | LLM API key 保存などの at-rest 暗号化（dev 用 placeholder） |
| `ADMIN_SETUP_TOKEN` | 空文字列（admin signup 用、今回未使用） |
| `ADMIN_LLM_PROVIDER` / `ADMIN_LLM_MODEL` / `ADMIN_LLM_API_KEY` | LLM 機能用（今回未使用） |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 storage |

Issue #232 のディレクトリ UI 検証では LLM / R2 機能は使わないため、空・placeholder のままで問題なし。

## 後続フェーズ（manual-test 本体）で実行する手順

1. dev server を起動:
   ```bash
   pnpm dev
   ```
   `http://localhost:3000` で待ち受け（vite/workerd）。

2. ブラウザで `http://localhost:3000/` を開き、`existing@example.com` / `Password123!` でログイン。

3. ホーム画面サイドバーに **Foo / Bar / Baz** が depth=1 で表示されることを確認。

4. `.issue/232/testing.md` の確認項目 1〜11 + エッジケース 1〜6 を順に実行。

   - TC #1: 新規 `TestRoot` を作成（既存 `Foo/Bar/Baz` とは別の名前）
   - TC #2: `TestRoot` 配下に `Child1`
   - TC #6 / #7（削除）: 既存の `Foo` 配下にあらかじめノートが 2 件あるので、
     そのまま削除 → ゴミ箱遷移を検証可能（testing.md 指定の「準備: TestRoot にノートを作る」は省略可）

5. テスト後のクリーンアップ（任意）:
   - Issue #232 用シードを再投入したい場合: `pnpm db:execute:local .issue/232/manual-test/seed.sql`
     （INSERT OR IGNORE なので既存行はそのまま、消えていた行のみ復活）
   - 完全クリーンアップしたい場合は `existing-user` 所有のディレクトリ／ノートを
     SQL で削除してから再投入する。

## 問題・懸念事項

- `.manual-test/2026-05-17/reseed.sh` は旧 DB 名 `tanstack-start-template-d1` を
  ハードコードしているため、そのままでは動かない。本 Issue の動作確認には
  影響しない（破壊的 TC が無いので reseed 不要）が、別 Issue で修正対象になりうる。
- testing.md の「`http://localhost:5173/`」記述は古い。実際の dev server は
  `vite.config.cloudflare.ts` で port 3000 固定。manual-test 本体は 3000 を使うこと。
- Issue #232 のテストでは TC 番号 1（`TestRoot` 作成）と #2（`Child1` 作成）の名前は
  既存シードと衝突しない（事前シードは `Foo` / `Bar` / `Baz`）。エッジケース #1
  （名前重複）で `Foo` を再投入するパスもそのまま使える。

## 関連ファイル

- 本 Issue 用 seed SQL: `/Users/hikaru/github.com/tuanemuy/hollow/.issue/232/manual-test/seed.sql`
- ベースライン seed SQL: `/Users/hikaru/github.com/tuanemuy/hollow/.manual-test/2026-05-17/seed.sql`
- ハッシュ生成ヘルパ: `/Users/hikaru/github.com/tuanemuy/hollow/.manual-test/2026-05-17/hashPassword.mjs`
- testing.md: `/Users/hikaru/github.com/tuanemuy/hollow/.issue/232/testing.md`
- 認証アダプタ（パスワード方式の根拠）: `/Users/hikaru/github.com/tuanemuy/hollow/app/core/adapters/d1/repositories/credentialStore.ts`
