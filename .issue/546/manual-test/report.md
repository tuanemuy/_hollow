# ブラウザ検証レポート — Issue #546 領域7「入口・例外（認証・エラー）」モック実装追従

**実行日**: 2026-06-08
**ブランチ**: issue/546/p01-p07-p34-auth-error-mock-impl
**テストソース**: .issue/546/testing.md
**サーバー**: http://localhost:3000（`pnpm dev`）
**シード**: `pnpm db:migrate` → `pnpm seed:dev-admin`（dev-admin@example.com）

## 結果総括

| 指標 | 値 |
|---|---|
| テストケース | 5 |
| PASS | 4 |
| BLOCKED | 1（環境要因） |
| FAIL（実装バグ） | 0 |
| 起票 Issue | 0 |

本Issueの2大スコープ — **(1) 認証フォームの form-error 案D 追従** と **(2) P34 エラーページのナビ補助** — はいずれもブラウザ／ユニットテストで検証完了。実装バグは検出されなかった。

## スコープ別の検証状況

### (1) 認証フォーム3枚の form-error サマリーの案D 追従

- **P03 ログイン（TC-002 / 実ブラウザ PASS）**: 誤パスワードでの失敗時に、白地 + error色ヘアライン枠 + AlertCircle アイコン + 「ログインできませんでした。」title + body の案D アラート（`role="alert"`）を実画面で確認。旧 `FORM_ERROR` の塗りつぶし箱ではない。3枚は同一の共通 `ALERT*` 定数を使うため、この PASS が案D 描画の実機証跡となる。
- **P01 サインアップ（TC-001 / 再判定 PASS）**: 重複メールは仕様通りフィールド直下エラー（#201 設計）。summary 案D 経路は `kind: "system"` を使うユニットテストで明示検証済み。
- **P01b 管理者セットアップ（TC-003 / BLOCKED 環境）**: `/setup` がローカル環境（SETUP_TOKEN 無効）で 404。AdminSignUpForm の Setup Token エラー案D・一般 summary 案D はユニットテストで検証済み。

### (2) P34 エラーページのナビ補助（TC-004 / TC-005 PASS）

実ブラウザで全バリアントを確認:

| kind | コード | プライマリ | セカンダリ | 検索ボックス | バックリンク |
|------|--------|-----------|-----------|------------|------------|
| notFound | 404 | ホームへ戻る | 検索ページを開く | あり | あり |
| forbidden | 403 | ログイン (→/login) | ホームへ戻る | なし | あり |
| gone | 410 | ホームへ戻る | — | あり | あり |
| system | 500 | 再読み込み | ホームへ戻る | なし | あり |

- バックリンク: `/login` → notFound →「一つ前に戻る」で URL が `/login` に戻ることを実証。
- 500 再読み込み: click で `window.__reloadMarker` が消失＝フルリロードを実証。URL は `/error?kind=system` のまま。
- エッジ: 不正 kind は `validateSearch` の `catch("notFound")` で notFound に正規化。履歴なしバックリンクは標準の `history.back`（about:blank 遷移）でクラッシュなし。

## 失敗/ブロック分析

TC-001（テスト手順の問題）・TC-003（環境問題）はいずれも実装バグでなく Issue 起票不要。詳細は `results/analysis.md`。

## 成果物

- テスト結果: `.issue/546/manual-test/results/TC-001.md`〜`TC-005.md`, `summary.md`, `analysis.md`
- スクリーンショット: `.issue/546/manual-test/screenshots/tc-auth/`, `tc-error/`
