# 実装計画 — Issue #50: search index の CJK FTS トークナイズ対応 (unicode61 → trigram or N-gram)

**Issue:** #50
**作成日:** 2026-05-20
**複雑度:** 中〜大規模

---

## 目的

D1 (SQLite) FTS5 のデフォルト `unicode61` トークナイザは連続する CJK 文字を単一トークン化するため、`デザイン` のような CJK キーワードによる部分一致検索が 0 件になる。本文に「デザイン原則」「デザインメモ」が含まれていても引けない実用上の UX 問題を解消し、CJK / ASCII が同一の検索経路で部分一致できるようにする。

Issue #29 の検証（`.issue/29/.manual-test/results/summary.md`）と ADR-006 で「フォロー Issue で対応」と判断された宿題の回収。

## スコープ

### 含まれるもち

- `search_documents_fts` のトークナイザを `tokenize='trigram'` に切り替える migration の追加
- 既存 `search_documents` ホスト行から FTS 索引を再構築（migration 内で完結）
- `buildMatchExpression` に「trigram トークナイザは 3 文字未満トークンを処理できない」制約を吸収する短トークンガードを追加
- `D1SearchIndex` の adapter ヘッダ JSDoc を trigram 採用の旨に更新
- D1 SearchIndex 専用の integration test（CJK ヒット・ASCII リグレッションなし・短トークン 0 件の最小 smoke）を新規追加
- spec ドキュメント `spec/database/index.md` の `search_documents_fts` 節に trigram 採用を反映
- `.issue/50/adr.md` で A 採用判断・短トークンガード・migration リビルド戦略を記録

### 含まれないもの

- `bulkRebuildFromSnapshots` を呼ぶ admin operation / worker entry point の新設（migration 内で完結する）
- `SearchKeyword.create` の最小長変更（ドメインに「インフラ起源の下限」を持ち込まない方針）
- 短すぎるキーワード時のフロントエンド UX ヒント（プレースホルダ等）
- 索引サイズが顕在化した場合の `detail='column'` 等の最適化検討（フォロー Issue 候補）

## 実装ステップ

### 1. migration ファイル `0008_search_documents_fts_trigram.sql` を追加

- **対象ファイル:** `app/core/adapters/d1/migrations/0008_search_documents_fts_trigram.sql`（新規）
- **変更内容:**
  1. 同期トリガー 3 本を `DROP TRIGGER IF EXISTS` で除去（旧 FTS テーブル参照を切る）
     - `search_documents_ai` / `search_documents_ad` / `search_documents_au`
  2. `DROP TABLE IF EXISTS \`search_documents_fts\`;`
  3. `CREATE VIRTUAL TABLE IF NOT EXISTS \`search_documents_fts\` USING fts5(\`title\`, \`body_plain\`, \`tag_names_json\`, content='search_documents', content_rowid='rowid', tokenize='trigram');`
  4. 同期トリガー 3 本を `0001_hollow_schema.sql` と同一ボディで再作成（FTS テーブルが新しい仮想テーブルを参照するよう作り直す）
  5. `INSERT INTO \`search_documents_fts\`(\`rowid\`, \`title\`, \`body_plain\`, \`tag_names_json\`) SELECT \`rowid\`, \`title\`, \`body_plain\`, \`tag_names_json\` FROM \`search_documents\`;` で既存ホスト行から索引を再構築
  6. 冒頭にコメントで Issue #50 の経緯と「unicode61 → trigram」「3 文字未満トークン制約は adapter で吸収」を記述
- **理由:** FTS5 仮想テーブルは drizzle 管理外で raw SQL がSSOT（`schema.ts:632` のコメント）。`0001_hollow_schema.sql` を後付け書き換えするとデプロイ済み環境との migration セット不一致が発生するため、新規 migration で drop/recreate するのが正攻法。索引は「派生プロジェクション」（adapter ヘッダコメント参照）なので drop して問題ない。`CREATE VIRTUAL TABLE` は冗長性を持たせるため `IF NOT EXISTS` を併用（直前の DROP が部分失敗した場合の再実行でも落ちないように）。trigger 3 本のボディは `0001_hollow_schema.sql:391-406` の SQL リテラルを**機械的に同一**でコピーする（差分を入れる必要が生じた時点で別 migration として切り出す）。

### 2. `buildMatchExpression` に短トークンガードを追加

- **対象ファイル:** `app/core/adapters/d1/searchIndex.ts:310-322`
- **変更内容:**
  - 既存の正規化（`["\\]` 除去 → 空 token フィルタ）に加えて、**codepoint 単位**で 3 以上のフィルタを追加: `Array.from(tok).length >= 3`（`tok.length` は UTF-16 code unit 数のため、サロゲートペア絵文字 1 文字を 2 と数える等の誤判定を生む）
  - すべてのトークンが 3 codepoint 未満 / フィルタ後に 0 件になった場合は、既存の `'""'`（何にもマッチしない literal）にフォールバック
  - 既存の `tokens.map((tok) => \`"${tok}"\`).join(" ")` ロジックは変更せず（trigram でもフレーズクエリは合法）
  - 上部の関数 JSDoc に「trigram トークナイザは 3 Unicode codepoint 未満のトークンを処理できないため adapter で吸収。`Array.from(tok).length` で codepoint 数を判定」を追記
- **理由:** `SearchKeyword.create` はトリム後 1 文字以上を許容（`valueObject.ts:148-167`）するため、ドメイン契約と trigram の下限（3 codepoint）にギャップがある。adapter 内で「短すぎるトークンは無効として除外、全滅時は明示的に 0 件を返す」ことで例外発生を回避し、ドメインに infrastructure 制約を漏らさない。

### 3. `D1SearchIndex` の adapter ヘッダ JSDoc を更新

- **対象ファイル:** `app/core/adapters/d1/searchIndex.ts`（クラス JSDoc 部、おおよそ L39-61 近辺）
- **変更内容:** 2-3 行追記
  - 「`search_documents_fts` は `tokenize='trigram'` 採用で CJK / ASCII を統一経路で部分一致」
  - 「trigram の本質的制約として 3 codepoint 未満のクエリトークンはマッチしない。`buildMatchExpression` 内のガードで吸収」
- **理由:** WHY をコードから読める形で 1 箇所に集約（CLAUDE.md「Library-level JSDoc on exported APIs is welcome」原則）。

### 4. D1 SearchIndex 専用 integration test を追加

- **対象ファイル:** `app/core/adapters/d1/__tests__/searchIndex.integration.test.ts`（新規）
- **変更内容:** 既存 `setup.ts` の harness を再利用し、`createTestContainer`（`helpers.ts`）から `D1SearchIndex` を取得して以下の smoke ケースを追加:
  1. **CJK 部分一致**: 本文「これはデザイン原則のメモです」を upsert → `query({ keyword: "デザイン" })` で 1 件返ること
  2. **ASCII 動作維持**: 本文「Design principles for the app」を upsert → `query({ keyword: "Design" })` で 1 件返ること
  3. **混在検索**: 本文「Project デザイン草案」を upsert → `query({ keyword: "デザイン" })` と `query({ keyword: "Project" })` の双方でヒット
  4. **短トークン 0 件**: `query({ keyword: "あ" })`、`query({ keyword: "AI" })`、`query({ keyword: "🎨" })`（サロゲートペア絵文字 = 1 codepoint）で 0 件（例外を投げず empty result）。テスト内コメントで「短トークンガードのリグレッション検出用。trigram → 別 tokenizer に差し替えた際は意図を再評価」と明記
  5. **`visibility` フィルタの組み合わせ**: 異なる visibility の doc を upsert し、`query({ keyword: "デザイン", visibilityFilter: ["public"] })` が public 行のみ返すこと（Issue #29 経路のリグレッション防止）
  6. **`bulkRebuildFromSnapshots` 後の CJK ヒット**: 削除 + 再投入後も `デザイン` でヒット（port 契約維持の確認。production 経路は未配線だが port が壊れていないことの smoke）
- **注意:** `applyD1Migrations` 経路では `setup.ts` の cleanup で `search_documents` が空になっているため、「migration の `INSERT … SELECT FROM host` が CJK 文書を正しく取り込んだか」自体は integration test では検証できない（`beforeAll` で migration 適用 → `beforeEach` で全件 DELETE のため）。この点は手動テスト（後述）で `.issue/29/.manual-test/seed.sql` の既存 corpus を流用してカバーする。
- **理由:** SQL 層のリグレッションは fake `SearchIndex` では検出不能。Issue #29 ADR-003 のフォロー Issue B（D1 SearchIndex integration test ハーネス整備）の実質的回収。既存 harness はすでに `search_documents` の cleanup を含んでおり追加コストはゼロ。

### 5. spec ドキュメント更新

- **対象ファイル:** `spec/database/index.md`（L452-454 の `search_documents_fts` 節）
- **変更内容:** 「`tokenize='trigram'` 採用で CJK 含む部分一致検索が可能。trigram の制約で 3 codepoint 未満のクエリは 0 件（adapter 側で吸収）」を 1-2 行追記
- **理由:** spec と実装の同期。将来読者が「なぜ trigram なのか」を spec / ADR で追えるようにする。

### 6. ADR の作成

- **対象ファイル:** `.issue/50/adr.md`（新規）
- **変更内容:** 以下の判断を ADR として記録:
  - ADR-001: A (`tokenize='trigram'`) 採用、B（CJK / ASCII 経路分割）・C（アプリ層 N-gram 分解）不採用の理由
  - ADR-002: migration リビルドを `INSERT … SELECT FROM host` で行う判断（`bulkRebuildFromSnapshots` admin 経路に頼らない）
  - ADR-003: 3 文字未満トークンガードを adapter 内に置く判断（ドメイン `SearchKeyword` 最小長は不変）
- **理由:** Issue #29 ADR-006 で「フォロー Issue で判断を記録する」と予告された判断の証跡。

## 設計判断

詳細は `.issue/50/adr.md` 参照。サマリ:

- **トークナイザ**: A (`tokenize='trigram'`) 採用。schema 1 箇所 + adapter の短トークンガード追加で完結し、`bm25`/`snippet`/external content/同期トリガー/cursor 仕様すべてそのまま動く。B/C は構造的に過剰または根本解にならない。
- **migration リビルド**: `INSERT INTO search_documents_fts(rowid, ...) SELECT rowid, ... FROM search_documents` を採用。external content モードでの公式リビルド方法で、SQL として読み手に意図が伝わる（FTS5 special command `INSERT INTO fts(fts) VALUES('rebuild')` も同等に機能するが可読性に劣る）。
- **短トークンガード**: adapter 内（`buildMatchExpression`）に閉じる。ドメイン `SearchKeyword` の最小長 1 は据え置き。

## リスクと注意点

- **D1 SQLite が trigram を持っていない可能性**: Cloudflare D1 / Miniflare の SQLite は 3.46+ 系で trigram は 3.34+ から利用可能。`workers-types` にも `"porter" | "trigram"` 型定義あり。実例（leaves.chiba.dev）でも動作確認済み。万一 integration test が「trigram 不可」で失敗した場合のみ B/C 案へ退避（保険として認識しておく）。
- **1-2 文字キーワードの後退**: 従来 unicode61 では 1 文字 ASCII (`a`) や 2 文字 ASCII (`AI`, `Go`, `UI` 等) で何かしらヒットしていたケースが、trigram 移行後は 0 件になる。実用上のリグレッション（`AI` で何も引けない）が発生し得る点は ADR-001 Consequences で受容を明示する。`SearchKeyword.create` の最小長 1 は据え置きで adapter 内ガードで吸収。フロントエンド UX ヒント（プレースホルダ等）や 1-2 文字キーワード用の救済（LIKE フォールバック等）は本 Issue スコープ外、フォロー Issue 候補。
- **bm25 スコア分布変化**: 順位はトークナイズ変化で多少入れ替わる。`SearchScore` は UI に表示されておらず影響はランキング微変動のみ。
- **索引サイズ膨張**: trigram は unicode61 比で 2-5 倍程度のストレージ膨張が一般的。`BODY_MAX_LENGTH = 1 MiB` × 想定ノート数規模では D1 上限（10 GB）に対し問題なし。数万ノート規模に達した時点でフォロー Issue で `detail='column'` 等の最適化を検討。
- **migration 適用時間と本番検索不可窓**: `wrangler d1 migrations apply` は逐次的に SQL を流すため、`DROP TABLE search_documents_fts` から `INSERT … SELECT` 完了までの間、検索クエリは 0 件または失敗になる。運用ガイドライン:
  - ステージング D1 で先に適用し、`SELECT COUNT(*) FROM search_documents` で規模を把握した上で `time wrangler d1 execute --command "INSERT…SELECT…"` 相当を計測
  - 1 秒未満で完了するなら本番もメンテ告知不要、それ以上なら告知を検討
  - **D1 のステートメント実行上限（30s 程度）に当たった場合のフォールバック**: migration を `LIMIT/OFFSET` ベースのバッチ INSERT に分割、または FTS5 special command `INSERT INTO search_documents_fts(search_documents_fts) VALUES('rebuild')` への切替（external content モードの公式リビルド方法、SELECT 版と等価）
- **新規 migration の DDL ミスが integration test 全体を破壊するリスク**: `vitest.config.integration.ts` は `readD1Migrations` で全 migration を取得し、各 integration test ファイルの `beforeAll` で `applyD1Migrations` を 1 回流す。新規 `0008_*.sql` に syntax error 等があると `noteRepository.integration.test.ts` 等すべてのファイルが `beforeAll` で爆死する。チェックポイント: 実装直後にまず既存 integration test 1 本（例: `pnpm test:integration -- noteRepository`）が PASS することを確認してから新規テスト本体に進む。
- **trigger ボディ重複**: 0001 と 0008 で同一ボディ。FTS テーブル定義変更時の必然で、コメントで明示することで保守上の混乱を避ける。
- **migration の冪等性**: `DROP TRIGGER/TABLE IF EXISTS` で部分適用後の再実行に耐える。`CREATE VIRTUAL TABLE` は既存テーブルがあると失敗するため DROP が先行する順序が重要。

## テスト方針

- **自動テスト（CI ゲート）**
  - 新規 `searchIndex.integration.test.ts` の全ケースが PASS（特に CJK ヒット / ASCII 維持 / 短トークン 0 件）
  - 既存 `app/core/application/search/__tests__/*` は fake index 利用のため無変更で PASS
  - 既存 D1 integration test（`noteRepository.integration.test.ts` 等）は migration 自動適用経路を通る → migration がエラーなく流れることが暗黙の smoke
  - `pnpm typecheck && pnpm lint:fix && pnpm format`（CLAUDE.md 規約）
- **手動テスト（マニュアル）**
  - `.issue/29/.manual-test/seed.sql` を流用し（`デザイン原則` / `デザインメモ` を含む）、ローカル D1 (`pnpm db:apply:local`) で `?q=デザイン` がヒットすること、`?q=design` のリグレッションなし、`?q=デザイン&visibility=public` フィルタ動作を確認
  - 結果を `.issue/50/manual-test/` に記録
- **コマンド**
  ```
  pnpm db:apply:local
  pnpm test:unit
  pnpm test:integration
  pnpm typecheck && pnpm lint:fix && pnpm format
  ```

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| 採用案 | A (trigram) | A (trigram) | A (trigram) |
| ベース採用 | ○（最網羅） | ◯（テスト戦略を取り込み） | ◯（migration 構成を参考） |
| 取り込んだ点 | spec/database/index.md 更新、性能トレードオフ分析、migration リビルド戦略 (SELECT FROM host) | integration test ケース詳細、ハーネスギャップ分析、JSDoc 更新 | YAGNI 視点、最小ファイル数フットプリント、トリガー再作成の必然性 |

## レビュー反映

### 修正した点

- **[reviewer-1 / reviewer-2 共通 P-001]** 短トークンガードを `tok.length`（UTF-16 code unit）から `Array.from(tok).length`（Unicode codepoint）に変更。サロゲートペア絵文字の境界誤判定を回避。ADR-003 の表現も「3 codepoint 未満」で統一。テストケース 4 にサロゲートペア絵文字 `🎨` を追加。
- **[reviewer-1 P-002]** 1-2 文字 ASCII キーワード（`AI`, `Go`, `UI`）の後退をリスクと注意点で明示。ADR-001 Consequences にも追記。
- **[reviewer-1 P-003 / reviewer-2 S-006]** 本番 migration 適用時の検索不可窓と運用ガイドライン（ステージング先行計測 / メンテ告知判断基準 / バッチ分割 or `VALUES('rebuild')` フォールバック）をリスクと注意点に追記。
- **[reviewer-2 P-002 / S-001]** `CREATE VIRTUAL TABLE` に `IF NOT EXISTS` を併用し冪等性を強化。
- **[reviewer-2 P-003]** 新規 migration の DDL ミスが integration test 全体を破壊するリスクをリスクと注意点に追記。実装直後の既存 test 1 本での smoke 確認をチェックポイント化。
- **[reviewer-2 S-002]** trigger 3 本のボディを `0001_hollow_schema.sql:391-406` から機械的にコピーする旨を実装ステップ 1 の理由欄に追記。
- **[reviewer-1 S-001]** integration test ケース 6（`bulkRebuildFromSnapshots`）が「migration リビルド自体」を検証しない構造的限界を注意書きで明示。手動テストでカバーする方針を明記。
- **[reviewer-1 S-003]** plan.md ステップ 1 の理由を「raw SQL が SSOT なので 0001 を後付け書き換えるとデプロイ済み環境との migration セット不一致が発生する」に修正。
- **[reviewer-2 S-005]** integration test ケース 6 の意図を「port 契約維持の smoke」と明記（production 経路は未配線だが port が壊れていないことを確認）。
- **[reviewer-2 S-004]** 短トークンガードのテストケースに「リグレッション検出用」のコメント意図を明記。

### 取り込んだ改善提案

- 上記の修正欄に統合（reviewer-2 の S 群は P 群と一体で取り込み済み）。

### 見送った提案とその理由

- **[reviewer-1 S-002]** 「キーワードが短すぎて検索不能だった」ことを UI に伝える信号 → 本 Issue スコープ外、ADR-003 Consequences でフォロー Issue 候補として記載済み。
- **[reviewer-2 S-003]** 索引サイズ膨張 2-5 倍の出典リンク → ADR-001 内では参考程度の記述に留め、実測ベースの判断は本番デプロイ後の運用観測に委ねる（数万ノート規模に達するまで実数値が必要な意思決定はない）。

