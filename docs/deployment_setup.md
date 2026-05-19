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

1. `infra/src/secrets.ts` の `shared` 配列にキー名を追記
2. `infra/secrets/{staging,production}.enc.json` を `sops` で開いてキーを追加
3. `infra/secrets/{staging,production}.json.example` にも追記
4. `.dev.vars.example` にもローカル用として追記

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
