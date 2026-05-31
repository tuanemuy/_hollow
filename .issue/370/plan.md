# 実装計画 — Issue #370: feat(security): SECRET_BOX_MASTER_KEY rotation の再暗号化バッチ実装

**Issue:** #370
**作成日:** 2026-05-31
**複雑度:** 中〜大規模

---

## 目的

`SECRET_BOX_MASTER_KEY` をローテーションした際、旧鍵で暗号化された `apiKeySource='db'` の LLM api key を新鍵で再暗号化する実コードを提供する。Issue #102 で方針だけ整備し先送りした「再暗号化の仕組み」を実装し、旧鍵保持期間・切替手順を運用ドキュメントに具体化する。

## スコープ

### 含まれるもの

- 旧鍵を供給する経路（`SECRET_BOX_MASTER_KEY_PREVIOUS` を optional env として追加）。
- 旧鍵で復号 → 新鍵で再暗号化する冪等なユースケース。対象は `apiKeySource='db'` の `instance_settings.llm_api_key_ciphertext`（現状 at-rest 暗号化対象はこの singleton 1 行のみ）。
- admin UI からの起動経路（server function + ルート + コンポーネント）。
- 運用ドキュメント（`infra/secrets/README.md` の rotation 実手順、旧鍵保持期間・破棄ステップ）の更新。
- ADR への設計判断記録。

### 含まれないもの

- 汎用「暗号化行レジストリ」や複数テーブル横断の大規模バッチ（現状対象が singleton 1 行のため YAGNI。対象が増えた時点で別 Issue）。
- アルゴリズム変更（version byte の増分）。本 Issue は同 AES-GCM のまま鍵だけを差し替える。
- scheduled/cron worker 化（理由は設計判断参照）。

## 実装ステップ

### Phase A: 旧鍵の供給（env → container）

#### 1. 旧鍵で `SecretBox` を構築する経路を追加

- **対象ファイル:** `app/core/adapters/security/secretBox.ts`
- **変更内容:** 旧鍵用ファクトリ `selectPreviousSecretBox(env, opts)`（または `selectSecretBox` のオプション拡張）を追加。旧鍵が未設定なら `null` を返す（rotation 中のみ存在する一時 env のため `requireKey` 強制はしない）。placeholder/不正値（非 base64・byte 長違い）は eager throw（誤設定検知）。
- **理由:** rotation 期間だけ旧鍵が存在する。新鍵 fail-fast ロジックを壊さず旧鍵を optional に扱う。

#### 2. `ServerEnv` に旧鍵を追加し config に threading

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:** `ServerEnv` に `SECRET_BOX_MASTER_KEY_PREVIOUS?: string` を追加。`readRequestServerConfig` で optional spread（既存 `secretBoxMasterKey` と同パターン）。`RequestServerConfig` に `secretBoxMasterKeyPrevious?` を threading。`createRequestContainer` で旧鍵 `SecretBox`（または `null`）を構築し container に配線。`createConsumerContainer` 経由でも届くか確認（後述リスク参照）。
- **理由:** 旧鍵を境界で 1 度だけ解決し、container 経由で usecase に届ける。

#### 3. container 型に `secretBoxPrevious` を追加

- **対象ファイル:** `app/core/application/di/types.ts`
- **変更内容:** `RequestContainer` に `secretBoxPrevious: SecretBox | null` を追加する。`ServiceArgs<T>` は `RequestContainer` 固定なので追加先は必然的に `RequestContainer`。`ConsumerContainer extends RequestContainer` かつ `createConsumerContainer` は `createRequestContainer(...)` を spread するため、`readRequestServerConfig` の旧鍵 spread（step 2）を介して **request / consumer 両経路に自動で届く**。
- **理由:** 再暗号化 usecase（web 経路）と consumer の復号経路の両方で旧鍵フォールバックを効かせるため。consumer 経路にも届くことは意図した挙動（後述 step 4b / ADR-001・ADR-004 参照）。

### Phase B: 両鍵 decrypt ヘルパー + 再暗号化ユースケース（application 層）

#### 4a. 両鍵 decrypt フォールパックの共通ヘルパーを新設

- **対象ファイル:** `app/core/application/adminSettings/decryptWithFallback.ts`（新規、または既存 service ヘルパーに併設）
- **変更内容:** `decryptWithFallback(box, boxPrevious, cipher)` を実装。まず新鍵 `box` で復号を試行し、`DecryptFailed`（tag mismatch = 旧鍵で暗号化された行）の場合のみ `boxPrevious`（あれば）で再試行する。`InvalidCiphertext`（version byte 不一致など）はフォールバックせずそのまま投げる。`boxPrevious` が `null` で新鍵 decrypt も失敗した場合は元のエラーを投げる。
- **理由:** 「両鍵で復号を試行する」というフォールバック挙動を **application 層の名前付き処理**として一箇所に閉じる。`SecretBox` ポート自体は単一鍵のまま純粋に保ち、フォールバックは意図的・明示的な application 関心事とする（ADR-001 で「ポートにフォールバックを実装しない」と確定）。再暗号化 usecase と consumer 復号経路の両方がこれを使う（DRY）。

#### 4b. consumer 復号経路に旧鍵フォールバックを適用

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`（`resolveConsumerLlmConfig` 周辺）
- **変更内容:**
  - `resolveConsumerLlmConfig(env, secretBox)` のシグネチャに第3引数 `secretBoxPrevious: SecretBox | null` を追加し、呼び出し側（`createConsumerContainer` で `requestContainer.secretBox` を渡している箇所）から `requestContainer.secretBoxPrevious` も渡す。
  - 内部の `secretBox.decrypt(cipher)` を `decryptWithFallback(secretBox, secretBoxPrevious, cipher)` に置き換える。
  - **責務分担:** `decryptWithFallback` は復号に失敗したら throw する（フォールバックも失敗すれば最終エラーを投げる）。Stub 降格の判断は従来どおり呼び出し側の既存 `try/catch`（`isSecretBoxError` を warn-log して `null` 返し）が担う。ヘルパーは「両鍵で復号を試みる」ことだけに責務を限定し、降格ポリシーは持たない。
- **理由:** 両レビュー（P-001/P-002/P-003）が指摘した「rotation 中の consumer サイレント劣化」を防ぐ。Issue の核心要件「安全なローテーション」を満たすには、再暗号化完了までの間も db-source の LLM 機能が動き続ける必要がある。旧鍵が put されていれば旧鍵行を復号でき、旧鍵未設定や両鍵失敗時のみ従来どおり Stub 降格する。

#### 5. `reencryptDbSecrets`（仮称）ユースケースを新設

- **対象ファイル:** `app/core/application/adminSettings/reencryptApiKey.ts`（新規）
- **変更内容:**
  - admin 認可（既存 `assertAdmin` を使用）。
  - **リポジトリアクセスは必ず `unitOfWorkProvider.run` 内**（application usecase は `env.DB` 直読みできない）。かつ Web Crypto は tx ロールバック不可なので、crypto は UoW の外で挟む。よって `updateLLMConfig`（平文を input から受け取り単一 UoW で read+save）とは構造が異なり、**read と save の間に crypto を挟む 2 段構成**になる:
    1. **read-only UoW**: `instanceSettingsRepository.get()` で現値（`apiKeySource`, `apiKeyCiphertext`, version 相当）を取得。`apiKeySource!=='db'` → `skipped='not-db'`、`apiKeyCiphertext===null` → `skipped='no-ciphertext'` で早期 return。
    2. **UoW 外（crypto）**: まず**新鍵**で復号を試行し成功すれば移行済み → `skipped='already-new-key'` で return（冪等）。`DecryptFailed` の場合のみ `decryptWithFallback`（step 4a）で**旧鍵**復号。旧鍵が `null` なのに旧鍵が必要なら `SecretBoxError(KeyUnavailable)` を投げる（サイレント skip しない）。復号した平文を**新鍵**で再暗号化（version byte は 0x01 維持、鍵だけ替わる）。
    3. **OCC save UoW**: 再度 `get()` で最新 version を取得し、`apiKeyCiphertext` のみ新 ciphertext に差し替えて `save(entity, expectedVersion)`。read からこの save までの間に admin が設定変更していれば OCC 衝突 → `ConflictError` 伝播。
  - 戻り値: `{ reencrypted: boolean; skipped: 'not-db'|'already-new-key'|'no-ciphertext'|null }`。
  - **通常時（旧鍵未設定）の誤操作は無害:** 新鍵 decrypt が成功して `skipped='already-new-key'` で no-op。旧鍵が必要な行があるのに旧鍵未設定のときだけ明示エラー。
- **理由:** 新鍵 decrypt 先行試行により冪等（at-least-once / 多重実行で壊れない）。crypto を UoW 外に出す制約と、read→crypto→save の順序依存から 2 段 UoW になる。OCC で save 直前に最新 version を取り直すので、バッチ中に新規 encrypt が走っても衝突を検知し整合を保つ。

#### 6. DTO/エラーコードの確認

- **対象ファイル:** `app/core/application/dto/adminSettings.ts`（必要なら追記）
- **変更内容:** 出力 DTO を既存 projection 規約に合わせる。**新エラーコードは追加しない** — 旧鍵欠落は既存 `SecretBoxError(KeyUnavailable)`（`NullSecretBox.decrypt` が既に投げるコード）で表現し、OCC 衝突は `ConflictError`、認可は既存パターンで表現する。`*ErrorCode` 命名規約（`errorCodeNaming.test.ts` で強制）への波及を避ける。
- **理由:** 既存のエラー contract に乗せ、テスト波及を最小化する。

### Phase C: 起動経路（presentation）

#### 7. admin UI から起動する server function + ルート

- **対象ファイル:** `app/routes/`（admin 配下、既存 LLM 設定ルートに併設）、`app/components/admin/`、presentation の server-function entry
- **変更内容:** admin がボタン操作で再暗号化 usecase を起動。入力なし（confirm のみ）なので `inputValidator` は最小。結果（reencrypted/skipped）を表示。
- **理由:** rotation は頻度の低い手動運用イベントで「新鍵設定→deploy→再暗号化→旧鍵破棄」の順序を人間が制御する必要がある。対象も singleton 1 行で worker 化の利得が無く、既存 admin usecase と同じ presentation→application 経路が hexagonal に最も沿う。

### Phase D: ドキュメント + ADR

#### 8. `infra/secrets/README.md`「Rotating the master key」を実手順に更新

- **変更内容:** (a) 新鍵生成、(b) 旧鍵を `SECRET_BOX_MASTER_KEY_PREVIOUS` に設定、(c) 新鍵を `SECRET_BOX_MASTER_KEY` に設定、(d) deploy、(e) admin UI で再暗号化実行、(f) 完了確認後 `SECRET_BOX_MASTER_KEY_PREVIOUS` を削除。旧鍵保持期間=「再暗号化完了まで」を明記。**旧鍵 secret を put する対象 worker** を明記する — 再暗号化 usecase が動く **web** と、rotation 中も db-source LLM を復号する **consumer** の両方（`dispatchExtras` が両者に push する経路に対応）。stage 分離注記は維持。

#### 9. `infra/src/secrets.ts` / spec の扱い

- **変更内容:** `SECRET_BOX_MASTER_KEY_PREVIOUS` は通常時 absent・rotation 時のみ present の一時 secret。`checkSecrets` は missing/extra 両方を fail させる設計のため、**spec に載せず rotation 時に手動 `wrangler secret put`（web / consumer 両 worker に）する運用**を推奨（変更最小）。README に手順を明記。
- **理由:** 一時 secret を恒久 spec に載せると通常時 deploy が fail する。

#### 10. `docs/runtime_cloudflare.md` の secret 表に旧鍵 env を追記（任意）

#### 11. ADR 記録

- **対象ファイル:** `.issue/370/adr.md`
- **変更内容:** 下記設計判断を記録。

## 設計判断

詳細は `.issue/370/adr.md` を参照。要点:

- **段階移行（両鍵 decrypt フォールバック）と一括 re-encrypt バッチの折衷を採用** — 旧鍵保持期間中は両鍵 decrypt 試行（新鍵→失敗時旧鍵）、明示的な再暗号化 usecase で新鍵に書き直し、完了後に旧鍵破棄。version byte は鍵差し替えでは切り替えない（0x01 維持、tag 検証が事実上の鍵世代判別子）。
- **両鍵フォールバックは application 層の名前付きヘルパー `decryptWithFallback` に閉じる** — `SecretBox` ポート自体には実装しない。再暗号化 usecase と consumer 復号経路（`resolveConsumerLlmConfig`）の両方がこのヘルパーを使い、rotation 中の consumer Stub 降格を防ぐ（ADR-001 / ADR-004）。
- **起動経路は admin UI の usecase**（scheduled cron 不採用） — rotation は手動運用イベントで順序制御が要る。対象 1 行で worker 化の利得なし。
- **旧鍵は optional secret `SECRET_BOX_MASTER_KEY_PREVIOUS`** — 未設定→`null`、placeholder/不正→throw。spec には載せず rotation 時手動 put。
- **拡張性は YAGNI** — 現状 singleton 1 行限定。対象列挙を小関数に閉じ、増えたら別 Issue。

## リスクと注意点

- **旧鍵の取り違え:** 誤った旧鍵だと decrypt が全失敗。旧鍵不正時はエラーを明示しサイレント no-op しない。
- **旧鍵の破棄漏れ:** rotation 完了後 `SECRET_BOX_MASTER_KEY_PREVIOUS` 削除を README に必須ステップとして明記。
- **`checkSecrets` との整合:** 一時 secret を spec に載せると通常時 deploy が fail。手動 put 運用に確定する（未決だと CI が壊れる）。
- **OCC 衝突:** rotation 実行中に admin が LLM 設定変更すると衝突。衝突時は `ConflictError` を UI に出し再実行を促す。
- **consumer 経路の旧鍵:** rotation 中（新鍵 deploy 後・再暗号化前）に consumer が旧鍵行を復号する必要がある。step 4b で `resolveConsumerLlmConfig` に `decryptWithFallback` を適用し、Stub 降格を防ぐ（ADR-004 で確定）。旧鍵 secret を consumer worker にも put する必要がある点を README に明記。
- **biome:** ローカルでは `./node_modules/.bin/biome` で確認（`pnpm lint` 書き換えの既知問題）。

## テスト方針

検証は vitest 中心（`pnpm dev` は prebuilt dist を serve する既知挙動）。

- `app/core/adapters/security/__tests__/secretBox.test.ts`（拡張）: 旧鍵ファクトリ（未設定→`null`、不正→throw、placeholder→throw）。旧鍵 encrypt → 新鍵 decrypt 失敗 → 旧鍵 decrypt 成功 → 新鍵 re-encrypt → 新鍵 decrypt 成功 の round-trip。
- `decryptWithFallback` unit テスト（新規）: 新鍵成功でそのまま返す / 新鍵 `DecryptFailed` → 旧鍵で成功 / 旧鍵 `null` で新鍵失敗ならエラー伝播 / `InvalidCiphertext` はフォールバックせず伝播。
- `reencryptApiKey` integration テスト（新規）: (a) `db` 行を旧→新で再暗号化し新鍵で復号可、(b) 2 回実行で冪等（skip=`already-new-key`）、(c) `env` は skip、(d) 旧鍵未設定で旧鍵が必要なら明示エラー、(e) 非 admin は認可エラー、(f) OCC 衝突で `ConflictError`。
- `serverCloudflare` DI テスト（拡張）: `SECRET_BOX_MASTER_KEY_PREVIOUS` の threading が request / consumer 両 container まで届く。
- consumer 復号フォールバック: rotation 中（新鍵 + 旧鍵で暗号化された行）に `resolveConsumerLlmConfig` が Stub 降格せず旧鍵で復号できることを検証（既存 consumer LLM config テストがあれば拡張）。
- 手動/ブラウザ: admin UI の再暗号化ボタン操作（manual-test）。主検証は vitest。
- 実行: `pnpm typecheck && ./node_modules/.bin/biome check && pnpm test:unit && pnpm test:integration`。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 並列）

**修正した点**:
- **P-001（両視点共通）**: ADR-001 が掲げた「両鍵 decrypt フォールバック」の実装場所が plan / ADR / consumer 経路で曖昧かつ未決だった。→ application 層の名前付きヘルパー `decryptWithFallback` に閉じることを確定（Phase B step 4a）。`SecretBox` ポートには実装しない旨を ADR-001 に明記。
- **P-002 / P-003（アーキ視点）**: rotation 中に consumer の `resolveConsumerLlmConfig` が旧鍵行を decrypt 失敗 → Stub にサイレント劣化する問題。`secretBoxPrevious` を `RequestContainer` に追加（spread で consumer へ自動伝播）し、`resolveConsumerLlmConfig` に `decryptWithFallback` を適用する step 4b を追加。ADR-004 として確定。container 追加先が `RequestContainer` であることを step 3 で明記。
- **S-001（アーキ視点）**: 旧鍵欠落の明示エラーに新コードを足すか「実装時判断」と留保していた。→ 新コードは追加せず既存 `SecretBoxError(KeyUnavailable)` で表現すると step 6 で確定（`errorCodeNaming.test.ts` 波及回避）。
- **S-002（アーキ視点）**: 旧鍵 secret を put する対象 worker（web / consumer 両方）を README に明記する旨を step 8/9 に追加。

**取り込んだ改善提案**:
- **S-001（要件視点）**: 通常時（旧鍵未設定）に誤って再暗号化を実行しても新鍵 decrypt 成功で no-op skip となり無害、という挙動を step 5 に明記。
- **S-003（アーキ視点）/ consumer フォールバック**: DI テスト・consumer 復号フォールバックのテストケースをテスト方針に追加。

**見送った提案とその理由**:
- **S-002（要件視点、拡張性の設計痕跡）**: 「対象行を列挙する小関数をどこに置くか ADR に 1 行」は、plan のスコープ「含まれないもの」と reencrypt usecase の対象判定（`apiKeySource==='db'` の明示列挙）で既に痕跡が残るため、ADR への追記は見送り。YAGNI 判断は維持。

### 2周目（要件カバレッジ / アーキ・リスク 並列）

**修正した点**:
- **P-001（アーキ視点）**: step 5 の「UoW 外で現値を読む」が実コードでは不可能（`instanceSettingsRepository` は `unitOfWorkProvider.run` 内でしか露出しない）。また `updateLLMConfig` と同型ではない（あちらは平文を input から受け取る）。→ step 5 を「①read-only UoW で現値取得 → ②UoW 外で decryptWithFallback + 新鍵 encrypt → ③OCC save UoW で最新 version 取り直して save」の 2 段 UoW 構成に書き直した。

**取り込んだ改善提案**:
- **S-001（両視点）**: `resolveConsumerLlmConfig` の引数に `secretBoxPrevious: SecretBox | null` を追加し呼び出し側で渡す、という具体的接続点を step 4b に明記。
- **S-002（両視点）**: `decryptWithFallback` は throw し、Stub 降格判断は呼び出し側 catch が担う、という責務分担を step 4b と ADR-004 に明記。

**収束状況**:
- 要件カバレッジ視点: 問題点ゼロ。
- アーキ・リスク視点: P-001 を反映済み（残りは補足レベル）。

### 3周目
2周目で要件視点は問題点ゼロ、アーキ視点の唯一の要修正 P-001 を反映済みのため、レビューループを終了する（残課題なし）。
