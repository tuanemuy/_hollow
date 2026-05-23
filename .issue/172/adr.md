# ADR — Issue #172: perf(d1): selectInChunks の chunk 並列数上限ガード

## ADR-001: `selectInChunks` に並列度上限ガードを導入し、自前 worker-pool 実装 + デフォルト 8 並列を採用

### Status
Accepted

### Context

Issue #165（PR #170）で `findByOwner` / `countByOwner` / `listWithCount` の chunk 経路が追加された結果、`selectInChunks` の `Promise.all` 全並列発火が次の懸念を伴うようになった:

- `idScope.size = 10000`（ADR #165-001 想定最大）で `ceil(10000 / 90) = 112 chunks` が一斉発火
- Cloudflare Workers の subrequest throttling の閾値は公式 docs に明示数値なし（`docs/runtime_cloudflare.md` でも記載なし、Workers 公式 docs grep で 0 hit）
- D1 binding の同時接続上限も非公開
- 現状は実測未確認のまま暗黙の上限に依存

選択肢:

- **(A) `selectInChunks` 内部に並列度上限を導入**: helper 1 箇所で全 12 呼び出しに上限を適用
- **(B) 呼び出し側で個別に上限を指定**: 呼び出しごとの想定サイズに応じてチューニング
- **(C) `p-limit` パッケージを導入**: 既存ライブラリで並列制御
- **(D) 何もしない**: 暗黙の上限に依存し続ける

### Decision

**(A) を採用**し、内部実装は **自前 worker-pool パターン**（依存追加なし、~20 行）、デフォルト並列度は **8** とする。

具体的には:

1. `selectInChunks` のシグネチャを `(ids, runner, options?: { chunkSize?, maxConcurrency? })` に拡張
2. 内部は cursor を共有する N workers パターン（chunks を順に取って index 付きで結果を書き戻す）で順序保証と first-rejection-wins を維持
3. `DEFAULT_MAX_CONCURRENCY = 8` を定数化、`maxConcurrency <= 0` で early throw（`chunkSize <= 0` と対称）
4. 呼び出し側 12 箇所は無修正（すべて helper デフォルトに従う）

### Consequences

- 良い点:
  - 1 ファイル変更（`_chunks.ts`）で 12 呼び出しすべてに保守的な上限が効く
  - 後方互換（既存呼び出しは第3引数省略のため無修正動作）
  - chunk 結果の順序保証と first-rejection-wins セマンティクスは維持
  - 依存追加ゼロ。`p-limit` のサプライチェーンリスクと CLAUDE.md の最小依存方針との整合
  - options object 化により将来パラメータ追加時の positional 曖昧化を回避

- トレードオフ:
  - `idScope.size = 10000` の最悪ケースで chunk 経路レイテンシが概算 14 batches × 30 ms ≒ 420 ms（元 1 batch ≒ 30 ms と比較すると 1 桁悪化）。MVP 規模で許容、運用で問題が顕在化したら ADR を更新して並列度を上げる
  - 並列度の最適値は実 Workers 環境での挙動依存。本 ADR では「実測なしの保守的選択」として位置付ける（次節）

### 補足: fan-out 呼び出しでの実効並列度

`selectInChunks` の `maxConcurrency` は **1 helper コール当たりの上限** であり、リポジトリ呼び出し 1 回あたりのピーク D1 query 並列度ではない。具体的には:

- `noteRepository.ts:233-252` の `loadChildren` は `Promise.all([selectInChunks×3])` 構造のため、リポジトリ 1 回当たりピーク並列度は `3 × maxConcurrency = 24`
- `findByOwner` の chunk 経路 → 直後 `hydrateMany` → `loadChildren` という遷移では `1 chunk → 24 並列` への急峻な fan-out が発生しうる

この fan-out は helper 単体では制御できない。本 ADR では以下の方針を意識的にとる:

1. **本 Issue では `loadChildren` の `Promise.all([×3])` 構造には手を入れない**: 並列性は子テーブル fetch のレイテンシ最小化を意図したもので、構造を直列化すると I/O レイテンシが累積する
2. **デフォルト 8 並列は「helper 単体での保守値」と位置付け**: fan-out 3 倍の 24 まで増えても、Workers 公式 docs にある subrequest 関連の数値（free 50 / paid 1000）は通常「per invocation の累積数」で「同時 in-flight 数」とは別の閾値である点に留意。同時並列 throttling の閾値そのものは非公開だが、累積数の枠から見ても 24 並列 1 batch ≪ 50 累積であり、他の subrequest（hydrateMany や外部 API 呼び出し）の予算を残せる水準
3. **`listWithCount` の chunk 経路は単一 selectInChunks**: PR #170 / #173 統合後、`listWithCount` の chunk 経路は `selectInChunks` を 1 回呼び、count は `sorted.length` で導出する単一スキャン（`noteRepository.ts:515-520, 530`）。`Promise.all([findByOwner, countByOwner])` で `2 × maxConcurrency` 並列になる経路は存在しない。fan-out が起こり得るのは `findByOwner` chunk → `hydrateMany` 内の `loadChildren` 3 並列という直列遷移で、瞬間ピークは `max(maxConcurrency, 3 × maxConcurrency) = 24` で和ではない
4. **fan-out が体感レイテンシ問題を起こす運用観察が出たら**: 呼び出し側で `Promise.all` を直列化するか、`loadChildren` を子テーブル別に `{ maxConcurrency }` をオーバーライドする方針に切り替える。本 ADR を Superseded にする

代替案として「helper 単位ではなくリポジトリ単位で並列度を制御する」設計（例: AsyncLocalStorage で `Workers` レベルの token bucket）も考えうるが、現時点の Issue スコープを超え、必要性が顕在化していないため見送る。

### 補足: デフォルト値 `8` の根拠

実 Workers 環境での実測値は得られないため、以下の経験則と安全マージンの折衷として 8 を選択:

- **業界標準の DB connection pool 既定値帯**: PostgreSQL pgpool / Node pg-pool 等で 5-10 並列が既定値帯。D1 は HTTP-over-binding な接続モデルで pg pool と直接比較は成立しないが、単一バックエンドへの同時クエリ数として 5-10 が経験則として広く使われており、本プロジェクトはその下端寄りの 8 を採用する
- **Cloudflare Workers subrequest 上限との関係**: free 50 / paid 1000 という枠は「per invocation の累積 subrequest 数」で、同時 in-flight 数の throttling 閾値とは別の指標。同時並列 throttling の閾値そのものは非公開のため、累積数の余力（8 並列 1 batch でも free 枠 50 のうち 16% 消費にとどまる）を間接的な安全マージンの根拠とする
- **レイテンシ悪化の許容範囲**: 112 → 8 で 14 batches。1 chunk 30 ms 仮定で 420 ms は MVP の UI ページサイズ前提で受容可能
- **過大時のリスク vs 過小時のリスク**: 過大は throttling・接続上限抵触で全 chunk 失敗するクリフリスクがあるのに対し、過小は単純にレイテンシ悪化のみ。保守的に下方を取る方が運用ダメージが小さい

運用で「list 系 usecase の体感レイテンシが悪化した」「特定リポジトリで chunk が頻発する」等の観察が出た場合は、本 ADR を Superseded にして並列度を上げるか、呼び出し側で個別にオーバーライドする方針に切り替える。

### 補足: `p-limit` を採用しない理由

- 自前 worker-pool 実装は 20 行で完結。複雑性のコストが低い
- `p-limit` を導入すると runtime deps が増え、サプライチェーン監査の負担が増える
- CLAUDE.md の最小依存方針（現状 runtime deps は tanstack / drizzle / tiptap / uuid / zod に絞られている）と整合
- 将来 `p-limit` 相当の機能（cancellation、queue 制御等）が必要になった時点で再評価

### 補足: 実測ベンチを行わない理由

Issue 本文「Workers / D1 の制限値が公式 docs に無い場合、ベンチ結果を ADR として残す」に対する応答:

- `wrangler dev` ローカル環境は実 Workers の subrequest throttling を再現しない（ローカルは制限なし）
- staging / production での負荷試験は本 Issue 単体の費用対効果に見合わない（ベンチ用 fixture / 計測基盤 / 異常時のクリーンアップが大掛かり）
- 「測らない」設計判断自体を ADR に残し、将来の運用観察結果に基づく再評価フックを残す

本 ADR では「観測値ではなく設計上の安全マージン」として並列度 8 を位置付ける。

### 却下した選択肢

- **(B) 呼び出し側で個別に上限を指定**: 13 箇所のサイズ想定を個別に管理するコストが高く、helper の責務を散らかす。helper デフォルトで統一的な安全マージンを効かせる方が情報密度が高い。将来チューニングが必要になった呼び出しだけオーバーライドする運用方針を取る
- **(C) `p-limit` パッケージ導入**: 自前 20 行で完結する機能のために runtime dep を増やす対価が見合わない
- **(D) 何もしない**: ADR #165-001 Follow-up [A-W-003] で明示的に対応保留としていた項目。本 Issue で取り扱う前提

### Follow-up

- 運用観察に基づくデフォルト並列度の調整（必要が顕在化したら本 ADR を Superseded に）
- chunk 経路のレイテンシ計測ログを app/core/application/ports/logger 経由で追加するか別 Issue で検討
- リクエスト全体の subrequest 累積総数（chunk 数 + hydrate + loadChildren の合計）を観測する指標を運用観察項目に加える。`idScope.size` が大規模化したリクエストで free 枠 50 を超過しないかを早期検出するため
