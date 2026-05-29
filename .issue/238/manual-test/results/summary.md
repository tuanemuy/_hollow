# テスト実行サマリー — Issue #238

**実行日**: 2026-05-29
**テストソース**: .issue/238/testing.md
**サーバー**: http://localhost:3001/

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | ログイン | 前提 | PASS | existing@example.com |
| TC-002 | トグル既定OFF（破棄済み非表示） | 正常系 | PASS | discarded非表示・保持中表示・URLにパラメータ無し |
| TC-003 | トグルONで破棄済み表示・URL反映 | 正常系 | PASS | `?includeDiscarded=true`・「破棄済み」バッジ表示 |
| TC-004 | リロード耐性 | 正常系 | PASS | ON維持・破棄済み表示継続 |
| TC-005 | トグルOFFでURLクリーン | 正常系 | PASS | パラメータ消失・破棄済み再非表示 |
| TC-006 | hand-typed 不正値URL（=abc） | 異常系 | PASS | エラー画面化なし・OFF扱い |
| TC-007 | hand-typed truthy URL（=1） | 異常系 | PASS（修正後） | 初回FAIL → 数値`1`対応で修正 → 再検証PASS |

**合計**: 7 件（PASS: 7 / FAIL: 0）

## 修正したバグ（検証中に発見）

- **TC-007 初回FAIL**: `?includeDiscarded=1` が TanStack Router 既定 JSON パーサで**数値 `1`** にパースされるが、`uploadSearch.ts` の transform は文字列 `"1"` のみを真としていたため OFF に潰れていた。
- **修正**: union に `z.number()` を追加し、transform を `v === true || v === 1 || v === "1" || v === "true"` に拡張。`.issue/238/adr.md` ADR-001 補足に記録。
- **再検証**: `=1` で ON・破棄済み表示、`=true` で ON、`=abc` で OFF（回帰なし）をすべて確認。

起票したIssue: なし（変更箇所起因かつ即時修正可能だったため Phase 2 で修正・再検証）
