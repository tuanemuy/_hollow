# PR Review #002 — アップロード前にカスタムプロンプトを入力できる画面を追加 (#228)

**PR:** #339
**Date:** 2026-05-30
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 良好
- Verdict: **APPROVED**

1周目で出た Frontend / Test の Warning 4件の修正を再レビュー。Domain / Use Case / Adapter は1周目でクリーンかつ本ラウンドで変更がないため再レビュー対象外。

---

## Frontend

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- W-001 対応確認: `readPromptOverride` の over-cap throw が `AppServerError({kind:"validation", code:"INVALID_INPUT", retryable:false, fieldErrors})` に変更され、`SerializedValidationError` 型と厳密一致。`errorResponseMiddleware`（validation は redact せず）→ 422（`httpStatusFor`）→ `displayError` の validation 分岐で fieldErrors 表示、の経路を検証済み。
- W-002 対応確認: 両 textarea に `maxLength={16 * 1024}` 付与。maxLength は UTF-16 code unit でバイト上限の厳密下界ではないが、実ガードは transport の byte 検証で常に弾くため安全側。
- 新たな型・a11y・スタイル・整合性の問題なし。

## Test

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- W-001 対応確認: `readPromptOverride.test.ts`（9ケース）で trim/空→undefined/File 無視/バイト単位 over-cap（ASCII・マルチバイト両方で `length < cap < byteLength` を突く）/境界値受理/フィールド名固定（alias 排除）/validation エラー契約まで実 assert。
- W-002 対応確認: `UploadDialog.test.tsx` 追加で単一・複数ファイル全件適用・空時非 append を本物の FormData で検証。過剰モックなし。
- 実行結果: 対象2ファイル 37 件 PASS、全ユニット 150 files / 2806 tests PASS、回帰なし。

---

## Design Decisions

新規の設計判断なし。

## 完了

Blocker 0 / Warning 0 で **APPROVED**。1ラウンドクリーン到達のため Ready for review に切り替える。
