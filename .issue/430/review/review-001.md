# PR Review #001 — プロンプト設定の関心分離: #396 残課題（P23 文言整合 / dead-input 解消）

**PR:** #444
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 12
- Verdict: **BLOCKED**（W-001 を修正して再レビュー）

---

## Backend

### Blockers
- なし

### Warnings
- **[W-001]** `runIngestionJob` の title/directory resolve が直列 `await` 2回
  - 場所: `app/core/application/ingestion/runIngestionJob.ts:300-307`
  - 理由: 配置（LLM 構造化分岐に閉じる・html/markdown では呼ばない）は正しいが、`titlePrompt`/`directoryPrompt` の2 resolve は相互依存がないのに直列 await で、resolver が remote lookup だと往復が直列化する。
  - 提案: `Promise.all([resolveFor(title), resolveFor(directory)])` で並列化。

### Notes
- ヘキサゴナル依存方向健全（port へのフィールド追加→3 adapter は input 透過、ロジック追加ゼロ）。
- #396 関心分離モデルへ厳密整合（operatorIntentSection 3フィールド再利用、JSON 契約 tail はシステム所有で末尾固定）。
- ADR-004 非対称配置は妥当かつテストで検証可能。
- エラー契約への影響なし、スコープ逸脱なし（ocr_assist/UploadDialog/getEffectiveIngestionPrompts 不変）。
- resolver 呼び出しが LLM 構造化分岐のみに閉じることをテストが担保。

## Frontend

### Blockers
- なし
### Warnings
- なし
### Notes
- ADR-003/plan step4 の4文言整合を全て正しく反映、所有ニュアンス保持。
- UX 機構（空 trim 時エラー表示で保存ブロック）現状維持、a11y 破壊なし。
- placeholder 定数 `INTENT_PLACEHOLDER` 命名一貫、admin と意図的に文言差分化（所有ニュアンス）。
- 「全文上書き／プロンプト本文」前提の表現は残存なし。

## Test

### Blockers
- なし
### Warnings
- なし
### Notes
- prompts.test 15 / runIngestionJob 結合 27 / 3 adapter 90、typecheck 全通過。
- 非ユニークラベル罠を「ラベル＋ガイダンス行複合文字列」で正しく回避。
- 空文字時非追記・3意図全非空時の非対称配置順序・JSON 契約 tail 維持を assert。
- override 併存時の resolver 呼び出し変化（structure/metadata 非経由・title/directory のみ）を厳密順序で固定。
- 必須フィールド追加の型追従を全8系統で確認、漏れなし。

---

## Design Decisions

特になし（既存 ADR-001〜004 の範囲内）。
