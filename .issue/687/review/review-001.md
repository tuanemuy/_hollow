# PR Review #001 — ci: リリースフローを release-please に移行

**PR:** #693
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 16
- Verdict: **BLOCKED**（Warning 修正のため次ラウンドへ）

## レイヤー別ファイル

- CI/CD・リリースフロー: review-001-cicd.md（B: 0 / W: 2）
- ドキュメント整合性: review-001-docs.md（B: 0 / W: 2）

## 指摘一覧

- [W-001/cicd] RELEASE_PLEASE_TOKEN 未登録時のサイレント失敗リスク — `.github/workflows/release-please.yml:23`（CI/CD）→ 見送り（deployment_setup.md トラブルシュート節でカバー済み）
- [W-002/cicd] release-please ジョブにブランチ/リポジトリガードが無い — `.github/workflows/release-please.yml:3-5`（CI/CD）→ 見送り（private 単一リポ・fork は PAT を持たず無害失敗・`on.push.branches:[main]` で既にスコープ済み）
- [W-001/docs] ロールバックの手動タグ push が release-please の manifest と整合しない — `docs/deployment_setup.md:35-43`（ドキュメント）→ 修正
- [W-002/docs] PAT scope の過剰記載（classic `workflow` / fine-grained `workflows` は不要） — `docs/deployment_setup.md:25`（ドキュメント）→ 修正

## 仕分け結果

- このPRで直す: W-001/docs, W-002/docs
- 見送り（記録済み）: W-001/cicd, W-002/cicd（いずれも運用留意点で、ドキュメントのトラブルシュート節と private リポ前提により実害が低い）
