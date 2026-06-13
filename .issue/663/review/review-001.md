# PR Review #001 — fix(dev): pnpm start でジョブ型エクスポートが完走するよう InlineRelayTrigger を有効化

**PR:** #673
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 9
- Verdict: **BLOCKED**（Warning 5件をこのPRで修正）

## レイヤー別ファイル

- Infrastructure: review-001-infrastructure.md（B: 0 / W: 2）
- Test & Docs: review-001-test-docs.md（B: 0 / W: 3）

## 指摘一覧

- [W-001] 素の `pnpm build && pnpm start` で var がサイレント無効 — `docs/runtime_cloudflare.md:54`（Infrastructure）→ このPRで対応（docs 明確化）
- [W-002] plan.md AC-1 の手順表記が build:local 導入後と不整合 — `.issue/663/plan.md:17,35`（Infrastructure）→ このPRで対応（注記追記）
- [W-001] エントリのコメント「pnpm start では import.meta.env が undefined」が ADR と矛盾 — `app/server.cloudflare.ts:62-64`（Test & Docs）→ このPRで対応
- [W-002] #657 presigned セクションが `pnpm build && pnpm start` のまま — `docs/runtime_cloudflare.md:67,78`（Test & Docs）→ このPRで対応
- [W-003] 「wrangler.toml の vars 変更後は再ビルド必須」が docs 未記載 — `docs/runtime_cloudflare.md:54,88`（Test & Docs）→ このPRで対応
