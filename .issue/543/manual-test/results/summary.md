# Issue #543 ブラウザ検証サマリー

**Issue:** #543 — 領域4「設定」(P21〜P24) のモック実装追従
**検証日:** 2026-06-07
**環境:** http://localhost:3000/（pnpm dev / Cloudflare ランタイム）、ログインユーザー `dev-admin`、`APP_URL=http://localhost:8787`
**ツール:** agent-browser 0.27.0

## 結果集計

| 区分 | 件数 |
|------|------|
| 合計 | 7 |
| PASS | 6 |
| FAIL | 0 |
| SKIP | 1（エッジケース1: ユニットテストで担保） |

## テストケース一覧

| TC | 内容 | 結果 |
|----|------|------|
| TC-001 | 戻り導線「すべてのノートに戻る」（A） — P21〜P24 全画面に ArrowLeft 付き、profile からホーム遷移 | PASS |
| TC-002 | bio 文字数カウンタ `N / 500`（B-2） — 初期 `37/500`、入力/削除で追従、maxLength=500 | PASS |
| TC-003 | ユーザー名 URL prefix・プレビュー・レート制限ヘルプ（B-3） — prefix `http://localhost:8787/u/`、プレビュー追従・`//u/` なし、30日 | PASS |
| TC-004 | パスワード強度ヘルプ（C-2） — 「12文字以上。…2種以上…」+ aria-describedby 紐付け | PASS |
| TC-005 | P24「取り消せません」強調（E-1） — strong 強調、ユーザー名一致削除フロー不変、スコープ外追加なし | PASS |
| TC-006 | section-desc 整合（B-1/C-1/D-1） — profile/security/prompts desc 表示、P22 現在パスワード要求・P23 5用途独立保存 不変 | PASS |
| TC-007 | エッジケース1: APP_URL 未設定の相対 `/u/` フォールバック | SKIP（要サーバー再起動・ユニットテスト担保） |

## 主要確認ポイントの結果

- P21〜P24 全画面で「すべてのノートに戻る」表示・ホーム遷移（href=`/`）
- bio カウンタ `N / 500`（160 ではない）、入力に追従、maxLength=500
- ユーザー名 prefix・プレビューが実 appUrl（`http://localhost:8787`）ベース（hollow.example ダミーなし）
- レート制限ヘルプ「30日に1回」（90日でない）、「次に変更できる日付」算出値なし
- 新パスワード強度ヘルプ「12文字以上・2種以上」+ aria-describedby
- P24「取り消せません」strong 強調、削除確認フロー（ユーザー名一致）不変
- section-desc がモックに整合（P22 パスワード変更 desc は ADR-005 の意図的差異＝実装が正）
- スコープ外機能（セッション一覧の拡張/多段削除/影響リスト/アバター等）の追加なし

## FAIL / 懸念

なし。全 PASS（1 件はスコープ上の SKIP）。

## 代表スクリーンショット

- 戻り導線: `screenshots/tc-001/step-01-profile-sidebar.png`
- bio カウンタ: `screenshots/tc-002/step-01-bio-counter.png`, `step-02-after-type.png`
- ユーザー名プレビュー: `screenshots/tc-003/step-02-username-typed.png`
- パスワードヘルプ: `screenshots/tc-004/step-01-password-help.png`
- アカウント削除強調: `screenshots/tc-005/step-01-account-delete.png`
- 確認ダイアログ: `screenshots/tc-005/step-02-confirm-dialog.png`
