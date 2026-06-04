# テスト実行サマリー — Issue #464 公開設定画面スタイリング

**実行日**: 2026-06-04
**テストソース**: .issue/464/testing.md
**サーバー**: http://localhost:3100（`pnpm dev --port 3100`）
**ログイン**: セッション cookie 注入（`__Host-session` = `publish-test-session-token`）
**検証ノート**: 01950000-0001-7000-8000-000000000004（publish-test ユーザー所有・private）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | アプリシェル適用＋ページ表示 | 正常系 | PASS | - |
| TC-002 | 公開ステータスのラジオカード | 正常系 | PASS | - |
| TC-003 | 限定公開リンク発行フォーム | 正常系 | PASS | - |
| TC-004 | error/notFound スタイル | 異常系 | PASS（スタイル） | -（下記NOTE） |
| TC-005 | モバイル幅(390px) | 正常系 | PASS | - |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 総合判定（スタイリング）

合格。全画面でデザイントークンに沿ったスタイルが当たっており、素の無スタイルHTMLには一切なっていない。アプリシェル（ヘッダー/サイドバー）・ラジオカード（選択強調・ステータスドット・`has-[input:checked]:` の submit 前即時追従）・リンク発行フォーム・有効リンク行（「有効」緑バッジ・操作ボタン）・エラー表示・モバイル（ドロワー化/縦積み/URL省略）すべて整っている。視覚的崩れ・オーバーフローは検出なし。

## NOTE（機能観察・スコープ外・コード未修正）

- TC-004: 全ゼロ UUID（`00000000-0000-7000-8000-000000000000`）でアクセスした際、`notFoundComponent`（「ノートが見つかりません」）ではなく `errorComponent`（「エラーが発生しました」）が表示された。**両コンポーネントともスタイルは適用済み**でスタイリング検証には影響なし。これは loader/notFound の機能挙動（既存）であり、本Issue（ビジュアル層のみ）の変更とは無関係。スタイリング以外の挙動修正はスコープ外のため起票・修正は行わない。

## スクリーンショット

- screenshots/tc-001-shell.png
- screenshots/tc-002-radio-unlisted.png
- screenshots/tc-003-issue-form.png / tc-003-issued.png / tc-003-issued-scrolled.png
- screenshots/tc-004-notfound.png
- screenshots/tc-005-mobile.png
