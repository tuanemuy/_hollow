# レビュー: PR #785 — Adapter / Infrastructure (D1/FTS5)

対象: Issue #779「公開検索(P32)の結果タイトルにもキーワードハイライトを適用する」
観点: Adapter / Infrastructure（FTS5 の挙動・SQL の正しさ・パフォーマンス・既存パターン一貫性）

## 受け入れ基準の検証（アダプター層）

- **AC-1**（タイトルに `<mark>`）: MATCH パスで `highlight(fts.search_documents_fts, 0, '<mark>', '</mark>') AS "title"` を採用。col 0 = title はマイグレーションで確認済み（下記）。統合テスト `marks the matched run in the title...` が `<mark>デザイン</mark>` を検証。**満たす**。
- **AC-3**（本文のみ一致時はタイトル無マーク）: `highlight()` は一致区間のみマークするため、タイトル非一致時はマーカーなしで全文を返す。統合テスト `leaves the title unmarked when only the body matches` で確認。**満たす**。
- **AC-4**（LIKE フォールバックはプレーン）: `runLikeQuery` は `sd.title` プレーン＋`substr(sd.body_plain,1,160)` のまま。`highlight` フラグを受け取らず変更なし。統合テスト `returns plain strings on the LIKE fallback...` で確認。**満たす**。
- **AC-5**（共有ポート経由で他サーフェスに生マーカーを漏らさない）: `highlight=false` で `sd.title`（プレーン）＋ 空マーカー `snippet(fts,1,'','','…',N)`。`searchOwnNotes` が `highlight:false` を渡す。統合テスト＋usecase テストで確認。**満たす**。

## FTS5 カラムインデックスの検証

両マイグレーションで FTS5 仮想テーブルのカラム順は `title`(0) / `body_plain`(1) / `tag_names_json`(2) であることを実読確認:
- `0001_hollow_schema.sql:383-389`（`CREATE VIRTUAL TABLE search_documents_fts`）
- `0008_search_documents_fts_trigram.sql:35-42`（再作成、同順）

したがって `highlight(..., 0, ...)` = title、`snippet(..., 1, ...)` = body_plain はいずれも正しい。`content='search_documents'`（external content）なので両関数とも元テーブルからカラム本文を読める点も前提どおり。

## searchIndex.ts の精査

- **`highlight()` vs `snippet()`**: タイトルは全文表示が望ましく、トークンバジェットで切り詰める `snippet()` ではなく全文を返す `highlight()` を選択。引数順 `highlight(table, col, open, close)` は正しい。スニペットは `snippet(table, col, open, close, ellipsis, tokenBudget)` で従来どおり。
- **補助関数の参照形式**: `highlight(fts.search_documents_fts, ...)` は既存の `bm25(fts.search_documents_fts)` / `snippet(fts.search_documents_fts, 1, ...)` と同一パターン（エイリアス `fts` + FTS5 がテーブル名と同名で公開する隠しランク列）。既存の実証済みイディオムと完全一致しており正しい。
- **`q.highlight` の引き回し**: `query()` → `runMatchQuery(..., q.highlight)` に正しく伝播（`searchIndex.ts:176`）。`titleSelect` / `snippetSelect` の true/false 分岐（`searchIndex.ts:225-230`）は plan/ADR の記述どおり。`runLikeQuery` には意図的に渡していない（LIKE は常時プレーン）— AC-4 と整合。
- **`runLikeQuery`**: タイトル・スニペットともプレーンのまま無変更（`searchIndex.ts:271-288`）。
- **`toHit`**: `SearchTitle.create` → `SearchHighlightedTitle.create(row.title)`（`searchIndex.ts:466`）。`SearchRow.title` は `string` のまま透過。
- **SQL インジェクション / エスケープ**: マーカー（`'<mark>'`/`'</mark>'`）と空マーカーは固定リテラル、`SNIPPET_TOKEN_BUDGET` は数値バインド。ユーザー入力は `titleSelect`/`snippetSelect` に一切混入しない。`buildLikeKeywordClause` 等の既存エスケープも無変更。問題なし。
- **`countByDateRanges` への影響**: title/snippet を SELECT しないため無影響。`highlight` 列も参照しない。確認済み。
- **クラス JSDoc**: `snippet()`（col 1）/ `highlight()`（col 0）と `SearchQuery.highlight` による分岐を正確に記述（`searchIndex.ts:56-64`）。実態と整合。

## Adapter / Infrastructure

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** `highlight()` はカラム本文をエスケープせず、トークン化されたテキストにマーカーを差し込んで返す。ユーザーがタイトルに文字列リテラル `<mark>` / `</mark>` を含めた場合、その生文字列がそのままヒットに乗り、フロントの `highlightSnippet` がハイライト要素化してしまう（誤ハイライト）。ただしこれは (1) `snippet()` で既存の本文に対しても同様に存在する先行事象、(2) `highlightSnippet` はマーカー外テキストを React がエスケープするため **XSS は発生せず純粋に表示上の問題**、(3) 実害は極小。本Issueで新規導入した欠陥ではないため対応不要。将来マーカー方式を変える際の留意点として記録。場所: `app/core/adapters/d1/searchIndex.ts:226`。
- **[N-002]** `highlight=false` の MATCH パスでスニペットを空マーカー `snippet(fts,1,'','','…',N)` に切り替えたことで、自ノート検索（P30）のスニペットは従来の `<mark>` 生文字列漏れ（#778 由来）から「マーカーなしの FTS バジェット抜粋」へ変わる。これは是正方向であり plan/ADR-002 の意図どおり。FTS バジェット抜粋（`…` 省略記号付き）と LIKE パスの `substr(body,1,160)` 抜粋は形状が異なるが、これはサーフェスではなく MATCH/LIKE 経路差に由来する既存仕様で本PRの新規差分ではない。場所: `app/core/adapters/d1/searchIndex.ts:228-230`。
- **[N-003]** パフォーマンス: MATCH パスで補助関数が `snippet()` に加えて `highlight()` 1回分増えるが、external content の列フェッチは結果行（`peekLimit` ≤ 51）に限定され、`sd` 行は JOIN で既にロード済み。追加ラウンドトリップは発生せず無視できる。`highlight=true` 時に `sd.title` を冗長 SELECT していない点も確認済み（title は highlight 出力のみ）。問題なし。
- **[N-004]** `SearchHighlightedTitle` の cap 1024 は UTF-16 code unit 基準（`raw.length`）。マーカーオーバーヘッドはマッチ区間数で律速され、最悪 ≈850 < 1024。サロゲートペア絵文字主体のタイトル（200 UTF-16 units = 100 codepoints）でも区間数が減るため超過しない。VO 側 JSDoc に導出が残されており再導出不要。アダプター起点の `DataIntegrityError` 経路は実質到達不能で安全弁として妥当。

## 総評

アダプター層の実装は plan/ADR どおりで、FTS5 のカラムインデックス・補助関数の使い方・SQL 構築・エスケープ・既存パターンとの一貫性すべて正しい。`countByDateRanges` 等への波及もなく、統合テストが AC-1/3/4/5 を直接カバーしている。**Blocker / Warning なし**。
