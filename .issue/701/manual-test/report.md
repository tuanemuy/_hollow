# ブラウザ検証レポート — Issue #701

**実行日:** 2026-06-14
**テストソース:** `.issue/701/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev`）
**制約:** `ADMIN_SPEECH_API_KEY` 未設定（Stub フォールバック）。OpenAI 文字起こしの実呼び出しを伴う happy path はユーザー判断により out of scope。

## サマリー

| TC | 内容 | 受け入れ基準 | 結果 |
|----|------|------|------|
| TC-admin-1 | `/admin/speech` 存在・ナビ・フォーム表示 | AC-1 | PASS |
| TC-admin-reverify(1) | API キー保存 → DB 反映 → SecretBox 暗号化 → マスク往復 | AC-1 | PASS |
| TC-admin-2 / reverify(2) | 接続テストが失敗時もクラッシュせず UI 表示 | AC-1 | PASS（401 probe 到達は out of scope） |
| TC-admin-3 | env override 表示・apiKeySource 既定 | AC-1 | PASS |
| TC-admin-regression | `/admin/llm`・admin ナビ・500 なし | 回帰 | PASS |
| TC-rec-4 | DropZone の audio 受理導線 | AC-3 | PASS（実文字起こしは SKIP） |
| TC-rec-6 | 録音 UI 状態（idle） | AC-4 | PARTIAL PASS（recording/stopped はマイク無で SKIP） |
| TC-rec-7 | マイク権限拒否フォールバック | AC-4 | PASS |
| TC-rec-edge2 | Stub 未設定時の markFailed 境界 | AC-6 境界 | PASS |
| TC-rec-regression | 既存 Markdown 取り込み | 回帰 | PASS |

**合計:** 検証可能 10 項目すべて PASS / PARTIAL PASS。**実装バグ 0 件。**

## out of scope（キー設定後に手動確認）

ユーザー判断「キーなしで進める」により、OpenAI 実呼び出しが必要な以下は未検証（環境制約であり実装バグではない）:

- AC-3 音声ファイル → 文字起こし → 構造化 → プレビュー → ノート保存の happy path
- AC-4 録音 → 文字起こし → ノート化の happy path（録音中状態・取り消し・再録音の実走）
- AC-1 接続テストの「成功」（有効キーでの probe 2xx）
- AC-5 取り込んだ音声の MediaAsset(kind=source) 保存・元ファイル閲覧/DL（取り込み成功が前提）
- AC-6 設定済みプロバイダでの SpeechFailureError 縮退プレビュー（実プロバイダ失敗の誘発が前提）

> これらは `ADMIN_SPEECH_API_KEY`（有効な OpenAI キー）を `.dev.vars` に設定し `pnpm dev` を再起動すれば検証可能。録音 happy path はマイク使用可能なブラウザ環境（または fake mic デバイス）が必要。

## 検証で確認できた主な事実

- **AC-1 暗号化保管**: 保存後 DB は `speech_provider=openai` / `speech_model=gpt-4o-transcribe` / `speech_api_key_source=db` / `speech_api_key_ciphertext=ENCRYPTED`（平文漏洩なし）。再読込で `••••GgzY` とマスク表示、平文はクライアントへエコーされない。
- **AC-1 別枠化**: ナビに「文字起こし設定」が「LLM 設定」とは独立して存在。`/admin/speech` が `/admin/llm` と対称の UX。
- **AC-4 権限拒否フォールバック**: 録音開始 → `getUserMedia` reject 時に「マイクを使用できませんでした…上のファイルアップロードから音声ファイルを取り込んでください。」を表示。未捕捉例外でクラッシュせず、ファイルアップロードへ誘導。
- **AC-6 境界**: Stub 未設定状態で音声を取り込むと `previewing` に到達せず markFailed（Stub の `unsupported_format`）。縮退プレビュー（`ingestion-failure-note`）は出ない＝ADR-005 の「縮退対象は実プロバイダの `SpeechFailureError` のみ」と一致。
- **回帰なし**: `/admin/llm`・既存 Markdown 取り込み・admin ナビすべて従来どおり。audio 縮退分岐追加で else 経路（LLM 構造化）は破壊されていない。

## 検証ハーネス上の注意（実装バグではない）

`pnpm dev`（vite, ポート 3000）と `wrangler.toml` の `APP_URL=http://localhost:8787` が不一致のため、初回は全 state-changing POST が CSRF（`FORBIDDEN_CROSS_ORIGIN`）で 403 になった。`.dev.vars` に `APP_URL=http://localhost:3000` を一時上書きして dev を再起動することで解消し、保存・接続テストを検証できた（検証後 `.dev.vars` は原状復帰済み）。これは vite dev 経路固有のハーネス設定差であり Issue #701 の変更とは無関係。

## 起票した Issue

なし（実装バグは検出されず。out of scope 項目は環境制約のため起票対象外）。
