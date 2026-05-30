# ブラウザ検証レポート — Issue #239: UI にログアウト導線を追加

**実行日時**: 2026-05-30
**テストソース**: `.issue/239/testing.md`
**サーバー**: http://localhost:5180/（`pnpm dev --port 5180`）
**ブラウザ**: agent-browser 0.27.0
**ログインユーザー**: existing@example.com / Password123!（member）

## 結果概要

**全 8 件 PASS / FAIL 0 件**

ヘッダーアバターのドロップダウンメニュー化、ユーザー情報表示、設定導線、ログアウト（セッション破棄→`/login`）、キーボード操作、外側クリックでの閉じ、既存ヘッダーの回帰、すべて期待通り動作した。

## テストケース詳細

### TC-001: アバタークリックでドロップダウンメニューが開く — PASS
ログイン後ヘッダー右上のアバターは `button "existing-user のメニュー" [expanded=false]`（従来の `/` リンクから変更済み）。クリックで `expanded=true` となり `role="menu"` のパネルが開いた。ページ遷移は発生しない。
- スクショ: `screenshots/tc001-002-menu-open.png`

### TC-002: ユーザー情報の表示 — PASS
メニュー冒頭に「existing-user」（表示名）/「existing@example.com」（メール）/「メンバー」（ロールの日本語ラベル）が表示。これらは `menuitem` ではなく非インタラクティブ表示で、キーボードナビゲーション対象外。

### TC-003: 「設定」項目から設定画面へ遷移 — PASS
メニューの `menuitem "設定"` クリックで `/settings` に遷移、メニューは閉じた。
- スクショ: `screenshots/tc003-settings.png`

### TC-004: ログアウトでセッション破棄→ログイン画面 — PASS
メニューの `menuitem "ログアウト"` クリックで `/login` に遷移。`logOutFn`（セッション revoke + cookie クリア）→ `router.invalidate()` → `navigate({ to: "/login" })` の経路が機能。
- スクショ: `screenshots/tc004-after-logout-login.png`

### TC-005: ログアウト後に認可リソースへアクセス — PASS
ログアウト後:
- `/notes/new` → `/`（HOME）へリダイレクト（`_app` ガードが未認証を検出）
- `/settings/profile` → 保護データを返さず「エラーが発生しました」表示

いずれも保護リソースが露出せず、セッションが破棄されていることを確認。完了条件「ログイン画面（または `/`）にリダイレクト」を満たす。

（注: `/settings` ルートが `/login` へ明示リダイレクトせずエラー表示になるのは、本Issueの変更とは無関係の既存ルートガードの挙動。summary.md / analysis.md 参照。）

### TC-Edge-1: キーボード操作 — PASS
- メニュー開時、先頭項目「設定」に自動フォーカス（roving tabindex）
- ArrowDown: 設定 → ログアウト → （ラップ）設定
- Escape: メニューが閉じ（`expanded=false`）、フォーカスがアバター（`aria-label="existing-user のメニュー"`）に復帰
- スクショ: `screenshots/tc-edge-keyboard.png`

### TC-Edge-2: メニュー外クリックで閉じる — PASS
メニューを開いた状態で検索ボックス（メニュー外）をクリック → `expanded=false` でメニューが閉じた。

### 既存機能の回帰 — PASS
ヘッダーの検索ボックス・「新規作成」・「アップロード」・ロゴ「Hollow」がすべて従来通り表示・配置。`UserMenu`（`"use client"`）が RSC 化された `Header` 内でインタラクティブに動作しており、hydration mismatch やインタラクション不全は観測されなかった（plan.md のリスク「RSC 境界」をクリア）。

## 起票したIssue
- 実装バグによる起票: なし（全PASS）
- スコープ外の発見（`/settings` ルートの未認証ガード不備）: Phase 4 で検討

## 成果物
- サマリー: `results/summary.md`
- 原因分析: `results/analysis.md`
- シードデータ: `seed-data.md`
- スクリーンショット: `screenshots/`
