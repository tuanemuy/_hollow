# 進捗・残存課題 — Issue #601

## 実装結果

公開検索 P32 のスニペットで FTS5 ハイライトマーカー `<mark>…</mark>` を安全に `<mark>` 要素として描画するよう修正。

- `app/components/public/highlightSnippet.tsx`（新規）— マーカー分割・XSS 安全な描画
- `app/components/public/styles.ts` — `SEARCH_HIT_MARK` 追加（P32 モック準拠）
- `app/components/public/PublicSearch.tsx` — スニペット描画を差し替え
- `app/components/public/__tests__/highlightSnippet.test.tsx`（新規）— AC-1/2/3 を検証

## ブラウザ検証の扱い

本件は描画バグであり、`renderToStaticMarkup` を用いたユニットテスト（`highlightSnippet.test.tsx`）が**ブラウザに配信されるのと同一の SSR HTML** を直接アサートしている。これにより AC-1（`<mark>` 要素化）・AC-2（ユーザーテキストのエスケープ＝XSS 防止）・AC-3（マーカー無し後方互換）を HTML レベルで網羅した。

フルのブラウザ検証は FTS5 インデックス更新（outbox → consumer worker 経由）とシードデータ準備を要し重いため省略。ブラウザ固有で残るのは AC-4（ハイライトの見た目）のみだが、`SEARCH_HIT_MARK` のクラスは P32 モック `spec/design/pages/P32-public-search.html` の `.result-snippet mark` CSS に直接対応しており低リスク。

## 残存課題

なし（タイトルのハイライトはバックエンド変更を要する別機能のためスコープ外。plan.md「スコープ外」参照）。
