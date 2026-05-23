# ADR — Issue #197: メール送信プロバイダの実装

## ADR-001: アダプタ配置を `adapters/email/` にする

### Status
Accepted

### Context

`EmailSender` port の Resend HTTP API 実装をどこに置くか。候補:

- A. Issue 推奨どおり `app/core/adapters/email/resendEmailSender.ts`
- B. 既存 `ConsoleEmailSender` と並べて `app/core/adapters/cloudflare/identity/resendEmailSender.ts`
- C. provider 名で切って `app/core/adapters/resend/emailSender.ts`

既存の HTTP プロバイダアダプタは `anthropic/`, `openai/`, `gemini/` のように **provider 名** でディレクトリが切られている（CLAUDE.md「`app/core/adapters/{provider}/`」の文言にも整合）。一方でメールは LLM と違い、用途固定（認証通知）かつ将来 SES / SendGrid / Cloudflare Email Routing など複数 provider に分岐しうる service category である。

### Decision

A. `app/core/adapters/email/resendEmailSender.ts` を採用する。

`ConsoleEmailSender` は dev/test 用 stub の位置づけで現状 `cloudflare/identity/` 配下にある。これは Cloudflare 環境専用というよりは「dev fallback」だが、本 Issue では移動はしない（スコープ外）。新 provider 実装だけを service category ディレクトリ `email/` に置き、将来別 provider が増えた際は `email/` 配下に並べる方針にする。

### Consequences

- 良い点:
  - メール送信という service category に対する複数 provider 実装が同じディレクトリに集約され、将来 SES などを追加する際の置き場が明確
  - Issue 本文の推奨と一致する
- トレードオフ:
  - `ConsoleEmailSender` だけが `cloudflare/identity/` 配下に残り、配置のばらつきが残る（フォローアップで `adapters/email/consoleEmailSender.ts` への移動を検討）

---

## ADR-002: 専用 `EmailSendError` クラスを新設しない

### Status
Accepted

### Context

`EmailSender` port の JSDoc には「Failure surfaces as an `EmailSendError` from the application layer」と書かれているが、実コード上 `EmailSendError` クラスは存在しない（`app/core/application/errors/` 配下に未定義）。spec の文書上の名前と実装の乖離がある状態。

usecase 側（`signUp.ts` / `adminSignUp.ts` / `requestPasswordReset.ts` / `requestEmailChange.ts`）の実装を確認すると、いずれも `EmailSender.send*` の呼び出しを `try/catch` で囲み、失敗時は `logger.error` して継続する（成功扱いで 200 を返す）設計になっている。これは「メール送信失敗で UoW 全体をロールバックしない」という意図的な設計（port 定義の JSDoc にも「usecases call it after the UoW commits so that mail delivery failures do not roll back persistent state」と明記）。

つまり、`EmailSendError` がどんな具体クラスでも presentation 層には届かない（usecase が握り潰す）。HTTP マッピングも presentation 層のシリアライズも発生しない。

### Decision

専用 `EmailSendError` クラスは新設せず、`ResendEmailSender` の各エラー経路は平 `Error` を throw する。

エラーメッセージには以下を含める:
- HTTP 非2xx: ステータスコード + レスポンス body の冒頭
- timeout: "timeout" の文言
- network 失敗: 元の error メッセージ

### Consequences

- 良い点:
  - スコープを最小化、Issue の目的（「メールが届かない」を解消）に集中できる
  - usecase 側の握り潰しロジックを変更せずに済む
- トレードオフ:
  - port JSDoc の `EmailSendError` という文書上の名前と実装の乖離が残る（フォローアップで spec を実装に合わせて修正、または `EmailSendError` クラスを新設して JSDoc と揃える）
  - log に出るエラーメッセージで原因切り分けは可能だが、kind タグでの自動分類はできない（運用 alert 設定時に regex マッチが必要）

---

## ADR-003: HTML 本文をハードコードし、locale は `"ja"` / `"en"` の 2 系統のみ対応

### Status
Accepted

### Context

`EmailSender` port は `locale: string` を引数で受け取る設計。Issue の推奨は「メール本文は最初は HTML ハードコードでよい（後でテンプレート分離可能）」。

選択肢:
- A. HTML をアダプター内のヘルパ関数でハードコード生成、locale は 2 系統 only
- B. テンプレートファイル分離（`adapters/email/templates/verification.{ja,en}.html` 等）
- C. Resend の Template API（テンプレートを Resend 側に登録して ID 参照）

### Decision

A を採用する。各メソッド対応の HTML 生成ヘルパ（`renderVerificationHtml(link, locale)` 等）をモジュール内に閉じて実装し、`locale === "ja"` → 日本語、それ以外 → 英語にフォールバック。

### Consequences

- 良い点:
  - 実装が単一ファイルで完結、依存追加なし
  - Issue 受け入れ条件の最小実装
- トレードオフ:
  - 文言変更にコード修正 + デプロイが必要（テンプレート分離なら設定変更のみで済む）
  - 多言語対応の拡張時はリファクタが必要（追加 locale → if/else 増殖）— フォローアップ

---

## ADR-004: secret 配線は `shared` 配列に追加（per-worker filter は据え置き）

### Status
Accepted

### Context

`infra/src/secrets.ts` の `workerSecretSpecs()` は worker ごとに secret リストを返すが、現状 CI deploy step は `shared` 配列を全 worker に配布する bulk-push 仕様。`RESEND_API_KEY` は実際には web worker のみで消費されるが、相手 worker（relay / pruner / dlq / indexer / consumer）に余分に配ることになる。

ADR-007 #110 のコメント:
> the CI `wrangler secret bulk` step pushes the single SOPS-decrypted file to every worker. This spec is therefore documentation-only until per-worker filtering lands

### Decision

Issue 指示どおり `shared` 配列に `RESEND_API_KEY` を追加する。per-worker filter の導入は本 Issue のスコープ外。

### Consequences

- 良い点:
  - 既存パターンと一貫、PR が小さい
  - per-worker filter が入った後の修正も `shared` から個別 worker への移動だけで完結
- トレードオフ:
  - email を送らない worker にも secret が配布される（blast radius がわずかに広がる）。ただし key 自体は Resend 側で発行・取消可能で、コードからの不正使用も実コード上不可能（adapter が使われていない worker は ResendEmailSender を import しない）

---

## ADR-005: DI 分岐は `RESEND_API_KEY && EMAIL_FROM` の AND 条件にする

### Status
Accepted

### Context

当初案では DI 分岐を `resendApiKey ? new ResendEmailSender(..., from: emailFrom ?? "noreply@example.com") : new ConsoleEmailSender(...)` としていた。これだと `RESEND_API_KEY` だけ設定されて `EMAIL_FROM` が未設定の環境（運用ミス／secret rotation 中の中間状態など）で、`noreply@example.com` を from にして Resend に POST することになる。Resend は from のドメイン認証（SPF/DKIM/DMARC）を要求するため、`example.com` を使った送信は確実に 4xx で失敗する。

usecase 側は `try/catch` で握り潰す設計のため、この失敗はユーザーから見ると「メールが届かない」という silent failure になる。実装は実送信パスに切り替わっているのに送れないという、最も気づきにくい状態を作る。

### Decision

DI 分岐を `resendApiKey && emailFrom` の AND 条件に変更する。両方揃ったときのみ `ResendEmailSender` を wire し、いずれか欠ければ `ConsoleEmailSender` にフォールバックする。

```ts
emailSender:
  resendApiKey && emailFrom
    ? new ResendEmailSender({ apiKey: resendApiKey, from: emailFrom })
    : new ConsoleEmailSender(ConsoleLogger),
```

これは既存の `R2_*` 一式（`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `OBJECT_STORAGE` / `R2_OBJECT_BUCKET_NAME` の AND で `r2PresignReady` を構成）の規範と同型。

### Consequences

- 良い点:
  - 部分設定での silent failure を回避できる（log に `email.verification` が出ているうちは「実送信ではない」ことが明確）
  - 既存の R2 wiring と一貫した「必要な値が全部揃ったときだけ実装、それ以外は dev fallback」のパターン
  - コンストラクタの `from` 空文字チェックと組み合わせて、`ResendEmailSender` が必ず有効な設定で構築される不変条件が成り立つ
- トレードオフ:
  - 「`RESEND_API_KEY` だけ設定したのに動かない」という運用者の混乱に対しては、`ConsoleEmailSender` の log（または別途の起動時 warning）で気付かせる必要がある。本 Issue では追加の log は入れないが、フォローアップで「片方だけ設定された状態の warning log」を検討

---

## ADR-006: `EMAIL_FROM` は `renderWrangler.ts` のリテラルとして配線する（Pulumi StackOutput には含めない）

### Status
Accepted

### Context

`wrangler.{staging,production}.toml` はテンプレート（`infra/templates/*.tmpl`）+ Pulumi StackOutput を `renderWrangler.ts` で合成して生成される。新規 `EMAIL_FROM` の配線先には複数候補がある:

- A. `renderWrangler.ts` 内のリテラル `vars` に追加（`ADMIN_LLM_MODEL` / `ADMIN_LLM_PROVIDER` / `ADMIN_LLM_BASE_URL` と同じ場所）
- B. Pulumi stack の output に追加し、`StackOutput` 型と `vars` の両方を更新
- C. `wrangler.toml.tmpl` 自体にハードコード（変数展開を経由せず）

A 案で先行する `ADMIN_LLM_*` はいずれも「Pulumi がプロビジョンするリソース由来ではなく、デプロイ時に選ぶリテラル値」だが `vars` に同居している。`EMAIL_FROM` も同性質（Resend は外部 SaaS、Pulumi の管理対象外）。

### Decision

A を採用する。`renderWrangler.ts` の `vars` リテラルに `EMAIL_FROM: "noreply@example.com"` を追加し、コメントで「Resend で SPF/DKIM/DMARC 検証済みのドメインに編集してからデプロイする必要がある」旨を明記。

### Consequences

- 良い点:
  - 既存の `ADMIN_LLM_*` リテラル配線パターンに揃う
  - Pulumi スタックを再 provision せずに値を差し替えられる（renderer 経由）
  - Pulumi StackOutput の型サーフェスを最小に保てる
- トレードオフ:
  - リテラルの初期値が `noreply@example.com` のままデプロイすると Resend が 4xx を返し silent failure になる（ADR-005 の AND ガードで実害は回避されるが、運用者には「設定したつもりが反映されていない」状態に見える）。staging 実機検証（plan step 9）で気付ける設計
  - 将来 stage 別に `EMAIL_FROM` を切り替えたい場合は renderer を分岐する必要がある（テンプレート別に `${EMAIL_FROM}` を解決する単純な拡張で済む）

