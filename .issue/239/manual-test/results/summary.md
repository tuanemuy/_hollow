# テスト実行サマリー — Issue #239

**実行日時**: 2026-05-30
**テストソース**: .issue/239/testing.md
**サーバー**: http://localhost:5180/
**ログインユーザー**: existing@example.com（member）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | アバタークリックでドロップダウンメニューが開く | 正常系 | PASS | `expanded=true`、`role="menu"` 表示 |
| TC-002 | ユーザー情報の表示 | 正常系 | PASS | 表示名/メール/「メンバー」表示 |
| TC-003 | 「設定」項目から設定画面へ遷移 | 正常系 | PASS | `/settings` に遷移、メニュー閉じる |
| TC-004 | ログアウトでセッション破棄→/login | 正常系 | PASS | `/login` に遷移 |
| TC-005 | ログアウト後に認可リソースへアクセス | 正常系 | PASS | `/notes/new`→`/` リダイレクト、`/settings/profile`→保護データ非表示（セッション破棄を確認） |
| TC-Edge-1 | キーボード操作（Arrow/Escape/フォーカス復帰） | 異常系 | PASS | Arrow移動・ラップ、Escapeで閉じ＋フォーカス復帰 |
| TC-Edge-2 | メニュー外クリックで閉じる | 異常系 | PASS | 外側クリックで `expanded=false` |
| 既存機能 | ヘッダー検索/新規作成/アップロード/ロゴ | 回帰 | PASS | snapshot で全要素表示・RSC境界のhydration問題なし |

**合計**: 8 件（PASS: 8 / FAIL: 0）

## 補足: TC-005 の挙動と別件の発見

- ログアウトによるセッション破棄は確実に行われている（`/notes/new` は `/` へリダイレクト、`/settings/profile` は保護データを返さずエラー表示）。Issue #239 の完了条件「再度認可リソースにアクセスするとログイン画面（または `/`）に飛ばされる」は満たされている。
- ただし `/settings` ルート（`app/routes/settings/route.tsx`）には `beforeLoad` 認証ガードが無く、未認証時にレイアウトのナビゲーションシェルを描画し、子ルートのデータ取得時に `errorComponent`（「エラーが発生しました」）にフォールバックする。これは `/login` への明示的リダイレクトではない。
- この挙動は **Issue #239 の変更（`app/components/layout/` のみ）とは無関係の既存の挙動**。`/settings` ルートガードの不整合として Phase 4 でスコープ外Issue起票を検討する。
