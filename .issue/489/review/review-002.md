# PR Review #002 — refactor: presentation → domain の id 型漏れを全スライスで解消

**PR:** #495
**Date:** 2026-06-05
**Round:** 2回目（再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 残存リーク再スキャンで id 型漏れキャスト用 import ゼロを確認
- Verdict: **APPROVED**

---

## 再レビュー結果

### Blockers
なし

### Warnings
なし

### 確認結果

- **W-PR-001 / W-AR-001 修正の妥当性**: `loadPublishStateForNote` の `listShareLinks` 呼び出しから no-op `Parameters<>` キャスト（actorUserId/noteId）を除去。`ListShareLinksInput` は string 化済みのため真に no-op で、新たなバグ・型エラー・挙動変更なし。
- **残存リーク再スキャン**: `grep -rn 'from "@/core/domain' app/components app/routes` の全ヒットを分類し、id 型漏れキャスト用 import が残存ゼロであることを確認。残るのは値型（`FrontMatterRecord`/`PublicationVisibility`）・定数（`MAX_DIRECTORY_DEPTH`/`MEDIA_ID_FROM_URL`）・エラークラス/コード（`BusinessRuleError`/`*ErrorCode`）・`.create()` 検証用の値 import（`DomainDirectoryId`/`DomainNoteId`、ADR-002）のみ。
- **typecheck**: `pnpm typecheck` exit 0、クリーン。
- **deferred（#496）判断**: 妥当。L514 の loader→repo 直接アクセス起因キャストは読み取り usecase 化（スコープ拡大）か `.create()` 置換（挙動変更）を要し別系統。pre-existing。
- **intentional（W-UC-001）判断**: 妥当。owner 比較は domain 境界呼出でなく単純文字列比較で、string 直比較は Issue 趣旨に合致。

### Verdict
**APPROVED**

---

## Design Decisions

特になし（ADR-003 は review-001 ラウンドで記録済み）。
