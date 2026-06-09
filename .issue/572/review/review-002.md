# PR Review #002 — feat(settings): P22 アクティブセッション一覧

**PR:** #614
**Date:** 2026-06-09
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 1（修正済み）
- Notes: 多数（良好）
- Verdict: 修正後 **APPROVED 見込み**（Round 3 で確認）

---

## Backend + Security

### Blockers / Warnings
なし（Round 1 の B-W-001/B-W-002 は JSDoc 補強で解消、token 非露出・所有者スコープ・期限切れ除外・transport 検証すべて維持。Security 完全クリーン）。

---

## Test

### Blockers / Warnings
なし（T-W-001 個別モック化・T-W-002 UA 固定化とも完全解消、回帰なし。3連続実行で flaky なし）。

### Notes
- [N-003] アダプタ `orderBy(desc(createdAt))` の id tiebreak 欠如は本 PR の回帰でなく既存由来。logIn が scrypt 検証を挟むため実質ミリ秒衝突せず安定。恒久対応は別 Issue（`desc(sessions.id)` tiebreak、UUIDv7 で createdAt 単調）で検討可。

---

## Frontend

### Blockers
なし

### Warnings
- **[F-W-003]** 行失効成功の live region が 2 回目以降サイレント。`rowRevoked` が sticky bool で、`setRowRevoked(true)` が 2 件目以降 no-op → テキスト不変 → SR が再読み上げしない。ADR-005 の「一括失効との非対称解消」が初回限定になっていた。
  - 場所: `app/components/identity/SecurityForm/index.tsx`
  - → **修正済み:** `rowRevokedCount`（累積カウント）に変更し、メッセージに件数を含めて毎回テキストを変化させ再アナウンスを保証（一括失効の `revokedCount` と同じ理屈）。ADR-005 更新。

### Notes
- [N-002] `transition-opacity` に `motion-reduce:transition-none` 欠落（前例 `NoteListViews` に準拠すべき）→ **修正済み**（`SESSION_ROW` に追記）。
- [N-001/N-003/N-005] `data-[revoking]:opacity-60` variant 機能、行 unmount 回避の親通知設計、状態管理・規約整合は良好。

---

## Design Decisions

ADR-005 を「sticky bool → 累積カウント」「motion-reduce 併記」に更新。
