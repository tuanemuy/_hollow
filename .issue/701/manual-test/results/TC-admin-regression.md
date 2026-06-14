# TC-admin-regression — 回帰確認（/admin/llm・ナビ・/admin/speech 追加の副作用）

- **対応:** Issue #701 testing.md 回帰 (a)(b)(c)
- **実行日:** 2026-06-14
- **結果:** PASS（GET 経路）／ LLM 保存の実行は env 固定＋CSRF 環境制約で未実施

## 操作と結果

| # | 観点 | 期待 | 実際 | 判定 |
|---|------|------|------|------|
| a | `/admin/llm` が従来どおり開ける・フォーム表示 | フォーム・保存導線が壊れていない | GET 200。heading「LLM 設定」、provider combobox（Anthropic/OpenAI-compatible/Gemini）、API キー欄、接続テスト、既定モデル、変更を保存が表示。`ADMIN_LLM_API_KEY` 設定済みのため入力は env-lock で disabled（=正常） | PASS |
| b | admin ナビの他項目リンク | リンクが壊れていない | ナビ9項目すべて表示: ダッシュボード/LLM 設定/文字起こし設定/プロンプト/デザイントークン/登録制御/ユーザー/利用状況/ジョブ監視 | PASS |
| c | `/admin/speech` 追加で 500 等が出ない | 各 admin GET が 200 | `/admin`=200, `/admin/llm`=200, `/admin/speech`=200, `/admin/prompts`=200, `/admin/users`=200 | PASS |

## 補足

- 「文字起こし設定」追加後も他の admin 画面・ナビに 500 や崩れなし。
- speech action の RSC side-effect import（`app/routes/admin/route.tsx` に
  `import "@/components/admin/SpeechSettingsForm/action";`）は登録済みで、
  server fn の manifest 未登録（testing.md 回帰 c のリスク）には該当しない。
  （403 は CSRF 由来であり、manifest 未登録なら 404/別エラーになる。）
- LLM 保存の実行確認は `ADMIN_LLM_API_KEY` env-lock（入力 disabled）＋ APP_URL/ポート不一致による CSRF 403 の両方で未実施。
  これは TC-admin-1 と同じ環境制約に起因し、回帰ではない。
