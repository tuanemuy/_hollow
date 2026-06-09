# 実装計画 — Issue #572: feat(settings): P22 アクティブセッション一覧（端末ごと表示・行単位ログアウト）

**Issue:** #572
**作成日:** 2026-06-09
**複雑度:** 中〜大規模

---

## 目的

#543 で backend 不足のため見送られた P22「アクティブセッション一覧」を実装する。端末ごとの行表示・行単位ログアウト・「このセッション」バッジを、`spec/design/pages/P22-settings-security.html`（SSOT）に追従して提供する。表示値は backend 実データに厳密一致させ、捏造表示はしない（#543 ADR-004）。

## スコープ

### 含まれるもの

- `SessionService` port への一覧取得・id ベース行失効メソッド追加
- D1 adapter の対応実装
- `SessionDTO`（token 非露出 projection）+ `listUserSessions` read-only usecase
- id スコープ行失効 usecase（`revokeUserSession`）
- `SecurityForm/Page.tsx`（server）でのデータ取得 + `SecurityForm`（client）の一覧 UI・行失効
- transport 境界の入力検証 schema + server function
- spec/usecases/identity.md への追記
- adapter 結合テスト・usecase 単体テスト・frontend テスト

### 含まれないもの

- userAgent の本格パース（OS/ブラウザ名・デバイス画像）— DB に無く ADR-004 で捏造禁止。device-parser 導入は別 Issue
- 相対時刻整形（「2時間前」等）の共有ヘルパー導入 — locale 絶対表示で代替
- 既存 token ベース `revoke` / `revokeSession` の変更（他フロー用に温存）

## 実装ステップ

### 1. port にメソッド追加

- **対象ファイル:** `app/core/domain/identity/ports/sessionService.ts`
- **変更内容:** `SessionRecord` 型を追加（`id` / `token` / `userAgent: string|null` / `ipAddress: string|null` / `createdAt: Date` / `updatedAt: Date` / `expiresAt: Date`）。interface に `listForUser(userId: UserId): Promise<readonly SessionRecord[]>` と `revokeByIdForUser(userId: UserId, sessionId: string): Promise<void>`（冪等・所有者スコープ・不一致/不在は no-op）を追加。JSDoc は「期限切れ（`expiresAt <= now`）を除外して返す。失効済みセッションは行削除されているため自然に除外される（このスキーマに revoked フラグ列は無い）」と正確に記す。
- **置き場所の根拠:** token 入りの `SessionRecord` は port 層（domain 寄り読み取り型）に置き、application の projection で token を落として `SessionDTO` 化する。既存 `SessionMeta`/`IssuedSession`/`ResolvedSession` と同じ層配置（ADR-002）。
- **理由:** 一覧取得と「token 非露出かつ所有者スコープ」の行失効は既存 port に無い。token を持つ `SessionRecord` は domain 寄り型に留め、application で token を落として DTO 化し「DTO に token を出さない」を型で担保。

### 2. adapter 実装

- **対象ファイル:** `app/core/adapters/d1/repositories/sessionService.ts`
- **変更内容:** `listForUser` — 既存 `resolve` と同じく `this.clock.now().toISOString()` で `eq(userId)` かつ `gt(expiresAt, now.toISOString())` を select（`idx_sessions_user` 活用）、`createdAt` 降順、ISO 文字列を `Date` 化して返す。`mapDbError` でラップ。`revokeByIdForUser` — `delete(sessions).where(and(eq(id, sessionId), eq(userId, userId)))`（冪等・所有者一致のみ）。
- **有効判定の一貫性:** `resolve` は `users.deletedAt` を join して soft-deleted ユーザーを除外している。`listForUser` は自分自身のセッション一覧（actor は生存確定済み）なので users join は不要だが、期限切れ判定は `resolve` と同条件に揃える。
- **理由:** schema に必要列が揃っており追加マイグレーション不要。所有者一致条件を WHERE に入れることで、他ユーザーの id を投機 POST されても失効できない。
### 3. DTO 追加

- **対象ファイル:** `app/core/application/dto/identity.ts`
- **変更内容:** `SessionDTO`（`id` / `isCurrent: boolean` / `userAgent: string|null` / `ipAddress: string|null` / `createdAt: Instant` / `updatedAt: Instant` / `expiresAt: Instant`、**token は含めない**）を定義し、`toSessionDTO(record, currentSessionToken)` を実装（`isCurrent = currentSessionToken !== null && record.token === currentSessionToken`、token は射影で破棄、時刻は `toInstant`）。
- **理由:** token 非露出を application 層の projection で保証。`isCurrent` は server で解決済みの bool のみ client へ。

### 4. read-only usecase 新設

- **対象ファイル:** `app/core/application/identity/listUserSessions.ts`（新規）
- **変更内容:** `ListUserSessionsInput = { userId: string; currentSessionToken: string | null }`、`ListUserSessionsOutput = { sessions: readonly SessionDTO[] }`。`UserId.create(input.userId)` → `container.sessionService.listForUser(uid)` → 各 record を `toSessionDTO` で射影。`view.ts` から `SessionDTO`/`toSessionDTO` を再エクスポート。
- **理由:** ADR-010 の read-only usecase 追加方針。Page から呼ぶ単一エントリポイント。

### 5. 行失効 usecase（id ベース）新設

- **対象ファイル:** `app/core/application/identity/revokeUserSession.ts`（新規）
- **変更内容:** `revokeUserSession({ container, input: { actorUserId, sessionId } })`（`UserId.create` → `revokeByIdForUser`）。**失効は id + 所有者スコープのみで完結し、token は受け取らない（ADR-001）。** 既存 token ベース `revokeSession.ts` は変更しない。
- **理由:** Issue は「既存 revokeSession 流用」を示唆するが、token 流用は token 露出 + 所有者検証なしの 2 点で原則違反。`sessionId` + 所有者スコープが安全。

### 6. 個別失効 schema 追加

- **対象ファイル:** `app/components/identity/schema.ts`
- **変更内容:** `revokeSessionSchema = z.object({ sessionId: z.string().min(1) })` を追加。
- **理由:** transport 境界の入力検証。client が渡すのは id のみ。

### 7. server function 追加

- **対象ファイル:** `app/components/identity/SecurityForm/action.ts`
- **変更内容:** `revokeSessionFn`（`createServerFn POST` + `errorResponseMiddleware` + `validateInput(revokeSessionSchema)`）。`revokeAllOtherSessionsFn` の `loadServerDeps` + 動的 import 構造を踏襲（`requireCurrentUser`/`getContainer` も動的 import）。handler で `requireCurrentUser()` → `revokeUserSession({ container, input: { actorUserId: actor.id, sessionId: data.sessionId } })`。**`revokeUserSession` は id ベースなので `getCurrentSessionToken()` は不要**（actor だけ確定すればよい）。
- **理由:** mutation は server function 経由。actor は server 側で確定し、client の id を所有者スコープ usecase に渡す。

### 8. Page でデータ取得

- **対象ファイル:** `app/components/identity/SecurityForm/Page.tsx`
- **変更内容:** `ProfileForm/Page.tsx` 同様に `await import("@/core/application/di/containerStore")` 等で `getContainer` を動的取得し、`getCurrentSessionToken()` で token 取得、`listUserSessions({ container, input: { userId: user.id, currentSessionToken: token } })` を await し、`<SecurityForm user={toUserDTO(user)} sessions={sessions} />` を渡す。`SessionDTO` は `@/core/application/dto/identity` から直接 import（`ProfileForm/Page.tsx` の前例どおり。`view.ts` 再エクスポートは規約維持の追従）。
- **理由:** server component でのデータ取得（`ProfileForm/Page.tsx` 前例）。token は server に留め client へ渡さない。

### 9. 一覧 UI + 行失効を SecurityForm に追加

- **対象ファイル:** `app/components/identity/SecurityForm/index.tsx`
- **変更内容:** props に `sessions: readonly SessionDTO[]` を追加。289-310 の「セッション」節の一括失効ボタン下に `.session-list` 相当を追加。各行：アイコン SVG / `session-title`（実値ベース、判別不能なら userAgent 素出し）/ `isCurrent` 時に「このセッション」pill / `session-meta`（ipAddress と**「ログイン日時」=`createdAt` の locale 表示**。後述のとおり `updatedAt` を「最終アクセス」と表示すると虚偽になりうるため、確実に言える `createdAt` を正確な語で出す）。`isCurrent === false` の行のみ失効ボタン（`BTN_SM`/`BTN_SM_DANGER`）、`useTransition` で `revokeSessionFn({ data: { sessionId } })` → `routerInvalidate(router)`。失効中の行を `data-*`/disabled で示す。
- **理由:** モック構造に追従しつつ ADR-004 で捏造表示を排除。現在セッションは失効不可（モックも「このセッション」行に失効ボタン無し）。

### 10. spec 追記

- **対象ファイル:** `spec/usecases/identity.md`
- **変更内容:** `ListUserSessions`（入力 `userId`/`currentSessionToken`、出力 `SessionDTO[]`、token 非露出・`isCurrent` server 解決）と `RevokeUserSession`（`actorUserId`/`sessionId`、所有者スコープ失効）を追記。
- **理由:** spec を SSOT に保つ。

## 設計判断

詳細は adr.md を参照。要点:

- 行失効は token 流用ではなく `sessions.id` の所有者スコープ失効（ADR-001）
- `SessionDTO` は token を含めず、地名/パース済みデバイス名も含めない（ADR-002）
- `isCurrent` は server（Page→usecase→projection）で解決し client に token を渡さない（ADR-003）
- 「最終アクセス」は `updatedAt` を正確な語で表示、相対時刻整形はスコープ外（ADR-002）

## リスクと注意点

- **port 拡張のコンパイル波及:** `SessionService` の実装は `D1SessionService` のみで fake/stub は存在しない（テスト基盤 `app/core/application/__tests__/helpers.ts` も real `D1SessionService` を使う）。追加メソッドを `D1SessionService` に実装すれば型エラー波及はない。
- **「最終アクセス」表示は使わない:** `D1SessionService.issue` は `createdAt`=`updatedAt` で INSERT し、`resolve` は select のみで `updatedAt` を更新する経路が現状コードに無い。よって `updatedAt` ≒ `createdAt`（ログイン日時）。モックの「最終アクセス」ラベルをそのまま出すと虚偽表示になるため、`createdAt` を「ログイン日時」として正確に表示する（#543 ADR-004 準拠）。
- **id を client に出す妥当性:** `sessions.id`（UUID v7）は token と異なり再利用攻撃に使えず、所有者スコープ WHERE で他人セッションを触れない。server function で必ず actor とスコープ一致。
- **現在セッション行の失効抑止:** `isCurrent` 行に失効ボタンを出さない（モック準拠）。
- **空一覧 / token null:** 現在 1 件のみ・cookie 欠落時の空表示・全行非 current フォールバックを UI で扱う。

## テスト方針

- **純粋関数 unit テスト**（`pnpm test:unit`, fake 不要）: `app/core/application/dto/__tests__/identity.test.ts`（既存）に `toSessionDTO` を追加 — token を DTO に含めない、`isCurrent` が `currentSessionToken` 一致時のみ true・null 時全 false、時刻が `Instant` 化される。
- **usecase 結合テスト**（real D1, `pnpm test:integration`）: 既存 `app/core/application/identity/__tests__/identity.integration.test.ts` に追記 — `listUserSessions` が所有者の未期限切れセッションのみ返す・期限切れ除外、`revokeUserSession` が所有者一致のみ削除・他ユーザー/不在 id は no-op（冪等）。adapter（`D1SessionService.listForUser`/`revokeByIdForUser`）もこの real D1 経路で検証される。
- **frontend**: `SecurityForm` の一覧描画（current 行に pill・失効ボタン無し、他行に失効ボタン）と `revokeSessionFn` 呼び出し。
- **手動/ブラウザ**: 複数ブラウザでログインし一覧表示・行失効・current バッジ・再検証反映を確認。
- 仕上げ: `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 並列）

**修正した点**:
- [P-001 共通] fake SessionService は存在しない（実装は `D1SessionService` のみ、テスト基盤も real D1）。テスト方針を「`toSessionDTO` の純粋 unit テスト（`dto/__tests__/identity.test.ts`）」+「usecase は `identity.integration.test.ts` に real D1 追記」の2系統に修正。リスク欄の fake 前提も是正。
- [P-002] `action.ts`/`Page.tsx` の動的 import パターン（`loadServerDeps` + `await import(...)`、`getContainer` は containerStore 動的取得）を明記。`revokeUserSession` は id ベースで `getCurrentSessionToken()` 不要と明記。
- [P-003] ステップ5/7 に「失効は id + 所有者スコープのみで完結し token を受け取らない（ADR-001）」を追記。
- [S-001] `updatedAt` 更新経路が無く `createdAt` と同値のため、UI は「最終アクセス」ではなく `createdAt`=「ログイン日時」を正確表示（ADR-002/ADR-004 準拠）に変更。
- [S-003] `listForUser` の期限切れ判定を既存 `resolve` と同じ `now.toISOString()` 比較に揃える旨を明記。
- [S-004] port JSDoc を「期限切れ除外。失効は行削除で自然に除外（revoked フラグ列なし）」と正確化。

**取り込んだ改善提案**:
- [S-001 reviewer1] port `SessionRecord`（token 入り）と DTO（token 抜き）の層境界根拠を ADR-002 に追記。
- [S-002 arch] `view.ts` 再エクスポートは規約維持、Page の実 import は `dto/identity` 直接、と整理。
- [S-002 reviewer1] `listForUser` と `resolve` の有効判定一貫性（users join は自分のセッションでは不要）を明記。

**見送った提案とその理由**:
- なし（指摘はいずれもスコープ内で反映可能だった）。

