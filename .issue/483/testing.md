# 動作確認計画 — Issue #483: lint 警告をまとめて解消する

**Issue:** #483
**作成日:** 2026-06-28

---

## 確認環境

本 Issue は lint 設定・テストコードの修正のみで、ランタイム挙動は変えない。
確認はすべて CLI コマンドで完結し、検証サーバーの起動・デプロイは不要。

### 検証環境の起動
不要（ブラウザ動作確認の対象外）。

### デプロイ方法
なし（検証環境のみで確認できる）。

## 確認項目

### 1. lint がクリーンに通る

- **対応する受け入れ基準:** AC-1
- **目的:** 警告・info がゼロになったことを確認する
- **手順:**
  1. `pnpm lint` を実行する
- **期待結果:** `Found 0 warnings.` かつ info も表示されない（`Checked N files` のみ）
- **確認ポイント:** 残存する警告・info が 1 件もないこと

### 2. 型チェックが通る

- **対応する受け入れ基準:** AC-2
- **目的:** `void` インライン化・narrowing 変更で型が壊れていないこと
- **手順:**
  1. `pnpm typecheck` を実行する
- **期待結果:** エラーなく完了する
- **確認ポイント:** 特に `PublishSettings/index.tsx` の `useActionState<void, FormData>`

### 3. ユニットテストが通る

- **対応する受け入れ基準:** AC-3, AC-4
- **目的:** テストの意図が保たれ、全ケースが PASS すること
- **手順:**
  1. `pnpm test:unit` を実行する
- **期待結果:** 全テスト PASS
- **確認ポイント:** 修正した inlineEditor / Ingestion / highlightSnippet / publication 系テスト

## エッジケース・異常系

なし（純粋な lint/型の静的修正のため）。

## 既存機能への影響確認

- ランタイムコード（`WysiwygEditor.tsx`・`PublishSettings/index.tsx`・
  `useRestoreFieldFocusOnCommit.ts`）の修正は型・抽出のみで挙動非変更。
  上記 `pnpm typecheck` / `pnpm test:unit` で担保する。
