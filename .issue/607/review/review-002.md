# PR Review #002 — fix(tag): P18 タグ管理のデザイン追従と作成/統合/並び替えの楽観的更新を統一

**PR:** #610
**Date:** 2026-06-09
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 全 Warning 解消・回帰なし
- Verdict: **APPROVED**

---

## 1周目 Warning の解消確認

| ID | 内容 | 解消 |
| --- | --- | --- |
| FE-W-001 | `CreateTagForm` の `submitting` デッドコード | 解消（state 撤去・`useState` import 除去・input クリア → onCreate 順を維持・コメント実態化） |
| TEST-W-001 | 二重送信防止テスト未検証 | 解消（`does not double-submit on rapid repeat submits` 追加、createMock pending 中の2連発で1回のみ呼出を検証、リークなし） |
| TEST-W-002 | 入力欄クリア未検証 | 解消（楽観 add テストに `createInput.value === ""` アサート追加） |
| DESIGN-W-001 | SSOT `.tag-create input` のトークン複製 | 解消（desktop/mobile 両 SSOT に「`.search input` 意匠の意図的複製」コメント追記、スタイル値不変） |

## 回帰確認

- `TagList.test.tsx`: 22/22 PASS（タグ全体 52 PASS）
- `pnpm typecheck`: クリーン
- `pnpm lint`（タグ関連ファイル）: 警告なし
- 楽観更新ロジック・デザイントークンへの副作用なし

---

## Design Decisions

特になし。
