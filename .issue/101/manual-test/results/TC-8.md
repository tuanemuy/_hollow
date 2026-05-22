# TC-8 UI 部分: provider 変更時の警告 + apiKey required 切替（ADR-008）

**結果**: PASS

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | 初期状態（保存済み provider = anthropic）から openai を選択 | 警告バナー表示 | `alert` role 要素で「**プロバイダの変更** プロバイダを変更すると API キーの再入力が必要です。 下の「新しい API キー」欄に新しい鍵を入力してください。」が表示 | PASS |
| 2 | apiKey 入力欄の `required` 属性確認 | `required=true` が付与 | `document.querySelector('input[name="apiKey"]').required === true` を JS で確認 | PASS |
| 3 | 視覚的「必須」マーク表示確認 | required 表示あり | スナップショットで `textbox "新しい API キー" [required, ref=e18]` を確認。さらに paragraph で「プロバイダを変更したため、新しい API キーの入力が必要です。」のヘルプ文が表示 | PASS |
| 4 | provider を別のものに変えた場合も同様に切り替わるか | gemini に変えても警告 + required 維持 | gemini 選択時もスナップショットで alert と `[required]` を確認 | PASS |

## スクリーンショット

- Step 1-3 (openai 選択時): `screenshots/tc-8/step-01-openai-warning.png`
- 補助 (TC-4 と共通、openai 状態): `screenshots/tc-4/step-02-openai.png`
- 補助 (gemini 状態): `screenshots/tc-4/step-03-gemini.png`

## 備考

- 警告バナーは `role="alert"` でアクセシブルに render。
- apiKey 入力欄は通常時 `required=false`、provider が現在の保存値（anthropic）と異なる選択になった瞬間 `required=true` に切替。
- 「現在の保存値: Anthropic Claude」表示が常に出ており、ユーザーが差分を視認できる。
- ADR-008 のサーバーサイド検証部分（`BusinessRuleError(ADMIN_SETTINGS_PROVIDER_CHANGED_REQUIRES_API_KEY)`）は本テストの UI 範囲外（サーバ送信は実施しないため）。HTML5 `required` 属性によるクライアント側ブロックは確認済み。
