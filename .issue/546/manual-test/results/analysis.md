# 失敗分析 — Issue #546 ブラウザ検証

初回実行で FAIL/BLOCKED となった TC-001 / TC-003 を分析した。**いずれも実装バグではなく、Issue 起票は不要**と結論。

## TC-001（初回 FAIL → 再判定 PASS）: テスト手順の問題

- **症状**: 重複メール（`dev-admin@example.com`）でのサインアップ送信失敗が、案D サマリーアラート（「登録に失敗しました。」）ではなく、メール欄直下のインラインフィールドエラー（「すでに登録されています」）として表示された。
- **原因**: 重複メール/ユーザー名は `assertSignUpAvailability`（`app/core/application/identity/signUpAvailability.ts`）が `ValidationError`（field-bound）に変換する設計（#201 ADR-002）。SignUpForm は `state.error.kind !== "validation"` のときだけ summary を出すため、validation エラーはフィールド直下に回る。**これは仕様通りの正しい挙動**（plan.md の回帰方針とも一致）。
- **案D サマリー経路の検証**: 非 validation エラー時の案D サマリーは (1) ユニットテスト `SignUpForm.test.tsx`（`kind: "system"` で `role="alert"`・title・`--alert-accent`/`var(--color-error)`・非 `bg-error-surface`・アイコン・2 `<p>` を検証）、(2) TC-002（同一共通定数 `ALERT*` を使う LoginForm を実ブラウザで案D 描画確認）で実証済み。
- **分類**: テスト手順の問題（validation エラーに summary を期待したテスト設計の誤り）。実装バグなし。Issue 起票なし。

## TC-003（BLOCKED）: 環境問題

- **症状**: `/setup` が 404 を返し、Setup Token フォームに到達できない。
- **原因**: `app/routes/setup.tsx:22` が `setupTokenVerifier.isEnabled()` が false のとき `notFound()` を投げる。ローカル開発環境は SETUP_TOKEN 未設定のため `/setup` は常に 404。**プロダクトの不具合ではなく環境要因**。
- **AdminSignUpForm の案D 検証**: ユニットテスト `app/components/auth/__tests__/AdminSignUpForm.test.tsx` が Setup Token エラー（`setup_token_invalid` / `setup_token_disabled`）と一般 summary の案D 描画を検証済み。SignUpForm/LoginForm と同一の共通 `ALERT*` 定数を使用。
- **分類**: 環境問題（ローカルで Setup Token 無効）。実装バグなし。Issue 起票なし。

## 補足: dev サーバーの about:blank 事象

TC-001 のサインアップ送信時に agent-browser が繰り返し `about:blank` へ遷移し、dev サーバーがダウンする事象が一度発生。サーバー再起動後は `/signup` `/error` 等が HTTP 200 で安定動作。変更箇所（エラー表示 JSX のみ）は送信フローに触れておらず、テストハーネス（headless ナビゲーション）由来と判断。プロダクト不具合とはしない。
