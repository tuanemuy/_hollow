# 動作確認計画 — Issue #766: Gemini audio transcription provider を registry に追加

**Issue:** #766
**作成日:** 2026-06-27

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。本 Issue は **DB スキーマ変更なし**（`speech_provider` は任意文字列カラム、値が `gemini` に増えるだけ）のため新規マイグレーションは不要。

### 確認用管理者ユーザーの投入

`/admin/speech` および取り込み画面はログインが必要。決め打ちの admin ユーザー＋セッションをローカル D1 に投入する。

```bash
pnpm seed:dev-admin
```

> 出力されるセッショントークン（`dev-admin-session-token`）を `__Host-session` クッキーに注入してログイン状態にする。ブラウザ自動化では出力末尾の `agent-browser cookies set` の手順に従う。

### 検証環境の起動

取り込みは「アップロード → キュー → consumer」のパイプラインだが、ローカルでは consumer worker / Queue は起動しない。`pnpm dev`（vite dev）は `import.meta.env.DEV === true` のため取り込みディスパッチがリクエストと同一 isolate でインライン実行され（`InlineRelayTrigger`, `docs/runtime_cloudflare.md`「Local dev outbox dispatch」）、アップロード → 文字起こし → プレビューまでが追加設定なしで通る。本 Issue の動作確認はこの経路で行う。

```bash
pnpm dev
```

> 開発サーバー（Cloudflare runtime, `vite dev --config vite.config.cloudflare.ts`）が `http://localhost:3000` で起動する。

> 注意（CSRF）: `wrangler.toml` の `APP_URL` は `http://localhost:8787`（wrangler dev 用）で、`pnpm dev`（vite）のポート 3000 と不一致。このままだと保存・接続テスト等の state-changing POST が `csrfMiddleware` の cross-origin 拒否で 403 になる。ブラウザで POST 系（保存・接続テスト）を検証するときは `.dev.vars` に `APP_URL=http://localhost:3000` を一時的に設定して `pnpm dev` を再起動する（検証後は元に戻す）。これは vite dev 経路固有のハーネス差で、本 Issue の変更とは無関係。

### 文字起こしプロバイダ（Gemini）の設定

Gemini の実音声疎通・接続テストには有効な Gemini API キー（`AIza...` 形式）が要る。設定経路は env / db の 2 つ。

- **env 経路**: `.dev.vars` に `ADMIN_SPEECH_PROVIDER=gemini` / `ADMIN_SPEECH_MODEL=gemini-2.5-flash` / `ADMIN_SPEECH_API_KEY=<Gemini key>` を設定する。`.dev.vars` が無ければ `cp .dev.vars.example .dev.vars` で作成。設定後は `pnpm dev` を再起動する。
  - DI の wire 条件（`docs/runtime_cloudflare.md`）: 実 speech provider は `ADMIN_SPEECH_API_KEY` **と** `ADMIN_SPEECH_MODEL`（`[vars]` の public エントリ）が**両方**揃ったときのみ wire される。どちらか欠けると Stub に留まる。
- **db 経路**: env を未設定にし、`/admin/speech` 画面でプロバイダ（Gemini）・モデル（`gemini-2.5-flash`）・API キーを入力して保存する。保存値は `SecretBox` で暗号化されて DB に入る。db 経路を動かすには `.dev.vars` の `SECRET_BOX_MASTER_KEY`（`.dev.vars.example` に有効な placeholder 同梱）が必要。

> **接続テストの制約**: `/admin/speech` の「接続テスト」は draft test で `apiKeySource:"env"` 固定のため、**フォーム入力中の plain API キーを使えない**。新規 Gemini キーの事前テストは `.dev.vars` の `ADMIN_SPEECH_API_KEY` に置く（env 経路）か、一旦保存して DB ciphertext にしてから行う。これは #701 由来の既存制約で本 Issue でスコープ拡大しない。

> 録音 UI の検証はブラウザのマイク権限が要る。`http://localhost:3000` は `localhost` のため `getUserMedia` が許可される（secure context 扱い）。ヘッドレスのブラウザ自動化では fake mic デバイス（例: Chromium の `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`）を使う。fake デバイスは実音声を含まないため AC-1 の transcript 検証には実録音ファイルが要る（下記「実ファイル受理検証」参照）。

### デプロイ方法

本 Issue の動作確認は検証環境（ローカル `pnpm dev`）で完結する。ステージング反映が必要な場合のみ（DB マイグレーションは無いので適用不要）:

```bash
pnpm deploy:staging:dry   # wrangler 設定の syntax を先に dry-run 確認
pnpm deploy:staging:all   # web / relay / consumer / indexer / pruner / dlq を一括デプロイ
```

> ステージングは実 Queue 経由で consumer が取り込みを処理するため、`ADMIN_SPEECH_API_KEY` 等の secret を web と consumer の両 Worker に投入する必要がある（`docs/runtime_cloudflare.md` の secret 一覧に準拠）。`ADMIN_SPEECH_PROVIDER` / `ADMIN_SPEECH_MODEL` は `[vars]`（public）側。

---

## 確認項目

### 1. /admin/speech で Gemini を選択・保存できる

- **対応する受け入れ基準:** AC-2
- **目的:** domain union / transport list / UI ラベルが揃い、Gemini が選択肢として出て保存できる。
- **手順:**
  1. `pnpm seed:dev-admin` で admin 投入、`pnpm dev` 起動、ログイン。
  2. `/admin/speech` を開く。
  3. プロバイダのセレクトに **Gemini** が出ることを確認。選択する。
  4. 既定モデルが `gemini-2.5-flash` に自動セットされ、API キー placeholder が `AIza...` になることを確認。
  5. API キーを入力して保存する。
- **期待結果:** バリデーションエラーなく保存され、再読み込み後も Gemini / `gemini-2.5-flash` が保持される。
- **確認ポイント:** `InvalidSpeechProvider` 等の VO 構築エラーが出ないこと（二重リストが揃っている証拠）。説明文のプロバイダ列挙に Gemini が含まれること。

### 2. 接続テスト（probe）が 2xx を返す

- **対応する受け入れ基準:** AC-2
- **目的:** `geminiSpeechAdapter.ping`（`pingGemini` 委譲）が `lookupSpeechAdapter` 経由でディスパッチされ、認証 + model 存在を確認できる。
- **手順:**
  1. env 経路（`.dev.vars` に実 Gemini キー）で `pnpm dev` 起動。
  2. `/admin/speech` の「接続テスト」を実行する。
- **期待結果:** 接続成功（probe 2xx）が表示される。無効キー / 存在しない model なら失敗が表示される。
- **確認ポイント:** probe はテキスト ping であり**音声受理は保証しない**（AC-1 は別途実ファイルで検証）。

### 3. 実ファイル受理検証 — Gemini が webm/opus を 2xx + 非空 transcript で受理（マージ前提条件・非交渉）

- **対応する受け入れ基準:** AC-1
- **目的:** 録音 UI 既定の **webm/opus** を Gemini の inlineData(base64) 投入で受理し、文字起こし文字列が返ることを **adapter / ネットワーク層で直接**確認する。
- **重要（偽陽性の排除）:** consumer 経路（`runIngestionJob`）は `SpeechFailureError` を握り潰して空 transcript で「成功」扱いし、4xx 拒否でもノートが保存され得る。したがって **「ノート保存が成功した」ことを AC-1 の合否判定に使ってはならない**。判定は次のいずれかで行う:
  - (a) ローカル開発時のネットワーク/ログで、Gemini `generateContent` への POST が **HTTP 2xx** を返し、レスポンスの `candidates[...].content.parts[].text` に **非空の文字列**が入っていることを直接確認する。
  - (b) 一時的な検証スクリプト/単発実行で `GeminiSpeechRecognitionProvider.transcribe(audioBytes, mime="audio/webm;codecs=opus")` を実 Gemini に当て、**例外を投げず非空文字列を返す**ことを確認する（捨て検証コードは検証後に破棄）。
- **手順:**
  1. 実ブラウザの録音 UI で数秒の日本語発話を 1 本録音し、**webm/opus** バイト列を取得する。可能なら同音声の **m4a（audio/mp4, AAC）** も `ffmpeg` 等で用意。
  2. env 経路（`ADMIN_SPEECH_PROVIDER=gemini` / `ADMIN_SPEECH_MODEL=gemini-2.5-flash` / 実キー）で起動。
  3. 上記 (a) または (b) で **2xx + 非空 transcript** を直接確認する。
  4. m4a を用意できた場合は同様に確認する。
- **期待結果:** webm/opus が 2xx + 非空 transcript で受理される。
- **確認ポイント:** ネットワークが 4xx/`unavailable` を返していないか（握り潰しで空文字に化けていないか）。受理 NG なら plan.md ステップ 9 に従い実装コミットを revert し、拒否された mime / status / エラーメッセージを `.issue/766/adr.md` ADR-003 に記録する。

### 4. audio → 文字起こし → 構造化 → プレビュー → ノート保存のフルパス（受理 OK 時）

- **対応する受け入れ基準:** AC-3
- **目的:** 確認項目 3 で受理 OK を確認した上で、取り込みフルパスが Gemini 選択時に通る。
- **手順:**
  1. Gemini 設定で `pnpm dev` 起動・ログイン。
  2. 録音 UI もしくは audio アップロード経路で、確認項目 3 で受理確認済みの webm/opus を投入する。
  3. 文字起こし → 構造化 → プレビュー → ノート保存まで操作する。
- **期待結果:** プレビューに文字起こし由来の本文が表示され、ノートが保存される。
- **確認ポイント:** プレビュー本文が**非空**であること（確認項目 3 の受理 OK が前提。空本文ならフルパスは「通った」とみなさない）。

### 5. env > db > stub フォールバックと SecretBox 暗号化

- **対応する受け入れ基準:** AC-4
- **目的:** Gemini provider が request / consumer 両 DI 経路で env 優先・db フォールバック・stub フォールバックし、DB 保管時は SecretBox 暗号化される。
- **手順:**
  1. **env 経路:** `.dev.vars` に Gemini 設定あり → 実 Gemini が wire される（確認項目 2〜4 で確認済み）。
  2. **db 経路:** env の `ADMIN_SPEECH_*` を外し、`/admin/speech` から Gemini・モデル・キーを保存（SecretBox 暗号化）→ env 未設定でも consumer が DB 復号して使用することを確認。
  3. **stub フォールバック:** env も db も未設定 → Stub provider に留まる（取り込みはエラーにならず stub 文字起こし）。
- **期待結果:** 優先順位 env > db > stub が機能し、DB 保管値が平文で漏れない（ciphertext として保存）。
- **確認ポイント:** D1 の `speech_*` カラムに API キー平文が入っていないこと。

## エッジケース・異常系

### 1. 無効な API キー / 存在しない model

- **目的:** Gemini の 4xx を `SpeechFailureError` に正しく mapping する。
- **手順:** 無効キーまたは存在しない model で接続テスト・取り込みを実行。
- **期待結果:** 接続テストは失敗表示。取り込みは `SpeechFailureError` 経由でハンドリングされ、secret がエラーメッセージに漏れない（masking）。

### 2. サイズ超過音声

- **目的:** base64 後の総サイズが Gemini inline 上限（~20MB）を超える音声をプリフライトで弾く。
- **手順:** 大きめの音声（raw 14MiB 超目安）を投入。
- **期待結果:** Gemini へ送る前に `SpeechFailureError` で弾かれる（無駄な大リクエストを投げない）。

## 既存機能への影響確認

- **OpenAI / Deepgram の既存 speech 経路:** registry に gemini を 1 行足すだけで `Record<SpeechProvider, SpeechAdapter>` の網羅が成立する。OpenAI / Deepgram を選択した取り込み・接続テストが従来どおり動くこと（回帰なし）を確認する。
- **既定プロバイダ:** `defaultSpeech()` は openai 据え置きのため、未設定時の既定が変わっていないこと。
- **自動回帰（`pnpm test`）:** adapter 境界（2xx/4xx/5xx/timeout/空音声/HTTP 400/サイズ超過/base64 送信形/`x-goog-api-key`/masking）と registry ディスパッチが OpenAI / Deepgram と対称にカバーされていること。**ただし `pnpm test` は契約準拠のみで実フォーマット受理は確認できない**（AC-1 は確認項目 3 の実ファイル検証で担保）。
