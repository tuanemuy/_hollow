# 実装計画 — Issue #456: perf(security): lazy upgrade を status OK 確定後に遅延させる（#210 F-1）

**Issue:** #456
**作成日:** 2026-06-06
**複雑度:** 中〜大規模

---

## 目的

`D1CredentialStore.verifyPassword` は verify 成功直後に `maybeRehashLegacy`（legacy PBKDF2 → scrypt rehash）を直列実行する。`logIn` は verify（rehash 含む UoW#1）を status チェック（UoW#2）より前に完走させるため、**pending / suspended ユーザが正しいパスワードでログインを試みると、最終的に拒否されるのに scrypt rehash が走る**。この構造的な無駄を正し、status が active と確定した後にのみ rehash する形にする。

## スコープ

### 含まれるもの

- `verifyPassword` を rehash-free 化し、戻り値を `{ userId, needsRehash } | null` にリッチ化する
- rehash 実行を独立メソッド `rehashLegacyPassword(userId, raw)` として port / adapter に公開
- `logIn` で status が active と確定した後にのみ rehash を実行（pending / suspended / deleted では rehash しない）
- pending / suspended / deleted で rehash が走らないことを統合テストで担保

### 含まれないもの

- 認証経路の rate limit（別 Issue: F-2）
- `verifyPasswordForUser`（requestEmailChange 経由）の変更 — ログイン済み = status active 確定済みユーザの再認証経路で、rehash が無駄にならないため現状維持（→ 設計判断 / adr.md 参照）

## 実装ステップ

### 1. port interface の `verifyPassword` 戻り値型をリッチ化 + rehash メソッド追加

- **対象ファイル:** `app/core/domain/identity/ports/credentialStore.ts`
- **変更内容:**
  - `verifyPassword` の戻り値を `Promise<VerifyPasswordResult | null>` に変更。`VerifyPasswordResult = { userId: UserId; needsRehash: boolean }` を同ファイル（または domain/identity の適切な場所）に定義・export。
  - 新メソッド `rehashLegacyPassword(userId: UserId, raw: string): Promise<void>` を port に追加。
  - JSDoc 更新: 「全失敗時 `null`、成功時 `{ userId, needsRehash }`。`needsRehash` は legacy hash 形式に対する rehash 要否ヒント（prefix 判定のみ・暗号演算なし）。呼び出し元が status OK 確定後に UoW 内で `rehashLegacyPassword` を呼ぶ判断材料。null 単一失敗経路の enumeration defence は不変」。`rehashLegacyPassword` は「idempotent（既に scrypt なら no-op）。`pending.add` を使うため UoW 内で呼ぶ」と明記。
- **理由:** `needsRehash` は成功時のみ付随する追加情報で、失敗時は引き続き `null` 単一経路。enumeration defence を壊さない。

### 2. adapter の `verifyPassword` を rehash-free 化

- **対象ファイル:** `app/core/adapters/d1/repositories/credentialStore.ts`
- **変更内容:** verify 成功後の `await this.maybeRehashLegacy(...)` を削除。代わりに `const needsRehash = !isScryptEncoded(row.password);` を計算し `return { userId: verifiedUserId, needsRehash };`。失敗経路（`return null`）と catch の `BusinessRuleError → null` マスクは一切変更しない。
- **理由:** status 未確定段階で scrypt 演算を走らせない。needsRehash は prefix 判定のみでタイミング影響なし。

### 3. adapter に `rehashLegacyPassword` を実装

- **対象ファイル:** `app/core/adapters/d1/repositories/credentialStore.ts`
- **変更内容:** 既存 `maybeRehashLegacy` を public `rehashLegacyPassword(userId, raw)` に再編。呼び出し元が encoded を持たないため、内部で現 password を SELECT し `isScryptEncoded` なら no-op（防御的 idempotency。通常 needsRehash=false で呼ばれないが二重 rehash 安全網）、legacy なら `hashScrypt` → `pending.add(update)`。`verifyPassword` で読んだ `row.password` を UoW#3 まで持ち回らず**再 SELECT する WHY コメントを残す** — status 確定〜UoW#3 の間に concurrent login が先に rehash 済みになる TOCTOU 窓があり、古い判定を持ち回ると二重書き込みになるため、UoW#3 内で読み直すのが正しい。クラス JSDoc の「Lazy upgrade」「Execution mode」節を更新（verify はもう rehash を enqueue しない / rehash は status OK 後に `rehashLegacyPassword` 経由）。ADR 参照コメントも更新。
- **理由:** rehash は `pending.add` を使うため UoW 内実行が必須。logIn は status 確定後に別 UoW を起こすので、その UoW の credentialStore 上で呼べる独立メソッドが必然。

### 4. `logIn` を status 確定後 rehash に変更

- **対象ファイル:** `app/core/application/identity/logIn.ts`
- **変更内容:** UoW#1 の戻り値を `verified` で受け、`null` なら従来どおり throw。`const { userId, needsRehash } = verified;`。status チェック（pending / suspended / deleted / orphan を全拒否）を通過した後、session 発行の**前**に、`needsRehash` が true なら UoW#3 を起こして `credentialStore.rehashLegacyPassword(userId, input.password)` を実行（そのまま await）。
- **理由:** pending / suspended / deleted では status チェックで throw 済みのため UoW#3 に到達せず、rehash が走らない。status 確認 UoW（UoW#2）は `userRepository` のみ公開で `credentialStore` を握っていないため（logIn.ts:47-52）相乗りできず、rehash 用に別 UoW が必然。session 発行**前**に rehash するのは、rehash 失敗時にセッション未発行のまま「ログイン全体が失敗」という一貫した結末にするため（発行後だと session 発行済みなのに 500 を返す中途半端な状態になり得る）。

### 5. `verifyPasswordForUser` は変更しない

- **対象ファイル:** `app/core/adapters/d1/repositories/credentialStore.ts`（JSDoc のみ）
- **変更内容:** active 確定済み再認証経路なので inline lazy upgrade を維持。クラス JSDoc に判断理由を一言補足。
- **理由:** requestEmailChange はログイン済みユーザの再認証で status active 前提。Issue の構造的無駄が発生しない。

### 6. 統合テスト追加・更新

- **対象ファイル:** `app/core/application/identity/__tests__/identity.integration.test.ts`
- **変更内容:**
  - 既存 lazy upgrade テスト（active での rehash）が引き続き green であることを確認（rehash タイミングが UoW#1 → UoW#3 に移っただけで最終結果は同一）。
  - 新規: legacy PBKDF2 を seed した **pending** ユーザで logIn → `unverified` 拒否 + `accounts.password` が legacy prefix のまま & `updated_at` sentinel 不変を assert。
  - 新規: **suspended** / **deleted** ユーザで logIn → `account_unavailable` 拒否 + legacy のまま不変を assert。
  - changePassword / requestEmailChange の既存 legacy テストは `verifyCurrentForChange` / `verifyPasswordForUser` を変えないため無影響。

### 7. spec ADR の訂正注記

- **対象ファイル:** `spec/adr/011-argon2id-migration.md`（ADR-003）
- **変更内容:** ADR-003 は「`users.status === 'pending'` ユーザでも lazy upgrade が発火するのを許容する」と明文化しており、本変更でこの記述が虚偽になる。ADR-005 の既存「訂正」パターンに倣い、ADR-003 に「訂正 (Issue #456): status OK 確定後に rehash を遅延させる形へ改めた。pending / suspended / deleted では rehash しない」旨の注記を追記する。`012` は「lazy upgrade は維持」と述べるが rehash タイミングの変更であって lazy upgrade 自体は維持されるため `012` の本文変更は不要（必要なら一言注記）。
- **理由:** spec と実装の乖離を防ぐ。実装後に rationale ドキュメントが矛盾を抱えないようにする。

### 8. 検証

- **対象:** `pnpm typecheck && pnpm lint:fix && pnpm format` → `pnpm test:integration`（identity 統合テスト）

## 設計判断

案A のハイブリッド採用 — 戻り値を `{ userId, needsRehash } | null` にリッチ化（成功時のみヒント、失敗は `null` 単一経路維持）し、rehash 実行は独立 public メソッド `rehashLegacyPassword` に分離。`verifyPasswordForUser` はスコープ外（現状維持）。詳細は `.issue/456/adr.md` 参照。

## リスクと注意点

- **3つ目の UoW のオーバーヘッド:** rehash 用に追加 UoW（追加 `db.batch`）が発生するが legacy 行 1回限り（次回 logIn では needsRehash=false）。通常運用（既に scrypt）では UoW#3 自体が起きない。許容範囲。
- **rehash UoW 失敗時の扱い:** status active 確定後なので rehash 失敗は真の system error。session 発行前に await するため失敗するとログイン全体が失敗するが、legacy 行 + DB write 失敗という稀ケース。CLAUDE.md の「broad try/catch を避ける」に従い厳格 await を基本とする。
- **enumeration defence の維持:** `needsRehash` は成功時のみ付随し prefix 判定（暗号演算なし）なのでタイミング差を生まない。失敗経路は不変。
- **port 型変更の波及:** `verifyPassword` 戻り値型変更で `logIn.ts` のコンパイルが壊れる（意図的・検出装置）。他の呼び出し元は無し。port 実装は D1 のみ・テストも実 D1 使用なので fake 修正不要。
- **テストの updated_at sentinel 手法:** pending / suspended / deleted ケースで「rehash 不発火」を sentinel `updated_at` 不変 + password が legacy prefix のまま、の二重で検証する。

## テスト方針

- **pending で rehash しない:** legacy seed pending ユーザで logIn → `unverified` + legacy のまま不変。
- **suspended / deleted で rehash しない:** legacy seed → `account_unavailable` + legacy のまま不変。
- **active では従来どおり rehash:** 既存 lazy upgrade テストが green。
- **changePassword / requestEmailChange は無影響:** 既存テストがそのまま green。
- すべて実 D1 アダプタを使う統合テストで担保。

## レビュー履歴

### 1周目
両視点（要件カバレッジ / アーキテクチャ・リスク）とも **問題点ゼロ** で終了。要件4項目すべてカバー・スコープ外混入なし・UoW モデルとの整合・enumeration defence の維持を実コードと照合の上で確認済み。

**取り込んだ改善提案**:
- [要件 S-001 / アーキ S-003 関連] `spec/adr/011-argon2id-migration.md` ADR-003 が「pending でも lazy upgrade 発火を許容」と明文化しており本変更で虚偽になるため、訂正注記の追記をステップ7として追加。
- [アーキ S-001] `rehashLegacyPassword` 内で `row.password` を持ち回らず再 SELECT する理由（concurrent login の TOCTOU 安全網）を WHY コメントとして残す旨をステップ3に追記。
- [アーキ S-002 / 要件 S-002] session 発行**前**に rehash する根拠、および status 確認 UoW に相乗りできず別 UoW が必然である根拠をステップ4に追記。
- [アーキ S-003] ADR-002 の「pending/suspended は到達不能」根拠を「usecase の status チェック」ではなく「認証済みルートでのみ到達」と厳密化（adr.md を更新）。
