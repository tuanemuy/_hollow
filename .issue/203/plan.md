# 実装計画 — Issue #203: deploy workflow: secret bulk-push の堅牢性を強化する

**Issue:** #203
**作成日:** 2026-05-27
**複雑度:** 中〜大規模

---

## 目的

`wrangler secret bulk` を使う deploy workflow に潜在する 3 つの silent breakage を一括で潰す。secret SSOT (`workerSecretSpecs()`) と実 secret JSON / Cloudflare 上の secret セットが噛み合わない状況を、CI で fail-loud に検出できる体制へ移行する。

## スコープ

### 含まれるもの

- **A:** `.github/workflows/deploy-{staging,production}.yml` の secret bulk-push ループに `--env indexer` を追加
- **B:** 同 workflow の bulk-push 直前で `^_` プレフィックスの JSON キーを `jq` で drop
- **C:** `infra/scripts/checkSecrets.ts` を新規追加し、`workerSecretSpecs()` の union と decrypted JSON keys の差分を fail-loudly に検出。両 workflow の bulk-push 直前ステップで必須化
- `infra/package.json` / ルート `package.json` に `pnpm infra:check-secrets:<stage>` script を追加
- secret 運用の SSOT である `infra/secrets/README.md` と `docs/deployment_setup.md` に、新しい invariant（`^_` 除外と pre-deploy check 必須化）を反映

### 含まれないもの

- **`Deploy Workers` ステップの `--env indexer` 欠落（pre-existing gap）**: `deploy-{staging,production}.yml` L79–L84 / L82–L87 にも同じ漏れがあるが、本 Issue は **secret bulk-push** に閉じる。フォローアップ Issue 候補として Phase 4 で扱う。
- 既に Cloudflare 側に push 済みの `_comment` / `_dispatch_extras_comment` / `_resend_api_key_comment` secret の削除作業（wrangler は bulk push で「渡されなかった既存 secret」を消さないため手動 `wrangler secret delete` が必要。手順は `docs/deployment_setup.md` に追記するが本 PR では実行しない）
- `workerSecretSpecs()` の per-worker filtering（ADR-007 #110 で別 Issue）

## 実装ステップ

### 0. `workerSecretSpecs` のシグネチャを `Pick<Config, "appName" | "stage">` に狭める

- **対象ファイル:** `infra/src/secrets.ts`
- **変更内容:**
  - `workerSecretSpecs(cfg: Config)` → `workerSecretSpecs(cfg: Pick<Config, "appName" | "stage">)`
  - JSDoc に「The CI workflow's `checkSecrets.ts` validates this spec against the decrypted SOPS file before `wrangler secret bulk`, so a key here that's missing from `infra/secrets/<stage>.enc.json`（あるいはその逆）は deploy 前に fail-loud に検出される」と追記
  - `^_` プレフィックス規約が「documentation-only キーの目印」であることを 1 行コメントで残す（後段の filter / check の根拠を明示）
- **理由:** 関数実体は `workerNames(cfg)` 経由でしか cfg を見ず、`workerNames` は `Pick<Config, "appName" | "stage">` で済む（`infra/src/config.ts:36`）。`checkSecrets.ts` が pulumi 依存なしに動くためにシグネチャを実態へ合わせる小リファクタ。callsite は `infra/src/index.ts` 周辺の 1 箇所のみ（実行時に full `Config` を渡しているため後方互換）

### 1. `infra/scripts/checkSecrets.ts` を新規作成

- **対象ファイル:** `infra/scripts/checkSecrets.ts`（新規）
- **変更内容:**
  - shebang `#!/usr/bin/env tsx`。`infra/scripts/renderWrangler.ts` のスタイル（stage 型ガード、`process.exit(1)`）に揃える
  - CLI 引数: `<stage> <decrypted-json-path>`（どちらも positional、必須）
  - `infra/src/secrets.ts` から `workerSecretSpecs` をインポート（Step 0 でシグネチャを `Pick<Config, "appName" | "stage">` に狭めてある）
  - **`workerSecretSpecs()` が返す `.secrets: readonly string[]` 配列は `appName` 値に依存しない**ことを invariant として利用し、`{ appName: "check", stage }` のダミーを渡す（コード内に invariant コメントを残す）
  - `expected = new Set(...workerSecretSpecs(...).flatMap(s => s.secrets))` を計算
  - `actual = new Set(Object.keys(JSON.parse(decrypted)).filter(k => !k.startsWith("_")))` を計算（`^_` キーは check 側で除外して比較）
  - `missing = expected \ actual`、`extra = actual \ expected` を計算
  - どちらかが空でなければ `console.error` で詳細出力して `process.exit(1)`
  - 成功時は `✓ secrets check passed (stage=<stage>, keys=<n>)` を出力
- **理由:** 「pre-deploy で spec と実 secret JSON の差分を fail-loudly に検出する」という C 要件の中核。`workerSecretSpecs()` を直接読むことで SSOT との同期を保証する

### 2. `infra/package.json` に check script を追加

- **対象ファイル:** `infra/package.json`
- **変更内容:** `scripts` に追加（既存 `render:*` と同じ命名規約）:
  ```json
  "check-secrets:staging": "tsx scripts/checkSecrets.ts staging",
  "check-secrets:production": "tsx scripts/checkSecrets.ts production"
  ```
  positional 引数の `<decrypted-json-path>` は呼び出し側から渡す前提
- **理由:** 既存 `render:staging` / `secrets:edit:staging` と同じ階層と命名で operator がローカルでも実行できるようにする

### 3. ルート `package.json` にプロキシ script を追加

- **対象ファイル:** `package.json`
- **変更内容:** `infra:render:*` の直後に追加:
  ```json
  "infra:check-secrets:staging": "pnpm --filter @hollow/infra check-secrets:staging",
  "infra:check-secrets:production": "pnpm --filter @hollow/infra check-secrets:production"
  ```
- **理由:** Issue の受け入れ条件 C「`pnpm infra:check-secrets:<stage>` 相当」を満たす

### 4. `deploy-staging.yml` の secret 注入ステップを書き換え

- **対象ファイル:** `.github/workflows/deploy-staging.yml`（L86–L100）
- **変更内容:**
  ```yaml
  - name: Inject secrets (SOPS → wrangler secret bulk)
    env:
      SOPS_AGE_KEY: ${{ secrets.SOPS_AGE_KEY }}
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    run: |
      set -euo pipefail
      DECRYPTED_RAW=$(mktemp)
      DECRYPTED_FILTERED=$(mktemp)
      trap 'rm -f "$DECRYPTED_RAW" "$DECRYPTED_FILTERED"' EXIT
      sops -d infra/secrets/staging.enc.json > "$DECRYPTED_RAW"

      # C: spec ↔ decrypted JSON の差分を fail-loudly に検出（filter 前の raw に対して実行）
      # `--` セパレータで pnpm filter 越しに引数を明示的に passthrough する
      pnpm infra:check-secrets:staging -- "$DECRYPTED_RAW"

      # B: ^_ プレフィックスのドキュメント用キーを bulk-push から除外
      jq 'with_entries(select(.key | startswith("_") | not))' "$DECRYPTED_RAW" > "$DECRYPTED_FILTERED"

      # A: indexer worker をループに追加
      for env_flag in "" "--env relay" "--env consumer" "--env indexer" "--env pruner" "--env dlq"; do
        # shellcheck disable=SC2086
        pnpm exec wrangler secret bulk "$DECRYPTED_FILTERED" --config wrangler.staging.toml $env_flag
      done
  ```
- **理由:** A / B / C 全てを 1 ステップに集約。順序は decrypt → check → filter → push。check は filter 前の raw に対して走らせるが、check 側で `^_` を事前除外するため `_*` キーは extra として検出されない。万一 B の filter が壊れて `_*` が含まれたまま push される事態が起きれば、それは別経路の問題（check が pass しても push 時のキー混入として現れる）。**check 自身の責務は「spec と decrypted JSON が同期しているか」のみに絞る**

### 4.5. `.json.example` の現状確認（Phase 2 で確認した結果: 既に同期済み）

- **対象ファイル:** `infra/secrets/staging.json.example` / `infra/secrets/production.json.example`
- **確認結果:** 両 `.json.example` は Issue #197/PR #200 で既に `RESEND_API_KEY` を追加・`ADMIN_SETUP_TOKEN` を削除済で、`workerSecretSpecs()` の最新 union（9 keys）と完全一致する。documentation キーは `_comment` / `_dispatch_extras_comment` / `_resend_api_key_comment` の 3 つで、いずれも `^_` プレフィックス規約に沿う。**本 PR では `.json.example` への変更は不要**
- **`.enc.json` 側について:** `infra/secrets/staging.enc.json` / `production.enc.json` 側にも Issue #197 当時の乖離（`RESEND_API_KEY` 欠落 / 旧 `ADMIN_SETUP_TOKEN` 余剰）が残っている可能性が高い（Issue #203 本文より: 「`.enc.json` への実値注入は別途運用手順として外出ししている」）。SOPS 復号には個人の age key が必要で本 PR では編集できないため、**operator 作業として** merge 前に `sops infra/secrets/<stage>.enc.json` で `RESEND_API_KEY` を追加し（必要なら）旧 `ADMIN_SETUP_TOKEN` を削除する手順を `docs/deployment_setup.md` に明記する

### 5. `deploy-production.yml` に同一の変更を適用

- **対象ファイル:** `.github/workflows/deploy-production.yml`（L89–L103）
- **変更内容:** Step 4 と同じ差分（`--` セパレータ含む）を `staging` → `production`、`wrangler.staging.toml` → `wrangler.production.toml`、`infra:check-secrets:staging` → `infra:check-secrets:production` に置換して適用
- **理由:** 受け入れ条件は staging / production 両方が対象。Issue 本文も両 workflow を明示

### 6. ドキュメント更新

- **対象ファイル:** `infra/secrets/README.md` / `docs/deployment_setup.md`
- **変更内容:**
  - `infra/secrets/README.md`: 以下を追記
    - 「`^_` で始まる JSON キーは documentation-only、CI の `jq` フィルタが bulk-push 前に drop する」
    - 「`pnpm infra:check-secrets:<stage> -- <decrypted-path>` が CI で `workerSecretSpecs()` との同期を必須化している」
    - secret **追加** フロー（spec 追加 → enc.json 追加 → ローカルで check 実行 → commit）
    - secret **削除** フロー（spec 削除 → enc.json 削除 → ローカルで check 実行 → commit → 初回 deploy 後に Cloudflare 側で `wrangler secret delete <key> --config wrangler.<stage>.toml [--env ...]` を全 worker 分手動実行）
  - `docs/deployment_setup.md`: 「Adding / rotating a secret」セクションに、上記 README へのリンク + 「`workerSecretSpecs()` 追加 → `infra/secrets/<stage>.enc.json` 追加 → ローカル check → CI で自動 fail-loud 検証」のシーケンスを 1 段落で記載。既存 `_*` secret の手動 cleanup 手順もここに 1 度書いておく（本 PR merge 直後の運用作業）
  - 必要に応じて `docs/runtime_cloudflare.md` の deploy 節を軽く更新
- **理由:** 本 Issue で導入する invariant（`^_` 除外、pre-deploy check 必須、削除フロー）が将来作業の前提となる。SSOT から漏れるとまた silent breakage が再発する

### 7. 動作確認

- `pnpm typecheck` で型チェック（Step 0 のシグネチャ変更も含めて pass）
- `pnpm lint:fix && pnpm format` で Biome
- `pnpm infra:check-secrets:staging -- infra/secrets/staging.json.example` — `_*` 除外後に SSOT と一致するかを `.json.example` で確認（実 `.enc.json` を復号する必要がない smoke test）
  - **expected key 集合（Issue #197/PR #200 後の最新で 9 個）**: shared (4: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`) ∪ dispatchExtras (5: `SECRET_BOX_MASTER_KEY`, `ADMIN_LLM_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`)
  - `.json.example` は本 PR の Step 4.5 で spec に同期するため、`_*` 除外後に同じ 9 個になる
- `pnpm infra:check-secrets:production -- infra/secrets/production.json.example` も同様
- フェイルパスの確認: `.json.example` を一時的にコピーして 1 key 削除 → `missing` で exit 1、`EXTRA_KEY` を追加 → `extra` で exit 1
- 実 `.enc.json` を使った検証（任意・operator がローカル age key を持つ場合）:
  ```sh
  sops -d infra/secrets/staging.enc.json > /tmp/d.json
  pnpm infra:check-secrets:staging -- /tmp/d.json
  rm /tmp/d.json
  ```
- `actionlint` があれば workflow YAML を lint（任意）

## 設計判断

詳細は `adr.md` 参照。要点:

- **ADR-001:** jq フィルタは中間ファイル方式（stdin pipe より明快、check と filter の両方で同じ raw ファイルを使える）
- **ADR-002:** check の検出範囲は missing ∪ extra の両方（missing だけでは push 後に「extra な _* secret が混入していた」を見逃す）
- **ADR-003:** workflow での順序は decrypt → check → filter → push。check は raw に対して走らせ、check 内部で `^_` を事前除外して比較
- **ADR-004:** `workerSecretSpecs()` のシグネチャを `Pick<Config, "appName" | "stage">` に狭め、`checkSecrets.ts` から `appName` ダミー値で呼べるようにする
- **ADR-005:** pnpm filter 経由の引数 passthrough は `--` セパレータを明示的に使う（`pnpm infra:check-secrets:<stage> -- <path>`）。pnpm の bare passthrough 挙動はバージョン依存があるため、`--` 明示で安定化する

## リスクと注意点

- **`Deploy Workers` ステップの `--env indexer` 欠落（pre-existing gap）**: secret bulk-push のループだけ直しても、`Deploy Workers` ステップが indexer をデプロイしないため、indexer のコード変更が反映されない状態が続く。本 Issue は **secret bulk-push** に閉じるので別 Issue として切り出すが、本 PR merge と並行して Phase 4 で必ずフォローアップ Issue を起票し、本 PR の中で残骸とならないようにする（secret は届くがコードは古い、という非対称が長期化しないよう運用上即時着手する想定）
- **既存 `_*` secret の Cloudflare 上残存**: 本変更後の初回 deploy では bulk-push に `_*` が含まれなくなるが、wrangler は「渡されなかった既存 secret」を削除しない。Cloudflare ダッシュボードに既存の `_comment` / `_dispatch_extras_comment` / `_resend_api_key_comment` が残るため、operator が `wrangler secret delete _comment --config wrangler.{stage}.toml [--env ...]` で各 worker × 各 `_*` キーを手動削除する必要がある。手順を `docs/deployment_setup.md` に追記
- **`.enc.json` 側の Issue #197 残骸**: `.enc.json` には `RESEND_API_KEY` がまだ追加されておらず、旧 `ADMIN_SETUP_TOKEN` が残っている可能性が高い（Issue 本文より）。本 PR は SOPS 復号権限なしで `.enc.json` を編集できないため、merge 前に operator が `sops infra/secrets/<stage>.enc.json` で同期させる必要がある。同期せずに merge すると初回 deploy で CI check が `missing: RESEND_API_KEY` / `extra: ADMIN_SETUP_TOKEN` で fail する（**これが本 Issue の意図する fail-loud 検出そのもの**だが、運用上は事前に解消したい）。手順を `docs/deployment_setup.md` に追記
- **`appName` invariant の将来破綻**: `workerSecretSpecs()` が将来 `appName` 依存になったら checkSecrets.ts のダミー値が壊れる。コードコメントで invariant を明示し、`infra/src/secrets.ts` 側にも「`.secrets` 配列は `appName` 依存にしない」旨を残すことを検討
- **CI fail 時の blast radius**: pre-deploy check が fail した場合、Worker の `deploy` 自体は既に完了している（順序が deploy → secret push のため）。これは現状と同じ blast radius（secret 不一致のまま新コードが稼働する瞬間がある）。Issue #110 ADR-007 と同じ前提なので本 Issue では受け入れ、運用は「fail loud で次の deploy までに必ず直す」に依拠する

## テスト方針

- **ローカル smoke**:
  - `pnpm infra:check-secrets:staging -- infra/secrets/staging.json.example` → `_*` 除外後に SSOT と一致して exit 0
  - `pnpm infra:check-secrets:production -- infra/secrets/production.json.example` → 同上
  - 一時コピー（例: `cp infra/secrets/staging.json.example /tmp/probe.json`）から `BETTER_AUTH_SECRET` を削除して再実行 → `missing` で exit 1
  - 同コピーに `"EXTRA_KEY": "x"` を追加して再実行 → `extra` で exit 1
  - `jq 'with_entries(select(.key | startswith("_") | not))' infra/secrets/staging.json.example` で `_*` が消えることを確認
- **静的検証**: `pnpm typecheck` で TS、`pnpm lint:fix && pnpm format` で Biome
- **CI**: feature branch で PR を作って Draft で開いた後、staging への deploy は `workflow_dispatch` で意図的に走らせるかは optional（実環境への影響があるため Phase 2 では実走させない方針。merge 後の通常 deploy で初回走行）
- **ブラウザ検証**: 本 Issue は infra/CI のみで Web UI 変更ゼロのため manual-test スキップ（条件: Web UI なし変更）

## レビュー履歴

### 1周目

**修正した点**:
- 要件 P-001 / アーキ P-002（同一指摘）: `pnpm --filter` 経由の末尾引数 passthrough が version 依存で脆弱 → `--` セパレータを明示する方針に統一。Step 4/5/7 と README の記載を更新、ADR-005 を新設
- アーキ P-001: `workerSecretSpecs(cfg: Config)` のフル `Config` 要求 → `Pick<Config, "appName" | "stage">` に狭める実装ステップ（Step 0）を追加し、ADR-004 を「シグネチャを狭めた上でダミー値で呼ぶ」に更新
- アーキ P-003: smoke の expected key 数（9 個: shared 3 + dispatchExtras 5 + webOnly 1）と `.json.example` 側の一致を Step 7 に明記

**取り込んだ改善提案**:
- 要件 S-001 / アーキ S-002: `^_` プレフィックス規約と「fail loudly」コメントを `infra/src/secrets.ts` 側にも反映する旨を Step 0 に明記
- 要件 S-002 / アーキ S-001: `Deploy Workers` の indexer 漏れフォローアップ Issue は本 PR と並行して Phase 4 で起票する旨をリスク欄で強調
- 要件 S-003: 実 `.enc.json` を使ったローカル smoke 手順（`sops -d` → check）を Step 7 に optional として追記
- アーキ S-003: docs に **削除** フローも追記する旨を Step 6 で明文化
- アーキ S-005: `tsx` 依存は既に `infra/package.json` の devDependencies にある事実を確認済み（`renderWrangler.ts` と同じ前提）

**見送った提案とその理由**:
- アーキ S-004（`PREFIX = "_"` 定数の export）: workflow YAML から TS 定数を読めないため、SSOT 化の効果が限定的。コメント明示（Step 0）で十分と判断。本 Issue 範囲では見送り

### 2周目

両視点とも問題点ゼロで終了（実装ステップが既存スタイルに沿い、引数 passthrough・型シグネチャの問題は 1 周目で解消されたため）
