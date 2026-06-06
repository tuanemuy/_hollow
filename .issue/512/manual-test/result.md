# 動作確認結果 — Issue #512

**実施日:** 2026-06-06
**方式:** ローカル D1（miniflare）への直接検証。本 Issue は CLI seed スクリプトの修正であり、ブラウザ（agent-browser）検証の対象ではないため、`pnpm seed:dev-admin` の実行と D1 の状態確認で検証した。

## 結果サマリー

| # | テストケース | 結果 |
|---|---|---|
| 0 | （修正前）ネスト directory 所有時に再 seed が `SQLITE_CONSTRAINT_TRIGGER` で失敗することを再現 | 再現確認 |
| 1 | ネスト directory 所有時の再 seed が exit 0 で成功（FK エラーなし） | PASS |
| 2 | 所有 directories が seed 前後で保持される | PASS |
| 3 | dev-admin が admin/active 状態に再宣言される | PASS |
| 4 | 固定トークンの session が張り直される | PASS |
| 5 | member/banned/deleted に劣化した user が admin/active に復旧 | PASS |
| 6 | 連続2回実行しても exit 0（冪等性） | PASS |
| 7 | dev-admin 不在の初期状態でも新規作成される | PASS |

PASS: 7 / FAIL: 0

## 主要ログ

- 修正前（再現）: `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)`（exit 1）— Issue 記載のエラーと一致。
- 修正後: `✅ Seeded dev admin into local D1.`（exit 0）。Root/Child のネスト directory は保持。`role/banned/email_verified/deleted_at = admin/0/1/NULL`。
- 状態リカバリ: `member/1/0/2024-01-01...` → `admin/0/1/NULL`。
- 新規作成: user 0件 → 1件、session 1件。

## 起票した Issue

なし。
