# 動作確認計画 — Issue #245: deploy workflow hardening (indexer + Validate secrets 切り出し)

**Issue:** #245
**作成日:** 2026-05-28

---

## 確認環境

このIssueの変更対象は `.github/workflows/deploy-{staging,production}.yml` のみ。検証は (1) ローカルでの静的チェック、(2) `workflow_dispatch` による CI 上の実機実行、の 2 段構え。

### 検証環境の起動

このIssueにはアプリ側の挙動変更は含まれない。検証用 dev サーバー起動は不要。

ローカル静的チェック（パッケージスクリプト経由）:

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
```

YAML 自体の構文検証コマンドはこのリポジトリの package.json / CLAUDE.md / README.md・docs 内に明示的に定義されていないため、`actionlint` 等の YAML 専用 linter はオプション扱いとする。要確認: workflow YAML 専用の linter 実行コマンドが社内で確立されていないか。

### デプロイ方法

ワークフロー自体の変更なので、CI 上での実機確認が deploy 経路の確認も兼ねる。

- **Staging 手動実行:** `gh workflow run deploy-staging.yml --ref <branch>`（PR を main にマージする前にブランチ指定で実行可能）。
- **Production 手動実行:** `gh workflow run deploy-production.yml`（required reviewers による承認が必要）。

## 確認項目

### 1. ワークフロー YAML の静的健全性

- **目的:** 編集後の YAML が GitHub Actions パーサで弾かれないこと。
- **手順:**
  1. ローカルで `git diff main -- .github/workflows/` を眺め、インデントと step 名の重複がないか目視確認。
  2. `gh workflow list` でワークフローが正しく読み込まれるか確認（push 後）。
- **期待結果:** `gh workflow list` に `Deploy (staging)` / `Deploy (production)` が表示され、`error parsing workflow` 系のメッセージが出ない。
- **確認ポイント:** step 名 `Validate secrets` が `Inject secrets` と衝突しないこと、indexer 行のインデントが他の deploy 行と完全に揃っていること。

### 2. A: `Deploy Workers` に indexer が含まれる（staging）

- **目的:** indexer worker のコードも CI 経由で deploy されること。
- **手順:**
  1. `gh workflow run deploy-staging.yml --ref <branch>` で workflow_dispatch を発火。
  2. `gh run watch` で実行を追跡し、`Deploy Workers` step のログを確認。
- **期待結果:** ログに `Uploaded tanstack-start-template-indexer` 相当のメッセージが含まれる（staging stage の indexer worker 名は `WORKER_INDEXER` 変数に依存 — Pulumi outputs 由来）。
- **確認ポイント:** indexer の deploy が `--env consumer` よりも前に実行されている（service binding 依存方向の維持）。

### 3. A: `Deploy Workers` に indexer が含まれる（production）

- **目的:** 同上を production workflow で確認。
- **手順:**
  1. `gh workflow run deploy-production.yml` で workflow_dispatch を発火し、required reviewer が承認。
  2. `gh run watch` で `Deploy Workers` step ログを確認。
- **期待結果:** indexer の deploy ログが含まれる。
- **確認ポイント:** staging と同じ位置（dlq の後、consumer の前）に挿入されていること。

### 4. B: `Validate secrets` が `Deploy Workers` より前に実行される（staging）

- **目的:** secret 整合性チェックが Worker deploy より厳密に前で走り、fail-fast すること。
- **手順:**
  1. `gh workflow run deploy-staging.yml --ref <branch>` で発火。
  2. step 順を `gh run view <run-id> --log` で確認。
- **期待結果:** `Apply D1 migrations` → `Validate secrets` → `Deploy Workers` → `Inject secrets` の順に並ぶ。
- **確認ポイント:** `Inject secrets` step から `check-secrets` 呼び出しが消えていること（重複実行を避ける）。

### 5. B: 同上を production で確認

- **目的:** production workflow でも step 順序が正しいこと。
- **手順:** staging と同じ手順を production で実施。
- **期待結果:** 同じ順序。

## エッジケース・異常系

### 1. check fail シナリオで `Deploy Workers` がスキップされる

- **目的:** 受け入れ条件3番の確認 — secret spec と decrypted JSON の不一致を意図的に作り、Deploy Workers が走らないことを観測する。
- **手順:**
  1. ローカルで `infra/secrets/staging.enc.json` を一時的に編集し、`workerSecretSpecs()` に存在するキーを 1 つ削除（または余分なキーを追加）して再暗号化。
  2. 編集を別ブランチに push して `gh workflow run deploy-staging.yml --ref <branch>` を発火。
  3. `Validate secrets` step が fail した時点で job が止まることを確認。
- **期待結果:**
  - `Validate secrets` step が exit code 1 で fail。
  - 後続の `Deploy Workers` / `Inject secrets` step が `skipped` 状態になる（GH Actions のデフォルト挙動 — 先行 step 失敗で後続 step が skip される）。
  - Cloudflare 上の indexer その他 Worker のコード版数が変わっていない（dashboard で `Last deploy` のタイムスタンプを確認）。
- **確認ポイント:** ブランチで動作確認後、`infra/secrets/staging.enc.json` を main の状態に戻すこと（再暗号化版を誤ってマージしないよう注意）。

### 2. `Validate secrets` step の cleanup

- **目的:** `Validate secrets` で書き出した平文 SOPS ファイルが step 終了時に確実に削除されること。
- **手順:**
  1. ログ上は平文ファイルパス（`/tmp/tmp.XXXXX`）が出力されるが、step 完了後の runner 状態は外から観測不可。代わりに step bash の `trap 'rm -f "${DECRYPTED:-}"' EXIT` が記述されていることをコードレビューで確認する。
- **期待結果:** trap が `mktemp` より前、`DECRYPTED=""` 初期化の直後に設定されている（既存 `Inject secrets` step と同じパターン）。

## 既存機能への影響確認

- **Pulumi up / Render / Build / Apply D1 migrations:** 変更前と同じ位置・同じコマンドのまま。回帰がないことを workflow ログで確認。
- **`Inject secrets` の bulk push 動作:** check 呼び出しを抜いただけで、`jq` filter + `wrangler secret bulk` のループは変更しない。staging で実行後、Cloudflare dashboard で全 6 worker（top, relay, consumer, indexer, pruner, dlq）の secret 一覧に変化がないこと（追加・削除なし）を確認。
- **production workflow の release notes 生成:** `Generate release notes` step は `Inject secrets` の後ろに残っており、本Issueでは触らない。

## 確認チェックリスト

- [ ] YAML が `gh workflow list` で正しく認識される
- [ ] A (staging): Deploy Workers ログに indexer 行が含まれる
- [ ] A (production): Deploy Workers ログに indexer 行が含まれる
- [ ] A: indexer の deploy 位置が `dlq` の後、`consumer` の前
- [ ] B (staging): step 順 `Apply D1 migrations → Validate secrets → Deploy Workers → Inject secrets`
- [ ] B (production): 同上の step 順
- [ ] B: `Inject secrets` から check-secrets 呼び出しが削除済み
- [ ] check fail シナリオで `Deploy Workers` が skipped になり、Cloudflare 側の Worker コードが更新されない
- [ ] `Validate secrets` の trap-based cleanup が `Inject secrets` と同じパターン
- [ ] `Pulumi up` / `Render` / `Build` / `Apply D1 migrations` の挙動が回帰していない
