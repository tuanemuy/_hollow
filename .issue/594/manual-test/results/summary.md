# テスト実行サマリー — Issue #594

**実行日時**: 2026-06-09
**テストソース**: .issue/594/testing.md
**サーバー**: http://localhost:3000（pnpm dev / vite dev）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | 通常ケース — 差分カードが実値で正しく表示される | 正常系 | PASS | - |
| TC-002 | 長いアドレスの折返し（desktop / mobile 375px） | エッジ | PASS | - |
| TC-003 | エラー状態が回帰していない（無効トークン） | 異常系 | PASS | - |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 所見
- 差分カードは `role="group" aria-label="変更内容"`、旧アドレス（取り消し線・ink-tertiary・regular）→ 新アドレス（ink・medium）の2カラム構成。配置順は 本文 → 差分カード → warning alert → CTA でモック準拠。
- 長いアドレスは break-all で desktop 2行 / mobile 3行に折返し、レイアウト破壊なし。
- 無効トークンで「無効なリンクです」エラー表示、差分カードは非表示（回帰なし）。
- スクリーンショット: screenshots/tc-001-success.png / tc-002-long-address.png / tc-002-long-mobile.png / tc-003-invalid.png
