# 動作確認計画 — Issue #50: search index の CJK FTS トークナイズ対応

**Issue:** #50
**作成日:** 2026-05-20

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

```bash
# 1. 新規 migration をローカル D1 に適用
pnpm db:apply:local

# 2. Issue #29 の seed を流して CJK 文書を含む corpus を用意
wrangler d1 execute tanstack-start-template-d1 --local --file .issue/29/.manual-test/seed.sql

# 3. dev server 起動
pnpm dev
```

ブラウザで http://localhost:3000 を開いてサインインし、検索 UI から確認する。

### デプロイ方法

```bash
# ステージング適用
pnpm db:apply:staging

# 本番適用（ステージングで検索不可窓の計測完了後）
pnpm db:apply:production
```

migration 内で `INSERT … SELECT FROM search_documents` が走るため、本番 corpus 規模によっては適用時間がリビルドサイズに比例する。ステージング適用後に `SELECT COUNT(*) FROM search_documents` で規模確認、適用時間が長い場合はメンテ告知を検討。

## 確認項目

### 1. CJK 部分一致検索（Issue #50 の中核要件）

- **目的:** 連続する CJK 文字（漢字・かな・カナ）を含むキーワードで部分一致検索が機能することを確認
- **手順:**
  1. seed 適用後、検索 UI で `?q=デザイン` を実行
  2. ヒット件数と各 hit の title / snippet を確認
- **期待結果:** 「公開デザインガイド」「Project A デザインメモ」など、本文または title に `デザイン` を含む note が複数件ヒットする（unicode61 時代は 0 件だった）
- **確認ポイント:** snippet の `<mark>デザイン</mark>` ハイライト箇所が正しく表示されていること

### 2. ASCII 検索のリグレッションなし

- **目的:** trigram 移行で ASCII 検索が壊れていないことを確認
- **手順:**
  1. 検索 UI で `?q=design` を実行
  2. ヒット件数と各 hit を確認
- **期待結果:** Issue #29 時代と同等のヒットセットが返る（件数の絶対値は trigram の特性で多少増減する可能性あり、ただし期待される note は引き続きヒット）
- **確認ポイント:** `Project A`, `Project B`, `design` 関連 note が引き続き出現すること

### 3. visibility フィルタとの組み合わせ

- **目的:** Issue #29 で実装した visibility フィルタが trigram 移行後も正しく動くことを確認
- **手順:**
  1. `?q=デザイン&visibility=public` を実行
  2. `?q=デザイン&visibility=private` を実行
  3. `?q=デザイン&visibility=unlisted` を実行
- **期待結果:** 各 visibility の組み合わせで、当該 visibility の note のみが返ること
- **確認ポイント:** Issue #29 の検証結果（`.issue/29/.manual-test/results/summary.md`）と件数が整合（CJK ヒットが追加される分のみ増加）

### 4. 混在検索（CJK + ASCII）

- **目的:** 1 つのクエリに CJK と ASCII が混在しても正しく動くことを確認
- **手順:**
  1. `?q=Project デザイン` を実行（スペース区切りで AND クエリ）
- **期待結果:** title に「Project A デザインメモ」のような両方のトークンを含む note がヒット
- **確認ポイント:** トークン分割と各 phrase quote が正しく FTS5 に届いていること（エラーが出ない）

## エッジケース・異常系

### 1. 短すぎるキーワード（1-2 codepoint）

- **目的:** trigram の 3 codepoint 下限制約が adapter ガードで明示的に 0 件として返ることを確認
- **手順:**
  1. `?q=あ`（1 codepoint CJK）を実行
  2. `?q=AI`（2 codepoint ASCII）を実行
  3. `?q=🎨`（1 codepoint サロゲートペア絵文字）を実行
- **期待結果:** すべて 0 件のレスポンスが返る。エラー画面や 500 ステータスは出ない
- **確認ポイント:** UI 上で「該当なし」表示が正しく出ること

### 2. FTS5 メタ文字を含むキーワード

- **目的:** `buildMatchExpression` の既存サニタイズ（`["\\]` 除去）が trigram 移行後も機能することを確認
- **手順:**
  1. `?q="デザイン` を実行
  2. `?q=デザイン:title` を実行
- **期待結果:** FTS5 パーサーエラーが出ず、`デザイン` でヒットするか 0 件のいずれか（クラッシュしない）

## 既存機能への影響確認

- **検索 UI の OR / AND / フレーズ動作**: 既存の検索ロジック（`buildMatchExpression` の phrase quote 連結）が trigram で引き続き機能すること
- **`bm25` スコアによる並び順**: 順位の微変動はあるが、明らかな破綻（最も関連度の高い hit が最後尾に来る等）がないこと
- **snippet の `<mark>` ハイライト**: trigram でも `snippet()` 関数経由のハイライトが正しく出ること
- **cursor pagination**: 検索結果が複数ページにわたる場合の「次へ」遷移が正しく動くこと
- **既存 D1 integration test の通過**: `pnpm test:integration` で `noteRepository.integration.test.ts` 等が全て PASS（新規 migration が壊れていないことの暗黙の smoke）

## 確認チェックリスト

- [ ] `pnpm db:apply:local` がエラーなく完了する
- [ ] `?q=デザイン` で複数件ヒット
- [ ] `?q=design` で Issue #29 時代と同等のヒットセット
- [ ] `?q=デザイン&visibility=public/private/unlisted` の各組み合わせで visibility フィルタが効く
- [ ] `?q=Project デザイン` の混在クエリで AND マッチ
- [ ] `?q=あ` / `?q=AI` / `?q=🎨` で 0 件（エラーなし）
- [ ] FTS5 メタ文字キーワードでクラッシュしない
- [ ] snippet ハイライトが正しく表示される
- [ ] cursor pagination が動作する
- [ ] `pnpm test:integration` が全て PASS
- [ ] `pnpm test:unit` が全て PASS
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` が成功する
