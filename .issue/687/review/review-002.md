# PR Review #002 — ci: リリースフローを release-please に移行

**PR:** #693
**Date:** 2026-06-13
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 18
- Verdict: **BLOCKED**（docs W-001 修正のため次ラウンドへ）

## レイヤー別ファイル

- CI/CD・リリースフロー: review-002-cicd.md（B: 0 / W: 1）
- ドキュメント整合性: review-002-docs.md（B: 0 / W: 1）

## 指摘一覧

- [W-001/cicd] RELEASE_PLEASE_TOKEN 未登録時のサイレント失敗（前回継続） — `.github/workflows/release-please.yml:23`（CI/CD）→ 見送り（トラブルシュート節でカバー済み）
- [W-001/docs] PAT 一本化後も「GITHUB_TOKEN の workflow permissions が前提」行が残りねじれ — `docs/deployment_setup.md:29`（ドキュメント）→ 修正
- [N-001/docs] ロールバック例の v0.1.0→v0.1.2 がバージョン例と分かる注記推奨 — `docs/deployment_setup.md:43`（ドキュメント）→ 修正（ついで）

## 仕分け結果

- このPRで直す: W-001/docs（GITHUB_TOKEN 権限前提行を PAT 一本化と矛盾しない記述へ整理）, N-001/docs（「バージョンは例」注記）
- 見送り（記録済み）: W-001/cicd（前回と同じ運用留意点。release-please.yml は正しく、PAT 登録は operator 前提として明記済み）

## 前回（Round 1）修正の確認

- W-001/docs（ロールバック節の優先順位 + manifest 齟齬の WARNING）→ 反映確認
- W-002/docs（PAT scope 最小権限化、workflow 権限不要の理由付き）→ 反映確認
