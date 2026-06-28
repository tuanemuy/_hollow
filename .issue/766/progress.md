# 残存課題 — Issue #766

## AC-1（実 Gemini での webm/opus 受理検証）— マージ前提条件・未実施

- **内容:** 実録音した webm/opus（＋できれば m4a）を実 Gemini API（`gemini-2.5-flash`）に当て、adapter / ネットワーク層で **2xx + 非空 transcript** を直接確認する。これが本 Issue のマージ可否を決めるゲート（OK→マージ / NG→revert）。
- **未実施の理由:** 実 Gemini API キー（`AIza...`）と実録音 webm/opus ファイルが必要で、自動エージェント環境では用意できない。agent-browser は実マイク録音不可。ユーザー判断により本フェーズでのブラウザ検証は全スキップ。
- **影響範囲:** コード差分（domain union / registry / adapter / UI / 回帰テスト）は実装・コミット済みで `pnpm test`（4303 件）PASS。ただし契約準拠のみで実フォーマット受理は未担保。
- **引き継ぎ手順:** `.issue/766/testing.md` の「確認項目 3（実ファイル受理検証）」に従う。
  1. `.dev.vars` に `ADMIN_SPEECH_PROVIDER=gemini` / `ADMIN_SPEECH_MODEL=gemini-2.5-flash` / `ADMIN_SPEECH_API_KEY=<実キー>`。
  2. 実録音 webm/opus を adapter / ネットワーク層で確認（**ノート保存成功を合否に使わない** — `runIngestionJob` が `SpeechFailureError` を握り潰し空 transcript で「成功」化するため）。
  3. **OK** → `.issue/766/plan.md` ステップ10（spec/adr/013-speech-provider.md・spec/domains/adminSettings.md を Gemini 反映、`.issue/766/adr.md` を Accepted、`.issue/738` ADR-002 を Superseded by #766 に更新）を別コミットで実施し、PR を Ready にしてマージ。
  4. **NG** → 実装コミットを `git revert`。拒否された mime / status / エラーメッセージを `.issue/766/adr.md` ADR-003 に追記し、`.issue/738` ADR-002 を Accepted（NG 結果記録）据え置き。

## UI レベル検証（AC-2 の画面操作部分）— 未実施

- `/admin/speech` で Gemini が選択肢に出る・既定モデル `gemini-2.5-flash` 自動セット・placeholder `AIza...` 表示の agent-browser 検証も同スキップ対象。`.issue/766/testing.md` 確認項目 1〜2 を参照。コード上はユニットテストで二重リスト pin / registry ディスパッチを担保済み。
