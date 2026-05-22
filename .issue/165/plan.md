# 実装計画 — Issue #165: D1 inArray バインド上限対策: buildWhereForNotes の inArray(notes.id, [...intersected]) 対応

**Issue:** #165
**作成日:** 2026-05-23
**複雑度:** 中〜大規模

---

## 目的

`noteRepository.ts` の `buildWhereForNotes`（実体名: `buildOwnerListWhere`）内の `inArray(notes.id, [...intersected])` が D1 のホスト変数上限 (≒100) を踏むリスクを解消する。`visibility=['public']` と `tagIds=['t1']` のように複数候補セットがどちらも 100 件超を返すケースで、intersection の上限が unbounded になりうる問題を、`selectInChunks` ヘルパ経由で chunk 化し、JS 側で sort / offset / limit を再適用するパターン（ADR-002 で `findReferrers` に先行採用済み）の適用拡張で解消する。

## スコープ

### 含まれるもの

- `app/core/adapters/d1/repositories/noteRepository.ts` の以下の変更:
  - `buildOwnerListWhere` の return shape を `(where, idScope)` に分割
  - `findByOwner` を `idScope !== null` のとき `selectInChunks` 経由に切り替え、JS 側で sort + slice(offset, limit) を再適用
  - `countByOwner` を `idScope !== null` のとき chunk per `select id` で集計
  - JS 側 sort helper の抽出（`findReferrers` の inline sort と統合）
- integration テスト追加 (`T-bind-008..011`): 150 件規模で chunk 経路・sort 再現性・count 整合性を担保
- `.issue/165/adr.md` に設計判断を記録

### 含まれないもの

- `publicationStateRepository.findByNoteIds` の chunk 化（ADR-003 Follow-up 別 Issue）
- `mediaAssetRepository` / `tagRepository` 等の他リポジトリ inArray 監査（ADR-003 Follow-up 別 Issue）
- `findReferrers` の結果上限制御（ADR-003 Follow-up 別 Issue）
- 各 `resolve*Candidates` 自身に上限を入れる選択肢 (C) — silently truncated は仕様欠陥
- `resolveTagAndCandidates` の SQL subquery 化（選択肢 (B)）— drizzle 表現コストが本 Issue スコープを超過

### 補足: 本 Issue の `intersected` 候補に乗る経路

Issue 本文は「`resolveVisibilityCandidateIds` / `resolveTagAndCandidates` / `resolveReferrerCandidates` の各候補セットが unbounded になりうる」と書くが、**現コードで `intersected` Set に流れるのは以下の subset のみ**:

- `visibility` フィルタかつ `wantsPrivate === false`（`['public']`, `['unlisted']`, `['public','unlisted']` 等）
  - `wantsPrivate === true` の経路は `buildVisibilityNotExistsPredicate` で別動線（`NOT EXISTS` 相関 subquery）になっており、`intersected` に乗らない（noteRepository l.441-450）
- `tagIds` フィルタ
- `referencingNoteId` フィルタ

したがって本 Issue の bind 暴発リスクが特に高いのは **tag/referrer 候補が unbounded、または `visibility=['public']` を持つ owner が大量の public note を持つケース**。

### 補足: `opts.cursor` 表記について

Issue 本文の選択肢 (A) には「`opts.cursor`」表記があるが、`NoteOwnerListOpts`（`app/core/domain/note/ports/noteRepository.ts`）は `limit/offset/sort/order` のみで cursor を持たない。cursor pagination は search ドメイン側で `NoteListOpts` の offset/limit 上にレイヤされる別レイヤの責務。本 Issue の chunk 戦略は **offset/limit にのみ適用**し、cursor 化は対象外。

## 採用案

**(A) クエリ全体を chunk 化 + JS 側 sort/offset/limit 再適用**

- **理由**:
  1. ADR-002 で `findReferrers` に同パターンが先行採用済み。本 Issue は **ADR-002 の適用拡張**として整理できる
  2. `countByOwner` の filter 共有規約 (`buildOwnerListWhere` 経由) を崩さず chunk 化可能（per-chunk `select id` 加算）
  3. `findByOwner` の `limit` は UI ページサイズ前提（実運用 20-100 件）。chunk 経路が走るケースでも 6-56 chunk 並列で 1 RTT 累積
  4. (B) は `resolveTagAndCandidates` の `GROUP BY ... HAVING COUNT(DISTINCT)` を drizzle 型で表現する必要があり、本 Issue スコープを超過
  5. (C) は `findByOwner` と `countByOwner` の整合性が崩れる仕様欠陥
- **トレードオフ**:
  - SQL レベルの sort/limit 一発保証は失われる（chunk 跨ぎの並びは JS sort 結果に依存）
  - chunk 数だけ I/O が増える（並列実行で累積レイテンシは増えないが、D1 クエリ課金は増加）
  - `offset` が大きいときに全 chunk 取得が必要（旧実装も WHERE 段階で 5000 件 bind していたので本質的悪化ではない）

## 実装ステップ

### 1. `buildOwnerListWhere` の return 型拡張

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`
- **変更内容:** 戻り値を `Promise<SQL | null>` から `Promise<{ where: SQL | null; idScope: ReadonlySet<string> | null } | null>` に変更。
  - `candidateSets.length > 0` の場合: `intersected` を計算し、`intersected.size === 0` なら `null` を返す（空集合短絡を維持）。`intersected.size > 0` なら `{ where: and(...conditions) ?? null, idScope: intersected }` を返す
  - `candidateSets.length === 0` の場合: `{ where: and(...conditions) ?? null, idScope: null }` を返す
  - `conditions.push(inArray(notes.id, [...intersected]))` は**削除**
- **理由:** chunk 化を caller (`findByOwner`/`countByOwner`) 側に明示的に押し出すための構造変更。filter → SQL/scope 翻訳の責務と読み取り戦略の責務を分離

### 2. `findByOwner` の chunk 化

- **対象ファイル:** 同上
- **変更内容:**
  - 戻り値が `null` のとき: 早期 `return []`（既存挙動）
  - `idScope === null` のとき: 従来通り 1 クエリ（DB 側 ORDER BY / LIMIT / OFFSET）
  - `idScope !== null` のとき:
    - `selectInChunks(Array.from(idScope), (chunk) => db.select().from(notes).where(and(where, inArray(notes.id, [...chunk]))))` で全 chunk 並列取得
    - JS 側で `sortNoteRowsBy(rows, sortCol, order)` で sort（tie-break `desc(id)`）
    - `rows.slice(opts.offset, opts.offset + opts.limit)`
    - `hydrateMany` に通す
- **理由:** `findReferrers` (l.594-624) と同形パターン。orderBy が動的（`sort`/`order` から導出）な点だけ追加対応

### 3. `countByOwner` の chunk 化

- **対象ファイル:** 同上
- **変更内容:**
  - 戻り値が `null` のとき: 早期 `return 0`
  - `idScope === null` のとき: 従来通り `select count(*) from notes where ...`
  - `idScope !== null` のとき:
    - `selectInChunks(Array.from(idScope), (chunk) => db.select({ id: notes.id }).from(notes).where(and(where, inArray(notes.id, [...chunk]))))` で全 chunk 取得
    - `rows.length` を返す
- **理由:** list 側と同じ filter chain を経由しないと count と list が乖離する（既存規約: `buildOwnerListWhere` は両者共有のゲートウェイ）

### 4. JS 側 sort helper の抽出

- **対象ファイル:** 同上
- **変更内容:** モジュール内 private helper `sortNoteRowsBy(rows: NoteRow[], sortCol: 'updatedAt' | 'createdAt' | 'title', order: 'asc' | 'desc'): NoteRow[]` を新設（`NoteRow = typeof notes.$inferSelect` の既存エイリアス l.53 を再利用）。
  - 既存 `findReferrers` の inline sort（l.616-621）も新 helper に置き換える。固定 sort なので呼び出し側は `sortNoteRowsBy(rows, 'updatedAt', 'desc')` となる。意図保存のため呼び出し直前にコメント `// backlink listing fixed sort: updatedAt desc, id desc` を残す
  - tie-break は `desc(id)` 固定（既存挙動と同じ。UUIDv7 は ASCII 文字列なので決定論的）
- **理由:** 同種ロジックの重複を避ける。chunk 跨ぎ sort 規約が 2 箇所に出るため、helper 1 箇所に集約

### 5. integration テスト追加 (`T-bind-008..011`)

- **対象ファイル:** `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts`
- **変更内容:** 既存 `T-bind-001..007` と衝突しないよう `T-bind-008..011` を採番
  - `T-bind-008`: 150 件すべて `public` の owner で `findByOwner({ visibility: ['public'], limit: 200, offset: 0 })` → 150 件全部返ること（intersection 経路 + chunk 経路発火）
  - `T-bind-009`: 150 件 `public` で `findByOwner({ visibility: ['public'], limit: 50, offset: 50, sort: 'updatedAt', order: 'desc' })` → DB 一発と同じ結果順序（offset/limit/sort 再現性）。fixture は ASCII title に限定し、`title` sort の SQL/JS 同値性問題を回避
  - `T-bind-010`: 150 件 + 全 note に 1 tag で `findByOwner({ tagIds: [tagA], visibility: ['public'], limit: 200 })` → 2 候補セット交差後 150 件 chunk 経路
  - `T-bind-011`: 150 件 `public` の owner で `countByOwner({ visibility: ['public'] })` が `150` を返す（chunk 化された count semantics）
- **理由:** `SAFE_CHUNK_SIZE=90` / `D1_BIND_LIMIT_HOST_VARS=100` 境界を跨ぐ規模で chunk 経路と sort 再現性、count 整合性を担保

### 6. ADR 追記

- **対象ファイル:** `.issue/165/adr.md`（新規）
- **変更内容:** ADR-001 として「`buildOwnerListWhere` を `(where, idScope)` 構造に分割し、`findByOwner`/`countByOwner` 双方で chunk 化」を Accepted で記録。(B)/(C) 却下理由と ADR-002 との関係（同パターン拡張）を明記
- **理由:** ADR-003 が follow-up 扱いとした残課題を解消した経緯と判断ロジックの記録

### 7. 検証

- **対象:** `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:integration`
- **理由:** CLAUDE.md 規定の post-change チェック

## 設計判断

- **ADR-001 候補**: `buildOwnerListWhere` の return shape 変更（`SQL | null` → `{ where, idScope } | null`）。filter → SQL/scope 翻訳と読み取り戦略を分離
- **ADR-002 との関係**: 本 Issue は ADR-002 が `findReferrers` で確立した「chunk → JS sort → 再適用」パターンの適用拡張。新規 ADR は「return shape 変更」と「同パターン適用の正当化」の小ファイルで十分
- **chunk 順序の決定論性**: `Array.from(intersected)` の順序は Set 反復順。chunk 内に SQL ORDER BY を残しても全体並びは JS sort が決めるので問題なし。決定論性は JS sort 側で担保

## リスクと注意点

- **JS sort と SQL ORDER BY の同値性**:
  - `updatedAt`/`createdAt` 列: ISO-8601 ms text、ASCII 範囲 → SQLite BINARY (UTF-8 byte 順) と JS `<`/`>` (UTF-16 code unit 順) は完全一致
  - `title` 列: BMP 範囲 (U+0000–U+FFFF) では UTF-8 byte 順と UTF-16 code unit 順は codepoint 順を保つため等価。BMP 外（U+10000〜、サロゲートペア）を含む title が現れた場合のみ理論上ズレうるが、MVP 規模では非問題
  - tie-break `desc(id)` は UUIDv7（必ず ASCII）なので決定論的
  - **注**: tie-break が決定論性を保証するのは「primary key 完全一致のとき」のみ。`sort='title'` の primary 比較自体のズレは tie-break では救えないが、上記理由で BMP 範囲では発生しない
- **`offset` 過大時のメモリ**: `intersected.size = 5000` で `offset = 4500` のとき全 5000 件メモリ展開後 slice。旧実装は WHERE 段階で 5000 件 bind することで failure していたので、新実装はむしろ「failure していたシナリオが動くようになる」。Cloudflare Workers のメモリ制限 (128MB) に照らして、`NoteRow` 1 件 ~1KB 想定で **想定最大 1 万件程度までは安全**。それを超える owner が出現した時点で本格的な subquery 化（選択肢 B）を別 Issue で検討する
- **chunk クエリ間の uncommitted reads**: D1 強整合だが、chunk 群と `intersected` 取得との間に書き込みが挟まる race は理論上ある。旧実装でも同等 race が存在したため悪化ではない
- **ADR-003 Follow-up 残課題**: 本 Issue ではスコープを `findByOwner` / `countByOwner` の `intersected` 経路に限定。`publicationStateRepository.findByNoteIds` 等は別 Issue 候補のまま

## テスト方針

- **ユニット**: `selectInChunks` は既存 `_chunks.test.ts` で網羅済み、追加不要
- **integration (新規 4 ケース)**: 150 件規模の `T-bind-008..011` で `SAFE_CHUNK_SIZE=90` / `D1_BIND_LIMIT_HOST_VARS=100` 境界を跨いだ chunk 経路、sort 再現性、count 整合性を担保
- **境界値**: 既存 `T-bind-001..007` が 150 件規模なので、追加もそれを流用（`seedManyNotes` fixture 共有）
- **regression**: `listNotesByOwner` ユースケーステスト群を CI で再確認。filter 未使用パス（`rebuildSearchIndex`, `handleUserDeletedEvent`）は behavior 不変なので既存テストで担保
- **手動**: integration テストで bind 境界を直接踏むため、原則不要（ただし issue-implement Phase 2 で manual-test スキルが UI listing シナリオの簡易確認を実施）

## レビュー履歴

### 1周目
**修正した点**:
- **[P-001]** integration テスト ID を `T-bind-005..008` → `T-bind-008..011` に振り直し（既存 `T-bind-001..007` との衝突回避、視点1・視点2 重複指摘）
- **[P-002]** `opts.cursor` 表記の補足を「スコープ - 含まれないもの」配下に追加（cursor pagination は search 側の責務で、本リポジトリは offset/limit のみ）

**取り込んだ改善提案**:
- **[S-001(視点1)]** `wantsPrivate=true` 経路は `NOT EXISTS` で `intersected` に乗らないことを明示（スコープ補足セクション追加）
- **[S-002(視点1)] / [S-005(視点2)]** sort helper のシグネチャ案と `findReferrers` 呼び出し側コメント方針を実装ステップ 4 に明記
- **[S-002(視点2)]** sort helper の型を `NoteRow`（既存エイリアス再利用）に統一
- **[S-003(視点1+視点2)]** title sort の SQL BINARY vs JS UTF-16 同値性をリスク欄で詳述、テスト fixture は ASCII title に限定する方針を Step 5 に追加
- **[S-004(視点2)]** メモリ上限の数値ガード（Workers 128MB / NoteRow 1KB / 想定最大 1 万件）をリスク欄に明記

**見送った提案とその理由**:
- **[S-001(視点2)]** `countByOwner` が `idScope.size` を返せず DB を叩く必然性の ADR 言及 → ADR-001 内の「補足: `countByOwner` が `idScope.size` を返せない理由」セクションで扱った

### 2周目
**修正した点**:
- 1周目の P-001 振り直しの取りこぼし: plan.md l.22「スコープ - 含まれるもの」と l.147「テスト方針」に残存していた旧 ID `T-bind-005..008` を 2周目時点では `T-bind-007..010` に修正

**取り込んだ改善提案**:
- なし（1周目で全て反映済み）

**見送った提案とその理由**:
- なし

**終了判断**:
- 2 周目で両視点とも新規問題なし、1 周目指摘の取りこぼしも修正完了。視点2 レビュアーも「l.147 修正で 3 周目は不要」と明示。両視点合意のもと 2 周で終了

### Phase 2 実装時の調整
- 実装フェーズで判明: 既存 `T-bind-007` は Issue #45 (PR #164) で追加済みだったため、新規分は計画書の `T-bind-007..010` から `T-bind-008..011` に最終確定。plan/testing の ID 表記は実装に合わせて更新済み。既存 ID 範囲表記も `T-bind-001..007` に揃えた
