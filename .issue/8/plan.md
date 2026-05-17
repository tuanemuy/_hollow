# 実装計画 — Issue #8: P10 公開状態・内部リンク参照フィルタ + listNotesByOwner projection 拡張

**Issue:** #8
**作成日:** 2026-05-17
**複雑度:** 中〜大規模

---

## 目的

Issue #1 (PR #7) Phase 4 follow-up。spec/pages/index.md P10「フィルタバー（タグ / 期間 / 公開状態 / 内部リンク参照）」のうち、`q` 空時の `listNotesByOwner` 経路に未実装の **公開状態フィルタ** と **内部リンク参照フィルタ** を追加し、現在 `'private'` 固定になっている `NoteListItemDTO.visibility` を `publication_states` join で実値化する。これにより `.issue/1/adr.md` の ADR-001 / ADR-012 / ADR-013 が抱えていた暫定挙動を解消する。

## スコープ

### 含まれるもの
- `NoteOwnerListOpts` への `visibility?: readonly PublicationVisibility[]` と `referencingNoteId?: NoteId` 追加
- `D1NoteRepository.findByOwner` の両フィルタ対応
- `PublicationStateRepository` への bulk lookup port (`findByNoteIds`) 追加
- `listNotesByOwner` usecase の input 拡張と `NoteListItemDTO.visibility` の実値化
- フロントエンド: `noteListSearchSchema` への `referencingNoteId` 追加、loader / route 伝達、`FilterBar` の `searchActive` ガード撤去と内部リンク参照解除 UI、`NoteList.showVisibilityBadge` の常時 true 化
- `listSelectors` の `searchToViewQuery` / `viewQueryToSearch` への `referencingNoteId` 追加と `viewQueryToSearch` の `visibility` 復元（SavedView 経由の URL 往復で消失しないように）
- `FilterBar.hasAnyFilter` への `directoryId` / `referencingNoteId` 追加（既存の `NoteList.hasAnyFilter` との整合）
- `.issue/1/adr.md` の関連 ADR への解消追記
- 関連 spec 文言の更新

### 含まれないもの
- `searchOwnNotes`（`q` 非空）経路の visibility 実値化 — ADR-012 のスコープで本 Issue 範囲外
- `countByOwner` のフィルタ反映 — 既存挙動を維持（受入条件「retrograde しない」を厳格解釈）
- 内部リンク参照フィルタの **新規入力 UI**（noteId picker / モーダル） — P11 ノート詳細からの導線で実装すべき別 Issue。本 Issue では「URL パラメータがセットされていれば絞り込み + chip 表示で解除できる」までを実装
- SavedView の `query.visibility` 永続化
- `createNote` 時の `publication_states` 行同時作成 — 既存「行なし = private」セマンティクスを維持
- D1 noteRepository に対する integration テスト基盤の全面整備 — 該当フィルタ部分のみ追加

## 前提

- `publication_states` 行が存在しない note は仕様上 `private` 扱い（`PublicationState.entity.ts` のデフォルト `visibility: "private"`）。本 Issue はこのセマンティクスを踏襲する。
- `noteInternalLinks.resolvedNoteId` は title 解決時に埋まる。未解決 `[[title]]` のみのリンクはフィルタ対象外（既存挙動）。
- `app/core/adapters/d1/__tests__/` に integration test の基盤（`createTestContainer` + `applyD1Migrations`）が既に存在する。

## 実装ステップ

### 1. ドメイン port 拡張

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:**
  - `NoteOwnerListOpts` に以下を追加:
    ```ts
    visibility?: readonly PublicationVisibility[];
    referencingNoteId?: NoteId;
    ```
  - `PublicationVisibility` を `@/core/domain/publication/valueObject` から import
  - JSDoc に2点追記:
    - `visibility` は IN セマンティクス。`undefined` = フィルタなし。**空配列 `[]` は「マッチなし」**（adapter は `publication_states` を引かず即 `[]` を返す）。`publication_states` に行がない note は `'private'` 扱い
    - `referencingNoteId` は `noteInternalLinks.resolvedNoteId === id` を満たす note（= その note を参照しているノート）に絞る
- **理由:** Issue 本文の type 拡張要件。「未指定」と「空集合」を型レベルで取り違えないため空配列のセマンティクスを明示

### 2. D1 アダプタ拡張: `findByOwner`

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`
- **変更内容:** 既存 `tagIds` の「候補 id 集合 → `inArray`」パターンを踏襲し、各フィルタを候補 id 集合へ寄せて Set 演算で交差させる。
  - 構造:
    ```ts
    const candidateSets: Array<ReadonlySet<string>> = [];

    if (opts.visibility !== undefined) {
      if (opts.visibility.length === 0) return [];
      candidateSets.push(await resolveVisibilityCandidates(this.db, ownerId, opts.visibility));
    }
    if (opts.tagIds !== undefined && opts.tagIds.length > 0) {
      candidateSets.push(await resolveTagAndCandidates(this.db, opts.tagIds)); // 既存ロジックを関数抽出
    }
    if (opts.referencingNoteId !== undefined) {
      candidateSets.push(await resolveReferrerCandidates(this.db, opts.referencingNoteId));
    }
    if (candidateSets.length > 0) {
      const intersected = intersectIdSets(candidateSets);
      if (intersected.size === 0) return [];
      conditions.push(inArray(notes.id, [...intersected]));
    }
    ```
  - `resolveVisibilityCandidates(db, ownerId, visibility)`:
    - `wantsPrivate = visibility.includes('private')`
    - `notWantedVisibilities = (['private','unlisted','public'] as const).filter(v => !visibility.includes(v))`
    - **方針**: `wantsPrivate === false` → `select noteId from publication_states where ownerId=? AND visibility IN (visibility配列)` で id 集合を返す（`idx_pubs_visibility_owner` で index hit）
    - **方針**: `wantsPrivate === true` → 「`publication_states` 行が無い OR `visibility` が望み集合に含まれる」を満たす owner 配下 note 集合を返す。
      - 最小実装: `select id from notes where ownerId=?` で owner の全 note id 集合 A を取得 → `select noteId from publication_states where ownerId=? AND visibility IN (notWantedVisibilities)` で「除外すべき id」集合 B を取得 → A − B を返す
      - これは N+1 にならない（owner スコープの 2 クエリのみ）。MVP の owner 当たり note 数規模で許容
  - `resolveReferrerCandidates(db, targetNoteId)`:
    - `select distinct fromNoteId from noteInternalLinks where resolvedNoteId=?`
  - `resolveTagAndCandidates`: 既存ロジックを関数として抽出（インライン化されていれば）。命名上の責務分割のみで挙動変更なし
  - `intersectIdSets(sets)`: 最初の集合をベースに以降を `forEach + has` で絞る単純実装
- **理由:** 既存 `tagIds` パターンと同形で読みやすい。SQL での `LEFT JOIN + COALESCE` や相関 subquery を避けることで Drizzle の型推論と既存可読性を維持

### 3. `PublicationStateRepository` への bulk lookup port 追加

- **対象ファイル:**
  - `app/core/domain/publication/ports/publicationStateRepository.ts`
  - `app/core/adapters/d1/repositories/publicationStateRepository.ts`
- **変更内容:**
  - port に `findByNoteIds(ids: readonly NoteId[]): Promise<readonly PublicationState[]>` を追加
    - JSDoc: 「N+1 回避用のバルク read。順序保証なし。`ids` に対応する行が存在しないものは結果から省かれる（呼出側で `'private'` フォールバックする）」
  - アダプタ実装: `ids.length === 0` で即 `[]`。それ以外は `select` + `inArray(publicationStates.noteId, [...ids])` で取得し VO 化
  - in-memory / fake 実装が他にあれば追従して追加（要 grep 確認）
- **理由:** `Promise.all(findById)` は明確な N+1 でレイテンシ累積。port のメソッドファミリーは既に `findPublicByOwner` 等の projection を持つので命名一貫性も取れる

### 4. usecase: `listNotesByOwner` の input 拡張と visibility projection

- **対象ファイル:** `app/core/application/note/listNotesByOwner.ts`
- **変更内容:**
  - `ListNotesByOwnerInput` に追加:
    ```ts
    visibility?: readonly PublicationVisibility[];
    referencingNoteId?: NoteId;
    ```
  - opts 構築箇所で `...(input.visibility !== undefined ? { visibility: input.visibility } : {})` と `...(input.referencingNoteId !== undefined ? { referencingNoteId: input.referencingNoteId } : {})` を spread（既存 `status` / `tagIds` と同形）
  - `found = await ctx.noteRepository.findByOwner(...)` の後:
    ```ts
    const states = await ctx.publicationStateRepository.findByNoteIds(
      found.map((n) => n.id)
    );
    const visById = new Map(states.map((s) => [s.noteId, s.visibility] as const));
    ```
  - `toNoteListItem(note, { ..., visibility: visById.get(note.id) ?? "private" })` に置換
  - 既存の `visibility: 'private'` 固定とそれを説明している ADR-001 参照コメントを撤去
- **理由:** Issue 受入条件「`NoteListItemDTO.visibility` が実値を反映」を満たす。1 クエリで visibility を解決し N+1 を avoid

### 5. フロントエンド: 検索パラメータ schema 拡張

- **対象ファイル:** `app/components/note/schema.ts`
- **変更内容:** `noteListSearchSchema` に追加:
  ```ts
  referencingNoteId: z.string().min(1).optional().catch(undefined),
  ```
  `visibility` は既存（zod enum、単一値）のまま流用
- **理由:** URL `?referencingNoteId=xxx` を validateSearch で受けるため

### 6. フロントエンド: loader 経由で usecase に伝達

- **対象ファイル:** `app/components/note/loaders.ts`
- **変更内容:**
  - `OwnedNotesQuery` に `referencingNoteId?: string | null` を追加
  - filter 経路の `listMod.listNotesByOwner` 呼び出しで:
    ```ts
    ...(input.visibility !== undefined && input.visibility !== null
      ? { visibility: [input.visibility] as const } // URL は単一、port は配列
      : {}),
    ...(input.referencingNoteId !== undefined && input.referencingNoteId !== null
      ? { referencingNoteId: input.referencingNoteId as NoteId }
      : {}),
    ```
  - search 経路は触らない（ADR-012 のスコープ）
- **理由:** loader が transport boundary。配列化はここで行う（port は将来 multi-select 拡張に備えて配列、UI は単一）

### 7. ルート: validateSearch 経由のパラメータ伝達

- **対象ファイル:** `app/routes/index.tsx`
- **変更内容:** `validateSearch` で取れた `referencingNoteId` を `loadOwnedNotes` 呼び出しに加える（既存 `visibility` と同形）
- **理由:** Step 5 で受けたパラメータを実際に loader まで通す

### 8. フロントエンド: `FilterBar` の改修

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:**
  - 公開状態 select の `searchActive` ガードを撤去し、**filter / search 両モードで常時表示**（search 経路は `searchOwnNotes` 側の visibility 入力伝達が ADR-012 のスコープで未対応のため、UI は表示されるが結果に反映されない既知挙動。ADR-008 で明記）
  - 内部リンク参照フィルタ UI を最小実装で追加:
    - URL に `referencingNoteId` がセットされている時、`参照中: <短縮id>` の chip を表示し × ボタンで `referencingNoteId: undefined` で navigate
    - **新規入力 UI（テキスト入力 / picker）は本 Issue では追加しない**（別 Issue で P11 詳細画面からの導線として実装）
  - `clearAll` / `hasAnyFilter` に `referencingNoteId` を含める
  - 既存の **`hasAnyFilter` から `directoryId` が抜けている軽微な不整合も同時に修正**（`NoteList.hasAnyFilter` 側との整合）
- **理由:** Issue 受入条件「`q` 空時も公開状態フィルタが効く」「`?referencingNoteId=` で絞り込み + 解除可能」を満たす

### 9. フロントエンド: `NoteList` の改修

- **対象ファイル:** `app/components/note/list/NoteList.tsx`
- **変更内容:**
  - `showVisibilityBadge` の決定ロジックを修正。
    - filter 経路（usecase 修正により実値が入る）では常時 true
    - search 経路は ADR-012 で `'private'` 固定のため引き続き false（=`mode === "filter"`）
    - 既存の `searchActive` 由来分岐を `mode === "filter"` ベースに切り替える
  - `hasAnyFilter` に `referencingNoteId` を加える
  - FilterBar 連動の `searchActive` prop が不要になるなら削除
- **理由:** Step 4 の visibility 実値化を UI に露出させつつ、search 経路のプレースホルダ値を誤って badge 表示しないようにする

### 10. SavedView 経路の URL 往復に対応

- **対象ファイル:** `app/components/note/list/listSelectors.ts`
- **変更内容:**
  - `SaveViewPayload.query` に `referencingNoteId?: string | null` を追加
  - `searchToViewQuery` で URL の `referencingNoteId` を `SaveViewPayload.query.referencingNoteId` へ転写
  - `viewQueryToSearch` で `view.query.referencingNoteId !== null` の時に `out.referencingNoteId` を復元
  - **`viewQueryToSearch` の `visibility` 復元も同時に追加**（既存 `searchToViewQuery` は `visibilityFilter` を保存するのに復元側が抜けていた軽微 bug の補完）。`view.query.visibilityFilter` が単一要素なら復元、複数要素なら現状 URL schema が単数のため最初の要素のみ復元 + コメントで明記
- **検証:** `__tests__/listSelectors.test.ts` に referencingNoteId / visibility 往復のケースを追加
- **理由:** `ViewQueryDTO.referencingNoteId` は既に存在し `viewQueryEquals` が比較するため、`searchToViewQuery` / `viewQueryToSearch` で扱わないと SavedView 保存・復元で消失し「URL と SavedView が常に不一致」になる即時バグになる

### 11. loader 境界での `NoteId` 検証

- **対象ファイル:** `app/components/note/loaders.ts`
- **変更内容:** URL から受けた `referencingNoteId` を `NoteId.create(...)` で構築し、失敗時は静かに無視（フィルタなし扱い）。慣習踏襲なら as キャストでも動くが、VO の不変条件を尊重し境界で検証する
- **理由:** transport boundary での validate（CLAUDE.md「Input validation」）

### 12. ADR / spec ドキュメント更新

- **対象ファイル:**
  - `.issue/8/adr.md`(新規) — Step 11 の設計判断 J1-J6 を ADR として記録
  - `.issue/1/adr.md` — ADR-001 / ADR-012 / ADR-013 の Status を必要に応じて「Superseded by Issue #8」相当に追記
  - `spec/domains/note.md`(L108 周辺) — `findByOwner` シグネチャに `visibility?: PublicationVisibility[]; referencingNoteId?: NoteId` を追記
  - `spec/pages/index.md` の P10 セクションに残った「未対応」表記があれば剥がす
- **理由:** Issue 完了時に設計判断・スコープ判断を将来の読者が辿れるようにする

### 13. テスト追加

「テスト方針」に詳述。

## 設計判断

### J1: `visibility` フィルタは port では配列、URL では単一

複数選択への将来拡張時に port を破壊変更しないため。境界（loader）で `[singleVisibility]` に配列化する。Issue 本文の `readonly Visibility[]` 表記とも一致。

### J2: 空配列 `[]` は「マッチなし」、`undefined` は「フィルタなし」

型レベルで取り違えないため。adapter は最初に空配列ガードを置く。`IN ()` の SQL 構文エラー回避にもなる。

### J3: `visibility=['private']` 系の SQL 戦略

`publication_states` 行が無い note も private 扱いという既存セマンティクスを尊重し、`wantsPrivate` 分岐 + owner スコープの 2 クエリで候補 id 集合を JS 上で算出する。`LEFT JOIN + COALESCE` や相関 subquery は Drizzle 上の可読性が劣るため避ける。

### J4: 内部リンク参照フィルタは port を増やさず `findByOwner` 内で候補解決

`findReferrers` は全件 hydrate して返すため listing 文脈で使うと無駄。候補 id だけを取る helper を adapter 内に閉じる。

### J5: `PublicationStateRepository.findByNoteIds` を新規追加

`Promise.all(findById)` は明確な N+1。listing 用 bulk lookup を専用 port メソッドとして追加する。

### J6: 内部リンク参照 UI は「解除のみ」

新規入力 UI は P11 ノート詳細画面からの導線として実装すべきであり、それ自体が UI 設計を伴う別タスク。本 Issue では受入条件（URL で絞れる + 解除できる）に必要な最小 UI に留める。

詳細は `.issue/8/adr.md` を参照。

## リスクと注意点

- **件数表示の乖離（本 Issue で目立つ）**: `countByOwner(ownerId)` は filter / status / opts を一切見ない実装で、`listNotesByOwner` は `total = countByOwner` を返している。本 Issue で visibility / referencingNoteId を追加すると「filter で 3 件しか表示されないのに total が 100 件」のような表示乖離が **新フィルタで顕在化**する。本 Issue では count を変更しない（受入条件「retrograde しない」を厳格解釈）が、PR 説明に明記し別 Issue として起票する
- **`idx_pubs_visibility_owner` の列順**: schema 上 `(visibility, ownerId)` 順。`WHERE ownerId=? AND visibility IN (...)` は visibility 単一値で最も効き、複数値 IN では index 効率が落ちる可能性あり。MVP 規模で許容するが ADR-003 に注記
- **`wantsPrivate === true` の線形スキャン**: owner の全 note id を fetch する候補生成が走るため、他フィルタ（referencingNoteId 等）で大幅に絞れる場合でも全件 fetch する。MVP 規模で許容、ADR-003 に注記
- **`searchActive` 撤去の波及**: 参照箇所は `FilterBar` / `NoteList` のみ、テスト依存なし。`mode === "search" | "filter"` で意味的に置き換える
- **search 経路の visibility プレースホルダ**: search 経路の `OwnedNotesResult.notes[].visibility` は ADR-012 で `'private'` 固定。`showVisibilityBadge = mode === "filter"` で誤表示を避ける
- **既存テスト数の限定**: `noteRepository.integration.test` は未整備。本 Issue で骨組みを追加するが、全フィルタの網羅テストではなく追加機能のカバーに留める
- **port 拡張による既存 fake 実装の追従**: 実態としては D1 実装のみで in-memory fake は存在しない（実 D1 + vitest-pool-workers で integration test を回している）。よって追従コストは D1 実装の更新のみ
- **`searchOwnNotes` 経路の visibility 入力伝達**: 本 Issue スコープ外。`searchOwnNotes` 側の visibility 入力伝達は ADR-012 解消用の別 Issue で対応。FilterBar の visibility select は両モードで表示するが search モードでは結果に反映されない既知挙動
- **`CalendarView` への影響**: `showVisibilityBadge` prop は `CalendarView` には流れていない（`NoteList.tsx` の calendar 分岐は別経路）。Calendar 表示で visibility を表示するかは spec 上明確でないため本 Issue では現状維持。表示要求があれば別 Issue

## テスト方針

### Unit（vitest, `pnpm test:unit`）

- **新規/拡張** `app/components/note/__tests__/schema.test.ts`
  - `referencingNoteId` 受理 / `.catch(undefined)` フォールバック
- **新規/拡張** `app/components/note/list/__tests__/listSelectors.test.ts`
  - `searchToViewQuery`: `referencingNoteId` 指定が `query.referencingNoteId` に転写される
  - `viewQueryToSearch`: `view.query.referencingNoteId` が `out.referencingNoteId` に復元される
  - `viewQueryToSearch`: `view.query.visibilityFilter` が `out.visibility` に復元される（単数 / 空のケース）

### Integration（vitest, `pnpm test:integration`）

- **新規** `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts`
  - 既存 `todoRepository.integration.test.ts` をパターン参考に `createTestContainer` で組む
  - 既存 `helpers.ts` の `createTestContainer` 等を活用し、seed ヘルパー（user / directory / note / publication_state / noteInternalLinks）は同ファイル内に閉じる
  - ケース:
    - `visibility` 未指定 → 既存通り全件（retrograde 検知）
    - `visibility: ['public']` → public のみ
    - `visibility: ['private']` → 行なし + `visibility='private'` 行の和集合
    - `visibility: ['public', 'unlisted']` → 複合
    - `visibility: []` → `[]` を即返す
    - `referencingNoteId` → resolvedNoteId が一致する from note のみ
    - `referencingNoteId` 一致 0 件 → `[]`
    - `visibility + tagIds + referencingNoteId` AND 合成
- **新規** `app/core/application/note/__tests__/listNotesByOwner.test.ts` ※既存パターンが application 層で実 D1 を前提としているため、本テストも `createTestContainer` を経由する integration として配置（または fake repository を導入するなら別パターンとして adr 化）
  - publication_state 行あり → DTO の visibility が実値
  - publication_state 行なし → `'private'` フォールバック
  - 混在 (public / unlisted / 行なし) → 各 note の visibility が正確
  - `input.visibility` / `input.referencingNoteId` 指定が adapter まで透過し正しい結果を返す

### Manual test

- `.issue/8/manual-test/` に手動シナリオ（後述 `testing.md`）

### 静的検証
- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test`

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○ | 一部 | 一部 |
| 取り込んだ点 | tagIds パターン踏襲 / wantsPrivate 分岐 / 解除のみ UI / searchActive 撤去後 `mode === "filter"` への切替 | 空配列セマンティクスの明示 / `findByNoteIds` 命名 / usecase テスト追加方針 | 既存 `findReferrers` クエリ流用 / UI 最小化判断 |

## レビュー反映

### 修正した点
- **[要件カバ P-001 / 実現性 P-001] SavedView 経路の `referencingNoteId` 往復見落とし**: `listSelectors.searchToViewQuery` / `viewQueryToSearch` への referencingNoteId 追加、`viewQueryToSearch` の visibility 復元を Step 10 として追加。ADR-007 で記録
- **[要件カバ P-002 / 実現性 関連] search 経路の visibility 入力伝達**: ADR-008 として明示的に別 Issue 化。FilterBar select は両モード常時表示（UI 一貫性）、search 経路では既知の暫定挙動を明記
- **[要件カバ P-003] Step 8 「searchActive ガード撤去」の曖昧さ**: 「filter / search 両モードで常時表示」と明示し、ADR-008 と整合
- **[要件カバ P-001 / 実現性 関連] count 表示乖離**: ADR-009 として明示。本 Issue では count を変更せず別 Issue 起票方針を明記
- **[実現性 P-002] `idx_pubs_visibility_owner` 列順**: ADR-003 の「index hit」断定を訂正し、列順 `(visibility, ownerId)` と複数値 IN での効率劣化を注記
- **[実現性 P-003] `wantsPrivate` 線形スキャン**: ADR-003 にトレードオフを追記、将来的な順序最適化の余地を明示
- **[実現性 P-004] `NoteId` 検証**: Step 11 として loader 境界での `NoteId.create` 通過を追加
- **[実現性 S-003] `FilterBar.hasAnyFilter` に `directoryId` 抜け**: Step 8 で同時修正（同じファイル・同じ動線の問題はその場で直す）

### 取り込んだ改善提案
- **[実現性 S-004] count 表示文言**: 別 Issue 案として ADR-009 に明記
- **[実現性 S-005] integration test ヘルパー**: 既存 `helpers.ts` パターンに揃える方針を「テスト方針」に明記
- **[実現性 S-006] application 層テストは実 D1 で integration に寄せる**: 計画書の「unit / integration 境界」を整理（後述）

### 見送った提案とその理由
- **[実現性 S-001] `findByNoteIds` を adapter 内 helper にする**: port 統一感の観点で port メソッドのまま採用。ADR-004（内部リンク参照: helper 化）と ADR-005（visibility: port 化）の判断の差は「呼出側 (application 層) が必要とする情報の単位」の違い — application 層は `visibility` 値を必要とするため port 経由が自然。adapter 内 helper は adapter 自身が必要とする内部処理に限定
- **[実現性 S-002] `searchActive` を `mode` 化せず命名維持**: 命名 rename は本 Issue の本質ではないため、`mode === "filter"` 切り替えは行うが prop 名 rename は最小差分で省略
