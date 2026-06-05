# テスト実行サマリー — Issue #487

**実行日時**: 2026-06-05
**テストソース**: .issue/487/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | /settings 直アクセスで /settings/profile へリダイレクト | 正常系 | PASS | - |
| TC-002 | サブナビ各項目への遷移で本文が表示される | 正常系 | PASS | - |
| TC-003 | プロフィール編集の反映（invalidate 経路） | 正常系 | PASS | - |
| TC-004 | 未認証で /settings → トップへリダイレクト | 異常系 | PASS | - |

**合計**: 4 件（PASS: 4 / FAIL: 0）

## 主な確認結果

- index ルート追加により `/settings` 直アクセスが `/settings/profile` へリダイレクトし、本文の空白が解消（TC-001）。
- サブナビ4項目（profile/security/prompts/account-delete）すべてで本文が描画され空白にならない（TC-002）。
- `staleTime` を本番 Infinity 化しても、編集→保存後の `routerInvalidate` で最新値がプリフィルされる（TC-003）。表示名変更が再訪時・Header 双方に反映。
- 未認証アクセスは `_app` 認証ガードでトップへリダイレクトし、設定画面は露出しない（TC-004）。
- manual-test Known Issue（保存ボタンのサイレント失敗）は再現せず、保存は正常動作。

FAIL が無いため Issue 起票なし。
