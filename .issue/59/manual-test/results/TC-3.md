# TC-3 — 非 admin での `/admin` アクセス時の挙動が変わっていない

## 結果: PASS

## 環境
- サーバー: http://localhost:3000/
- アカウント: existing-new@example.com (非 admin / mailowner)
- 実施日時: 2026-05-20
- ブランチ: issue/52/saved-views-seed-fix
- セッション名: verify-tc-3

## 手順と検証結果

### 1. ログイン
- `/login` で existing-new@example.com / Password123! を入力しログイン成功
- ログイン後、自動的にノート一覧（オーナーダッシュボード）に遷移

### 2. `/admin` アクセス（非 admin）
- URL: http://localhost:3000/admin
- 表示内容（snapshot）:
  - banner: "Hollow" / "管理者モード"
  - main:
    - heading "アクセスできません" (h1)
    - paragraph "エラーが発生しました"
    - link "ホームへ戻る"
- ダッシュボード本体（「ダッシュボード」見出し等）は描画されていない
- screenshot: `.issue/59/manual-test/screenshots/tc-3/non-admin-admin.png`
- console error:
  - `ForbiddenError: Admin access required` (Server)
  - これは `requireAdminUser` の既存挙動どおり（CatchBoundary により「アクセスできません」画面へ）
- TypeError / usageMetrics 関連の新規エラーは出ていない

### 3. `/admin/metrics` アクセス（非 admin）
- URL: http://localhost:3000/admin/metrics
- 表示内容（snapshot）:
  - banner: "Hollow" / "管理者モード"
  - main:
    - heading "アクセスできません" (h1)
    - paragraph "エラーが発生しました"
    - link "ホームへ戻る"
- メトリクス本体は描画されていない
- screenshot: `.issue/59/manual-test/screenshots/tc-3/non-admin-metrics.png`
- console error:
  - `ForbiddenError: Admin access required` (Server) — `<MetricsPage>` 配下で `requireAdminUser` が拒否
- TypeError / usageMetrics 関連の新規エラーは出ていない

## 確認項目チェックリスト
- [x] 既存挙動通り（「アクセスできません」エラー画面、ForbiddenError）
- [x] 新規の TypeError は露出していない（console errors を grep で確認、該当なし）
- [x] Dashboard 本体（「ダッシュボード」見出し等）は表示されていない
- [x] `/admin/metrics` でも同じ挙動

## 結論
DI 修正（usageMetricsProvider 配線）は認可経路に副作用を与えていない。
非 admin に対する `/admin` および `/admin/metrics` への拒否挙動は既存の `requireAdminUser`
（ForbiddenError → CatchBoundary → 「アクセスできません」画面）どおりで、新規の TypeError は発生しなかった。
