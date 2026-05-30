# ADR — Issue #315: admin UsersTable の自己操作禁止ガード

## ADR-001: 多重防御（UI 非表示 + usecase ガード）

### Status
Accepted

### Context
admin が自分自身を demote/suspend できてしまう。防ぎ方として「UI でボタンを隠すだけ」「サーバーでだけ弾く」「両方」の選択肢がある。UI だけでは server fn を直接叩けば迂回でき、サーバーだけでは押せてしまうボタンが残り UX が悪い。Issue 本文も「UI からも除外」かつ「サーバー側でも actor === target ガード（多重防御）」を提案している。

### Decision
両方実装する。UI（`UserRow`）で自分の行の suspend/demote ボタンを非表示にし、usecase（`demoteAdmin` / `suspendUser`）でも `actor === target` を弾く。

### Consequences
- 良い点: UI バイパス（直接 server fn 呼び出し）でも安全。押せるボタンは実行可能という UX 不変条件も保たれる。
- トレードオフ: 同じ意図のチェックが 2 箇所に分散する。ただしレイヤー責務が異なる（UX vs 不変条件）ため重複ではなく多重防御。

---

## ADR-002: 自己操作禁止を BusinessRuleError（IdentityService.assertNotSelf）で表現

### Status
Accepted

### Context
サーバー側ガードのエラー種別として `ForbiddenError("not_admin", ...)` 系（認可エラー）に寄せるか、`BusinessRuleError`（ドメイン不変条件）に寄せるかの選択がある。actor が admin であること自体は満たしている（認可は通る）が、「自分自身は操作できない」という業務ルールに反する状況である。既存の類似ルール「最後の admin は demote/delete できない」は `IdentityService.assertNotLastAdmin` が `BusinessRuleError(IdentityErrorCode.LastAdminProtected)` を投げるパターンで実装されている。

### Decision
`IdentityService.assertNotSelf(actorId, targetUserId)` を追加し `BusinessRuleError(IdentityErrorCode.SelfOperationNotAllowed, "...")` を投げる。`IdentityErrorCode` に `SelfOperationNotAllowed: "self_operation_not_allowed"` を追加。

promote/reinstate は自己行（active + admin）には構造上出ない・呼べないため、本 Issue ではガードを demote/suspend に限定する。UI 側も `!isSelf` を suspend/demote ボタンにのみ付け、promote/reinstate には付けない（出ない条件が既にあるため冗長を避ける）。

### 異論と反論（レビュー P-001）
レビューでは「自己操作禁止は actor 起点の制約＝認可関心事であり、`demoteAdmin` が actor の admin 権限を `ForbiddenError("not_admin")` で弾いているのと同じ層（application / ForbiddenError）に置くべき」との指摘があった。これを採用しない理由:
- actor は admin 権限を**保持している**（`not_admin` チェックは通る）。欠けているのは権限ではなく「target が自分自身」という操作対象の妥当性であり、これは業務ルール違反である。
- `assertNotSelf(actorId, targetUserId)` は 2 つの `UserId` value object のみを取る純粋関数で I/O を持たない。`assertNotLastAdmin` と同型の domain `IdentityService` ヘルパーとして自然に収まる（リポジトリ依存を持たないため domain 層配置の妨げにならない）。
- 既存の `assertNotLastAdmin` も「権限はあるが状態遷移が不変条件に反する」を `BusinessRuleError` で表現しており、本ルールも同じ系譜に置くのが一貫性が高い。

### Consequences
- 良い点: 「最後の admin 保護」と同じドメイン不変条件パターンに整合。`errorCodeNaming.test.ts` の命名規約（key=PascalCase / value=lower_snake_case）に適合。プレゼンテーション層は `kind`-tagged serialized form で構造的に扱え、HTTP status マッピングも既存機構に乗る。
- トレードオフ: 認可エラー（ForbiddenError）ではないため、表示文言・status が業務ルール違反扱いになる。これは意図どおり（権限はあるが操作対象が不正）。

---

## ADR-003: ガード評価順序と既存「最後の admin」テストとの整合

### Status
Accepted

### Context
`demoteAdmin` には既存テスト `rejects demoting the last admin` があり、actor===target（admin 1 人）で `last_admin_protected` を期待している。新たに `assertNotSelf` を導入すると、評価順序次第で「自分自身を demote」が `self_operation_not_allowed` で先に弾かれ、当該テストが落ちる。

**到達可能性の調査結果（決定の根拠）:**
- demote で `last_admin_protected`（`adminCount <= 1`）に到達できるのは **actor===target の時のみ**。理由: count<=1 なら admin は 1 人だけで、actor は admin でなければならない（`not_admin` チェック）ので、その唯一の admin = target = actor となる。つまり「他の admin が最後の admin を demote」は構造上起こり得ない。
- `assertNotLastAdmin` は `deleteAccount`（**自己アカウント削除**、actor 自身を削除するのが設計上の正）でも使われ、そちらの結合テスト（identity.integration.test.ts:1582）で `last_admin_protected` のカバレッジが独立に担保されている。

### Decision（最終）
**`demoteAdmin` から `assertNotLastAdmin` + `countAdmins()` を除去し、`assertNotSelf` を早期（authz チェック直後・`findById(target)` 前）に評価する。suspend と対称。**

根拠: 上記「到達可能性」より、demote で last-admin に到達するには actor===target が必須。`assertNotSelf` が actor===target をすべて塞ぐので、**最後の admin は demote では二度と落とせない**（落とすには自己 demote が要り、それが禁止される）。よって `demoteAdmin` の `assertNotLastAdmin` は `assertNotSelf` 導入後は完全に冗長（demote では発火経路が無い）。last-admin 保護のドメインヘルパー自体は `deleteAccount`（自己アカウント削除＝自己操作が設計上の正で、`assertNotSelf` を持たない）で引き続き到達・必要なので残す。

#### 検討の経緯
- 初稿では「案B（demote で last-admin を先に評価し既存テストを無改変に保つ）」を採用した。これは既存テストを壊さず多重防御の保険になる一方、(1) `demoteAdmin` 内の `assertNotLastAdmin` が冗長（デッド）になり、(2) suspend(早期)／demote(後置) のガード配置が非対称になる、という代償があった。
- PR #338 のレビュー（ユーザー指摘）でこの冗長・非対称が問題視されたため、最終的に冗長を除去する本決定へ改めた。

### Consequences
- 良い点: `demoteAdmin` の冗長な防御と `countAdmins()` の無駄な読み取りが消え、suspend と配置が対称になりコードが読みやすい。自己 demote は admin 数に関わらず常に `self_operation_not_allowed`。
- トレードオフ: 既存テスト `rejects demoting the last admin` を更新（単独 admin の自己 demote の期待エラーが `last_admin_protected` → `self_operation_not_allowed`、テスト名も `rejects an admin demoting their own account (sole admin)` に変更）。demote 経由の `last_admin_protected` は発生しなくなる（`deleteAccount` 経由でのみ発生・テスト済み）。多重防御の保険は1枚減るが、その保険は「`assertNotSelf` が壊れたとき」にしか効かず、デッドコードとして意図を曇らせる弊害の方が大きいと判断。
