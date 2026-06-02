# テスト実行サマリー — Issue #416

**実行日時**: 2026-06-02
**テストソース**: .issue/416/testing.md
**サーバー**: http://localhost:5180（vite dev / ライブソース）

## 前提（重要）

このプロジェクトの `--color-accent` は青/ブランド色ではなくモノクロ near-black `oklch(37.1% 0 0)` = `oklch(0.371 0 0)`。surface は light gray `#f5f5f7`。primary ボタンの「accent 表示」とは near-black 背景＋白文字を指す。data-primary 付与漏れの退行は「near-black が light gray に化ける」形で現れる。

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | /login 送信ボタン（BTN_PRIMARY, button） | 正常系 | PASS | bg=accent `oklch(0.371 0 0)`・白文字・h48px・w-full・pill980px・px-8・text-md17px・data-primary有。hover で accent-hover |
| TC-002 | /signup primary ボタン | 正常系 | PASS | 送信ボタン accent（TC-001 と同値）。ヘッダ/フッタの「ログイン」は plain text link（pill でない） |
| TC-003 | /admin-signup（実ルート /setup） | 正常系 | SKIP | dev DB に既存管理者ありで notFound() ガード発火・404。DB 状態依存で到達不能。コード上は data-primary 付与済み確認 |
| TC-004 | /password-reset 送信ボタン | 正常系 | PASS | accent 同値。「ログインに戻る」は plain text link |
| TC-005 | disabled 表示 | 異常系 | PASS | JS で disabled 強制付与 → opacity=0.55・cursor=not-allowed・bg は accent 維持（hover/active は not-disabled ガードで無効）。実 POST は 403 制約のため強制付与で代替 |

**合計**: 5 件（PASS: 4 / SKIP: 1 / FAIL: 0）

## 総合判定: PASS

全 primary ボタンが accent 縦長 pill で表示され、data-primary 付与漏れによる surface 化けは検出されず。

## コード側の網羅確認

- `grep -rEn "className=.*BTN_PRIMARY(_INLINE)?" app/components/auth --include="*.tsx"` = 17 行、全行に `data-primary=""` 付与済み（漏れゼロ）。
- `BTN_SECONDARY_TALL` は VerifyEmail で 1 箇所のみ、data-primary なし（surface のまま、正しい）。
- 意図的変化の確認: disabled opacity が 0.55（旧 0.60 から ADR-002 通り変化）、push 時 active:scale（ADR-003）。

## 未検証（token ゲートで到達不能）

- VerifyEmail / EmailChangeConfirm 画面。これらの `BTN_PRIMARY_INLINE` / `BTN_SECONDARY_TALL` は同一 className 合成のため構造的に確認済み（TC-001/002/004 と同じ primitive）。

## スクリーンショット

- TC-001: screenshots/tc-001-login.png
- TC-002: screenshots/tc-002-signup.png
- TC-003: screenshots/tc-003-admin-signup.png
- TC-004: screenshots/tc-004-pwreset.png
- TC-005: screenshots/tc-005-disabled.png
