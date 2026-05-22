# PR Review #002 — refactor(infra): move WorkersRoute from Pulumi to wrangler.toml

**PR:** #155
**Date:** 2026-05-23
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 4
- Verdict: **APPROVED**

---

## Round 1 指摘の追跡

- **W-001 (Infra)** ─ RESOLVED: テンプレートに「This route applies only to the web Worker (top level); relay/consumer/pruner/dlq have no public routes.」を追加
- **W-001 (Docs)** ─ RESOLVED: PR description に具体例「JST 02:00-04:00」を追加、stakeholder confirmed checklist 項目を追加
- **W-002 (Docs)** ─ RESOLVED: testing.md と PR description に `pulumi state list ... | grep workersRoute` の URN 確認コマンドを併記
- **W-003 (Docs)** ─ RESOLVED: `docs/runtime_cloudflare.md` に AAAA 誤削除時のリカバリー手順「run `pnpm infra:up:<stage>` to recreate it」を追加

---

## Infrastructure + Documentation + Operations

### Blockers
なし

### Warnings
なし

### Notes
- 4件すべての Warning が確実に解消されている
- 新規 Blocker / Warning は発生していない
- plan.md レビュー履歴 + testing.md の更新が一貫している
- AAAA 削除禁止と復旧の両面が docs に揃った

---

## Design Decisions

Round 2 で新規追加すべき設計判断なし。
