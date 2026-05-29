# PR Review #001 — feat(#315): admin の自己 demote/suspend を禁止（自己操作ガード）

**PR:** #338
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（設計準拠・非退行の確認）
- Verdict: **APPROVED**

レイヤー判定（複雑度=中〜大規模）: Domain+Application / Frontend / Test / Security の 4 視点で並列レビュー。

---

## Domain + Application

#### Blockers
- なし

#### Warnings
- なし（初稿で「suspendUser の IdentityService import 漏れ懸念」が挙がったが、`suspendUser.ts:2` に import 実在・`pnpm typecheck` も green のため誤検知と確認）

#### Notes
- `assertNotSelf` の branded string `===` 等価比較は正しい（`UserId = string & brand`）。
- `SelfOperationNotAllowed: "self_operation_not_allowed"` は命名規約に合致、`errorCodeNaming.test.ts` が glob 自動 discover。
- ガード順序（demote: assertNotLastAdmin → assertNotSelf / suspend: 早期）は ADR-003 どおりで last_admin_protected を dead code 化せず、既存テスト無変更。
- `deleteAccount` が自己操作として last_admin_protected を独立に担保している点も確認。

## Frontend / Presentation

#### Blockers
- なし
#### Warnings
- なし
#### Notes
- `currentUserId: string` prop と `user.id === currentUserId` は型安全・実行時とも正しい。
- promote/reinstate に `!isSelf` を付けない判断は構造上出ないため妥当（ADR-002）。
- `UsersTable` の呼び出し元は `Page.tsx` のみで prop 追加の影響漏れなし。
- RSC（Page）→ Client（UsersTable/UserRow）の境界・hydration 問題なし。CLAUDE.md スタイリング規約準拠。

## Test

#### Blockers
- なし
#### Warnings
- なし
#### Notes
- 追加 2 ケース（self demote / self suspend）は `isBusinessRuleError` + `error.code === "self_operation_not_allowed"` で十分に検証。
- demote の新テストは promote で admin 2 名にし last_admin を回避できている。username 衝突なし。`beforeEach` の truncate で隔離。
- 既存 `rejects demoting the last admin` は last_admin_protected のまま green。`can demote when another admin exists` が非自己 demote の非退行を担保。

## Security / 認可

#### Blockers
- なし
#### Warnings
- なし（UI バイパス・入力検証・最後の admin 干渉・情報漏洩いずれも OK 判定）
#### Notes
- 多重防御は有効。UI 迂回で server fn を直叩きしても `assertNotSelf` が拒否。actor.id はセッション由来で詐称不可。
- エラー `kind` から「自分」か「存在しない」かを推測しうる程度の理論的 enumeration はあるが、admin 限定操作のため実用リスクは低い。

---

## Design Decisions

特になし（Phase 1 で記録した ADR-001〜003 の範囲内。実装は ADR どおり）。
