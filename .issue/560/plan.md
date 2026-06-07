# 実装計画 — Issue #560: 共有リンクのパスワード失敗カウンタが永続化されずロックアウトが発火しない

**Issue:** #560
**作成日:** 2026-06-07
**複雑度:** 中〜大規模

---

## 目的

パスワード保護された共有リンクで誤パスワードを送信したとき、`share_links.failed_attempts` が increment され、`maxAttempts`（5）到達で `locked_until` が設定されてロックアウトが発火するようにする。現状は失敗時の `save()`（カウンタ increment / lockout 設定）が永続化されず、何回間違えてもロックされない。

根本原因は、`resolveShareLink.ts` が失敗時の `save()` を pending batch に積んだ直後に `BusinessRuleError` を throw する一方、D1 UoW（`unitOfWork.ts`）が「`fn` が正常 return したときだけ `db.batch()` を flush する」設計のため、throw 時に積んだ書き込みがすべて破棄されること。JSDoc（「The mutated link is persisted regardless」）と実装が乖離している。

## スコープ

### 含まれるもの

- `resolveShareLink.ts` の失敗パスを「UoW 内では throw せず outcome を return し、UoW の外で `BusinessRuleError` を throw する」形に変更し、失敗時の counter increment / lockout を確実に flush させる
- JSDoc を修正後の実装に合わせて更新する
- real D1 の integration test で「失敗カウンタ永続化」「ロックアウト発火」「成功時 reset」を担保する

### 含まれないもの

- `unitOfWork.ts` / `pendingBatch.ts` など UoW 共通基盤の変更（全 usecase に波及するため触らない）
- `share_link_password_invalid` / `share_link_locked` のエラーコード `errorCode.ts` 登録（文言は現状維持。スコープ厳守）
- 同時実行時の OCC リトライ追加（CLAUDE.md「no application-level OCC retry」原則に従う）
- presentation 側の変更（throw される `BusinessRuleError` の code は不変なので無変更）

## 実装ステップ

### 1. コールバック戻り値を discriminated outcome 化（失敗パス）

- **対象ファイル:** `app/core/application/publication/resolveShareLink.ts`
- **変更内容:** `run` のコールバック内で `verifyShareLinkAccess` の結果に関わらず `shareLinkRepository.save(result.updatedLink, versioned.expectedVersion)` を呼ぶところまでは同じ。その後 `!result.ok` のときは **throw せず** `{ outcome: "password_invalid" } as const` を return する。
- **理由:** `fn` が正常 return することで、UoW が `db.batch()` を flush し、increment（version+1 / failed_attempts+1 / 閾値到達時 locked_until）が確実に永続化される。UoW の「正常 return 時のみ flush」不変条件をそのまま使って保証する。

### 2. 成功パスも outcome で return

- **対象ファイル:** 同上
- **変更内容:** 成功時は note / owner を引いて `{ outcome: "ok", noteId, ownerUsername } as const` を return する。`note-not-found` / `owner-not-found` は従来どおり `NotFoundError` を throw する（save 後の異常系。note が実在しないのにアクセス記録/reset を残すべきではないので、throw による破棄が望ましい）。`share_link_locked` / `share_link_revoked` / `findByTokenHash === null` / `findById === null` は save を積む前の早期 throw なので従来どおり throw のままでよい（積んだ書き込みが無いので破棄されても害がない）。
- **理由:** 永続化したい状態がある分岐（失敗カウンタ）だけを UoW 外 throw に回し、それ以外は最小変更で従来の挙動を保つ。

### 3. UoW の外で outcome を分岐

- **対象ファイル:** 同上
- **変更内容:** `const result = await container.unitOfWorkProvider.run(...)` の後、`if (result.outcome === "password_invalid") throw new BusinessRuleError("share_link_password_invalid", ...)` を置き、`ok` のときだけ `{ noteId, ownerUsername }` を return する。
- **理由:** 「save が flush 済み → その後に throw」の順序を保証する。

### 4. JSDoc を実装に合わせて修正

- **対象ファイル:** 同上 L22-38
- **変更内容:** 「The mutated link is persisted regardless so the counter / lockout state survives.」を、修正後の実際の挙動（失敗カウンタの increment はコミット後に UoW の外で `BusinessRuleError` を throw する／UoW は正常 return 時のみ flush する／note・owner not-found のような save 後の異常系は throw により破棄される）に合わせて更新する。
- **理由:** JSDoc と実装の乖離を是正する（Issue で指摘された乖離そのもの）。

### 5. integration test を新規追加

- **対象ファイル（新規）:** `app/core/application/publication/__tests__/resolveShareLink.integration.test.ts`
- **変更内容:** real D1（`setupTestContainer()`）で本バグの再現と修正を担保する（詳細は「テスト方針」）。
- **理由:** 「fn throw で batch が flush されない」性質は in-memory fake では再現不能。real D1 の integration でこそ担保できる。

### 6. 仕上げ

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:integration`（少なくとも publication 範囲）

## 設計判断

詳細は `adr.md` を参照。要点:

- **採用: 案A** — UoW 内では throw せず outcome を return、UoW の外で throw。UoW の不変条件を一切触らず、修正が `resolveShareLink.ts` 1ファイルに閉じる。`acquireEditLock.ts` 等の「`run` の戻り値を usecase 本体で受けて分岐」する既存パターンと一貫。
- **却下: 案B**（失敗 increment を別 UoW で先にコミット）— UoW が2つに割れ、同時誤入力での OCC 競合窓が増え、複雑さが過剰。
- **却下: 案C**（UoW 側に throw 時も flush するオプション追加）— UoW の中核不変条件を壊し波及が最大。CLAUDE.md の原則に反する。

## リスクと注意点

- **success path の reset / recordAccess:** 案A では成功時も save が flush されてから return するので挙動不変。
- **note-not-found / owner-not-found:** save を積んだ後の throw なので save が破棄される（アクセス記録/reset が残らない）。note が実在しないのにアクセス記録を残さない点でむしろ正しい。実害は極小。
- **OCC 同時実行:** 同一リンクへ2リクエストが同時に誤入力すると片方の batch が `_occ_guard` で `OPTIMISTIC_LOCK_FAILURE` になりうる。これは現行 save 設計の既存挙動でスコープ外。OCC リトライは入れない。integration test では race のアサーションを緩める。
- **エラーコード未登録:** `share_link_password_invalid` / `share_link_locked` はインラインリテラルのまま（文言を変えないため `errorCodeNaming.test` に影響なし）。
- **presentation 無変更の確認:** 修正後、`ShareLinkGate` が `share_link_locked` を `role="status"` 警告で表示する経路（#544 実装済み）がロックアウト到達により初めて実機で観測可能になる。コード変更は不要だがブラウザ検証で確認する。

## テスト方針

real D1 の integration（`*.integration.test.ts`）で担保する（test.md の方針どおり。in-memory fake では再現不能なため）。

**テスト基盤の前提（P-001 反映）:** `createTestContainer()` / `setupTestContainer()`（`app/core/application/__tests__/helpers.ts`）は引数を取らず、`clock: SystemClock` / `idGenerator: UuidV7Generator` / `passwordHasher: ScryptPasswordHasher` を固定で DI している。注入口は無いので、`now` を固定したい場合は既存イディオム `{ ...c, clock: { now: () => t } }`（`trashLifecycle.integration.test.ts:100` 等で実績あり）でコンテナをスプレッド上書きする。`passwordHasher` は固定の `ScryptPasswordHasher` で支障ない（seed の passwordHash は `container.passwordHasher.hash(...)`、tokenHash は `hashShareLinkToken` で生成）。`FakeIdGenerator` は本経路では不要（id 生成依存がない）。

- 新規 `app/core/application/publication/__tests__/resolveShareLink.integration.test.ts`（`setupTestContainer()` で real D1、now 固定が要る箇所のみ clock をスプレッド上書き）
  1. **回帰の核（永続化, regression for #560）:** パスワード付きリンクを seed → 誤パスワードで呼び `BusinessRuleError("share_link_password_invalid")` が throw されることを assert → 直後に `findByTokenHash` / `findById` で `failedAttempts === 1` を assert（修正前は 0 で fail = バグ再現）。テスト名・コメントに `regression for #560` を残す
  2. **ロックアウト発火（境界を分けて検証）:** 誤パスワードを連続で呼ぶ。`recordFailedAttempt` は `nextAttempts >= maxAttempts(5)` で lockout を立てるため、**5回目の応答自体は `share_link_password_invalid`** だが DB 上は `failedAttempts === 5` かつ `lockedUntil` がセット済み。**6回目**で `BusinessRuleError("share_link_locked")` が throw される（`lockedUntil > now` の早期 throw 経路）。この「5回目=invalid+lockedUntil セット / 6回目=locked」を分けて assert する。`lockedUntil` の near-equal アサートは clock スプレッド上書きで now を固定して安定させる
  3. **成功時 reset:** 数回失敗（failedAttempts>0 にする）→ 正しいパスワードで成功 → `failedAttempts === 0` / `lockedUntil === null` / `lastAccessedAt` 更新、戻り値 `{ noteId, ownerUsername }` が正しい。version が `resetFailedAttempts` + `recordAccess` で進むことも確認できると OCC 進行の回帰も守れる（任意）
  4. **異常系:** revoked リンク → `share_link_revoked` throw（save が積まれず DB 不変）、存在しない token → `NotFoundError`
- 実行: `pnpm test:integration`（publication 範囲）+ `pnpm typecheck && pnpm lint:fix && pnpm format`
- 最終確認: 手動ブラウザ検証（`.issue/544/manual-test/seed.sql` の seed → 5 回誤入力 → `wrangler d1 execute ... SELECT failed_attempts, locked_until` でロックアウト永続化を確認、UI の `role="status"` 警告表示も確認）

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 並列）

**修正した点**:
- [P-001] テスト方針の DI 前提（固定 now / FakeIdGenerator を DI）が現状の `setupTestContainer()`（引数なし・SystemClock/UuidV7Generator/ScryptPasswordHasher 固定）と食い違っていた → 既存イディオム `{ ...c, clock: { now: () => t } }` のスプレッド上書きで now を固定する方針に修正、FakeIdGenerator の言及を削除、テスト基盤前提を明記。

**取り込んだ改善提案**:
- [S-001] ロックアウト境界（5回目=invalid+lockedUntil セット / 6回目=locked）を分けて検証することをテスト方針に明記。
- [S-002] 回帰テストに `regression for #560` を残す旨を明記。version 進行の確認を任意で追加。
- [S-003] discriminated union の戻り値型を `resolveShareLink.ts` 内ローカル型として明示する方針（ADR-001 と整合、実装時に反映）。

**見送った提案とその理由**: なし

**結論**: アーキ・リスク視点は問題点ゼロ。要件視点の P-001 はテスト方針記述の精緻化で対応済み。両視点とも本質的なブロッカーはなく、1周で収束。実装フェーズへ。
