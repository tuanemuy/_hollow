# PR Review #001 — perf(security): changePassword の二重 verify / 二重 hash を解消

**PR:** #353
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 多数
- Verdict: **BLOCKED**（Warning 2件を要修正）

レビュー視点: Security / Adapter・UseCase（契約・アーキ）/ Test の3並列。

---

## Security

### Blockers
なし

### Warnings
なし

### Notes
- N-001: 新 `verifyCurrentForChange` は `verifyPasswordForUser` と行 selection・guard がバイト単位で等価（`maybeRehashLegacy` 1行のみ落ちている）。enumeration 防御・情報差・timing 維持。
- N-002: 例外の握り潰しなし。DB select 例外のみ `SystemError(DatabaseError)`、`verifyHash` 配下は内部 catch で false。mismatch(401) と DB障害(500) が正しく分離。
- N-003: 401 surface 正しい。`AuthenticationError`→kind unauthorized→401。旧 `BusinessRuleError("invalid_credentials")`(422) は全 grep で残骸なし。
- N-004: UoW deferred-batch。mismatch は `pending.add` 前に throw → 書き込み flush なし。401 と変更不成立が両立。
- N-005: rehash 抑制でも changePassword は必ず `hashScrypt(newRaw)` で上書き → legacy 残らず。
- N-006: logIn/requestEmailChange の lazy upgrade 非干渉。why-not コメントも適切。
- N-007: soft-delete テストが `deletedAt` guard を固定。

## Adapter / Use Case

### Blockers
なし

### Warnings
なし

### Notes
- N-001: adapter→application の `AuthenticationError` throw は cross-layer policy と整合（再翻訳でなく port 契約の実装。`SystemError` import の前例あり）。
- N-002: UoW 使用正しい。`run()` の try/catch は `db.batch()` のみ包み `fn` の throw は伝播。verify+throw が `pending.add` 前。
- N-003: 新 helper のクエリは `verifyPasswordForUser` と完全等価。catch 範囲も同形。
- N-004: port JSDoc 契約（mismatch→AuthenticationError、no-rehash）と実装一致。クラス JSDoc に why-not 記録。
- N-005: import 残骸なし（`BusinessRuleError` は他箇所で使用継続、usecase の `AuthenticationError` import 削除）。typecheck クリーン。
- N-006: pre-verify 廃止でロジック欠落なし。`revokeOtherSessions` 後続無変更。requestEmailChange 無変更。
- N-007: plan.md 全4ステップ・ADR-001 どおり。乖離なし。

## Test

### Blockers
なし

### Warnings
- **[W-001]** round-trip テストが「新パスワードでログイン可」を検証していない（旧パス失敗のみ assert）。adapter の write 経路を触る PR なので positive assertion がないと「verify 通過するが新パス write が壊れる」退行を捕捉できない。
  - → **修正済み**: `it("changes the password when current is correct")` に変更後 `logIn({ password: "NewPass2345!" })` 成功 + `userId` 一致の assertion を追加。
- **[W-002]** Issue の核心（legacy 経路 / rehash 抑制）を直接検証するテストが無い。soft-delete テストは selection 等価性のみ。
  - → **修正済み**: `it("changes a legacy PBKDF2 account's password to a scrypt hash")` を追加。legacy PBKDF2 を seed → changePassword（legacy 現パス受理を検証）→ 変更後 `accounts.password` が `$scrypt$` prefix・新パスでログイン可・旧 legacy パス不可を assert。`makeLegacyPbkdf2Hash` を module スコープに hoist し lazy-upgrade describe と共有（重複排除）。
  - 限界の明記: 「rehash UPDATE が積まれない」厳密検証は UoW pending 観測が必要で統合テストでは観測不能（rehash と change の両 UPDATE は同 batch 内で最終状態 scrypt(new) に収束し挙動差が出ない）。よって挙動面（legacy 受理 + 新 scrypt write）を固定し、rehash 再混入の回帰は why-not JSDoc で防ぐ方針。

### Notes
- N-001: soft-delete テストは `deleteAccount`（credentials CASCADE 削除）の罠を回避し `deletedAt` 分岐を正確に固定。
- N-002〜N-006: アサーション適切 / 誤パステストは throw 出所変更後も shape 不変で green / lazy・requestEmailChange 回帰は diff 無 + 全 green で担保 / テストデータ独立性 OK。

---

## Design Decisions

このラウンドで新規の設計判断なし（ADR-001 の範囲内）。W-002 の「rehash 抑制は perf-only で挙動非観測」という性質は plan のテスト方針注記と整合。

## 対応方針

- W-001 / W-002 とも **その場で修正**（同一テストファイル内・スコープ内）。別Issue 起票なし。
- 修正後 integration **480 passed**、typecheck / lint クリーン。Round 2 で再レビュー。
