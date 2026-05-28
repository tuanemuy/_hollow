# 実装計画 — Issue #245: deploy workflow: Deploy Workers ステップに `--env indexer` を追加し、secret push を deploy より前に検証する

**Issue:** #245
**作成日:** 2026-05-28
**複雑度:** 中規模

---

## 目的

`deploy-staging.yml` / `deploy-production.yml` に残る secret bulk-push 周りの pre-existing なギャップを 2 点まとめて閉じる:

- **A.** `Deploy Workers` ステップに `--env indexer` が欠落しており、indexer worker のコード更新が CI から deploy されない。
- **B.** secret の spec 整合チェック (`infra:check-secrets`) が `Deploy Workers` の **後** に走るため、check fail 時に「新コードは deploy 済みだが secret は古いまま」という中間状態が発生し得る。

## スコープ

### 含まれるもの

- `.github/workflows/deploy-staging.yml`:
  - **A**: `Deploy Workers` の command list に `deploy --config wrangler.staging.toml --env indexer` を追加する（service binding の依存方向に従った位置に挿入）。
  - **B**: `Validate secrets` を独立 step として `Deploy Workers` の **前** に切り出し、`sops -d` → `pnpm infra:check-secrets:staging` を fail-fast で実行する。`Inject secrets` step は decrypt + jq フィルタ + bulk push のみを担うようにする。
- `.github/workflows/deploy-production.yml`:
  - 同じ A / B の変更を production workflow に適用する。
- 両 workflow を `workflow_dispatch` で手動実行し、(1) 通常成功シナリオ、(2) check fail シナリオで `Deploy Workers` が走らないことを確認する（testing.md に手順を記載）。

### 含まれないもの

- 既存の Worker deploy 順序（service binding 依存方向）の再検証や変更（Issue #188 の確立した順序を踏襲）。
- `infra:check-secrets` スクリプト本体の改修。
- secret 値の中身の検証（spec 集合チェックのみが本Issueのスコープ。値検証は明示的な非ゴール — `infra/scripts/checkSecrets.ts` の冒頭コメント参照）。
- `Inject secrets` step の名前変更や、check 部分を残すか否かの議論（B 適用後は名前は「Inject secrets」のままで、push 動作のみを担うシンプル化を行う）。
- `Apply D1 migrations` の位置や順序の見直し。

## 調査結果

### 関連ファイル

- `.github/workflows/deploy-staging.yml` (L73-91 が Deploy Workers, L93-123 が Inject secrets)
- `.github/workflows/deploy-production.yml` (L76-94 が Deploy Workers, L96-126 が Inject secrets)
- `wrangler.toml` / `infra/templates/wrangler.staging.toml.tmpl` / `infra/templates/wrangler.production.toml.tmpl` — indexer は service binding を持たず、また誰も indexer を service binding していない (確認済み: `[[services]]` 参照は relay のみ)。
- `infra/scripts/checkSecrets.ts` — 単純な CLI で stage + ファイルパスを受け取り、key 集合の不一致を検出する。値検証や duplicate 検出は非ゴールと明記。
- `package.json` — `infra:check-secrets:staging` / `infra:check-secrets:production` script が定義済み。
- 過去 ADR: `.issue/110/adr.md` ADR-007（per-worker filtering の前提）、`.issue/188`（Deploy Workers の service binding 順序）、`.issue/203` / PR #244（secret bulk-push 側の `--env indexer` 修正と check スクリプト導入）。

### あるべきアーキテクチャ

- `CLAUDE.md` および既存 ADR から、**fail-fast** と **明確な責務分離** が原則。
- `infra:check-secrets` が deploy 前に確実に走るべきという要請は、本 Issue の B が直接そのギャップを埋める。
- Worker deploy 順序は Issue #188 で「Service binding の依存方向」を基準に確立されている: 「binding されない側 → binding する側」の順。

### 既存実装の状態

- A: indexer は wrangler.toml で完全に独立した worker として定義され、他の worker と service binding を持たない (送受信ともゼロ)。よって deploy 順序は `relay → (pruner, dlq, indexer) → consumer → top-level` のいずれの位置でもよく、現行の「依存なし worker のグループ」(pruner, dlq) と同じ階層に配置するのが自然。
- B: 現在 `Inject secrets` step 内で `sops -d` → `check-secrets` → `jq filter` → `wrangler secret bulk` を一連で実行している。Deploy Workers より後に並んでいるのが問題。

### 依存関係

- `Validate secrets` step は `Install sops` の後、`Deploy Workers` の前であればどこでも動く。`Pulumi up` や `Render wrangler.<stage>.toml` は decrypted ファイルに依存しないため、Validate と並行関係でも問題なし。
- decrypted ファイルを step 間で共有するかは設計判断 (ADR-001 で議論)。

## 実装ステップ

### 1. `deploy-staging.yml` に A の修正を適用

- **対象ファイル:** `.github/workflows/deploy-staging.yml`
- **変更内容:** `Deploy Workers` の `command:` リストに `deploy --config wrangler.staging.toml --env indexer` を追加。挿入位置は `--env dlq` の後、`--env consumer` の前（依存なし worker クラスタの末尾）。
- **理由:** indexer は service binding を持たず、依存方向の制約を受けない。pruner/dlq と同じ「依存なし」グループに配置することで、Issue #188 で確立した「binding されない側 → binding する側」の原則を維持する。

### 2. `deploy-staging.yml` に B の修正を適用

- **対象ファイル:** `.github/workflows/deploy-staging.yml`
- **変更内容:**
  1. `Apply D1 migrations` の後、`Deploy Workers` の前に新規 step `Validate secrets` を追加。
  2. `Validate secrets` step では `sops -d infra/secrets/staging.enc.json` を `mktemp` ファイルへ展開し、`pnpm infra:check-secrets:staging -- <path>` を実行。`set -euo pipefail` + `trap rm` で cleanup。
  3. 既存の `Inject secrets` step から `check-secrets` 呼び出しを削除し、decrypt → `jq` フィルタ → bulk push のみを担当させる（decrypt は step 跨ぎで持ち越さず再実行する — ADR-001 参照）。
- **理由:** 受け入れ条件 B の「Worker のコード deploy が先行する中間状態を許さない」要件を満たす。decrypt 再実行のコストは数百ms 程度で fail-fast の利益が圧倒的に大きい。

### 3. `deploy-production.yml` に A の修正を適用

- **対象ファイル:** `.github/workflows/deploy-production.yml`
- **変更内容:** ステップ 1 と同様、`Deploy Workers` の command list に `deploy --config wrangler.production.toml --env indexer` を `--env dlq` と `--env consumer` の間に挿入。
- **理由:** staging と production の workflow は対称性を保つことが暗黙の要請（Issue #203 / PR #244 でも対称的に修正済み）。

### 4. `deploy-production.yml` に B の修正を適用

- **対象ファイル:** `.github/workflows/deploy-production.yml`
- **変更内容:** ステップ 2 と同様、`Apply D1 migrations` の後に `Validate secrets` step を追加し、`Inject secrets` から check 呼び出しを削除。
- **理由:** staging と同じ理由。

### 5. workflow_dispatch で手動実行・受け入れ条件確認

- **対象ファイル:** なし（CI 上で実行）
- **変更内容:** `gh workflow run` で staging を手動実行し、(1) 通常パス成功、(2) わざと spec を壊して check fail させ Deploy Workers がスキップされることを観測する手順を testing.md に記載。
- **理由:** 受け入れ条件 3 番「check fail シナリオで Deploy Workers がスキップされる」の確認。実際の実行はマージ後の運用検証として残す（CI 環境を持つメンテナが実施）。

## 設計判断

詳細は `.issue/245/adr.md` を参照:

- **ADR-001:** decrypted SOPS ファイルを `Validate secrets` と `Inject secrets` で共有するか、各 step で再 decrypt するか → **再 decrypt** を採用。
- **ADR-002:** indexer の deploy 挿入位置 → `dlq` と `consumer` の間（依存なし worker クラスタの末尾）に配置。

## リスクと注意点

- **secret cleanup:** `Validate secrets` で書き出した平文 SOPS は `trap rm -f` で確実に削除する。`set -euo pipefail` 下で `trap` を設定する位置は既存の `Inject secrets` と同じ順序（変数初期化 → trap 設定 → `mktemp` 実行）に揃える。
- **failure 時の Worker 状態:** B の修正により、check fail 時は Worker のコード deploy も migration もまだ行われていないので、infra resource は Pulumi up と Render までは進む。Pulumi 側の差分が secret 整合性と独立して反映される点は ADR-007 の前提を維持する（Issue 本文「Issue #110 ADR-007 と同じ前提として受け入れた」と整合）。
- **production の `workflow_dispatch` 実行に required reviewers が設定済み:** 動作確認のたびに承認が必要。CI 検証は staging で十分。
- **`gh workflow run` の trigger:** `deploy-production.yml` は `tags: v*.*.*` push と `workflow_dispatch` がトリガ。手動実行も承認待ちになる。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` で YAML 以外の副作用がないことを確認（YAML は biome の対象外）。
- `actionlint` があれば workflow YAML の static check を実行（オプション）。
- `gh workflow run deploy-staging.yml` で workflow_dispatch を発火し、(1) 正常系で全 step が green になること、(2) 改ざんした spec で check fail させ、Deploy Workers / Inject secrets が skip されることを確認。
- 詳細は `.issue/245/testing.md` に記載。

## レビュー履歴

### 1周目: セルフレビュー
- 中規模Issueだがサブエージェント委譲なしで進めるため、自己チェックリストで以下を確認:
  - [x] 両 workflow（staging / production）に対称の変更を適用
  - [x] indexer 挿入位置が service binding 依存方向に従う
  - [x] Validate secrets が Deploy Workers より厳密に前
  - [x] decrypted file の cleanup が両 step で trap 済み
  - [x] 受け入れ条件3点をすべてカバー
