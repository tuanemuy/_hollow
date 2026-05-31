# ADR — Issue #102: production SECRET_BOX_MASTER_KEY setup & NullSecretBox fallback evaluation

本 Issue は `.issue/96/adr.md` ADR-002（`secretBox` 未設定時の `NullSecretBox` fallback 採用）を出発点とし、そこで「production 必須化は別 Issue で `readRequestServerConfig` 内 fail-fast に切替」と先送りされた判断を確定する。

## ADR-001: key-required 環境では `selectSecretBox` ファクトリで fail-fast に切り替える

### Status
Accepted（#96 ADR-002 を更新）

### Context

`SECRET_BOX_MASTER_KEY` 未設定でも `NullSecretBox` fallback により container 構築は成功し、暗号化/復号の操作時にのみ `SecretBoxError(KeyUnavailable)` を投げる（#96 ADR-002）。これは dev / `/admin` 描画継続のための運用フォールバックだが、production では「master key 未設定 = 運用ミス」であり、操作時まで失敗が顕在化しないのは望ましくない。

選択肢:

- (A) ファクトリ `selectSecretBox(env, { requireKey })` を新設し、`requireKey === true` の環境では未設定/空文字で container 構築時に eager throw（fail-fast）。テスト付きの実コードとして captured。
- (B) ドキュメント + ADR のみで方針を確定し、実装は将来の配線変更に回す。

### Decision

(A) を採用。`app/core/adapters/security/secretBox.ts` に `selectSecretBox(env, { requireKey })` を新設し、`createRequestContainer` の inline 三項分岐をこのファクトリ呼び出しに置換する。`requireKey` は `ServerEnv` の明示 var（`REQUIRE_SECRET_BOX_KEY`）から `readRequestServerConfig` で 1 度だけ解決し、`RequestServerConfig` 経由で threading する。

### Consequences

- 良い点:
  - 完了条件「production 環境での fail-fast / fail-soft の判断と実装が反映されている」を実コードで満たす。
  - stage 別分岐ロジックが純粋関数 1 箇所に集約され、`make illegal states unrepresentable` / `cross-cutting concerns behind ports` に合致。鍵状態（unset / empty / valid / invalid / placeholder）× `requireKey` を vitest で網羅検証できる。
  - `createConsumerContainer` も `readRequestServerConfig` 経由なので web / consumer 両経路に同時に効く。
- トレードオフ:
  - `secretBox` は request container 全体に組まれるため、key-required 環境で未設定だと `/admin` 限定でなく**公開ページを含む全ルートが 500** になる。これは意図した挙動（運用ミスの即時検知）だが、移行時は切替前に production secret 設定済みを確認する手順が必須。

## ADR-002: stage 判定は明示 var `REQUIRE_SECRET_BOX_KEY`（wrangler `[vars]`）で行う

### Status
Accepted

### Context

Cloudflare Workers では `NODE_ENV` は信頼できる stage 判定子にならない。wrangler テンプレート（`infra/templates/wrangler.{stage}.toml.tmpl`）の `[vars]` にも `STAGE` / `ENVIRONMENT` 相当の既存 var は無い。runtime が「自分が production/staging か」を知る手段が必要。

### Decision

wrangler `[vars]`（public 設定）に `REQUIRE_SECRET_BOX_KEY = "true"` を staging / production テンプレートの web `[vars]` と `[env.consumer.vars]` に追加し、`ServerEnv` に `REQUIRE_SECRET_BOX_KEY?: string` を生やして `readRequestServerConfig` で `=== "true"` 判定する。local dev (`wrangler.toml`) には設定しない（= `requireKey:false`）。

### Consequences

- 良い点: 既存の public var パターン（`APP_URL` / `EMAIL_FROM` / `ADMIN_LLM_*`）と揃う。secret（`workerSecretSpecs`）と混同しない。固定文字列なので `renderWrangler.ts` のプレースホルダ展開を素通りする。
- トレードオフ: stage ごとに var の設定漏れがあると fail-fast が効かない。テンプレートに直書きすることで漏れを防ぐ。

## ADR-003: shipped dev placeholder は runtime + CI の二層で弾く

### Status
Accepted

### Context

`.dev.vars.example` の `SECRET_BOX_MASTER_KEY` プレースホルダ（`ZGV2LW9ubHktZG8tbm90LXVzZS1pbi1wcm9kLWRvLTE=` = base64 of `dev-only-do-not-use-in-prod-do-1`）は base64 32-byte 制約を満たすため、production secret に誤貼りしても `decodeMasterKey` を素通りして boot エラーにならない（PR #111 レビュー W-003）。

### Decision

placeholder 値を `secretBox.ts` の `SHIPPED_DEV_PLACEHOLDER_KEY` 定数で SSOT 化し、(1) runtime: `selectSecretBox` が `requireKey === true` かつ値が placeholder と一致したら throw、(2) CI: `infra/scripts/checkSecrets.ts` に値ガードを足し（または独立ステップ）、復号済み JSON の同値を deploy 前に exit 1 で弾く。定数と `.dev.vars.example` の同期はテストで担保する。

### Consequences

- 良い点: 「CI を通っても runtime でも弾く」多層防御。dev（`requireKey:false`）では placeholder の利便を維持。
- トレードオフ: `checkSecrets.ts` の「値非検証」non-goal を一部変える → JSDoc / README の non-goal 記述も同時更新して意図を残す。定数と example のズレで空振りしうる → 同期テストで検知。

## ADR-004: `NullSecretBox` は維持する（削除しない）

### Status
Accepted

### Context

Issue 完了条件で `NullSecretBox` の取り扱い（維持 or 削除）を明確化する必要がある。

### Decision

維持する。fail-fast 化後は dev / staging（`requireKey:false`）の fallback としてのみ機能し、`selectSecretBox` の戻り先として型上も必要。JSDoc に「dev/staging fallback 専用、key-required 環境では `selectSecretBox` により到達不能」を明記して役割を限定する。

### Consequences

- 良い点: dev で `.dev.vars` 未設定でも起動できる利便（#96 ADR-002）を維持。削除の利得が無い。
- トレードオフ: 同一ポートに 2 実装が並ぶが、これは既存 Stub 群と同じ構造で許容済み。
