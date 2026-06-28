# Issue #790 マニュアルテスト用シードデータ

サイドバー「アップロード」ナビ項目の未処理件数バッジ（`countActiveIngestionJobs`）検証用のシード。

## 実行した準備作業

1. `pnpm db:migrate` — ローカル D1 にマイグレーション適用。結果: `No migrations to apply!`（適用済み）。
2. `pnpm seed:dev-admin` — 決定論的な管理者ユーザー + 有効セッションを投入（冪等）。
3. `.issue/790/manual-test/seed-jobs.sql` を作成し `pnpm db:execute:local` で投入 — dev-admin 所有の ingestion_jobs を投入。
4. 投入後の件数を SQL で検証。

すべて成功。既存データは破壊していない（ユーザーは upsert、ジョブは `INSERT OR IGNORE` + 専用 ID レンジ）。

## テストで使用するアカウント / セッショントークン（cookie 注入用）

`pnpm seed:dev-admin` が投入する決定論的アカウント。

| 項目 | 値 |
|---|---|
| email | `dev-admin@example.com` |
| username | `dev-admin` |
| role | `admin`（active: email_verified=1 / banned=0 / deleted_at=NULL） |
| user_id | `01950000-0000-7000-8000-000000000001` |
| session_id | `01950000-0000-7000-8000-000000000002` |
| **session token** | **`dev-admin-session-token`** |
| cookie 名 | `__Host-session`（Secure 必須 → `document.cookie` 不可、CDP 注入） |
| expires_at | `2999-12-31T23:59:59.000Z`（実質無期限） |

cookie 注入コマンド（ポートは起動時のものに合わせる。`pnpm dev` は 3000、`pnpm start`/wrangler は別ポートの場合あり）:

```bash
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

## ingestion ジョブの準備（SQL 投入済み）

件数バッジは **owner 単位** で `pending` / `processing` / `previewing` を数える（`failed` / `saved` / `discarded` は除外）。
今回は SQL 直接投入で決定論的に用意した（スキーマがシンプルで安全に投入可能と判断）。

投入ファイル: `.issue/790/manual-test/seed-jobs.sql`（ID レンジ `01950790-0000-7000-8000-000000079001..06`、`INSERT OR IGNORE` で再実行可）。

| ID 末尾 | ファイル名 | status | カウント対象 |
|---|---|---|---|
| ...79001 | test-790-pending-1.md | pending | ○ |
| ...79002 | test-790-pending-2.html | pending | ○ |
| ...79003 | test-790-processing.md | processing | ○ |
| ...79004 | test-790-previewing.md | previewing | ○ |
| ...79005 | test-790-failed.md | failed | ×（除外確認用） |
| ...79006 | test-790-saved.md | saved | ×（除外確認用） |

この seed 自体は active 件数を 4 増やす（pending 2 + processing 1 + previewing 1）。

### 投入後の実測（dev-admin 所有・要注意）

ローカル D1 には **過去のテストで残った dev-admin 所有の active ジョブが既に存在**していた。投入後の実測:

| status | 件数 |
|---|---|
| pending | 2 |
| processing | 1 |
| previewing | 16（うち 15 は既存） |
| failed | 2（うち 1 は既存） |
| saved | 1 |

→ 現在の **active 件数 = 19**（pending 2 + processing 1 + previewing 16）。

つまりバッジは「19」を表示する状態。非ゼロ表示の検証（確認項目 1・2・3）はこのまま実施可能。

## 注意点 / 既知の問題

- **件数ゼロ状態（非表示）の検証**: 既存 active ジョブが多数あるため、何もしなければゼロにならない。
  `docs/test.md` の「既存データを破壊しない」原則と衝突するが、ゼロ状態を見たい場合のみ tester の判断で dev-admin の active ジョブを退避/削除する。テスト専用ジョブだけ消すなら:
  ```sql
  DELETE FROM ingestion_jobs WHERE id LIKE '01950790-0000-7000-8000-000000079%';
  ```
  （ただしこれだけでは既存 15 件の previewing が残るため active=15。完全にゼロにするには既存ジョブの退避が必要。最も安全なのは別オーナー/新規 signup ユーザーでゼロ状態を確認すること。）
- **「99+」表示の検証**: 現状 19 件なので 99 未満。`99+` を見たい場合は 100 件超の active ジョブが必要（seed-jobs.sql を複製して大量投入する）。必須ではない。
- **イベント駆動更新（確認項目 3）/ visibility 再フェッチ（確認項目 4）の検証**: SQL 投入はクライアントの `notifyIngestionQueueChanged` を発火しないため、UI 上のリアルタイム増減は `/upload` 画面からの実アップロード操作で確認するのが確実。SQL で投入した行は mount 時 / visibility 復帰時 / 次の mutation 時の再フェッチで反映される。
- **検証環境**: フロントエンドのみの変更なので HMR の効く `pnpm dev`（http://localhost:3000）推奨。`pnpm db:execute:local` と `pnpm dev` の D1 書き込み先は同一。
