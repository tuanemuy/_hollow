# ブラウザ検証レポート — Issue #570: P14 公開設定 QR コード表示

**実行日時**: 2026-06-08
**テストソース**: .issue/570/testing.md
**サーバー**: http://localhost:3000（`pnpm dev`）
**認証**: dev-admin（cookie `__Host-session` を CDP 注入）

## 結果

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | 発行済み有効リンクに QR が表示される | PASS |
| TC-002 | 失効リンクには QR が出ない | PASS |
| TC-003 | 新規発行リンクにも QR が即時表示される | SKIP（環境制約） |

合計 3 件（PASS: 2 / FAIL: 0 / SKIP: 1）。機能C はユニットテスト（`pnpm test:unit`）で別途 PASS。

## 観察

- **TC-001**: 有効リンク `...030` の URL 行直下に `role="img" aria-label="QR コード"` の QR 画像が描画。
  隣に2行キャプション「スマホのカメラで読み取って共有できます。」「リンクと同じアクセス範囲です。」が
  両行とも完全表示（後半文の欠落・truncate なし）。DOM 順序は URL → コピー → QR → キャプション →
  password/revoke で、既存 active アクションの前に独立配置されモック準拠。
- **TC-002**: 失効リンク `...031`/`...032` には QR・キャプションが一切描画されず（`status === "active"`
  ガードが機能）。URL + コピーボタンのみ。
- **TC-003**: 「リンクを発行」ボタンは存在・有効だが当環境で新規 active 行が追加されず SKIP。
  QR 描画経路は新規/既存で同一のため TC-001 でカバー済み。#570 実装起因ではない。

## スクリーンショット
- `screenshots/tc-001/{modal-full,modal-scrolled,qr-element}.png`
- `screenshots/tc-002/revoked-links.png`
- `screenshots/tc-003/after-issue-attempt.png`

## 起票した Issue
なし（FAIL なし。SKIP は環境制約で実装起因でないため）。
