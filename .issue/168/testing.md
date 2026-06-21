# 動作確認計画 — Issue #168: countByNoteId を SQL count(*) 集計に変更

**Issue:** #168
**作成日:** 2026-06-21

---

## 確認環境

本Issueはアダプター層の SQL 発行方法のみの変更で、戻り値の型・意味（revision 件数の `number`）も外部から見える振る舞いも変わらない。検証は real-DB integration test と静的チェックで担保する（ブラウザでの目視確認は新たな観点がないため対象外）。

### 検証環境の起動
ブラウザ起動は不要。検証コマンドのみ:

```bash
pnpm typecheck
pnpm lint
pnpm test:integration
```

### デプロイ方法
なし（検証環境のみで確認できる）。

## 確認項目

### 1. countByNoteId が正しい件数を返す

- **対応する受け入れ基準:** AC-1, AC-2
- **目的:** SQL 集計に変更後も、note に紐づく revision 件数が正しく返ることを確認する。
- **手順:**
  1. `pnpm test:integration` を実行する
  2. `noteRevisionRepository.integration.test.ts` の「countByNoteId reflects the number of stored revisions」がパスすることを確認する
- **期待結果:** テストが PASS（2 件挿入で `count === 2`）。
- **確認ポイント:** 全行 materialise ではなく `count()` 集計で件数を得ていること（実装の SELECT が `select({ value: count() })` になっていること）。

### 2. 型・静的チェック

- **対応する受け入れ基準:** AC-3
- **目的:** `count()` の戻り値を型安全に受けられていることを確認する。
- **手順:**
  1. `pnpm typecheck` を実行する
  2. `pnpm lint` を実行する
- **期待結果:** いずれもエラーなし。

## エッジケース・異常系

### 1. revision が 0 件の note

- **目的:** 該当 note に revision が 1 件も無い場合に `0` を返すこと。
- **手順:** integration test で revision を挿入していない note に対する `countByNoteId` 呼び出し（既存テストのセットアップで間接的にカバー、必要なら手元で確認）。
- **期待結果:** `Number(rows[0]?.value ?? 0)` により `0` が返る。

## 既存機能への影響確認

- SaveNote の上限判定（`maxNoteRevisionsPerNote`）と note history 一覧の total 表示が `countByNoteId` を利用している。戻り値の型・意味は不変のため挙動は変わらない。`pnpm test`（unit + integration）全体がグリーンであることで回帰がないことを確認する。
