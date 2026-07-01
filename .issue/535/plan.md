# Issue #535 対応計画: `docs/runtime_cloudflare.md` のリソース作成コマンド修正

## 意図

`docs/runtime_cloudflare.md` の「One-time Cloudflare resource creation」節にある
`wrangler d1 create` / `queues create` / `r2 bucket create` コマンドが、テンプレ初期値
`tanstack-start-template-*` かつ旧命名規約（`{template}-{resource}-{stage}`）のまま残っている。
手順通り実行すると実構成（`hollow-{stage}-{resource}`）と食い違うリソースが作られ、デプロイが通らない。
実構成に合わせて書き換える。

## 実構成の SSOT（確認済み）

`infra/src/config.ts` の `resourceNames()` が正。`prefix = ${appName}-${stage}`、
`appName = hollow`（`infra/Pulumi.{staging,production}.yaml`）。

| リソース | 生成名（`resourceNames`） | staging | production |
| --- | --- | --- | --- |
| D1 | `${prefix}-d1` | `hollow-staging-d1` | `hollow-production-d1` |
| events queue | `${prefix}-events` | `hollow-staging-events` | `hollow-production-events` |
| events dlq queue | `${prefix}-events-dlq` | `hollow-staging-events-dlq` | `hollow-production-events-dlq` |
| temp-files bucket | `${prefix}-temp-files` | `hollow-staging-temp-files` | `hollow-production-temp-files` |
| objects bucket | `${prefix}-objects` | `hollow-staging-objects` | `hollow-production-objects` |

Issue 記載の対応表と完全一致。

## 変更対象

- `docs/runtime_cloudflare.md`（「One-time Cloudflare resource creation」節のコードブロック、110-124 行付近）
  - 10 個のリソース名を `hollow-{stage}-{resource}` に書き換える。

## スコープ外

- `.issue/**` の `tanstack-start-template` 記述は過去の作業ログ（歴史的記録）なので書き換えない。
- テンプレ／Pulumi の実装自体は正しいので変更しない（ドキュメントのみの不整合）。
- 節の Pulumi 整合性の記述（126 行付近）は既に「これらは manual fallback」と明記済みで、
  Pulumi が同リソースを生成することも書かれている。リソース名以外の本文は現状で整合しているため据え置く。

## 検証

`pnpm typecheck` / `pnpm lint` はドキュメント変更に影響しないが、`pnpm format:check` で
Markdown 整形が崩れていないか確認する。詳細は testing.md。
