# 実装計画 — Issue #206: Argon2id (WASM) への移行: PBKDF2 を置き換えてパスワードハッシュを強化

**Issue:** #206
**作成日:** 2026-05-24
**複雑度:** 中〜大規模

---

## 目的

Cloudflare Workers の PBKDF2 iter 上限 (100,000) 制約により OWASP 推奨を満たせない現状を、メモリハード関数 **Argon2id (`hash-wasm`)** への移行で本格的に解決する。spec/domains/identity.md の "`PasswordHash` は Argon2id" という当初仕様にようやく実装を一致させる。

## スコープ

### 含まれるもの

- `hash-wasm` を依存に追加し、Argon2id を adapter 層に導入
- admin password (`D1CredentialStore`) と share-link password (`Argon2idPasswordHasher`) の両方で:
  - **新規 hash** を Argon2id でエンコード（PHC `$argon2id$v=19$m=19456,t=2,p=1$salt$hash` 形式）
  - **verify** は新 prefix `$argon2id$` と既存 legacy prefix (`pbkdf2-sha256-v1$...`, `$pbkdf2-sha256$...`) の両方を判定（後方互換）
- admin password 側で **lazy upgrade** を実装（verify 成功 + legacy prefix → 同 UoW で Argon2id に書き戻し）
- OWASP 推奨パラメータの採用 (m=19MiB, t=2, p=1, hashLength=32, saltLength=16)
- ユニットテスト・統合テストの追加・更新
- staging deploy で bundle size と admin signup / legacy verify / share-link round-trip を確認

### 含まれないもの

- 既存 PBKDF2 ハッシュの一括再ハッシュ（lazy upgrade で十分、非ゴール明記）
- KDF パラメータの動的ネゴシエーション（固定値 + encoded format で運用、非ゴール明記）
- share-link 側の lazy upgrade（短命リソース・ログイン頻度低のため対費用効果が薄い — ADR 参照）
- `Argon2idPasswordHasher` クラスのリネーム（中身が Argon2id になれば名前と一致する）
- better-auth への切替（別 Issue 範疇）

## 実装ステップ

### 1. `hash-wasm` を依存に追加

- **対象ファイル:** `package.json`
- **変更内容:** `dependencies` に `"hash-wasm": "^4.12.0"` を追加し `pnpm install`。
- **理由:** Argon2id 実装の供給元。Workers 互換、追加依存ゼロ、PHC encoded 出力対応。

### 2. 共通 Argon2id ヘルパーモジュールを新設

- **対象ファイル:** `app/core/adapters/security/argon2id.ts`（新規）
- **変更内容:** stateless な以下を export:
  - `hashArgon2id(raw: string): Promise<string>` — `argon2id({outputType:'encoded', parallelism:1, iterations:2, memorySize:19456, hashLength:32, salt: 16-byte random})`
  - `verifyArgon2id(raw: string, encoded: string): Promise<boolean>` — `argon2Verify({password, hash})`
  - `isArgon2idEncoded(s: string): boolean` — `s.startsWith("$argon2id$")`
  - OWASP m=19MiB / t=2 / p=1 は constant に寄せ、JSDoc で出典明記
- **理由:** 2 つの adapter（admin password / share-link password）が独自実装する現状（PBKDF2 二重実装）の轍を踏まない。adapter 層内の internal モジュールとして共有し、ラッパーで薄く包む。

### 3. share-link 用 `Argon2idPasswordHasher` を中身ごと Argon2id 化

- **対象ファイル:** `app/core/adapters/security/passwordHasher.ts`
- **変更内容:**
  - クラス名は維持（DI 配線・テスト名を温存）
  - **事前確認**: `grep -rn "new Argon2idPasswordHasher" app` で全呼び出しが no-args であることを確認 — DI 配線 (`serverCloudflare.ts:555`) と 2 つのテストヘルパ (`d1/__tests__/helpers.ts:112`, `application/__tests__/helpers.ts:119`) はすべて引数なし呼び出し。constructor の `iterations` / `subtle` 引数は削除して破壊的変更なし
  - **TDD 順序**: 先に既存 PBKDF2 形式の fixture（現行 `Argon2idPasswordHasher#hash` で生成した encoded を test fixture として固定）に対する verify テストを追加 → green 確認 → その後 Argon2id 化（**回帰検出を最初に固める**）
  - `hash()` は `hashArgon2id(raw)` に委譲
  - `verify()` は分岐:
    - `isArgon2idEncoded(hash)` → `verifyArgon2id`
    - `hash.startsWith("$pbkdf2-sha256$")` → **legacy PBKDF2 verify**（既存ロジックを `legacyVerifyPbkdf2Sha256` として private に切り出して残す）
    - それ以外 → `false`
  - ファイル冒頭のコメントを差し替え（「Argon2id (hash-wasm) を採用。PBKDF2 verify は legacy 互換のためだけに残す」）
- **理由:** port 契約は不変、中身のみ差し替え。クラス名がやっと実態と一致する。

### 4. D1CredentialStore を Argon2id 化 + lazy upgrade

- **対象ファイル:** `app/core/adapters/d1/repositories/credentialStore.ts`
- **変更内容:**
  - **TDD 順序**: 先に既存 PBKDF2 形式の fixture（現行 `hashPassword` で生成した encoded を `iter=100,000` と `iter=600,000` の両方で固定）に対する `verifyHash` テストを追加 → green 確認 → その後 verify 分岐を改修
  - `hashPassword` を `hashArgon2id` ラッパーに置換
  - `verifyHash` を分岐:
    - Argon2id prefix → `verifyArgon2id`
    - `pbkdf2-sha256-v1$...` → 現行 PBKDF2 verify を private 関数として温存（share-link 側とフォーマットが異なるので併合せず両形式の verify を保持）
    - それ以外 → `false`
  - `verifyPassword(email, raw)` / `verifyPasswordForUser(userId, raw)`: verify 成功時、`row.password` が legacy prefix なら同じ UoW の `pending` に `db.update(accounts).set({password: <新Argon2idハッシュ>, updatedAt: now})` を積む（lazy upgrade）
  - lazy upgrade ロジックは `private async maybeRehashLegacy(userId, raw, currentEncoded): Promise<void>` ヘルパに集約
  - **クラスコメントの契約更新**: 現状コメント (行 122-152) は `verifyPassword` / `verifyPasswordForUser` を "Reads outside a UoW. They participate in no transaction." と定義しているが、lazy upgrade 実装に伴い「verify 系も UoW 内で呼ばれることを前提とする」契約に締め直す。コメントを更新し、`accounts` は OCC 対象外（`spec/database/index.md` 参照）のため `pending.add(update)` で十分であることを明記する
- **理由:** 元コメント `// future: replace PBKDF2 with Argon2id` をついに解消。lazy upgrade は port 契約を変えずに adapter 内で完結（domain・application 無変更）。`pending.add` 経由なので既存 UoW 規約に乗る。実呼び出しは現状全て UoW 内なので契約改訂は破壊的変更なし。

### 5. DI 配線確認

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:** `passwordHasher: new Argon2idPasswordHasher()` のまま。何も変えない。
- **理由:** クラス名温存により DI 差分ゼロ。

### 6. share-link 単体テスト追加

- **対象ファイル:** `app/core/adapters/security/__tests__/passwordHasher.test.ts`（新規）, `app/core/adapters/security/__tests__/argon2id.test.ts`（新規）
- **変更内容:**
  - `hash()` の戻り値が `$argon2id$v=19$m=...,t=...,p=...$...` 形式であることをアサート
  - round-trip: `hash → verify(raw, hash) === true`、`verify(wrong, hash) === false`
  - **legacy 互換**: 事前に PBKDF2-HMAC-SHA256 で生成した既知の encoded 文字列（軽量パラメータの fixture）を verify できる
  - 不正入力（空文字、prefix なし、base64 壊れ）で `false` を返し throw しない（port 契約）
- **理由:** ports の契約および legacy 互換の回帰を担保。WASM 初期化コストがあるので `it.concurrent` は避ける。

### 7. admin password 統合テストに lazy upgrade ケース追加

- **対象ファイル:** `app/core/application/identity/__tests__/identity.integration.test.ts`
- **変更内容:** 既存の signUp → logIn パスは「実 Argon2id が走る」ので自動でカバーされる。加えて以下の lazy upgrade テストを追加:
  1. `accounts.password` を直接 PBKDF2 形式 (iter=100,000 と iter=600,000 両方の fixture でケース分け) の既知文字列に書き換え
  2. logIn を実行 → 成功
  3. `accounts.password` を select して prefix が `$argon2id$` に変わっていることを確認
  4. **同じユーザで logIn をもう一度実行** → 2 回目も成功し、今度は Argon2id verify が走ること（上書きされた hash の round-trip）
- **理由:** lazy upgrade が UoW で commit されること、および書き換え後の hash で継続して認証できることを E2E で担保。

### 8. share-link round-trip テストの確認

- **対象ファイル:** 既存 `service.test.ts` および adapter テスト
- **変更内容:** `service.test.ts` は port 契約に従う fake hasher を使うので無変更で通るはず。新規追加した passwordHasher.test.ts で round-trip カバー。
- **理由:** 契約変更なし、回帰のみ確認。

### 9. ドキュメント更新

- **対象ファイル:** `.issue/206/adr.md` に Argon2id 採用と関連判断を記録（既に作成済み、実装中に補強）。加えて **`spec/adr/011-argon2id-migration.md`** を新規作成し、長期的判断を spec/ 配下に永続化する（既存の 007/008/009/010 と同レベル感）。後続開発者が「なぜ PBKDF2 verify ロジックが残っているか」を辿る経路となる。
- **理由:** 暗号アルゴリズム選定・lazy upgrade 採用・share-link lazy upgrade 不採用の判断を記録。`.issue/` 配下だけだと探索性が弱い。

### 10. bundle size 早期検証

- **対象:** `package.json` の build スクリプト
- **変更内容:** ステップ 1 (`hash-wasm` 追加) 直後、本格実装前に `pnpm build` を走らせて出力 bundle size の差分を計測。受け入れ基準: **Cloudflare Workers Paid プランの 10 MiB 上限に対して bundle 全体が 5 MiB 未満**（hash-wasm 追加分を含めても余裕がある状態）。閾値を超えた場合は ADR-001 を再検討し、`hash-wasm` の subpath import やスタンドアロン UMD 版への切替を試みる。
- **理由:** 設計判断 (ADR-001) を初期に validate し、実装完了後に bundle 超過で別ライブラリへの差し戻しが発生するリスクを潰す。

### 11. staging deploy & smoke test

- **対象:** `wrangler.staging.toml`
- **変更内容:**
  - `pnpm deploy:staging:dry` の出力で Total Upload (gzip 後) を確認 → ステップ 10 の合格基準を満たしているか再確認
  - `pnpm deploy:staging` で staging に反映
  - smoke test を以下の順に実行:
    1. **新 admin signup** → 成功 + DB の `accounts.password` が `$argon2id$` で始まる
    2. **iter=100,000 / iter=600,000 既存 PBKDF2 ユーザで logIn** → 成功 + DB の `accounts.password` が `$argon2id$` に upgrade されていること（lazy upgrade）
    3. **既存 PBKDF2 share-link を resolve** → password verify が引き続き成功する（share-link は upgrade されない設計判断 ADR-003）
    4. **新規 share-link 発行** → DB に保存される hash が `$argon2id$` で始まる
  - **cold start 計測**: `wrangler tail` で最初のリクエストのレスポンスタイムを採取 → 受け入れ基準: **logIn の cold start が +500ms 以内**（WASM compile + Argon2id 1 回の合計）。超過時は ADR-001 の Consequences に追記して許容判断するか、warm-up 戦略を別 Issue として起票する
- **理由:** ゴール最終項目。WASM ロードが本物の edge で動くこと、cold start が許容範囲であることを定量的に確認。staging 環境は Paid プラン前提（Free 10ms CPU 上限では Argon2id m=19MiB は実行不能なため）。

## 設計判断

詳細は `.issue/206/adr.md` 参照。要点:

- **共通モジュール抽出 vs 各 adapter 内独立実装**: 共通 (`security/argon2id.ts`) に抽出。新規 hash は同一形式、legacy verify は各 adapter 内に残す（フォーマットが異なるため）
- **Argon2id パラメータ**: OWASP 第一推奨の m=19MiB, t=2, p=1, hashLength=32, saltLength=16 を固定値で採用
- **admin password の lazy upgrade**: 実装する（運用負荷ゼロで段階的に Argon2id に置換）
- **share-link password の lazy upgrade**: 実装しない（短命リソース・ログイン頻度低、port シグネチャ変更コストに見合わない）
- **PBKDF2 verify の保持期間**: 当面恒久保持。剥がす時期は別 Issue で判断
- **ライブラリ**: `hash-wasm` 採用（`@noble/hashes` は Argon2 未実装、`argon2-browser` はメンテ停止気味）
- **クラス名 `Argon2idPasswordHasher`**: 維持（中身が Argon2id になれば名前と一致）

## リスクと注意点

- **bundle size**: full ESM import の場合 +211 KB gzip。ステップ 10 で本格実装前に早期検証（受け入れ基準: bundle 全体 5 MiB 未満）。閾値超過時は subpath import / UMD 版を試行
- **cold start**: WASM compile は初回呼び出し時に 1 回。最悪 +100ms 程度の cold start 上乗せ。ステップ 11 で `wrangler tail` で実測（受け入れ基準: +500ms 以内）
- **CPU 時間**: Argon2id m=19MiB, t=2 は単一実行で 50〜150 ms。**staging は Paid プラン前提**（Free 10ms CPU では実行不能）。Paid プランの 30s 上限なら無問題
- **メモリ**: m=19MiB は WASM linear memory の一時アロケート。Workers の 128 MiB heap 内で十分
- **legacy verify バグ混入**: PBKDF2 verify ロジックを切り出すリファクタで取りこぼすと既存ユーザがログイン不能になる。ステップ 3 / 4 で **TDD 順序を強制**: 先に PBKDF2 fixture（iter=100,000 と iter=600,000）verify テストを書き green を確認 → その後 verify 分岐を改修
- **integration test の所要時間**: vitest pool が Workers ランタイムなので Argon2id 実演算が走る。default 5s timeout で十分だが CI の slowest test に追加されるので最初の数回 monitor
- **status NG ユーザの lazy upgrade 発火**: `users.status === 'pending'` の email-未認証ユーザは `credentialStore.verifyPassword` の verify は通る → lazy upgrade が発火 → 直後 application 層 (logIn) で `AuthenticationError('unverified')` 拒否、という挙動になる。セキュリティ上の実害は無いが（hash 自体は正しく upgrade される）、設計上の意図として ADR-003 に許容判断を明記する
- **PBKDF2 fixture の生成**: staging DB 上の本物のハッシュは PR 単体テストには使えない。fixture は **現行の `hashPassword` / `Argon2idPasswordHasher#hash` を呼んで生成**して固定する。これで verify 互換性は保証できるが、staging 上の既存ユーザの互換性確認はステップ 11 の smoke test に依存

## テスト方針

- **ユニット (`pnpm test:unit`)**:
  - `app/core/adapters/security/__tests__/passwordHasher.test.ts`: prefix / round-trip / legacy PBKDF2 verify / 不正入力 false
  - `app/core/adapters/security/__tests__/argon2id.test.ts`: 共通モジュールの hash/verify round-trip と encoded format
  - 既存 `service.test.ts` は無変更で通る確認
- **統合 (`pnpm test:integration`)**:
  - `identity.integration.test.ts` に lazy upgrade テスト 1 件追加
  - 既存 adminSignUp / logIn / changePassword / resetPassword は実 Argon2id で回帰確認
- **手動 / staging 確認**:
  - bundle size の dry-run 確認（受け入れ基準: bundle 全体 5 MiB 未満）
  - staging deploy 後: admin signup → `$argon2id$` 始まり / iter=100,000 と iter=600,000 既存 PBKDF2 で logIn → upgrade / share-link round-trip / cold start レイテンシ採取（受け入れ基準: +500ms 以内）

## レビュー履歴

### 2周目
両視点とも問題点ゼロで終了。

### 1周目
**修正した点**:
- [P-001 要件]: PBKDF2 fixture を iter=100,000 / iter=600,000 両方ケースで固定する旨をステップ 4・7・11 に明示
- [P-002 要件]: bundle size / cold start の受け入れ基準を具体化（bundle 全体 5 MiB 未満、cold start +500ms 以内、staging は Paid 前提）。ステップ 10（早期検証）を新設してステップ 11 (staging) を切り分け
- [P-003 要件]: ステップ 3 に「`grep -rn "new Argon2idPasswordHasher" app` で全呼び出しが no-args であることを事前確認」を明記。callers は 3 箇所すべて引数なし呼び出しで破壊的変更なし
- [P-001 アーキ]: ステップ 4 にクラスコメントの契約改訂（"Reads outside a UoW" → "verify 系も UoW 内前提"）を追加。logIn.ts 等の実呼び出しはすべて UoW 内のため破壊的変更なし
- [P-002 アーキ]: status NG ユーザの lazy upgrade 発火についてリスク欄と ADR-003 Consequences に許容判断を明記

**取り込んだ改善提案**:
- [S-001 要件]: ADR-004 に固定値採用の理由を追記
- [S-002 要件]: ステップ 7 に「lazy upgrade 後の hash で 2 回目 logIn が成功すること」を追加
- [S-003 要件]: ステップ 9 で `spec/adr/011-argon2id-migration.md` の新規作成を明示
- [S-004 要件]: ステップ 3・4 の TDD 順序をサブステップ化
- [S-001 アーキ]: ステップ 10 として bundle size 早期検証を新設
- [S-002 アーキ]: ADR-001 Consequences に WASM warm-up の判断を追記（warm-up は実装せず cold start を許容、超過時は別 Issue で warm-up 戦略）
- [S-003 アーキ]: fixture 生成手順をリスク欄に明記（現行 hashPassword を呼んで固定）
- [S-004 アーキ]: ステップ 4 に accounts は OCC 対象外の旨を補足
- [S-005 アーキ]: ステップ 9 で spec/adr/011 への昇格を明示
- [S-006 アーキ]: ADR-001 に検討した代替候補（`@noble/hashes`, `argon2-browser`, `@phc/argon2`, 自前実装）と却下理由を網羅
