# PR Review #001 — feat(issue/201): フォームのエラー UX 改善（入力保持・エラー明瞭化）

**PR:** #348
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 多数（いずれも肯定的）
- Verdict: **BLOCKED**（Warning 1件を修正後に再レビュー）

レビューレイヤー: アプリケーション層・エラー契約 / プレゼンテーション層・フロントエンド / セキュリティ / テスト の4視点で並列レビュー。

---

## アプリケーション層・エラー契約

#### Blockers
- なし

#### Warnings
- なし

#### Notes（要約）
- N-001: `ValidationError.toSerialized()` が presentation の `InputValidationError` と serialized 形が完全一致（kind/code/message/retryable/fieldErrors）。UI 側 `fieldErrorOf` がそのまま機能。
- N-002: `code="INVALID_INPUT"` は `errorCodeNaming.test.ts`（domain の errorCode.ts のみ glob）の対象外で衝突なし。既存 validation エラーと意図的に同一。
- N-003: 循環依存が正しく解消。`SerializedValidationError` を application/errors へ移設、errorResponse が re-export して後方互換維持。依存方向 presentation→application の一方向。
- N-004: `signUpAvailability.ts` の変換は握り潰しなし（username_taken/email_taken 以外は再throw）。スコープ外ユースケースはヘルパ非経由で business 据え置き。
- N-005: redact（validation 素通り）/ httpStatus（validation→422）/ race パス据え置き、すべて整合。
- N-006: UoW コールバック内 throw で insert 前にトランザクション中断。重複時に user 行が作られない。

## プレゼンテーション層・フロントエンド

#### Blockers
- なし

#### Warnings
- **[W-001]** `acceptTerms` の field error が aria 紐付けされていない
  - 場所: `app/components/auth/SignUpForm/index.tsx:247-277`
  - 理由: 他フィールドはエラー span に `id`、input に `aria-describedby` を付与しているが、acceptTerms だけエラー span に id が無く checkbox に aria-describedby も無い。`aria-invalid` のみでスクリーンリーダーが理由を読まない。plan ステップ6 の対象から漏れ。AdminSignUpForm 側は acceptTerms validation 表示自体が無く非対称も生じている。
  - 提案: acceptTerms 用の hint id（useId）を追加し、エラー時に span へ id、checkbox に aria-describedby を付与する。

#### Notes（要約）
- N-001〜N-006: 入力保持の機微フィールド除外（ADR-001）、aria-describedby の dangling id 回避、conflict→validation 変換（ADR-002/004）、Zod 日本語 message の signUp/adminSignUp 限定、formatFieldErrors の回帰なし、Styling 逸脱なし、をいずれも肯定。Setup Token callout 文言が #198 モックと一字一句一致。

## セキュリティ

#### Blockers
- なし

#### Warnings
- なし

#### Notes（要約）
- N-001: 列挙トレードオフは妥当、メール確認フロー必須の緩和根拠が実装と一致。
- N-002: conflict 文言「すでに登録されています」一本で情報量最小化。
- N-003: race パスは field 非紐付けのまま。
- N-004: 意図的曖昧化（invalid_credentials / setup_token / system / unknown）は緩んでいない。
- N-005: 内部情報の漏えいなし。ValidationError は抽象 code/message + 手書き日本語 fieldErrors のみ。redactForClient 機能維持。
- N-006: 機微フィールド（password / setupToken）非復元を確認。Setup Token callout も値を echo しない。
- N-007: 秘密情報のハードコードなし。

## テスト

#### Blockers
- なし

#### Warnings
- なし

#### Notes（要約）
- N-001/002/003: signUp 重複検出を validation/fieldErrors へ置換、adminSignUp は新規追加、changeUsername/requestEmailChange/verifyEmailChange/deleteAccount は business 据え置き、すべて計画どおり。
- N-004/005: errorDisplay の identity マッピングが EXPLICIT_IDENTITY_CODES + group(c) fallback パターンで網羅、内部 code 非露出を検証。formatFieldErrors のキー非露出テストも実効的。
- N-006: schema.test.ts は transport-only 検証として妥当。`Passw0rd!23`(11文字) が transport=8 を満たし domain=12 を満たさない乖離は schema テストでは無害（計画想定どおり）。

---

## 修正内容（このラウンドで対応）

- **W-001 修正**: `SignUpForm` の acceptTerms に `acceptTermsHintId`（useId）を追加し、checkbox に `aria-describedby`、エラー span に `id` を付与。
- **非対称の解消**: レビュアー指摘の非対称（AdminSignUpForm に acceptTerms validation 表示が無い）も同一動線の問題として `AdminSignUpForm` に acceptTerms の error 計算・aria-invalid・aria-describedby・エラー span を追加（SignUpForm と同パターン）。

## Design Decisions

特になし（既存 ADR-001〜004 の範囲内）。
