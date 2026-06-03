# 実装計画 — Issue #92: search の短すぎる（< 3 codepoint）キーワード時の UX 改善

**Issue:** #92
**作成日:** 2026-06-03
**複雑度:** 中〜大規模

---

## 目的

FTS5 `tokenize='trigram'`（Issue #50）への切り替え以降、3 Unicode codepoint 未満のキーワード（`AI` / `Go` / `UI` / `本` / `あ` 等）は trigram の構造的制約で 0 件として返るようになった。実用的な短いキーワードでも何もヒットしない体験を、**LIKE 部分一致による代替検索（候補B）**で救済する。

オーナーコメントで確定した方針: 短すぎるキーワード（全トークンが < 3 codepoint）のときは host テーブル `search_documents` を直接 LIKE 検索する。ドメインの `SearchKeyword.create` 最小長は据え置く（ADR-003 の「infrastructure 起源の下限をドメインに持ち込まない」判断を維持）。

## スコープ

### 含まれるもの

- adapter（`app/core/adapters/d1/searchIndex.ts` の `buildMatchExpression` 周辺・`query`）に短すぎるクエリ時の LIKE フォールバック分岐を追加
- spec ドキュメントの該当箇所更新（`spec/pages/index.md` P10/P32、`spec/scenario/browse.md` E3）
- `.issue/50/adr.md` ADR-001 / ADR-003 の Consequences に「本 Issue で B を採用」のフォロー記録を追加
- integration test に LIKE フォールバックのケースを追加

### 含まれないもの

- UI 側の文言変更（「最低 3 文字」プレースホルダ等。必要になったら別 Issue）
- ドメイン `SearchKeyword.create` 最小長の引き上げ（候補D。据え置き）
- `SearchQueryResult` への `reason` フィールド追加（候補C。不採用）

## 実装ステップ

### 1. `buildMatchExpression` を「経路判定 + トークン抽出」に再構成

- **対象ファイル:** `app/core/adapters/d1/searchIndex.ts:332-347`
- **変更内容:** 「MATCH 文字列を作る」責務に固定されている現関数を、trigram で拾えるトークン（3+ codepoint）の配列を返す `extractTrigramTokens` と、その配列を MATCH 文字列化する `buildMatchExpression` に分割する。`query` 側で「トークンが 1 つ以上 → MATCH 経路 / ゼロ → LIKE 経路」を判定する。`'""'`（マッチなし literal）への分岐は LIKE 経路が代替するため不要になる。

```ts
function extractTrigramTokens(keyword: string): string[] {
  return keyword
    .split(/\s+/)
    .map((tok) => tok.replace(/["\\]/g, ""))
    .filter((tok) => tok.length > 0)
    .filter((tok) => Array.from(tok).length >= 3);
}

function buildMatchExpression(tokens: readonly string[]): string {
  return tokens.map((tok) => `"${tok}"`).join(" ");
}
```

- **理由:** 分岐条件の単一の真実をここに集約。ADR-001 が重視した「単純さ」は、小さな関数分割（トークン抽出 / match 文字列化 / LIKE 経路）に留めて尊重する。

### 2. `query` を共通フィルタ組み立て + 経路分岐に再構成

- **対象ファイル:** `app/core/adapters/d1/searchIndex.ts:121-207`
- **変更内容:** owner/visibility/dateRange/directoryPath/tag のフィルタ群（現状 136-177、すべて `sd.` カラム参照で FTS 仮想テーブルに非依存）を `buildSharedFilters(q)` に切り出し、両経路で共有する。`query` 本体は cursor decode → トークン抽出 → 経路分岐 → 共通の hasMore/`toHit`/encodeCursor 処理、という形にする。

```ts
const tokens = extractTrigramTokens(q.keyword);
const rows = tokens.length > 0
  ? await this.runMatchQuery(buildMatchExpression(tokens), sharedFilters, peekLimit, offset)
  : await this.runLikeQuery(q.keyword, sharedFilters, peekLimit, offset);
```

- **理由:** cursor の decode/encode・peekLimit・hasMore・`toHit` マッピングは経路非依存。フィルタ重複を排除して ADR-001 の「二系統化を避ける」精神を守る。

### 3. MATCH 経路を `runMatchQuery` に抽出

- **対象ファイル:** `app/core/adapters/d1/searchIndex.ts`（新規プライベートメソッド、既存 SQL を移設）
- **変更内容:** 既存 181-197 の SQL をほぼそのまま移す。WHERE は `sd.rowid = fts.rowid` + `fts.search_documents_fts MATCH ${matchExpr}` + `...sharedFilters` を `AND` 結合。`snippet()`/`bm25()`/ORDER BY はそのまま。
- **理由:** 既存挙動を完全保持（回帰なし）。

### 4. LIKE 経路を `runLikeQuery` に新規追加

- **対象ファイル:** `app/core/adapters/d1/searchIndex.ts`（新規プライベートメソッド）
- **変更内容:** FTS 仮想テーブルを使わず host テーブル `search_documents` を直接検索。title / body_plain / tag_names_json の 3 カラムに対して `LIKE ${needle} ESCAPE '\\'`（`needle = %escapeLikePattern(keyword.trim())%`）。`snippet()` は `substr(body_plain, 1, LIKE_SNIPPET_CHARS)` で代替、`bm25()` は無いので `score` 固定 0 + `ORDER BY sd.note_id ASC`。MATCH 経路と同じ `SearchRow` 形を返して `toHit`・cursor・hasMore を共有する。`LIKE_SNIPPET_CHARS` は新規モジュール定数として `160` を定義する（`SearchSnippet` 上限 1024 を確実に下回る固定長）。なお tag_names_json への `%keyword%`（クォートなし部分一致）は、MATCH 経路の tag **フィルタ** `%"tag"%`（クォート込み完全一致）とは別物（フリーテキスト検索としての tag マッチ）である点に注意。

```ts
private async runLikeQuery(keyword, sharedFilters, peekLimit, offset) {
  const needle = `%${escapeLikePattern(keyword.trim())}%`;
  const likeClause = sql`(
    sd.title LIKE ${needle} ESCAPE '\\'
    OR sd.body_plain LIKE ${needle} ESCAPE '\\'
    OR sd.tag_names_json LIKE ${needle} ESCAPE '\\'
  )`;
  const whereClause = sql.join([likeClause, ...sharedFilters], sql` AND `);
  return this.db.all<SearchRow>(sql`
    SELECT sd.note_id AS "noteId", sd.owner_id AS "ownerId", u.username AS "username",
           sd.title AS "title", substr(sd.body_plain, 1, ${LIKE_SNIPPET_CHARS}) AS "snippet",
           sd.tag_names_json AS "tagNamesJson", sd.visibility AS "visibility", 0 AS "score"
    FROM search_documents AS sd
    JOIN users AS u ON u.id = sd.owner_id
    WHERE ${whereClause}
    ORDER BY sd.note_id ASC
    LIMIT ${peekLimit} OFFSET ${offset}`);
}
```

- **理由:** `SearchRow` 形を揃えることで `toHit`/cursor/hasMore を共有できる。`snippet()`/`bm25()` が使えない制約を adapter 内で吸収。

### 5. クラス JSDoc 更新

- **対象ファイル:** `app/core/adapters/d1/searchIndex.ts:47-67`
- **変更内容:** 「短トークンは `'""'` literal で 0 件」の記述を「全トークンが 3 codepoint 未満のとき LIKE フォールバック（host テーブル直接検索、title/body_plain/tag_names_json 対象、snippet は body_plain 先頭抜粋、bm25 が無いので note_id 安定ソート）に切り替える」へ書き換える。
- **理由:** JSDoc がクラスの契約ドキュメント。ADR-003 で「adapter JSDoc に書ける」と明記されている。

### 6. spec ドキュメント更新

- **対象ファイル:** `spec/scenario/browse.md`（E3 異常系、`:42` 付近）、`spec/pages/index.md`（P10 `:116` 付近 / P32 `:336` 付近 — Issue 本文の `:115`/`:285` は近似値なのでセクション名で特定する）
- **変更内容:** 「trigram 制約で 0 件・UI ヒントはフォロー Issue 候補」の記述を「全トークンが 3 codepoint 未満の場合は LIKE 部分一致（title / body_plain / tag_names_json 対象）で代替検索する。bm25 ランキング・ハイライトは無く note_id 安定ソート・body 先頭抜粋になる」へ更新。
- **理由:** オーナーコメント確定スコープ。

### 7. ADR フォロー記録追記

- **対象ファイル:** `.issue/50/adr.md` ADR-001 Consequences / ADR-003 Consequences
- **変更内容:** 各 Consequences 末尾に「フォロー (Issue #92): 候補 B（LIKE フォールバック）を採用。全トークンが 3 codepoint 未満のときのみ host テーブルを直接 LIKE 検索する経路を追加。`SearchKeyword` 最小長は据え置き。トレードオフ: LIKE は全件スキャン／非索引クエリパスが 1 つ増える」を追記。
- **理由:** オーナーコメント確定スコープ。新規 ADR は作らず既存 ADR のフォローとして残す。

### 8. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:integration`（searchIndex）。

## 設計判断

詳細なトレードオフは `.issue/92/adr.md` に記録。要点:

- **分岐条件:** `extractTrigramTokens` が 1 つでもトークンを返せば MATCH 経路、ゼロなら LIKE 経路。混在ケース（一部 3+ / 一部 < 3）は MATCH 経路に入り短トークンは無視（現状維持）。LIKE は「全トークンが短すぎて MATCH が空になる」ケースの純粋な救済に限定。
- **クエリパス:** LIKE 経路は host テーブル直接検索。スニペット = `substr(body_plain, 1, N)`、並び順 = `note_id ASC`、score 固定 0。offset cursor 共有。
- **検索対象カラム:** MATCH 経路と整合させ title/body_plain/tag_names_json の 3 カラムすべてを LIKE 対象。
- **LIKE エスケープ:** 既存 `escapeLikePattern` + `ESCAPE '\\'` + バインドパラメータで SQL インジェクション安全。

## リスクと注意点

- **性能:** LIKE 経路は前方ワイルドカードで索引非利用 → 全件スキャン。オーナー受容済み。短キーワード時のみ走るので影響は限定的。
- **混在ケースの非対称性:** `AI デザイン`（MATCH・`AI` 無視）と `AI Go`（LIKE・両方拾う）で挙動が変わる。現状を変えずに救済を足す一貫した方針。テストで明示。
- **スニペット品質低下:** LIKE 経路はハイライト（`<mark>`）なし・body 先頭固定抜粋。UI 文言変更はスコープ外で、`<mark>` が無いだけなので表示は崩れない。
- **`tag_names_json` への LIKE:** keyword が JSON 構造文字を含んでも `escapeLikePattern` は LIKE ワイルドカードのみエスケープ → リテラル一致で安全側。
- **score=0:** `toHit` で `SearchScore.create(0)` を通る（`>= 0`）。問題なし。

## テスト方針

`app/core/adapters/d1/__tests__/searchIndex.integration.test.ts` に追加（既存の「短トークン 0 件」テストは LIKE 化で挙動が変わるため内容を更新）:

1. ASCII 短キーワード LIKE ヒット（`AI` で body 一致 → 1 件、旧 0 件からの救済）
2. CJK 短キーワード LIKE ヒット（`本`）
3. 2 codepoint キーワード（`Go`）
4. title 一致（body に含まないが title に `AI`）
5. tag 一致（tag_names_json に `AI`）
6. LIKE 経路でも共通フィルタが効く（visibility/owner/dateRange）
7. LIKE 経路の no-match（`hits: []`, `nextCursor: null`）
8. LIKE 経路のページネーション（複数ヒット + 小さい limit → nextCursor 非 null、2 ページ目重複なし）
9. LIKE エスケープ（`%`・`_` をリテラル扱い、ワイルドカード暴発しない）
10. 混在ケースは MATCH 経路（`AI デザイン` で `デザイン` のみマッチ＝短トークン無視の回帰）
11. emoji（`🎨` 1 codepoint）は LIKE 経路でヒット（旧 0 件期待からの更新）
12. LIKE ヒットの `score` が 0 で返ることを明示アサート（trigram 由来の符号反転ロジックと共有の正規化経路の回帰検出）

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**修正した点**: なし（要修正の指摘なし）

**取り込んだ改善提案**:
- S（要件）: spec 更新箇所の行番号参照を実態（P10 `:116` / P32 `:336`）に補正。Issue 本文の `:115`/`:285` は近似値である旨を明記。
- S（要件）: テストケース #12「LIKE ヒットの score が 0」を追加。
- S（アーキ）: `LIKE_SNIPPET_CHARS` の具体値を `160` に確定（plan ステップ4 / adr ADR-003）。
- S（アーキ）: tag_names_json への `%keyword%` 部分一致が、MATCH 経路の tag フィルタ `%"tag"%` 完全一致とは別物である点を plan ステップ4 / adr ADR-003 に明記。

**見送った提案**: なし（全提案をスコープ内として取り込み）
