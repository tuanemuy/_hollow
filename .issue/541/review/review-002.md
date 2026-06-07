# PR Review #002 — impl: 領域2 P13/P15 のモック検証・推奨バナー追従（#541）

**PR:** #554
**Date:** 2026-06-07
**Round:** 2回目（review-001 指摘対応の確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: review-001 の Warning 5 件すべて解消を確認
- Verdict: **APPROVED**

---

## review-001 指摘の解消確認

| ID | 内容 | 対応コミット | 確認結果 |
| --- | --- | --- | --- |
| FE-W-001 | error バナーのアイコンが `XCircle` で規約/モック不一致 | bd18f9c | `AlertCircle` に変更。`grep XCircle` で残存ゼロ。`AlertCircle/AlertTriangle/Info` の重大度→アイコン規約に整合（`UploadForm.tsx:114`） |
| FE-W-002 | 複数除外時の本文の助詞が不自然 | bd18f9c | 「次のファイルは…できません: `a`, `b`。」形式に統一。単数でも自然（`UploadForm.tsx:118-126,138-148`） |
| TEST-W-001 | 一部除外時 accepted のみ送信を回数しか見ていない | bd18f9c | 混在バッチ（unsupported + oversized + accepted）で送信 FormData の file 名が accepted であることを明示検証 |
| TEST-W-002 | サイズ超過の一部除外分岐が結合未カバー | bd18f9c | `[ok, big]` で warning 表示 AND in-limit のみ送信のケースを追加 |
| TEST-W-003 | info バナーが送信を阻害しないこと（ADR-003 不変条件）が未検証 | bd18f9c | バナー表示中に submit → `enqueueExportMock` が呼ばれる結合ケースを追加 |

## 検証

- `pnpm typecheck`: green
- `pnpm test:unit`: 195 files / 3311 tests green
- `pnpm format:check`: clean
- `pnpm lint`: 変更ファイル（UploadForm / UploadDialog / ExportForm）に警告なし（残存 23 警告は無関係な既存ファイル）
- CI（PR #554）: Lint/Format/Typecheck/Unit・Integration・Build すべて SUCCESS
- `UploadDialog.tsx` は `UploadValidationBanners` / `validateUploadFiles` を共有 import しており、アイコン規約・文言修正がモーダル側にも自動的に波及

## 結論

review-001 の Warning 5 件は全消し。新規の Blocker/Warning なし。レビューループ収束。マージ可能。
