# 動作確認計画 — Issue #738: 追加の文字起こしプロバイダを registry に対応（Deepgram Nova-3）

**Issue:** #738
**作成日:** 2026-06-21

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。本 Issue は **DB スキーマ変更なし**（`speech_*` カラムは #701 で追加済み・`speech_provider` は任意文字列カラム）のため新規マイグレーションは不要。

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

### 文字起こしプロバイダ（Deepgram）の設定

Deepgram の実音声疎通・接続テストには有効な Deepgram API キー（`Token <key>` 形式）が要る。設定経路は env / db の 2 つ。

- **env 経路**: `.dev.vars` に `ADMIN_SPEECH_PROVIDER=deepgram` / `ADMIN_SPEECH_MODEL=nova-3` / `ADMIN_SPEECH_API_KEY=<Deepgram key>` を設定する（`baseURL` は持たないため `ADMIN_SPEECH_BASE_URL` は無い）。`.dev.vars` が無ければ `cp .dev.vars.example .dev.vars` で作成。設定後は `pnpm dev` を再起動する。
  - DI の wire 条件（`docs/runtime_cloudflare.md`）: 実 speech provider は `ADMIN_SPEECH_API_KEY` **と** `ADMIN_SPEECH_MODEL`（`[vars]` の public エントリ）が**両方**揃ったときのみ wire される。どちらか欠けると Stub に留まる。
- **db 経路**: env を未設定にし、`/admin/speech` 画面でプロバイダ（Deepgram）・モデル（`nova-3`）・API キーを入力して保存する。保存値は `SecretBox` で暗号化されて DB に入る。db 経路を動かすには `.dev.vars` の `SECRET_BOX_MASTER_KEY`（`.dev.vars.example` に有効な placeholder 同梱）が必要。

> **接続テストの制約（plan.md [arch P-003]）**: `/admin/speech` の「接続テスト」は draft test で `apiKeySource:"env"` 固定のため、**フォーム入力中の plain API キーを使えない**。新規 Deepgram キーの事前テストは `.dev.vars` の `ADMIN_SPEECH_API_KEY` に置く（env 経路）か、一旦保存して DB ciphertext にしてから行う。これは #701 由来の既存制約で本 Issue でスコープ拡大しない。

> 録音 UI の検証はブラウザのマイク権限が要る。`http://localhost:3000` は `localhost` のため `getUserMedia` が許可される（secure context 扱い）。ヘッドレスのブラウザ自動化では fake mic デバイス（例: Chromium の `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`）を使う。

### デプロイ方法

本 Issue の動作確認は検証環境（ローカル `pnpm dev`）で完結する。ステージング反映が必要な場合のみ（DB マイグレーションは無いので適用不要）:

```bash
pnpm deploy:staging:dry   # wrangler 設定の syntax を先に dry-run 確認
pnpm deploy:staging:all   # web / relay / consumer / indexer / pruner / dlq を一括デプロイ
```

> ステージングは実 Queue 経由で consumer が取り込みを処理するため、`ADMIN_SPEECH_API_KEY` 等の secret を web と consumer の両 Worker に投入する必要がある（`docs/runtime_cloudflare.md` の secret 一覧に準拠）。`ADMIN_SPEECH_PROVIDER` / `ADMIN_SPEECH_MODEL` は `[vars]`（public）側。

---

## 確認項目

### 1. `/admin/speech` の provider select に Deepgram が出る（AC-3）

- **対応する受け入れ基準:** AC-3
- **目的:** registry / transport list の差分追加で provider select に Deepgram が自動的に増えていること。
- **手順:**
  1. `pnpm seed:dev-admin` 済みのセッションでログインし、`/admin/speech` を開く。
  2. プロバイダ select を開く。
- **期待結果:** select に「OpenAI」と「Deepgram」の 2 択が表示される（ラベルは `PROVIDER_LABEL` 由来）。
- **確認ポイント:** Deepgram のラベルが `PROVIDER_LABEL` で型網羅され、未定義のままビルドが通っていないこと（ラベル欠けは型エラーになる設計）。

### 2. provider を Deepgram に切り替えると model 欄が既定 model（nova-3）にリセットされる（AC-4）

- **対応する受け入れ基準:** AC-4
- **目的:** 本 Issue で新規導入する「provider 切替時の model 自動リセット」挙動が動くこと（OpenAI の model 持ち越しによる接続テスト失敗の事前回避）。
- **手順:**
  1. `/admin/speech` で provider を OpenAI にした状態で model 欄に `gpt-4o-transcribe` が入っていることを確認する。
  2. provider select を Deepgram に切り替える。
  3. model 欄と placeholder / ヒント文言を確認する。
- **期待結果:**
  - provider を Deepgram に切り替えた瞬間、model 欄が `nova-3`（Deepgram の既定 model）にリセットされる。
  - API キー placeholder・model ヒント文言（「例: nova-3」）が Deepgram 向けに切り替わる。
  - 逆に Deepgram → OpenAI に戻すと model が `gpt-4o-transcribe` にリセットされる。
- **確認ポイント:** OpenAI の model が Deepgram に持ち越されない（持ち越すと AC-5 / 実 transcribe が落ちる）。

### 3. env で model がロックされている場合は provider 切替で model がリセットされない（AC-4）

- **対応する受け入れ基準:** AC-4（env ロックとの衝突回避 / plan.md [arch P-002]）
- **目的:** `envOverrides.model` が効いているとき、provider 切替の自動リセットが env 固定値を上書きしないこと。
- **手順:**
  1. `.dev.vars` に `ADMIN_SPEECH_MODEL=nova-3`（および `ADMIN_SPEECH_API_KEY` / `ADMIN_SPEECH_PROVIDER`）を設定して `pnpm dev` を再起動する。
  2. `/admin/speech` を開く。model 欄が env 固定（編集不可・`disabled`）表示になっていることを確認する。
  3. provider select を操作できる場合（`ADMIN_SPEECH_PROVIDER` が未設定で provider select が有効なケース）に provider を切り替える。
- **期待結果:** model が env 固定値のままで、provider 切替によって勝手に書き換わらない（リセット抑制）。
- **確認ポイント:** `ADMIN_SPEECH_PROVIDER` も env 設定済みなら provider select 自体が `disabled` になり、このパスは通らない。env で model だけロックされ provider はロックされていないケースで抑制が効くことを見る。

### 4. Deepgram で接続テストが成功する（AC-5）

- **対応する受け入れ基準:** AC-5
- **目的:** `ADMIN_SPEECH_PROVIDER=deepgram` で DI が Deepgram adapter を選び、認証確認 probe が 2xx を返して接続テストが成功すること。
- **前提:** 有効な Deepgram API キーを env（`ADMIN_SPEECH_API_KEY`）に設定済み（接続テストの env キー固定制約のため）。
- **手順:**
  1. `.dev.vars` に Deepgram の有効なキー・`ADMIN_SPEECH_MODEL=nova-3` を設定し `pnpm dev` を再起動する。
  2. `/admin/speech` で provider を Deepgram にして「接続テスト」を押す。
- **期待結果:** 「接続成功」が表示される（Deepgram の認証確認エンドポイントが 2xx。実音声 transcribe は送られない＝probe 契約）。
- **確認ポイント:** probe は `cfg.model` を URL に使わない（Deepgram には `GET /models/{model}` 相当が無い）。ただし空 model のときは OpenAI との UX 対称性のため `ok:false` を返す（plan.md ステップ6 [S-002]）。

### 5. Deepgram で 音声 → 文字起こし → 構造化 → プレビュー → ノート保存が通る（AC-6）

- **対応する受け入れ基準:** AC-6
- **目的:** 選択した Deepgram プロバイダで取り込みパイプライン全体（transcribe → LLM 構造化 → プレビュー → commit）が通ること。raw-body POST `/v1/listen` の実疎通をここで担保する。
- **前提:** 確認項目4 で Deepgram 文字起こし設定が有効。LLM 構造化のため `/admin/llm` 側も有効な LLM プロバイダが設定されていること（既存挙動）。
- **手順:**
  1. 取り込み画面の DropZone / ファイル選択で、日本語の発話が入った音声ファイル（例: `.webm` / `.m4a` / `.mp3`）を選ぶ。
  2. アップロード後、文字起こし → 構造化 HTML 生成 → プレビュー到達を待つ。
  3. プレビュー内容を確認し「確定（commit）」する。
  4. 作成されたノートの詳細画面を開く。
- **期待結果:**
  - 音声ファイルが受理され、ジョブが `previewing` に到達する。
  - プレビューに Deepgram の文字起こし内容が構造化された HTML で表示される。
  - commit でノートが作成され、本文に文字起こし由来の内容が入る。
- **確認ポイント:** Deepgram raw-body fetch（ArrayBuffer 直送）が workerd（`pnpm dev` の Cloudflare runtime）で動くこと（plan.md リスク・ADR-001 PoC 項目）。webm/opus の `Content-Type` で 2xx が返ること。

## エッジケース・異常系

### 1. Deepgram の認証失敗で接続テストが失敗する（AC-5）

- **対応する受け入れ基準:** AC-5
- **目的:** probe が認証失敗（401/403）を検出し、UI に失敗が表示されること（throw ではなく `{ ok: false }` 相当）。
- **手順:**
  1. `.dev.vars` の `ADMIN_SPEECH_API_KEY` に無効な Deepgram キー（例 `Token invalid` 相当の不正値）を設定し `pnpm dev` を再起動する。
  2. `/admin/speech` で provider を Deepgram にして「接続テスト」を押す。
- **期待結果:** 「接続失敗」が表示され、認証由来の理由が出る。未捕捉例外でクラッシュしない。

### 2. Deepgram transcribe 失敗（SpeechFailureError）時の縮退プレビュー（AC-6 の境界・既存挙動の回帰）

- **対応する受け入れ基準:** AC-6（既存縮退分岐の Deepgram での回帰）
- **目的:** Deepgram で文字起こしに失敗した音声を取り込んだとき、#701 で導入した縮退プレビュー（失敗注記入り）が `previewing` に到達し commit できること。Deepgram adapter が `SpeechFailureError` のみ throw する port 契約を守っていること。
- **手順:**
  1. 文字起こしが失敗する音声（例: 0 バイト相当 / 破損音声 / 極端に短い音声）を Deepgram 設定で取り込む。
  2. プレビュー画面を確認し、本文に手動でテキストを追記して commit する。
- **期待結果:**
  - ジョブが `markFailed` されず `previewing` に到達し、文字起こし失敗の注記（`class="ingestion-failure-note"`）が表示される。
  - 本文を追記して commit でき、ノートが作成される。
  - Deepgram の非 2xx / JSON 不正 / timeout がいずれも `SpeechFailureError` に集約され、provider native error が漏れないこと。

## 既存機能への影響確認

- **OpenAI 文字起こし:** Deepgram 追加後も provider=OpenAI での接続テスト・保存・取り込みが従来どおり動くこと（registry 差分追加が OpenAI 経路に回帰を起こさない）。
- **provider 未設定（Stub フォールバック）:** env / db いずれも未設定なら従来どおり `StubSpeechRecognitionProvider` がフォールバックされ、取り込みが `unsupported_format` で失敗すること（Deepgram 追加が Stub フォールバックを壊さない）。
- **env > db > stub フォールバック・SecretBox 暗号化:** Deepgram でも env 優先 → DB ciphertext（SecretBox 復号）→ Stub の順で解決されること（構成解決は provider 非依存。自動テストで CI 担保される範囲は手動確認不要だが、実 transcribe 疎通を db 経路でも 1 度確認する）。
- **`/admin/speech` の保存後 DB 値:** Deepgram 保存後、`instance_settings` に `speech_provider='deepgram'` / `speech_model='nova-3'` / `speech_api_key_source='db'` / `speech_api_key_ciphertext`（非 NULL 暗号文）が入ること（`pnpm db:execute:local` で `SELECT speech_provider, speech_model, speech_api_key_source FROM instance_settings;`）。
- **既存テスト維持:** `pnpm typecheck`・`pnpm lint`・`pnpm test:unit`・`pnpm test:integration` が緑であること。特に `errorCodeNaming.test.ts` / `schema.test.ts` / 既存 OpenAI adapter テスト。
