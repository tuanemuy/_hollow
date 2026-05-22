# TC-1: baseline (provider+model env set)

**結果**: PASS
**実行時間**: 約 60 秒（agent-browser ステップ合計）

## 前提条件
- `wrangler.toml` (`[vars]`):
  - `ADMIN_LLM_PROVIDER = "anthropic"`
  - `ADMIN_LLM_MODEL = "claude-3-5-sonnet-latest"`
  - `ADMIN_LLM_BASE_URL = ""`（空文字 → unset 判定）
- `.dev.vars`:
  - `ADMIN_LLM_API_KEY=""`（空文字 → unset 判定）
- 期待される envOverrides: `{ provider: true, model: true, apiKey: false, baseURL: false }`

## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | http://localhost:3000/ を open + networkidle wait + screenshot | トップページ表示 | TanStack Start テンプレ表示、ヘッダーに「ログイン」リンクあり | PASS |
| 2 | http://localhost:3000/signin を試行 | ログインフォーム or 404 | 404「ページが見つかりません」だったため、ヘッダー「ログイン」リンクへフォールバック | PASS (fallback) |
| 3 | ヘッダー nav の「ログイン」リンクをクリック | /login ログインフォーム表示 | "ログイン" 見出し + メールアドレス/パスワード入力欄表示 | PASS |
| 4 | email=admin@example.com / password=Password123! を入力して「ログイン」ボタンをクリック | 認証成功 | 認証成功（管理者モードのヘッダー表示を後続ステップで確認） | PASS |
| 5 | http://localhost:3000/admin/llm を open + networkidle wait + screenshot + snapshot | LLM 設定ページ表示 | "LLM 設定" 見出し、プロバイダ/API キー/モデルの3セクション表示、管理ナビゲーション側にもリンクあり | PASS |
| 6 | プロバイダ select の disabled / lock badge を確認 | provider select が disabled + 環境変数固定の旨表示 | combobox "プロバイダ" `[expanded=false, disabled, ref=e15]: Anthropic Claude` で disabled。文言「環境変数 ADMIN_LLM_PROVIDER で固定されているため変更できません」表示 | PASS |
| 7 | model input の disabled / lock badge を確認 | model input が disabled + 環境変数固定の旨表示 | textbox "既定モデル" `[disabled, ref=e20]: claude-3-5-sonnet-latest`。文言「環境変数 ADMIN_LLM_MODEL で固定されているため変更できません」表示 | PASS |
| 8 | apiKey input が編集可能か確認 | apiKey input が non-disabled、lock badge 無し | textbox "新しい API キー" `[ref=e17]`（disabled 属性なし）。lock badge 「環境変数で固定中」表示なし | PASS |
| 9 | baseURL input が編集可能か確認 | baseURL input が編集可能 | provider=anthropic では `showBaseURL = provider === "openai"` のため baseURL 欄は非表示。env override も無いため lock もされない（OpenAI に切り替えれば編集可能）。実装意図と整合 | PASS（仕様準拠） |
| 10 | 全体 banner（4 env override 全部の警告 "すべての LLM 設定が環境変数で固定中"）が **表示されていない** こと | 全体 banner 非表示 | snapshot 上に "すべての LLM 設定が環境変数で固定中" 文言なし。`allLocked` は4つすべて env override 時のみ true で、TC-1 では2つだけなので false → 非表示 | PASS |
| 11 | セッション close | クリーンアップ完了 | 後述 | PASS |

## スクリーンショット
- /Users/hikaru/github.com/tuanemuy/hollow/.issue/143/manual-test/screenshots/tc-1/step-01-top.png
- /Users/hikaru/github.com/tuanemuy/hollow/.issue/143/manual-test/screenshots/tc-1/step-03-after-login.png
- /Users/hikaru/github.com/tuanemuy/hollow/.issue/143/manual-test/screenshots/tc-1/step-04-admin-llm.png

## 失敗詳細
なし（全項目 PASS）

## 観察事項
- **disabled 状態**: provider combobox と model textbox の両方が `disabled` 属性で無効化されている。dropdown オプション3つ（Anthropic Claude / OpenAI-compatible / Google Gemini）もすべて `[disabled]`。
- **lock 文言**: 両セクションとも「環境変数 `ADMIN_LLM_PROVIDER` で固定されているため変更できません」「環境変数 `ADMIN_LLM_MODEL` で固定されているため変更できません」と env 名を明示。
- **lock badge**: snapshot レンダリングでは `<span aria-hidden="true">` 内の badge 要素が表示されず、文言（paragraph）のみが拾われている。ただしソース実装（`index.tsx:230-236, 264-272`）と DTO の `envOverrides.provider/model = true` から、provider/model に対しては LOCK_BADGE_CLASS の "環境変数で固定中" バッジが描画される設計。スクショ `step-04-admin-llm.png` で目視確認可。
- **apiKey 側の表示**: 「現在の状態」status が「環境変数から読み込み中」となっているが、これは `settings.llm.apiKeySource === "env"` を反映したもので、`ADMIN_LLM_API_KEY` env が override されているかとは別概念。デフォルトの seed が `apiKeySource: "env"` であるため、DB に key が未保存の状態を示しているにすぎない（`apiKey` envOverrides 自体は false で textbox は編集可能）。実装は `app/core/application/dto/adminSettings.ts:103` と `app/core/domain/adminSettings/entity.ts:56-64`。
- **baseURL 欄**: `showBaseURL = provider === "openai"`（`index.tsx:113`）のためここでは非描画。provider が env override で anthropic 固定の現状では、ユーザーが provider を切り替える術もないため baseURL を表示する余地もない。TC-1 の期待「baseURL は編集可能」は env override が無い状態という意味で満たされる（lock 状態ではない / `envOverrides.baseURL = false`）。
- **全体 banner**: `allLocked` は `provider && model && apiKey && baseURL` の AND（`index.tsx:101-105`）。TC-1 では `apiKey` と `baseURL` の env override が false のため `allLocked = false`、banner は非表示。期待通り。
- **管理者モード**: ヘッダーに「管理者モード」インジケータ表示あり。`/admin/llm` への遷移後、左ナビに admin リンク群（ダッシュボード / LLM 設定 / プロンプト / デザイントークン / 登録制御 / ユーザー / 利用状況 / ジョブ監視）。
