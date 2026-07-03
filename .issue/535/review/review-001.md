# レビュー #001 — Issue #535

対象 PR: #811 / ブランチ `issue/535/runtime-cloudflare-resource-names`

## 観点と結果

### 1. リソース名の正しさ（要件カバレッジ）

`docs/runtime_cloudflare.md` の修正後 10 コマンドを SSOT（`infra/src/config.ts` の
`resourceNames()`、`prefix = ${appName}-${stage}`、`appName = hollow`）と 1 対 1 照合。

| コマンド | 修正後 | SSOT | 一致 |
| --- | --- | --- | --- |
| d1 create (staging) | `hollow-staging-d1` | `${prefix}-d1` | ✓ |
| queues create (staging) | `hollow-staging-events` | `${prefix}-events` | ✓ |
| queues create dlq (staging) | `hollow-staging-events-dlq` | `${prefix}-events-dlq` | ✓ |
| r2 temp (staging) | `hollow-staging-temp-files` | `${prefix}-temp-files` | ✓ |
| r2 objects (staging) | `hollow-staging-objects` | `${prefix}-objects` | ✓ |
| （production 5 件も同様） | `hollow-production-*` | 同上 | ✓ |

Issue 記載の対応表とも完全一致。**ブロッカーなし。**

### 2. スコープ妥当性

- `.issue/**` の `tanstack-start-template` は歴史的記録のため据え置き（Issue 補足どおり）。✓
- `docs/` / `README.md` に他のテンプレ残骸なし（grep 0 件）。✓
- 節本文（Pulumi manual fallback の説明）は既に整合しており変更不要。✓

### 3. 波及・整形

- `pnpm format:check` → No fixes applied.（Biome は Markdown 非対象、他ファイル無変更）✓
- コードブロックの ```bash フェンス・コメント構造は維持。✓

## 判定

**APPROVED** — 初回ラウンドでブロッカー 0 件。
