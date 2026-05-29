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

### Decision
**案B を採用**: demote では `assertNotLastAdmin(targetId, adminCount)` を `assertNotSelf(actorId, targetId)` より **前** に評価する。
- 単独 admin が自分を demote（count==1, actor===target）→ `last_admin_protected`（既存テスト無変更で green）。
- admin 複数で自分を demote（count>=2, actor===target）→ `self_operation_not_allowed`（新ガード）。
- suspend は last-admin 不変条件を持たないため、`assertNotSelf` を最速（`findById` 前）で評価し、自己 suspend は常に `self_operation_not_allowed`。

案A（self を先に評価）を退けた理由: demote で `assertNotLastAdmin` が**到達不能（dead code）**になり、かつ既存テストの改変を要する。案B は両ルールを生かし、既存テストを壊さない。

### Consequences
- 良い点: 既存テスト無変更。`demoteAdmin` の last-admin / self 両ガードが共に到達可能で意味を持つ。`deleteAccount` の last-admin 保護とも干渉しない。
- トレードオフ: 単独 admin が自分を demote した場合のメッセージが `self_operation_not_allowed` ではなく `last_admin_protected` になる（count==1 ではどちらも真であり、表示としては許容範囲）。usecase 間でガード配置が非対称（suspend=早期 / demote=last-admin 後）になるが、demote にのみ last-admin 不変条件があるためで、plan.md ステップ 3 に根拠を記載。
