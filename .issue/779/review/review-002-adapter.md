# レビュー(2回目): PR #785 — Adapter / Infrastructure (D1/FTS5)

対象: Issue #779「公開検索(P32)の結果タイトルにもキーワードハイライトを適用する」
観点: Adapter / Infrastructure（FTS5 の挙動・SQL の正しさ・カラムインデックス・エスケープ・既存パターン一貫性）
方針: 前回(review-001-adapter.md: Blocker/Warning なし)の結論に依存せず、ゼロベースで再精査。

## 検証手順
- `gh pr diff 785` で最新差分を取得。アダプター層の変更は `app/core/adapters/d1/searchIndex.ts` と `__tests__/searchIndex.integration.test.ts` のみ。**マイグレーションファイルへの変更は差分に存在しない**（plan「マイグレーション変更なし」と整合）。
- `0001_hollow_schema.sql` / `0008_search_documents_fts_trigram.sql` を実読し FTS5 カラム順を再確認。
- `valueObject.ts` / `errorCode.ts` の `SearchHighlightedTitle` / `HighlightedTitleTooLong` を実読確認。

## FTS5 カラムインデックスの再検証

両マイグレーションの仮想テーブル定義でカラム順が `title`(0) / `body_plain`(1) / `tag_names_json`(2) であることを実読確認:
- `0001_hollow_schema.sql:383-389` — `CREATE VIRTUAL TABLE search_documents_fts USING fts5(title, body_plain, tag_names_json, content='search_documents', content_rowid='rowid')`
- `0008_search_documents_fts_trigram.sql` — 再作成、同順＋`tokenize='trigram'`。同期トリガ(ai/ad/au)も `title, body_plain, tag_names_json` の順でカラムを列挙、`0001` と verbatim 一致。

したがって `highlight(fts, 0, ...)` = title、`snippet(fts, 1, ...)` = body_plain はいずれも正しい。`content='search_documents'`（external content）なので `highlight()`/`snippet()` とも元テーブルからカラム本文を読める前提も成立。

## searchIndex.ts の精査

- **`highlight()` の引数順・対象列**（`searchIndex.ts:226`）: `highlight(fts.search_documents_fts, 0, '<mark>', '</mark>')`。`highlight(table, col, open, close)` の順序正しく、col 0 = title。トークンバジェットで切る `snippet()` ではなく全文を返す `highlight()` を採用した点も ADR-001 と整合（タイトルは短く全体表示）。
- **`q.highlight` の true/false 分岐**（`searchIndex.ts:225-230`）: highlight=true → title は `highlight(...)`、snippet は `snippet(fts,1,'<mark>','</mark>','…',N)`。highlight=false → title は `sd.title`（プレーン）、snippet は空マーカー `snippet(fts,1,'','','…',N)`。plan/ADR-002 の記述どおり。`query()` → `runMatchQuery(..., q.highlight)` の伝播も正しい（`searchIndex.ts:176`）。
- **`runLikeQuery` のプレーン維持**（`searchIndex.ts:253-289`）: `highlight` フラグを受け取らず、title は `sd.title`、snippet は `substr(sd.body_plain,1,160)` のまま。LIKE 経路は `highlight()`/`snippet()`/`bm25()` を使えないため常時プレーン。AC-4 と整合。統合テスト(820-)が highlight 明示 false でも同一プレーン結果になることまで確認。
- **`toHit` の VO 構築**（`searchIndex.ts:466`）: `SearchHighlightedTitle.create(row.title)`。`SearchRow.title` は `string` のまま透過。cap 1024 に対し title 出力は最悪 ~850 で安全弁内。
- **SQL エスケープ / インジェクション**: マーカー `'<mark>'`/`'</mark>'`/空文字は固定リテラル、`SNIPPET_TOKEN_BUDGET` は数値バインド。`titleSelect`/`snippetSelect` にユーザー入力は一切混入しない。`buildLikeKeywordClause` / `escapeLikePattern` / `buildMatchExpression`（`["\\]` ストリップ）等の既存エスケープは無変更。問題なし。
- **`countByDateRanges` への波及**（`searchIndex.ts:291-375`）: title/snippet/`highlight` を SELECT/参照しないため無影響。`countMatch`/`countLike` とも変更なし。
- **クラス JSDoc**（`searchIndex.ts:60-64`）: `snippet()`(col 1)/`highlight()`(col 0) と `SearchQuery.highlight` false 時にマーカーを落とす（空 snippet マーカー / 生 `sd.title`）旨を正確に記述。実態と整合。

## 受け入れ基準の検証（アダプター層）

- **AC-1**（タイトルに `<mark>`）: MATCH パス highlight=true で `highlight(fts,0,'<mark>','</mark>')`。統合テスト(744-764)が `デザイン原則`×keyword`デザイン`で `<mark>デザイン</mark>` を検証。**満たす**。
- **AC-3**（本文のみ一致時タイトル無マーク）: `highlight()` は一致区間のみマークし、タイトル非一致時は全文を無マークで返す。統合テスト(767-789)が `週次メモ`(タイトル非一致)+本文一致で title 無マーク・snippet 有マークを検証。**満たす**。
- **AC-4**（LIKE フォールバックはプレーン）: `runLikeQuery` 無変更。統合テスト(820-844, 846-)が短キーワード`AI`で title/snippet プレーン、かつ highlight 明示 false でも同一を検証。**満たす**。
- **AC-5**（共有ポート経由で他サーフェスに生マーカーを漏らさない）: highlight=false で `sd.title`＋空マーカー snippet。統合テスト(792-813)が title/snippet 両プレーンを検証。`searchOwnNotes` が `highlight:false` を渡す（usecase 差分・テストで担保、アダプター責務外）。**アダプター層として満たす**。

## Adapter / Infrastructure

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** 場所: `searchIndex.ts:226`。`highlight()` はカラム本文をエスケープせず、トークン化テキストにマーカーを差し込んで返す。ユーザーがタイトルに生 `<mark>`/`</mark>` を含めた場合その文字列がヒットに乗り、フロント `highlightSnippet` が誤って要素化し得る。ただし (1) `snippet()` で本文に対して既存の同型事象、(2) `highlightSnippet` はマーカー外テキストを React がエスケープするため **XSS は発生せず表示上の問題のみ**、(3) 実害極小。本PRの新規欠陥ではなく対応不要。記録のみ。
- **[N-002]** 場所: `searchIndex.ts:228-230`。highlight=false 時の MATCH スニペットが空マーカー `snippet(fts,1,'','','…',N)`（FTS バジェット抜粋）になることで、自ノート検索(P30)のスニペットは #778 由来の `<mark>` 生文字列漏れからプレーン抜粋へ是正される。ADR-002 の意図どおり。MATCH 経路の `…` 付きバジェット抜粋と LIKE 経路の `substr(body,1,160)` 抜粋は形状差があるが、これは経路差由来の既存仕様で本PRの新規差分ではない。
- **[N-003]** パフォーマンス: MATCH パスで `highlight()` 1 回分が `snippet()` に追加されるが、external content の列フェッチは結果行(`peekLimit` ≤ 51)に限定、`sd` 行は JOIN で既ロード。追加ラウンドトリップなし、無視可。highlight=true 時に title を `highlight()` 出力のみとし `sd.title` を冗長 SELECT していない点も確認。
- **[N-004]** マイグレーション差分なしを確認済み（`gh pr diff 785` にマイグレーションファイルのハンク不在）。既存 col 0=title を流用する設計で、FTS 再作成・トリガ・rebuild への影響もなし。前回レビューの結論を再現性をもって確認した。

## 総評

アダプター層は plan/ADR どおりで、FTS5 カラムインデックス(col 0=title / col 1=body_plain)・`highlight()`/`snippet()` の引数順・true/false 分岐・`runLikeQuery` のプレーン維持・`toHit` の `SearchHighlightedTitle.create`・SQL エスケープ・JSDoc 整合・既存パターンとの一貫性すべて正しい。`countByDateRanges` への波及なし。統合テストが AC-1/3/4/5 を直接カバー。ゼロベース再精査でも **Blocker / Warning なし**（前回結論を独立に再確認）。
