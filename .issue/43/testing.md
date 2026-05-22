# 動作確認計画 — Issue #43: spec/testcases text drift vs implementation

**Issue:** #43
**作成日:** 2026-05-23

---

## 確認環境

本 Issue は `spec/testcases/{note,media,ingestion}/index.md` のドキュメント更新と、`IngestionErrorCode.DailyUploadQuotaExceeded` の enum 追加・参照置換が主体。ランタイム挙動の変更は無いため、検証は静的検査と既存テストの green 維持に限定する。

### 検証環境の起動

ブラウザ動作確認は不要。次のローカルコマンドで担保する:

- `pnpm typecheck` — `IngestionErrorCode.DailyUploadQuotaExceeded` 参照が型として解決されることを確認
- `pnpm lint` — Biome lint
- `pnpm format:check` — フォーマット
- `pnpm test:unit` — `app/core/domain/__tests__/errorCodeNaming.test.ts` を含む全 unit テスト
- `pnpm test:integration` — `ingestion.integration.test.ts` の daily_upload_quota_exceeded ケースが enum 参照経由でも同じ挙動を維持することを確認

### デプロイ方法

なし（spec ドキュメント更新 + 小規模な enum 追加のみ。本番デプロイによる挙動変化は発生しない）

## 確認項目

### 1. enum 追加後の uploadFile 挙動

- **目的:** `IngestionErrorCode.DailyUploadQuotaExceeded` 参照置換後も `uploadFile` が同じ `BusinessRuleError("daily_upload_quota_exceeded", …)` を投げることを確認
- **手順:**
  1. `pnpm test:integration -- ingestion.integration.test.ts` を実行
  2. テストファイル内 `ADR-004 #14` の文脈で `code === "daily_upload_quota_exceeded"` を assert している箇所が pass することを確認
- **期待結果:** 全テストが green
- **確認ポイント:** 値（リテラル文字列）は変えていないので既存テストはそのまま通るはず

### 2. errorCodeNaming 規約適合

- **目的:** 追加した `DailyUploadQuotaExceeded` 定数が `lower_snake_case` 規約に通ること
- **手順:**
  1. `pnpm test:unit -- errorCodeNaming` を実行
- **期待結果:** PASS
- **確認ポイント:** Property key は `DailyUploadQuotaExceeded`（PascalCase）、value は `"daily_upload_quota_exceeded"`（lower_snake_case）— CLAUDE.md の規約に整合

### 3. spec markdown のリンク・テーブル崩れチェック

- **目的:** spec/testcases の table 修正で markdown が壊れていないこと
- **手順:**
  1. GitHub の PR ページで `spec/testcases/{note,media,ingestion}/index.md` の diff を確認
  2. table の列数・パイプ・改行が崩れていないことを目視確認
- **期待結果:** 表が正しくレンダリングされる
- **確認ポイント:** 文言中のバッククォート（インラインコード）の数が偶数になっているか

## エッジケース・異常系

なし（純テキスト変更 + 単一 enum エントリ追加。異常系の差分は無し）

## 既存機能への影響確認

- **`ingestion.integration.test.ts` の daily_upload_quota_exceeded ケース**: テストは error.code をリテラル文字列で比較するため、enum 経由になっても assertion は同じ
- **spec-sync 検出**: 次回 spec-sync 実行時に ADR-004 列挙の差分が「Resolved」扱いで再検出されないことを確認（運用次第）

## 確認チェックリスト

- [ ] `pnpm typecheck` が通る
- [ ] `pnpm lint` が通る
- [ ] `pnpm format:check` が通る
- [ ] `pnpm test:unit` が通る（errorCodeNaming 含む）
- [ ] `pnpm test:integration -- ingestion.integration.test.ts` が通る
- [ ] `spec/testcases/note/index.md` の table がレンダリングされる
- [ ] `spec/testcases/media/index.md` の table がレンダリングされる
- [ ] `spec/testcases/ingestion/index.md` の table がレンダリングされる
- [ ] `.issue/5/adr.md` のステータス追記が反映されている
