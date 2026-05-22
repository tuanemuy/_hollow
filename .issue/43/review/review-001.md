# PR Review #001 — docs(spec): align testcases wording with implementation behavior (#43)

**PR:** #161
**Date:** 2026-05-23
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 6
- Verdict: **BLOCKED**（W-001 修正後 APPROVED 想定）

---

## General Review

### Blockers

なし

### Warnings

- **[W-001]** `SystemError` の引数表記が実装値（UPPER_SNAKE）と spec 文言（lower_snake）で一致していない
  - 場所: `spec/testcases/note/index.md:12`, `spec/testcases/media/index.md:9`
  - 理由: 実装は `SystemErrorCode.ExternalApiError = "EXTERNAL_API_ERROR"` / `DataIntegrityError = "DATA_INTEGRITY_ERROR"`（UPPER_SNAKE、`app/core/application/errors/index.ts:165-170`）。一方 spec は `SystemError('external_api_error')` / `SystemError('data_integrity_error')` と lower_snake で記載されている。CLAUDE.md にも「`SystemErrorCode` is the sole exception and stays `UPPER_SNAKE`」と明文化されており、本 PR の目的「spec 文言を実装挙動と一字違わず一致させる」に正面から反する。
  - 提案: `SystemError(ExternalApiError)` / `SystemError(DataIntegrityError)` のように PascalCase の symbol 形で記載する（`spec/usecases/adminSettings.md:150` の `SystemError(DatabaseError)` の流儀と揃う）。
  - 対応: **修正済み**（commit で spec を `SystemError(DataIntegrityError)` / `SystemError(ExternalApiError)` に書き換え）

### Notes

- **[N-001]** spec 14 項目すべてが PR でカバーされ、実装値（`MediaErrorCode.ByteSizeExceeded` / `NoteEvents.trashed`/`restored` / `IngestionErrorCode.ByteSizeExceedsLimit` / `ForbiddenError("NOTE_FORBIDDEN"|"DIRECTORY_NOT_FOUND"|"INGESTION_JOB_FORBIDDEN")`）と厳密に一致している。
- **[N-002]** `IngestionErrorCode.DailyUploadQuotaExceeded = "daily_upload_quota_exceeded"` は `errorCodeNaming.test.ts` の `KEY_REGEX` / `VALUE_REGEX` を通過。
- **[N-003]** `.issue/5/adr.md:59` の Status 行は「Resolved by #43」と起点を明示しつつ、対応外項目（#1/#10/#11/#15 リトライ/#18）と「乖離なし」の #8 まで列挙されており、spec-sync 再判定の根拠として十分。
- **[N-004]** Markdown テーブルは 3 ファイルとも全行 5 列でレンダリング崩れなし。
- **[N-005]** PR の変更ファイルは spec/ 修正と最小限の enum 追加・参照置換のみで、Issue 範囲を厳格に守っている。
- **[N-006]** ADR-004 #5 のうち `unsupported_format` / `regeneration_limit_exceeded` / `invalid_status_for_*` は #82 で既に lower_snake 正規化済みであり、追加修正不要との判断が正しい。

---

## Design Decisions

特になし（W-001 は規約適用ミスの修正であり、新たな設計判断ではない）
