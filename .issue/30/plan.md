# 実装計画 — Issue #30: countByOwner にフィルタを反映 (一覧件数表示の乖離解消)

**Issue:** #30
**作成日:** 2026-05-18
**複雑度:** 小規模（design が issue で完全に決まっているため 3 エージェント並列は省略）

---

## 目的

`noteRepository.countByOwner(ownerId)` がフィルタ（`status` / `tagIds` / `dateRange` / `visibility` / `referencingNoteId`）を見ないため、`listNotesByOwner` の戻り値 `count` がページ上の表示件数と乖離する問題を解消する。例: `?visibility=public` で表示が 1 件なのに「10 件のノート」と表示される。

Issue 本文で **option (A)（port シグネチャ拡張で filter を反映）** が推奨されているのでそれを採用する。

## スコープ

### 含まれるもの

- 〜 `noteRepository.countByOwner` を `(ownerId, opts?)` に拡張し、`findByOwner` と同じフィルタ意味論で総件数を返すよう変更
- D1 adapter の実装をフィルタ対応に
- `findByOwner` のフィルタ構築部分を private ヘルパー化して `countByOwner` と共有
- `listNotesByOwner` で `countByOwner` に同じ filter opts を渡す
- 既存の noteRepository モック実装（`runExportJob.ts` の内部 mock / `directory/__tests__/service.test.ts`）のシグネチャ追従
- フィルタが count に反映されることを担保する integration test 追加

### 含まれないもの

- UI 文言の変更（option (B)）
- countByOwner 経路のパフォーマンス最適化（同じ DB hit が 2 回走るのは既知。MVP 規模で許容）
- 別ドメインの count 系メソッド (countByDirectory 等) — 存在しないので対象外

## 実装ステップ

### 1. domain port: `NoteOwnerCountOpts` を追加し `countByOwner` のシグネチャを拡張

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:**
  - `NoteOwnerListOpts` のうちページネーション・ソート以外のフィルタ部分を再利用するため、`NoteOwnerCountOpts = Pick<NoteOwnerListOpts, "status" | "tagIds" | "dateRange" | "visibility" | "referencingNoteId">` を新規エクスポート。
  - `countByOwner(ownerId: UserId): Promise<number>` → `countByOwner(ownerId: UserId, opts?: NoteOwnerCountOpts): Promise<number>` に変更。
  - JSDoc を「Total notes for `ownerId` matching the supplied filters. Filter semantics mirror `findByOwner`; pagination/sort options are intentionally omitted. `opts === undefined` ⇒ no filter (= total notes for owner).」に更新。
- **理由:** port を `Pick` で派生させると両者の filter シグネチャが drift しない。`undefined` は「フィルタなし」のセマンティクスを `findByOwner` と統一できる。

### 2. D1 adapter: フィルタ構築ヘルパーを抽出して `findByOwner` / `countByOwner` で共有

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`
- **変更内容:**
  - 新しい private メソッド `private async buildOwnerListWhere(ownerId: UserId, opts: NoteOwnerCountOpts): Promise<SQL | null>` を作る。
    - 戻り値 `null` は「空配列フィルタなどで結果が空になることが確定」のシグナル。呼出側は短絡して空集合 / 0 を返す。
    - 戻り値 `SQL` は `and(...conditions)` を返す（owner predicate を含む）。
    - 中身は既存 `findByOwner` の `conditions` + `candidateSets` 構築ロジックをそのまま移植：
      - `eq(notes.ownerId, ownerId)` を必ず最初に置く
      - `status` / `dateRange.from` / `dateRange.to` の予測条件を追加
      - `visibility` 配列空ガード（→ `null` を返す）
      - `visibility` 配列に `private` を含むかで `notExists` 述語 / 候補 id 集合へ分岐
      - `tagIds` の AND 候補集合
      - `referencingNoteId` の候補集合
      - 候補集合の交差が空なら `null` を返す
      - 最終的に `and(...conditions)` を返す
  - `findByOwner` を上記ヘルパーで書き換える。`null` の場合は `return []` で短絡。
  - `countByOwner(ownerId, opts?)` を実装：
    ```ts
    countByOwner(ownerId: UserId, opts?: NoteOwnerCountOpts): Promise<number> {
      return mapDbError("Failed to count notes", async () => {
        const where = await this.buildOwnerListWhere(ownerId, opts ?? {});
        if (where === null) return 0;
        const rows = await this.db
          .select({ id: notes.id })
          .from(notes)
          .where(where);
        return rows.length;
      });
    }
    ```
- **理由:** filter ロジックを 1 箇所に集約することで `findByOwner` と `countByOwner` が永続的に同じ意味論で動く。コメント `count(*)` ではなく `id` を select する既存方針はそのまま踏襲。

### 3. usecase: `listNotesByOwner` で count にも opts を渡す

- **対象ファイル:** `app/core/application/note/listNotesByOwner.ts`
- **変更内容:**
  - 既に組み立てている `opts` から count 用の `countOpts: NoteOwnerCountOpts` を抜き出す（型 `Pick` で TS が保証）。
  - `ctx.noteRepository.countByOwner(input.actorUserId, countOpts)` に変更。
- **理由:** filter 適用前後の合計件数が同期する。UI の `count` 表示が「絞り込み後の総件数」になる。

### 4. モック実装シグネチャ追従

- **対象ファイル:**
  - `app/core/application/export/runExportJob.ts` (l.216: `async countByOwner() { return 0; }`)
  - `app/core/domain/directory/__tests__/service.test.ts` (l.179: `countByOwner(_o: UserId): Promise<number> { throw ... }`)
- **変更内容:** 2 番目の引数（オプショナル）を許容するように。ロジックは変更しない。
  - `async countByOwner() { return 0; }` はそのまま動く（オプショナル引数は無視で OK）が、念のため `async countByOwner(_o: UserId, _opts?: NoteOwnerCountOpts) { return 0; }` のように型整合性を残しておく方が安全。
- **理由:** TypeScript の構造的部分型では引数を増やす方向は問題ないが、明示しておくと意図が読める。

### 5. integration test 追加

- **対象ファイル:** `app/core/application/note/__tests__/listNotesByOwner.integration.test.ts`
- **変更内容:** 新規 `describe` ブロック「`listNotesByOwner — count reflects filters`」を追加し、以下を検証：
  1. visibility=['public'] を指定したとき、`count` が public ノートのみの件数になる（private/unlisted を含まない）
  2. tagIds を指定したとき、`count` がそのタグを持つノートの件数になる
  3. status='active' を指定したとき、`count` が active ノートのみ
  4. referencingNoteId を指定したとき、`count` がリンク元ノートの件数
  5. **エッジ:** `count > limit` のケースで、`notes.length === limit` だが `count` は filter 後の総件数と一致する（ページング表示が正しいことを担保）
- **理由:** Issue の症状（`?visibility=public` で表示 1 件 / count 10 件）を回帰防止できるテストを残す。

## 設計判断

詳細は `adr.md` 参照。

- **ADR-001**: count 用の opts は `Pick<NoteOwnerListOpts, ...>` で派生型として定義（drift 防止）
- **ADR-002**: opts は optional (`opts?:`) — 既存呼出側を破壊しない / 「フィルタなし」を未指定で表現

## リスクと注意点

- **二重クエリのコスト**: `findByOwner` と `countByOwner` の 2 回ぶん同じ filter ロジックが走るのは既知のオーバーヘッド。`wantsPrivate=true` 経路では `NOT EXISTS` 相関 subquery により bind 数は owner 規模に依らない（Issue #33 で対策済み）ので、host-var cap には抵触しない。MVP 規模で許容。
- **空配列 `visibility: []` の挙動**: ADR-002 (Issue #8) で「`[]` は『マッチなし』」と決めているため、`countByOwner` も `0` を返す必要がある。`buildOwnerListWhere` で `null` を返すことで担保する。
- **既存テストの回帰**: 既存の `listNotesByOwner — spec table cases` の `page1.count === TOTAL` というアサーションは `opts.status === undefined` で全件カウントするので壊れない。ただし `it("returns 0 notes when every note is trashed and the filter requests active status")` 系では count も `0` になることが想定通り。
- **`buildOwnerListWhere` がパブリック化しないこと**: ヘルパーは adapter 内 private に閉じる。port には漏らさない（既存設計通り）。

## テスト方針

- `pnpm typecheck` — port シグネチャ変更が壊さないこと
- `pnpm test:unit` — domain layer の mock 実装が型として有効
- `pnpm test:integration` — listNotesByOwner integration test が count を含めて期待通り（既存 + 新規）
- `pnpm lint:fix && pnpm format`
- 後段の `manual-test` スキルで `?visibility=public` などをブラウザで叩いて画面上の「N 件のノート」が実際の表示件数と一致するか確認

## 参考

- Issue #8 (PR #28) `.issue/8/adr.md` ADR-009
- Issue #33 で対応された `wantsPrivate=true` の NOT EXISTS 化により host-var cap リスクは解消済み
