# 動作確認計画 — Issue #197: メール送信プロバイダの実装 — 認証フローが ConsoleEmailSender だけでは成立しない

**Issue:** #197
**作成日:** 2026-05-23

---

## 確認環境

このIssueは **新規 adapter 追加 + DI 分岐 + secret/env 配線** が中心。DB schema 変更は含まないため migration は不要。動作確認は (1) 機械的検証（typecheck / lint / test）、(2) ローカル開発での `ConsoleEmailSender` フォールバック維持、(3) staging への実 secret 配線後の `/setup` 実機検証、の三本柱。

### 検証環境の起動

ローカル開発（`RESEND_API_KEY` 未設定 → `ConsoleEmailSender` にフォールバック）:

```bash
pnpm dev
```

> `vite dev --config vite.config.cloudflare.ts` 経由で workerd / D1 / Queues 環境が起動。`.dev.vars` に `RESEND_API_KEY` を入れなければ Console フォールバックが効く想定。

### デプロイ方法

dry-run で `wrangler.toml` / secret spec の syntax を先に確認:

```bash
pnpm deploy:staging:dry
pnpm deploy:staging:consumer:dry
```

実 deploy（SOPS secret に `RESEND_API_KEY` を追加してから実行）:

```bash
# 1) SOPS で staging secret を編集して RESEND_API_KEY を追加
sops infra/secrets/staging.enc.json

# 2) deploy（web worker のみ、consumer は emailSender を実起動しないため不要）
pnpm deploy:staging
```

> `sops` で開いた decrypt 状態の JSON に `"RESEND_API_KEY": "re_..."` を追加して保存すると再暗号化される（`infra/secrets/README.md` 参照）。`infra/src/secrets.ts` の `shared` 配列に key を追加した後、`*.enc.json` への追加を忘れると CI deploy が fail する。

---

## 確認項目

### 1. 機械的検証（最優先）

- **目的:** 新規 adapter 追加 + DI 分岐で既存テストが回帰していないことを担保
- **手順:**
  1. `pnpm typecheck` を実行
  2. `pnpm lint:fix && pnpm format` を実行
  3. `pnpm test:unit` を実行
  4. `pnpm test:integration` を実行
- **期待結果:**
  - typecheck: エラー 0 件
  - lint / format: 変更ファイル全て Biome 規約に準拠
  - test: 全件 PASS、新規 `resendEmailSender.test.ts` も PASS
- **確認ポイント:**
  - `exactOptionalPropertyTypes` 関連の型エラーが出ていないか
  - `ServerEnv` への `RESEND_API_KEY?` / `EMAIL_FROM?` 追加が既存 worker 入口の型チェックを破壊していないか

### 2. ローカル開発での `ConsoleEmailSender` フォールバック維持

- **目的:** `RESEND_API_KEY` / `EMAIL_FROM` 未設定時に、既存ローカル開発体験（外部 SaaS 依存なし、stdout 経由でリンク確認）が維持されることを確認
- **手順:**
  1. `.dev.vars` に `RESEND_API_KEY` / `EMAIL_FROM` を含めない状態で `pnpm dev` を起動
  2. ブラウザで `http://localhost:3000/signup` にアクセス → 新規ユーザー登録
  3. wrangler dev のコンソール出力を確認
- **期待結果:**
  - `email.verification` の log エントリが stdout に出力される
  - log の `link` フィールドに verification URL が含まれる
  - 該当 URL をブラウザで開くと verification が完了する
- **確認ポイント:**
  - DI 分岐で `ConsoleEmailSender` が選ばれていること（Resend への HTTP リクエストが発生しないこと、wrangler dev のネットワークログでも確認可）

### 3. staging での `/setup` 実機検証（Issue 受け入れ条件最終項）

- **目的:** Issue 受け入れ条件「staging で実際に `/setup` → confirmation メール受信 → verification 完了が動作することを確認」を満たす
- **前提:** Resend ダッシュボードで staging 用 from ドメイン（または `onboarding@resend.dev` 経由のテスト用 from）を verify 済みの状態
- **手順:**
  1. `sops infra/secrets/staging.enc.json` で `RESEND_API_KEY` を追加して保存
  2. `wrangler.staging.toml` の `[vars]` セクションに `EMAIL_FROM = "noreply@<verify済ドメイン>"` を設定（コミット済みのはず）
  3. `pnpm deploy:staging:dry` で wrangler config の syntax 確認
  4. `wrangler secret put ADMIN_SETUP_TOKEN --config wrangler.staging.toml` で setup token を投入（ADR-007 の運用手順）
  5. `pnpm deploy:staging` で本デプロイ
  6. ブラウザで staging の `/setup` にアクセス
  7. ADMIN_SETUP_TOKEN と admin 用 email アドレス、パスワードを入力して submit
  8. admin 用 email の受信箱を確認
  9. confirmation メール内のリンクをクリック → `/verify-email` に遷移
  10. verification 完了表示を確認 → admin login → admin ダッシュボードへの導線確認
- **期待結果:**
  - メールが受信箱に届く（送信元: `EMAIL_FROM` に設定したアドレス、件名: verification 用件名）
  - メール内リンクで verification が完了する
  - admin としてログインできる
- **確認ポイント:**
  - Cloudflare Logs（`wrangler tail --config wrangler.staging.toml`）で `ResendEmailSender` の throw / log が発生していないこと
  - Resend ダッシュボードの送信ログに該当メールが記録されていること

### 4. 他の認証フロー（影響範囲確認）

- **目的:** `SignUp` / `RequestPasswordReset` / `RequestEmailChange` の各フローでも実メールが届くことを確認（Issue で言及された影響範囲全体のスポットチェック）
- **手順:**
  1. staging で `/signup` → 一般ユーザー新規登録 → verification メール受信確認
  2. staging で `/forgot-password` → 既存ユーザーのメアドを入力 → password reset メール受信確認
  3. staging で settings → email change 申請 → 新メールアドレスに notice、旧メールアドレスに warning が届くか確認
- **期待結果:** 各フローで該当する Resend テンプレートの内容のメールが届く
- **確認ポイント:** Free tier クォータ（100通/日）に注意。テストは最小限の試行で

---

## エッジケース・異常系

### 1. `RESEND_API_KEY` のみ設定 / `EMAIL_FROM` 未設定（部分設定）

- **目的:** ADR-005 の判断（AND 条件で両方揃ったときのみ Resend を wire）が機能していることを確認
- **手順:**
  1. `.dev.vars` または staging 環境で `RESEND_API_KEY` だけ設定、`EMAIL_FROM` は未設定
  2. signup を試行
- **期待結果:** `ConsoleEmailSender` にフォールバックされ、log に `email.verification` が出力される（Resend への HTTP リクエストは発生しない）

### 2. Resend API key 不正 / ドメイン未認証

- **目的:** API 失敗時に usecase が握り潰して 200 を返す既存設計が維持されていることを確認
- **手順:**
  1. staging で `RESEND_API_KEY` を意図的に無効値（例: `re_invalid`）にして再 deploy
  2. signup を試行
- **期待結果:**
  - ユーザーには成功画面（既存設計どおり）
  - Cloudflare Logs に `ResendEmailSender: API error 4xx: ...` の log が記録される（`maskSecrets` で Authorization ヘッダ等は漏れていない）
  - メールは届かない（実機検証なので無効キーで実装の error path 検証）

### 3. Resend ネットワーク疎通失敗 / timeout

- **目的:** タイムアウト制御（30s）と AbortController のクリーンアップが正しく動くことの確認
- **手順:** ユニットテストで `fetch` mock を `AbortError` で reject、`AbortError` が throw されることを assert（実機での再現は困難）
- **期待結果:** `ResendEmailSender: timeout` メッセージで throw、usecase の `try/catch` で握り潰されて 200 が返る

---

## 既存機能への影響確認

- **DI コンテナ生成全般**: `createRequestContainer` の destructuring と分岐が増えるため、既存の他のフィールド（`secretBoxMasterKey` 等）の wire が壊れていないかを `pnpm test` 全件で確認
- **consumer worker**: `EMAIL_FROM` は consumer の vars には配線しないため、consumer の動作は変わらないことを `pnpm deploy:staging:consumer:dry` で confirm
- **`ConsoleEmailSender`**: JSDoc 更新のみで挙動変更なし。既存テストが `ConsoleEmailSender` を直接 new するパスは継続して PASS する必要がある

---

## 確認チェックリスト

- [ ] `pnpm typecheck` PASS
- [ ] `pnpm lint:fix && pnpm format` PASS
- [ ] `pnpm test:unit` PASS（新規 `resendEmailSender.test.ts` 含む）
- [ ] `pnpm test:integration` PASS
- [ ] `pnpm deploy:staging:dry` PASS
- [ ] `pnpm deploy:staging:consumer:dry` PASS（consumer config 影響なし確認）
- [ ] ローカル `pnpm dev` で `ConsoleEmailSender` フォールバック確認
- [ ] staging で `RESEND_API_KEY` + `EMAIL_FROM` 配線後の deploy 成功
- [ ] staging `/setup` でメール受信 → verification 完了
- [ ] staging `/signup` / `/forgot-password` / email change で実メール受信
- [ ] 部分設定（`RESEND_API_KEY` のみ）で `ConsoleEmailSender` にフォールバック確認
- [ ] 異常系（無効キー）で `maskSecrets` 適用ログ確認、ユーザーには 200
- [ ] `.issue/197/adr.md` の各 ADR Status を `Accepted` に更新

