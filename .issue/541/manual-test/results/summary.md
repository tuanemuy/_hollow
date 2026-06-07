# テスト実行サマリー — Issue #541

**実行日時**: 2026-06-07
**テストソース**: .issue/541/testing.md
**サーバー**: http://127.0.0.1:3000（`localhost` は別プロジェクト peek が IPv6 で占有のため IPv4 明示）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | P13 ページ 未対応形式バナー（archive.zip） | 正常系 | PASS | `.alert-error`「対応外の形式が含まれています」+ code 表示、送信非開始 |
| TC-002 | P13 ページ サイズ超過バナー（large.md 50.5MB） | 正常系 | PASS | `.alert-warning`「サイズ超過のファイル」+ `large.md (50.5 MB)`、送信非開始 |
| TC-003 | P13 モーダル 検証バナー（archive.zip） | 正常系 | PASS | SelectView にも `.alert-error`、進捗ビューへ未遷移 |
| TC-004 | P15 bulk 初期表示（embedMedia ON, 0件） | 正常系 | FAIL※ | ※テスト手順の前提誤り。実装は `bulkCount > 0` を条件に含むため0件では出ない（妥当）。1件以上で正常表示 |
| TC-005 | P15 件数超過発火（embedMedia OFF, 51件） | 正常系 | PASS | 「選択中の 51 件」表示、role=note、無彩色グレー |
| TC-006 | P15 非発火（embedMedia OFF, 3件） | エッジ | PASS | バナー非表示 |
| TC-007 | P15 single では非表示 | 正常系 | PASS | 推奨バナー非表示 |

**合計**: 7 件（PASS: 6 / FAIL: 1）

## FAIL の分類
- **TC-004 = テスト手順の問題（documentation）**。実装バグではない。実装の発火条件 `noteId === null && bulkCount > 0 && (bulkCount > 50 || embedMedia)` は「選択 0 件なら推奨しない」という妥当な挙動。testing.md の「初期 0 件で出る」という前提が誤りだったため、testing.md と ADR-003 を実装に合わせて修正。Issue 起票はしない（manual-test 原則: テスト手順の誤りはその場で直す）。

## 実装バグ
- なし。起票した Issue: なし。
