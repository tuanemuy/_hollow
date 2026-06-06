# ブラウザ検証レポート — Issue #456

**実行日:** 2026-06-06
**サーバー:** http://localhost:3000（`PORT=3000 pnpm dev`）
**テストソース:** `.issue/456/testing.md`（ブラウザでのスモーク確認・任意）

## スコープ

Issue #456 は logIn usecase の内部（legacy hash の rehash タイミング）と CredentialStore port の戻り値型の変更で、ユーザーに見える UI 変更・login route の配線変更はない。

core の確認項目（active での rehash / pending・suspended・deleted での rehash 不発火）は実 D1 統合テストで完全担保済み（`pnpm test:integration` → **579 passed / 45 files**、identity 60 passed）。ブラウザ検証は route → server action → logIn usecase → verifyPassword の配線が refactor 後も健全であることの end-to-end スモークに絞った。

## テスト結果

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-001 | ログインページ描画 + 誤認証情報の拒否 | スモーク | PASS |

**合計:** 1 件（PASS: 1 / FAIL: 0）

### TC-001 観察結果

- ログインページが正常に描画（email 入力・password 入力・「ログイン」送信ボタンが存在）
- 誤った認証情報（`nonexistent-456@example.com` / `WrongPassw0rd!`）で送信 → `alert` ロールのエラー「ログインできませんでした。認証が必要です」を表示（invalid_credentials 相当の認証拒否）
- URL は `/login` のまま、保護領域への遷移なし。500 エラー・画面クラッシュなし

→ route → server action → logIn usecase → verifyPassword の null 経路が end-to-end で健全に動作。refactor による配線退行なし。

## 起票した Issue

なし（全 PASS）。

## 成果物

- 結果: `.issue/456/manual-test/results/TC-001.md`
- スクリーンショット: `.issue/456/manual-test/screenshots/tc-001/`
