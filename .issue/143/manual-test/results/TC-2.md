# TC-2: 全 4 env set (full lock + banner)

**結果**: PASS
**実行時間**: 約 90 秒（agent-browser ステップ合計）

## 前提条件
- `wrangler.toml` (`[vars]`):
  - `ADMIN_LLM_PROVIDER = "anthropic"`
  - `ADMIN_LLM_MODEL = "claude-3-5-sonnet-latest"`
  - `ADMIN_LLM_BASE_URL = "https://api.anthropic.com"`
- `.dev.vars`:
  - `ADMIN_LLM_API_KEY="sk-ant-fake-test-key-for-manual-verification"`
- 期待される envOverrides: `{ provider: true, model: true, apiKey: true, baseURL: true }` → `allLocked = true`

## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | http://localhost:3000/login を open + networkidle wait | ログインフォーム表示 | "ログイン" 見出し + メール / パスワード入力欄表示 | PASS |
| 2 | email=admin@example.com / password=Password123! を入力して「ログイン」ボタンをクリック | 認証成功 | リダイレクト完了、管理者モード表示確認 | PASS |
| 3 | http://localhost:3000/admin/llm を open + networkidle wait + screenshot | LLM 設定ページ表示 + 全フィールド lock 状態 | "LLM 設定" 見出し、provider / apiKey / model セクション表示、全 input disabled | PASS |
| 4 | 全体 banner（"すべての LLM 設定が環境変数で固定中"）が **表示されている** こと | banner 表示 | snapshot に `status` ロールで `<strong>すべての LLM 設定が環境変数で固定中</strong>` ＋ 補足文言「プロバイダ・モデル・Base URL・API キーのすべてが環境変数で設定されています。 このページからの変更は反映されません。設定を変更するには `ADMIN_LLM_*` 環境変数を更新してください。」表示 | PASS |
| 5 | provider select の disabled / lock 文言を確認 | provider select が disabled | combobox "プロバイダ" `[expanded=false, disabled, ref=e15]: Anthropic Claude`。HTML: `<select id=... name="provider" disabled="" ...>`。dropdown options 3つ（Anthropic / OpenAI-compatible / Google Gemini）すべて `[disabled]`。文言「環境変数 `ADMIN_LLM_PROVIDER` で固定されているため変更できません。」 | PASS |
| 6 | apiKey input の disabled / lock 文言を確認 | apiKey input が disabled | textbox "新しい API キー" `[disabled, ref=e17]`。HTML: `<input ... type="password" ... disabled="" ...>`。文言「環境変数 ADMIN_LLM_API_KEY で固定されているため変更できません。」、status「現在の状態 環境変数から読み込み中」 | PASS |
| 7 | model input の disabled / lock 文言を確認 | model input が disabled | textbox "既定モデル" `[disabled, ref=e20]: claude-3-5-sonnet-latest`。HTML: disabled 属性確認。文言「環境変数 `ADMIN_LLM_MODEL` で固定されているため変更できません。」 | PASS |
| 8 | baseURL 入力フィールドの確認 | baseURL も disabled / lock 表示 もしくは provider 切り替え不能のため非描画 | provider=anthropic では実装上 `showBaseURL = provider === "openai"` のため baseURL 入力欄は非描画。provider が env override で anthropic 固定のため切り替え不能。`envOverrides.baseURL = true` は `allLocked` 計算に寄与し、banner 文言「Base URL ・・・のすべてが環境変数で設定されています」で間接的に lock 状態が示される | PASS（仕様準拠） |
| 9 | 保存ボタン disabled を確認 | 「変更を保存」ボタン disabled | button "変更を保存" `[disabled, ref=e13]`（HTML 上も `disabled=""` 属性確認） | PASS |
| 10 | ページ DOM（HTML / snapshot / get text）に `sk-ant-fake-test-key-for-manual-verification` が含まれていないこと | secret 非露出 | `agent-browser get html body` で取得した 71KB の HTML 全体に `sk-ant` も `fake-test-key` も 0 件。snapshot にも 0 件。`<input type="password">` の `value=""` のみ。 | PASS |
| 11 | セッション close | クリーンアップ完了 | `✓ Browser closed` | PASS |

## スクリーンショット
- /Users/hikaru/github.com/tuanemuy/hollow/.issue/143/manual-test/screenshots/tc-2/step-04-admin-llm-full-lock.png

## 失敗詳細
なし（全項目 PASS）

## Secret hygiene チェック
- ページ DOM（HTML body 71KB）に env API key 実値が含まれていないこと: **PASS**
  - 検査コマンド: `agent-browser get html body | grep "sk-ant"` → 0 件
  - 検査コマンド: `agent-browser get html body | grep "fake-test-key"` → 0 件
  - snapshot 全文にも 0 件
  - apiKey input の HTML は `<input type="password" disabled="" ...>` で `value` 属性すら付与されておらず、env から読み込まれた値は presentation 層に渡されていない
- レスポンス JSON（DTO）の安全性: 実装上、AdminSettingsDTO（`app/core/application/dto/adminSettings.ts`）には `apiKey` 実値フィールドが存在せず、`apiKeySource: "env"|"db"|"none"` のみ送出される設計。env から固定されている場合も実値は presentation 層に露出しない

## 観察事項
- **全体 banner**: `status` ロールで描画され、`<strong>すべての LLM 設定が環境変数で固定中</strong>` ＋ 補足文。`index.tsx` の `allLocked = provider && model && apiKey && baseURL` 条件が true で表示される。TC-1 の banner 非表示と対照的で、4 env override 揃った状態で初めて banner が出るという挙動が確認できた。
- **lock 文言の一貫性**: 各セクション（provider / apiKey / model）に「環境変数 `ADMIN_LLM_<NAME>` で固定されているため変更できません。」と env 名を明示。`<code>` タグで env 名が囲まれている。
- **provider の dropdown options**: provider select が disabled でも、HTMLには 3つの option（anthropic/openai/gemini）が描画されていて、すべて `disabled` 属性が個別に付与されている。これにより JavaScript 無効環境でも編集不能を保証している。
- **baseURL の扱い**: 入力欄自体は provider=anthropic では描画されないが、`envOverrides.baseURL = true` は `allLocked` の計算に正しく寄与し、banner 文言「プロバイダ・モデル・Base URL・API キーのすべてが環境変数で設定されています」で明示的に列挙される。
- **保存ボタン**: HTML に `disabled=""` 属性。`allLocked` を含む全フィールド lock 時には submit 不能。
- **apiKey input は password type**: `<input type="password">` で描画され、`value` 属性に env 値が露出することがない（むしろ value 属性自体が省略されている）。これは TC-2 の secret hygiene を担保する重要な実装ポイント。
- **status「環境変数から読み込み中」**: TC-1 と同じく `apiKeySource === "env"` を反映する表示。TC-2 では実際に env から API key が読み込まれているため、この status は正確。
- **管理ナビゲーション**: ヘッダーに「管理者モード」インジケータ、左ナビに admin リンク群（ダッシュボード / LLM 設定 / プロンプト / デザイントークン / 登録制御 / ユーザー / 利用状況 / ジョブ監視）すべて表示。
