# 実装計画 — Issue #315: admin UsersTable で admin 自身に対する demote/suspend ボタンが表示される（自己操作禁止ガード未実装）

**Issue:** #315
**作成日:** 2026-05-30
**複雑度:** 中〜大規模（domain / application / presentation / test に跨るが各層の変更は小さい）

> 注: 当初 `.issue/315/` には別件（UI ボタン/リンクのスタイル統一）の計画が誤って置かれていた。そちらは新規 Issue #336 として起票し `.issue/336/` へ移設済み。本計画は GitHub Issue #315 本文（admin UsersTable の自己操作禁止）を正として作成。

---

## 目的

admin の UsersTable で、ログイン中の admin user が **自分自身に対して demote（管理者を解除）/ suspend（一時停止）** を実行できてしまう問題を防ぐ。

- UI: 自分自身の行では「管理者を解除」「一時停止」ボタンを **表示しない**（防御的 UX）。
- サーバー: usecase（`demoteAdmin` / `suspendUser`）でも **actor === target ガード**を掛ける（多重防御）。UI バイパスを許さない。

## 調査結果（現状）

- **UI**: `app/components/admin/UsersTable/index.tsx` の `UserRow` は `user.status` / `user.role` だけで分岐しており、ログイン中ユーザー ID を受け取っていない（`UsersTable` の prop は `users` のみ）。
  - 自分の行（ログイン中 admin = active + admin）に出るのは **suspend（active）** と **demote（admin）** の 2 ボタン。promote は `role === "member"`、reinstate は `status === "suspended"` 条件のため自分の行には出ない。
- **サーバー**: `demoteAdmin.ts` / `suspendUser.ts` は actor と target を別 ID として受け取るが、**actor === target の自己操作チェックは無い**。最後の admin 保護（`IdentityService.assertNotLastAdmin`）のみ存在。複数 admin がいれば自分を demote/suspend できてしまう。
- **current user の取得経路**: `Page.tsx` が `requireAdminUser()` でログイン中 `User` を取得済み（戻り値を破棄している）。`me.id` を `UsersTable` → `UserRow` に渡せば行ごとに比較可能。`UserDTO.id` は branded string で、`User.id`（value object）と文字列等価比較できる。
- **エラー設計**: `IdentityErrorCode`（`app/core/domain/identity/errorCode.ts`）に自己操作用コードは未定義。`assertNotLastAdmin` は `BusinessRuleError(IdentityErrorCode.LastAdminProtected, ...)` を投げる確立パターンがある。

## スコープ

### 含まれるもの
- 自己操作禁止のドメインルール追加（`IdentityService.assertNotSelf`）と `IdentityErrorCode` への新コード追加。
- `demoteAdmin` / `suspendUser` usecase で `assertNotSelf(actorId, targetId)` を呼ぶ。
- `Page.tsx` がログイン中 admin の id を `UsersTable` に渡す。`UserRow` で自分の行の suspend/demote ボタンを非表示。
- 単体/結合テストの追加・更新（自己 demote/suspend が拒否されること、自分の行にボタンが出ないこと）。

### 含まれないもの
- promote / reinstate への自己操作ガード（自分の行＝active+admin には構造上出ない・呼べない）。仮に将来出るとしても本 Issue の意図外。
- 「最後の admin 保護」のロジック変更（既存 `assertNotLastAdmin` をそのまま活かす）。
- UsersTable の他の挙動・スタイル変更。

## 実装ステップ

### 1. ドメイン: エラーコード追加

- **対象ファイル:** `app/core/domain/identity/errorCode.ts`
- **変更内容:** `SelfOperationNotAllowed: "self_operation_not_allowed"` を追加。
- **理由:** 自己操作禁止を `BusinessRuleError` として表現するためのコード。`errorCodeNaming.test.ts` の規約（key=PascalCase / value=lower_snake_case）に適合。

### 2. ドメイン: 自己操作禁止ルール追加

- **対象ファイル:** `app/core/domain/identity/services/identityService.ts`
- **変更内容:** `assertNotSelf(actorId: UserId, targetUserId: UserId): void` を追加。`actorId === targetUserId`（value object の文字列等価）なら `BusinessRuleError(IdentityErrorCode.SelfOperationNotAllowed, "Admins cannot demote or suspend their own account")` を投げる。JSDoc を既存ヘルパーと同じ粒度で付ける。
- **理由:** 「自分自身は demote/suspend できない」はクロス集約ではなく actor/target 関係の不変条件。`assertNotLastAdmin` と同じく `IdentityService` の明示ヘルパーとして置くのが既存パターンに整合（usecase が遷移点で明示呼び出し）。

### 3. application: usecase で自己操作ガードを呼ぶ

- **対象ファイル:** `app/core/application/identity/demoteAdmin.ts`, `app/core/application/identity/suspendUser.ts`
- **変更内容（配置はあえて非対称。ADR-003 で根拠を記録）:**
  - `suspendUser`: actor の admin チェック直後・`findById(target)` の **前** に `IdentityService.assertNotSelf(actorId, targetId)` を呼ぶ。suspend には last-admin 不変条件が無く、自己 suspend は常に拒否したいので最速で弾く。`IdentityService` の import を追加。
  - `demoteAdmin`: 既存の `assertNotLastAdmin(targetId, adminCount)` の **後** に `IdentityService.assertNotSelf(actorId, targetId)` を呼ぶ。`demoteAdmin` は `IdentityService` を既に import 済み。
- **理由（demote で last-admin を先に評価する根拠）:** demote で `last_admin_protected` に到達できるのは **actor===target（唯一の admin が自分を demote）の時だけ**（count<=1 なら actor になれる admin は自分しかいない＝not_admin チェックの帰結）。よって self を先に評価すると `assertNotLastAdmin` が demote では到達不能（dead code）になり、既存テスト `rejects demoting the last admin`（actor===target）も落ちる。last-admin を先に置けば、(a) 単独 admin が自分を demote→`last_admin_protected`（既存テスト維持・dead code 化なし）、(b) admin 複数で自分を demote→`self_operation_not_allowed`（新ガード）、と両ルールが生き残る。`last_admin_protected` 全体のカバレッジは自己アカウント削除 `deleteAccount`（同じく self-operation が設計上の正・別テスト 1582 行）でも担保される。

### 4. presentation: current user id を UI へ伝播

- **対象ファイル:** `app/components/admin/UsersTable/Page.tsx`
- **変更内容:** `const me = await requireAdminUser();` で戻り値を受け、`<UsersTable users={users} currentUserId={me.id} />` として渡す。
- **型整合:** `UsersTable` / `UserRow` の `currentUserId` prop 型は **`string`** とする。`me.id`（domain `UserId`）も `UserDTO.id`（DTO branded string）もいずれも底が `string` のため、prop を `string` で受け、`user.id === currentUserId` の素の文字列等価で比較する（branded string 同士のブランド不一致を回避し、最も単純で安全）。`me.id` は string subtype なのでそのまま `currentUserId={me.id}` で渡せる。
- **理由:** 行ごとに自分かどうか判定する材料を渡す。`requireAdminUser()` は既に呼んでおり追加コストなし。

### 5. presentation: 自分の行のボタンを非表示

- **対象ファイル:** `app/components/admin/UsersTable/index.tsx`
- **変更内容:**
  - `UsersTable` に `currentUserId` prop を追加し `UserRow` に伝播。
  - `UserRow` で `const isSelf = user.id === currentUserId;` を計算。
  - suspend ボタンの条件を `user.status === "active" && !isSelf` に、demote ボタンの条件を `user.status !== "deleted" && user.role === "admin" && !isSelf` に変更。
  - promote / reinstate には `!isSelf` を **付けない**。promote は `role === "member"`、reinstate は `status === "suspended"` 条件で、ログイン中 admin（active + admin）の自己行には構造上出ないため冗長を避ける（ADR-002 で記録）。
- **理由:** 自分自身への操作ボタンを UI から除外。Issue 提案そのまま。

### 6. test: 自動テスト追加・更新

- **対象ファイル:** `app/core/application/identity/__tests__/identity.integration.test.ts`（または対応する単体テスト）
- **変更内容（最小構成）:**
  1. 「admin が **2 人以上**いる状態で actor===target で demote → `self_operation_not_allowed`」: admin A（actor=self）+ admin B（count>=2 にする）。既存の `can demote when another admin exists` の足場（admon03 + 昇格）を流用できる。
  2. 「actor===target で suspend → `self_operation_not_allowed`」: admin A（actor=self、active）。
  3. 既存 `rejects demoting the last admin`（actor===target・admin 1 人）は **last_admin_protected のまま据え置き**（ADR-003 の順序決定により変更不要）。
- **errorCodeNaming.test.ts:** 新コードは `import.meta.glob` で自動 discover されるため `EXPECTED_ERROR_CODE_NAMES` の手動更新は不要。命名規約（key=PascalCase / value=lower_snake_case）チェックのみ通過すればよい。
- **理由:** 多重防御の振る舞いを固定。既存テストを壊さず新ルールを追加カバー。

### 7. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format` → `pnpm test`。
- manual-test スキルでブラウザ確認（testing.md）。

## 設計判断

詳細は `.issue/315/adr.md` 参照。要点:

- **ADR-001**: 多重防御（UI 非表示 + usecase ガード）。UI は UX、サーバーは安全性。
- **ADR-002**: 自己操作禁止を `ForbiddenError` ではなく `BusinessRuleError`（`IdentityService.assertNotSelf`）で表現。`assertNotLastAdmin` と同じドメイン不変条件パターンに整合。
- **ADR-003**: ガード呼び出し順序と既存「最後の admin」テストとの干渉の解消方法。

## リスクと注意点

- **既存テスト `rejects demoting the last admin` との干渉 → ADR-003 で解消済み。** demote では last-admin を self より先に評価する（ステップ 3 の理由参照）。これにより既存テストは無変更で green、`assertNotLastAdmin` も dead code 化しない。
- **`currentUserId` の型整合 → ステップ 4 で確定。** prop を `string` で受け素の文字列等価比較。
- **promote/reinstate に `!isSelf` を付けない → ADR-002 で確定。** 構造上自己行に出ないため冗長を避ける。
- **エラー文言とコード値の一致。** CLAUDE.md の `*ErrorCode` 規約: value は lower_snake_case で `BusinessRuleError('...')` の spec 文言と整合。`errorCodeNaming.test.ts` が機械チェック（新コードは glob 自動 discover、EXPECTED 手動更新不要）。
- **層責務（BusinessRuleError vs ForbiddenError）の論点 → ADR-002 で BusinessRuleError を採用、異論も記録。**

## テスト方針

- 自動: domain/application 結合テストで自己 demote/suspend の拒否を確認。`pnpm typecheck`/`lint`/`test`。
- 手動: admin が 2 人以上いる状態で、自分の行に「一時停止」「管理者を解除」が出ないこと／他 admin の行には出ること。詳細は testing.md。

## レビュー履歴

### 1周目（2026-05-30、2視点並列）

**視点1（要件カバレッジ）**: 問題点ゼロ。Issue の確認ポイント（server fn ガード有無 / 最後の admin リスク / promote・reinstate 除外）を網羅と評価。改善提案 S-001〜S-004 を反映。

**視点2（アーキ・リスク）**: P-001（BusinessRuleError vs ForbiddenError）、P-002（ガード順序の未確定）、P-003（型整合の不明確）を指摘。

**反映した点**:
- ガード順序を確定（ADR-003）。`deleteAccount` が自己操作として `last_admin_protected` を別途担保していること、demote の last-admin は actor===target でのみ到達することを調査で確認し、demote では last-admin を先に評価する設計に確定。既存テスト無変更。
- `currentUserId` の型を `string` に確定（ステップ 4・P-003 対応）。
- promote/reinstate に `!isSelf` を付けない方針を ADR-002 に明記（S-003）。
- テスト最小構成を明記（S-004）。errorCodeNaming は手動更新不要を明記。
- usecase でのガード配置（suspend=早期 / demote=last-admin 後）の非対称を根拠付きで確定（S-002/S-003）。

**見送った／別判断**:
- P-001（ForbiddenError 化）: 採用せず。actor は admin 権限を保持しており「権限欠如」ではなく「target が自分という不正な操作対象」＝業務ルール違反。`assertNotLastAdmin` と同じく value object のみを取る純粋ヘルパーで domain `IdentityService` に整合。ADR-002 に異論として記録。
- P-002 の案A（self 優先）: 採用せず。demote で `assertNotLastAdmin` が dead code 化し既存テスト改変も要るため、案B（last-admin 優先）を採用。

### 終了判定
要件視点=問題点ゼロ、アーキ視点の P-001〜P-003 は決定・記録により解消。1周で収束したためレビューループ終了。
