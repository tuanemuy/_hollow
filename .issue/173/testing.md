# 動作確認計画 — Issue #173: perf(notes): listNotesByOwner で findByOwner + countByOwner の重複計算を回避

**Issue:** #173
**作成日:** 2026-05-23

---

## 確認環境

このIssueはアダプター内部のパフォーマンス最適化が中心で、外部観察可能な挙動（usecase 出力 `{ notes, count }`）に変化はない。検証は自動テストの整合性と、note 一覧画面の回帰確認が中心。マイグレーション・スキーマ変更なし。

### 検証環境の起動

```bash
pnpm dev
```

### 自動テスト（最重要）

```bash
pnpm typecheck          # ポート interface 変更が stub 全箇所に波及していないかを保証
pnpm test:integration   # D1 adapter の listWithCount と listNotesByOwner usecase の整合確認
pnpm test:unit          # 該当範囲は薄いが念のため
```

### デプロイ方法

検証環境（ローカル）でのみ確認可能。ステージング環境へのデプロイは不要（内部最適化のため）。必要な場合は:

```bash
pnpm deploy:staging
```

## 確認項目

### 1. note 一覧画面の回帰確認（filter なし）

- **目的:** `listNotesByOwner` の最も基本的な経路（`idScope === null`）が正常に動作することを確認
- **手順:**
  1. `pnpm dev` で開発サーバーを起動
  2. ブラウザでログインし、note 一覧ページにアクセス
  3. ページ送りを試す（1 ページ目、2 ページ目）
- **期待結果:** ページ上部の総件数表示と各ページの表示件数が一致し、ページ送りで重複/欠落がない
- **確認ポイント:** ヘッダーの「全 N 件中」表記が変わっていないこと（Issue #30 由来の不変条件が継承されていること）

### 2. visibility フィルタ適用時の一覧

- **目的:** `idScope !== null` 経路（chunk）の動作確認
- **手順:**
  1. 上記サーバーで一覧画面に遷移
  2. visibility フィルタを `public` のみ / `unlisted` のみ に切り替える
  3. 総件数と表示件数を確認
- **期待結果:** filter 適用後の総件数と表示が一致。プライベート note は除外される
- **確認ポイント:** filter 切り替え時のレスポンスタイムが体感で悪化していないこと（むしろ改善方向）

### 3. tagIds フィルタ適用時の一覧

- **目的:** `resolveTagAndCandidates` 経由の chunk 経路の動作確認
- **手順:**
  1. 複数 tag を持つ note を予め用意（または既存データ）
  2. 一覧画面で tag フィルタ（複数 tag の AND）を適用
  3. 結果件数と総件数を確認
- **期待結果:** 全 tag を持つ note のみが list に出て、count もそれと一致する
- **確認ポイント:** count が `items.length` ではなく filter 適用後の総件数を返していること

### 4. 空 intersected scope（filter で 0 件）

- **目的:** `intersected.size === 0` 短絡経路の確認
- **手順:**
  1. 存在しない tag ID で URL クエリを叩く、または該当 0 件になる filter を組み合わせる
- **期待結果:** UI に「該当 note なし」のような空表示。総件数 0
- **確認ポイント:** エラーや空配列以外の不正動作が発生しないこと

## エッジケース・異常系

### 1. note が大量（100+）の owner での挙動

- **目的:** chunk 経路（`idScope.size > 90`）の実機確認
- **手順:**
  1. 100 件以上の note を持つ owner で visibility filter を適用
  2. ページ送り（offset > 0）を確認
- **期待結果:** sort 順が正しく、count が全件数を返す。重複/欠落なし

### 2. 全 filter 無しでの大量データ一覧

- **目的:** `idScope === null` 経路でも `Promise.all` の並列 select + count が正しく合計を返すか
- **手順:**
  1. filter 無しで一覧画面を開く
  2. count とページ送り後の全件数累計を比較
- **期待結果:** 一致

## 既存機能への影響確認

- **search / directory / referrer 経路の note 一覧**: 本 Issue で変更されない（`findByOwner` / `countByOwner` 単体は残存し、他 usecase は影響を受けない）。念のため search / directory ページの note 表示が壊れていないことを確認
- **export 経路**: `runExportJob.ts` の inline stub にメソッド追加のみ。export 機能の実 e2e（ある場合）が回帰しないことを確認
- **directory subtree delete**: `StubNoteRepository` テストに throw 実装の `listWithCount` を追加する変更。`directory service test` がパスすることを `pnpm test` で確認

## 確認チェックリスト

- [ ] `pnpm typecheck` がパスする
- [ ] `pnpm test:integration` がパスする（特に `T-listWithCount-001..004` および既存 `T-bind-010..014`）
- [ ] `pnpm lint:fix && pnpm format` で diff が出ない
- [ ] note 一覧画面（filter なし）の総件数と表示が一致
- [ ] visibility filter での chunk 経路が正常動作
- [ ] tagIds filter での chunk 経路が正常動作
- [ ] 空 intersected で「該当なし」表示
- [ ] 大量 note (100+) の owner でページ送り正常
- [ ] search / directory 経路が回帰なし
