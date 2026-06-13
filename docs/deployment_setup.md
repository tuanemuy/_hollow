# デプロイ運用ガイド

## リリース

### staging

`main` に push → 自動で staging に反映。

### production

リリースは release-please による自動バージョニングで運用する。手動の `pnpm version` + タグ push は廃止。

1. `feat:` / `fix:` 等の conventional commit を含む PR を `main` に **squash merge**。
2. release-please が常時1本のリリース PR（version bump + CHANGELOG）を自動作成・更新する。
3. リリース PR をマージ → release-please が `vX.Y.Z` タグ + GitHub Release を自動生成する。
4. タグ push を契機に `Deploy (production)` が起動し、`production` Environment の承認待ちになる。
5. GitHub UI で承認 → デプロイ実行（`Actions → Deploy (production) → Review deployments → Approve`）。

GitHub Release / リリースノートの生成元は release-please に一本化されている（deploy ワークフローは Release を作らない）。

### リポジトリ設定の前提

release-please フローを成立させるため、リポジトリ側に以下の設定が必要（コード変更だけでは完結しない operator 作業）。

- **`RELEASE_PLEASE_TOKEN`（PAT）を secret 登録**（最重要）。`GITHUB_TOKEN` で作成したタグは `Deploy (production)` を起動しないのが GitHub の確定仕様のため、release-please が PAT 名義でタグを push する必要がある。classic PAT なら `repo` scope のみ、fine-grained PAT なら contents: write / pull-requests: write のみで十分（release-please は version bump / CHANGELOG の PR 作成・タグ push・Release 作成しか行わず、`.github/workflows/` 配下を改変しないため `workflow` / `workflows` 権限は不要）。未登録だとリリース PR / タグが作られない、またはタグが deploy を起動しない。
- **merge button は squash merge のみ有効**（merge commit / rebase は無効化）。さらに squash の "Default commit message" を "Pull request title" に設定し、1 PR = 1 conventional commit を担保する（この設定がないと PR 内の中間コミット由来のメッセージが混ざり release-please の解析が乱れる）。
- **ブランチ保護**（`main` は PR 必須）と release-please は両立する。
- **production Environment の deployment branch policy が `v*.*.*`** であること（release-please が生成するタグ形式に一致させる）。

release-please は上記 PAT 名義で動くため、`GITHUB_TOKEN` の権限設定（リポジトリ / Organization のデフォルト workflow permissions）は release-please の動作には影響しない。`release-please.yml` 内の `permissions:` ブロックは慣例として最小権限を明示しているだけで、operator が別途設定する必要はない。

### トラブルシュート

`RELEASE_PLEASE_TOKEN`（PAT）が失効・未更新だと、「リリース PR が作られない／更新されない」または「リリース PR はマージできるがタグ push が `Deploy (production)` を起動しない」という症状が現れる。リリースが進まないときはまず PAT の有効期限と scope を確認する。

### ロールバック

ロールバックは次の優先順で行う。

1. **Cloudflare ダッシュボード**（第一手段）→ 該当 Worker → `Deployments` → 過去版を `Rollback`。
2. **revert PR を `main` に squash merge**。release-please が通常フローで新バージョンのリリース PR を出すので、manifest と齟齬なく復旧できる。
3. **手動タグ push**（緊急時の最終手段。バージョンは例）。

```sh
git checkout v0.1.0
git tag v0.1.2
git push origin v0.1.2
```

> [!WARNING]
> 手動タグ push は release-please の管理外。release-please は `.release-please-manifest.json` で次バージョンを管理するため、手動タグを打つと release-please が認識する最新バージョンと実タグがズレ、次回のバージョン計算が狂う（さらに PAT 名義でないタグが混在する）。どうしても手動タグを打った場合は、`.release-please-manifest.json` と `package.json` の version を手動タグに合わせて整合させること。

## Secret 運用

### 値を更新する

```sh
sops infra/secrets/staging.enc.json
git add infra/secrets/staging.enc.json && git commit -m "chore(secrets): rotate xxx"
```

### 新しい secret を追加する

1. `infra/src/secrets.ts` の該当配列（`shared` / `dispatchExtras`）にキー名を追記
2. `infra/secrets/{staging,production}.enc.json` を `sops` で開いてキーを追加
3. `infra/secrets/{staging,production}.json.example` にも追記
4. `.dev.vars.example` にもローカル用として追記
5. ローカルで spec ↔ enc.json の同期を確認:
   ```sh
   SOPS_AGE_KEY_FILE=~/.config/sops/age/hollow-staging.txt \
     sops -d infra/secrets/staging.enc.json > /tmp/d.json
   pnpm infra:check-secrets:staging -- /tmp/d.json
   rm /tmp/d.json
   ```
production も `hollow-production.txt` で同様に。CI も deploy 前に同じチェックを走らせて missing / extra のいずれも fail-loud に検出する（Issue #203）。

### secret を削除する

1. `infra/src/secrets.ts` から該当キーを削除
2. `infra/secrets/{staging,production}.enc.json` を `sops` で開いて該当行を削除
3. `infra/secrets/{staging,production}.json.example` からも削除
4. `.dev.vars.example` にローカル用エントリがあれば削除
5. ローカルで spec ↔ enc.json の同期を確認（追加フローと同じ 3 ステップ）:
   ```sh
   SOPS_AGE_KEY_FILE=~/.config/sops/age/hollow-staging.txt \
     sops -d infra/secrets/staging.enc.json > /tmp/d.json
   pnpm infra:check-secrets:staging -- /tmp/d.json
   rm /tmp/d.json
   ```
production も同様に。

6. **次回 CI deploy 後**、Cloudflare 側に残る古い secret を全 Worker から手動削除する（`wrangler secret bulk` は追加・更新のみ、削除はしないため）:
   ```sh
   for env_flag in "" "--env relay" "--env consumer" "--env indexer" "--env pruner" "--env dlq"; do
     # shellcheck disable=SC2086
     pnpm exec wrangler secret delete <REMOVED_KEY> --config wrangler.staging.toml $env_flag
   done
   ```
production も同様に。

### `^_` プレフィックスのドキュメント用キー

`infra/secrets/*.json.example` および `*.enc.json` で `_` から始まるキーは documentation-only。CI の `jq` フィルタが bulk-push 前に drop し、`checkSecrets.ts` も比較対象から除外するため、Cloudflare 側には登録されない。隣接する secret の説明コメントとして自由に使ってよい。

### Issue #203 マージ直後の一回限り cleanup

本 Issue #203（PR #244）が merge されると `^_` プレフィックスのキーは bulk-push から落ちる。ただし `wrangler secret bulk` は既存 secret を削除しないため、過去に push 済みの documentation キーが Cloudflare ダッシュボードに残る。merge 直後の deploy 完了を確認したら、operator は staging / production それぞれで以下を 1 度だけ実行する:

```sh
for env_flag in "" "--env relay" "--env consumer" "--env indexer" "--env pruner" "--env dlq"; do
  for legacy_key in _comment _dispatch_extras_comment _resend_api_key_comment; do
    # shellcheck disable=SC2086
    pnpm exec wrangler secret delete "$legacy_key" --config wrangler.staging.toml $env_flag || true
  done
done
```

production は `wrangler.production.toml` で同じループを走らせる。`|| true` は「対象 Worker にその secret が無かった」ケースを無視するため（一部 Worker には push されていない可能性あり）。完了後にダッシュボードで `_` 始まりのエントリが消えていることを目視確認。

### チームメイトを追加する

```sh
$EDITOR .sops.yaml      # creation_rules の age: にメンバーの public key を追記
sops updatekeys infra/secrets/staging.enc.json
sops updatekeys infra/secrets/production.enc.json
```

## Pulumi 運用

### リソースを変更する

1. `infra/src/*.ts` を編集
2. プレビュー: `pnpm infra:preview:staging`
3. commit & push（CI で `pulumi up` 自動実行）

### stack output を `wrangler.*.toml` に出す

1. `infra/src/index.ts` で `export const newField = ...`
2. `infra/scripts/renderWrangler.ts` の `StackOutput` 型 + `vars` map に追記
3. `infra/templates/wrangler.{staging,production}.toml.tmpl` で `${NEW_FIELD}` を使う

### Worker を増やす

1. `app/worker/cloudflare/<role>.ts` に entry を作る
2. `infra/src/config.ts` の `workerNames()` に追加
3. `infra/templates/*.toml.tmpl` に `[env.<role>]` ブロック追加
4. `infra/src/secrets.ts` の `workerSecretSpecs` に追加
5. `.github/workflows/deploy-*.yml` の deploy コマンドと secret bulk ループに追加
6. `package.json` の `deploy:*:<role>` スクリプトを追加

### D1 マイグレーション

通常は CI が `pnpm db:apply:{stage}` で適用するので意識不要。

## ローカルコマンド

```sh
pnpm infra:preview:staging
pnpm infra:up:staging              # 緊急時のみ、通常は CI
pnpm infra:render:staging

sops infra/secrets/staging.enc.json
sops -d infra/secrets/staging.enc.json

pnpm exec wrangler tail --config wrangler.staging.toml
pnpm db:execute:staging <file.sql>
```

ローカルで `pulumi` / `wrangler` を叩くときは `CLOUDFLARE_API_TOKEN` が必要。
