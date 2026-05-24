# PR Review #001 — feat(identity): wire Resend email sender with dev-fallback gate

**PR:** #200
**Date:** 2026-05-24
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 14
- Notes: 31
- Verdict: **BLOCKED**

---

## Infrastructure / Deploy

### Blockers
- **[B-001]** `EMAIL_FROM` の値が staging / production で共通の単一リテラル
  - 場所: `infra/scripts/renderWrangler.ts:119`
  - 理由: `renderWrangler.ts` の `vars` テーブルは stage 引数で分岐していないため、staging / production の wrangler.toml がどちらも `EMAIL_FROM = "noreply@example.com"` で生成される。Resend は from ドメインの SPF/DKIM/DMARC verify を要求するため、`example.com` ドメインは確実に 4xx で reject される。Issue 受け入れ条件 5「staging で `/setup` → confirmation メール受信 → verification 完了」を満たすには、operator が renderer リテラルを per-stage で書き換えるしかなく、しかも単一テーブルでは staging と production を独立に設定できない。さらに ADR-005 の AND ゲートも `EMAIL_FROM` がデフォルトで truthy なため、`RESEND_API_KEY` を SOPS に追加すると即 ResendEmailSender が wire され、silent failure を起こす。
  - 提案: `renderWrangler.ts` に per-stage の `EMAIL_FROM_BY_STAGE` ディクショナリを追加し、デフォルトを空文字にする（AND ゲートで安全側に倒す）。`infra/secrets/README.md` か新規 `docs/runbooks/resend-email-setup.md` に operator runbook を明記。

### Warnings
- **[W-001]** `infra/secrets/{staging,production}.enc.json` が本 PR で更新されていない
  - 場所: `infra/secrets/staging.enc.json`, `infra/secrets/production.enc.json`
  - 理由: enc ファイルは `BETTER_AUTH_SECRET` / `GOOGLE_CLIENT_*` の 3 件しか含まず、`SECRET_BOX_MASTER_KEY` / `R2_*` / `ADMIN_LLM_API_KEY` 等も既に lack している状態。`wrangler secret bulk` は欠落キーで fail しないため、deploy は通って `RESEND_API_KEY` も worker に届かない silent failure を起こす。
  - 提案: 本 PR スコープでは encrypt 済み実値を入れる手順ではないため、操作手順を `infra/secrets/README.md` の本 Issue 用セクション or 別 runbook docs に明記。将来的に `workerSecretSpecs()` ∪ decrypted JSON keys を比較する pre-deploy check script を入れるのが望ましい（フォローアップ）。

- **[W-002]** `infra/src/secrets.ts:33` `shared` は indexer worker も含むが、deploy workflow の loop は `--env indexer` を除外（pre-existing inconsistency が拡大）
  - 場所: `.github/workflows/deploy-staging.yml:104`, `deploy-production.yml:107`
  - 理由: indexer worker の secret push が実行されない既存の不整合に、`RESEND_API_KEY` を追加することでさらに乖離が拡大。
  - 提案: pre-existing issue のためフォローアップ Issue で対応。本 PR では document-only。

- **[W-003]** `_resend_api_key_comment` を `*.json.example` に追加 → SOPS encrypt 後 secret として deploy される pre-existing pattern を踏襲
  - 場所: `infra/secrets/staging.json.example:4`, `production.json.example:4`
  - 理由: `wrangler secret bulk` は `^_` キーもフィルタせず upload するため、Workers dashboard に意味のない secret として残る。既存 `_comment` / `_dispatch_extras_comment` も同様だが、毎回追加するごとに dashboard ノイズが増える。
  - 提案: pre-existing pattern のためフォローアップ Issue で対応（deploy workflow に `jq 'del(.["_..."])'` の追加など）。本 PR では document-only。

### Notes
- **[N-001]** wrangler テンプレ配置（top-level `[vars]` only）は plan.md Step 6 / ADR-005 と一致
- **[N-002]** local `wrangler.toml` の追加は `@cloudflare/vite-plugin` と互換、TC-1/TC-2 で動作確認済み
- **[N-003]** ADR-004/005/006 は coherent で実装と一致
- **[N-004]** SOPS rotation flow は既存 README で document 済み、本 Issue 特有の runbook は不要レベル
- **[N-005]** `infra/src/secrets.ts:18-91` のコメントは既存方針（ADR-007 #110 documentation-only）を維持
- **[N-006]** B-001 + W-001 + W-002 を解決する operator runbook を文書化することが望ましい

---

## Application Layer / DI

### Warnings
- **[W-001]** `RequestServerConfig.resendApiKey?: string` の型解釈に関するコメント不足（pre-existing pattern と同じ）
  - 場所: `app/core/application/di/serverCloudflare.ts:120-131`
  - 提案: NOTE 寄り、現状は既存 `SECRET_BOX_MASTER_KEY` パターンと一貫しているため見送り可

- **[W-002]** `ServerEnv.EMAIL_FROM` JSDoc が AND ゲートと非対称な記述
  - 場所: `app/core/application/di/serverCloudflare.ts:204-207`
  - 提案: コメントを「Empty / unset → AND gate fails, DI keeps `ConsoleEmailSender`」に整合させる

- **[W-003]** デフォルト `EMAIL_FROM = "noreply@example.com"` で AND ゲートが事実上 `RESEND_API_KEY` 単独条件に退縮（**B-001 と同根**）
  - 場所: `wrangler.toml:36`, `wrangler.{staging,production}.toml:51` (rendered)
  - 提案: B-001 修正で同時に解決

- **[W-004]** consumer 経路で `RESEND_API_KEY` を受け取るが使わない状態（ADR-004 で承認済み）
  - 提案: 確認結果として記録、対応不要

### Notes
- **[N-001]** AND ゲート + truthy spread + コンストラクタ空チェックの三重防御は健全
- **[N-005]** **既存 DI テストに `RESEND_API_KEY` / `EMAIL_FROM` の test ケースが無い** — リグレッション防止のため追加推奨
- 他 N-002〜N-007 は問題なし

---

## Test

### Warnings
- **[W-001]** `sendEmailChangeNotice` の `locale === "ja"` 分岐テストが欠落
  - 場所: `app/core/adapters/email/__tests__/resendEmailSender.test.ts:144-160`
  - 提案: ja locale テストを追加

- **[W-002]** `extractErrorDetail` の text フォールバック（non-JSON エラー）が未カバー
  - 場所: `app/core/adapters/email/__tests__/resendEmailSender.test.ts:210-283`
  - 提案: non-JSON エラーレスポンス用テスト追加

- **[W-003]** HTML escape regression テストが直接的に存在しない
  - 場所: `app/core/adapters/email/__tests__/resendEmailSender.test.ts`
  - 提案: `?token=a&b=c` のような特殊文字を含む URL/email を input にして `&amp;` が出ることを assert

- **[W-004]** fetch binding regression test が `vi.stubGlobal` 規範と一貫していない
  - 場所: `app/core/adapters/email/__tests__/resendEmailSender.test.ts:286-314`
  - 提案: `vi.stubGlobal("fetch", stub)` + `afterEach(() => vi.unstubAllGlobals())` パターンに置換

- **[W-005]** `catch` 文の「unexpected error」分岐が未カバー
  - 場所: `app/core/adapters/email/__tests__/resendEmailSender.test.ts`
  - 提案: 文字列 throw や非 Error の cause で `unexpected error` メッセージにラップされ secret が漏れない test を追加

### Notes
- 全体的にカバレッジは概ね plan に沿っており、Adapter / DI 双方の規範と一貫している

---

## Adapter / Infrastructure

### Warnings
- **[W-001]** `unexpected error` パスで Authorization ヘッダ漏洩の理論的可能性
  - 場所: `app/core/adapters/email/resendEmailSender.ts:169-174`
  - 提案: Test W-005 と紐づけて回帰テストを追加（実害は限定的）

- **[W-002]** `extractErrorDetail` の text fallback で stream 読込み中の hang リスク（pre-existing pattern なので OK）
  - 場所: `app/core/adapters/email/resendEmailSender.ts:189-206`
  - 提案: anthropic adapter にも同じパターンが存在するためフォローアップ、本 PR では対応不要

### Notes
- port 契約遵守、既存 HTTP adapter 規範との整合性、escapeHtml の実装、fetch binding 修正、JSDoc の質、すべて高水準

---

## Design Decisions

このラウンドで見つかった設計判断（**B-001 を受けた**）:

- ADR-006 の「初期値 `noreply@example.com` のままデプロイすると Resend が 4xx を返すが、ADR-005 の AND ガード（`resendApiKey && emailFrom`）で実害は回避される」という想定が誤り — デフォルト値が truthy のため AND ガードを通過してしまう。修正方針として「**デフォルトを空文字にして fail-safe にする** + **per-stage 配線の仕組みを導入**」を採用予定。詳細は次の adr 追記で確定。
