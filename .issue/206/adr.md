# ADR — Issue #206: Argon2id (WASM) への移行

## ADR-001: Argon2id ライブラリは `hash-wasm` を採用

### Status
Proposed

### Context

Cloudflare Workers ランタイムには Argon2id ネイティブバインディングがない。WASM ベースで Workers 互換の Argon2id 実装を選定する必要がある。検討した候補:

- **`hash-wasm`** (採用): 純粋 WebAssembly、base64 埋め込みで `[wasm_modules]` 宣言不要、PHC encoded format に直接対応、Workers での実績多数、MIT、依存ゼロ、ESM/UMD 両対応、~250 万 weekly DL
- **`@noble/hashes`**: Argon2 未実装（SHA / HKDF / Scrypt のみ）。却下
- **`argon2-browser`**: emscripten 由来でメンテ停止気味、Workers 動作報告少。却下
- **`@phc/argon2`**: ピュア JS 実装で WASM 不要だがメモリハード関数を JS で回すため低速かつメモリ非効率。Workers の CPU 上限内で OWASP 推奨パラメータを満たすのは現実的でない。却下
- **`argon2-wasm-edge` 等 Workers 派生**: 個人実装が多くメンテ・サプライチェーンリスクが `hash-wasm` より高い。却下
- **自前実装**: Argon2id を TypeScript で実装するのは現実的でない（暗号実装の自前化は禁忌）。却下

### Decision

`hash-wasm@^4.12.0` を採用する。`argon2id()` の `outputType: 'encoded'` で PHC 文字列 (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`) を直接得て、`argon2Verify({password, hash})` で復元せず検証する。

### Consequences

- 良い点:
  - Workers 互換が実証されている
  - PHC encoded format がそのまま使えるので自前でフォーマット定義する必要がない
  - timing-safe compare がライブラリ内で完結
  - 依存ゼロでサプライチェーンリスクが小さい
- トレードオフ:
  - WASM コンパイル分の bundle size 増 (full ESM で gzip 後 +211 KB が最悪ケース、tree-shake が効けば +11 KB 程度) — 受け入れ基準: bundle 全体 5 MiB 未満
  - cold start 時に WASM compile が走る (~100ms 想定) — 受け入れ基準: logIn cold start +500ms 以内
  - **WASM warm-up は実装しない**: 初回 cold start で +100ms 程度の遅延を許容する。admin signup / logIn の頻度は低く、warm-up を仕込むコストに見合わない。staging で +500ms を超えた場合は warm-up 戦略を別 Issue として起票する

---

## ADR-002: 共通モジュール `security/argon2id.ts` に集約、legacy verify は各 adapter 内に残す

### Status
Proposed

### Context

admin password (`D1CredentialStore`) と share-link password (`Argon2idPasswordHasher`) は現状それぞれ独自に PBKDF2 を実装している。Argon2id 移行のタイミングで両者を共通化するか、それぞれ独立に修正するかを決める必要がある。

さらに、現状の 2 つの PBKDF2 encoded フォーマットは微妙に異なる:

- admin: `pbkdf2-sha256-v1$<iter>$<salt-b64>$<hash-b64>`（先頭 `$` なし、version 文字列）
- share-link: `$pbkdf2-sha256$i=<iter>$<salt-b64>$<hash-b64>`（先頭 `$` あり、PHC 風 `i=` 記法）

### Decision

- **新規 Argon2id ハッシュは共通モジュール `app/core/adapters/security/argon2id.ts` 経由** で生成する（同一の PHC 形式）
- **legacy PBKDF2 verify ロジックは各 adapter 内に残す**（フォーマットが異なるため、強引な共通化はバグの温床）

### Consequences

- 良い点:
  - 新規 hash は 1 箇所でメンテすればよい (将来のパラメータ調整も 1 箇所)
  - 既存 PBKDF2 encoded は触らず、verify 互換のみ維持するので回帰リスクが小さい
- トレードオフ:
  - 2 つの adapter にそれぞれ legacy verify が残る (一時的な複雑性)
  - 全 legacy hash が Argon2id に置換されたら legacy verify を一掃する別 Issue が必要

---

## ADR-003: admin password で lazy upgrade を実装、share-link では実装しない

### Status
Proposed

### Context

verify 成功時に legacy prefix を検出したら同 UoW で新ハッシュに書き戻す lazy upgrade は、運用負荷ゼロで非アクティブを除く全ユーザを段階的に Argon2id に置き換えられる。各 adapter について実装可否を判断:

- **admin password**: ログイン頻度が高く、port 契約を変えず adapter 内で完結できる (`pending.add` で UoW に乗る)
- **share-link password**: ログイン頻度が低い (短命リソース)。`PublicationService.verifyShareLinkAccess` のシグネチャを `needsRehash` で汚す、または adapter 内で domain service を介さず DB に直接書く設計を取る必要がある

### Decision

- **admin password**: lazy upgrade を実装する。`D1CredentialStore.verifyPassword` / `verifyPasswordForUser` で verify 成功 + legacy prefix のとき、`pending.add` で `accounts.password` の update を同 UoW に積む
- **share-link password**: lazy upgrade を実装しない。share-link は password 再設定・revoke・再発行が owner の明示アクションで起きるリソースで、ログイン頻度が桁違いに少ない。port のシグネチャを汚すコストに見合わない

### Consequences

- 良い点:
  - admin の弱い hash が日常運用で自動消滅
  - share-link 側は port 契約・domain service 不変で副作用なし
- トレードオフ:
  - share-link の旧 hash は永続的に残る (ただし short-lived なので実害なし)
  - lazy upgrade テストで E2E カバレッジが少し増える
  - **status NG ユーザの lazy upgrade 発火**: `users.status === 'pending'` の email-未認証ユーザは `credentialStore.verifyPassword` 自体は通る → lazy upgrade が発火 → 直後 application 層 (logIn) で `AuthenticationError('unverified')` 拒否、というシーケンスになる。セキュリティ実害はない（hash は正しく upgrade される / セッションは発行されない）ため、この挙動を許容する。「verify 成功 ≒ パスワードを知っている」が rehash の前提なので、status は関係なく upgrade して問題ない
  - **`D1CredentialStore` クラスコメントの契約改訂**: 現状コメントは `verifyPassword` / `verifyPasswordForUser` を「UoW 外でも動く」と定義しているが、lazy upgrade 導入に伴い「verify 系も UoW 内前提」に締め直す。実呼び出し (logIn, changePassword 等) はすべて UoW 内のため破壊的変更ではない

---

## ADR-004: Argon2id パラメータは OWASP 第一推奨を固定値で採用

### Status
Proposed

### Context

OWASP Password Storage Cheat Sheet (2024) は Argon2id に対して複数のパラメータプロファイルを推奨している。Workers の CPU / メモリ制約と運用フレキシビリティのトレードオフから固定値を選ぶ。Issue 本文には「m=19MiB, t=2, p=1 程度から計測して決定」とあるが、本プロジェクトは Workers Paid プラン前提 (CPU 30s) で 50–150ms の上限見積もりは余裕で収まるため、initial value で確定し、再調整は別 Issue とする。

### Decision

- `memorySize = 19456` (19 MiB)
- `iterations = 2`
- `parallelism = 1`
- `hashLength = 32`
- `saltLength = 16`

これは OWASP 第一推奨プロファイル。encoded format にパラメータが記録されるので将来の調整は後方互換のまま可能。

### Consequences

- 良い点:
  - 業界標準に沿うので監査面で説明しやすい
  - encoded format 経由で将来のパラメータ調整が破壊的変更にならない
- トレードオフ:
  - Workers Paid プランの 30s CPU 上限なら余裕だが、Free 10ms では超過リスク (本プロジェクトは Paid 前提)
  - メモリ 19 MiB はリクエストあたり一時アロケート (128 MiB heap 内で十分)

---

## ADR-005: `vitest-pool-workers` の WebAssembly compile 制約への対応として PBKDF2 ランタイムフォールバックを導入

### Status
Accepted (実装中追加)

### Context

`hash-wasm` は `WebAssembly.compile(<base64 decoded module>)` を最初の hash/verify 呼び出し時に lazy に実行する。Cloudflare Workers の **production runtime** はこの動的 WASM コンパイルを許可しているが、`@cloudflare/vitest-pool-workers` が起動する **workerd 内 V8** は `disallow-code-generation-from-strings` を WebAssembly にも拡張する設定で動作しており、`WebAssembly.compile()` は `CompileError: Wasm code generation disallowed by embedder` を投げる。

これにより、`hash-wasm` を adapter 層から直接呼び出すと既存の identity integration test (signUp / adminSignUp / logIn / changePassword / resetPassword …) がすべて失敗する。本 Issue で新規に追加する lazy upgrade 統合テストも当然走らない。

`vitest-pool-workers` (v0.16.4) / `miniflare` (v4.x) には WASM コンパイルを許可する公開オプションがなく、`v8Flags` 経由でも該当 V8 フラグはユーザに公開されていない。`wasm_modules` バインディング経由で事前コンパイル WASM モジュールを注入することは可能だが、`hash-wasm` の公開 API は base64 埋め込みからの動的コンパイル前提で、事前 `WebAssembly.Module` の供給口を持たない。

### Decision

`app/core/adapters/security/argon2id.ts` に `WasmUnavailableError` を定義し、`hashArgon2id` / `verifyArgon2id` がこの特定の `CompileError` を検出した場合に `WasmUnavailableError` でラップして再 throw する。

`Argon2idPasswordHasher.hash` および `D1CredentialStore.hashPassword` はこの error を catch して PBKDF2-HMAC-SHA256 (iter=600,000) に **runtime fallback** する。verify 側は Argon2id encoded が来た場合に WASM 失敗で false (auth fail) に倒す。

加えて `identity.integration.test.ts` の lazy upgrade テストは、テスト本体冒頭で空 WASM モジュールのコンパイルを試行し、失敗時は `ctx.skip()` でスキップする。本テストは production / staging smoke (ステップ 11) で担保する。

### Consequences

- 良い点:
  - 既存 422 件の identity / その他 integration test がすべて維持される
  - production Workers では常に WASM が許可されるため、fallback 経路は本番では発火しない (= production の挙動は ADR-001/002/003/004 の通り Argon2id のまま)
  - test 環境では PBKDF2 で hash が生成されるが、verify 経路は Argon2id + PBKDF2 両対応なので round-trip は機能する
- トレードオフ:
  - test 環境と production 環境で hash アルゴリズムが異なるため、integration test は「Argon2id 化されている」ことを直接アサートできない (lazy upgrade テストの skip 含む)
  - 将来 `vitest-pool-workers` が動的 WASM compile を許可した場合、本フォールバックは不要になる (剥がす別 Issue を立てる)
  - `WasmUnavailableError` を共通モジュールで export し、各 adapter が個別に fallback を持つ構造は若干冗長 (将来統一可能性あり)
  - lazy upgrade 統合テストが test pool でスキップされるため、上線回帰の検出は staging smoke 依存
- 検証戦略:
  - 単体テスト (`pnpm test:unit`) は node 環境で動作するので Argon2id round-trip / encoded format / legacy PBKDF2 互換を完全に検証する
  - 統合テスト (`pnpm test:integration`) は fallback 経路で動作するので、port 契約 (hash 後に verify が true、wrong pass で false) を検証する
  - staging smoke (ステップ 11) で「`$argon2id$` prefix の hash が DB に書かれること」「iter=100,000 / 600,000 legacy ユーザの lazy upgrade」を実環境で検証する
