# ADR — Issue #50: search index の CJK FTS トークナイズ対応

## ADR-001: トークナイザは FTS5 `tokenize='trigram'` を採用（B / C は不採用）

### Status
Accepted

### Context
Issue #29 のフォロー検証で、D1 (SQLite) FTS5 のデフォルト `unicode61` が連続する CJK 文字を単一トークン化するため `デザイン` で 0 件になる UX 問題が確認された（`.issue/29/adr.md` ADR-006、`.issue/29/.manual-test/results/summary.md`）。

Issue 本文で示された 3 つの選択肢:

- **A**: FTS5 `tokenize='trigram'` 採用（SQLite 3.34+） — `search_documents_fts` を再作成
- **B**: N-gram 索引列 (`body_ngram`) を別途追加し、CJK は N-gram 経路、ASCII は従来経路で検索
- **C**: アプリケーション層でクエリを N-gram 分解してから MATCH に渡す

### Decision
**A (`tokenize='trigram'`)** を採用する。

### B 不採用の理由
- 検索パスを「CJK と ASCII で分岐」させる必要が出て adapter ロジックが二系統化する。`buildMatchExpression` 1 関数で処理できていた単純さが失われる
- `bm25` ランキングが 2 索引で異なるスケールになり、merge sort やスコア正規化が必要
- 索引が 2 つあると同期トリガーも倍化し、書き込み増幅が単純に倍
- 単一の UX 問題に対して構造的に過剰

### C 不採用の理由
- 索引が `unicode61` のままなので CJK では複合語の中身がトークン化されていない。アプリ側で `デザイン` → `"デザ" OR "ザイ" OR "イン"` のように分解しても、索引側に該当トークンが存在しないため依然 0 件になる
- 意味を持たせるには結局索引側も N-gram 化が必要で、それなら最初から trigram で統一する方が単純

### A 採用の理由
- schema 1 箇所変更 + adapter の短トークンガード追加で完結する
- `bm25` / `snippet` / external content / 同期トリガー / cursor 仕様すべて trigram でそのまま動く
- 既存 adapter ヘッダ JSDoc が謳う「派生プロジェクション」「単一索引」設計と整合
- D1 で実証済み（leaves.chiba.dev の検証記事）。SQLite 3.46+ の D1 / Miniflare で利用可能

### Consequences
- 良い点:
  - migration 1 本 + `searchIndex.ts` 数行で完結
  - CJK / ASCII を統一経路で扱える
  - 既存テスト（fake `SearchIndex`）は無変更
- トレードオフ:
  - 1-2 文字キーワード（`AI`, `Go`, `UI`, `本`, `あ` など）は trigram の本質的制約で 0 件になる。従来 unicode61 では何らかの結果を返していたケースが実用上後退する可能性がある（ADR-003 で adapter ガードで吸収）。UX 上の救済（フロントエンドの「最低 3 文字」プレースホルダ、LIKE フォールバック等）は本 Issue スコープ外、フォロー Issue 候補。
  - 索引サイズが unicode61 比で 2-5 倍程度膨張（一般論。本リポジトリの corpus 規模では D1 上限 10 GB に対し問題なし。実数値が必要な意思決定があれば本番運用観測ベースで判断）
  - `bm25` スコア分布が変わり順位の微変動あり（`SearchScore` は UI 非表示で実害なし）

---

## ADR-002: migration 内のリビルドは `INSERT … SELECT FROM host` を採用

### Status
Accepted

### Context
trigram への切り替えで既存 `search_documents` の内容を新しい FTS 仮想テーブルに再投入する必要がある。選択肢:

- **A**: migration 内で `INSERT INTO search_documents_fts(rowid, title, body_plain, tag_names_json) SELECT rowid, title, body_plain, tag_names_json FROM search_documents`
- **B**: migration 内で FTS5 special command `INSERT INTO search_documents_fts(search_documents_fts) VALUES('rebuild')`
- **C**: migration では schema 変更のみ、別途 `bulkRebuildFromSnapshots` を呼ぶ admin operation / worker を起動

### Decision
**A (`INSERT … SELECT FROM host`)** を採用する。

### 不採用案の理由
- **B**: FTS5 external content モードで動作するが、SQL リテラルとしては「マジック」で、読み手が「これがリビルドである」と理解するのに FTS5 公式ドキュメントの special command 知識が必要。可読性が劣る。
- **C**: `bulkRebuildFromSnapshots` を呼ぶ usecase / worker entry point は production には存在しない（grep で確認）。新たに admin operation を作るのは本 Issue のスコープを大きく超える。

### A 採用の理由
- SQL として「ホストテーブルから索引へ全件コピーする」意図が明示的に読める
- external content モードの公式リビルド方法のひとつ（special command と等価）
- migration 1 本で完結し、デプロイ後の追加運用作業が不要

### Consequences
- 良い点:
  - migration の意図が SQL リテラルから直接読める
  - admin operation や worker 経路への依存なし
  - ステージング → 本番への適用が `wrangler d1 migrations apply` 一発
- トレードオフ:
  - 本番 corpus 規模が大きい場合、migration 適用時間がリビルドサイズに比例。ステージングで先に実測し、検索不可窓の長さを把握してから本番適用する
  - migration 自体が DDL + DML を混在させる構造になる（既存 migration では類似パターンが乏しい）が、FTS5 external content の性質上避けられない
  - **D1 のステートメント実行上限（30s 程度）にあたった場合のフォールバック**: migration を `LIMIT/OFFSET` ベースのバッチ INSERT に分割するか、FTS5 special command `INSERT INTO search_documents_fts(search_documents_fts) VALUES('rebuild')` に切替（external content モードの公式リビルド方法で SELECT 版と等価。可読性は劣るが実行効率は同等以上）
  - **trigger ボディの管理**: `0001_hollow_schema.sql:391-406` の SQL リテラルを機械的に同一でコピーする。差分を入れる必要が生じた時点で別 migration として切り出す（trigger だけが変わる migration なら DDL のみで完結し副作用が小さい）

---

## ADR-003: 短トークン (3 codepoint 未満) ガードは adapter 内に置く

### Status
Accepted

### Context
FTS5 `tokenize='trigram'` は 3 Unicode codepoint 未満のクエリトークンに対してマッチを返さない（trigram の本質的制約）。一方、ドメインの `SearchKeyword.create` (`valueObject.ts:148-167`) はトリム後 1 文字以上を許容する。このギャップをどこで吸収するか:

- **A**: `app/core/adapters/d1/searchIndex.ts` の `buildMatchExpression` 内で短トークンを除外（`Array.from(tok).length >= 3` で codepoint 単位カウント）、全滅時は `'""'`（マッチなし literal）にフォールバック
- **B**: ドメインの `SearchKeyword` 最小長を 3 に引き上げる
- **C**: 何もせず、短トークンクエリは FTS5 から空結果が返るに任せる

### Decision
**A (adapter 内ガード)** を採用する。

### B 不採用の理由
- ドメインに「infrastructure 起源の下限」を持ち込むことになり、責務違反
- 「3 文字未満」は trigram tokenizer の制約であり、unicode61 やアプリ層検索なら成立する可能性がある。ドメイン契約を index 実装で縛るのは結合度を不必要に上げる

### C 不採用の理由
- trigram は短すぎるクエリで MATCH 評価がそもそも実行されない（空 posting list）ため空結果に近い挙動になるが、保証はされない
- 明示的なガードで「短すぎるクエリ → 0 件」を契約として確立する方が、将来トークナイザを変えたときの挙動も予測可能

### A 採用の理由
- `buildMatchExpression` には既に「正規化で全トークンが消えた場合 `'""'` を返す」フォールバックが実装済み（`searchIndex.ts:315-320`）。同じ場所に短トークン除外を追加するのが構造的に自然
- ドメイン契約 (`SearchKeyword.length >= 1`) を維持しつつ、adapter 固有の制約を adapter 内で吸収する HexArc 原則と整合
- 将来 adapter を別 DB / 別検索エンジンに差し替えても、新しい adapter が独自の下限を持てる
- `tok.length` ではなく `Array.from(tok).length` を使う: JS の `string.length` は UTF-16 code unit 数を返すため、サロゲートペアの絵文字 1 文字（`🎨` = 1 codepoint）が `length === 2` となり trigram 制約と境界がズレる。`Array.from(tok).length` は iterator ベースで codepoint 単位を返すため trigram の制約と一致

### Consequences
- 良い点:
  - ドメインがシンプルなまま
  - adapter のクラス JSDoc に「trigram の 3 codepoint 制約は adapter で吸収」と書ける
- トレードオフ:
  - フロントエンド UX 上、ユーザーには「短すぎるクエリは 0 件」がそのまま見える。プレースホルダや「最低 3 文字」ヒントを将来 UI で出す余地は残る（フォロー Issue 候補）
  - `SearchIndex.query` から空 hits + null cursor を返すだけで、「キーワードが短すぎたから空だった」ことをユースケース層 / UI に伝える信号がない。差別化が必要な場合は `SearchHit[]` とは別に `reason` フィールドを追加する設計が必要（フォロー Issue 候補）

---

## 実装メモ (2026-05-20)

- 実装ステップは plan.md の指示通りに完了。`pnpm test:unit` 1433 件、`pnpm test:integration` 342 件（うち新規 6 件）すべて PASS、`pnpm typecheck` 0 件、`pnpm lint:fix` + `pnpm format` 完了。
- integration test では `search_documents.note_id` / `owner_id` の FK 制約があるため、`searchIndex.upsert` を行う前に `users` → `directories` → `notes` の順で seed する必要があった。plan.md の test ケース 6 案では明示されていなかったが、`searchIndex.upsert` が host 行を `INSERT` する都合上必然。helper としてテスト内に閉じた `seedUser` / `seedDirectory` / `seedNote` を持たせ、`makeDoc` がノートを seed しながら `SearchDocument` を返す形にまとめた。
- `pnpm lint:fix` の副作用として `app/components/export/ExportJobDetail/Page.tsx` と `infra/src/secrets.ts` の import 順がスタイル統一目的で 1 行ずつ並び替えられた。Issue 本筋とは独立だが Biome の判断で発生した安全な並べ替えのためそのまま含めている。
