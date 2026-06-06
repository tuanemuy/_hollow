# ADR 011: パスワードハッシュを Argon2id (hash-wasm) に移行する

## ステータス

承認済み（2026-05-24） — **ADR-005 の判断は誤り**。一部 [ADR 012](./012-scrypt-migration.md) で訂正・上書き。

## コンテキスト

[spec/domains/identity.md](../domains/identity.md) の当初仕様は `PasswordHash` を Argon2id と定義していたが、Cloudflare Workers ランタイムには Argon2id ネイティブバインディングがなく、初期実装では暫定的に Web Crypto の **PBKDF2-HMAC-SHA256** を採用していた。Workers の PBKDF2 反復回数には実装上限があり (`crypto-impl.cc` で iter ≤ 100,000 が安全圏)、OWASP 2025 推奨の 600,000 を実行できる保証がない環境では、メモリハード関数への移行が望ましい。

2 つのハッシュサイトが存在する:

- **admin password** (`D1CredentialStore`): `accounts.password` カラム。`pbkdf2-sha256-v1$<iter>$<saltB64>$<hashB64>` 形式
- **share-link password** (`Argon2idPasswordHasher`): クラス名は当初想定の Argon2id だが、中身は PBKDF2。`$pbkdf2-sha256$i=<iter>$<saltB64>$<hashB64>` 形式

両者は独立に PBKDF2 を実装しており、フォーマットも異なる。

## 決定

### ライブラリ選定 (ADR-001)

`hash-wasm@^4.12.0` を採用する。

検討した代替候補:

- **`hash-wasm`** (採用): 純粋 WebAssembly、base64 埋め込みで `[wasm_modules]` 宣言不要、PHC encoded format に直接対応、Workers での実績多数、MIT、依存ゼロ
- **`@noble/hashes`**: Argon2 未実装。却下
- **`argon2-browser`**: emscripten 由来でメンテ停止気味、Workers 動作報告少。却下
- **`@phc/argon2`**: ピュア JS。Workers の CPU 上限内で OWASP 推奨パラメータを満たすのは現実的でない。却下
- **`argon2-wasm-edge` 等**: 個人実装が多くサプライチェーンリスクが高い。却下
- **自前実装**: 暗号実装の自前化は禁忌。却下

### 共通モジュール抽出 (ADR-002)

新規 Argon2id ハッシュは共通モジュール `app/core/adapters/security/argon2id.ts` 経由で生成し、両 adapter から共有する。一方で legacy PBKDF2 verify ロジックは各 adapter 内に温存する (2 つの PBKDF2 encoded フォーマットが微妙に異なるため、強引な共通化はバグの温床)。

全 legacy hash が Argon2id に置換されたら legacy verify を一掃する別 Issue を立てる。

### lazy upgrade (ADR-003)

> **訂正 (Issue #456)**: 本節の「`verifyPassword` で verify 成功直後に同 UoW へ rehash を積む」「`pending` ユーザでも lazy upgrade が発火するのを許容する」という記述は改めた。
> `verifyPassword`（サインイン経路）は status 未確定の段階で rehash を走らせないよう rehash-free 化し、`needsRehash` ヒントを返すだけにした。`logIn` は status が active と確定した**後にのみ** `rehashLegacyPassword` を別 UoW で呼ぶ。
> 結果として **pending / suspended / deleted ユーザでは rehash しない**（拒否されるユーザに無駄な scrypt 演算を走らせない）。`verifyPasswordForUser`（再認証経路）は active 前提のため inline lazy upgrade を維持する。

- **admin password**: lazy upgrade を実装する。`D1CredentialStore.verifyPassword` / `verifyPasswordForUser` で verify 成功 + legacy prefix のとき、`pending.add` で `accounts.password` の update を同 UoW に積む。`accounts` は OCC 対象外 ([spec/database/index.md](../database/index.md)) のため version bump 不要
- **share-link password**: lazy upgrade を実装しない。short-lived リソースで再発行コストが低く、`PublicationService.verifyShareLinkAccess` のシグネチャを汚すコストに見合わない

~~副作用として、`users.status === 'pending'` の email-未認証ユーザが credentialStore.verifyPassword を呼ぶと lazy upgrade が発火し、直後 application 層 (logIn) で `AuthenticationError('unverified')` 拒否となる挙動になる。セキュリティ実害はない (hash は正しく upgrade される / セッションは発行されない) ため許容する。~~ — Issue #456 で訂正（上記参照）。pending / suspended / deleted では rehash を発火させない形へ改めた。

lazy upgrade 導入に伴い、`D1CredentialStore` の verify 系メソッドも UoW 内呼び出し前提として契約を締め直した。実呼び出し (`logIn`, `changePassword` 等) はすべて UoW 内のため破壊的変更ではない。

### vitest-pool-workers の WASM compile 制約 (ADR-005) — **訂正済み**

> **訂正 (2026-05-24, Issue #211)**: 本節の前提「production は WASM compile を許可する」は誤り。
> Cloudflare Workers は **production を含む全環境で** `WebAssembly.compile(<bytes>)` を
> "dynamic WebAssembly compilation from arbitrary buffers" として拒否する。staging デプロイ後の
> サインアップが `WasmUnavailableError → PBKDF2 fallback (iter=600,000)` の二段で失敗していたことが
> 実証している（CF Workers の Web Crypto PBKDF2 iter 上限 100,000 で fallback も死ぬ）。
>
> 結果として `hash-wasm` 経由の Argon2id 採用は本番で機能していなかった。
> 後継方針は [ADR 012](./012-scrypt-migration.md) を参照。

(以下は当時の判断記録)

`hash-wasm` は `WebAssembly.compile()` を最初の呼び出し時に動的実行する。Cloudflare Workers の production は許可するが、`@cloudflare/vitest-pool-workers` の workerd は `disallow-code-generation-from-strings` を WebAssembly にも拡張しており、`CompileError: Wasm code generation disallowed by embedder` を投げる。test pool に WASM コンパイルを許可する公開オプションは存在しない (miniflare v4 / vitest-pool-workers v0.16.4 時点)。

対応として `app/core/adapters/security/argon2id.ts` に `WasmUnavailableError` を定義し、両 adapter の hash 経路で「WASM 失敗時は PBKDF2-HMAC-SHA256 (iter=600,000) にフォールバック」する。production は常に WASM が許可されるため fallback は発火せず Argon2id のままで運用される。

統合テスト側では lazy upgrade テストを `WebAssembly.compile()` の事前 probe で skip し、その代替担保を staging smoke (デプロイ後の `$argon2id$` prefix 確認 + iter=100,000 / 600,000 既存ユーザでの logIn) に置く。

### パラメータ (ADR-004)

OWASP Password Storage Cheat Sheet (2024) Argon2id 第一推奨プロファイルを固定値で採用する:

- `memorySize = 19456` (19 MiB)
- `iterations = 2`
- `parallelism = 1`
- `hashLength = 32`
- `saltLength = 16`

encoded format にパラメータが記録されるため、将来の調整は後方互換のまま可能。

## 結果

- `app/core/adapters/security/argon2id.ts` を新設し、`hashArgon2id` / `verifyArgon2id` / `isArgon2idEncoded` を共通 export
- `Argon2idPasswordHasher` (share-link) は名前を維持したまま実装を Argon2id に差し替え。legacy PBKDF2 verify は同ファイル内 private helper として保持
- `D1CredentialStore` (admin) も Argon2id に差し替え、verify 成功 + legacy prefix で同 UoW に rehash update を積む lazy upgrade を実装
- DI 配線 (`serverCloudflare.ts`) はクラス名温存により差分ゼロ
- 単体テスト: `app/core/adapters/security/__tests__/argon2id.test.ts` / `passwordHasher.test.ts` で hash/verify round-trip と legacy 互換を担保
- 統合テスト: `identity.integration.test.ts` に lazy upgrade テスト (iter=100,000 と iter=600,000 の両ケース) を追加
- bundle size: staging dry-run で Total Upload 4.5 MiB raw / 0.95 MiB gzip — Workers 10 MiB 上限内
- staging deploy 後の cold start / lazy upgrade 検証は別タスク (本 ADR スコープ外)
- legacy PBKDF2 verify ロジックは恒久保持。剥がす時期は別 Issue で判断する
