# 動作確認計画 — Issue #102: production SECRET_BOX_MASTER_KEY setup & NullSecretBox fallback evaluation

**Issue:** #102
**作成日:** 2026-05-31

---

## 確認環境

本 Issue の変更（`selectSecretBox` ファクトリ + DI 配線 + CI 値ガード + ドキュメント）は、起動済み Web アプリのブラウザ操作ではなく**自動テスト中心**で検証する。理由: 変更の主役は container 構築時の分岐ロジックと CI スクリプトであり、UI 上の振る舞い変化を伴わない。

### 検証コマンド（package.json scripts で実在確認済み）

```bash
pnpm typecheck                 # tsgo 型検査
./node_modules/.bin/biome check   # lint/format（rtk が pnpm lint を書き換える既知問題を回避）
pnpm test:unit                 # vitest run（secretBox / serverCloudflare / checkSecrets のユニットテスト）
pnpm test:integration          # vitest run --config vitest.config.integration.ts（DI 統合テスト）
```

CI 側の placeholder ガードを手元で確認する場合（SOPS 復号には age 鍵が必要 — 鍵が無ければスキップ）:

```bash
SOPS_AGE_KEY_FILE=~/.config/sops/age/hollow-production.txt \
  sops -d infra/secrets/production.enc.json > /tmp/d.json
pnpm infra:check-secrets:production -- /tmp/d.json   # placeholder 値が含まれていれば exit 1
rm /tmp/d.json
```

### デプロイ方法

なし（検証コマンドのみで確認できる）。実環境への secret 反映は `wrangler secret bulk`（CI `Inject secrets` ステップ）/ `wrangler secret put SECRET_BOX_MASTER_KEY --config wrangler.production.toml` で行うが、本 Issue の確認には不要。

## 確認項目

### 1. `selectSecretBox` の fail-soft（dev / staging）

- **目的:** `requireKey:false` で未設定なら `NullSecretBox` を返し、操作時にのみ失敗することを確認する。
- **手順:**
  1. `pnpm test:unit` を実行。
  2. `secretBox.test.ts` の `selectSecretBox(unset, {requireKey:false})` → `NullSecretBox` ケースが PASS することを確認。
- **期待結果:** container 構築は成功し、`encrypt`/`decrypt` 呼び出し時に `SecretBoxError(KeyUnavailable)`。
- **確認ポイント:** dev の起動性（`/admin` 描画）を壊していないこと。

### 2. `selectSecretBox` の fail-fast（production / staging）

- **目的:** `requireKey:true` で未設定・空文字なら即 throw することを確認する。
- **手順:**
  1. `pnpm test:unit` を実行。
  2. `selectSecretBox(unset|emptyString, {requireKey:true})` → throw ケースが PASS することを確認。
- **期待結果:** `SecretBoxError(KeyUnavailable)` が container 構築時点で投げられる。

### 3. shipped placeholder ガード（runtime）

- **目的:** key-required 環境で dev placeholder を弾くことを確認する。
- **手順:**
  1. `pnpm test:unit` を実行。
  2. `selectSecretBox(SHIPPED_DEV_PLACEHOLDER_KEY, {requireKey:true})` → throw、`{requireKey:false}` → `WebCryptoSecretBox` の両ケースが PASS することを確認。
- **期待結果:** production で placeholder 拒否、dev では許容。

### 4. placeholder 定数と `.dev.vars.example` の同期

- **目的:** `SHIPPED_DEV_PLACEHOLDER_KEY` 定数が `.dev.vars.example` の値と一致することを確認する。
- **手順:**
  1. `pnpm test:unit` を実行。
  2. 同期テストが PASS することを確認。
- **期待結果:** 定数と example がズレていないこと（ズレていれば FAIL してガード空振りを検知）。

### 5. DI 配線の fail-fast threading

- **目的:** `requireKey` が `readRequestServerConfig → createRequestContainer` まで届くことを確認する。
- **手順:**
  1. `pnpm test:unit`（および必要に応じ `pnpm test:integration`）を実行。
  2. `serverCloudflare.test.ts` の追加ケース（production 相当 + 未設定で container 構築が throw）が PASS することを確認。
- **期待結果:** `REQUIRE_SECRET_BOX_KEY="true"` + 未設定で `createRequestContainer` が throw。

### 6. round-trip 回帰

- **目的:** 有効鍵で暗号化/復号が引き続き成立することを確認する。
- **手順:**
  1. `pnpm test:unit` を実行。
  2. `selectSecretBox(validKey, *)` → encrypt → decrypt round-trip ケースが PASS することを確認。
- **期待結果:** 既存の `WebCryptoSecretBox` 挙動が不変。

## エッジケース・異常系

### 1. 不正値（非 base64 / 非 32byte）

- **目的:** `requireKey` の値に関わらず constructor が eager throw することを確認する。
- **手順:** `selectSecretBox(invalidKey, {requireKey:true|false})` のテストケースを確認。
- **期待結果:** `SecretBoxError(KeyUnavailable)`（既存 `decodeMasterKey` の挙動を維持）。

### 2. CI placeholder 検知

- **目的:** 復号済み JSON に shipped placeholder が含まれると deploy が止まることを確認する。
- **手順:** `checkSecrets.ts` の追加ユニットテスト（placeholder 値で exit 1 / 正常値で pass）を `pnpm test:unit` で確認。SOPS 鍵があれば上記の実コマンドでも確認。
- **期待結果:** placeholder 検出時に非ゼロ終了。

## 既存機能への影響確認

- **`/admin/llm` の DB 保存 api key 暗号化/復号**: 有効鍵を設定した既存経路が壊れていないこと（round-trip テストでカバー）。
- **既存 `serverCloudflare.test.ts` の secretBox 分岐テスト**: `requireKey` 追加で既存ケースが回帰しないこと。
- **`WebCryptoSecretBox.fromEnv()` の利用箇所**: 整理（削除 or deprecate）後も依存テスト/ヘルパーが緑であること。

## 確認チェックリスト

- [ ] `pnpm typecheck` が緑
- [ ] `./node_modules/.bin/biome check` が緑
- [ ] `pnpm test:unit` が緑（secretBox / serverCloudflare / checkSecrets の新規・既存ケース）
- [ ] `pnpm test:integration` が緑
- [ ] fail-soft（requireKey:false）と fail-fast（requireKey:true）の両挙動を確認
- [ ] placeholder ガード（runtime + CI）を確認
- [ ] placeholder 定数 ↔ `.dev.vars.example` 同期を確認
- [ ] 有効鍵の round-trip 回帰なし
