# Manual Test — Seed Data / Environment Setup (Issue #738)

**作成日:** 2026-06-21
**対象確認項目:** 確認項目1（provider select に Deepgram が出る / AC-3）・確認項目2（provider 切替で model リセット / AC-4）
**スキップ項目:** 実 Deepgram API キーが必要な接続テスト・実文字起こし（確認項目4・5、エッジケース1・2）。`.dev.vars` への speech API キー設定は行っていない。

## 対象 DB について

すべてローカル D1（`hollow-local-d1`、`.wrangler/state/v3/d1`）のみを操作。リモート（staging / production）は一切触っていない。本番データへの影響なし。手動 SQL は使わず、既存の seed スクリプトを利用。

## 実行した準備作業

| 手順 | コマンド | 結果 |
| --- | --- | --- |
| 1. ローカル D1 マイグレーション適用 | `pnpm db:apply:local` | 成功。未適用だった `0020_llm_call_log.sql`（3 commands）が適用された。 |
| 2. 管理者ユーザー＋セッション投入 | `pnpm seed:dev-admin` | 成功（idempotent、4 commands executed）。 |
| 3. 投入確認（読み取りのみ） | `pnpm db:execute:local <verify.sql>` | users / sessions 各 1 行を確認（下記）。 |

### マイグレーション適用の補足

`pnpm db:apply:local` = `wrangler d1 migrations apply hollow-local-d1 --local`。適用されたのは `0020_llm_call_log.sql` のみ（それ以前のマイグレーションは適用済みだった）。

testing.md の記述どおり本 Issue #738 は **DB スキーマ変更なし**（`speech_*` カラムは #701 で追加済み）のため、新規マイグレーションは無い。0020 は別件（LLM call log）だが、ローカル D1 を最新スキーマに揃えるため適用しておいた。

## seed:dev-admin が投入したアカウント情報

`scripts/seed-dev-admin.mjs` が投入する決め打ち（deterministic）の値。

| 項目 | 値 |
| --- | --- |
| email | `dev-admin@example.com` |
| username | `dev-admin` |
| name | `Dev Admin` |
| role | `admin`（active: email_verified=1 / banned=0 / deleted_at=NULL） |
| user id | `01950000-0000-7000-8000-000000000001`（有効な UUIDv7） |
| session id | `01950000-0000-7000-8000-000000000002` |
| **session token** | **`dev-admin-session-token`** |
| session expires_at | `2999-12-31T23:59:59.000Z`（実質無期限） |

セッションは raw token 比較（`D1SessionService.resolve` はハッシュ化しない）なので、この固定トークンをそのままクッキーに入れればログイン状態になる。スクリプトは idempotent で、再実行しても admin の所有データ（notes / directories 等）は保持される。

### 投入確認結果（読み取り SQL の抜粋）

```
users:    id=01950000-...-000000000001, email=dev-admin@example.com, username=dev-admin,
          role=admin, email_verified=1, banned=0, deleted_at=null
sessions: id=01950000-...-000000000002, user_id=01950000-...-000000000001,
          token=dev-admin-session-token, expires_at=2999-12-31T23:59:59.000Z
```

## agent-browser でログイン状態を作る手順

`/admin/speech` はログイン必須。クッキー名は `__Host-session` で **Secure-only**（`document.cookie` では設定不可）なので、CDP 経由でクッキーを注入する。

### クッキー仕様

| 属性 | 値 |
| --- | --- |
| name | `__Host-session` |
| value | `dev-admin-session-token` |
| domain / url | `http://localhost:3000`（`pnpm dev` の vite ポート。後述） |
| path | `/` |
| secure | true（`__Host-` プレフィックスの必須要件） |
| sameSite | `Lax` |

### set コマンド例

`pnpm dev` は vite dev で **ポート 3000** で起動する（`vite.config.cloudflare.ts` の `server.port: 3000`）。`seed:dev-admin` の出力は `<port>` プレースホルダなので、3000 を埋める。

```bash
# 1. 開発サーバー起動（別ペイン）
pnpm dev   # → http://localhost:3000

# 2. セッションクッキーを CDP 経由で注入
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:3000 --path / --secure --sameSite Lax

# 3. 管理画面を開く（認証済み admin として表示される）
#    確認項目1・2 の対象画面:
#    http://localhost:3000/admin/speech
```

注入後 `http://localhost:3000/admin` を開けば admin としてログイン済み。

## 注意・既知のハーネス差

- **実 Deepgram API キーは未設定**（今回スキップ項目）。`.dev.vars` に `ADMIN_SPEECH_*` キーは無い（現状の `.dev.vars` の key 一覧: `BETTER_AUTH_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `SECRET_BOX_MASTER_KEY` / `ADMIN_SETUP_TOKEN` / `ADMIN_LLM_*`）。speech provider は env 未 wire なので、確認項目1・2（UI 上の select / model リセット挙動）の検証には影響しない。
- **`SECRET_BOX_MASTER_KEY` は設定済み**。db 経路で保存する場合（今回の対象外だが）の暗号化は動く。
- **CSRF / ポート不一致（POST 系のみ影響）**: `wrangler.toml` の `APP_URL=http://localhost:8787` と vite の 3000 が不一致。**保存・接続テスト等の state-changing POST** をブラウザで実行すると `csrfMiddleware` の cross-origin 拒否で 403 になりうる。
  - 確認項目1（select 表示）・確認項目2（provider 切替の model リセット）は **クライアント側のフォーム挙動のみ**で POST を伴わないため、この CSRF 差の影響を受けない。保存や接続テストを後で検証する場合のみ `.dev.vars` に `APP_URL=http://localhost:3000` を一時設定して `pnpm dev` 再起動（検証後に戻す）。
- **env による provider/model ロック（確認項目3 関連）**: ローカルの speech 設定は env 未設定だが、`wrangler.toml` の `[vars]` に `ADMIN_SPEECH_PROVIDER=openai` / `ADMIN_SPEECH_MODEL=gpt-4o-transcribe` がある。ただし `pnpm dev`（vite）は `.dev.vars` を env source とし、`wrangler.toml [vars]` は `wrangler dev`（`pnpm start`、8787）側で効くため、今回の vite 経路（3000）では speech は env ロックされない想定。確認項目3 を厳密に見る場合は別途 env 投入が必要。

## 確認項目1・2 を実行する準備の完了状態

- [x] ローカル D1 マイグレーション適用済み
- [x] dev-admin ユーザー＋セッション投入済み（token: `dev-admin-session-token`）
- [x] ログイン用クッキー注入手順を確定（`__Host-session` / port 3000）
- [x] 実 Deepgram キーは未設定（スキップ項目どおり）

次のステップ（本ドキュメントの範囲外）: `pnpm dev` 起動 → 上記クッキー注入 → `/admin/speech` を開いて確認項目1・2 を実施。
