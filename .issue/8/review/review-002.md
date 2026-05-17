# PR Review #002 — feat(note): P10 visibility & internal-link reference filters

**PR:** #28
**Date:** 2026-05-17
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 2（adapter status セマンティクス + テスト追加）
- Notes: Frontend は APPROVED、その他レイヤーは前回 Warning すべて解消
- Verdict: **BLOCKED**（軽微 Warning 2件のため修正後 Round 3 へ）

---

## Frontend (APPROVED)
- F-W-001 / F-W-002 / F-W-004 すべて解消
- 死コード残骸なし

## Adapter

### Warnings
- **[I-W-005]** `resolveVisibilityCandidates` の `statusFilter = opts.status ?? "active"` が外側の `if (opts.status)` ガードと非対称。`status` 未指定時に「全 status」でなく「active のみ」に絞られる副作用
  - 場所: `noteRepository.ts:327-353,446-456`
  - 修正方針: `statusFilter` 引数を `opts.status` (undefined 含む) そのまま受け取り、undefined のときは sweep にも status 条件を入れない

## Test

### Warnings
- **[T-W-007]** `wantsPrivate=true × status='trashed'` の組み合わせテスト欠落（I-W-002 修正＋ I-W-005 対応で必須）
  - 場所: `noteRepository.integration.test.ts:299-330`

## 修正対応

Round 2 完了時点で:
- I-W-005: `statusFilter: NoteRow["status"] | undefined` に変更、sweepConditions 配列で条件を可変にした
- T-W-007: `status='trashed' + visibility=['private']` ケース追加（trashedPrivExplicit + trashedPrivImplicit が両方返る、activePriv / trashedPublic は除外される）

Round 3 で最終確認予定。
