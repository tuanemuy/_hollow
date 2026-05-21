# 動作確認計画 — Issue #66: pnpm dev で outbox relay/consumer が走らず resolved_note_id 解決が pending

**Issue:** #66
**作成日:** 2026-05-21

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

ローカル開発サーバー（vite + Cloudflare Workers）が起動する。本 Issue の変更により `import.meta.env.DEV === true` のときだけ `InlineRelayTrigger` が wire され、UoW commit の `kick()` で同一 isolate 内に outbox がドレインされる。

### デプロイ方法

検証環境のみで確認可能。ステージング・本番へのデプロイは不要。

production 経路への混入を念のため確認したい場合のみ:

```bash
pnpm build
grep -r "import.meta.env" dist/ 2>/dev/null || echo "OK: dead-code eliminated"
```

`pnpm build` は vite ビルドのみで wrangler deploy は走らない（安全）。

## 確認項目

### 1. dev で outbox がドレインされる（インライン dispatcher 動作）

- **目的:** `pnpm dev` で UoW commit 後に `InlineRelayTrigger.kick()` が走り、outbox 行が `processed_at NOT NULL` まで進むことを確認する。
- **手順:**
  1. `pnpm dev` でサーバー起動
  2. ブラウザでサインアップ → ログイン
  3. ファイルアップロード ingestion を試行（適当な短いテキストファイルなど）→ `ingestion.created` イベントが outbox に積まれる
  4. 数秒待つ
  5. 別ターミナルで以下を実行:
     ```bash
     wrangler d1 execute tanstack-start-template-d1 --local --command "SELECT id, type, processed_at, failed_at, attempts FROM outbox ORDER BY created_at DESC LIMIT 10"
     ```
- **期待結果:**
  - 直近の `ingestion.created` 行の `processed_at` が NOT NULL になっている。
  - `failed_at` は NULL。
  - `attempts` は 0 または 1（dispatch 成功）。
- **確認ポイント:** dispatch が走らず outbox に溜まりっぱなしになっていない。Console ログに `[relay-trigger] service binding kick failed` のエラーログ（既存挙動）の代わりに `InlineRelayTrigger` 経由の debug ログが出る。

### 2. ingestion フローがフルフロー検証できる

- **目的:** dispatch 経由で `runIngestionJob` が呼ばれ、Job が pending → processing → preview_ready まで遷移することを確認する。
- **手順:**
  1. 上記 1. の続きで、Job の状態を確認:
     ```bash
     wrangler d1 execute tanstack-start-template-d1 --local --command "SELECT id, status, attempts, last_error FROM ingestion_jobs ORDER BY created_at DESC LIMIT 5"
     ```
  2. ブラウザ UI で当該 Job のプレビュー画面に遷移し、preview が表示されることを確認
- **期待結果:**
  - 当該 Job の `status` が `preview_ready` または `processing`（LLM 接続不可なら preview_ready に至らず `processing` で止まり得るが、それは Issue #66 のスコープ外）。
  - 少なくとも `pending` のままではない（= dispatch が走った証拠）。
- **確認ポイント:** dev でこの一連の検証が `pnpm dev` のみで完結する（並列起動・追加コマンド不要）。

### 3. production 経路への dead-code elimination 確認

- **目的:** `vite build` 後の bundle で `import.meta.env.DEV` が `false` にインライン化され、`InlineRelayTrigger` のコードが dead-code として除去されることを確認する。
- **手順:**
  1. `pnpm build` を実行
  2. 以下のコマンドで dist 配下を grep:
     ```bash
     grep -rn "import.meta.env" dist/ 2>/dev/null || echo "OK: no import.meta.env references in build output"
     grep -rn "InlineRelayTrigger" dist/ 2>/dev/null || echo "OK: InlineRelayTrigger eliminated from build"
     ```
- **期待結果:**
  - `import.meta.env` の参照が dist/ に残っていない（または `import.meta.env.DEV` の三項演算が完全に `false` 側に折りたたまれている）。
  - production 経路に `InlineRelayTrigger` のインスタンス化コードが残らない。
- **確認ポイント:** これにより production / staging deploy 経路に inline dispatch が絶対混入しないことを bundle 単位で確認する。

## エッジケース・異常系

### 1. dispatch 失敗時に attempts がインクリメントされる

- **目的:** `dispatchDomainEvent` が `retry` を返した場合、outbox の `attempts` がインクリメントされ、`markProcessed` が呼ばれないこと（production 経路と同等の挙動）を確認する。
- **手順:** unit test (`inlineRelayTrigger.test.ts`) で自動カバー。手動検証は不要だが、テスト結果を `pnpm test:unit` で確認する。
- **期待結果:** 該当テストが PASS。

### 2. secondary kick が RELAY service binding を呼ばない（ログノイズ抑制）

- **目的:** `InlineRelayTrigger` 内で組む consumer container の `RelayTrigger` が `NoopRelayTrigger` 相当となり、`[relay-trigger] service binding kick failed` のエラーログが噴出しないことを確認する。
- **手順:**
  1. `pnpm dev` 中に複数の ingestion を試行
  2. dev サーバーのコンソールログを確認
- **期待結果:**
  - `[relay-trigger] service binding kick failed` が **`InlineRelayTrigger` 経由の dispatch では発生しない**。
  - （メイン Worker からの初回 kick が `InlineRelayTrigger` に向くため、Service Binding 経由のログは出ない設計。）

### 3. `pnpm start` での挙動確認（参考）

- **目的:** `pnpm start`（`wrangler dev` 直叩き）で `import.meta.env.DEV` が undefined / false となり、`InlineRelayTrigger` 経路に入らないことを確認する。
- **手順:**
  1. `pnpm build` 後に `pnpm start` を実行
  2. サーバーが起動できることを確認
- **期待結果:**
  - `pnpm start` で TypeError 等のクラッシュが起きない。
  - inline dispatch は無効（このとき outbox は relay worker が起動していないため処理されない＝従来挙動）。

## 既存機能への影響確認

- **production / staging deploy フロー**: `wrangler.staging.toml` / `wrangler.production.toml` を変更しない。`deploy:staging:*` / `deploy:production:*` スクリプトに影響なし。
- **既存 ServiceBindingRelayTrigger 経路**: `RequestServerConfig.relayTriggerOverride` が undefined の場合は従来通り `buildRelayTrigger(relay, waitUntil, logger)` で wire される。production 経路の挙動は完全に無変更。
- **consumer worker 経路**: `createConsumerContainer(env, ctx)` は `relayTriggerOverride` を渡さないため、consumer 経路は dev でも production でも従来挙動。

## 確認チェックリスト

- [ ] 1. dev で outbox がドレインされる（手動確認）
- [ ] 2. ingestion フローがフルフロー検証できる（手動確認）
- [ ] 3. production 経路への dead-code elimination 確認（`pnpm build` + grep）
- [ ] 4. unit test (`inlineRelayTrigger.test.ts`) PASS
- [ ] 5. `serverCloudflare.test.ts` 追記分 PASS（override 適用 / production 経路 zero-impact 回帰）
- [ ] 6. `pnpm test:unit && pnpm test:integration` 全 PASS
- [ ] 7. `pnpm typecheck && pnpm lint:fix && pnpm format` zero error/zero warning
