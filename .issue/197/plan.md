# 実装計画 — Issue #197: メール送信プロバイダの実装 — 認証フローが ConsoleEmailSender だけでは成立しない

**Issue:** #197
**作成日:** 2026-05-23
**複雑度:** 中〜大規模

---

## 目的

`EmailSender` port の Resend HTTP API 実装 `ResendEmailSender` を新規追加し、DI で `RESEND_API_KEY` 設定時は実送信、未設定時は既存 `ConsoleEmailSender` にフォールバックする。これにより `/setup`（ADR-007 の初期 admin 登録）を含む全認証フロー（SignUp / AdminSignUp / RequestPasswordReset / RequestEmailChange）が staging / production で成立する状態にする。

## スコープ

### 含まれるもの

- `ResendEmailSender` の新規実装（HTTP API ベース、4 メソッド対応）
- ユニットテスト（fetch をモックして payload とエラーマッピングを検証）
- DI 配線分岐の追加（`createRequestContainer`）
- `RESEND_API_KEY` を `infra/src/secrets.ts` の `shared` 配列に追加
- `infra/secrets/*.json.example` テンプレ更新
- `EMAIL_FROM` の `wrangler.*.toml [vars]` 追加
- `ConsoleEmailSender` の JSDoc 微更新（ResendEmailSender への参照と「dev fallback」位置づけ）

### 含まれないもの

- 暗号化済み `infra/secrets/*.enc.json` への実 API キー注入（運用手順として別途）
- 専用 `EmailSendError` クラスの新設（usecase 側が `try/catch` で握り潰す既存設計のため不要、spec との文書上の乖離はフォローアップ）
- HTML テンプレート分離 / 外部テンプレートエンジン導入（locale は `"ja"` / `"en"` の 2 系統のみハードコード）
- 送信失敗時のユーザー UX 改善（リトライ / 通知 / アラート）
- `ConsoleEmailSender` の `adapters/email/` 配下への移動

## 実装ステップ

### 1. `ResendEmailSender` の新規実装

- **対象ファイル:** `app/core/adapters/email/resendEmailSender.ts`（新規）
- **変更内容:**
  - `class ResendEmailSender implements EmailSender` を定義
  - コンストラクタ: `{ apiKey: string; from: string; endpoint?: string; timeoutMs?: number; fetchImpl?: typeof fetch }` を受ける。`apiKey` / `from` の空文字をコンストラクタで弾く
  - 4 メソッド（`sendVerification` / `sendPasswordReset` / `sendEmailChangeNotice` / `sendEmailChangeWarning`）を実装。各メソッドは内部 helper `postEmail({ to, subject, html })` を呼ぶ
  - `postEmail`: `POST https://api.resend.com/emails` に `{ from, to, subject, html }` を JSON で送信。`Authorization: Bearer <apiKey>`, `Content-Type: application/json`
  - **タイムアウト制御は既存パターン踏襲**（`anthropic/messagesClient.ts` / `openai/connectionPing.ts` に揃える）: `new AbortController()` + `setTimeout` + `finally { clearTimeout(timer) }`。Workers の subrequest timeout と揃えて既定 30 秒
  - HTML 本文は最小限の関数（`renderVerificationHtml(link, locale)` 等）でハードコード生成。`locale === "ja"` のとき日本語、それ以外英語の 2 系統
  - エラーマッピング: HTTP 非2xx → `throw new Error("ResendEmailSender: API error <status>: <maskSecrets(body)>")`; `AbortError` → `throw new Error("ResendEmailSender: timeout")`; ネットワーク失敗 → 同様に Error でラップして throw
  - **エラーメッセージへの secret 漏洩防止**: レスポンス body 文字列に対し `app/core/application/llm/sanitizeErrorReason.ts` の `maskSecrets()` を適用してから throw（既存 `anthropic/messagesClient.ts` の規範を踏襲）
  - JSDoc に「provider 失敗は usecase が log して継続するという仕様に依存」と明記
- **理由:** Issue 推奨配置で、既存 HTTP アダプタ（anthropic / openai / gemini）と同じ構造（コンストラクタ config + driver エラー → throw、`AbortController` + `setTimeout` パターン、`maskSecrets` 適用）を踏襲

### 2. ユニットテスト追加

- **対象ファイル:** `app/core/adapters/email/__tests__/resendEmailSender.test.ts`（新規）
- **変更内容:**
  - `vi.stubGlobal("fetch", mock)` または `fetchImpl` 注入で mock
  - 検証項目:
    - `sendVerification`: POST URL, `Authorization` header, body の `from` / `to` / `subject` / `html` に link が含まれる
    - 同様に `sendPasswordReset`, `sendEmailChangeNotice`, `sendEmailChangeWarning`（warning は link なし、新旧アドレス両方が本文に含まれる）
    - `locale: "ja"` のとき件名・本文が日本語に切替
    - HTTP 4xx / 5xx で throw、メッセージにステータスが含まれる
    - `AbortError`（timeout）で throw
    - `TypeError`（ネットワーク失敗）で throw
    - コンストラクタの apiKey / from 空チェック
- **理由:** 既存テスト規範（`anthropic/__tests__/llmProvider.test.ts`）に沿った payload + エラーマッピング検証

### 3. DI 配線分岐の追加

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  - import に `ResendEmailSender` 追加
  - `ServerEnv` 型に `RESEND_API_KEY?: string` と `EMAIL_FROM?: string` を追加
  - `RequestServerConfig` に `resendApiKey?: string` と `emailFrom?: string` を追加
  - `readRequestServerConfig` で truthy 条件で spread（`SECRET_BOX_MASTER_KEY` と同型）
  - `createRequestContainer` の destructuring に `resendApiKey, emailFrom` を追加
  - 該当の `emailSender` 行を以下に置換（**`RESEND_API_KEY` と `EMAIL_FROM` の両方が設定されている場合のみ `ResendEmailSender` を wire し、いずれか欠ければ `ConsoleEmailSender` にフォールバックする**）:
    ```ts
    emailSender:
      resendApiKey && emailFrom
        ? new ResendEmailSender({
            apiKey: resendApiKey,
            from: emailFrom,
          })
        : new ConsoleEmailSender(ConsoleLogger),
    ```
- **理由:** Issue 受け入れ条件「設定時 Resend / 未設定時 Console フォールバック」を満たし、既存 `secretBoxMasterKey` の wiring pattern と一貫させる。`EMAIL_FROM` 未設定で API key だけ入った状態だと Resend が domain verify 失敗で全送信 4xx になる silent failure を起こすため、両方揃ったときだけ実装に切り替える（`R2_*` 一式が `r2PresignReady` で揃わないと unavailable adapter にフォールバックする既存規範と同型）

### 4. secret 配列への追加

- **対象ファイル:** `infra/src/secrets.ts`
- **変更内容:** `shared` 配列に `"RESEND_API_KEY"` を追加。JSDoc コメントに用途（Resend HTTP API 認証、未設定なら DI が ConsoleEmailSender にフォールバック）を追記
- **理由:** CI bulk-push 対象に含めるため

### 5. SOPS テンプレ更新

- **対象ファイル:** `infra/secrets/staging.json.example`, `infra/secrets/production.json.example`
- **変更内容:** `"RESEND_API_KEY": "re_<resend-api-key>"` を追加。コメント section にも「Resend HTTP API key — staging/production それぞれ別の Resend キーを発行」と説明追加
- **理由:** 例ファイルと `workerSecretSpecs()` の同期が deploy 失敗回避の前提

### 6. `wrangler.toml` 群への `EMAIL_FROM` 追加

- **対象ファイル:** `wrangler.toml`, `wrangler.staging.toml`, `wrangler.production.toml`
- **変更内容:**
  - `[vars]`（web worker トップレベル）にのみ `EMAIL_FROM = "noreply@<domain>"` を追加
  - **consumer / relay / pruner / dlq / indexer の `[env.*.vars]` には追加しない**（email 送信は web worker の request 経路でしか発火しないため、対称配線は不要）
  - ローカル `wrangler.toml` にはダミー値（実送信は `RESEND_API_KEY` 未設定で発火しない）
- **理由:** 送信元アドレスを Cloudflare 側 var で差し替え可能にする。consumer 等への配線を避けることで「これら worker はメール送信経路を持たない」というコード上のシグナルを保つ（`R2_OBJECT_BUCKET_NAME` 等も web 側のみに配線されている既存規範）

### 7. `ConsoleEmailSender` 既存 JSDoc の更新（optional, 同 PR 内）

- **対象ファイル:** `app/core/adapters/cloudflare/identity/emailSender.ts`
- **変更内容:** 「Production wiring path...」のコメントに `ResendEmailSender` への参照を追記し、未設定時のフォールバック挙動を明記
- **理由:** コード読者へのナビゲーション。MVP stub → "dev fallback" への位置づけ更新。Issue 受け入れ条件には含まれないため optional だが、`MVP` 表現が誤解を招くため同 PR に含める

### 8. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit` 通過確認
- **ADR の Status 更新**: `.issue/197/adr.md` の各 ADR の Status を PR merge 前に `Proposed` → `Accepted` に更新
- **理由:** CLAUDE.md 規定のチェック + 既存 ADR（`spec/adr/007-admin-setup-token.md` 等）の運用に揃える

### 9. staging 実機検証（Issue 受け入れ条件最終項）

- **手順:**
  1. Resend ダッシュボードで staging 用 from ドメイン（または `onboarding@resend.dev`）を verify した状態を準備
  2. `infra/secrets/staging.enc.json` を `sops -d` で復号 → `RESEND_API_KEY` 追加 → 再暗号化
  3. `wrangler.staging.toml` の `[vars]` に `EMAIL_FROM` を verify 済みドメインで設定
  4. `pnpm deploy:staging` で deploy
  5. staging で `/setup` → ADMIN_SETUP_TOKEN + admin email でフォーム submit
  6. confirmation メール受信 → リンククリック → `/verify-email` で verification 完了
- **理由:** Issue 受け入れ条件 5 つ目（staging で実際に `/setup` → confirmation メール受信 → verification 完了が動作することを確認）の達成パス。詳細は `testing.md` を参照

## 設計判断

詳細は `adr.md` を参照。要点:

- アダプタ配置: `app/core/adapters/email/`（既存 provider 別配置の規範に揃える）
- エラー型: 専用 `EmailSendError` クラスは作らず、平 `Error` を throw（usecase が握り潰す既存設計に依存）
- メール本文: HTML ハードコード、`locale` は `"ja"` / `"en"` の 2 系統のみ
- `EMAIL_FROM` 必須化: DI 分岐は `resendApiKey && emailFrom` の AND 条件で、両方揃ったときのみ `ResendEmailSender` を wire（詳細 ADR-005）
- fetch timeout: 30 秒（Cloudflare Workers subrequest timeout と揃える）
- secret スコープ: `shared`（per-worker filter が入るまで ADR-007 #110 のコメント方針に従う）

## 前提条件

- **Resend ドメイン認証完了**: `EMAIL_FROM` のドメインは Resend ダッシュボードで SPF/DKIM/DMARC を verify した状態でないと API が `403` を返す。staging deploy 前に staging/production 用ドメイン（または共通サブドメイン）の verify を済ませる。`onboarding@resend.dev`（Resend サンドボックス専用 from）は sender の Resend account に紐づくメアドにしか送れない制約があるため、`/setup` の実機検証には verify 済みドメインが必要

## リスクと注意点

- **secret 不整合 deploy 失敗**: `infra/src/secrets.ts` に追加した key が `*.enc.json` に欠落していると deploy で fail。PR レビュー時に enc 更新コミットの有無を確認
- **API レート制限 / 月間クォータ**: Resend free tier は 100 通/日。staging で大量サインアップテストすると枯渇するため、CI integration test は ConsoleEmailSender 経由（`RESEND_API_KEY` 未設定）に保つ
- **送信失敗時の UX**: usecase は失敗を log だけして 200 を返す既存設計。Resend の API key 無効化などで継続的に失敗しても User からは「メールが届かない」だけで原因が見えない（本 Issue のスコープ外、フォローアップ）
- **テスト helpers の更新は不要**: 既存テストは `ConsoleEmailSender` を直接 new。DI 経由のフォールバック確認は別途
- **spec の `EmailSendError` 文書 vs 実装の乖離**: ADR-002 のとおり本 Issue では `EmailSendError` クラスを新設しない。`spec/domains/identity.md`, `spec/usecases/identity.md`, `spec/testcases/identity/index.md` 各所で参照される `EmailSendError` は文書上の死語のままになるため、フォローアップ Issue として起票する（Phase 4 で対応）

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**取り込んだ改善提案**:
- **S-001 (要件) / S-006 (アーキ)**: `EMAIL_FROM` のデフォルト `"noreply@example.com"` は実際には fail fast にならず silent failure を起こす（Resend が未認証ドメインに 4xx を返す）。DI 分岐を `resendApiKey && emailFrom` に変更し、両方揃ったときだけ `ResendEmailSender` を wire する形に修正（step 3）
- **S-003 (要件)**: staging 実機検証を独立した step 9 として明文化（PR レビュー時のチェックリスト化）
- **S-001 (アーキ)**: ADR Status の `Proposed` → `Accepted` 更新を step 8 に明記
- **S-002 (アーキ)**: タイムアウト制御を既存パターン（`AbortController` + `setTimeout` + `clearTimeout`）に統一（step 1）
- **S-003 (アーキ)**: エラーメッセージへの `maskSecrets()` 適用を step 1 に明記
- **S-004 (アーキ)**: `EMAIL_FROM` の `[env.consumer.vars]` への配線を削除し、web worker のみに配線する形に修正（step 6）。理由を「consumer 経路では emailSender は実際には起動しない」と明示
- **S-007 (アーキ)**: Resend ドメイン認証を「前提条件」セクションに格上げ
- **S-005 (アーキ)**: spec ↔ 実装の `EmailSendError` 乖離をフォローアップ Issue として起票する旨を「リスクと注意点」に追記（Phase 4 で対応）

**取り込んだ良い点**:
- 計画は Issue の受け入れ条件 5 項目を網羅、スコープアウトが明確、既存 wiring pattern（`SECRET_BOX_MASTER_KEY`）と一貫、DI フォールバック維持で local dev 体験を担保

**見送った提案とその理由**:
- なし（S-002 の「step 7 を optional として明示」は計画書内で「（optional, 同 PR 内）」と明記する形で取り込み）

## テスト方針

- ユニットテスト: `app/core/adapters/email/__tests__/resendEmailSender.test.ts` で fetch をモックして payload とエラーマッピングを検証
- 統合・手動確認: staging に secret 配線後、`/setup` → メール受信 → verification 完了を実行（詳細は `testing.md`）

