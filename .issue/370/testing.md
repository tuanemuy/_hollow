# 動作確認計画 — Issue #370: SECRET_BOX_MASTER_KEY rotation の再暗号化バッチ実装

**Issue:** #370
**作成日:** 2026-05-31

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 自動テスト（主検証）

本 Issue の検証は vitest 中心。`pnpm start` は prebuilt dist を serve するため、ロジック検証はユニット/統合テストで担保する。

```
pnpm typecheck
./node_modules/.bin/biome check
pnpm test:unit
pnpm test:integration
```

（`pnpm lint`/`biome` のローカル書き換え既知問題があるため biome は `./node_modules/.bin/biome` を直接叩く。）

### 検証環境の起動（admin UI のブラウザ確認用）

ソース変更を実機で見るには prebuilt を更新してから起動する。

```
pnpm db:apply:local      # ローカル D1 にマイグレーション適用
pnpm build               # ソース変更を dist に反映
pnpm start               # wrangler dev（dist/worker を serve）
```

ローカルの master key は `.dev.vars` の `SECRET_BOX_MASTER_KEY` を使う。rotation を再現する場合は `.dev.vars` に旧鍵 `SECRET_BOX_MASTER_KEY_PREVIOUS` を追加し、`SECRET_BOX_MASTER_KEY` を新鍵に差し替えて `pnpm build && pnpm start` を再実行する（base64 32 byte のキー 2 本を用意）。

### デプロイ方法

本番/ステージングは `pnpm deploy:production:all` / `pnpm deploy:staging:all`（web/relay/consumer/indexer/pruner/dlq）。旧鍵 secret は spec に載せないため、rotation 時に手動で web / consumer 両 worker に `wrangler secret put SECRET_BOX_MASTER_KEY_PREVIOUS --config wrangler.{production,staging}.toml [--env consumer]` する（README 参照）。本 Issue の機能確認自体はローカル検証環境で完結する。

## 確認項目

### 1. 通常時（旧鍵未設定）に再暗号化を実行しても無害

- **目的:** rotation 中でないのに admin が再暗号化ボタンを押しても破壊しないことを確認。
- **手順:**
  1. admin でログインし、LLM 設定で `apiKeySource='db'` の api key を保存する（新鍵で暗号化される）。
  2. 旧鍵 `SECRET_BOX_MASTER_KEY_PREVIOUS` を設定しない状態で、admin UI の再暗号化ボタンを押す。
- **期待結果:** `skipped='already-new-key'`（既に新鍵）として no-op 成功。エラーにならず、api key も壊れない。
- **確認ポイント:** 実行後に LLM 接続テストが成功すること。

### 2. ローテーション再暗号化のハッピーパス

- **目的:** 旧鍵で暗号化された行を新鍵で再暗号化できることを確認。
- **手順:**
  1. 旧鍵を `SECRET_BOX_MASTER_KEY` に設定した状態で `apiKeySource='db'` の api key を保存（旧鍵で暗号化）。
  2. `.dev.vars` で `SECRET_BOX_MASTER_KEY_PREVIOUS` に旧鍵、`SECRET_BOX_MASTER_KEY` に新鍵を設定して `pnpm build && pnpm start` 再起動。
  3. admin UI の再暗号化ボタンを押す。
- **期待結果:** `reencrypted=true` で成功表示。
- **確認ポイント:** 再暗号化後に LLM 接続テストが新鍵で成功する。再度ボタンを押すと `skipped='already-new-key'`（冪等）。

### 3. rotation 中の consumer が Stub に降格しない

- **目的:** 新鍵 deploy 後・再暗号化前でも consumer が旧鍵行を復号できることを確認。
- **手順:**
  1. 確認項目 2 の手順 2 の状態（新鍵 + 旧鍵 PREVIOUS、旧鍵行が残存）で、`apiKeySource='db'` を使うジョブ（LLM/OCR/PDF を伴う投稿など）を投入する。
- **期待結果:** consumer が旧鍵フォールバックで復号し、Stub に降格せず実 LLM 処理が走る。
- **確認ポイント:** consumer ログに secretBox の warn ログ（Stub 降格）が出ないこと。

## エッジケース・異常系

### 1. 旧鍵が必要なのに未設定

- **目的:** 旧鍵行が残っているのに `SECRET_BOX_MASTER_KEY_PREVIOUS` 未設定で再暗号化を実行したときの挙動。
- **手順:** 旧鍵行が残った状態で旧鍵を設定せず再暗号化ボタンを押す。
- **期待結果:** `SecretBoxError(KeyUnavailable)` 相当のエラーが UI に明示表示される（サイレント no-op にならない）。

### 2. 旧鍵の取り違え（不正な旧鍵）

- **目的:** 誤った旧鍵を設定したときに decrypt が失敗し明示エラーになることを確認。
- **手順:** `SECRET_BOX_MASTER_KEY_PREVIOUS` に別の（正しくない）base64 32 byte を設定して再暗号化を実行。
- **期待結果:** decrypt 失敗エラーが UI に出る。サイレントに行を壊さない。

### 3. placeholder / 不正値の旧鍵

- **目的:** 旧鍵に dev placeholder や不正 base64 を入れたときに eager throw すること。
- **手順:** ユニットテストで `selectPreviousSecretBox`（仮称）に placeholder / 非 base64 / byte 長違いを渡す。
- **期待結果:** 構築時に throw。

## 既存機能への影響確認

- **LLM 設定の保存・読み出し（`updateLLMConfig` / `testLLMConnection`）:** 旧鍵 env を増やしても通常時（旧鍵未設定）の保存・読み出しが従来どおり動くこと。
- **fail-fast（Issue #102）:** `SECRET_BOX_MASTER_KEY` 未設定/placeholder の production fail-fast が壊れていないこと（既存テスト green）。
- **DI 配線:** `createRequestContainer` / `createConsumerContainer` が `secretBoxPrevious` を含めて従来どおり構築できること。

## 確認チェックリスト

- [ ] `pnpm typecheck` green
- [ ] `./node_modules/.bin/biome check` green
- [ ] `pnpm test:unit` green
- [ ] `pnpm test:integration` green
- [ ] 通常時に再暗号化しても無害（already-new-key skip）
- [ ] ローテーション再暗号化のハッピーパス（reencrypted=true、冪等）
- [ ] rotation 中の consumer が Stub 降格しない
- [ ] 旧鍵未設定/不正時に明示エラー（サイレント破壊なし）
- [ ] 既存の LLM 設定保存・読み出し・fail-fast に影響なし
