# 実装計画 — Issue #172: perf(d1): selectInChunks の chunk 並列数上限ガード

**Issue:** #172
**作成日:** 2026-05-23
**複雑度:** 中〜大規模

---

## 目的

`selectInChunks` が `Promise.all` で chunk 数だけ同時にクエリを発火する設計のため、`idScope.size` が大きいケース（Issue #165 ADR-001 想定の最大 10000 件で 112 chunks 一斉発火）で Cloudflare Workers の subrequest throttling や D1 同時接続上限に達するリスクを、並列度上限ガードで予防する。

## スコープ

### 含まれるもの

- `app/core/adapters/d1/repositories/_chunks.ts` の `selectInChunks` に並列度上限引数を追加（依存追加なしの自前 worker-pool 実装）
- デフォルト並列度値を保守的に決定し、JSDoc に WHY を明記
- `_chunks.test.ts` に並列度上限の挙動を unit test で固定
- `.issue/172/adr.md` に「`p-limit` を採用せず自前実装」「実測ベンチを行わない理由」「デフォルト値の根拠」の3つを ADR として記録

### 含まれないもの

- 呼び出し側（`mediaAssetRepository` / `noteRepository` / `tagRepository` / `publicationStateRepository`）の **個別チューニング**は行わない（12 箇所すべて helper デフォルトに従う。将来必要が顕在化した時点で個別オーバーライド）
- **Issue 提案 #1（実 Workers 環境での実測ベンチ）**: 意図的にスコープ外（理由は `.issue/172/adr.md` ADR-001 §「実測ベンチを行わない理由」で詳述）
- `loadChildren`（`noteRepository.ts:233-252`）のような fan-out 呼び出しの直列化: `Promise.all([selectInChunks×3])` 構造を維持する（ADR-001 §「fan-out 呼び出しでの実効並列度」で意識的非対応を記録）
- `SAFE_CHUNK_SIZE` の調整（chunk size と並列度は独立した安全パラメータ）
- `p-limit` パッケージの依存追加（runtime deps 最小方針に従い自前実装）

## 採用案

**(A) `selectInChunks` のシグネチャに options object 形式で `maxConcurrency` を追加 + 自前 worker-pool 実装 + デフォルト 8 並列**

- **理由**:
  1. helper 1 箇所変更で 12 呼び出しすべてに上限が適用され、後方互換（既存呼び出しは第3引数省略のため無修正動作）
  2. `p-limit` 依存を持ち込むより 20 行の自前実装で完結する方が CLAUDE.md の最小依存方針と整合
  3. 並列度 8 は DB connection pool の業界標準（PostgreSQL pgpool/pg-pool 系で 5-10 が既定値帯）と、Workers subrequest throttling の非公開閾値に対する保守的安全マージンの折衷
  4. options object 化により将来パラメータ追加時も positional の意味曖昧化を避けられる

- **トレードオフ**:
  - 並列度を 112 → 8 に絞ると `idScope.size = 10000` の最悪ケースで chunk 経路レイテンシが概算 14 batches × 30 ms ≒ 420 ms（元 1 batch ≒ 30 ms と比較すると 1 桁悪化）。MVP 規模で許容、運用で問題が顕在化したら再調整
  - 第3引数を `number`（chunkSize 直渡し）で呼んでいた既存テストは options 形式 or overload に書き換えが必要

## 実装ステップ

### 1. `selectInChunks` のシグネチャ拡張と worker-pool 実装

- **対象ファイル:** `app/core/adapters/d1/repositories/_chunks.ts`
- **変更内容:**
  - 定数 `DEFAULT_MAX_CONCURRENCY = 8` を追加（根拠は ADR-001 §デフォルト値）
  - シグネチャを以下に拡張:

    ```ts
    export interface SelectInChunksOptions {
      chunkSize?: number;
      maxConcurrency?: number;
    }

    export async function selectInChunks<T>(
      ids: readonly string[],
      runner: (chunk: readonly string[]) => Promise<readonly T[]>,
      options?: SelectInChunksOptions,
    ): Promise<readonly T[]>
    ```

  - `ids.length === 0` の early return（既存挙動）は維持
  - 内部は **worker-pool パターン**（chunks を共有キューにし、N workers が cursor を順に取って結果を index 付きで書き戻す）:

    ```ts
    const results: (readonly T[])[] = new Array(chunks.length);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(maxConcurrency, chunks.length) },
      async () => {
        while (true) {
          // cursor++ is safe: JS evaluates the post-increment
          // synchronously before any `await` yields control, so workers
          // never observe the same index.
          const i = cursor++;
          if (i >= chunks.length) return;
          results[i] = await runner(chunks[i]);
        }
      },
    );
    await Promise.all(workers);
    return results.flat();
    ```

  - `chunkSize <= 0` と対称に `maxConcurrency <= 0` で early `throw new Error(...)`
  - **ファイルヘッダ JSDoc の書き換え**: 既存ヘッダ（`_chunks.ts` 冒頭の long comment）の "Chunks are dispatched in parallel via `Promise.all`. The first runner rejection propagates ... sibling runners that were already in flight will still settle, their results simply discarded." は bounded 化後に不正確になるため、以下の semantics に書き換える:
    - 「Chunks are dispatched through a bounded worker pool (default {DEFAULT_MAX_CONCURRENCY})」
    - 「On first rejection: already-claimed chunks complete and settle; unclaimed chunks are never started.」
  - `selectInChunks` 関数 JSDoc を新設し:
    - 並列度上限の WHY（Workers subrequest throttling / D1 同時接続上限、いずれも公式 docs に明示数値なし）
    - デフォルト 8 の根拠（DB pool 業界既定値帯 + 詳細は ADR-001）
    - ordering 保証は維持される旨（cursor + index 書き戻しで保たれる）
    - first-rejection-wins は維持されるが「未開始 chunk の runner は呼ばれない」点（既存全並列との挙動差）

- **理由:** Issue 提案 #2 の直接実装。helper 1 箇所変更で全呼び出し統一。worker-pool は依存ゼロで 20 行に収まる

### 2. 呼び出し側の変更（なし）

- **対象ファイル:** `mediaAssetRepository.ts` / `noteRepository.ts` / `tagRepository.ts` / `publicationStateRepository.ts`
- **変更内容:** **なし**
- **Issue 提案 #3 との対応関係:** Issue 本文の提案 #3 で名指しされている `findByOwner` / `countByOwner` / `findReferrers` / `loadChildren` を含む全 12 呼び出しは、helper デフォルト `maxConcurrency = 8` 経由で自動的に上限が効く。個別 `{ maxConcurrency }` の指定は行わない
- **理由:** Issue 提案 #3 は「並列度上限を指定」と書くが、12 箇所すべてを helper デフォルトに従わせる方が将来のチューニング容易性で勝る。個別調整が必要になった時点でその呼び出し箇所に明示理由つきで `{ maxConcurrency: N }` を追加する方が情報密度が高い

### 3. ADR の追加

- **対象ファイル:** `.issue/172/adr.md`（新規）
- **変更内容:** ADR-001 として「並列度上限ガードの導入と自前実装の採用」を Accepted で記録。詳細は別ファイル参照
- **理由:** デフォルト値・依存方針・実測ベンチを行わない判断、いずれもトレードオフを伴う技術判断で ADR の対象

### 4. テスト追加

- **対象ファイル:** `app/core/adapters/d1/repositories/__tests__/_chunks.test.ts`
- **変更内容:**
  - 既存テストの第3引数 `number`（`chunkSize` 直渡し）を options object 形式に書き換える（`selectInChunks(ids, runner, { chunkSize: 10 })`）
  - **既存ケース `rejects with the first runner failure when a chunk throws` の書き換え**: 現状は `expect(runner).toHaveBeenCalledTimes(3)` で「全 chunk 数が呼ばれること」を assert しているが、bounded 化後の semantics（first rejection で cursor 停止 → 未開始 chunk の runner は呼ばれない）に合わせて以下に変更:
    - `runner` 呼び出し回数は `<= maxConcurrency`（既開始 worker 数まで）
    - rejection 自体は伝播することを `rejects.toThrow(/boom/)` で維持
    - 「未開始 chunk は runner が呼ばれない」を明示する assertion を追加（counter で確認）
  - 新規ケースを追加:
    - **`respects maxConcurrency by capping in-flight runners`**: タスク数 20、`maxConcurrency: 3` で `inFlight` counter の最大値が 3 を超えないことを assert（runner 内で counter を inc/dec し peak を観測）
    - **`preserves input chunk order under bounded concurrency`**: limit 下でも入力順保持が崩れないことを assert
    - **`throws when maxConcurrency <= 0`**: 既存 `chunkSize <= 0` ガードと対称な不正値 throw
    - **`defaults to DEFAULT_MAX_CONCURRENCY when not specified`**: 200 chunks で同時実行ピークが `DEFAULT_MAX_CONCURRENCY` 以下に張り付くことを assert

- **理由:** 並列度制御は helper の contract の一部なので unit test で固定。integration test は不要（chunk 経路の結果集合・順序・件数は不変）

### 5. typecheck / lint / format / test の実行

- **対象ファイル:** なし（コマンド実行のみ）
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit`
- **理由:** CLAUDE.md 規約「After changes: pnpm typecheck && pnpm lint:fix && pnpm format」

## 設計判断

詳細は `.issue/172/adr.md` 参照。要点:

1. **`p-limit` を採用せず自前実装** — runtime deps 最小方針との整合、20 行で完結
2. **デフォルト並列度 = 8** — DB connection pool 業界既定値帯と subrequest throttling 安全マージンの折衷
3. **実測ベンチを行わない** — `wrangler dev` で再現不能、staging 負荷試験は費用対効果が見合わない。「測らない判断」を ADR に残す
4. **options object 形式** — 将来パラメータ追加時の positional 曖昧化を避ける

## リスクと注意点

- **既存テストの書き換え**: `_chunks.test.ts` の positional 第3引数を options 形式に統一。overload で互換維持する選択もあるが、型シグネチャを太らせる代償が大きいため書き換えを採用。さらに `rejects with the first runner failure` ケースは bounded 化で `runner` 呼び出し回数が `<= maxConcurrency` に変わるので書き換える（詳細は実装ステップ 4）
- **integration test への影響なし**: 並列度を下げても chunk 経路の結果集合・順序・件数は同一。`noteRepository.integration.test.ts` の `T-bind-008..014` は無修正で pass する想定
- **デフォルト 8 の保守性**: 過小だと chunk 経路レイテンシ悪化。`idScope.size = 10000` で 112 → 14 batches。MVP 規模で許容、運用で目立てば ADR を更新して上げる
- **first-rejection の挙動変化**: 既存全並列実装では「すべての chunk runner が呼ばれてから不要な結果を捨てる」が、bounded 化後は「未開始 chunk の runner は一度も呼ばれない」に変わる。runner に副作用がある callers にとっては挙動変化だが、現状 12 呼び出しすべて純粋な `db.select(...).from(...).where(...)` で副作用なし。テストで明示
- **fan-out ピーク並列度（loadChildren 等）**: `noteRepository.ts:233-252` の `loadChildren` は `Promise.all([selectInChunks×3])` 構造のため、リポジトリ呼び出し 1 回あたりのピーク D1 query 並列度は `3 × maxConcurrency = 24` まで増えうる。helper 単体ではこの fan-out は制御できない。ADR-001 §「fan-out 呼び出しでの実効並列度」で意識的非対応を記録し、運用観察で問題が顕在化したら呼び出し側を直列化する方針を残す
- **fast-path 不採用**: `chunks.length === 1` のとき `runner(chunks[0])` で直接 await する fast-path を導入しない（cursor inc/check のオーバーヘッドは無視できる範囲、コード分岐を増やすコストの方が大きい）

## テスト方針

- **unit test**: 並列度上限の peak 観測、order 保持、default 追従、`maxConcurrency <= 0` throw、bounded 下の first-rejection。`_chunks.test.ts` で完結
- **integration test**: 追加なし（chunk 経路の挙動は本 Issue で不変）
- **manual-test (browser)**: スキップ予定（変更が adapter 内部に閉じ、UI への波及はゼロ。chunk 経路の結果が変わらないため）
- **typecheck / lint / format**: `pnpm typecheck && pnpm lint:fix && pnpm format`

## レビュー履歴

### 1周目

**修正した点（要件カバレッジ視点）**:
- [S-001] 呼び出し件数を「13 箇所」→「12 箇所」に修正（実数: mediaAsset=1 + note=9 + tag=1 + publicationState=1）
- [S-002] 実装ステップ 2 に「Issue 提案 #3 との対応関係」サブセクションを追加し、`findByOwner` / `countByOwner` / `findReferrers` / `loadChildren` が helper デフォルト経由で全カバーされる旨を明記
- [S-003] スコープ「含まれないもの」に「Issue 提案 #1（実 Workers 環境での実測ベンチ）を意図的にスコープ外、理由は ADR-001 §実測ベンチを行わない理由」を明記

**修正した点（アーキ・リスク視点）**:
- [P-001] 「fan-out ピーク並列度（loadChildren で 3 × maxConcurrency = 24）」をリスクと注意点に追記し、ADR-001 §「fan-out 呼び出しでの実効並列度」で意識的非対応を記録する方針を明示
- [P-002] 実装ステップ 1 に「ファイルヘッダ JSDoc の書き換え」（既存 `Promise.all` 全並列の記述を bounded 化後の semantics に直す）を明示で含めた。実装ステップ 4 に「既存テスト `rejects with the first runner failure` の `toHaveBeenCalledTimes(3)` を bounded 化後の cursor 停止挙動に合わせて書き換える」を追加

**取り込んだ改善提案**:
- [視点2/S-003] worker-pool のコード片に `cursor++` が atomic な理由（JS の post-increment が `await` 前 synchronous）を WHY コメントとして追加
- [視点2/S-004] `ids.length === 0` 早期 return を維持する旨を実装ステップ 1 に明記

**見送った提案とその理由**:
- [視点2/S-001] ADR §デフォルト値の根拠で pgpool 比較の論拠補強 — 現状の文章でも「保守的な選択を明示的にとる」結論は通っており、追加の文章修正コストに見合わない
- [視点2/S-002] `chunks.length === 1` の fast-path 導入 — リスク欄に「不採用」として記録するに留める（cursor inc/check のコストは無視できる）

### 2周目

**両視点とも問題点ゼロ（ブロッカーなし）で終了**。軽微な改善提案のうち以下を反映:

- [視点1/S-001] ADR の「13 箇所」残存 2 箇所（§Context 選択肢(A) / §Decision 手順4）を「12 箇所」に修正
- [視点1/S-002] ADR §「fan-out 呼び出しでの実効並列度」の subrequest 数表現を「per invocation 累積数 ≠ 同時 in-flight 数」と留保を入れる形に修正。デフォルト値根拠側も同様に表現を調整
- [視点1/S-003] ADR §fan-out 節に `listWithCount` の `2 × maxConcurrency = 16` 並列ケース言及を追加
- [視点2/S-001] ADR §Follow-up に「リクエスト全体の subrequest 累積総数の観測指標」を追加

**見送った提案とその理由**: なし（2周目の改善提案はすべて軽微で、すべて反映）


