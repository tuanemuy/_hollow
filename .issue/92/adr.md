# ADR — Issue #92: search の短すぎる（< 3 codepoint）キーワード時の UX 改善

## ADR-001: 短すぎるキーワードは host テーブルへの LIKE フォールバックで救済する（候補B採用）

### Status
Proposed

### Context
Issue #50 で FTS5 トークナイザを trigram に切り替えた結果、3 codepoint 未満のキーワードは trigram の構造的制約で 0 件になる（Issue #50 ADR-003）。Issue #92 では救済策として 4 候補（A: UI ヒント / B: LIKE フォールバック / C: reason シグナル / D: ドメイン最小長引き上げ）が挙がり、オーナーコメントで **B 単独** が確定した。

### Decision
全トークンが 3 codepoint 未満のとき（= trigram で索引可能なトークンが 1 つも無いとき）、FTS の MATCH を使わず host テーブル `search_documents` を直接 `LIKE '%keyword%'` で検索する。

### 他候補不採用の理由（オーナーコメント）
- **A / C 単体**: 「2 文字以下でも検索したい」という要望に応えられない。
- **D**: trigram の構造的制約で結局 0 件を返すため要望に応えられない。かつ infrastructure 起源の下限をドメインに持ち込む ADR-003 の判断に反する。

### Consequences
- 良い点: 実用的な短キーワード（`AI` / `Go` / `本` 等）が実際にヒットする。ドメイン契約・ポート契約は無変更。
- トレードオフ（受容）: LIKE は前方ワイルドカードのため索引非利用 → 全件スキャン。body_plain のデータ量増加で相対的に遅くなる。非索引クエリパスが 1 つ増え運用監視ポイントが増える。短キーワード時のみ走るので影響は限定的。

---

## ADR-002: 分岐は「trigram で拾えるトークンがゼロのとき」だけ LIKE。混在ケースは MATCH 経路を維持

### Status
Proposed

### Context
キーワードが複数トークンを含むとき、一部が 3+ codepoint・一部が < 3 codepoint の「混在ケース」がありうる（例 `AI デザイン`）。LIKE 経路に倒す条件をどう引くか。

### Decision
`extractTrigramTokens(keyword)` が 1 つでもトークンを返せば MATCH 経路、ゼロなら LIKE 経路。混在ケースは MATCH 経路に入り、短いトークンは現状どおり無視される（`AI デザイン` → `デザイン` のみで MATCH）。LIKE は「全トークンが短すぎて MATCH が必ず空になる」ケースの純粋な救済に限定する。

### Consequences
- 良い点: 現状の MATCH 挙動（短トークン無視）を一切変えないので回帰リスクが最小。LIKE は純粋な追加救済。
- トレードオフ: `AI デザイン`（MATCH・`AI` 無視）と `AI Go`（LIKE・両方拾う）で挙動が非対称。ユーザーには分かりにくいが、現状を壊さず救済を足す一貫した整理。テストで明示する。

---

## ADR-003: LIKE 経路のスニペット・ランキング・対象カラム

### Status
Proposed

### Context
LIKE 経路では FTS 仮想テーブルを JOIN できないため、FTS5 専用関数 `snippet()`（ハイライト抜粋）と `bm25()`（関連度ランキング）が使えない。代替が必要。

### Decision
- **スニペット**: `substr(body_plain, 1, LIKE_SNIPPET_CHARS)` で body 先頭を固定長抜粋（`<mark>` ハイライトなし）。`LIKE_SNIPPET_CHARS = 160`（`SearchSnippet` 上限 1024 を確実に下回る固定長）。`body_plain` は NOT NULL かつ空文字も `SearchSnippet.create('')` を通るため null/空のリスクなし。
- **ランキング**: `bm25()` が無いため `score` 固定 0 + `ORDER BY sd.note_id ASC`（MATCH 経路の tie-break カラムと同じ安定ソート、note_id は PRIMARY KEY なので決定的）。`toHit` の `normalisedScore = -row.score = 0` は `SearchScore.create(0)`（`>= 0` 許容）を通る。
- **対象カラム**: FTS が索引する title / body_plain / tag_names_json の 3 カラムすべてを LIKE 対象にする（オーナーコメントは body_plain を例示するが、MATCH 経路との整合上 title/tag も含め取りこぼしを防ぐ）。
- **tag セマンティクスの非対称性（注意）**: ここでの tag_names_json への `%keyword%`（クォートなし部分一致）は「フリーテキスト検索対象としての tag」であり、MATCH 経路の tag **フィルタ** `%"tag"%`（JSON クォート込み完全一致、`searchIndex.ts:175`）とは別物。フリーテキスト keyword の検索意味論としては `%keyword%` 部分一致が MATCH 経路（trigram が JSON 構造ごと部分一致索引する）と整合する。

### Consequences
- 良い点: `SearchRow` 形を MATCH 経路と揃えられるので `toHit`・cursor・hasMore を完全共有できる。MATCH 経路と同じ 3 カラムを対象にして検索範囲が一貫。
- トレードオフ: スニペットにハイライトが付かず関連度順にもならない。短キーワード救済という目的には十分。UI 文言変更はスコープ外（`<mark>` が無いだけで表示は崩れない）。
