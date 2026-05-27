# 動作確認計画 — Issue #203: deploy workflow: secret bulk-push の堅牢性を強化する

**Issue:** #203
**作成日:** 2026-05-27

---

## 確認環境

このIssueの変更は infra/CI 層に閉じており、Web UI への影響はゼロ。検証はローカルでの static check + script の単体実行で完結する。実環境への deploy は merge 後の通常 CI で初回走行する想定。

### 検証環境の起動

該当なし（Web サーバーは起動しない）。

### デプロイ方法

本 PR をマージすると `.github/workflows/deploy-staging.yml` が staging に自動 deploy。タグ push (`v*.*.*`) で `deploy-production.yml` が production に deploy（required reviewers の承認待ちあり）。本 Issue では実環境への意図的な事前 deploy は行わない（次回 deploy 時に新ロジックが初回走行する）。

参考: ローカルから `wrangler deploy --config wrangler.{stage}.toml [--env <worker>]` の経路は `package.json` の `deploy:{stage}:*` script 群経由で利用可能だが、本 Issue の変更点（CI 側 secret bulk-push）は外部から再現できないため、検証はあくまで CI が叩く script の単体動作で行う。

---

## 確認項目

### 1. 型・lint・format の整合性

- **目的:** Step 0 で `workerSecretSpecs` のシグネチャを `Pick<Config, "appName" | "stage">` に狭めた変更が、既存 callsite（`infra/src/index.ts`）を壊さないこと。新規 `infra/scripts/checkSecrets.ts` が型エラーを出さないこと
- **手順:**
  1. `pnpm typecheck` を実行
  2. `pnpm lint:fix && pnpm format` を実行
- **期待結果:** どちらも exit 0
- **確認ポイント:** `workerSecretSpecs` の callsite が他になければ`infra/src/index.ts` の 1 箇所のみ。`checkSecrets.ts` の型はダミー `{ appName: "check", stage }` が `Pick<Config, "appName" | "stage">` を満たす

### 2. `pnpm infra:check-secrets:staging` の正常系

- **目的:** `.json.example` 入力で `_*` プレフィックス除外後のキー集合と `workerSecretSpecs("staging")` の union が一致して exit 0 で返ること
- **手順:**
  1. `pnpm infra:check-secrets:staging -- infra/secrets/staging.json.example` を実行
- **期待結果:** `✓ secrets check passed (stage=staging, keys=9)` のようなログを出して exit 0
- **確認ポイント:** keys=9（shared 3 + dispatchExtras 5 + webOnly 1）。`--` セパレータが pnpm filter chain を通って `tsx scripts/checkSecrets.ts staging <path>` まで届くこと

### 3. `pnpm infra:check-secrets:production` の正常系

- **目的:** production stage でも同様に exit 0 を返すこと
- **手順:**
  1. `pnpm infra:check-secrets:production -- infra/secrets/production.json.example` を実行
- **期待結果:** `✓ secrets check passed (stage=production, keys=9)` で exit 0

### 4. `_*` プレフィックスフィルタの単体検証

- **目的:** `jq 'with_entries(select(.key | startswith("_") | not))'` フィルタが `.json.example` から `_comment` / `_dispatch_extras_comment` / `_web_only_comment` の 3 つを drop すること
- **手順:**
  1. `jq 'with_entries(select(.key | startswith("_") | not))' infra/secrets/staging.json.example | jq 'keys | length'` を実行
- **期待結果:** `9`（`_*` の 3 個が落ちて元の 12 個 → 9 個）

### 5. workflow YAML の構文と整合性

- **目的:** `.github/workflows/deploy-staging.yml` と `deploy-production.yml` の secret 注入ステップが構文的に valid で、`--env indexer` が secret push ループに含まれていること
- **手順:**
  1. `grep -n "env_flag" .github/workflows/deploy-staging.yml` と `.github/workflows/deploy-production.yml`
  2. ループの env_flag リストに `"--env indexer"` が含まれることを目視確認
  3. `actionlint` がインストールされていれば `actionlint .github/workflows/deploy-staging.yml .github/workflows/deploy-production.yml`
- **期待結果:** ループに `"" "--env relay" "--env consumer" "--env indexer" "--env pruner" "--env dlq"` の 6 entries（順序は問わない、indexer が含まれることが本質）。actionlint が走るなら exit 0

---

## エッジケース・異常系

### 1. missing key 検出（spec にあるが decrypted JSON にない）

- **目的:** `workerSecretSpecs()` の union から 1 key が JSON 側で欠落していたら fail-loud に exit 1 すること
- **手順:**
  1. `cp infra/secrets/staging.json.example /tmp/probe-missing.json`
  2. `jq 'del(.BETTER_AUTH_SECRET)' /tmp/probe-missing.json > /tmp/probe-missing.json.tmp && mv /tmp/probe-missing.json.tmp /tmp/probe-missing.json`
  3. `pnpm infra:check-secrets:staging -- /tmp/probe-missing.json`
  4. `rm /tmp/probe-missing.json`
- **期待結果:** exit 1。stderr に「missing: BETTER_AUTH_SECRET」相当のメッセージ

### 2. extra key 検出（JSON にあるが spec にない、`_*` 以外）

- **目的:** spec にない key が混入していたら exit 1 すること（`_*` プレフィックスは除外される）
- **手順:**
  1. `cp infra/secrets/staging.json.example /tmp/probe-extra.json`
  2. `jq '. + {"EXTRA_KEY": "x"}' /tmp/probe-extra.json > /tmp/probe-extra.json.tmp && mv /tmp/probe-extra.json.tmp /tmp/probe-extra.json`
  3. `pnpm infra:check-secrets:staging -- /tmp/probe-extra.json`
  4. `rm /tmp/probe-extra.json`
- **期待結果:** exit 1。stderr に「extra: EXTRA_KEY」相当のメッセージ

### 3. `_*` プレフィックスキーは extra 扱いされない

- **目的:** `_my_comment` のような documentation キーが JSON に追加されても check は exit 0 で通ること（filter で drop される前提）
- **手順:**
  1. `cp infra/secrets/staging.json.example /tmp/probe-comment.json`
  2. `jq '. + {"_my_extra_comment": "doc"}' /tmp/probe-comment.json > /tmp/probe-comment.json.tmp && mv /tmp/probe-comment.json.tmp /tmp/probe-comment.json`
  3. `pnpm infra:check-secrets:staging -- /tmp/probe-comment.json`
  4. `rm /tmp/probe-comment.json`
- **期待結果:** exit 0（`_my_extra_comment` は check 側で事前除外されるので extra に出ない）

### 4. 不正な stage 引数

- **目的:** `staging` / `production` 以外の stage を渡したら fail すること
- **手順:**
  1. `pnpm --filter @hollow/infra exec tsx scripts/checkSecrets.ts dev infra/secrets/staging.json.example` を直接実行
- **期待結果:** exit 1。usage 表示

### 5. ファイル不在

- **目的:** decrypted-path に存在しないファイルを渡したら fail すること
- **手順:**
  1. `pnpm infra:check-secrets:staging -- /nonexistent/path.json`
- **期待結果:** exit 1

---

## 既存機能への影響確認

- **`workerSecretSpecs` callsite（`infra/src/index.ts`）**: シグネチャを `Pick<Config, "appName" | "stage">` に狭めたが、既存 callsite は full `Config` を渡しているため後方互換。`pnpm typecheck` で確認
- **既存 `infra/scripts/renderWrangler.ts`**: 触らない。CI workflow の `infra:render:*` ステップに影響なし
- **既存 deploy 順序**: `Deploy Workers` → `Inject secrets` の順序は維持。secret push が失敗してもコード deploy は既に完了しているのは pre-existing な性質（ADR で受け入れ）
- **Cloudflare 上の既存 `_*` secret**: 本 PR merge 後の初回 deploy では bulk-push に `_*` が含まれなくなるが、wrangler は既存 secret を削除しないため `_comment` / `_dispatch_extras_comment` / `_web_only_comment` が Cloudflare ダッシュボードに残り続ける。手動 cleanup は本 PR スコープ外（手順を `docs/deployment_setup.md` に追記）

---

## 確認チェックリスト

- [ ] `pnpm typecheck` が exit 0
- [ ] `pnpm lint:fix` で format/lint エラーなし
- [ ] `pnpm infra:check-secrets:staging -- infra/secrets/staging.json.example` が exit 0、keys=9
- [ ] `pnpm infra:check-secrets:production -- infra/secrets/production.json.example` が exit 0、keys=9
- [ ] missing/extra フェイルパス（probe-missing / probe-extra）が exit 1
- [ ] `_*` プレフィックスキーは check 側で extra 扱いされない
- [ ] `.github/workflows/deploy-staging.yml` の secret 注入ループに `--env indexer` を含む 6 entries が存在
- [ ] `.github/workflows/deploy-production.yml` についても同上
- [ ] workflow の secret 注入ステップが `decrypt → check → jq filter → bulk-push` の順になっている
- [ ] `infra/secrets/README.md` に `^_` 規約・check スクリプト・追加 / 削除フローが反映されている
- [ ] `docs/deployment_setup.md` に追加 / 削除フローと既存 `_*` secret cleanup 手順が反映されている
- [ ] **ブラウザ検証はスキップ** — Web UI 変更ゼロのため（manual-test スキップ条件「Web UI なし変更」を満たす）
