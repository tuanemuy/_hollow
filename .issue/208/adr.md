# ADR — Issue #208: changePassword の二重 hash 解消

## ADR-001: adapter `changePassword` を「rehash なし verify + AuthenticationError 直 throw」に変更し、usecase の pre-verify を廃止

### Status
Proposed

### Context
`changePassword` 1 リクエストで scrypt 演算が複数回走っていた:
- usecase `changePassword.ts` が UoW#1 で `verifyPasswordForUser`（成功時 `maybeRehashLegacy` が legacy→scrypt rehash を pending に積む）。
- usecase が UoW#2 で adapter `changePassword` を呼び、その内部でも `verifyPasswordForUser` が走り（また rehash）、最後に `hashScrypt(newRaw)` で新パスワードを書く。

legacy アカウントでは現パスワードの rehash が「直後に新パスワードで上書きされる」のに走り、非 legacy でも verify が 2 回走る。

選択肢:
- 案A: usecase の pre-verify を廃止し adapter `changePassword`（verify+write を 1 UoW で完結）に一本化。
- 案B: adapter `changePassword` 内の verify を rehash 副作用なしの private helper に差し替え。
- 案C: `maybeRehashLegacy` / verify に「直後に上書きするので skip」フラグ引数を渡す。

決め手となる事実:
- adapter `changePassword` は mismatch 時に `BusinessRuleError('invalid_credentials')` を throw している。これは presentation で `kind:"business"` → **HTTP 422** にマップされ（`app/core/presentation/errorResponse.ts`: `business: 422` / `unauthorized: 401`）、401 にならない。
- 一方 port JSDoc（`app/core/domain/identity/ports/credentialStore.ts`）は契約として「changePassword mismatch → `AuthenticationError('invalid_credentials')`（application layer）」を約束している。
- つまり現状の adapter `BusinessRuleError` 経路は契約違反であり、usecase の pre-verify が常に先に弾くため**到達不能なデッドコード**。pre-verify を消すなら adapter を `AuthenticationError` 化しないと 401 契約が壊れる。

### Decision
**案B + 案A の組み合わせ**を採用する:
1. adapter `changePassword` の verify を、`maybeRehashLegacy` を呼ばない private verify helper に差し替える（legacy rehash を抑制）。
2. mismatch 時は `AuthenticationError('invalid_credentials')` を直接 throw する（port JSDoc 契約に実装を一致させる）。
3. usecase `changePassword.ts` の pre-verify（UoW#1）を廃止し、adapter `changePassword`（verify+write を 1 UoW）に一本化する。

### Consequences
- 良い点:
  - scrypt 演算が「verify×2 + (legacy 時) rehash×1 + hash×1」→「verify×1 + hash×1」に削減。UPDATE も 1 回に。
  - port JSDoc 契約と実装が一致（latent な契約違反を解消）。401 が adapter からでも正しく出る。
  - `requestEmailChange` / 通常 logIn 経路の lazy upgrade に一切触れない（非ゴール遵守）。
- トレードオフ:
  - adapter が application 層の `AuthenticationError` を throw する形になる。ただし同ファイルは既に `SystemError` / `SystemErrorCode` を `@/core/application/errors` から import 済みで、依存方向（adapter→application）は正当。port が約束した application エラーを adapter が実装する位置づけで、cross-layer catch policy の「再翻訳しない」とは矛盾しない。
  - 案C を採らないため、changePassword 専用の verify ロジックが adapter 内に 1 つ増える（カプセル化のため許容）。

---
