# TC-3: `/admin/speech` で `deepgram-workers-ai` を選択・保存できる（AC-3 / AC-5）

結果: **PASS**

## 前提・環境
- サーバ: http://localhost:3001（起動済み・env ロック解除済みでフォーム編集可能）
- ログイン: `__Host-session=dev-admin-session-token` を CDP 注入 → `/admin/speech` が admin 画面として表示（ログイン成功）
- 前回 BLOCKED 要因（`wrangler.toml` `[vars]` の `ADMIN_SPEECH_PROVIDER` / `ADMIN_SPEECH_MODEL` 固定）が解除され、プロバイダ `<select>` とモデル欄が編集可能になっている。

## 操作 / 期待 / 実際 / 判定

| # | 操作 | 期待 | 実際 | 判定 |
|---|------|------|------|------|
| 1 | `/admin/speech` を開き `<select>` を確認 | select が not disabled で「Deepgram (Workers AI)」(value=`deepgram-workers-ai`) が存在 | select は編集可能（disabled でない）。選択肢 `OpenAI` / `Deepgram` / `Gemini` / `Deepgram (Workers AI)` の4択が存在。初期選択 OpenAI | PASS |
| 2 | 「Deepgram (Workers AI)」を選択 | 選択が反映される | combobox の値が「Deepgram (Workers AI)」に変わり option[selected] が移動 | PASS |
| 3 | 選択後のモデル欄・API キー欄・説明文を確認 | モデルが `@cf/deepgram/nova-3` に自動セット / API キー欄が「不要」に分岐（通常のキー入力欄なし）/ Workers AI の鍵不要注記 | モデル欄が `@cf/deepgram/nova-3` に自動セット。API キー欄は通常の textbox が消え「不要（Cloudflare が管理）」表示に分岐。説明文「このプロバイダは Cloudflare Workers AI 経由で動作し、API キーは不要です（認証は Cloudflare アカウント側で管理されます）」および「Workers AI 版は API キー不要です。認証は Cloudflare が管理します。」を確認 | PASS |
| 4 | 「変更を保存」押下 → wait → snapshot | ゲートエラーなく保存成功 | 「保存しました」を表示。「現在の保存値: Deepgram (Workers AI)」に更新 | PASS |
| 5 | 保存成功（サーバ側ゲートで弾かれない）を確認 | 成功表示、"No api key" / "provider changed requires api key" / "env override missing key" 系エラーが出ない | 既定 openai からの切替（providerChanged=true かつ鍵なし）でもゲートエラーは一切出ず「保存しました」で成功。キー不在ゲートで弾かれていない | PASS |
| 6 | 再読込で保持を確認 | `deepgram-workers-ai` / `@cf/deepgram/nova-3` が保持 | `/admin/speech` を再 open。プロバイダ = Deepgram (Workers AI)、現在の保存値 = Deepgram (Workers AI)、既定モデル = `@cf/deepgram/nova-3` が保持されていることを確認 | PASS |

## 得られた証拠
- キーレス分岐 UI が正しく動作: プロバイダを Workers AI に切り替えると API キー入力欄が「不要（Cloudflare が管理）」に置き換わる。
- モデル既定値 `@cf/deepgram/nova-3` が自動セットされる。
- `providerChanged=true` かつ鍵なしでの保存がサーバ側ゲートで弾かれずに成功（AC-3 の肝）。
- 再読込後も値が永続化されている。
