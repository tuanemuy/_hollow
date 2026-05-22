# 動作確認計画 — Issue #139: WorkersRoute を Pulumi から wrangler.toml に移管

**Issue:** #139
**作成日:** 2026-05-23

---

## 確認環境

このIssueは **infra 設定の移管**であり、アプリケーションの画面挙動には影響しない。検証はコマンドベースで完結する（ブラウザ画面操作のテスト項目は含まない）。

### 検証環境の起動

ローカル開発サーバーは本Issueの変更対象外（`wrangler.toml` は変更しない）。それでも回帰確認したい場合のみ:

```bash
pnpm dev   # 既存どおり起動できることだけ確認
```

### デプロイ方法

staging で実機検証する手順（`infra/` ディレクトリ内で実施するコマンドは明示）:

```bash
# 1. テンプレートから wrangler.staging.toml を再生成
pnpm infra:render:staging

# 2. Pulumi プレビュー（WorkersRoute 削除以外に差分がないこと）
pnpm infra:preview:staging

# 3. wrangler のドライラン（web Worker のビルドが通ること）
pnpm deploy:staging:dry

# 4. Pulumi state から既存 WorkersRoute を削除（pulumi up 前に必須）
cd infra
# URN は事前に確認（state の構造が将来変わっても破綻しないように）
pulumi state list --stack staging 2>&1 | grep workersRoute
pulumi state delete --stack staging \
  'urn:pulumi:staging::hollow::cloudflare:index/workersRoute:WorkersRoute::route-staging'
cd ..

# 5. Pulumi up（destroy が出ない / no-op であること）
pnpm infra:up:staging

# 6. 実デプロイ（route が wrangler 側から適用される）
pnpm deploy:staging
```

production への反映は staging で全項目 PASS したことを確認後、同じ手順で実施（`staging` を `production` に置換）。production はメンテナンスウィンドウ推奨。

## 確認項目

### 1. レンダリングされた wrangler.staging.toml に routes ブロックがある

- **目的:** テンプレート編集が反映され、staging.toml に正しい route 宣言が含まれることを確認
- **手順:**
  1. `pnpm infra:render:staging` を実行
  2. `wrangler.staging.toml` を開く
  3. トップレベル（`name = "..."` 直下〜`[assets]` 周辺）に `routes = [...]` ブロックがあることを確認
- **期待結果:** 以下のようなブロックが存在する
  ```toml
  routes = [
    { pattern = "staging.hollow.maku-ja.com/*", zone_name = "maku-ja.com" }
  ]
  ```
- **確認ポイント:** `pattern` の hostname が `infra/Pulumi.staging.yaml` の `hollow:hostname` と一致

### 2. レンダリングされた wrangler.production.toml に routes ブロックがある

- **目的:** production テンプレートも staging と対称に修正されていることを確認
- **手順:**
  1. `pnpm infra:render:production` を実行
  2. `wrangler.production.toml` に `routes = [{ pattern = "hollow.maku-ja.com/*", zone_name = "maku-ja.com" }]` があることを確認
- **期待結果:** production の hostname で routes が宣言されている
- **確認ポイント:** staging との取り違えがないこと（hostname に `staging.` プレフィックスが付いていないこと）

### 3. wrangler ドライランが成功する

- **目的:** routes 追加で wrangler 設定が壊れていないことを確認
- **手順:**
  1. `pnpm deploy:staging:dry` を実行
- **期待結果:** エラーなく完了し、`dist/worker/` にビルド成果物が生成される
- **確認ポイント:** wrangler の出力に `routes` 関連の警告が出ていないこと

### 4. Pulumi preview の差分が WorkersRoute 削除のみ

- **目的:** dns.ts / index.ts の変更が他リソースに副作用を出していないことを確認
- **手順:**
  1. `pnpm infra:preview:staging` を実行
- **期待結果:** 差分が `cloudflare:index/workersRoute:WorkersRoute :: route-staging` の **delete** 1件のみ（AAAA / D1 / Queue / R2 に差分なし）
- **確認ポイント:** 削除候補に AAAA レコードが入っていないこと

### 5. Pulumi up が destroy を発生させない（state delete 後）

- **目的:** state delete を先に実行することで pulumi up が no-op になることを確認
- **手順:**
  1. `pulumi state delete --stack staging '...workersRoute...route-staging'`
  2. `pnpm infra:preview:staging` → 差分なしを確認
  3. `pnpm infra:up:staging` → 「no changes」または「unchanged」のサマリ
- **期待結果:** state delete 後に preview / up の差分がゼロ
- **確認ポイント:** Cloudflare 側に WorkersRoute が残っていること（dashboard で確認可）

### 6. wrangler deploy で route が wrangler 管理に切り替わる

- **目的:** wrangler が既存ルートを認識して再関連付けるか上書きすることを確認
- **手順:**
  1. `pnpm deploy:staging` を実行
  2. Cloudflare dashboard の Workers Routes ページで `staging.hollow.maku-ja.com/*` を確認
  3. `curl -I https://staging.hollow.maku-ja.com/` で 200 OK が返ることを確認
- **期待結果:** route が web Worker に紐づいた状態で残り、HTTPS リクエストが処理される
- **確認ポイント:** route 一覧に重複（同じ pattern が 2 行）が無いこと

## エッジケース・異常系

### 1. state delete を忘れて pulumi up を実行した場合

- **目的:** リカバリー手順が機能することを確認（staging で意図的に再現）
- **手順:**
  1. WorkersRoute 削除後の Pulumi コードで、`pulumi state delete` をスキップして `pnpm infra:up:staging` を実行
  2. Cloudflare dashboard で route が destroy されたことを確認
  3. 即座に `pnpm deploy:staging` を実行
- **期待結果:** wrangler deploy 完了後、route が再作成されてアクセス可能に戻る
- **確認ポイント:** ダウンタイムが数十秒〜数分以内に収まる

### 2. テンプレート同期忘れ（staging だけ更新して production を放置）

- **目的:** ドキュメント注意喚起の有効性を確認
- **手順:** plan.md / template の同期コメント / runtime_cloudflare.md の記述を読み返し、production のレビュー観点として明記されているかを確認
- **期待結果:** PR レビュー時に production テンプレートも同時更新されていることが確認できる構造になっている

## 既存機能への影響確認

- **AAAA レコード**: `pnpm infra:preview:staging` で AAAA に差分が出ていないこと（残存している）
- **他 Worker のデプロイ**: relay / consumer / pruner / dlq には routes を追加していないので、`pnpm deploy:staging:relay:dry` 等が変わらず通ること
- **ローカル開発**: `wrangler.toml`（local 用）に routes は不要（ローカルは routes を持たない）— `pnpm dev` がそのまま起動できること

## 確認チェックリスト

- [ ] `pnpm infra:render:staging` が成功し、生成ファイルに routes ブロックがある
- [ ] `pnpm infra:render:production` が成功し、production 用 hostname で routes ブロックがある
- [ ] `pnpm deploy:staging:dry` が成功する
- [ ] `pnpm deploy:production:dry` が成功する
- [ ] `pnpm infra:preview:staging` の差分が WorkersRoute 削除 1件のみ
- [ ] staging で `pulumi state delete` 後の `pnpm infra:up:staging` が no-op
- [ ] staging で `pnpm deploy:staging` 後、`curl -I https://staging.hollow.maku-ja.com/` が 200 OK
- [ ] Cloudflare dashboard で staging route が web Worker に紐づいたまま重複していない
- [ ] AAAA レコード（`100::`）が staging / production 両方で残っている
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` がすべて成功
