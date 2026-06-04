# テスト実行サマリー — Issue #458

**実行日時**: 2026-06-04
**テストソース**: .issue/458/testing.md
**サーバー**: http://localhost:4321
**認証**: dev-admin（seed:dev-admin / `__Host-session` クッキー注入）

| TC | テスト名 | 種別 | 結果 | 検証方法 |
|----|---------|------|------|---------|
| TC-1 | プロンプト設定: 説明と placeholder の役割分離 | 正常系 | PASS | textarea.placeholder を eval で取得、5件すべて「例: …」の具体例。説明文と重複なし。スクショ確認。 |
| TC-2 | デザイントークン: フォーム行の整列 | 正常系 | PASS | スクショでラベル列 input と値列 input の上端が整列。 |
| TC-3 | デザイントークン: 説明文からファイル名除去 | 正常系 | PASS | `document.body.innerText.includes('spec/design/tokens.md')` → false。 |
| TC-4 | LLM設定: ラベルとバッジの整列 | 正常系 | PASS | env固定状態で「プロバイダ」＋「環境変数で固定中」バッジが中央整列（スクショ）。 |
| TC-5 | ジョブ監視: ステータスタグの折り返し防止 | 正常系 | PASS | 全ステータスピルが computed `white-space: nowrap`。スクショでピル形状維持。 |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 既存機能への影響

スタイル/文言のみの変更。各画面は正常に描画・認証・データ表示され、レイアウト崩れなし。typecheck/lint/format も通過済み。

## 起票したIssue

なし（全PASS）。
