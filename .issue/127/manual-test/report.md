# ブラウザ検証レポート — Issue #127

**実行日**: 2026-05-29
**対象**: 内部リンク `[[...]]` の `note_internal_links.resolved_note_id` 解決
**サーバー**: http://localhost:5180/（`pnpm dev --port 5180`）
**ローカル D1**: `hollow-local-d1`
**テストアカウント**: `linktest@example.com`

## 結果: 全 5 件 PASS

| TC | 内容 | 結果 |
|----|------|------|
| TC-001 | `[[既存タイトル]]`（大文字・空白）→ resolved_note_id NOT NULL | PASS |
| TC-002 | 日本語 `無題メモ` / 大小違い `hello`→`Hello` | PASS |
| TC-003 | バックリンク表示（解決連動） | PASS |
| TC-004 | 存在しないタイトル → null 維持・保存成功 | PASS |
| TC-005 | `[[<uuid>]]`（kind=id）→ resolved_note_id 解決 / 存在しない UUID は null・FK違反なし | PASS |

詳細は `results/TC-001.md` 〜 `TC-005.md`、サマリーは `results/summary.md`。

## 検証で見つけて修正したバグ
- **kind=id リンクの resolved_note_id 未解決**（初回 TC-005 FAIL）。修正方針は ADR-007。同一 Issue・同一関数のため Phase 2 に戻って修正し、再検証で PASS。

## 起票した Issue
- なし（検出した不具合は本 PR 内で修正済み）。

## 成果物
- レポート: `report.md`（本ファイル）
- 結果: `results/`
- スクリーンショット: `screenshots/`
- サーバー情報: `server-info.md`
- シード: `seed.sql`
