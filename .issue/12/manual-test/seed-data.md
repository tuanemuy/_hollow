# Issue #12 manual-test seed data

**Issue:** #12 (`/exports/$jobId` 詳細ルート + 一括エクスポート完了通知)
**Test source:** `.issue/12/testing.md`
**Date:** 2026-05-20
**DB:** Cloudflare D1 ローカル (`tanstack-start-template-d1` / `.wrangler/state/v3/d1/...`)

---

## サマリー

`.issue/12/testing.md` は以下を要求する:

- ログインしてノート一覧から **複数ノートを選んで一括エクスポート**（`BulkExportDialog`）
- 状態別エクスポートジョブ（`pending` / `processing` / `completed` / 期限切れの `completed` / `failed` / `cancelled`）の **詳細ページ表示** 確認
- **他人のジョブ ID 直叩き** で生メッセージ（userId / jobId）が漏れないことの確認

そのために専用の **テストユーザ A / B** と **A 所有の export_jobs 6 件** を投入した。
本番データを破壊しないようローカル D1 にのみ操作する。

---

## 実行した準備作業

| # | コマンド | 結果 |
|---|---|---|
| 1 | `pnpm wrangler d1 execute tanstack-start-template-d1 --local --command "SELECT id, email, username, role, email_verified, banned FROM users;"` | 既存 12 アカウント（`.manual-test/2026-05-17/seed.sql`）が投入済み。マイグレーションは適用済み |
| 2 | `pnpm wrangler d1 execute tanstack-start-template-d1 --local --command "SELECT COUNT(*) FROM notes GROUP BY status;"` | notes 10 件（test-user-001 配下、Issue #29 残置）。test-a / test-b は未投入 |
| 3 | `pnpm wrangler d1 execute tanstack-start-template-d1 --local --command "SELECT * FROM export_jobs;"` | export_jobs 0 件 |
| 4 | `node` で PBKDF2-SHA256 / 600,000 iter / 16-byte salt / 32-byte key を生成（`Test1234!` 用）。`.manual-test/2026-05-17/hashPassword.mjs` と同パラメータ | 2 件のハッシュを取得し seed.sql に焼き付け |
| 5 | `pnpm wrangler d1 execute tanstack-start-template-d1 --local --file=.issue/12/manual-test/seed.sql` | 全 INSERT 成功（INSERT OR IGNORE / 再実行安全） |
| 6 | 投入後の状態を `SELECT` で確認 | users 2 件 / accounts 2 件 / directories 2 件 / notes 3 件 / export_jobs 6 件 |
| 7 | `pnpm dev` → `curl http://localhost:3000/login` | `HTTP 200` で 7,519 bytes 返却。ログインフォームが描画される |

> **マイグレーション:** すでに `0000`〜`0006` まで適用済みのため `pnpm db:migrate` は再実行不要だった。クリーン環境で再現する場合は最初に `pnpm db:migrate` を回すこと。

---

## 投入したシードデータ

すべて `01938f12-...` プレフィックスで baseline seed（`01938f00-...`）と完全分離している。

| テーブル | 件数 | 内訳 |
|---|---|---|
| `users` | +2 | test-a / test-b |
| `accounts` | +2 | 各ユーザの `credential` プロバイダ |
| `directories` | +2 | 各ユーザの root directory（depth=0, parent_id=NULL） |
| `notes` (active) | +3 | test-a 所有、一括エクスポート選択対象 |
| `export_jobs` | +6 | 全 test-a 所有（後述） |

### export_jobs 6 件 — 各状態の jobId

| # | status | jobId | 用途 / testing.md 該当項目 | format | progress | expires_at | completed_at | 補足 |
|---|---|---|---|---|---|---|---|---|
| 1 | `pending` | `01938f12-0000-7000-8000-000000000301` | 確認項目1（BulkExportDialog 結果の初期表示） | markdown | 0/0 | NULL | NULL | キャンセル可能 |
| 2 | `processing` | `01938f12-0000-7000-8000-000000000302` | 確認項目2（poll 表示）/ 確認項目4（キャンセル） | markdown | 2/5 | NULL | NULL | progress.total > 0 |
| 3 | `completed` | `01938f12-0000-7000-8000-000000000303` | 確認項目3（ダウンロードボタン表示） | markdown | 3/3 | **2099-12-31** | 2026-05-20 | `artifact_key` + `artifact_size` あり |
| 4 | `completed`（期限切れ） | `01938f12-0000-7000-8000-000000000304` | エッジ4（`expired` 相当: ダウンロードボタン抑止） | markdown | 3/3 | **2025-04-08** | 2025-04-01 | artifact あり + expires_at が過去 |
| 5 | `failed` | `01938f12-0000-7000-8000-000000000305` | エッジ3（`errorReason` / `failedNoteIds` 表示） | pdf | 1/3 | NULL | 2026-05-20 | `error_code='PdfRenderError'`, `failed_note_ids` 2 件 |
| 6 | `cancelled` | `01938f12-0000-7000-8000-000000000306` | キャンセル後表示 | markdown | 0/3 | NULL | 2026-05-20 | キャンセルボタン非表示確認 |

> エッジケース「`expired` 状態」は **DB のステータスを文字列 `expired` にする** よりも、Issue ADR-003 の「クライアント側が `status='completed'` かつ `expires_at < now` のとき expired 扱い」ロジックを通すパス（#4）の方が UI の実分岐を踏むので、こちらをメインの検証対象とした。`status='expired'` の行を別途立てたい場合は #4 行のステータスを `expired` に書き換える（後述）。

### scope / view_query / options について

- **scope** は全件 `multiple`、`target_note_ids_json` に上記 3 件のノート ID をセット
- **view_query_json** は `null`（scope='view' を試したい場合のみ別途追加）
- **options_json** は domain の `ExportOptions` シリアライズ形式に合わせて
  - 通常: `{"includeFrontMatter":true,"embedMedia":false,"pdfPaperSize":null}`
  - PDF (#5): `{"includeFrontMatter":true,"embedMedia":true,"pdfPaperSize":"A4"}`

これらは `app/core/adapters/d1/repositories/exportJobRepository.ts` の `parseOptions` / `parseViewQuery` がそのまま読み戻す形になっている。

---

## テストアカウント

| 用途 | email | password | username | user_id | 備考 |
|---|---|---|---|---|---|
| **ユーザ A（ジョブ所有者）** | `test-a@example.com` | `Test1234!` | `test-a` | `01938f12-0000-7000-8000-0000000000a1` | export_jobs 6 件 + active note 3 件を所有。通常テストで使う |
| **ユーザ B（他人）** | `test-b@example.com` | `Test1234!` | `test-b` | `01938f12-0000-7000-8000-0000000000b1` | データなし。エッジケース1「他人のジョブ ID 直叩き」専用 |

- 認証: `provider_id='credential'`、PBKDF2-HMAC-SHA256 / 600,000 iter / 16-byte salt / 32-byte key
- `email_verified=1` / `banned=0` / `deleted_at=NULL` でアクティブ
- メール認証フローは経由不要（直接ログインできる）

### ログイン手順

1. dev server を起動: `pnpm dev`（http://localhost:3000）
2. ブラウザで http://localhost:3000/login を開く
3. ユーザ A でログイン: `test-a@example.com` / `Test1234!`
4. （エッジケース1の検証時のみ）一度ログアウトして `test-b@example.com` / `Test1234!` で再ログイン

> ローカル D1 のセッション周りは特別な前処理を要しない。`sessions` テーブルへの事前 INSERT は不要（ログインフォーム経由で生成される）。

### ログイン確認

```sh
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
# => 200
```

実機で `pnpm dev` → curl /login を実行して `HTTP 200`（7,519 bytes）を確認済み。

---

## 主要 URL

| 用途 | URL |
|---|---|
| ログイン | `/login` |
| ノート一覧 / ホーム | `/` |
| エクスポート一覧 | `/exports` |
| ジョブ詳細（メイン検証対象） | `/exports/01938f12-0000-7000-8000-000000000301`（pending）<br/>`/exports/01938f12-0000-7000-8000-000000000302`（processing）<br/>`/exports/01938f12-0000-7000-8000-000000000303`（completed）<br/>`/exports/01938f12-0000-7000-8000-000000000304`（completed/expired）<br/>`/exports/01938f12-0000-7000-8000-000000000305`（failed）<br/>`/exports/01938f12-0000-7000-8000-000000000306`（cancelled） |
| 他人のジョブ ID 直叩き（エッジ1）| 上記いずれか（ユーザ B ログイン時） |
| 存在しないジョブ ID（エッジ2）| `/exports/00000000-0000-0000-0000-000000000000` |

---

## 再投入手順

```sh
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --file=.issue/12/manual-test/seed.sql
```

`INSERT OR IGNORE` のため再実行で破壊されない。
**破壊的 TC 後にステータスを初期状態へ戻したい**場合は、export_jobs を一旦削除してから再投入する:

```sh
pnpm wrangler d1 execute tanstack-start-template-d1 --local --command \
  "DELETE FROM export_jobs WHERE id LIKE '01938f12-0000-7000-8000-0000000003%';"
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --file=.issue/12/manual-test/seed.sql
```

完全リセット（test-a / test-b を含むすべてを消す）:

```sh
pnpm wrangler d1 execute tanstack-start-template-d1 --local --command \
  "DELETE FROM users WHERE id IN ('01938f12-0000-7000-8000-0000000000a1','01938f12-0000-7000-8000-0000000000b1');"
```

`users → accounts / directories / notes / export_jobs` は FK `ON DELETE CASCADE` のため連鎖削除される。

---

## ステータス書き換えメモ

testing.md のエッジ4「真の `expired` 状態」をテストしたい場合（オプション）:

```sh
pnpm wrangler d1 execute tanstack-start-template-d1 --local --command \
  "UPDATE export_jobs SET status='expired' WHERE id='01938f12-0000-7000-8000-000000000304';"
```

`expired` ステータスは domain entity の `reconstruct` が `completed` と同じ artifact 必須条件を要求するため、#4 行（artifact_key / artifact_size / completed_at / expires_at すべて非 NULL）が前提。

`pending` → `processing` を実機で見たい場合は `pnpm dev` 単独だと進まないので、`pnpm start`（wrangler dev で relay / consumer を起動）を使うか、SQL で直接ステータスを書き換える（testing.md 確認項目2 と同じ流れ）。

---

## 問題・補足

### 1. miniflare の `Request.cf` 警告

`pnpm dev` 起動時に以下の警告が出る:

```
Unable to fetch the `Request.cf` object! Falling back to a default placeholder...
SyntaxError: Unexpected token 'o', "not found :(" is not valid JSON
```

これは miniflare がリモートの `cf` メタデータエンドポイントを叩いて失敗しているだけで、`/login` が `HTTP 200` を返すことを確認済み。テストには影響しない。

### 2. baseline seed は触っていない

既存 12 アカウント（`existing-user` / `mailowner` / `admin-user` 等）は変更せず、別 ID 空間（`01938f12-...`）に test-a / test-b を投入している。
他 Issue（#13 / #29 等）の seed と独立に共存できる。

### 3. リモート D1 には触っていない

CLAUDE.md と本タスクの方針に従い、すべての wrangler コマンドに `--local` を付与している。staging / production の D1 には一切書き込んでいない。

### 4. `instance_settings` / `search_documents` / `publication_states` は未投入

Issue #12 のテスト範囲（`/exports/{jobId}` 詳細ルート）は export_jobs テーブルと user / note 関連のみで完結するため不要。
ノートの公開状態（`publication_states`）が必要になる別シナリオを実施する場合は別途追加すること。

### 5. testing.md 確認項目1（BulkExportDialog から実機 enqueue）について

`pnpm dev` 単独では Queues / R2 がエミュレートされず、enqueue した結果が `pending` のまま進まない。
**シードした 6 件のジョブで各表示状態を網羅できているので、実機 enqueue は確認項目1の URL 遷移ロジックの確認だけでよい**（実 enqueue → completed まで見たい場合のみ `pnpm start` を使う）。

---

## 関連ファイル

- `.issue/12/manual-test/seed.sql` — 本 Issue 用シード SQL
- `.issue/12/manual-test/seed-data.md` — 本ドキュメント
- `.issue/12/testing.md` — テスト計画（入力）
- `app/core/adapters/d1/migrations/0001_hollow_schema.sql` — `export_jobs` スキーマ定義
- `app/core/adapters/d1/migrations/0004_export_job_occ.sql` — `version` カラム追加
- `app/core/adapters/d1/repositories/exportJobRepository.ts` — JSON カラム（options / view_query / target_note_ids / failed_note_ids）の serializer / parser
- `app/core/domain/export/entity.ts` — `reconstructByStatus` のステータス別 invariant
- `.manual-test/2026-05-17/hashPassword.mjs` — PBKDF2 ハッシュ生成スクリプト（パスワード変更時に流用可）
