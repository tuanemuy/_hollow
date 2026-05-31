# Issue #102 — production SECRET_BOX_MASTER_KEY setup & NullSecretBox fallback evaluation

> ⚠️ Issue 本文は旧 `hollow` リポジトリ前提。hollow2 の実態は本文より大幅に成熟しているため、以下は実ファイル確認に基づく計画。

## 概要

production の master key 運用ミスを「運用フォールバックを残しつつ」検知できる状態にする。中核は (1) `selectSecretBox(env, { requireKey })` ファクトリ新設による stage 別 fail-fast/fail-soft のテスト付き実装、(2) shipped placeholder 誤用を弾く CI/ファクトリ両面のガード、(3) production 設定・鍵生成・rotation 手順のドキュメント化。`NullSecretBox` は dev/staging fallback として維持する。

## 調査結果

### 関連ファイル（実在確認済み）

- `app/core/adapters/security/secretBox.ts` — `decodeMasterKey()`（未設定/不正値で `SecretBoxError(KeyUnavailable)` throw）、`WebCryptoSecretBox`（constructor で `decodeMasterKey` を eager 実行）、`WebCryptoSecretBox.fromEnv()`、`NullSecretBox`（全操作 throw）。**`__tests__/` に secretBox 用テストは未存在**（`passwordHasher.test.ts` / `scrypt.test.ts` のみ）。
- `app/core/application/di/serverCloudflare.ts` — `ServerEnv`（`SECRET_BOX_MASTER_KEY?: string` を含む）、`readRequestServerConfig(env, ctx)`、`createRequestContainer(config)`。secretBox は L601-603 で `secretBoxMasterKey ? new WebCryptoSecretBox(...) : new NullSecretBox()`。**Issue が言う「DI 配線が存在しない」は誤り。配線は完全に存在する。**
- `app/core/domain/adminSettings/ports/secretBox.ts` — `SecretBox` port と `SecretBoxError` / `SecretBoxErrorCode`。
- `infra/src/secrets.ts` — `workerSecretSpecs()`。`SECRET_BOX_MASTER_KEY` は `dispatchExtras` に含まれ web/consumer に push。
- `infra/scripts/checkSecrets.ts` — 鍵セット一致検証（**値の検証は明示的に non-goal**）。`pnpm infra:check-secrets:<stage> -- <path>`。
- `infra/secrets/{staging,production}.enc.json`（SOPS 暗号化・tracked）、`{stage}.json.example`（プレースホルダ `<openssl rand -base64 32 — generate fresh per stage>`）。
- `infra/secrets/README.md` — SOPS 運用手順（first-time setup / adding / **rotating** / removing / teammate / CI）。rotation セクションは既に存在するが master key 固有の「旧鍵保持・再暗号化戦略」は未記載。
- `.dev.vars.example` L47-67 — SecretBox 節。**shipped placeholder = `ZGV2LW9ubHktZG8tbm90LXVzZS1pbi1wcm9kLWRvLTE=`（= base64 of `dev-only-do-not-use-in-prod-do-1`、32 byte 制約を満たす）**。これが Issue コメント W-003 の懸念対象。
- `infra/secrets/production.json.example` — `SECRET_BOX_MASTER_KEY` は人間向けプレースホルダで shipped placeholder とは別値。
- `.github/workflows/{ci.yml,deploy-staging.yml,deploy-production.yml}` — CI/CD 完備。deploy 系は `Validate secrets`（checkSecrets）→ `Deploy Workers` → `Inject secrets`（`wrangler secret bulk`）の順。
- `docs/runtime_cloudflare.md` L125 — `SECRET_BOX_MASTER_KEY` 行に「`openssl rand -base64 32` per stage / unset → NullSecretBox」を既記載。
- `docs/deployment_setup.md` — デプロイ手順（詳細未読だが secrets まわりの導線あり）。
- **`docs/secrets.md` は存在しない**（Issue 本文の前提は誤り）。secrets 運用の SSOT は `infra/secrets/README.md`。

### あるべきアーキテクチャ（CLAUDE.md / 既存 ADR）

- cross-cutting concern（鍵供給）は port (`SecretBox`) の背後に閉じる。adapter は driver 差を吸収し共有エラー契約に翻訳。
- 「make illegal states unrepresentable」: 鍵状態（unset / valid / invalid）を型・boot 時点で表現し、runtime の隠れた失敗を避ける。
- 検証は境界2点（transport / value-object 構築）。`decodeMasterKey` が後者に相当。
- ADR は `.issue/{N}/adr.md` に記録（#96 に ADR-001〜005、`spec/adr/` は別系統のプロダクト ADR）。
- `.issue/96/adr.md` ADR-002 が本 Issue の出発点: 「未設定 = NullSecretBox fallback、不正値 = eager throw。**production 必須化は別 Issue（=#102）で `readRequestServerConfig` 内 fail-fast に切替**」と明記。3 状態の挙動差（unset 継続 / invalid 即障害）も定義済み。

### 既存実装の状態（一致 / 乖離）

- **乖離（Issue 本文 → 実態）**: DI 配線・`.dev.vars.example`・`.sops.yaml`・`infra/secrets/*.enc.json`・CI・`wrangler` 運用・package scripts はすべて存在。Issue が想定した「配線箇所が無い」状況ではない。→ 本 Issue は「**既存配線に stage 別 fail-fast を差し込む**」「**ドキュメントの欠落部（master key 生成・rotation 戦略）を埋める**」「**placeholder 誤用ガードを足す**」の 3 点に再定義する。
- **一致**: master key の wire format・3 状態挙動・per-stage 鍵分離方針は既に実装/文書化済み。
- 現状の fail-soft の穴: **unset でも production が起動してしまう**（NullSecretBox）。さらに **shipped placeholder を production secret に誤貼りすると 32byte base64 制約を満たすため boot で弾けない**（W-003）。本 Issue でこの 2 点を塞ぐ。

### 依存関係 / 影響範囲

- `createRequestContainer` の secretBox 分岐（web 経路 = `/admin` 描画）。
- consumer worker 経路（DB 保存 api key の復号）。
- CI deploy（checkSecrets / inject secrets ステップ）。
- ドキュメント（`infra/secrets/README.md`, `docs/runtime_cloudflare.md`, `app/core/adapters/security/` の JSDoc）。
- **stage 判定の入力**（確認済み）: `infra/templates/wrangler.production.toml.tmpl` の `[vars]` には `APP_URL` / `EMAIL_FROM` / `R2_OBJECT_BUCKET_NAME` / `ADMIN_LLM_*` のみで、**明示的な `STAGE` / `ENVIRONMENT` / `NODE_ENV` var は存在しない**。よって runtime は現状「自分が production か」を直接知らない。→ Step 2 で wrangler `[vars]` に明示フラグ var（例 `REQUIRE_SECRET_BOX_KEY = "true"`）を web/consumer の `[vars]` / `[env.consumer.vars]` に追加する方式が必要（staging テンプレートにも設定すれば staging も key-required にできる）。`infra/scripts/renderWrangler.ts` がテンプレートを Pulumi 出力で展開するため、固定文字列なら template 直書きで足りる。

## 実装ステップ

### Phase A: fail-fast ファクトリ（コア・テスト付き）

1. **`selectSecretBox` ファクトリ新設** — 対象: `app/core/adapters/security/secretBox.ts` に追記（ADR-001 の「実装と Null/Stub を同居」規約に合わせ既存ファイルに append）/ 変更内容:
   ```ts
   export type SelectSecretBoxOptions = { requireKey: boolean };
   export function selectSecretBox(
     env: { readonly SECRET_BOX_MASTER_KEY?: string },
     opts: SelectSecretBoxOptions,
   ): SecretBox {
     const raw = env.SECRET_BOX_MASTER_KEY;
     if (raw === undefined || raw.trim().length === 0) {
       if (opts.requireKey) {
         throw new SecretBoxError(
           SecretBoxErrorCode.KeyUnavailable,
           "SECRET_BOX_MASTER_KEY is required in this environment but is unset",
         );
       }
       return new NullSecretBox();
     }
     return new WebCryptoSecretBox(raw); // 不正値は constructor が eager throw（既存挙動）
   }
   ```
   - 加えて **shipped placeholder ガード**を `selectSecretBox`（または `decodeMasterKey`）に組み込む: `requireKey === true` のとき値が shipped placeholder と一致したら `SecretBoxError(KeyUnavailable, "refusing shipped dev placeholder in a key-required environment")` を throw。placeholder 定数は `secretBox.ts` に `export const SHIPPED_DEV_PLACEHOLDER_KEY = "ZGV2..."` として一箇所定義し `.dev.vars.example` と同期。
   - 理由: 「unset で起動」「placeholder 誤用」の 2 穴を型・boot で塞ぐ。`make illegal states unrepresentable` に沿う（runtime の暗黙失敗を boot エラーに前倒し）。

2. **stage → `requireKey` の解決を DI 配線に差し込む** — 対象: `app/core/application/di/serverCloudflare.ts` / 変更内容:
   - `createRequestContainer` の `secretBox: secretBoxMasterKey ? new WebCryptoSecretBox(...) : new NullSecretBox()` を `secretBox: selectSecretBox({ SECRET_BOX_MASTER_KEY: secretBoxMasterKey }, { requireKey })` に置換。
   - `requireKey` の供給源を決める（**要設計判断・下記参照**）。第一候補: `ServerEnv` に明示 var を 1 つ追加（例 `REQUIRE_SECRET_BOX_KEY?: "true"` を wrangler `[vars]` で production/staging テンプレートに設定）。`NODE_ENV` は Workers では信頼できないため使わない。
   - `RequestServerConfig` に `requireSecretBoxKey?: boolean` を threading（既存の optional spread パターン踏襲）。
   - 理由: stage 判定を transport boundary（env）で 1 度だけ行い、ファクトリは pure に保つ。

3. **secretBox ユニットテスト新設** — 対象: `app/core/adapters/security/__tests__/secretBox.test.ts`（新規）/ 変更内容: 下記「テスト方針」のケースを vitest で。

### Phase B: CI ガード（placeholder 検知）

4. **checkSecrets に値ガードを追加 or 専用チェック追加** — 対象: `infra/scripts/checkSecrets.ts`（拡張）/ 変更内容: 復号済み JSON の `SECRET_BOX_MASTER_KEY` が shipped placeholder 値と一致したら exit 1。現状 checkSecrets は「鍵セットのみ・値非検証」が明示 non-goal なので、**値検証は別関数/別フラグとして足し、既存の non-goal 記述を更新**する（または `checkSecrets` とは別の薄い grep ステップを deploy workflow に追加）。deploy-production.yml / deploy-staging.yml の `Validate secrets` ステップで実行。
   - 理由: W-003 の防御策。ファクトリ側ガード（Step 1）と二重化することで「CI を通っても runtime でも弾く」多層防御。

### Phase C: ドキュメント

5. **`infra/secrets/README.md` に master key 専用節を追記** — 変更内容:
   - 「Generating the SecretBox master key」: `openssl rand -base64 32`（既存導線）に加え、ブラウザ/Worker 環境向けに `crypto.getRandomValues(new Uint8Array(32))` → base64 のワンライナーも併記（Issue 完了条件の「crypto.getRandomValues(32) + base64」を満たす）。
   - 「Rotating the SecretBox master key」: 既存の汎用 rotate 手順を master key 固有に拡張 — **旧鍵保持期間**（再暗号化完了まで旧鍵で復号できる必要がある）、**再暗号化戦略**（wire format の version byte `0x01` を活用し新 version で段階移行 or 全 DB 行 re-encrypt バッチ）、**stage 分離**（staging/production で鍵を共有しない）を明記。実コードの再暗号化バッチは別 Issue（スコープ外）として「将来 Issue 候補」に記載。
6. **`docs/runtime_cloudflare.md` の `SECRET_BOX_MASTER_KEY` 行を更新** — 変更内容: fail-fast 切替後の挙動（key-required 環境では unset/placeholder で boot 失敗）を反映。`wrangler secret put SECRET_BOX_MASTER_KEY`（単発設定）と `wrangler secret bulk`（CI 経路）の両手順への参照を明示。
7. **`app/core/adapters/security/secretBox.ts` の JSDoc 更新** — 変更内容: `NullSecretBox` の JSDoc に「dev/staging fallback 専用、production では `selectSecretBox(requireKey:true)` により到達不能」を追記。`selectSecretBox` に library-level JSDoc。
8. **ADR 記録** — 対象: `.issue/102/adr.md`（新規）/ 内容: 「ADR-002（#96）を本 Issue で更新: key-required 環境で fail-fast 採用」「NullSecretBox 維持判断」「placeholder ガードの二層化」「stage 判定方式」を記録。`.issue/96/adr.md` ADR-002 に supersede note を追記。

> `wrangler secret put SECRET_BOX_MASTER_KEY` / `wrangler secret bulk <file> --config wrangler.<stage>.toml [--env <w>]` はいずれも実在確認済み（deploy-production.yml の `Inject secrets` ステップ・`infra/secrets/README.md` で使用）。推測コマンドなし。

## 設計判断

- **fail-fast 実装方式: (a) を推奨**（ファクトリ `selectSecretBox` をテスト付き実コードで新設）。
  - 理由: 本プロジェクトは Issue 本文の想定と違い DI 配線が既に存在するため、(a) は「将来の配線待ち」ではなく**今すぐ既存配線に差し込めて完了条件『実装が反映されている』を即満たす**。ファクトリ化により stage 別分岐ロジックが 1 箇所に集約され純粋関数としてテスト可能 = `cross-cutting concerns behind ports` / `make illegal states unrepresentable` に合致。(b)（ドキュメントのみ）は実装反映の完了条件を満たさず、`createRequestContainer` 内のインライン三項分岐に placeholder ガードを直書きする劣化案になりがち。
  - **過剰実装回避**: DI 全体の再構築・on-demand container 化（#96 ADR-004 で却下済み）・再暗号化バッチの実装は**本 Issue スコープ外**。ファクトリ + 配線差し込み + テスト + ガード + ドキュメントに限定。
- **NullSecretBox: 維持**。
  - 理由: production を `requireKey:true` で fail-fast にすると NullSecretBox は dev/staging（`requireKey:false`）の fallback としてのみ機能する。dev で `.dev.vars` 未設定でも `/admin` を描画できる利便（#96 ADR-002 の良い点）は引き続き有効。削除すると dev の起動性が落ちるだけで利得が無い。`selectSecretBox` の戻り先として型上も必要。JSDoc で「dev/staging 専用」を明記して役割を限定する。
- **CI grep チェック（W-003）: 本 Issue スコープに含める**。
  - 理由: Issue 本文の前提と異なり `.dev.vars.example`（placeholder 実在）・`infra/secrets/*.enc.json`・CI(deploy workflows) は**すべて存在する**ので、grep チェックを追加する前提条件が揃っている。実装コスト小（checkSecrets 拡張 or 1 ステップ追加）で W-003 の懸念に直接応える。ファクトリ側ガード（runtime）と CI 側ガード（deploy 前）の二層で防御。
- **stage 判定方式（要設計確定）**: `NODE_ENV` 依存は採らない（Workers で非信頼）。`ServerEnv` に明示 var（`REQUIRE_SECRET_BOX_KEY` 等）を足し wrangler `[vars]` テンプレートで production/staging に設定する方式を推奨。既存 stage 差分 var（`APP_URL`/`EMAIL_FROM`）が template にあるかを確認し、あれば命名・配置を揃える。

## リスクと注意点

- **既存挙動の破壊**: production を fail-fast 化すると、現在 master key 未設定で動いている環境があれば deploy 後 boot 失敗する。→ ドキュメントに移行注意を明記し、切替前に production secret 設定済みを確認する手順を入れる。
- **shipped placeholder 定数の同期**: `secretBox.ts` の定数と `.dev.vars.example` の値がずれると runtime ガードが空振りする。定数を SSOT 化し、ずれたら検知するテストを 1 本入れる。
- **checkSecrets の non-goal 変更**: 「値非検証」を明示している設計判断を変えるので、JSDoc の non-goal 記述も同時更新し意図を残す。
- **stage var の二重管理**: 新 var を足す場合、`workerSecretSpecs`（secret）ではなく wrangler `[vars]`（public）側。secret 扱いしないよう注意。
- **rotation の実コード**: 旧鍵保持・再暗号化バッチは方針記述に留め実装は別 Issue。スコープ膨張を避ける。
- biome: ローカルで `./node_modules/.bin/biome` で format 確認（rtk が `pnpm lint`/biome を書き換える既知問題）。

## テスト方針

dev/build サーバは検証の主役にできない（`pnpm dev` は prebuilt dist を serve する既知挙動）。動作確認は **vitest 中心**。

`app/core/adapters/security/__tests__/secretBox.test.ts`（新規）:
- `selectSecretBox(unset, {requireKey:false})` → `NullSecretBox` インスタンス（操作で `SecretBoxError(KeyUnavailable)`）。
- `selectSecretBox(unset, {requireKey:true})` → 即 throw `SecretBoxError(KeyUnavailable)`。
- `selectSecretBox(emptyString, {requireKey:true})` → 即 throw。
- `selectSecretBox(validKey, {requireKey:true|false})` → `WebCryptoSecretBox`、encrypt→decrypt round-trip 成立。
- `selectSecretBox(invalidKey=非32byte/非base64, *)` → constructor eager throw。
- `selectSecretBox(SHIPPED_DEV_PLACEHOLDER_KEY, {requireKey:true})` → 即 throw（placeholder ガード）。
- `selectSecretBox(SHIPPED_DEV_PLACEHOLDER_KEY, {requireKey:false})` → `WebCryptoSecretBox`（dev では許容）。
- placeholder 定数と `.dev.vars.example` 値の同期テスト（ファイル読み取りで一致確認）。

`infra/scripts/checkSecrets.ts`（拡張時）:
- 既存ユニットテストの有無を確認の上、placeholder 値検出で exit 1 になるケースを追加（テスト harness が無ければ最小の関数抽出 + テスト）。

`app/core/application/di/__tests__/serverCloudflare.test.ts`（既存）:
- `requireKey` threading が `createRequestContainer` まで届き、production 相当設定 + unset で container 構築が throw することを 1 ケース追加。

実行: `pnpm typecheck && ./node_modules/.bin/biome check && pnpm test:unit`。

## 計画補足（レビュー反映）

- **consumer 経路の fail-fast 波及（確認済み）**: `createConsumerContainer(env, ctx)` は内部で `readRequestServerConfig(env, ctx) → createRequestContainer` を呼ぶため、`readRequestServerConfig` 内で `requireSecretBoxKey` を 1 度解決すれば web / consumer の両経路に効く。relay / pruner / dlq / indexer は `createWorkerContainer`（secretBox を組まない）なので fail-fast の巻き添えにならない。stage var は web `[vars]` と `[env.consumer.vars]` の 2 箇所に置けば足りる。
- **placeholder 同期テストのパス解決**: `secretBox.ts` の定数と `.dev.vars.example` を突き合わせるテストは、cwd 依存を避けるため `import.meta.url` 起点の絶対パスでリポジトリルートの `.dev.vars.example` を読む。抽出ロジックは最小限（行頭 `SECRET_BOX_MASTER_KEY=` の値抜き出し）にして脆い grep を避ける。
- **`WebCryptoSecretBox.fromEnv()` の扱い**: `selectSecretBox` 新設で役割が重複し、`fromEnv` は placeholder ガードを持たない。現利用箇所を確認し、未使用なら削除、使用中なら `selectSecretBox` へ集約 or deprecate JSDoc を付けてガード迂回経路を残さない。判断は adr.md に記録。
- **fail-fast の影響範囲（移行注意の精緻化）**: `secretBox` は request container 全体に組まれるため、key-required 環境で未設定だと `/admin` だけでなく**公開ページを含む全ルートが 500** になる。移行注意に「影響は admin 限定でない」旨を明記する。

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

- **要件カバレッジ視点**: 問題点ゼロ。完了条件 5 項目すべてに対応がマッピングされ、事実主張（DI 配線 L601-603 実在 / `.dev.vars.example` placeholder / checkSecrets 値非検証 non-goal / wrangler に STAGE var 不在 / `docs/secrets.md` 不在）が実コードで裏取り済み。
- **アーキ・リスク視点**: 問題点ゼロ。fail-fast の web/consumer 両経路波及、stage 判定方式（固定文字列 var が renderWrangler を素通り）、checkSecrets non-goal 整合、エッジケース網羅を確認。
- **取り込んだ改善提案**: S-001（consumer 経路の threading 明記）/ S-002（同期テストの絶対パス解決）/ S-003（`fromEnv` 整理、fail-fast の全ルート影響）を「計画補足」に反映。
- **見送り**: なし（すべてスコープ内の妥当な補足として取り込み）。
