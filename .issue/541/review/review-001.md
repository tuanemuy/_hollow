# PR Review #001 — impl: 領域2 P13/P15 のモック検証・推奨バナー追従（#541）

**PR:** #554
**Date:** 2026-06-07
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning 全消し方針のため）

---

## Frontend

### Blockers
なし

### Warnings
- **[FE-W-001]** エラーバナーのアイコンが既存規約・モックと不一致（`XCircle`）
  - 場所: `app/components/ingestion/UploadForm.tsx:5,114`
  - 理由: プロジェクトのアラート重大度→アイコン対応は `admin/Dashboard/index.tsx` / `admin/Metrics/index.tsx` で `critical/error → AlertCircle` / `warning → AlertTriangle` / `info → Info` が確立済み。モック `P13-upload.html:963` のエラーバナーも円＋`!`（AlertCircle 系）で `XCircle`（×印）ではない。error のみ規約から外れている。
  - 提案: `XCircle` → `AlertCircle`（import も変更）。
- **[FE-W-002]** 未対応形式/サイズ超過が複数あるときの本文の助詞が不自然
  - 場所: `app/components/ingestion/UploadForm.tsx:118-149`
  - 理由: `code` を `, ` 連結した直後に「はアップロードできません」を続けるため、複数件で「`a.zip`, `b.exe` はアップロードできません」と最後のファイルにだけ係るような読みになる。
  - 提案: 列挙を先頭に出す形（「次のファイルはアップロードできません: `a.zip`, `b.exe`。…」）に統一。単数でも自然。

### Notes
- SSOT 定数化（ADR-002）/ ALERT* 再利用 / role・aria / 全除外時の非送信 / スコープ限定 / メール文言削除（ADR-005）いずれも計画・ADR に忠実で品質高い。

---

## Domain

### Blockers
なし

### Warnings
なし

### Notes
- `DEFAULT_MAX_INGESTION_BYTES` 新設 + `defaults()` 参照で SSOT 完全担保。ドメイン純粋性・依存方向・命名すべて規約準拠（ADR-002 一字一句整合）。テスト側に残る 50MB リテラルは独立検証として望ましく問題なし。

---

## Test

### Blockers
なし

### Warnings
- **[TEST-W-001]** 「一部除外時に accepted のみ送信」テストが回数しか見ていない
  - 場所: `app/components/ingestion/__tests__/UploadForm.test.tsx`（"uploads only the accepted files when some are rejected"）
  - 理由: `toHaveBeenCalledTimes(1)` のみで、送られたのが accepted であることを検証していない。
  - 提案: 混在バッチ（unsupported + oversized + accepted）にして accepted のみ送信される結合を明示。
- **[TEST-W-002]** サイズ超過の「一部除外」分岐がコンポーネント結合で未カバー
  - 場所: `UploadForm.test.tsx`
  - 理由: oversized 混在時に warning バナー表示 AND accepted 送信の併存が結合テストで未検証（`validateUploadFiles` 単体で間接カバーのみ）。
  - 提案: `[ok, big]` で warning 表示 + ok のみ送信を1ケース追加。
- **[TEST-W-003]** info バナーが「送信を阻害しない（advisory only）」ことの検証が無い
  - 場所: `app/components/export/ExportForm/__tests__/ExportForm.test.tsx`
  - 理由: ADR-003 の不変条件「バナーは推奨のみで送信を阻害しない」が未検証。
  - 提案: バナー表示中に submit → `enqueueExportMock` が呼ばれる1ケースを追加。

### Notes
- plan.md (a)〜(d) + evil.exe 調整 + 全除外非送信を網羅。モック戦略・独立性も既存パターンと一致。対象2ファイル 12 tests / ingestion+export 109 tests green。

---

## Design Decisions
特になし（既存 ADR で網羅済み）。
