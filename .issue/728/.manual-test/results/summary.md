# テスト実行サマリー — Issue #728

**実行日時**: 2026-06-14
**テストソース**: .issue/728/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | `_app` 配下からログアウト → /login 着地（AC-1） | 正常系 | PASS | - |

**合計**: 1 件（PASS: 1 / FAIL: 0）

## ブラウザ検証外（理由を明記）

| AC | フロー | 状態 | 理由 |
|----|-------|------|------|
| AC-2 | ログイン → / 遷移 | 未検証（code review + unit で担保） | dev seed は session を直接注入する方式でパスワード credential（`accounts` 行）を作らないため、ログインフォームから実ログインできない。fixture 整備コストが高く、対象が sub-frame race のため見送り |
| AC-3 | パスワードリセット確認 → / 遷移 | 未検証（code review + unit で担保） | 有効なメールトークン fixture が dev 環境に無く、ブラウザでの到達が非現実的 |
| AC-5 | 退会 → ランディング（回帰） | 未検証（code review で担保） | コード変更は clearCache のインライン → ヘルパー置換で呼ぶ router メソッド不変（挙動完全等価）。既存ユニットテスト green |

## 補足: チラつき（sub-frame race）の検証粒度について

本 Issue の症状は「認証状態遷移時に 1 フレームだけランディングが描画される」visual race。agent-browser の snapshot は settled state（描画が落ち着いた後）を撮るため、1 フレームの瞬間表示そのものは DOM snapshot では構造的に捕捉できない。

そのため本検証は **「認証フローが壊れず正しい着地点に遷移する」回帰確認** を主目的とし（TC-001 で PASS）、race 解消の核心（`clearCache` が `navigate` に先行し in-place 再評価を起こさない）は以下で担保する:

- **ユニットテスト**: `routerInvalidate.test.ts` の `clearAppShellCache`（filter が `/_app` 厳密一致のみ通す）、`UserMenu.test.tsx`（clearCache → navigate の順序 assert）
- **コードレビュー**: 計画レビュー 2 ラウンド + 実装差分の目視で、3 フォーム + AccountDeleteForm が `clearAppShellCache(router); await navigate(...)` の順序になっていることを確認済み
