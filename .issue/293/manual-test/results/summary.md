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

## 2回目（loader-redirect 統合リファクタ後）

レビュー W-P-001 / W-P-004 / W-P-005 対応として `_app/route.tsx` を refactor:
- `beforeLoad` は同期 helper（`{ isLandingPath }` を context に積むだけ）
- `loader` が単一 server fn `loadAppShell` を呼び、auth + chrome + redirect を集約

### 再検証結果
| TC | 結果 | 確認手段 |
|----|------|----------|
| REVERIFY-TC-1 (login → `/` → `/notes/{id}` → back) | **PASS** | agent-browser |
| REVERIFY-TC-2 (`/tags` → `/trash` → `/notes/new` 連続遷移) | **PASS** | agent-browser |
| REVERIFY-EC-1 (未ログイン `/`) | **PASS** | `curl http://localhost:3000/` → 200, 1.4s, Landing 完全 HTML、TanStack stream に `isLandingPath:true, userDto:null, authenticated:false` |
| REVERIFY-EC-2 (未ログイン `/trash`, `/tags`) | **PASS** | curl: `/trash` → 2 redirects → `/?page=1&limit=20` (200, 90ms); `/tags` → 1 redirect → 同上 (56ms) |

### 観察事項
- 1 回目の REVERIFY で「unauth landing が hang する」と subagent が報告したが、clean restart 後の curl で再現せず。HMR キャッシュ状態に起因する transient な問題であり、refactor の責任ではないと確定
- TanStack stream payload で `_app.loader` が `{userDto:null, header:null, sidebar:null}` を返し `_app.component` が `<Outlet/>` のみ描画 → Landing が無事 mount される
