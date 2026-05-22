# TC-Edge2: openai + malformed baseURL のクライアントバリデーション

**結果**: PASS

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | provider = openai を選択 | baseURL フィールド表示 | `input[name="baseURL"] type="url"` 表示確認 | PASS |
| 2 | baseURL に `not-a-url` を入力 | テキスト入力 | fill 操作成功 | PASS |
| 3 | apiKey に dummy 値（`sk-test-dummy-key`）を入力 | required を満たすため | fill 操作成功（HTML5 required 違反でブロックされないようダミーキーを補填） | PASS |
| 4 | 「変更を保存」ボタンを click | HTML5 URL validation が反応してフォーム送信ブロック | `input.validity.valid === false`、`validationMessage === "URL を入力してください。"`、URL 不変（`/admin/llm`） | PASS |

## スクリーンショット

- Step 1-3 (malformed 入力時): `screenshots/tc-edge2/step-01-malformed-input.png`
- Step 4 (HTML5 validation 発火): `screenshots/tc-edge2/step-02-html5-validation.png`
- Step 4 (保存ボタン click 後): `screenshots/tc-edge2/step-03-after-submit-click.png`

## 備考

- baseURL 入力欄は `<input type="url">` で render されており、HTML5 標準の URL validation が機能。
- 「変更を保存」ボタン押下後も URL は `/admin/llm` のまま変化せず、サーバへのフォーム送信は発生しなかった（クライアント側で blocked）。
- `validationMessage` は日本語ローカライズ済み（「URL を入力してください。」）。
- これは ADR-004 の VO invariant 検証より前段のクライアントガードに該当。サーバ側 `z.string().url()` reject は本テストでは到達せず（クライアント validation が先に blocking）。期待結果「ブラウザ側で `<input type="url">` の HTML5 validation が反応するか、あるいは server 側で reject されるかを観察」のうち、**前者で確認**。
