# 動作確認計画 — Issue #788: Cloudflare Workers AI ルート（env.AI binding）の文字起こしを speech registry に追加

**Issue:** #788
**作成日:** 2026-07-01

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。本 Issue は **DB スキーマ変更なし**（`speech_provider` は任意文字列カラム、値が `deepgram-workers-ai` に増えるだけ・ADR-001）のため新規マイグレーションは不要。

### 実 `env.AI` binding はローカル dev から到達できない（本 Issue 最重要の制約・ADR-006）

Workers AI はローカルモックを持たず、`wrangler dev` / `pnpm dev` の AI binding も **実 Cloudflare アカウント認証で remote を叩く**。よって「ローカルで `@cf/deepgram/nova-3` の実文字起こしを確認する」手順は書けない。確認は次の 2 段に分ける。

- **マージ前にローカルで確認できること:** 型（`pnpm typecheck` = 静的契約検証）、ユニットテスト（`pnpm test:unit` = binding フェイクで adapter 境界・6 ゲートの keyless 分岐・registry ディスパッチ）、`/admin/speech` で `deepgram-workers-ai` を選択・保存・接続テストが**サーバ側ゲートで弾かれず ping 経路まで到達**すること、既存 openai/deepgram/gemini 経路の非回帰。
- **staging で確定させること（マージ後）:** 実録音 webm/opus の受理（2xx + 非空 transcript）、`deepgram-workers-ai` 選択での audio → 文字起こし → ノート保存の E2E フルパス、接続テストが実 binding 存在下で `ok:true` を返すこと。

> **偽陽性の罠（#766 と同型・重要）:** `runIngestionJob` は `SpeechFailureError` を握り潰し**空 transcript で「成功」扱い**し、拒否されてもノートが保存され得る。受理判定に「ノート保存が成功した」ことを**使ってはならない**。判定は adapter / ネットワーク層で **2xx + 非空 transcript** が返ることを直接見る（下記 staging 項目）。

### 確認用管理者ユーザーの投入

`/admin/speech` および取り込み画面はログインが必要。決め打ちの admin ユーザー＋セッションをローカル D1 に投入する。

```bash
pnpm seed:dev-admin
```

> 出力されるセッショントークン（`dev-admin-session-token`）を `__Host-session` クッキーに注入してログイン状態にする。ブラウザ自動化では出力末尾の `agent-browser cookies set` の手順に従う。

### 検証環境の起動（ローカル）

`pnpm dev`（vite dev）は `import.meta.env.DEV === true` のため取り込みディスパッチがリクエストと同一 isolate でインライン実行され（`InlineRelayTrigger`, `docs/runtime_cloudflare.md`「Local dev outbox dispatch」）、追加設定なしでフォーム操作までが通る。

```bash
pnpm dev
```

> 開発サーバー（Cloudflare runtime, `vite dev --config vite.config.cloudflare.ts`）が `http://localhost:3000` で起動する。

> 注意（CSRF）: `wrangler.toml` の `APP_URL` は `http://localhost:8787`（wrangler dev 用）で、`pnpm dev`（vite）のポート 3000 と不一致。このままだと保存・接続テスト等の state-changing POST が `csrfMiddleware` の cross-origin 拒否で 403 になる。ブラウザで POST 系（保存・接続テスト）を検証するときは `.dev.vars` に `APP_URL=http://localhost:3000` を一時的に設定して `pnpm dev` を再起動する（検証後は元に戻す）。これは vite dev 経路固有のハーネス差で、本 Issue の変更とは無関係。

> **要確認:** ローカル `pnpm dev`（vite cloudflare plugin）に `[ai] binding = "AI"` を足したとき AI binding が proxy 注入されるかは実アカウント認証依存で、docs に記載が無い。ローカルで接続テストが実際に `ok:true` を返せるかは保証できない（→ 実疎通は staging で確定）。ローカルでは「keyless ゲートを抜けて ping 経路まで到達し、サーバ側で 403/ゲートエラーにならない」ことまでを確認対象とする。

### 静的チェック / 自動テスト（ローカル・マージ前提）

```bash
pnpm typecheck        # 静的契約検証（Ai_Cf_Deepgram_Nova_3_Input/Output への型適合・ADR-006 PoC 前半）
pnpm test:unit        # binding フェイクの adapter 境界・6 ゲートの keyless 分岐・registry ディスパッチ
pnpm test             # test:unit + test:integration
pnpm lint:fix && pnpm format
```

### デプロイ方法（staging・実 binding 検証）

実 `env.AI` 疎通は staging で確定させる（AC-2 / AC-4 / AC-3 実疎通）。**consumer が実文字起こしを実行する**ため consumer を含む一括デプロイが必須。

```bash
pnpm deploy:staging:dry           # wrangler 設定の syntax を先に dry-run 確認
pnpm deploy:staging:all           # web / relay / consumer / indexer / pruner / dlq を一括デプロイ
# consumer だけ入れ直す場合:
pnpm deploy:staging:consumer
```

> staging では `wrangler.staging.toml` の web worker と `[env.consumer]` の両方に `[ai] binding = "AI"` が入っていること（plan ステップ 12）、および `[vars]` の `ADMIN_SPEECH_PROVIDER = "deepgram-workers-ai"` / `ADMIN_SPEECH_MODEL = "@cf/deepgram/nova-3"` を設定していることが前提。workers-ai は鍵不要のため `ADMIN_SPEECH_API_KEY` secret は不要。

---

## 確認項目（ローカルで確認可能・マージ前）

### 1. 静的契約検証が通る（AC-2 前半）

- **対応する受け入れ基準:** AC-2（PoC 前半 / ADR-006）
- **目的:** `env.AI.run("@cf/deepgram/nova-3", ...)` の呼び出しと出力抽出（`results.channels[0].alternatives[0].transcript`）が `@cloudflare/workers-types` の `Ai_Cf_Deepgram_Nova_3_Input/Output` に型適合していること。
- **手順:** `pnpm typecheck` を実行する。
- **期待結果:** 型エラーなく完了する。レスポンス shape 互換が型で静的に確定する（実 binding が無くても確認できる部分）。

### 2. ユニットテストが 6 ゲートの keyless 分岐と adapter 境界を固定している（AC-6）

- **対応する受け入れ基準:** AC-6
- **目的:** binding フェイク（`Ai.run` を差し替えたスタブ）で adapter 境界と 6 つの apiKey ゲート（domain service `assertSpeechEnvOverride` 1 + application 5: usecase 2 + DI 2 + tester 1）の keyless 分岐が回帰固定されていること。fetch モックではなく binding フェイクを使う点が REST provider テストとの構造差。
- **手順:** `pnpm test:unit` を実行する。
- **期待結果:** 以下が緑であること。
  - adapter 単体: 正常（transcript `.trim()` 返却）/ **空の音声入力（空 bytes）** と **空 transcript 出力（`""`）を別ケース** / `run` reject → `SpeechFailureError` / timeout（`Promise.race` タイマー経路）/ **binding 未注入 → `SpeechFailureError`**。
  - ping 単体: binding 注入で `ok:true` / 未注入で `ok:false` / `HttpSpeechConnectionTester.ping` が **apiKey 空 + keyless + binding 有りで `ok:true`**（empty-key 短絡の回帰固定）。
  - domain service / usecase ゲート: `updateSpeechConfig` が openai→deepgram-workers-ai 切替を鍵なしで保存成功し `apiKeySource:'env'`/ciphertext null に正規化・**`assertSpeechEnvOverride` が keyless 切替を env キー無しで通し `SpeechEnvOverrideMissingKey` で落ちない**・keyless で apiKey を誤入力しても保存値に鍵が残らず silently drop・`testSpeechConnection` が鍵なしでも tester へ到達。
  - DI 配線: `buildSpeechRecognitionProvider` が keyless を apiKey 無し + binding 有りで非 Stub / binding 無しで Stub、`resolveConsumerSpeechConfig` が keyless を apiKey 無しで解決（3 項 early-return の keyless 分岐）。
  - registry ディスパッチ: 実 registry で `deepgram-workers-ai` が登録され `lookupSpeechAdapter` で解決される。二重リスト不変条件（`valueObject.test.ts` の providers + keyless 述語 / `schema.test.ts` の `SPEECH_PROVIDERS_TRANSPORT`）に新値が反映。

### 3. `/admin/speech` で `deepgram-workers-ai` を選択・保存できる（AC-3 / AC-5）

- **対応する受け入れ基準:** AC-3（選択・保存）/ AC-5（keyless は `apiKeySource:'env'` 相当・鍵行なし）
- **目的:** domain union / transport list / UI ラベルが揃い、選択でき、サーバ側 6 ゲートの keyless 分岐が保存を通すこと（UI の `apiKeyRequired` 抑制だけでは通らない箇所）。
- **手順:**
  1. `pnpm seed:dev-admin` で admin 投入、`pnpm dev` 起動、ログイン。POST 検証のため `.dev.vars` の `APP_URL=http://localhost:3000` を設定して再起動。
  2. `/admin/speech` を開き、プロバイダ select に **Deepgram (Workers AI)** が出ることを確認して選択する。
  3. 既定モデルが `@cf/deepgram/nova-3` に自動セットされ、API キー欄が「不要（Cloudflare が管理）」表示に分岐すること、provider 説明文に「Workers AI 版は Cloudflare アカウント認証・鍵不要」が出ることを確認する。
  4. 保存する。
- **期待結果:** バリデーションエラー・サーバ側ゲートエラー（`SpeechProviderChangedRequiresApiKey` / `SpeechEnvOverrideMissingKey`）なく保存され、再読み込み後も `deepgram-workers-ai` / `@cf/deepgram/nova-3` が保持される。
- **確認ポイント:** 既定 `openai` からの切替（`providerChanged=true` かつ鍵なし）で保存が失敗しないこと。保存後 D1 の値を `pnpm db:execute:local`（SELECT を書いた `.sql` ファイルを引数に）で確認し、`speech_provider='deepgram-workers-ai'` / `speech_model='@cf/deepgram/nova-3'` / `speech_api_key_source='env'` / `speech_api_key_ciphertext` が NULL（旧 provider の ciphertext を引き継いでいない）であること。

### 4. `/admin/speech` の接続テストが keyless ゲートを抜けて ping 経路へ到達する（AC-3）

- **対応する受け入れ基準:** AC-3（接続テスト・ローカルはゲート通過まで / 実疎通は staging）
- **目的:** workers-ai は鍵を持たず `resolvedKey` が常に空になるが、`testSpeechConnection` / `HttpSpeechConnectionTester.ping` の keyless 分岐で「No api key available」「API key is empty」の早期リターンに落ちず `adapter.ping` へ dispatch されること。
- **手順:**
  1. 確認項目 3 の状態（`deepgram-workers-ai` 保存済み）で `/admin/speech` の「接続テスト」を押す。
- **期待結果:** 「鍵が無い」を理由にした即時失敗（サーバ側ゲート短絡）が**起きない**こと。ping 経路まで到達する。
- **確認ポイント:** ADR-005 の ping は binding 存在確認。実 binding で `ok:true` を返すことは **staging で確定**（上記「要確認」の通りローカルの binding 注入は保証外）。ここでは keyless 分岐でゲートを抜けることまでを見る。

## 確認項目（staging で確定・マージ後）

### 5. 実録音 webm/opus が 2xx + 非空 transcript で受理される（AC-2・マージ後の非交渉条件）

- **対応する受け入れ基準:** AC-2（PoC 後半 / ADR-006）
- **目的:** 録音 UI 既定の **webm/opus** を `@cf/deepgram/nova-3` が受理し、文字起こし文字列が返ることを **adapter / ネットワーク層で直接**確認する。
- **手順:**
  1. `pnpm deploy:staging:all` で staging を更新（`[ai] binding` と `ADMIN_SPEECH_PROVIDER=deepgram-workers-ai` 設定済み前提）。
  2. staging の録音 UI で数秒の日本語発話を 1 本録音し webm/opus を投入する。
  3. adapter / consumer ログまたはネットワークで、Workers AI 経由の結果が **2xx + 非空 transcript** であることを直接確認する（「ノート保存成功」では判定しない）。
- **期待結果:** webm/opus が 2xx + 非空 transcript で受理される。
- **確認ポイント:** 受理 NG なら plan.md クローズ条件に従い、実装コミットを `git revert`（spec/ADR 更新は別コミットで revert 対象外）し、拒否された mime / status / エラーを `.issue/788/adr.md` ADR-006 に追記のうえ本 Issue を再オープン。保険策として `encoding: "opus"` 明示指定 → 録音 UI の webm→ogg/opus 変換の順で次アクションを検討（本 Issue はスコープ外・ADR-006 引き継ぎ）。

### 6. audio → 文字起こし → 構造化 → プレビュー → ノート保存のフルパス（AC-4）

- **対応する受け入れ基準:** AC-4
- **目的:** 確認項目 5 で受理 OK を確認した上で、consumer 経路の binding 配線を含む取り込みフルパスが `deepgram-workers-ai` 選択時に実 binding で通ること。
- **手順:**
  1. staging で `deepgram-workers-ai` 設定のまま録音 UI / audio アップロードで確認項目 5 と同じ webm/opus を投入する。
  2. 文字起こし → 構造化 → プレビュー → ノート保存まで操作する。
- **期待結果:** プレビューに文字起こし由来の**非空**本文が表示され、ノートが保存される。
- **確認ポイント:** audio 文字起こしは **consumer で走る**。`[env.consumer]` の `[ai]` binding 配線や `resolveConsumerSpeechConfig` の apiKey-optional 分岐が漏れると workers-ai 選択でも沈黙 Stub に落ちる。プレビュー本文が空なら「通った」とみなさない（偽陽性排除）。

### 7. 接続テストが実 binding 存在下で `ok:true`（AC-3 実疎通）

- **対応する受け入れ基準:** AC-3（実疎通）
- **目的:** staging の実 `env.AI` binding 下で `/admin/speech` 接続テストが `ok:true` を返すこと（ADR-005 の binding 存在確認）。
- **手順:** staging の `/admin/speech` で `deepgram-workers-ai` を選び「接続テスト」を押す。
- **期待結果:** 接続成功（`ok:true`）が表示される。

## エッジケース・異常系

### 1. binding 未注入 → Stub フォールバック / `SpeechFailureError` / ping `ok:false`

- **対応する受け入れ基準:** AC-5 / AC-6
- **確認手段:** ユニット（`pnpm test:unit`）で固定 — `buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig` が keyless + binding 未注入で Stub に落ちること、adapter transcribe が binding 未注入で `SpeechFailureError`、ping が未注入で `ok:false`。沈黙 Stub は DI unit テストで固めるのが本 Issue の要（ローカルで実 binding が無くても確認できる）。

### 2. 接続テスト失敗（binding 無し / 実行失敗）

- **対応する受け入れ基準:** AC-3
- **確認手段:** ローカルで binding 未注入時に接続テストが未捕捉例外でクラッシュせず失敗表示になること。実 binding 下での失敗系は staging。

### 3. 空の音声入力 / 空 transcript 出力（別ケース）

- **対応する受け入れ基準:** AC-6
- **確認手段:** ユニット（`pnpm test:unit`）で **空 bytes 投入**と **`""` transcript 返却**を別ケースとして固定。port 契約どおり空発話は `""`、実行失敗のみ `SpeechFailureError`。

### 4. timeout（`Promise.race` タイマー経路）

- **対応する受け入れ基準:** AC-6
- **確認手段:** ユニットで `Promise.race` + 自前タイマーが `SpeechFailureError` を reject すること。`AiOptions` に signal/timeout が無いため REST の `AbortController`/`DOMException` 契約とは別系統（混ぜない）。`Promise.race` は下層 `run()` をキャンセルしない点に注意。

## 既存機能への影響確認

- **OpenAI / Deepgram(REST) / Gemini の非回帰:** registry に `deepgram-workers-ai` を 1 行足すだけで `Record<SpeechProvider, SpeechAdapter>` の網羅が成立する。既存 3 provider の選択・保存・接続テスト・取り込みが従来どおり動くこと。REST provider は従来どおり provider 変更時に apiKey 必須（keyless 免除が REST 側に波及していないこと）を確認する。
- **既定 provider は `openai` 据え置き:** `wrangler.toml [vars]` の `ADMIN_SPEECH_PROVIDER = "openai"` が変わらず、未設定時の既定が変わっていないこと。keyless 追加は opt-in で既存経路が無傷。
- **`deepgram`(REST) と `deepgram-workers-ai` の 2 択並び:** `PROVIDER_LABEL` が "Deepgram" と "Deepgram (Workers AI)"、model 既定が `nova-3` vs `@cf/deepgram/nova-3` で紛らわしいため、説明文で鍵不要・model 取り違えリスクの注記が出ること。
- **`deps?` optional による REST 無改修:** `SpeechAdapter.create/ping` への `deps` 追加が openai/deepgram/gemini の 3 barrel を壊していないこと（`pnpm test:unit` の registry / connectionTester テストで担保）。
- **既存テスト維持:** `pnpm typecheck` / `pnpm lint` / `pnpm test`（unit + integration）が緑。特に `errorCodeNaming.test.ts` / `valueObject.test.ts` / `schema.test.ts` / registry テスト。
