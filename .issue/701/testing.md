# 動作確認計画 — Issue #701: 録音＋文字起こしによるノート化（録音UI / SpeechRecognitionProvider 実装 / 文字起こしプロバイダ設定の別枠化）

**Issue:** #701
**作成日:** 2026-06-14

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### マイグレーション適用

`instance_settings` に `speech_*` カラムを追加する新規マイグレーション（`0017_add_speech_config.sql`）をローカル D1 に適用する。

```bash
pnpm db:apply:local
```

> `pnpm db:migrate` も同一コマンド（`wrangler d1 migrations apply hollow-local-d1 --local`）。どちらでもよい。

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

> 注意（CSRF）: `wrangler.toml` の `APP_URL` は `http://localhost:8787`（wrangler dev 用）で、`pnpm dev`（vite）のポート 3000 と不一致。このままだと保存・接続テスト等の state-changing POST が `csrfMiddleware` の cross-origin 拒否で 403 になる。ブラウザで POST 系を検証するときは `.dev.vars` に `APP_URL=http://localhost:3000` を一時的に設定して `pnpm dev` を再起動する（検証後は元に戻す）。これは vite dev 経路固有のハーネス差で、本 Issue の変更とは無関係。

> 補足: `pnpm start`（wrangler dev）でインライン取り込みを動かす場合は `pnpm build:local && pnpm start` が必須（プレーンな `pnpm build` ではインライン経路が DCE で消える。`docs/runtime_cloudflare.md` 参照）。本 Issue は `pnpm dev` で確認できるため通常は不要。

### 文字起こしプロバイダ（OpenAI）の設定

文字起こし（AC-3 / AC-4）の実音声疎通には有効な OpenAI API キーが要る。設定経路は 2 つあり、AC-1 の検証ではどちらも使う。

- **env 経路**: `.dev.vars` に `ADMIN_SPEECH_API_KEY` / `ADMIN_SPEECH_MODEL`（例 `gpt-4o-transcribe`）/ `ADMIN_SPEECH_PROVIDER`（`openai`）を設定する（`ADMIN_LLM_*` と対称。`baseURL` は持たないため `ADMIN_SPEECH_BASE_URL` は無い）。`.dev.vars` が無ければ `cp .dev.vars.example .dev.vars` で作成。設定後は `pnpm dev` を再起動する。
  - **要確認: `ADMIN_SPEECH_*` の正確なキー名**。plan.md ステップ10 の命名（`ADMIN_SPEECH_API_KEY` / `ADMIN_SPEECH_MODEL` / `ADMIN_SPEECH_PROVIDER`）を実装の `serverCloudflare.ts`（`ServerEnv` 型・`readRequestServerConfig`）と `.dev.vars.example` の追記に照合してから設定すること。
- **db 経路**: env を未設定にし、`/admin/speech` 画面でプロバイダ・モデル・API キーを入力して保存する。保存値は `SecretBox` で暗号化されて DB に入る。db 経路を動かすには `.dev.vars` の `SECRET_BOX_MASTER_KEY`（`.dev.vars.example` に有効な placeholder 同梱）が必要。

> 録音 UI（AC-4）の検証はブラウザのマイク権限が要る。`http://localhost:3000` は `localhost` のため `getUserMedia` が許可される（secure context 扱い）。ヘッドレスのブラウザ自動化では fake mic デバイス（例: Chromium の `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`）を使う。

### デプロイ方法

本 Issue の動作確認は検証環境（ローカル `pnpm dev`）で完結する。ステージング反映が必要な場合のみ:

```bash
pnpm db:apply:staging     # 0017 マイグレーションをステージング D1 に適用
pnpm deploy:staging:dry   # wrangler.toml の ADMIN_SPEECH_* 追記の syntax を先に dry-run 確認
pnpm deploy:staging:all   # web / relay / consumer / indexer / pruner / dlq を一括デプロイ
```

> ステージングは実 Queue 経由で consumer が取り込みを処理するため、`ADMIN_SPEECH_API_KEY` 等の secret を web と consumer の両 Worker に投入する必要がある（`docs/runtime_cloudflare.md` の secret 一覧に準拠）。

---

## 確認項目

### 1. `/admin/speech` でプロバイダ・API キーを設定でき、接続テストが成功する（AC-1）

- **対応する受け入れ基準:** AC-1
- **目的:** 文字起こしプロバイダ設定画面が LLM 設定と別枠で存在し、保存と probe ベースの接続テストが動くこと。
- **手順:**
  1. `pnpm seed:dev-admin` 済みのセッションでログインし、`/admin` を開く。
  2. 左ナビに「文字起こし設定」（`/admin/speech`）の項目が表示されていることを確認し、開く。
  3. プロバイダ（openai）・モデル（`gpt-4o-transcribe`）・有効な OpenAI API キーを入力する。
  4. 「接続テスト」ボタンを押す。
  5. 成功表示を確認したら「保存」を押す。
- **期待結果:**
  - ナビと画面が LLM 設定（`/admin/llm`）とは独立して存在する。
  - 接続テストが「成功」を返す（`GET /models` 系の probe で 2xx。実音声 transcribe は送られない＝ADR-006 の合格境界）。
  - 保存後、DB の `instance_settings` に `speech_provider='openai'` / `speech_model='gpt-4o-transcribe'` / `speech_api_key_source='db'` / `speech_api_key_ciphertext`（非 NULL の暗号文）が入る。
- **確認ポイント:** 接続テストが transcribe（実音声）ではなく軽量 probe であること（無音/空音声を送らずモデル存在・認証だけ確認）。

### 2. 無効な API キーで接続テストが失敗する（AC-1）

- **対応する受け入れ基準:** AC-1
- **目的:** probe が認証失敗を検出し、UI に失敗が表示されること。
- **手順:**
  1. `/admin/speech` で API キーに無効な値（例 `sk-invalid`）を入力する。
  2. 「接続テスト」ボタンを押す。
- **期待結果:** 「接続失敗」が表示され、401/403 等のプロバイダ由来の理由が出る（throw ではなく `{ ok: false }` 相当が UI に反映される）。

### 3. env > db フォールバックと SecretBox 暗号化保管（AC-1）

- **対応する受け入れ基準:** AC-1
- **目的:** env が設定されているときは env が優先され、DB 値は silent に保持されること。SecretBox 暗号化保管が往復すること。
- **手順:**
  1. **db 経路:** env（`ADMIN_SPEECH_*`）を未設定にして `/admin/speech` で API キーを保存する。
  2. DB 行の `speech_api_key_ciphertext` が平文ではなく暗号文であることを確認する（`pnpm db:execute:local` で `SELECT speech_api_key_source, speech_api_key_ciphertext FROM instance_settings;` を流す等）。
  3. `pnpm dev` を再起動し、取り込み（確認項目5）が db 経路の鍵で成功することを確認する。
  4. **env 経路への切替:** `.dev.vars` に `ADMIN_SPEECH_API_KEY` 等を設定して `pnpm dev` を再起動し、`/admin/speech` を開く。
- **期待結果:**
  - env 設定時、`/admin/speech` の該当フィールドが「環境変数で固定中」相当の表示になり、保存しても DB の暗号文値は silent に保持される（env > db。`ADMIN_LLM_*` の挙動と対称）。
  - db 経路では `SecretBox.decrypt` 経由で復号され取り込みが成功する。
- **確認ポイント:** API キーマスク表示（保存済み db キーがマスクされる／env 固定時はマスク非表示）が LLM 設定と対称に動くこと。

### 4. 音声ファイルアップロード → 文字起こし → 構造化 → プレビュー → ノート保存（AC-3）

- **対応する受け入れ基準:** AC-3
- **目的:** ファイルアップロード導線が `audio/*` を受理し、文字起こし → LLM 構造化 → プレビュー → commit まで通ること（transcribe の実音声疎通をここで担保）。
- **前提:** 確認項目1 または 3 で OpenAI 文字起こし設定が有効になっていること。LLM 構造化のため `/admin/llm` 側も有効な LLM プロバイダが設定されていること（既存挙動）。
- **手順:**
  1. 取り込み画面の DropZone / ファイル選択で、日本語の発話が入った音声ファイル（例: `.webm` / `.m4a` / `.mp3`、25MB 未満）を選ぶ。
  2. DropZone が音声ファイルを受理する（拒否されない）ことを確認する。
  3. アップロード後、文字起こし → 構造化 HTML 生成 → プレビュー到達を待つ。
  4. プレビュー内容を確認し「確定（commit）」する。
  5. 作成されたノートの詳細画面を開く。
- **期待結果:**
  - 音声ファイルが受理され、ジョブが `previewing` に到達する。
  - プレビューに文字起こし内容が構造化された HTML で表示される。
  - commit でノートが作成され、本文に文字起こし由来の内容が入る。
- **確認ポイント:** DropZone の `accept` 属性が `audio/*`（webm/m4a/mp3/wav/flac/ogg）を受理すること（plan.md ステップ15 の確認タスク。受理されない場合は実装漏れ）。

### 5. ブラウザでマイク録音 → 取り込み → ノート化（AC-4）

- **対応する受け入れ基準:** AC-4
- **目的:** `MediaRecorder` 録音 → そのまま既存 upload 経路に合流 → ノート化できること。録音状態 UI が機能すること。
- **前提:** 文字起こし設定が有効。ブラウザのマイク権限を許可できる環境。
- **手順:**
  1. 取り込み画面の録音 UI を開き、録音開始する。
  2. マイク権限ダイアログを許可する。
  3. 数秒間、日本語で発話して録音する。録音中の状態表示（経過時間など）を確認する。
  4. 録音停止 → プレビュー（録音内容の再生確認）を確認する。
  5. 取り込みを実行し、プレビュー → commit → ノート詳細まで進む。
- **期待結果:**
  - 録音中に「録音中」状態と経過時間が表示される。
  - 停止後、取り消し・再録音・取り込み実行の操作が選べる。
  - 取り込み実行で既存の upload→ingest→commit フローに乗り、ノートが作成される。
- **確認ポイント:** 録音 Blob（`audio/webm` 等）が File 化されて既存 `uploadFileFn`（multipart）に流れること（録音専用バックエンド経路を作らない＝ADR-007）。

### 6. 録音中状態・取り消し・再録音（AC-4）

- **対応する受け入れ基準:** AC-4
- **目的:** 録音の状態機械（idle / requesting / recording / stopped / permission-denied）が UI で操作できること。
- **手順:**
  1. 録音を開始 → 停止し、「取り消し」を押して録音を破棄する。
  2. 再度録音を開始し（再録音）、停止 → 取り込みできることを確認する。
- **期待結果:** 取り消しで録音データが破棄され idle に戻る。再録音で新しい録音を録り直せる。

### 7. マイク権限拒否時のフォールバック（AC-4）

- **対応する受け入れ基準:** AC-4
- **目的:** マイク権限を拒否したとき、エラーで止まらずファイルアップロードへ誘導されること。
- **手順:**
  1. 録音 UI を開き、ブラウザのマイク権限ダイアログで「拒否」を選ぶ（または OS/ブラウザ設定で当該オリジンのマイクをブロック）。
- **期待結果:** 権限拒否のフォールバック文言が表示され、ファイルアップロード導線（確認項目4）への誘導がある。未捕捉例外でクラッシュしない。

### 8. 取り込んだ音声が MediaAsset(kind='source') として保存され、元ファイルから閲覧/DL できる（AC-5）

- **対応する受け入れ基準:** AC-5
- **目的:** 録音・ファイル双方の音声が永続保存され、ノート詳細「元ファイル」から閲覧/ダウンロードできること。録音由来 Blob のメタデータ欠落が無いこと。
- **手順:**
  1. 確認項目4（ファイル）と確認項目5（録音）で作成した各ノートの詳細画面を開く。
  2. 「元ファイル」セクションの「閲覧」リンクをクリック（新規タブで音声がブラウザ内で再生/表示）。
  3. 「ダウンロード」リンク（`/media/<id>?download=1`）をクリックし、元のファイル名で保存されることを確認する。
- **期待結果:**
  - 両方のノートで「元ファイル」セクションが表示される。
  - 閲覧で音声が inline 再生、ダウンロードで attachment として保存される。
  - **録音由来 Blob（File 化）でも `mimeType`（`audio/webm` 等）と `filename`（拡張子付き）が欠落しない**（ダウンロード時のファイル名・拡張子、閲覧時の MIME が正しい）。
- **確認ポイント:** 録音経路のファイル名が空や拡張子なしにならないこと（File 化時の name/type 付与が効いていること。AC-5 回帰）。

## エッジケース・異常系

### 1. 文字起こし失敗（SpeechFailureError）時に縮退プレビューで保存でき、本文追記 → commit できる（AC-6）

- **対応する受け入れ基準:** AC-6
- **目的:** 設定済みプロバイダで文字起こしに失敗した音声を取り込むと、LLM 構造化をスキップした縮退プレビュー（失敗注記入り・空相当本文）が `previewing` に到達し、利用者が本文を追記して commit できること。
- **前提:** 文字起こしプロバイダが設定済み（=未設定 Stub ではない）。
- **手順:**
  1. 文字起こしが失敗する音声（例: 無音、または極端に短い/壊れた音声ファイル）を取り込む。
     - **要確認: 確実に `SpeechFailureError` を誘発する手順**。無音で空文字（=同じ縮退分岐）になる場合と、実プロバイダ側でエラーになる場合がある。実機では破損音声 / 0 バイト相当 / 25MB 超 で `SpeechFailureError` を誘発する組合せを探す。再現が難しければ、開発確認用に OpenAI アダプタの transcribe を一時的に throw させて代替する。
  2. プレビュー画面を確認する。
  3. プレビューの本文（注記の下）に手動でテキストを追記する。
  4. commit する。
- **期待結果:**
  - ジョブが `markFailed` されず `previewing` に到達する。
  - プレビュー本文の先頭に文字起こし失敗の注記（`class="ingestion-failure-note"` を持つ段落、文言「文字起こしに失敗しました。録音は保存されています。…」）が表示される。
  - 本文を追記して commit でき、ノートが作成される。
  - 録音/音声元ファイルは `MediaAsset(kind='source')` として保持される（確認項目8 と同様に「元ファイル」から閲覧/DL できる）。
- **確認ポイント:** 縮退時に LLM 構造化（structureToHtml / suggestMetadata）が呼ばれていないこと（無駄な課金が無いこと。ログ/プレビューが LLM 整形ではなく固定注記＋空本文であることで間接確認）。

### 2. Speech 未設定（Stub フォールバック）時は従来どおり取り込みが失敗する（AC-6 の境界）

- **対応する受け入れ基準:** AC-6（縮退対象スコープの境界）
- **目的:** プロバイダ未設定時は縮退で隠さず、従来どおり失敗（`markFailed`）すること。「未設定＝機能未提供で fail」が意図的挙動であることの確認。
- **手順:**
  1. env（`ADMIN_SPEECH_*`）を未設定にし、`/admin/speech` でも保存していない（=`StubSpeechRecognitionProvider` がフォールバックされる）状態にする。
  2. 音声ファイルを取り込む。
- **期待結果:**
  - ジョブが `previewing` に到達せず失敗（`markFailed`）になる。Stub の `BusinessRuleError('unsupported_format')` 由来で失敗が記録される。
  - 縮退プレビュー（注記入り空本文）は生成されない。
- **確認ポイント:** 縮退対象が実プロバイダの `SpeechFailureError` のみで、Stub の `unsupported_format` は対象外であること（ADR-005 / plan.md Round 2 arch P-001）。

### 3. 25MB / 録音長の上限

- **対応する受け入れ基準:** AC-4 の運用境界
- **目的:** 長時間録音・大きい音声ファイルが上限（OpenAI 25MB / `uploadFile` の `maxIngestionBytes` 既定 32MiB）に抵触したときの挙動。
- **手順:**
  1. 録音 UI で上限近くまで録音する、または 25MB を超える音声ファイルをアップロードする。
- **期待結果:** 録音 UI 側で時間/サイズの上限・警告が出る、または上限超過が `SpeechFailureError`（25MB 超は事前検出）/ アップロード上限エラーとして明示される。空ノートが無言で量産されない。
  - **要確認: 録音 UI の上限値・警告の実装有無と具体値**（plan.md リスク節で上限導入が必要とされている。実装された閾値を確認すること）。

## 既存機能への影響確認

- **既存のテキスト/Markdown/画像/PDF 取り込み:** speech 設定追加・`runIngestionJob` の audio 縮退分岐追加後も、テキスト・Markdown・画像（OCR）・PDF の取り込み → プレビュー → commit が従来どおり動くこと。特に audio 以外の `else` 経路（LLM 構造化）が縮退分岐の追加で壊れていないこと。
- **`/admin/llm`（LLM 設定）:** Speech 設定の追加で LLM 設定画面・接続テスト・保存が壊れていないこと（DTO / view の `maskApiKey` 汎用化、`InstanceSettings` への `speech` 追加が既存 LLM 経路に回帰を起こさないこと）。
- **`instance_settings` の後方互換:** マイグレーション適用前から存在する singleton 行（`speech_*` が DEFAULT / NULL）でも、`/admin/speech` と取り込みが `defaultSpeech()` 縮退で正常に動くこと（既存行で rehydrate がエラーにならない）。
- **元ファイル機能（#452）への影響:** 音声以外（PDF / 画像）の元ファイル閲覧/DL が従来どおり動くこと。
- **管理画面ナビ:** 「文字起こし設定」追加で他の admin ナビ項目・画面が壊れていないこと（RSC side-effect import 追加漏れで server fn が manifest 未登録にならないこと）。
