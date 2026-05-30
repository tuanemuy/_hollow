# 実装計画 — Issue #208: perf(security): changePassword で legacy lazy upgrade + 新パスワード書き込みの二重 hash を解消

**Issue:** #208
**作成日:** 2026-05-30
**複雑度:** 中〜大規模

---

## 目的

`changePassword` 1 リクエストで scrypt の重い演算（verify / hash）が複数回走る無駄を解消する。現状、usecase の pre-verify（UoW#1）と adapter `changePassword` 内部の再 verify（UoW#2）で **verify が 2 回**走り、さらに legacy PBKDF2 アカウントでは現パスワードの **scrypt rehash が直後に新パスワードで上書きされるのに走る**。これを「verify×1 + 新パスワード hash×1」に削減する。

> 注: Issue 本文は「Argon2id」と記載しているが、現行コードの hashing は **scrypt**（`app/core/adapters/security/scrypt.ts`）。Argon2id は起票当時の記述で、本質は「重い hash 演算の多重実行」。

## スコープ

### 含まれるもの
- `changePassword` 経路で legacy → scrypt rehash を抑制（直後に上書きされるため不要）
- usecase の二重 verify（pre-verify + adapter 内 verify）を 1 回に統合
- adapter `changePassword` の mismatch エラーを port JSDoc 契約（`AuthenticationError('invalid_credentials')`）に一致させる
- 関連 JSDoc の精緻化

### 含まれないもの
- 通常 logIn 経路 / `requestEmailChange` の lazy upgrade 挙動（**維持・無変更**）
- `verifyPassword` / `verifyPasswordForUser` / `maybeRehashLegacy` のグローバルな挙動変更
- port インターフェースのシグネチャ変更（不要）

## 実装ステップ

### 1. adapter `changePassword` の verify を rehash 副作用なし化 + 正しいエラー throw

- **対象ファイル:** `app/core/adapters/d1/repositories/credentialStore.ts`（`changePassword` L309-340）
- **変更内容:**
  - 冒頭の `await this.verifyPasswordForUser(userId, currentRaw)`（`maybeRehashLegacy` を内包）呼び出しを、**rehash 副作用を持たない private helper**（例 `private async verifyCurrentForChange(userId, raw): Promise<boolean>`）に差し替える。**実装は `verifyPasswordForUser`（L252-284）の本体をそのまま流用し、`maybeRehashLegacy` を呼ぶ 1 行だけを落とす**こと（`verifyPassword` の `BusinessRuleError→null` 分岐を雛形にしない）。行 selection（users leftJoin accounts、soft-delete / password null / user 不在 → `false`）+ `verifyHash(raw, row.password)` は等価。catch 範囲も `verifyPasswordForUser` と同形 = **DB 例外のみ `SystemError(SystemErrorCode.DatabaseError, ...)` に包み、それ以外はすべて boolean false**（`UserId.create` を呼ばないので value-object 例外は発生しない）。
  - mismatch（helper が `false`）時の throw を `BusinessRuleError("invalid_credentials", ...)` → `AuthenticationError("invalid_credentials", "Current password does not match")`（`@/core/application/errors` から import）に変更。
- **理由:** 新パスワードで必ず上書きするので現パスワードの legacy rehash は 100% 無駄。adapter は既に verify+write を 1 UoW で完結しており、ここに verify を一本化するのが最小の正しい解。エラーを `AuthenticationError` にすることで port JSDoc 契約（「`AuthenticationError`（application layer）」）と実装が一致し、HTTP 401 が adapter からでも正しく出る（現状の `BusinessRuleError('invalid_credentials')` は `kind:"business"`→422 にしかならず、契約違反のデッドコードだった）。

### 2. usecase の pre-verify（UoW#1）を廃止し UoW 1 本に統合

- **対象ファイル:** `app/core/application/identity/changePassword.ts`
- **変更内容:**
  - 先頭の `container.unitOfWorkProvider.run(({ credentialStore }) => credentialStore.verifyPasswordForUser(...))` ブロックと `if (!verified) throw new AuthenticationError(...)` を削除。
  - `UserId.create` / `RawPassword.create`（value-object 構築 = 入力検証）はそのまま残す。
  - `credentialStore.changePassword(...)` を呼ぶ UoW、および `revokeOtherSessions` 後続処理はそのまま。
- **理由:** pre-verify の唯一の目的「deterministic 401」を adapter が `AuthenticationError` を直接 throw することで担保できるようになるため、二重 verify と二重 UoW を同時に解消できる。

### 3. port JSDoc 契約の精緻化（シグネチャ不変）

- **対象ファイル:** `app/core/domain/identity/ports/credentialStore.ts`
- **変更内容:** `changePassword` の契約（L23-24「mismatch → `AuthenticationError('invalid_credentials')`（application layer）」）は既に正しいので意味は維持。必要なら「mismatch 時は `AuthenticationError` を throw し、現パスワードの legacy rehash は行わない（直後に新パスワードで上書きされるため）」と一文補強。
- **理由:** 契約はもともと application エラーを指定済み。実装をそれに合わせるだけでシグネチャ変更は不要。

### 4. adapter クラス JSDoc の追記

- **対象ファイル:** `app/core/adapters/d1/repositories/credentialStore.ts`（クラス JSDoc L116-153 の「Lazy upgrade」節）
- **変更内容:** `verifyPassword` / `verifyPasswordForUser` で rehash を積む記述はそのまま正。`changePassword` は lazy upgrade を**意図的にスキップ**する旨を 1 文追記し、**専用 verify helper を使う理由（`verifyPasswordForUser` 経由だと rehash 副作用が復活するため、DRY 統合してはいけない = why-not）**も添える。`maybeRehashLegacy` 本体 /`verifyPassword` / `verifyPasswordForUser` は無変更。
- **理由:** WHY が非自明（「なぜ changePassword だけ rehash しないのか」「なぜ verify を共通化しないのか」）なので記録し、将来 `verifyPasswordForUser` に戻す誤修正を防ぐ。

## 設計判断

**採用: 案B（adapter 内 verify を rehash 副作用なし化）+ 案A（usecase pre-verify 廃止）の組み合わせ。** 詳細は `adr.md` 参照。

- 案A単独は adapter の `BusinessRuleError('invalid_credentials')`（→422）が残り 401 契約が壊れるため不可 → adapter を `AuthenticationError` 化して解決。
- 案C（skip フラグ引数）は adapter 内部事情を verify の引数に漏らし port/private シグネチャを汚すため却下。changePassword 専用 private verify の方がカプセル化が良く、`requestEmailChange` の lazy upgrade に一切触れない。
- port シグネチャ変更なし。usecase でのエラー翻訳なし（adapter が契約どおり application エラーを実装するのは translate ではなく contract 準拠）。

## リスクと注意点

- **adapter → application エラー import:** adapter から `AuthenticationError` を import するが、同ファイルは既に `SystemError` / `SystemErrorCode` を `@/core/application/errors` から import 済み（前例あり、依存方向は adapter→application で正当）。
- **エラーの握り潰し回避:** 新 private verify helper は DB 例外のみ `SystemError` に包み、mismatch は boolean で返す。`AuthenticationError` は正常系の制御フローなので catch しないよう verify(boolean) と throw を分離する。
- **legacy アカウントの upgrade:** changePassword は新パスワードを必ず scrypt で書くため、row は結果的に scrypt 化される（lazy upgrade の目的は write 一回で達成）。
- **enumeration / timing:** changePassword は actor 認証済み前提。既存 verify と同じ「user 不在 / soft-delete / password null / mismatch → すべて false」を維持し情報差を作らない。
- **デッドコード削除の影響なし:** adapter の旧 `BusinessRuleError('invalid_credentials')` 経路は pre-verify が先に弾いていたため到達不能。`changePassword` adapter の呼び出し元は usecase 1 箇所のみ（grep 確認済み）。

## テスト方針

- **既存統合テストを無変更で green 維持**（`app/core/application/identity/__tests__/identity.integration.test.ts` の `describe("ChangePassword")` L886-940）:
  - 正しい current → 成功、新パスワードでログイン可・旧パスワードで `AuthenticationError`。
  - 誤った current → `AuthenticationError('invalid_credentials')`（adapter が直接 throw する経路に変わるが `isAuthenticationError` && `code === "invalid_credentials"` を満たす）。
- **回帰防止:** `requestEmailChange` 統合テスト（同ファイル L942 以降）が無変更で green であること = lazy upgrade 経路に触れていないことを担保。
- **任意（helper の selection 等価性担保）:** soft-delete 済み actor に対する `changePassword` が `AuthenticationError('invalid_credentials')` になる 1 ケース追加を検討。既存テストは「誤 current password」しか叩いておらず、新 helper の `deletedAt` / `password===null` 判定の取りこぼしを機械的に検出できる。actor 認証済み前提で実害は薄いため必須ではないが、スコープを膨らませない範囲なら追加して helper 等価性を固定する。
- 仕上げ: `pnpm typecheck && pnpm lint:fix && pnpm format` → `pnpm test`。

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**要件カバレッジ視点 / アーキ・リスク視点ともに「問題点ゼロ」**。ブロッカーとなる要件欠落・設計欠陥・実現不可能性なし。両者が以下を独立に裏取り:
- adapter 現行 `BusinessRuleError('invalid_credentials')` は `kind:"business"`→422 で、port JSDoc 契約（`AuthenticationError`→401）違反のデッドコード。`AuthenticationError` 化は契約準拠。
- UoW は deferred-batch（`pending.add` 前に throw すれば書き込みは flush されない）。adapter 直 throw でも 401 が正しく出る。
- `changePassword` adapter の呼び出し元は usecase 1 箇所、`CredentialStore` 実装は `D1CredentialStore` 1 つのみ。旧 `BusinessRuleError` を期待する adapter テストなし。波及は閉じている。

**取り込んだ改善提案**:
- [arch S-001] 新 private verify helper は「`verifyPasswordForUser` 本体を流用し `maybeRehashLegacy` 行だけ落とす」「DB 例外のみ `SystemError`、それ以外 boolean false」と実装ステップ1を精緻化。
- [arch S-003] JSDoc に「専用 helper を DRY 統合してはいけない（rehash 副作用復活防止）」の why-not を追記する旨をステップ4に明記。
- [arch S-002] soft-delete actor の changePassword テスト 1 ケース追加を「任意」としてテスト方針に追記。

**見送った提案とその理由**:
- [req S-001] Issue 本文の行番号と現コードの行番号ズレ → 計画は現コードの行を正しく参照しており実害なし。認識のみ。
- [req S-002] 「`AuthenticationError` 化 / port JSDoc 精緻化はゴール2の前提」を目的に明記 → 既に ADR-001 Context と本 plan の設計判断セクションで論証済みのため追記不要と判断。
