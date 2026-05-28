# テスト実行サマリー — Issue #293

**実行日時**: 2026-05-28
**テストソース**: `.issue/293/testing.md`
**サーバー**: http://localhost:3000

## 結果

| TC | テスト名 | 種別 | 結果（1回目） | 結果（再実行） |
|----|---------|------|---------------|---------------|
| TC-1 | `/` → `/notes/$noteId/` → back で AppShell 同一性 | 正常系 | **FAIL** | **PASS** |
| TC-2 | `/` → `/tags` → `/trash` → `/notes/new` 連続遷移 | 正常系 | **FAIL** | **PASS** |
| TC-5 | Header 検索フォーム経由 `/?q=example` 遷移 | 正常系 | **PASS** | – |
| EC-1 | 未ログイン `/` → LandingPage | 異常系 | **PASS** | – |
| EC-2 | 未ログイン `/trash` → `/?page=1&limit=20` redirect | 異常系 | **PASS** | – |

**合計**: 5 件 (PASS: 5 / FAIL: 0)

## 1 回目で検出した実装バグと修正

### バグ
`app/routes/_app/route.tsx` の `beforeLoad` が `@/lib/server/currentUser`（`server-only` モジュール）を直接動的 import していたため、`<Link>` 経由の SPA 遷移時にクライアントで `TypeError: getCurrentUser is not a function` が発生し、`_app.errorComponent` が AppShell ごと全体を置き換えていた。Issue 主目的「AppShell 再マウント抑制」が達成できない致命傷。

### 修正
`resolveAppAuth = createServerFn({ method: "GET" }).inputValidator(...).handler(...)` で auth ガードを RPC 化し、`beforeLoad` から `await resolveAppAuth({ data: { pathname: location.pathname } })` で呼ぶ形に変更。

### 再検証
両 TC PASS。エラー画面は一切出ず、SPA 遷移でも AppShell が維持され、Header 検索 input の入力値・Sidebar 展開状態が遷移をまたいで保持されることを確認。

## 起票した Issue
なし（即時修正済み）。

## スクリーンショット
- 1 回目: 14 枚 (`.issue/293/manual-test/screenshots/{tc-1,tc-2,tc-5,ec-1,ec-2}/`)
- 再実行: 9 枚 (`.issue/293/manual-test/screenshots/{rerun-tc-1,rerun-tc-2}/`)
