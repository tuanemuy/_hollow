# 動作確認計画 — Issue #178: tighten NoteRepository filter-sharing contract at the type level

**Issue:** #178
**作成日:** 2026-06-04

---

## 確認環境

本 Issue は **型のみのリファクタ（実行時挙動ゼロ変更）** であり、UI・ランタイム挙動の変更を伴わない。よってブラウザ検証は不要で、確認の主軸は型検査と既存テストの回帰ゼロ確認になる。

### 検証環境の起動
不要（サーバー起動なし）。確認は以下の CLI コマンドのみで完結する。

- `pnpm typecheck` — tsgo による型検査。構造保存（消費 6 ファイルの無変更通過）を保証する主検証。
- `pnpm test:unit` — vitest ユニットテスト。
- `pnpm test:integration` — vitest 統合テスト（`vitest.config.integration.ts`）。
- `pnpm lint:fix && pnpm format` — Biome（CLAUDE.md「After changes」規約）。

### デプロイ方法
なし（検証環境のみで確認できる。型変更なのでデプロイ不要）。

## 確認項目

### 1. 型検査の通過（構造保存）

- **目的:** `NoteOwnerFilters` 抽出後も `NoteOwnerListOpts` / `NoteOwnerCountOpts` の構造（プロパティ集合・optional 性・read-only 性）が保たれ、消費側がソース無変更で通ることを確認する。
- **手順:**
  1. `pnpm typecheck` を実行する。
- **期待結果:** ゼロエラーで通過する。adapter / usecase / domain service / test fake のいずれにも型エラーが出ない。
- **確認ポイント:** `app/core/adapters/d1/repositories/noteRepository.ts`（`buildOwnerListWhere` への ListOpts→CountOpts 代入）、`app/core/application/note/listNotesByOwner.ts`、`app/core/domain/export/service.ts`、`app/core/domain/directory/__tests__/service.test.ts` が無変更で通ること。

### 2. 既存テストの回帰ゼロ

- **目的:** 3 兄弟 (`findByOwner` / `countByOwner` / `listWithCount`) の filter 契約が挙動レベルで保たれていることを確認する。
- **手順:**
  1. `pnpm test:unit` を実行する。
  2. `pnpm test:integration` を実行する。
- **期待結果:** 既存の `noteRepository.integration.test.ts` / `listNotesByOwner.integration.test.ts` / `directory/service.test.ts` を含め全テストが PASS する。
- **確認ポイント:** フィルタ（status / tagIds / dateRange / visibility / referencingNoteId / directoryIds）の各経路の振る舞いが変わっていないこと。

## エッジケース・異常系

### 1. drift 強制の確認（手動・任意）

- **目的:** リファクタの眼目「フィルタ追加が list/count 両方へ構造的に伝播し漏れが起こせない」ことを確認する。
- **手順:**
  1. 一時的に `NoteOwnerFilters` に未使用フィルタ（例: `_probe?: string`）を 1 つ足す。
  2. `pnpm typecheck` を実行する。
- **期待結果:** `NoteOwnerListOpts` / `NoteOwnerCountOpts` 双方に自動反映され、count 側で「足し忘れ」が型レベルで起こりえないことを確認できる（`Pick` 時代のような手動同期が不要）。確認後はプローブを削除する。

## 既存機能への影響確認

- ノート一覧（owner スコープ）のフィルタ・件数表示: 型のみの変更なので挙動不変。`listNotesByOwner` 経由の一覧・総件数が従来通りであることは確認項目 2 の統合テストでカバーされる。
- export フロー（`export/service.ts` の `NoteOwnerListOpts` 組み立て）: 構造保存により無変更・無影響。

## 確認チェックリスト

- [ ] `pnpm typecheck` がゼロエラーで通過
- [ ] `pnpm test:unit` が全 PASS
- [ ] `pnpm test:integration` が全 PASS
- [ ] `pnpm lint:fix && pnpm format` でフォーマット差分なし（または整形済み）
- [ ] 消費 6 ファイルがソース無変更（test コメント追従を除く）で通る
