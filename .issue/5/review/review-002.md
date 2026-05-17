# PR Review #002 — test: add integration tests for note / media / ingestion (Issue #5)

**PR:** #41
**Date:** 2026-05-18
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 全レイヤーで Round 1 指摘 16 件すべての解消を確認
- Verdict: **APPROVED**

---

## Test レビュー Round 2

### Blockers
なし

### Warnings
なし

### Notes
- Round 1 で指摘した 7 件すべてが妥当な形で解決済み
- OR-of-shapes / OR-of-code が全て確定的な単一値固定に置換、リグレッション検知能力が向上
- runIngestionJob の 7 成功経路に `errorCode === null` + `"fake structured"` 含有 assert が追加され、parser/extractor の mid-failure を検知可能に
- `acquireEditLock` の `acquiredAt` 前進 assert はドメイン現挙動を pin し、将来仕様変更時に確実に落ちる良い回帰防御

---

## Use Case 整合性 Round 2

### Blockers
なし

### Warnings
なし

### Notes
- W-U1 解消: ADR-004 #16/#17 で Outbox 名乖離を記録、テストは実装側イベント名を pin
- W-U2 解消: `acquiredAt` 前進 assert で自己ロック再取得の挙動を pin
- W-U3 解消: `ExtendNotOwner` に固定化し、ownership 先・liveness 後の判定順序をコメント明文化
- W-U4 解消: ADR-005 を新設し releaseEditLock holder release guard を明示承認の上で追加
- W-U5 解消: restoreNote outbox 検証に `every` ガード追加、deleteNote / purgeNote と粒度統一
- W-U6 解消: commitIngestionPreview overwrite に `ingestion.committed` outbox 検証追加
- 新規 Warning なし。修正コミットは plan / ADR / review の指示範囲内の局所的な変更

---

## Spec カバレッジ・計画整合 Round 2

### Blockers
なし

### Warnings
なし

### Notes
- W-S1 解消: ListNotesByOwner keyword `it.todo` が ADR-004 #18 と相互参照、Phase 4 起票方針も併記
- W-S2 解消: media NotFoundError 補助テストを削除、ADR-005 #2 に判断記録
- ADR-004 #14〜#18 が全件記録され、対応テストファイルからクロスリファレンスされている
- ADR-005 新規記録: releaseEditLock holder release guard を例外として承認、判断基準を明文化
- spec カバレッジ網羅性損なわれず: it.todo は計 4 件（全て ADR-004 に到達不能理由と Phase 4 起票方針記録済み）
- 新規スコープ違反なし: usecase / domain / helpers / fakes / spec/testcases に触れていない

---

## Design Decisions

新規設計判断なし。本ラウンドは Round 1 で承認済みの ADR-004 #14〜#18 / ADR-005 を反映する修正のみ。
