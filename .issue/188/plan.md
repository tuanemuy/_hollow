# 実装計画 — Issue #188: eventRelayWorker のトップレベル `crypto.randomUUID()` で staging/production デプロイが全滅

**Issue:** #188
**作成日:** 2026-05-23
**複雑度:** 小規模

---

## 目的

`app/core/application/workers/eventRelayWorker.ts:119` のモジュールトップレベル `crypto.randomUUID()` を除去し、Cloudflare Workers の global-scope validation を通過させて `Deploy (staging)` / `Deploy (production)` ワークフローを復活させる。あわせて CLAUDE.md の "id generation behind a port" 原則に揃え、application 層が `IdGenerator` ポートを迂回している現状を直す。

## スコープ

### 含まれるもの

- `app/core/application/workers/eventRelayWorker.ts` のトップレベル `crypto.randomUUID()` 除去
- diagnostic worker id を `WorkerContainer.idGenerator.next()` 経由（= tick 単位）で取得する変更
- 旧 `RELAY_WORKER_ID` の意図（log 相関 / lease 帰属）を新しい挙動に合わせて JSDoc 更新
- ビルド成果物 `dist/server/index.js` 等にトップレベル `crypto.randomUUID()` が残らないことの確認

### 含まれないもの

- 他の global-scope 違反候補の網羅的監査（必要なら別 Issue 起票）
- `IdGenerator` 実装の変更（`UuidV7Generator` をそのまま使う — UUIDv7 でも診断 ID 用途として全く問題ない）
- production 側デプロイの実走（本 PR マージ後の `Deploy (staging)` ワークフロー成功を以て受け入れ条件確認とする）

## 実装ステップ

### 1. eventRelayWorker.ts のトップレベル UUID 生成を除去

- **対象ファイル:** `app/core/application/workers/eventRelayWorker.ts`
- **変更内容:**
  - `const RELAY_WORKER_ID = crypto.randomUUID();` (line 119) を削除
  - 直前のコメントブロック (lines 114–118 "Stable diagnostic id for the relay worker. …") も削除
  - `processOutboxBatch` 内 `const workerId = options.workerId ?? RELAY_WORKER_ID;` (line 222) を `const workerId = options.workerId ?? container.idGenerator.next();` に変更
  - `ProcessOutboxEventsOptions.workerId` の JSDoc (lines 94–98) を「Defaults to a stable id minted once per isolate」から「Defaults to a fresh id minted per tick via `container.idGenerator`」へ書き換え、tick 単位の lease 帰属が意図通りであることを明記
- **理由:**
  - global scope での `crypto.randomUUID()` は Cloudflare Workers の validation `10021` で拒否されるためデプロイが通らない
  - `IdGenerator` ポートは既に `WorkerContainer.idGenerator` 経由で利用可能 — 既存の `clock` / `logger` / `outboxRepository` と同じ DI 経由に揃えるだけで済む
  - 「isolate 単位の安定 id」は本来の lease 帰属（リースのライフサイクル = tick 単位）と整合的でなく、tick 単位の方が `claimed_by` の意味が素直になる

### 2. テスト・lint・typecheck の実行

- **対象:** `pnpm typecheck && pnpm lint && pnpm test:unit`
- **変更内容:** Step 1 の修正後に実行し回帰がないことを確認
- **理由:**
  - `eventRelayWorker.integration.test.ts` は `workerId` を一切参照していないので影響なし
  - `inlineRelayTrigger.test.ts` は `workerId: "inline-dev"` を **明示的に渡して** いる経路のテストなので、`options.workerId` の優先順位（指定 > フォールバック）が壊れていなければ通る

### 3. ビルド成果物の検証

- **対象:** `pnpm deploy:staging:all:dry`
- **変更内容:** dry-run でビルドし、`dist/server/index.js` / `dist/relay/index.js` 等に `crypto.randomUUID()` のトップレベル呼び出し（裸の `crypto.randomUUID();` 文）が残っていないことを `grep` で確認
- **理由:** wrangler の API upload は実 deploy でしか発火しないが、トップレベルに呼び出しが残るかどうかはビルド成果物の静的検査で判定できる

## 設計判断

- 修正方針は Issue 本文の「推奨される修正方針」をそのまま採用：`WorkerContainer.idGenerator`（既に `SharedDeps` に含まれている `UuidV7Generator`）を `processOutboxBatch` の入り口で呼ぶ
- 「isolate 単位で安定 id を保ちたい」要件は実態として不要と判断（log 相関 / lease 帰属の両方で tick 単位の方が意味が素直）— ADR には起こさない（トレードオフのある選択ではなく、Issue 本文と合意した方針通り）

## リスクと注意点

- `claimed_by` の意味が「isolate 単位」から「tick 単位」に変わる。`outbox` テーブルを log 検索で追っているオペレーション運用がある場合のみ要注意だが、本リポジトリにはそうした運用ドキュメントは見当たらないため実質的影響なし
- `IdGenerator.next()` が UUIDv7 を返す（既存実装）。診断用途では v4/v7 どちらでも要件を満たすため問題なし

## テスト方針

- `pnpm typecheck && pnpm lint && pnpm test:unit` で回帰確認
- `pnpm deploy:staging:all:dry` を走らせ、ビルド成果物にトップレベル `crypto.randomUUID()` が残らないことを grep で確認
- 受け入れ条件「`Deploy (staging)` ワークフローが成功」は本 PR を main にマージ後の実走で確認（plan 段階では検証不可）
