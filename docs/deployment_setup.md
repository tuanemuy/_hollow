# デプロイ運用ガイド

## リリース

### staging

`main` に push → 自動で staging に反映。

### production

```sh
pnpm version patch     # または minor / major
git push --follow-tags
```

タグ push → GitHub UI で承認待ち → `Actions → Deploy (production) → Review deployments → Approve`。

### ロールバック

```sh
git checkout v0.1.0
git tag v0.1.2
git push origin v0.1.2
```

または Cloudflare ダッシュボード → 該当 Worker → `Deployments` → 過去版を `Rollback`。

---

## Secret 運用

### 値を更新する

```sh
sops infra/secrets/staging.enc.json
git add infra/secrets/staging.enc.json && git commit -m "chore(secrets): rotate xxx"
```

### 新しい secret を追加する

1. `infra/src/secrets.ts` の該当配列（`shared` / `dispatchExtras` 等）にキー名を追記
2. `infra/secrets/{staging,production}.enc.json` を `sops` で開いてキーを追加
3. `infra/secrets/{staging,production}.json.example` にも追記
4. `.dev.vars.example` にもローカル用として追記
5. ローカルで spec ↔ enc.json の同期を確認:
   ```sh
   sops -d infra/secrets/staging.enc.json > /tmp/d.json
   pnpm infra:check-secrets:staging -- /tmp/d.json
   rm /tmp/d.json
   ```
   production も同様に。CI も deploy 前に同じチェックを走らせて missing / extra のいずれも fail-loud に検出する（Issue #203）。

### secret を削除する

1. `infra/src/secrets.ts` から該当キーを削除
2. `infra/secrets/{staging,production}.enc.json` を `sops` で開いて該当行を削除
3. `infra/secrets/{staging,production}.json.example` からも削除
4. `pnpm infra:check-secrets:<stage>` で同期確認
5. **次回 CI deploy 後**、Cloudflare 側に残る古い secret を全 Worker から手動削除する（`wrangler secret bulk` は追加・更新のみ、削除はしないため）:
   ```sh
   for env_flag in "" "--env relay" "--env consumer" "--env indexer" "--env pruner" "--env dlq"; do
     # shellcheck disable=SC2086
     pnpm exec wrangler secret delete <REMOVED_KEY> --config wrangler.staging.toml $env_flag
   done
   ```
   production も同様に。

### `^_` プレフィックスのドキュメント用キー

`infra/secrets/*.json.example` および `*.enc.json` で `_` から始まるキーは documentation-only。CI の `jq` フィルタが bulk-push 前に drop し、`checkSecrets.ts` も比較対象から除外するため、Cloudflare 側には登録されない。隣接する secret の説明コメントとして自由に使ってよい。

### チームメイトを追加する

```sh
$EDITOR .sops.yaml      # creation_rules の age: にメンバーの public key を追記
sops updatekeys infra/secrets/staging.enc.json
sops updatekeys infra/secrets/production.enc.json
```

---

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

---

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
