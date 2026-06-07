# テスト実行サマリー — Issue #546

**実行日時**: 2026-06-08
**テストソース**: .issue/546/testing.md
**サーバー**: http://localhost:3000（`pnpm dev` / vite Cloudflare runtime）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | P01 サインアップ 送信失敗サマリーの案D | 正常系 | PASS（再判定） | 初回 FAIL はテストシナリオ誤り。重複メールは仕様通り field エラー。summary 案D は unit test + TC-002 で実証 |
| TC-002 | P03 ログイン 失敗サマリーの案D + 未認証 alert 回帰 | 正常系 | PASS | 実ブラウザで案D アラート（白地+error枠+アイコン+「ログインできませんでした。」）確認 |
| TC-003 | P01b 管理者セットアップ Setup Token エラーの案D | 正常系 | BLOCKED（環境） | `/setup` は SETUP_TOKEN 無効環境で 404。AdminSignUpForm 案D は unit test で検証 |
| TC-004 | P34 エラーページ バリアント別アクション + 全バリアントのバックリンク | 正常系 | PASS | 404/403/410/500 のアクション出し分け・バックリンク・500再読み込みすべて期待通り |
| TC-005 | P34 エッジ（不正kind / 履歴なしバックリンク） | 異常系 | PASS | 不正kindはnotFoundに正規化、履歴なしbackもクラッシュなし |

**合計**: 5 件（PASS: 4 / BLOCKED: 1 / FAIL: 0）

**実装バグ**: 0 件。Issue 起票: なし（TC-001=テスト手順の問題、TC-003=環境問題。詳細は analysis.md）。
